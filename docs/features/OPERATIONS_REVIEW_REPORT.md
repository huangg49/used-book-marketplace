# Bàn kiểm duyệt Lật lại — bàn giao

Ngày: 27/09/2026. Phạm vi: web Staff/Admin sử dụng API thật theo OpenAPI 0.6.0.
Quyết định kiến trúc: [ADR 0010](../adr/0010-operations-review-client.md).

## Tối ưu tải đầu Admin — 27/10/2026

Source: `codex/admin-startup-performance`, base `17aac90`; commit subject
`perf(admin): defer authenticated workspace until login`. Đây là bước đầu gói
hiệu năng/ổn định owner duyệt; chưa phải hoàn tất tối ưu API hoặc runtime dev.

| Production manifest, cùng Node24.22.1/pnpm11.19.0 | Trước | Sau |
| --- | ---: | ---: |
| JavaScript khởi động, toàn graph static/modulepreload | 497519bytes | 431696bytes (-13,2%) |
| Gzip ước tính của graph khởi động | 153762bytes | 133169bytes (-13,4%) |
| CSS khởi động | 55102bytes | 33550bytes (-39,1%) |
| Chunk JS lớn nhất | 263511bytes | 218840bytes |
| Tổng JS mọi chunk | 740174bytes | 743261bytes (+0,4%) |

- Shell, command palette, sidebar preferences và TanStack Query tải cùng
  `AuthenticatedWorkspace` sau login. `/auth/me` và capability gate vẫn đứng
  trước Outlet;10module trang vẫn lazy, không remount form theo profile refresh.
  Tách QueryClient khỏi module session, không tạo token store/client thứ hai.
  Đăng ký cache bắt đầu từ identity lúc import; giữ data qua refresh cùng người,
  xóa queries/mutations khi logout/đổi/mất identity, hủy reads đang chạy để phản
  hồi muộn của A không nạp lại cache của B. HMR dispose hủy subscription/cache.
- React/ReactDOM/Scheduler có chunk riêng theo API `rolldownOptions` của Vite8;
  regex hỗ trợ cả Windows/Unix. Checker vẫn cộng runtime này vào startup, giữ
  giới hạn500kB startup/300kB mỗi file và bắt lỗi nếu workspace thành eager.
  Không nới budget, đổi dependency/lockfile/schema/API/env hoặc client teammate.
- PASS Admin209unit/component/model tests (thêm7ca cache identity/unsubscribe/
  cancel late response);7test checker gồm default boundary+eager regression;
  lint/typecheck/build;27session-client tests;7HTTP/Mongo QA tests bao gồm quyền/replay/reconciliation.
  Detector một lượt2target JSX trả0finding. Fixture dùng DB riêng `_test`,
  storage local fake/Sharp thật; không dùng kết quả này làm evidence live bucket.
- CUA IAB Windows chạy **production build**, API base3009 chỉ trong thư mục build
  QA `.tmp/`, preview5175. Inventory trước login chỉ có entry/rolldown-runtime/
  react-runtime; sau login mới có AuthenticatedWorkspace/query/queue modules.
  Deep link vào hàng chờ giữ đúng URL. Đọc hồ sơ3ảnh, zoom150% (transition180ms),
  đổi ảnh đúng nhãn/reset100%, Escape trả focus và bỏ scroll lock. Sang directory
  lọc Staff được2hàng; logout/login pure Staff giữ URL nhưng chỉ hiện cảnh báo
  quyền,0hàng directory và không menu Admin; logout/reload chỉ còn login.
- Responsive: desktop1440×1000 và mobile390×844; phiếu Staff rộng314px/padding12px,
  không tràn ngang. Mở/đóng nhanh, đổi lại Admin rồi chuyển3tab quản lý điểm:
  chỉ1form sống, không input của tab trước; console không warning/error trong
  lượt này. Xác nhận các sửa gallery/mobile/ResizeObserver từ gói motion trước;
  chưa xác nhận hidden-tab playback hay đo frame/CPU/INP/LCP. Ảnh minh họa QA ở
  `.tmp/admin-startup/desktop.png`, `mobile.png` (Git ignore).

Giảm mã trước login bằng cách dời công việc sau auth; tổng JS tăng nhẹ do các
boundary/chunk. Chưa đo Core Web Vitals hoặc kết luận app nhanh hơn một tỷ lệ
thời gian cụ thể. Full browser automation/chunk network fault/throttled network/
screen reader/Safari/Firefox/native/CI remote/human review NOT RUN. QA tự dọn
database/users/roles; dừng API/preview/Mongo riêng, bật lại main API/worker/Admin.
READINESS không đổi, chưa push/PR/merge. Bước tiếp: baseline request/latency/query
plan Dashboard; chưa tự thêm cache dữ liệu quyền hoặc sửa nghiệp vụ để giảm tải.

