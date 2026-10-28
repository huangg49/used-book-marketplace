# Bắt đầu ở đây — Lật lại trên MongoDB

Cập nhật28/10/2026 theo source tích hợp `7d92012` và các gói Member/review local đang
bàn giao tại [SESSION_STATE](SESSION_STATE.md). Contract **0.59.0** (193operations/30controllers); registry có52
migration MongoDB (đến0040), không suy từ tiền tố file lớn nhất. Migration
PostgreSQL chỉ là lịch sử import. Kiểm SHA/contract thực tế trước khi chạy.
Gate phát hành vẫn theo [READINESS](READINESS.md); source mới không tự đóng gate.
Phạm vi28/10: nhóm **bỏ Forum/Cộng đồng sách** theo [ADR0051](../adr/0051-remove-forum-from-project-scope.md).
FR-F01–FR-F06/AC-44 không còn là backlog; không bỏ chat/wishlist/thông báo/review.
[Cutover máy chủ dự án](LOCAL_MONGO_CUTOVER_2026_09_30.md) đã có; máy mới làm theo
[TEAM_WINDOWS](TEAM_WINDOWS.md), không lấy config/backup của người khác.

## 1. Hiểu đúng bản đang nhận

NestJS dùng MongoDB8 replica set theo [ADR0027](../adr/0027-mongodb-persistence-protocol.md).
Supabase private storage + Sharp phục vụ ảnh. Hai process worker riêng xử lý
media và deadline/transaction qua Mongo; Redis/BullMQ không chạy hai worker này.
RN là Member client ưu tiên, Expo web chia sẻ source. `apps/user-web` React/Vite
là client Member riêng, `apps/admin-web` cho vận hành. Flutter chỉ có màn scaffold,
chưa có API/session hoặc parity với RN.

| Phần | Source đã có | Giới hạn/nghiệm thu còn thiếu |
|---|---|---|
| Auth/session | Login/me/refresh/logout, đăng ký/xác minh/reset bằng link/OTP; shared SessionClient | Sửa profile/email/avatar, quản lý mọi phiên và Admin khóa/mở account chưa đầy đủ |
| Catalog/listing | Request/review, draft/media/revision, gửi duyệt, chỉnh/ẩn/mở/archive; Sale nguyên bộ theo ADR0046 | Merge catalog/banner management và native acceptance toàn hành trình còn thiếu |
| Member web/RN | Search/detail/wishlist, đăng sách, chat/Order, Exchange, auction/inbox, ví; dùng API thật | Export/browser không thay nghiệm thu native; RN phải giữ empty/error và ảnh đúng nguồn |
| Địa chỉ | Sổ địa chỉ và snapshot origin/destination; TP.HCM, Bình Dương, Vũng Tàu theo ADR0039 | Mã demo không là dữ liệu địa giới chính thức hoặc điểm hoạt động thật |
| DirectDelivery | Quote/Order/pay/accept/packaging/shipment/pickup/review; source có receipt/Inspection72h/settlement | READINESS vẫn F2h; chưa có claim/return/adjudication hoàn chỉnh, không tự mở rộng completion |
| Exchange | Proposal/counter/accept/fund/ship/receive/dispute/expiry/settlement, messages/reviews; web/RN thật | Hạn72h riêng và acknowledgement theo ADR0050; dispute resolution/ordinary ViaPoint/funded mutual cancellation chưa đầy đủ |
| Auction/điểm | Intake/inspection/evidence, publish/schedule, bid/Auto/BuyNow, PointOrder/pay/code/handover, claim/return/settlement/incidents | Chỉ các ngoại lệ đã ghi được cấp phạm vi; source không là full acceptance |
| Ví | Ledger/holds/history, topup simulator/VNPay sandbox/IPN/QueryDR/expiry | Chưa có withdrawal/payout production hoặc đối soát rút tiền đầy đủ |
| Review/uy tín | Exchange/DirectOrder/PointOrder Completed, sửa/xóa48h, bảo mật hai chiều, reply chờ duyệt, Staff/Admin, public aggregate; web/RN | [ADR0052](../adr/0052-transaction-reviews-and-reputation.md), [evidence](../features/TRANSACTION_REVIEWS_REPORT.md); không tự mở completion/settlement hoặc native/human gate |
| Việc đang chờ | Web/RN năm nhóm việc từ state thật, link đúng hồ sơ, RN đơn tải tiếp; Staff/Admin duyệt bài/đầu sách | [ADR0053](../adr/0053-state-derived-work-inbox.md), [evidence/phạm vi](../ui/WORK_INBOX_2026_10_28.md); không là tổng nghĩa vụ toàn sản phẩm, các bàn điểm/review vẫn riêng |
| AI | Price assist và autofill ảnh ADR0048; autofill đã nối Member web | Cần cấu hình/hạn mức và kiểm provider/ảnh thật riêng; không suy mock test là live PASS |

