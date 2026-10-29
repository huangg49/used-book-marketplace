# Kiểm chứng các hành trình hiện có — 28/10/2026

Mốc lịch sử: runner ở gói này có8suite. [Gói đấu giá29/10](AUCTION_JOURNEY_2026_10_29.md)
thêm suite real API thành9; giữ kết quả8/8 bên dưới đúng source/ngày của nó.

Gói được owner duyệt để kiểm chứng và sửa lỗi của chuỗi UX/Việc của tôi hiện có.
Nhánh `codex/journey-verification`, base `7a7c217`; commit subject
`fix(journeys): verify cross-app flows and restore mobile chat panels`.
Không mở tính năng mới, không thay nghiệp vụ, contract0.59.0 hoặc migration0040.
Không thao tác GHN/carrier/Driver, DB/bucket chính, push/PR/merge/deploy.

## Kết luận và lỗi đã sửa

- **Lỗi sản phẩm:** ở ChatPage mobile, chọn tab Đơn hàng vẫn để pane hội thoại/
  composer hiển thị. Rule flex của dossier có specificity ngang rule ẩn của
  component chung và thắng theo thứ tự CSS. Chờ30giây vẫn không ẩn, nên đây không
  chỉ là test chưa chờ render. [CSS](../../apps/user-web/src/pages/ChatPage.module.css)
  nay ưu tiên rule ẩn đúng pane khi `data-panel="sheet"` trong breakpoint960px;
  giữ component mounted để bản nháp không mất. Không thay animation/brand.
- **Harness chat cũ:** click input checkbox đã được UI ẩn, tên nút gửi thiếu số
  cuốn, kỳ vọng switch mode disabled trong khi UI đã loại hẳn khi có Exchange,
  và dùng trạng thái purchase room để chọn tab ở trang Exchange độc lập.
  [Kịch bản](../../apps/user-web/tests/chat-guidance.mjs) nay thao tác nhãn sách
  thật, xác nhận đã chọn, kiểm switch không tồn tại và scope tab theo navigation.
  Vẫn giữ các ca lỗi, lost ACK, giá bất biến, lịch sử, bản nháp và screenshot.
- **Lỗi UX tài khoản LOCKED:** account web/RN vẫn quảng bá một số destination
  mà API chặn. Đã ẩn lối tắt kệ sách/chat/review; RN còn ẩn địa chỉ/wishlist,
  giữ ví và lối vào giao dịch cũ. RN tách thông báo LOCKED/RESTRICTED.
  [Account web](../../apps/user-web/src/pages/AccountOverviewPage.tsx) và
  [Account RN](../../apps/mobile-react-native/src/features/account/account-screen.tsx)
  không thay guard/service. Browser bổ sung assertion không có lối tắt bị chặn,
  còn ví/đơn; RN suite còn kiểm trực tiếp403 listing/address/review và200wallet.
  Phạm vi fix là lối tắt account; không tuyên bố đã audit mọi menu toàn app.
- **Harness RN web cũ:** menu account đã đổi thành Kệ sách của tôi/Địa chỉ của tôi
  nhưng [public shelf](../../scripts/test-public-shelf.mjs) và
  [address journey](../../scripts/test-address-journey.mjs) còn tìm tên cũ.
  Sửa cả positive selector và assertion LOCKED; không để assertion đếm0 đạt chỉ
  vì tìm nhãn đã biến mất. Giữ assertion chặn LOCKED; sửa lỗi UI thật ở trên
  thay vì bỏ assertion. Câu chữ RESTRICTED kiểm theo thông báo hiện tại.
- **Tài liệu lệch source:** START_HERE còn gọi Exchange chat/report là deferred,
  trong khi [ExchangeDetailPage](../../apps/user-web/src/pages/ExchangeDetailPage.tsx)
  đã gọi getMessages/sendMessage/reportIssue. Đã sửa mô tả; không suy xử lý tranh
  chấp/fulfillment hoàn chỉnh chỉ từ các command này.

## Vai trò → entry → kết quả → bước tiếp

Yêu cầu dựa trên [SRS1.1](../SRS_V1_1.md),
[phụ lục](../features/LOCAL_HANDOVER_AUCTION.md) và ADR liên quan. Bảng dưới chỉ
ghi phần source và bằng chứng đã khảo sát trong gói; không thay acceptance/gate.
Forum nằm ngoài phạm vi theo [ADR0051](../adr/0051-remove-forum-from-project-scope.md).