## Chuyển động tác vụ — 27/10/2026

Source: `codex/admin-ui-refactor`, base `b544117`; commit subject
`feat(admin): unify task motion across operations workspace`. Áp theo phương án
motion owner đã duyệt, dùng Pro Max/Taste/Impeccable trong nhận diện hiện có.

- `MotionPanel` mở220ms/đóng140ms và đổi chiều cao khi chuyển tab điểm. Chỉ giữ
  khung giấy rỗng khi đóng, gỡ form sống ngay; focus/input được ưu tiên và đổi
  tác vụ nhanh hủy animation trước. ResizeObserver chỉ đọc, cập nhật ở frame kế
  tiếp để tránh vòng resize của phiếu lồng nhau. Không dùng animation kết thúc
  để quyết định submit, quyền, state hoặc thời điểm unmount form.
- Hàng chờ Review/Operations và bảng người dùng chỉ animate hàng thêm/di chuyển/
  revision thay đổi. Polling không đổi không phát lại toàn danh sách; tối đa6hàng
  mới fade180ms. Skeleton3hàng ở lần tải đầu; refresh có chỗ trạng thái cố định,
  giữ dữ liệu và recovery hiện có. Loading loop dừng khi ẩn/mất focus/offscreen.
- Kết quả Operations xuất hiện gần hàng vừa xử lý sau ACK và reconciliation,
  được focus một lần cho từng outcome; polling dời hàng không giành focus lại.
  Không đổi immutable key/body/version hoặc nhánh unknown/reconcile/retry.
- PaperSelect ở hai filter người dùng có Enter/phím mũi tên/Home/End/typeahead,
  Escape/Tab, ngoài vùng và blur; popup đóng inert, có exit trên browser hỗ trợ
  discrete transitions. Giữ draft tìm kiếm khi đổi filter. Native select trong
  form nghiệp vụ vẫn giữ tương tác nền tảng, không thay toàn bộ field semantics.
- Gallery fade ảnh mới sau load và zoom bằng nút180ms; không giữ ảnh cũ dưới
  nhãn mới hoặc thay readiness. Dialog có progressive exit140ms, đóng native
  trả focus ngay. Login/empty/menu có một lần xuất hiện nhẹ; không thêm vòng lặp
  Dashboard, giữ ba cảnh đã duyệt, workboard đứng yên và depth trên hai liên kết.
  Chính sách motion owner11/10 được giữ bằng override trong phạm vi component.
- PASS Admin202unit/component/model tests, lint/typecheck/build; bundle startup
  JS497519/500000bytes,10page modules deferred. Không thêm package/lockfile;
  CSS/WAAPI và helper chỉ tải theo feature. HTTP/Mongo riêng7tests PASS gồm
  lost ACK/replay/reconcile/quyền/revision. Storage QA fake, không là live bucket.
  Detector chạy một lượt13target UI, trả0finding; không thay thế kiểm thị giác.
- CUA IAB Windows1440×1000: dropdown phím/Escape/typeahead chọn Staff, giữ từ khóa
  chưa submit; popup đóng inert/display none. Quản lý điểm đổi tab chỉ một form,
  hủy xác nhận giữ lựa chọn, lưu tên/trạng thái QA nhận biên nhận đúng hàng và
  focus. Pure Staff nhận sách QA → Received với kệQA-01; thử mở/đóng liên tiếp,
  lỗi mã kệ trống focus field, biên nhận sau ACK và0editor trong panel đóng.
  Mobile390×844 mở phiếu kiểm tra không tràn ngang; phát hiện padding lồng làm
  nội dung hẹp và đã mở rộng phiếu sang cả hàng trong bản sửa cuối.
- Log QA có ResizeObserver warning khi đổi tab; deferred writes và regression
  test đã bổ sung. **Browser confirmation sau sửa resize/mobile NOT RUN** vì
  quyền browser bị tắt giữa lượt. Gallery fade/zoom mới, native dialog exit,
  hidden-tab/viewport playback và full browser suite chưa được xác nhận lại.
  Chưa đo FPS/INP/CPU, chưa audit screen reader/chữ lớn/Safari/Firefox/native,
  remote CI hoặc human review. Không coi source tests là bằng chứng mượt máy thật.

Fixture tự dọn database/users/roles riêng sau QA; dừng API/Vite/Mongo QA của lượt
này, giữ main API/Admin đang chạy. Không sửa seed/env/database chính/backend,
không push/PR/merge, không đóng gate READINESS. Khi browser được bật lại, xác nhận
những ca còn thiếu ở trên trước review tích hợp.