[ADR0050](../adr/0050-exchange-inspection-and-existing-obligations.md) sửa deadline
Exchange và quyền nghĩa vụ cũ. GHN/carrier/driver được owner yêu cầu giữ nguyên
chờ nhóm quyết định; không coi các route đó đã được nghiệm thu bảo mật.
Nghiệp vụ chuẩn là [SRS1.1](../SRS_V1_1.md), [phụ lục](../features/LOCAL_HANDOVER_AUCTION.md)
và ADR hiện hành. Checkpoint có ngày trong SESSION_STATE/report là lịch sử nguồn,
không thay contract/code/tests mới hoặc gate.

## 2. Dựng môi trường mới

Node theo `.nvmrc`, pnpm theo `packageManager` trong root `package.json`, Docker
Desktop đang chạy. RN không cần cài Flutter. Đọc
[hướng dẫn RN](../REACT_NATIVE_START.md) và [media setup](../features/SUPABASE_MEDIA_SETUP.md).
Kiểm tra `node --version` và `pnpm --version` trước install; pnpm của repo là
**11.19.0**, không suy ra phiên bản đang chạy chỉ từ dòng `packageManager`.

Từ root:

```sh
pnpm install --frozen-lockfile
pnpm setup:local
```

`setup:local` chỉ tạo file chưa tồn tại và sinh khóa local (JWT, simulator, mật khẩu
MongoDB root/app/migrator dùng chung cho root `.env` và `apps/api/.env`), không ghi đè
`.env` đã có. Nếu port 27017 bận, đặt `MONGO_PORT` ở root `.env` và sửa port trong các
URL `MONGODB_*` ở `apps/api/.env`. Không chép `.env`, database hoặc khóa của người bàn giao.

```sh
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait mongo
pnpm db:bootstrap
pnpm db:migrate
pnpm db:seed
```

`db:bootstrap` tạo user `latlai_app` (quyền tối thiểu) và `latlai_migrator`; API từ chối
khởi động khi còn migration chưa áp dụng. Dữ liệu PostgreSQL cũ chỉ chuyển một lần theo
[runbook cutover](../refactor/MIG06_CUTOVER_RUNBOOK.md).
DB đang có: khi migration thêm collection, chạy `db:migrate` rồi `db:bootstrap`
theo ADR để cập nhật app role, không reset/reseed dữ liệu.

Seed chỉ cho local, không tự đổi mật khẩu account đã tồn tại. Xem tài khoản mẫu ở
[hướng dẫn RN](../REACT_NATIVE_START.md); mật khẩu theo cấu hình local của người nhận.
Không cần seed đơn hàng hoặc sửa số dư SQL để chứng minh backend hoạt động.

Chạy hằng ngày theo [DEVELOPMENT](../DEVELOPMENT.md): hai terminal cho backend
và client phụ trách. `dev:api` bật Mongo/API/media+order worker; không bật worker trùng.

Terminal backend:

```sh
pnpm dev:api
```

Terminal client: chọn `pnpm dev:rn` (A Android, W Expo web), `pnpm dev:user`
(React/Vite user-web5174) hoặc `pnpm dev:admin` (operations5173).
`setup:local` chưa tạo env user-web: tạo từ `.env.example` của app nếu cần,
giữ file có sẵn và thêm đúng origin vào backend `CORS_ORIGINS`.

API `http://localhost:3000/api/v1`; Swagger `http://localhost:3000/docs`;
operations `http://localhost:5173`; RN theo URL Metro in ra. `CORS_ORIGINS` phải
khớp đúng origin trình duyệt, kể cả `localhost` khác `127.0.0.1`.
Sau build/migration cần khởi động lại API và worker cùng phiên bản.

Ảnh cần bucket riêng tư và khóa server Supabase trong `apps/api/.env`; thiếu cấu hình
thì upload báo chưa sẵn sàng. Không đưa server key vào `EXPO_PUBLIC_*`/`VITE_*`.
`pnpm doctor:local` chỉ đọc môi trường/DB/bucket/readiness; không có job tồn không
chứng minh worker đang chạy. Android Emulator dùng `10.0.2.2`, điện thoại dùng LAN
tin cậy; xem [Android QA](../ANDROID_QUALITY.md).

