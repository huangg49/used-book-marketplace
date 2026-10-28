# API đã nối vào Admin —27/10/2026

Scope: API vận hành tại base `d3b19e5` và local work trên `codex/admin-ui-refactor`.
Owner duyệt27/10 bổ sung thống kê Dashboard: OpenAPI0.53.0 sau ghép main, một GET và migration
0037 thêm index, không đổi quyền xử lý hoặc ledger/transaction. Gate release trong
[READINESS](../handoff/READINESS.md) giữ nguyên.

## Đối chiếu contract và màn hình

Contract hiện có **40 thao tác HTTP trên38path `/operations/*`**. Bảng dưới ánh
xạ điểm gọi trong Admin, không phải tuyên bố mọi mutation đã chạy lại end-to-end.

| API vận hành | Số thao tác | Màn hình/source Admin |
| --- | ---: | --- |
| Moderation overview7/30ngày | 1 | `features/dashboard/overview`, `ModerationChart`, `DashboardPage` |
| Catalog queue/detail/decision | 3 | `features/review/queue`, `detail`, `decision-form` |
| Listing queue/detail/revisions/decision/remove | 5 | `features/review/queue`, `detail`, `readers`, `decision-form` |
| Listing media read | 1 | `features/review/readers` qua `/operations/listings/:id/media/:mediaId/read` |
| Users list/search/filter/cursor | 1 | `features/users/directory` |
| Auction intake list/receive/inspect/evidence/open/reclaim | 6 | `features/operations/queues`, `intake-actions`, `inspection` |
| Auction list/cancel | 2 | `features/operations/queues`, `auction-actions` |
| Points list/create/edit/assign/end assignment | 5 | `features/operations/points` |
| Incidents list/open/decide và fund read | 4 | `features/operations/incidents` |
| Escalation list | 1 | `features/operations/escalations` |
| Point-order list/handover/dispatch/receive return | 4 | `features/operations/queues`, `collection-actions` |
| Point-order resolution list/resolve | 2 | `features/operations/queues`, `resolution-actions` |
| Point-delivery simulator list/event | 2 | `features/operations/simulator` |
| Topup/pickup/direct-delivery simulator events | 3 | `features/operations/simulator-events`, `simulator-contracts` |

Auth/login/profile/refresh/logout tiếp tục qua session-client memory-only.
`/me/point-assignments` và public catalog book read hỗ trợ Staff/reviewer như
trước. Các API Member-only (đặt mua, ví cá nhân, bid, chat…) không trở thành quyền
Admin chỉ vì cùng backend.

## Dashboard

Bảng lệnh `Ctrl+K` chỉ tìm trong các route navigation được cấp theo profile;
không có API search toàn hệ thống hay command ghi dữ liệu. Mở lệnh đi qua Router
và leave guard hiện có; không suy quyền từ kết quả tìm kiếm tại client.

Thay DashboardMock bằng `features/dashboard/DashboardPage` và các source có schema
tại `sources.ts`. Không còn biểu đồ lịch sử dựng từ công thức, không gắn nhãn
LIVE/MongoDB cho dữ liệu tự suy diễn. Mỗi source chỉ được tạo với capability hiện
tại: TEST_OPERATOR không gọi listing/catalog/users/fund; ADMIN không tự có STAFF.

27/10: [Dashboard có biểu đồ](ADMIN_DASHBOARD.md) thay lưới8panel bằng dải số liệu,
biểu đồ nhịp kiểm duyệt, hàng chờ, kệ sách và sức chứa điểm. Tổng kiểm duyệt lấy
GET `/operations/moderation-overview?days=7|30`, không suy từ trang danh sách.
Quỹ/người dùng/đấu giá vẫn ở màn chức năng; Dashboard không còn tải ba nguồn đó.

- Các danh sách phân trang lấy20hồ sơ, hiển thị dấu `+` khi API còn cursor và liên
  kết mở danh sách đầy đủ. Không dùng độ dài trang đầu làm tổng toàn hệ thống.
- Sức chứa lấy heldSlots/capacity từng điểm thật, không phải phần trăm tăng trưởng.
  Quỹ ở màn sự cố vẫn là số dư mô phỏng, không phải doanh thu hoặc ví người dùng.
- Loading/lỗi/rỗng riêng biệt; lỗi giữ bản cũ kèm nhãn chưa cập nhật, không biến
  lỗi thành số0. Refetch khi quay lại Dashboard và mỗi30giây khi đang mở.
- User directory giữ schema hiện có. Deep link vào listing/catalog/
  users cũng kiểm capability trước khi mount query, không chỉ ẩn sidebar.