## Bàn đọc hai vùng — 27/10/2026

Source: `codex/admin-ui-refactor`, sau base `729a442`; commit gói có subject
`feat(admin): build a continuous book moderation desk`. Các phần bên dưới mục này
là báo cáo baseline27/09, không thay thế trạng thái/gate hiện hành trong handoff.

- Hàng chờ và hồ sơ chung một màn: giữ status trong URL, cache theo người dùng,
  vị trí cuộn dạng số trong memory, nút Trước/Tiếp và bàn phím chọn hàng. Mobile
  có nút mở hàng chờ và đi tới phiếu, offset tránh header che focus.
- Gallery riêng: thumbnail, ảnh lớn, zoom100–300%, chuyển ảnh/phím, nhận diện bản
  gửi, Escape/focus return/scroll-lock cleanup. Read lỗi/ảnh lỗi/URL mới chưa load
  đều vô hiệu hóa readiness; không persist signed URL hay nội dung riêng.
- Đối chiếu hai bản gửi từ endpoint revisions có cursor: nội dung/giá/điều kiện,
  thay ảnh cùng số lượng hoặc đổi thứ tự, bộ sách và lựa chọn giao nhận. Ảnh bản
  cũ chỉ tải khi mở. Chọn bản cũ không đổi revision của phiếu quyết định. Không
  dựng lịch sử metadata catalog ngoài contract. Không đổi API/session/command.
- PASS Admin194unit/component/model tests, lint/typecheck/build và bundle budget
  (startup JS497289bytes,10page modules vẫn deferred). HTTP/Mongo riêng7tests:
  thêm đối chiếu revision bất biến/Admin–Staff và từ chối TEST_OPERATOR; giữ các
  ca lost ACK/replay/reconcile đã có. Storage local fake/Sharp thật, không phải
  bằng chứng Supabase live. Không migration hoặc thay seed/password/env chính.
- CUA trên IAB Windows: desktop1440×1000,390×844,320×800 không tràn ngang; gallery
  zoom/đổi ảnh/focus/scroll lock; dropdown phím/Escape; đổi tab giữ checklist/lý
  do; guard rời hồ sơ; duyệt/từ chối/catalog confirm thật trên QA; next/reset;
  quay lại đúng filter; scroll954px được phục hồi954px. Gửi lại trong lúc mở cũ
  rồi reload đọc đúng bản3 và so sánh2→3. Tắt QA API rồi refresh giữ5hồ sơ và nút
  retry. Console không có lỗi trước ca network fault chủ động.
- Pro Max/Taste/Impeccable dùng trong brand hiện có. Detector một lượt36advisory
  (35literal color,1font19px); đổi về token brand/color-mix và type20px. Review
  source/browser bởi một agent, không là critique độc lập hay human review.
- Suite tự động `tests/browser.mjs` đã cập nhật selector URL và ca mới, **NOT RUN**
  trong phiên này; CUA thủ công ở trên không được báo thành suite tự động PASS.
  Screen reader/chữ lớn/Safari/Firefox/native/CI remote/human review NOT RUN.
  READINESS giữ nguyên. Ảnh QA trong `.tmp/review-workspace/` (Git ignore).


## Đã triển khai

- Đăng nhập, đọc quyền hiện tại, xoay token và đăng xuất thu hồi phiên. Token chỉ
  ở bộ nhớ; đổi người dùng xóa cache. Profile lỗi chặn thao tác và cho thử lại.
- Staff/Admin: hàng chờ bài đăng theo trạng thái, cursor pagination, đọc phiên bản
  đã gửi, ảnh riêng tư, mô tả tình trạng, giá và lịch sử các lần gửi.
- Admin: hàng chờ đầu sách, metadata, lịch sử quyết định, xác nhận hoặc từ chối.
  Staff không có quyền catalog; Member/Test Operator đơn lẻ không có bàn kiểm duyệt.
- Duyệt đúng revision/version với sáu mục kiểm tra. Chặn duyệt khi chưa đọc được
  đầu sách đã xác nhận hoặc chưa tải được toàn bộ ảnh. Từ chối có lý do 10–1.000 ký tự.
- Không tự duyệt hồ sơ mình gửi. Quyền phía UI bổ sung trải nghiệm; backend vẫn
  là nơi kiểm tra độc lập chủ thể, quyền, eligibility, trạng thái và concurrency.