## 3. Tìm đúng nơi để sửa

Các đường dẫn trong bảng tính từ root repo.

| Công việc | Điểm bắt đầu trong code | Tài liệu/kiểm thử liên quan |
|---|---|---|
| Thay request/response | `packages/api-contract/openapi.yaml` rồi `pnpm contract:generate` | `pnpm contract:check`; không sửa tay `src/schema.ts` |
| Phiên/token | `packages/session-client/src/session-client.ts`; `apps/api/src/modules/auth/` | ADR 0003/0019; session tests; `auth.e2e-spec.ts`, `obligations.e2e-spec.ts` |
| Màn hình RN | `apps/mobile-react-native/src/app/` → `src/features/{shelf,account,auth,drafts,addresses}` | [UI rules](../design/UI_CODING_RULES.md), [components](../design/UI_COMPONENTS.md) |
| UI dùng chung | `apps/mobile-react-native/src/core/ui/`; `packages/brand/v1.1/` | `/ui` và `/design` chỉ bật khi `EXPO_PUBLIC_DESIGN_PREVIEW=1`; dữ liệu mẫu không là API |
| Hành trình/điều hướng | Web AccountOverviewPage/MemberGuidePage; RN account/guide; Admin WorkspaceStart | [Bản đồ và checklist nhóm](../ui/JOURNEY_CLARITY_2026_10_28.md), `pnpm test:journeys:browser` |
| Operations | `apps/admin-web/src/features/{review,reviews}/` và `src/core/` | ADR 0010; `apps/admin-web/tests/browser.mjs` |
| User web | `apps/user-web/src/app/router.tsx`, `src/pages/`, `src/services/` | Listing/purchase/auction/inbox/exchange dùng API thật; exchange chat/report còn deferred; review chung đã có. `tests/integration.mjs` và `tests/exchange-integration.mjs` dùng QA riêng |
| Catalog/listing | `apps/api/src/modules/catalog/`, `listings/` | ADR 0005–0006/0009/0011–0012; catalog/listing/media E2E |
| Ảnh listing | `apps/api/src/modules/media/`; `src/media-worker.ts` | ADR 0008; `media.e2e-spec.ts`; tests dùng storage fake có nhãn |
| Địa chỉ/báo giá | `apps/api/src/modules/addresses/`, `quotes/`; listing fulfillment | ADR 0014–0016; addresses/quotes E2E |
| Command/giữ sách | `apps/api/src/modules/commands/`, `reservations/` | ADR 0013/0017; orders/migration/race tests |
| Ví/giữ/hoàn tiền | `apps/api/src/modules/wallet/`; `orders/orders.service.ts` | ADR 0018/0020; wallet/order-payment E2E; `wallet:check` |
| Preparing, ảnh đóng gói, pickup | `orders/`, `shipments/` | ADR 0021–0024; preparation/packaging/shipments/carrier-pickup E2E |
| Delivery overdue | `orders/orders.service.ts`, `order-expiry.service.ts`; `src/order-worker.ts` | ADR 0025; `delivery-overdue.e2e-spec.ts` |
| Purchase chat | `modules/purchases/`, purchase listing projection; user-web ChatPage | Migration0014; giữ24h không là checkout Order; `/purchase-chat` auth riêng |
| Auction/point Order | `modules/auctions/` và migration0008–0013 | ADR0030, auctions.e2e; settlement source không tự đóng READINESS |
| Live/inbox | `auction.gateway.ts`, `auction-live.service.ts`, `modules/notifications/` | ADR0031/32; mutation REST, ceiling private; migration0015 |
| Wishlist/price assist | `modules/wishlist/`, `price-assist/` | Wishlist API/RN; ADR0028/29 và PRICE_ASSIST_REPORT, cờ tắt mặc định |
| Review/uy tín | `modules/reviews/`, migration0040; web `src/features/reviews/`, RN `src/features/reviews/`, Admin `src/features/reviews/` | [ADR0052](../adr/0052-transaction-reviews-and-reputation.md); `transaction-reviews.e2e-spec.ts`, `pnpm test:reviews:browser` (API build + RN export dùng URL QA trước chạy) |
| Schema/DB bất biến | `apps/api/src/database/mongo/` (migrations, `transaction.ts`), `*-invariants`/`check*` trong module, `src/integrity/` | Validator/index/quyền/kiểm lúc commit là một phần logic ([bản đồ](../refactor/MIG02_MODEL_MAP.md)); `prisma/migrations/` chỉ là lịch sử PostgreSQL cho import |