| Vai trò / entry thật | Điều kiện và command | Kết quả, bước tiếp / phục hồi | Bằng chứng và giới hạn |
| --- | --- | --- | --- |
| Guest/Member RN web → Trang chủ/Tìm sách → bản sách | Shelf public không gắn token; đăng nhập trước thao tác owner | Detail, tải tiếp, lỗi giữ dữ liệu cũ và retry; Back về shelf | `member-rn-web`: API/Mongo thật, ảnh storage fake; không native |
| Member RN web → Tài khoản → Kệ sách của tôi | Owner; draft, media finalize/submit, sửa bài đã duyệt/ẩn/mở lại/archive | Xem trạng thái duyệt; lost ACK dùng lại ý định, không tạo bản sửa thứ hai | `member-rn-web`; moderator fixture qua API, không phải một người tự khám phá cả luồng |
| Staff/Admin → queue đầu sách/bài đăng | Đúng role, revision/version/checklist; không tự duyệt | Decision rồi quay queue; conflict đọc lại, lỗi không mất workspace | `operations`: HTTP/Mongo thật, kiểm private image/leave guard/session |
| Buyer/Seller web → bản sách/hội thoại | Hai session; thương lượng, quote và chấp nhận giá; Order command | Đơn đúng giá đã thống nhất; thiếu tiền bị từ chối; trả tiền giữ một hold; tiếp ở đơn | `seller-order` thật; dừng PendingSellerConfirmation, không giao hàng |
| Buyer/Seller web → Hội thoại → Đơn hàng/Hội thoại | Order đã tạo giữ cùng workspace; Exchange đang hoạt động khóa đổi mode | Hai tab mobile riêng, draft giữ qua chuyển tab; lịch sử lỗi có retry | `chat`: HTTP intercepted + Socket.IO QA riêng; không chứng minh API chat thật |
| Member web → Trao đổi của tôi → giao dịch | Owner/participant, revision/key đúng; create/accept/cancel/funding eligibility | Chi tiết và trạng thái mới; thiếu tiền giữ Proposed,403 không lộ dữ liệu, lost ACK retry | `exchange` thật; lịch sử/chat UI còn có fixture ở suite chat; không nghiệm thu settlement |
| Seller → gửi sách đấu giá; Staff nhận/kiểm; Seller đăng phiên; Buyer bid/pay | Bài đã duyệt, người phụ trách độc lập, Passed, version và quyền hiện tại | Intake/auction/point-order; giữ tiền một lần; sai owner/stale/race bị kiểm | 17 ca HTTP/Mongo chọn lọc; auth/catalog/media/clock/capacity có fixture. Chưa browser thật xuyên cả ba vai trò |
| Member web/RN web → Tài khoản → Việc đang chờ → đúng hồ sơ | Năm lane lấy từ state hiện tại; owner/role/deadline; focus theo ID | Accept/reject cập nhật việc, hết hạn chờ worker; hồ sơ ngoài trang đầu vẫn mở đúng | `work-inbox` thật + fixture hơn50đơn/intake cũ chỉ để kiểm paging/focus; [ADR0053](../adr/0053-state-derived-work-inbox.md) |
| Member web/RN web → giao dịch Completed → đánh giá/hồ sơ; Staff review | Eligibility/review lifecycle theo [ADR0052](../adr/0052-transaction-reviews-and-reputation.md) | Gửi/sửa/xóa/reply, duyệt/ẩn/khôi phục và aggregate theo mẫu | `reviews`: HTTP/Mongo thật với Completed tổng hợp; không chứng minh giao nhận đã hoàn tất |

Đơn auction và direct order vẫn có nơi theo dõi riêng. Công việc chưa gom hết chat,
tranh chấp hay bàn điểm vào một queue. Các giới hạn Exchange theo
[ADR0050](../adr/0050-exchange-inspection-and-existing-obligations.md) và
[READINESS](../handoff/READINESS.md) giữ nguyên.

## Một lệnh kiểm lại, có ma trận kết quả

[Runner](../../scripts/test-journey-gate.mjs) chạy **tuần tự** tám suite đã có,
không tạo harness nghiệp vụ thứ hai. Các suite dùng chung port3009/3010 và Vite
cache; không chạy runner hoặc suite browser khác song song. Mỗi fixture thật tạo
DB `ops_browser_*_test` riêng, least-privilege app/migrator và storage local fake.

Runner từ chối Mongo ngoài localhost/127.0.0.1/IPv6 loopback, port57017,
namespace `*_test`, replicaSet `rs-test`. Kiểm API dist và RN export có QA API
base3009. Đây là kiểm artifact tồn tại/base; **không tự chứng minh artifact mới
nhất**. Phải build/export từ source đang kiểm trước khi chạy. Runner không đọc
secret ra output, không lưu stdout/request body vào JSON, không tự start DB.