- Kệ chờ duyệt dùng tối đa6hồ sơ đầu từ cùng snapshot listing, giữ thứ tự API.
  Ảnh đầu lấy qua private media read hiện có; metadata Confirmed qua public book,
  Pending chỉ ADMIN đọc catalog request. Staff không gọi nhánh private đó. Không
  có API tên người đăng trong snapshot nên không bịa tên hoặc gọi user directory
  để suy quyền. Ảnh không tải được có placeholder và retry; không thay bằng ảnh mẫu.
  Phiếu xem nhanh tách nhãn giá bán/giá trị đổi, bộ sách ghi tình trạng theo từng
  cuốn/nguyên bộ; quyết định vẫn ở màn chi tiết có checklist và command hiện có.
- Dấu động chỉ sau executeIntent/reconcile hoàn tất và receipt khớp quyết định
  trong projection. GET trả Approved hoặc version đổi không đủ kích hoạt dấu.
  Lỗi mạng giữ intent/retry cùng key; definitive refusal chỉ tải lại, không báo
  đã chấp nhận. Lịch sử dùng dấu tĩnh; không có API/command riêng cho hiệu ứng.

## Luồng kiểm duyệt liên tục

Queue truyền `reviewReturnTo` nội bộ sang detail; helper chỉ chấp nhận path đúng
loại hồ sơ và status API hỗ trợ. Back giữ Pending/Approved/Rejected (Catalog dùng
Confirmed), không thêm query filter chưa có API. Refresh queue lỗi giữ dữ liệu
cũ kèm chú thích. Không cache thêm token hoặc nội dung riêng vào history state.

Sau hồ sơ có kết quả, NextReview đọc pending queue limit20 và mở hồ sơ khác cũ
nhất trong trang tải, bỏ hồ sơ do reviewer gửi. Có cursor thì chỉ mô tả trang tải;
id hiện tại xuất hiện lại thì chỉ hướng dẫn tải bản mới. Nút Next đi qua Router/
leave guard, không tự duyệt hoặc mở liên tục bằng timer. Checklist mới thuộc
detail mới; stale version/key/body/replay và kiểm tra quyền server không đổi.

## Bộ lọc và phân trang danh sách

Directory dùng `q`/`status`/`role` trong URL cho API users hiện có; status/role
whitelist và q trim/tối đa100ký tự. Từ khóa nháp không gửi cho tới khi tìm kiếm;
đổi select không áp dụng nhầm draft. Cursor chỉ lấy từ response, không từ URL.
Mỗi tổ hợp filter là một query key; Back/Forward phục hồi bộ lọc đã áp dụng.
Không lưu session/token vào URL, localStorage hoặc Router state.

Directory/review queue/history dùng cùng feedback/phân trang: refresh lỗi giữ
snapshot và chú thích dữ liệu cũ; lỗi trang tiếp theo chỉ thử lại fetchNextPage,
không tải lại/xóa trang đã đọc. Fetch đang chạy khóa tải thêm và dùng
`cancelRefetch:false`. Hết cursor hiện số trang đã tải, không suy ra tổng hệ thống.
OperationsQueue dùng cùng feedback nhưng không thêm phân trang/filter chưa có
contract; retry không mở khi command pending. Không sửa body/key/version/replay.

## Hiệu năng tải mã —26/10/2026

React.lazy chia10module trang (4point queue chung `queues.tsx`), giữ shell/Login/
session eager. Import chạy khi Outlet đã qua kiểm tra profile hiện có; role trong
feature/API vẫn quyết định quyền. Không đổi endpoint, command hoặc cache token.
PageFrame giữ loading/lỗi trong nội dung; quay sang pathname khác reset boundary,
đổi bộ lọc không remount form. Reload chỉ theo thao tác người dùng, cần đăng nhập lại.

Số đo cùng Node24.22.1/Vite8.3.0, pnpm11.19.0, production build local trên nhánh
`codex/admin-ui-refactor` (base `d3b19e5` + local work):

| Chỉ số | Trước | Sau |
| --- | ---: | ---: |
| JS ban đầu, toàn bộ static graph | 654823byte | 490129byte (giảm25.15%) |
| Gzip JS ban đầu, Node gzip mặc định | 193062byte | 151331byte (giảm21.62%) |
| JS toàn app, cộng file duy nhất | 654823byte | 664771byte |
| Gzip JS toàn app, cộng từng file | 193062byte | 212603byte |
| Chunk JS lớn nhất | 654823byte | 256999byte |

Tổng app tăng nhẹ do chia file/runtime; các trang chưa mở không nằm trong tải đầu.
Gzip là ước tính nén từng file, không chứng minh máy chủ bật compression; không
suy ra LCP/INP/thời gian tải thực tế. Ảnh/font không nằm trong bảng này.