Tên schema/receipt lịch sử có thể vẫn chứa `Unpaid` dù projection hỗ trợ paid Order.
Đọc contract hiện tại; không suy quyền từ tên type và không đổi tên hàng loạt trước bàn giao.

## 4. Các quy tắc không được phá

- Guard đăng nhập là lớp đầu; service phải kiểm tra chủ sở hữu, trạng thái và session
  hiện tại dưới khóa. `ExistingObligation` chỉ cho đúng handler xử lý nghĩa vụ cũ.
- Mutation theo contract có `Idempotency-Key`/`expectedVersion`/receipt; bid/Auto
  kiểm locked state không dùng expectedVersion, mark-read naturally idempotent,
  chat dùng messageId riêng. Mất phản hồi: giữ cùng key/body/version của ý định.
- Dùng shared command executor, thứ tự khóa và transaction đang có. Không viết
  trực tiếp từ controller để bỏ qua các service/trigger. Auth/permission trước replay.
- Quote không giữ sách. LabelCreated không chứng minh đã lấy hàng. Ảnh/báo chưa nhận
  không tự quyết định custody, trả tiền hay mở lại sách để bán.
- Ledger bất biến là nguồn tiền. Giữ nguyên P+S và commitment khi chưa giải quyết
  review. Không gọi nhánh hoàn trước xác nhận sau khi seller đã nhận đơn.
- Simulator chỉ cho TEST_OPERATOR độc lập; nguồn hữu hạn 100M là tiền mô phỏng.
  Không nạp lại bằng SQL. Không dùng Redis hoặc state React làm số dư.
- Không sửa migration đã áp dụng, `db push`, reset DB đang dùng hoặc seed lại mật khẩu.
- Token browser chỉ trong bộ nhớ; native chỉ lưu refresh token ở SecureStore.
  Không thêm kho token thứ hai. Không log request body/ảnh/địa chỉ/token.

## 5. Chạy kiểm thử mà không dùng database của app

Compose **riêng** `infra/docker-compose.mongo-test.yml` chạy replica set QA
`127.0.0.1:57017` (auth, dữ liệu trên tmpfs — khởi động lại là rỗng). Tài khoản
`latlai_qa_root/local_test_only` là credential local-test công khai, không dùng cho môi
trường khác. Mỗi lần chạy E2E xóa và dựng lại database `MONGO_E2E_DATABASE` (mặc định
`latlai_e2e_test`, bắt buộc kết thúc `_test`). Dừng bằng `pnpm infra:mongo:test:stop`.
Compose PostgreSQL test (`infra/docker-compose.test.yml`, port 55434) chỉ còn cần cho
test import PostgreSQL → MongoDB; thiếu `TEST_DATABASE_URL` thì test đó tự bỏ qua.