PowerShell, từ repo root, sau khi cài dependency/Chromium theo START_HERE:

```powershell
corepack pnpm@11.19.0 infra:mongo:test:up
$savedQaUrl = $env:MONGO_TEST_URL
$savedQaApi = $env:EXPO_PUBLIC_API_BASE_URL
$savedPreview = $env:EXPO_PUBLIC_DESIGN_PREVIEW
try {
  $env:MONGO_TEST_URL = 'mongodb://latlai_qa_root:local_test_only@127.0.0.1:57017/latlai_journey_test?replicaSet=rs-test&authSource=admin'
  $env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3009/api/v1'
  $env:EXPO_PUBLIC_DESIGN_PREVIEW = '1'
  corepack pnpm@11.19.0 --filter @used-books/api build
  if ($LASTEXITCODE -ne 0) { throw 'API build failed' }
  corepack pnpm@11.19.0 --filter @used-books/mobile-react-native export:web
  if ($LASTEXITCODE -ne 0) { throw 'RN export failed' }
  corepack pnpm@11.19.0 test:journey-gate:unit
  if ($LASTEXITCODE -ne 0) { throw 'Gate safety tests failed' }
  corepack pnpm@11.19.0 test:journey-gate
  if ($LASTEXITCODE -ne 0) { throw 'Journey gate failed; inspect the matrix' }
} finally {
  $env:MONGO_TEST_URL = $savedQaUrl
  $env:EXPO_PUBLIC_API_BASE_URL = $savedQaApi
  $env:EXPO_PUBLIC_DESIGN_PREVIEW = $savedPreview
  corepack pnpm@11.19.0 infra:mongo:test:stop
}
```

`node scripts/test-journey-gate.mjs --list` liệt kê phạm vi.
`node scripts/test-journey-gate.mjs --only=chat,exchange` chỉ chạy hai suite;
suite khác **NOT_RUN**, tổng **PARTIAL**, không thành PASS toàn gói. Lỗi preflight
ghi **BLOCKED** trước khi chạy, không để JSON PASS cũ sống sót. Một suite FAIL
dừng lượt, phần còn lại NOT_RUN. Nếu bị ngắt giữa chừng, RUNNING không là PASS.
Ma trận `.tmp/journey-gate/result.json` ghi thời gian, sourceHead/dirty, phạm vi,
exit code và duration; artifact QA là local/ignored. Lượt mới ghi đè ma trận cũ.

## Evidence của lượt này

Node24.22.1/pnpm11.19.0, Windows x64, Chromium; QA Mongo replica set57017.
API không đổi so với base7a7c217, dùng dist của gói đó. RN export được build lại
sau fix account với QA base3009; web chạy source hiện tại có CSS/account fix.

| Kiểm tra | Trạng thái / phạm vi |
| --- | --- |
| Gate browser8suite | **PASS8/8**, exit0; lượt cuối22:33–22:40 giờVN, base7a7c217 + dirty diff của gói này |
| `chat` | PASS: HTTP intercepted + Socket.IO QA, chuyển pane/draft/giá/lost ACK/lịch sử, desktop/mobile/chữ lớn |
| `seller-order` | PASS: hai session thật, quote/thương lượng/tạo đơn mất ACK/thanh toán thiếu tiền và một hold; không fulfillment |
| `exchange` | PASS: API/Mongo thật create/accept/cancel, funding bị chặn, lost ACK/403; UI empty/error/retry/keyboard/responsive |
| `operations` | PASS: API/Mongo thật duyệt catalog/listing, private image, version/replay/leave guard, role/session rotation/expiry/logout |
| `member-rn-web` | PASS: shelf/detail/search/paging/images; địa chỉ, đăng/sửa/ẩn/mở/archive với replay; LOCKED UI và403/200API |
| `reviews` | PASS: web/RN web create/edit/delete/lost ACK, Staff hide/restore/aggregate, profile/count/empty; Completed tổng hợp |
| `work-inbox` | PASS: Member web/RN web/Staff/Admin, việc thật/lost ACK/current permission, hơn50đơn và focus intake bằng fixture |
| `auction-ui` | PASS: browser fixture1440/390, filter/cache/Back/empty/error/retry/ảnh lỗi; không API/Mongo auction thật |
| API auction chọn lọc | PASS17,55filtered/skipped có chủ đích. Intake, inspection, publish/schedule, bid/Buy Now race, quyền và payment hold; không gọi carrier/giao nhận |
| Safety runner | PASS4: allowlist, URL QA, lỗi không lộ credential, partial không thành PASS |
| User web | PASS251 unit; lint/typecheck/build PASS. Còn warnings effect/dependency/chunk cũ |
| RN | PASS161 unit, lint/typecheck/export web PASS; không chạy native build/device |
| Account web browser | PASS từ entry, profile/wallet/keyboard/guide, responsive và LOCKED không quảng bá destination bị API chặn |
| Visual review | Đã xem desktop1440 và hai pane chat mobile390, account LOCKED web/RN web từ screenshot hiện tại; suite còn có320/chữ130%, overflow và chuyển tab/draft. AI review không thay người dùng thử |
| Impeccable detector | Hai Account target0findings; Chat CSS có một advisory radius14px dòng25 cũ, ngoài diff. Không nhận toàn gói0findings hoặc đổi brand để xóa warning |
| Docs/diff | PASS docs:check, checker5ca và git diff --check; không là kiểm toàn bộ mệnh đề nghiệp vụ |

