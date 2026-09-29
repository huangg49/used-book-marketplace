# Bắt đầu ở đây — Lật lại trên MongoDB

Cập nhật30/09/2026: main đã tích hợp MongoDB, contract **0.21.0**,3 migration MongoDB;
17 migration PostgreSQL là lịch sử chỉ đọc phục vụ import. Giao dịch giữ phạm vi F2h.
[Cutover máy chủ dự án](LOCAL_MONGO_CUTOVER_2026_09_30.md) đã xong; teammate dùng
database riêng theo [TEAM_WINDOWS](TEAM_WINDOWS.md), không lấy config/backup của máy này.

Việc đang làm ở [SESSION_STATE](SESSION_STATE.md), gate phát hành ở [READINESS](READINESS.md).
Mốc PostgreSQL/checkpoint28/09 và [REBUILD](REBUILD.md) là bằng chứng lịch sử, không
phải hướng dẫn runtime hiện tại. Dùng [prompt tiếp nhận](NEXT_SESSION_PROMPT.md)
nếu nối tiếp công việc bằng agent. Main đã merge không đồng nghĩa full native/review đạt.

## 1. Hiểu đúng bản đang nhận

React Native là client Member ưu tiên. Operations web phục vụ duyệt catalog/listing.
Flutter còn là khung riêng, không có tính năng ngang RN. API dùng chung NestJS và
MongoDB 8 (replica set, [ADR 0027](../adr/0027-mongodb-persistence-protocol.md); đã
chuyển từ PostgreSQL theo [kế hoạch](../refactor/MONGODB_PLAN.md)); ảnh riêng tư dùng
Supabase Storage, xử lý bằng Sharp. Hai worker hiện tại chạy thành process riêng và
dùng hàng đợi/trạng thái bền vững trong MongoDB.
Redis/BullMQ có dependency/hạ tầng nhưng không là nguồn số dư hoặc bộ chạy hai worker này.

| Phần | Đã có | Chưa có ở mốc này |
|---|---|---|
| Phiên đăng nhập | Login/profile/refresh/logout; RN và web dùng chung session client | Đăng ký, xác minh email, quên mật khẩu, quản lý mọi phiên |
| Catalog/listing | Catalog request/review; nháp, ảnh, gửi duyệt, sửa bài duyệt, ẩn/mở/lưu trữ, gỡ bởi reviewer; RN và operations có màn hình | Native acceptance đầy đủ cho picker/upload và toàn hành trình |
| Kệ công khai | RN tìm/lọc/phân trang, chi tiết, ảnh bản sách thật từ API | Mua/đổi từ màn hình |
| Địa chỉ/nơi gửi | Sổ địa chỉ RN/API, origin gắn revision, vùng HCM-DEMO-v1 | Vùng địa lý thật, điểm giao hoạt động thật |
| Order DirectDelivery | Báo giá → giữ sách → thanh toán → seller nhận đơn → ảnh đóng gói/vận đơn → pickup/InTransit | Checkout, ví, Order/shipment UI |
| Tiền/ngoại lệ | Ví/nạp mô phỏng, giữ P+S; hủy/hoàn trước seller nhận; review quá hạn pickup/giao và báo chưa nhận | Trả người bán, rút tiền, xử lý kết thúc review/tranh chấp, nhận hàng/kiểm tra 72h |
| Exchange/ViaPoint/auction | Yêu cầu và thiết kế đã chốt | Workflow/API/client triển khai |

Phạm vi nghiệp vụ chuẩn: [SRS 1.1](../SRS_V1_1.md) và
[phụ lục TP.HCM](../features/LOCAL_HANDOVER_AUCTION.md). Tài liệu yêu cầu mô tả đích
đến, không chứng minh tính năng đã có. Giữ nguyên các snapshot v1.0.

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

Seed chỉ cho local, không tự đổi mật khẩu account đã tồn tại. Xem tài khoản mẫu ở
[hướng dẫn RN](../REACT_NATIVE_START.md); mật khẩu theo cấu hình local của người nhận.
Không cần seed đơn hàng hoặc sửa số dư SQL để chứng minh backend hoạt động.

Mở terminal riêng cho mỗi lệnh:

```sh
pnpm dev:api
pnpm dev:media
pnpm dev:orders
pnpm dev:rn
pnpm dev:admin
```

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
| Operations | `apps/admin-web/src/features/review/` và `src/core/` | ADR 0010; `apps/admin-web/tests/browser.mjs` |
| Catalog/listing | `apps/api/src/modules/catalog/`, `listings/` | ADR 0005–0006/0009/0011–0012; catalog/listing/media E2E |
| Ảnh listing | `apps/api/src/modules/media/`; `src/media-worker.ts` | ADR 0008; `media.e2e-spec.ts`; tests dùng storage fake có nhãn |
| Địa chỉ/báo giá | `apps/api/src/modules/addresses/`, `quotes/`; listing fulfillment | ADR 0014–0016; addresses/quotes E2E |
| Command/giữ sách | `apps/api/src/modules/commands/`, `reservations/` | ADR 0013/0017; orders/migration/race tests |
| Ví/giữ/hoàn tiền | `apps/api/src/modules/wallet/`; `orders/orders.service.ts` | ADR 0018/0020; wallet/order-payment E2E; `wallet:check` |
| Preparing, ảnh đóng gói, pickup | `orders/`, `shipments/` | ADR 0021–0024; preparation/packaging/shipments/carrier-pickup E2E |
| Delivery overdue | `orders/orders.service.ts`, `order-expiry.service.ts`; `src/order-worker.ts` | ADR 0025; `delivery-overdue.e2e-spec.ts` |
| Schema/DB bất biến | `apps/api/src/database/mongo/` (migrations, `transaction.ts`), `*-invariants`/`check*` trong module, `src/integrity/` | Validator/index/quyền/kiểm lúc commit là một phần logic ([bản đồ](../refactor/MIG02_MODEL_MAP.md)); `prisma/migrations/` chỉ là lịch sử PostgreSQL cho import |

