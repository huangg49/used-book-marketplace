# Lật lại API

NestJS modular monolith dùng chung cho RN/Expo web, user-web React/Vite, admin
và Flutter tương lai. Runtime MongoDB replica set, OpenAPI0.30.0/15 migration
tại main `da59199` (09/10/2026). Contract/type/endpoint đầy đủ:
[inventory](../../docs/handoff/PROJECT_CONTEXT_INVENTORY.md).

## Bắt đầu và chạy

Máy mới làm theo [START_HERE](../../docs/handoff/START_HERE.md),
[TEAM_WINDOWS](../../docs/handoff/TEAM_WINDOWS.md) và [DEVELOPMENT](../../docs/DEVELOPMENT.md).
Node>=24.15.0/pnpm11.19.0; install frozen lockfile, setup env còn thiếu, Mongo
replica set, bootstrap/migrate/seed có chủ đích. `setup:local` không ghi đè env.
Máy đang có dữ liệu không reset/reseed để ép API chạy. Migration thêm collection
cần bootstrap cập nhật role theo ADR; không sửa migration/checksum đã áp dụng.

Chạy từ root `pnpm dev:api`: launcher khởi động API, media worker và order worker
sau readiness; không chạy migration/seed ngầm. Không bật worker trùng.
API `http://localhost:3000/api/v1`, Swagger `/docs`, health `/api/v1/health`,
readiness `/api/v1/health/ready`. CORS khớp origin thực (admin5173, user-web5174,
Expo origin); `localhost` và `127.0.0.1` khác nhau.

Supabase private storage cần cấu hình backend theo [media setup](../../docs/features/SUPABASE_MEDIA_SETUP.md).
Thiếu storage, uploads fail closed; key không đưa vào VITE/EXPO_PUBLIC.
Worker entrypoints `src/media-worker.ts`, `src/order-worker.ts` (Order, purchase
expiry, auction/point-order deadlines). Sau đổi worker/config cần restart đúng
process cùng source. Không dùng Prisma/db:generate/SQL runtime từ hướng dẫn cũ.

## Phạm vi

- Catalog/listing/revision/media/review/shelf, address/origin/quote và wishlist.
- DirectDelivery tới F2h: unpaid/payment/seller acceptance/packaging/label/
  independent pickup/InTransit/overdue review; không là completed purchase.
- Simulated wallet/topup/ledger, read-only reconciliation; chưa withdrawal đầy đủ.
- Purchase conversations giữ listing24h và participant chat qua `/purchase-chat`;
  không tạo Order/payment/hold/settlement.
- Auction/point intake, slot/Staff, proxy bid/BuyNow/close/pay/report/code/handover;
  source có inspection claim/return/settlement, chưa có evidence đóng release gate.
- `/auctions` Socket.IO public read-only và durable auction inbox; các mutation
  auction vẫn qua REST. Price assist/online lookup tắt mặc định, eval/provider còn gap.
- Register/reset/admin lock workflows, Exchange/forum và nhiều operations UI
  còn thiếu; không suy từ SRS hoặc mock UI là backend đã hiện thực.

## Quy tắc và kiểm tra

Global auth mặc định, `@Public` có chủ ý, `@Roles` theo role; service vẫn kiểm
owner/participant/eligibility/state và auth hiện tại trước replay. LOCKED chỉ
qua handler ExistingObligation đúng scope; gateway kiểm auth riêng.
Cross-module writes qua services trong command transaction, giữ lock order/
server clock/key/body/version/receipt. Bid không có expectedVersion: theo contract.
Ledger immutable, hold/commitment không release khi chưa có kết luận hợp lệ.

Đọc [ADR0027](../../docs/adr/0027-mongodb-persistence-protocol.md),
[model map](../../docs/refactor/MIG02_MODEL_MAP.md),
[DOMAIN_RULES](../../docs/architecture/DOMAIN_RULES.md) và
[READINESS](../../docs/handoff/READINESS.md). Không bỏ gate vì code đã merge.

Checks theo diff trong [AI_WORKFLOW](../../docs/AI_WORKFLOW.md): contract check/
routes, API lint/typecheck/test/build, E2E liên quan; Mongo suite khi schema/
invariant đổi, negative/replay/race khi quyền/tiền/session ảnh hưởng.
QA replica set và database `*_test` riêng theo START_HERE; không DB/bucket local
chính. Storage fake, native và human review là các evidence khác nhau.

## Lịch sử

Các chỉ dẫn PostgreSQL/Prisma và số operation theo increment cũ được chuyển sang
[README_HISTORY](README_HISTORY_2026_10_09.md); dùng để truy vết, không để setup
runtime hiện hành. Các feature report/ADR giữ bằng chứng đúng source/ngày.