Lượt tổng trước dừng FAIL ở RN account vì câu chữ/kỳ vọng cũ; kiểm sâu lộ lỗi
lối tắt LOCKED. Sau sửa source, build/export lại và chạy lại cả8suite đạt.
Không bỏ ca từ chối để đổi FAIL thành PASS. Các log Tailwind content, Expo force
exit sau export và Vite chunk/effect warnings vẫn được phân biệt với exit code;
không nhận native hoặc hiệu năng toàn app đã đạt.

Lệnh auction chạy riêng trong terminal QA với
`MONGO_E2E_DATABASE=latlai_journey_auction_test`:

```powershell
corepack pnpm@11.19.0 --filter @used-books/api exec vitest run --config vitest.config.e2e.ts test/auctions.e2e-spec.ts --maxWorkers=1 -t 'AC-AU01/02:|AC-AU01: failed|AC-AU03/04:|AC-AU05/06:|AC-AU11:|AC-AU07/ADR 0047:|simultaneous equal bids:|AC-AU09: the winner pays|ADR 0047: seller-published and scheduled auctions'
```

## Phần còn thiếu và thứ tự tiếp theo

1. **Native Android + TalkBack**, đúng các đường entry/focus/retry vừa kiểm trên
   RN web; browser/export không kiểm SecureStore, Back hệ thống, keyboard/safe
   area hoặc assistive audio. ARM/iOS vẫn chưa có evidence mới.
2. **Human UX và review độc lập** theo [TEAMWORK](../TEAMWORK.md): teammate thử
   từ entry, ghi bước bị lạc mà không được chỉ từng nút; owner các miền review
   cả chuỗi local phụ thuộc, thêm reviewer tiền/quyền. Các skill UI và test tự động
   hỗ trợ kiểm tính nhất quán, không thay bài thử này.
3. **Browser đấu giá xuyên Seller→Staff→Buyer trên API thật**, dùng QA riêng,
   điểm/giờ và phân công hợp lệ. Hiện có HTTP17ca + browser fixture, còn khoảng
   trống tích hợp UI giữa vai trò. Giữ các ngoại lệ đã duyệt ADR0047/0044 và gate
   READINESS; không tự mở delivery/settlement để làm kín demo.

Flutter vẫn scaffold, không có parity/evidence mới. Storage thật, auth email/
VNPay thật, import/failover/schema, DirectDelivery sau F2h và toàn bộ giải quyết
tranh chấp/fulfillment **NOT RUN trong gói này**; gate đã có evidence trước không
bị mở lại chỉ vì gói hiện tại không chạy. GHN/carrier/Driver giữ ngoài phạm vi.

## Git, remote và local services

Main remote xác minh22:26 giờVN28/10 vẫn `7d9201257aadbdec850ebd07694bc7611b63b082`,
PR mở0. Năm workflow main đọc tại SHA đó completed/success:
[User Web](https://github.com/huangg49/used-book-marketplace/actions/runs/40612299156),
[API](https://github.com/huangg49/used-book-marketplace/actions/runs/40612299167),
[Docs](https://github.com/huangg49/used-book-marketplace/actions/runs/40612299127),
[Startup](https://github.com/huangg49/used-book-marketplace/actions/runs/40612298943),
[Flutter](https://github.com/huangg49/used-book-marketplace/actions/runs/40612299157).
Không là CI của nhánh local. Giữ nguyên chuỗi commit trước, không pull/reset.
Mongo chính vẫn Exited từ trước phiên; QA đã dừng sau khi kiểm xong. Chưa push/PR/
merge/deploy, READINESS không đổi. Điểm lưu cuối ở
[SESSION_STATE](../handoff/SESSION_STATE.md).