Tên schema/receipt lịch sử có thể vẫn chứa `Unpaid` dù projection hỗ trợ paid Order.
Đọc contract hiện tại; không suy quyền từ tên type và không đổi tên hàng loạt trước bàn giao.

## 4. Các quy tắc không được phá

- Guard đăng nhập là lớp đầu; service phải kiểm tra chủ sở hữu, trạng thái và session
  hiện tại dưới khóa. `ExistingObligation` chỉ cho đúng handler xử lý nghĩa vụ cũ.
- Mutation có `expectedVersion` và `Idempotency-Key`. Mất phản hồi: retry cùng
  key/body; không tự đổi version để ép thành công. Receipt là kết quả lịch sử.
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
   hoặc review; không gọi đó là mua sách hoàn chỉnh. Ví/topup/pickup đều là mô phỏng.
5. Nếu chưa cấu hình storage hoặc catalog chưa duyệt, trình bày đúng trạng thái bị chặn.
   Limiter hiện chặn sau 5 login/account/IP/15 phút, tính cả lần đúng; tránh đăng nhập
   lặp liên tục khi demo team. Không tắt limiter hoặc xóa counters trên DB app để né.

## 7. Việc đầu tiên của người tiếp nhận

**Nguồn hiện hành sau merge 29/09:** `main` tại `ca16a22` đã chứa lượt teammate
A00/U02–U06 và Q01 một phần. [SESSION_STATE](SESSION_STATE.md) có điểm lưu
mới nhất; [Q01 Pixel_7](Q01_NATIVE_COMPLETION_2026_09_29.md) bổ sung WebP/Back
và chữ lớn. Các nhánh/bundle 28/09 mô tả bên dưới là lịch sử dự phòng;
không lấy chúng thay nguồn main mới hoặc chạy lại gate đã đóng.

Đọc [READINESS](READINESS.md), tiếp tục việc chưa đóng đầu tiên; **chưa mở F2i**.
Gói tiếp nhận mới nhất trên nhánh `codex/handoff-roadmap`, tiếp nối
`codex/shelf-detail-showcase` (`3808b57`). Đọc [điểm lưu](SESSION_STATE.md),
[kế hoạch tiếp tục](CONTINUATION_PLAN.md), [vòng kệ/chi tiết](SHELF_DETAIL_REVIEW.md),
[vòng cải thiện mobile](MOBILE_EXPERIENCE.md)
và [bằng chứng native từng ca](NATIVE_RUN_2026_09_28.md). Bundle local:
`.tmp/latlai-handoff-roadmap.bundle` (checksum `.sha256` bên cạnh). Người nhận:
`git clone --branch codex/handoff-roadmap ./latlai-handoff-roadmap.bundle latlai`.
Không kèm `.env`, DB hoặc APK; các bundle/checkpoint trước giữ nguyên. Đây chưa là
release đã nghiệm thu native. Chủ dự án yêu cầu tích hợp mốc bàn giao vào main;
khi nhận qua GitHub, clone main và xác minh SHA bằng `git ls-remote` theo SESSION_STATE.
Bundle trên là bản dự phòng của mốc roadmap trước lần tích hợp này; dùng GitHub main
để nhận prompt cuốn chiếu và [hướng dẫn env](ENV_HANDOFF.md) mới nhất.

Nguồn F2h và lát cắt UI đã có checkpoint `beea372`. Không làm lại những gate đã có
bằng chứng nếu code liên quan không đổi. Chia việc còn lại theo vai trò:

| Người tiếp nhận | Việc tiếp tục | Kết quả cần ghi |
|---|---|---|
| RN + QA | Tiếp tục ca còn mở trong [vòng Android 28/09](NATIVE_RUN_2026_09_28.md), theo [21 ca native](NATIVE_ACCEPTANCE.md); session và JPEG đã có bằng chứng | Còn upload lỗi/mất mạng, background, listing đầy đủ, TalkBack và bàn phím/chữ lớn; không thay bằng web |
| Operations + QA | Queue/detail/retry/conflict/keyboard đã hoàn tất trên nhánh `codex/operations-ui-qa`; đọc [bằng chứng](OPERATIONS_UI_QA.md), review để tích hợp | Ba lỗi UI đã sửa; chỉ lặp suite khi có thay đổi liên quan |
| API reviewer | Dùng [gói review R01–R09](INDEPENDENT_REVIEW.md): entry point, invariant, test và phiếu nhận xét | Nhận xét hoặc xác nhận review, reviewer thứ hai cho phần tiền/quyền theo TEAMWORK |
| Người đóng mốc | Kiểm tra báo cáo clone sạch, còn gì chưa nghiệm thu; quyết định release/PR theo workflow team | Commit/tag rõ ràng; chỉ nói remote đã có khi đã push thật |

Khi các gate bàn giao đã đóng, bước nghiệp vụ kế tiếp mới là Delivered/Buyer receipt/
Inspection 72h và claim tương ứng theo [transaction plan](../features/TRANSACTION_FOUNDATION_PLAN.md).
Một người review code/SQL độc lập theo [TEAMWORK](../TEAMWORK.md); không coi AI tự
chạy test là đã có human review bắt buộc cho tiền/quyền/tranh chấp.
