# Architecture

Phạm vi cập nhật28/10/2026: Forum/Cộng đồng sách đã bị nhóm loại khỏi dự án theo
[ADR0051](../adr/0051-remove-forum-from-project-scope.md), không phải workflow chờ
triển khai. Inventory09/10 bên dưới giữ mốc lịch sử; xem START_HERE/SESSION_STATE
cho implementation hiện hành của các miền khác.

Cập nhật09/10/2026 theo main `da59199`. Modular monolith NestJS dùng chung API
cho RN/Expo web, React/Vite user-web và admin; Flutter hiện là scaffold.
Yêu cầu mục tiêu: [SRS1.1](../SRS_V1_1.md) và [phụ lục TP.HCM](../features/LOCAL_HANDOVER_AUCTION.md).
Code tồn tại không chứng minh mọi yêu cầu đã được nghiệm thu; gate ở [READINESS](../handoff/READINESS.md).

## Persistence và ranh giới

- MongoDB replica set là runtime; official driver theo [ADR0027](../adr/0027-mongodb-persistence-protocol.md).
  PostgreSQL schema/migrations là lịch sử chỉ đọc cho import, không là runtime API.
- Business code ở `apps/api/src/modules/<feature>`. Cross-module mutation qua explicit
  service trong shared command transaction, auth hiện tại trước replay; giữ lock order,
  decision clock, idempotency/receipt và commit-time checks theo [model map](../refactor/MIG02_MODEL_MAP.md).
- Ledger immutable là nguồn tiền. Booking/commitment/slot phải có chủ workflow;
  không suy custody hoặc cho restock/refund từ label, ảnh hoặc report.
- Supabase private storage chứa ảnh; Mongo giữ metadata/quyền/budget/jobs.
  Media worker riêng xử lý ảnh listing bằng Sharp; packaging pipeline có quy tắc riêng.
- Order worker riêng chạy Order expiry, purchase conversation expiry và auction/
  point-order sweep. API không tự thay worker; launcher `dev:api` quản lý cả hai.
- Redis/BullMQ có dependency/hạ tầng, không là nguồn số dư hoặc engine hai worker hiện tại.

## Code map hiện hành

| Miền | Source | Phạm vi |
| --- | --- | --- |
| Auth/users | `modules/auth`, `users`, `packages/session-client` | Session/guards/profile/user directory; chưa register/reset/lock-unlock đầy đủ |
| Catalog/listing/media | `modules/catalog`, `listings`, `media` | Draft/revision/photos/submit/review/public reads/lifecycle |
| Địa chỉ/quote | `modules/addresses`, `quotes` | Address revisions, demo geography, frozen estimate; quote không giữ sách |
| Commitment/command | `modules/reservations`, `commands` | Shared transaction/locks/receipt/auth/invariant |
| DirectDelivery | `modules/orders`, `shipments`, `wallet` | Funding/accept/packaging/label/pickup/InTransit/overdue review tới F2h |
| Wishlist/price | `modules/wishlist`, `price-assist` | Wishlist thật; advisory price/lookup phía server dưới cờ, eval/provider còn gap |
| Purchase chat | `modules/purchases` | Sale/Both giữ24h + participant messages/socket; không tạo Order hoặc hold |
| Auction/point Order | `modules/auctions` | Intake/Staff/slot/proxy bid/close/pay/report/code/handover, claim/return/settlement source |
| Inbox | `modules/notifications` | Durable auction events/read-unread; chưa email/wishlist matching |

Danh sách API/migrations/collections/test: [inventory source](../handoff/PROJECT_CONTEXT_INVENTORY.md).
Không có backend Exchange/forum/full review/withdrawal workflow trong inventory hiện tại.

## Lane giao dịch và gate

DirectDelivery vẫn dừng tại F2h: overdue/non-receipt tạo hồ sơ review và giữ hold/
commitment, không phải kết luận tranh chấp hoặc quyết toán cho seller.
ViaPoint auction có source inspection/claim/return và automatic settlement sau
inspection window. READINESS vẫn chưa có evidence đóng gate cho lane này.
Không mô tả nó là chưa code hoặc đã release; cần review độc lập và quyền gói
khi thay đổi/mở rộng, không tự nới gate cho khớp implementation.

## Realtime và client

[ADR0031](../adr/0031-live-auction-updates.md): `/auctions` public read-only Socket.IO;
REST command giữ quyền/bid/Auto/payment. Nudge sau commit + watcher version poll
bắt thay đổi từ worker. [ADR0032](../adr/0032-member-notification-inbox.md) bổ sung
inbox ghi cùng transaction. `/purchase-chat` là gateway authenticated riêng.
Không áp HTTP guards thay cho gateway/service authorization.

RN: route `src/app` compose `src/features`; `src/core` giữ transport/session/UI.
TanStack Query quản lý server state. Expo web chia sẻ RN features; `apps/user-web`
React/Vite riêng đã có trên main và có feature/mock khác RN. Admin có review/user
directory thật, dashboard mẫu. Flutter chỉ có `lib/main.dart` scaffold.
SessionClient dùng chung RN/user-web/admin: browser memory-only, native chỉ lưu
refresh token ở SecureStore. Không tạo token store/API riêng cho một client.

Setup tại [DEVELOPMENT](../DEVELOPMENT.md), chi tiết invariant tại
[DOMAIN_RULES](DOMAIN_RULES.md); chọn task và source thực tế trước sửa.