```sh
pnpm infra:mongo:test:up
pnpm contract:check
pnpm contract:routes
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

PowerShell, trong terminal QA riêng:

```powershell
$oldMongoUrl = $env:MONGO_TEST_URL
try {
  $env:MONGO_TEST_URL = 'mongodb://latlai_qa_root:local_test_only@127.0.0.1:57017/latlai_probe_test?replicaSet=rs-test&authSource=admin'
  pnpm test:api:mongo
  if ($LASTEXITCODE -ne 0) { throw 'MongoDB suite failed' }
  pnpm test:api:e2e
  if ($LASTEXITCODE -ne 0) { throw 'API E2E failed' }
} finally {
  $env:MONGO_TEST_URL = $oldMongoUrl
}
```

Bash/zsh:

```sh
(
  export MONGO_TEST_URL='mongodb://latlai_qa_root:local_test_only@127.0.0.1:57017/latlai_probe_test?replicaSet=rs-test&authSource=admin'
  pnpm test:api:mongo && pnpm test:api:e2e
)
```

Global setup tự bootstrap user và migrate database E2E; không cần `db:migrate` riêng.

Chạy một suite: `pnpm --filter @used-books/api exec vitest run --config vitest.config.e2e.ts test/orders.e2e-spec.ts`.
Không thêm `--` trước file khi gọi script pnpm vì có thể chạy toàn bộ thay vì lọc.
DB phải kết thúc `_test`; mỗi lần chạy xóa database E2E rồi dựng lại, nên không chạy hai
lần cùng lúc với cùng `MONGO_E2E_DATABASE` (chạy song song thì đặt tên khác nhau).

Browser regression dùng API/DB thật và storage fake. Sau API/admin build, trong terminal
có `MONGO_TEST_URL` ở trên (mỗi lần chạy tạo rồi xóa database `ops_browser_*_test` riêng):

```sh
pnpm --filter @used-books/admin-web exec playwright install chromium
pnpm --filter @used-books/admin-web test:browser
```

Để kiểm thử RN web, đặt `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3009/api/v1`
và `EXPO_PUBLIC_DESIGN_PREVIEW=1` trong **môi trường terminal QA** khi chạy
`pnpm --filter @used-books/mobile-react-native export:web`, rồi `pnpm test:public:browser`.
Runner kiểm cả catalog `/ui`, vì vậy bản export này cần bật cờ preview.
Không ghi đè `.env` RN của người đang dùng app.
Runner quản lý fixture API port 3009, ảnh 3010 và web 8087; không chiếm các port đó
bằng process khác. Phải export lại với URL app trước khi dùng bundle cho demo khác.
Web regression không thay kiểm tra native, và fake storage không là bằng chứng Supabase.
Thay biểu tượng launcher/splash: chạy `pnpm brand:app-icons` để sinh PNG từ SVG logo
gốc, rồi build lại APK. Hot reload JS không cập nhật tài nguyên native.

## 6. Demo đúng phần đã có

Chuẩn bị theo [checklist demo](DEMO_CHECKLIST.md), gồm điều kiện ảnh thật, vai trò,
kết quả mong đợi và cách xử lý lỗi mà không bỏ quy tắc nghiệp vụ.

1. RN `/`: kệ thật có thể rỗng; không giả số lượng sách/người dùng để lấp đầy.
2. `/account`: đăng nhập Member → sổ địa chỉ → sách của tôi → tạo nháp, chọn/request
   catalog, upload ảnh, mô tả tình trạng, chọn nơi gửi, lưu/gửi duyệt.
3. Operations: đăng nhập reviewer phù hợp → duyệt catalog/listing; trở lại RN xem sách.
   Quyền Admin/Staff khác nhau, không tự duyệt listing của mình.
4. Có thể demo API Order riêng bằng Swagger và dữ liệu thử, nhưng dừng tại InTransit
   hoặc review ở lane DirectDelivery; không gọi đó là mua hoàn chỉnh. Auction web/
   purchase chat có luồng thật từng phần; completion ViaPoint chưa đóng gate.
   Ví/topup/pickup là mô phỏng; Exchange/register đã có API thật, profile còn giới hạn.
5. Nếu chưa cấu hình storage hoặc catalog chưa duyệt, trình bày đúng trạng thái bị chặn.
   Limiter hiện chặn sau 5 login/account/IP/15 phút, tính cả lần đúng; tránh đăng nhập
   lặp liên tục khi demo team. Không tắt limiter hoặc xóa counters trên DB app để né.

## 7. Việc đầu tiên của người tiếp nhận

Kiểm nhánh/SHA thực tế và [SESSION_STATE](SESSION_STATE.md), rồi nhận nhiệm vụ
cụ thể từ nhóm. [AI_WORKFLOW](../AI_WORKFLOW.md) hướng dẫn cửa vào Codex/Claude,
quy trình theo nhiệm vụ, kiểm tra và cách lưu tiến độ khi nhiều người cùng làm.
[TEAM_WINDOWS](TEAM_WINDOWS.md) là setup cho máy mới.

Chỉ tiếp tục gói đã được giao, dependency đạt và gate cho phép theo
[READINESS](READINESS.md) / [CONTINUATION_PLAN](CONTINUATION_PLAN.md). Không tự mở
Delivered/Buyer receipt/inspection/settlement vì main đã merge. Phần review dùng
[INDEPENDENT_REVIEW](INDEPENDENT_REVIEW.md) và [TEAMWORK](../TEAMWORK.md);
AI review không thay người review độc lập.

Bundle, nhánh handoff-roadmap và checkpoint ngày 28–29/09 là nguồn lịch sử dự phòng,
không phải hướng dẫn clone runtime hiện tại. Tra [SESSION_HISTORY](SESSION_HISTORY_2026_09_30.md)
nếu thật sự cần phục hồi một mốc cũ. Không khởi động lại toàn bộ native acceptance
khi không đổi code liên quan; dùng evidence và trạng thái gate hiện hành.