`pnpm --filter @used-books/admin-web build` chạy thêm
[budget checker](../../scripts/admin-bundle.mjs):10module phải dynamic, graph ban
đầu≤500000byte và mỗi chunk≤300000byte. Manifest được Vite sinh trong dist, không
commit generated assets. `bundle:check` đọc lại build hiện tại. Admin CI thêm unit/
checker và path filter cho checker; remote CI chưa chạy. Ban đầu UI bị chặn vì quyền
browser; sau owner bật lại, CUA production QA đã mở10module theo profile phù hợp,
giữ points chunk→loading→503→error focus H1→về Dashboard còn phiên; phiên mới tải
points thành công. Review draft/leave guard còn nguyên sau lazy navigation. Directory
Enter focus, refresh lỗi giữ20hàng/draft và retry/clear,320px/root text135% PASS các ca
đã thử. Chỉ đổi2option mặc định thành “Tất cả” để tránh cắt chữ. QA dùng API riêng,
storage fake, CSS scale chỉ trong bản QA; không là native/live Supabase. Full browser
harness và Core Web Vitals NOT RUN; không suy ra toàn bộ nghiệp vụ đã nghiệm thu.
Production preview HTTP smoke PASS:29asset manifest trả200 và byte trùng build,
JS/CSS đúng Content-Type, deep link trả HTML entry, HTML không preload module trang.
Đây là kiểm serving artifact, không thực thi module/DOM hoặc thay cho browser QA.

## Công cụ mô phỏng mới

Route `/simulator/events/topups`, `/simulator/events/pickups`,
`/simulator/events/deliveries`, chỉ ACTIVE TEST_OPERATOR. Nhập UUID yêu cầu/đơn/
lô giao hàng, mã vận đơn hoặc thông tin nạp của kịch bản đã tạo; backend chưa có
queue liệt kê toàn bộ DirectDelivery/topup cho operator nên không bịa bộ chọn.

- Validation bám schema generated types; đối chiếu actor với người nhận tiền,
  hằng carrier/type, tracking format, số tiền và thời điểm có múi giờ.
- Dùng ActionPanel/createCommand/runCommand, xác nhận trước POST. `eventId` là
  HTTP key của envelope; giữ cùng key/body khi mất phản hồi, khóa input khi còn
  intent chưa được đối chiếu. Chỉ tạo eventId mới sau kết quả dứt điểm và người
  dùng chọn nhập sự kiện tiếp theo.
- Parse đúng WalletCommandReceipt/CarrierEventReceipt/TransactionCommandReceipt.
  ReviewRequired là cảnh báo; Duplicate không diễn giải là áp dụng thêm; không
  tự cộng balance hoặc kết luận custody/settlement từ thao tác giao hàng.
- Receipt đủ để hiển thị kết quả của ba write-only adapter; không gọi GET
  Member-only để giả vờ đối chiếu. Lời báo từ chối riêng không nói đã reload một
  queue mà API không cung cấp.
- Adapter chỉ hoạt động khi cấu hình simulator ở server cho phép trong dev/test;
  cấu hình thiếu/503 hiện qua lỗi API. Không đưa secret server vào browser/env web.

## Phần chưa có API

Report/thống kê doanh thu/lịch sử kiểm duyệt theo ngày, taxonomy CRUD và mutation
khóa/mở khóa/đổi role không có endpoint vận hành tương ứng tại source này. Report
giữ disabled/Sắp triển khai; directory chỉ đọc. Không tạo nút thành công giả,
không dùng API Member để vượt quyền hoặc mở thêm nghiệp vụ sau gate.

## Kiểm chứng

- Admin lint, build/typecheck và unit tests; ca mới kiểm source theo quyền,
  deep-link từ chối trước query, phân trang/lỗi đọc, envelope/receipt và lost-ack.
- `pnpm --filter @used-books/admin-web test:api` dùng
  `vitest.config.integration.ts`:4ca HTTP/MongoDB thật, fixture database ngẫu nhiên
  `ops_browser_*_test`, chỉ nhận QA replica set57017, tự drop database/user/role
  fixture khi kết thúc. Storage local fake; không live Supabase.
  Đặt `MONGO_TEST_URL` theo [START_HERE](../handoff/START_HERE.md) trong terminal
  QA riêng; không trỏ env của app vào57017. QA container được dừng sau lượt này.
- HTTP QA xác nhận các source Dashboard của Admin/Staff/TEST_OPERATOR; Admin và
  Staff bị403 trên ba operator adapter; valid carrier envelope tới đúng route và
  bị404 với shipment không tồn tại; topup thật ở QA mất phản hồi rồi retry vẫn
  chỉ ghi một bút toán5000VND. Không nhận carrier404 là happy-path giao hàng PASS.
- Browser harness đã đổi assertion Dashboard mock sang Dashboard thật và giữ
  containment/responsive/menu checks. Browser automation đang tắt nên UI thao tác,
  full carrier happy path từ Admin, confirm/retry dialog và visual NOT RUN.
- Không seed/reset, ghi tiền mô phỏng hay chạy harness trên database dev chính;
  không thay mật khẩu/env. Không đóng release/human-review gates.