- Mất phản hồi giữ nguyên payload/key. Có receipt nhưng GET lỗi thì chỉ tải GET
  lại. Conflict không tự gửi lại trên version mới. Có cảnh báo khi rời phần nhập;
  không reset checklist trong lúc polling/focus. Ảnh có nút xem lớn và Escape đóng.
- Nhận diện dùng logo/token/font có sẵn của Lật lại, hỗ trợ tên dài, chữ lớn,
  màn hình hẹp, loading/empty/error và dữ liệu cũ khi refresh danh sách lỗi.

Không tạo thêm số liệu, trust badge hay lời cam kết sách chính hãng. Duyệt không
tự mở kệ công khai vì API/UI kệ công khai vẫn thuộc mốc kế tiếp.

## Bằng chứng chạy thực tế

Node 24.19.0; pnpm 11.19.0; Edge headless/Playwright 1.62.1; PostgreSQL riêng `_test`.
API và migrations thật, upload HTTP thật, Sharp thật; adapter lưu ảnh cục bộ giả.
Không dùng các ca này thay bằng chứng Supabase live ở báo cáo media trước đó.

| Kiểm tra | Kết quả |
|---|---|
| Contract check | Types sinh ra khớp YAML, không thay hợp đồng API |
| Workspace lint/typecheck | Qua; không bỏ rule để né lỗi |
| Unit tests | 68: API 14, RN 30, session dùng chung 11, operations 13 |
| API HTTP/PostgreSQL E2E | 75/75 qua, gồm quyền, lock/race, rollback và media |
| Operations production build | Qua |
| RN export web/Android/iOS JS | Qua sau khi tách transport dùng chung; không phải native build |
| Browser chính | Xác nhận đầu sách → đọc ảnh → duyệt/từ chối qua API; guard/checklist/lý do |
| Browser phục hồi | Mất acknowledgement sau commit → retry cùng key; hai phiên xem cũ → 409 → đọc kết quả mới |
| Browser phân quyền | Staff không vào catalog; Member không có workspace; tự gửi không được tự duyệt |
| Browser trạng thái | Rỗng, lỗi mạng vẫn giữ danh sách, retry, phân trang, refresh token và phiên hết hạn |
| Responsive | Desktop 1440; 390; 320 với font gốc ×1,35, không cuộn ngang |

Ảnh trong `docs/verification/operations-*.png` là dữ liệu thử nghiệm; ô màu trong
ảnh là file ảnh tổng hợp dùng kiểm thử upload, không phải ảnh sách thật. Bộ chạy lại
lưu ảnh mới vào `apps/admin-web/test-results/` (Git ignore).

API E2E có log 500/503 do chủ động giả lập lỗi rollback. Có cảnh báo deprecation
`pg` khi adapter thực hiện truy vấn đồng thời; ca kiểm thử vẫn qua. Không coi đó là
đã sửa cảnh báo của dependency. Workflow CI đã thêm, chưa có kết quả hosted CI.

## Chạy lại

1. Cài dependencies, đặt `TEST_DATABASE_URL` tới DB riêng có tên kết thúc `_test`.
   Không dùng DB demo/production. Không đưa giá trị bí mật vào chat/log.
2. `pnpm --filter @used-books/api build` tạo API/Prisma artifacts.
3. `pnpm --filter @used-books/admin-web exec playwright install chromium`.
4. `pnpm --filter @used-books/admin-web test:browser`.

Suite tự mở cổng loopback 3009/3010/5174, tạo schema `ops_browser_<random>`, áp dụng
migration rồi dọn schema và server khi kết thúc. Các cổng cần đang trống. Trên máy
có Edge có thể đặt `PLAYWRIGHT_CHANNEL=msedge` thay bước cài Chromium. Fixture chỉ
cấp tài khoản thử nghiệm trong schema riêng; không đổi password seed hay `.env`.

Các lệnh còn lại: `pnpm contract:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm test:api:e2e`, `pnpm --filter @used-books/admin-web build`,
`pnpm --filter @used-books/mobile-react-native export:all`.

## Giới hạn và việc tiếp theo

Chưa có full screen-reader audit; đã kiểm tra focus mở/đóng dialog, Escape, guard,
nhãn form và resize/chữ lớn trên Edge. Chưa kiểm chứng Safari/Firefox. Ý định và
lý do chưa gửi mất khi reload/crash; mở lại phải đọc kết quả hiện tại.

Native picker/upload và form RN trên thiết bị vẫn cần chạy riêng. Bộ kiểm tra
web không thay thế Android/iOS. Public shelf/detail/media và bảy operation còn
planned là bước triển khai tiếp theo; cần giữ điều kiện owner đủ quyền hiện tại
trong public reads. Point/auction/shipping/ledger chưa phải workflow hoàn chỉnh.
