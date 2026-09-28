# Gói review độc lập trước bàn giao F2h

28/09/2026 · **Chưa có người review ký nhận.** Tài liệu này tập hợp đường đọc,
câu hỏi cần trả lời và mẫu kết luận; không là review độc lập của tác giả.
Quy tắc người review ở [TEAMWORK](../TEAMWORK.md): owner review implementation;
cần reviewer thứ hai cho wallet, settlement, permissions và disputes.
Team tự điền tên, không mặc định người tạo báo cáo là reviewer độc lập.

## Nguồn và ranh giới

- Target ứng dụng: `76230ca09e94df69157845717e4d89d49b4641a0`.
  Baseline F2h lưu ở `beea372`, hồ sơ clone sạch ở `793eb72`; cả ba nằm trong
  lịch sử nhánh `codex/handoff-acceptance-pack`.
- `76230ca` chỉ sửa operations: nhãn hai giá, skip link, focus recovery và test.
  Reviewer cần đọc cả baseline backend, không chỉ diff UI của commit cuối.
- Contract [OpenAPI](../../packages/api-contract/openapi.yaml) 0.20.0,
  [17 migration](../../apps/api/prisma/migrations), scope [START_HERE](START_HERE.md).
  Delivered/inspection/settlement-to-Seller/claim resolution chưa triển khai.
- [AUDIT_F2H](AUDIT_F2H.md), [REBUILD](REBUILD.md) và
  [OPERATIONS_UI_QA](OPERATIONS_UI_QA.md) là bằng chứng tự kiểm để tham khảo.
  Số test PASS không thay việc reviewer đọc invariant và chỉ ra rủi ro còn lại.

## Đường đọc theo rủi ro

Các đường dẫn là entry point; reviewer theo tiếp dependency/caller/migration
liên quan. Với mỗi hàng, ghi file/hàm đã đọc, cách kiểm chứng và nhận xét.

| ID | Entry point | Câu hỏi bắt buộc đối chiếu | Test tham chiếu |
|---|---|---|---|
| R01 | [auth guard](../../apps/api/src/modules/auth/auth.guard.ts), [roles guard](../../apps/api/src/modules/auth/roles.guard.ts), [obligation decorator](../../apps/api/src/modules/auth/obligations.decorator.ts), [auth service](../../apps/api/src/modules/auth/auth.service.ts) | LOCKED bị từ chối mặc định? ExistingObligation chỉ ở method đã duyệt và service còn kiểm ownership/state? Refresh/revoke/login/role change có đúng thứ tự khóa? Replay phải kiểm quyền hiện tại | [auth](../../apps/api/test/auth.e2e-spec.ts), [obligations](../../apps/api/test/obligations.e2e-spec.ts) |
| R02 | [command executor](../../apps/api/src/modules/commands/command.service.ts), [contract input](../../apps/api/src/modules/commands/contract-input.service.ts) | Key/body hash có phân biệt actor/operation? Auth trước receipt, concurrent same-key không ghi hai lần? Mutation/receipt/audit/outbox cùng transaction? DB time lấy sau khóa? | [catalog/drafts](../../apps/api/test/catalog-drafts.e2e-spec.ts), [orders](../../apps/api/test/orders.e2e-spec.ts) |
| R03 | [commitment policy](../../apps/api/src/modules/listings/listing-commitment-policy.service.ts), [reservations](../../apps/api/src/modules/reservations/reservations.service.ts), [Orders](../../apps/api/src/modules/orders/orders.service.ts) | Một sách chỉ có một workflow độc quyền? Reserved không thể tồn tại thiếu workflow? Version ownership/commitment khác Order version sau funding được xử lý đúng? Expiry không tự thả sách đang hold/review? | [Order migration](../../apps/api/test/order-migration.e2e-spec.ts), [orders](../../apps/api/test/orders.e2e-spec.ts), [listing schema](../../apps/api/test/listing-schema.e2e-spec.ts) |
| R04 | [ledger](../../apps/api/src/modules/wallet/ledger.service.ts), [wallet](../../apps/api/src/modules/wallet/wallet.service.ts), [simulator](../../apps/api/src/modules/wallet/payment-simulator.ts) | Số dư chỉ từ immutable entries? Nguồn mô phỏng 100M hữu hạn, không là incident fund? Operator độc lập, chữ ký/dedupe đúng, ReviewRequired sticky? Không có đường tự nạp/sửa SQL | [wallet](../../apps/api/test/wallet.e2e-spec.ts), [wallet migration](../../apps/api/test/wallet-migration.e2e-spec.ts) |
| R05 | [Orders payment/refund/accept](../../apps/api/src/modules/orders/orders.service.ts), [expiry worker](../../apps/api/src/modules/orders/order-expiry.service.ts) | Hold frozen P+S đúng một lần? Refund failure giữ tiền/sách; posting+release atomic? Chỉ pre-acceptance dùng full-refund; Seller acceptance chặn đường refund cũ? Worker retry bounded, không đổi trạng thái trước commit? | [payment](../../apps/api/test/order-payment.e2e-spec.ts), [payment migration](../../apps/api/test/order-payment-migration.e2e-spec.ts), [preparation](../../apps/api/test/order-preparation.e2e-spec.ts) |
| R06 | [packaging evidence](../../apps/api/src/modules/orders/packaging-evidence.service.ts), [shipment](../../apps/api/src/modules/shipments/shipments.service.ts), [carrier adapter](../../apps/api/src/modules/shipments/carrier-simulator.ts) | Label không chứng minh custody; ảnh được seal, contact/fee snapshot đúng? Auth kiểm lại sau storage I/O? Pickup operator độc lập, replay ở cap, late/conflict giữ canonical event/hold, deadline 240h pinned? | [packaging](../../apps/api/test/packaging-evidence.e2e-spec.ts), [shipments](../../apps/api/test/shipments.e2e-spec.ts), [pickup](../../apps/api/test/carrier-pickup.e2e-spec.ts) |
| R07 | [Order review intake](../../apps/api/src/modules/orders/orders.service.ts), [delivery expiry](../../apps/api/src/modules/orders/order-expiry.service.ts) | Buyer và worker cùng một review; Buyer chỉ một report; deadline từ Applied pickup? Evidence trên review không tăng version/đổi identity; không refund/restock/kết luận custody từ report? | [delivery overdue](../../apps/api/test/delivery-overdue.e2e-spec.ts) |
| R08 | [migrations](../../apps/api/prisma/migrations), [Prisma schema](../../apps/api/prisma/schema.prisma), [wallet check](../../apps/api/src/wallet-check.ts) | Trigger/check/FK vẫn bảo vệ raw SQL, old rows và upgrade? Prisma không thay thế invariant SQL? Reconciliation read-only, không tự refill hoặc che sai lệch? | Các migration suite ở R03–R05, [quote migration](../../apps/api/test/quote-migration.e2e-spec.ts), [fulfillment migration](../../apps/api/test/fulfillment-migration.e2e-spec.ts) |
| R09 | [shared session](../../packages/session-client/src), [RN session owner](../../apps/mobile-react-native/src/core/session/session-provider.tsx), [native storage](../../apps/mobile-react-native/src/core/session/token-storage.ts), [operations decision](../../apps/admin-web/src/features/review/decision-form.tsx) | Race login/logout/storage đã xử lý cả lỗi? Không giữ access token lâu dài? Đổi user xóa cache; lost-ack retry giữ body/key; focus mới không làm gửi mutation tự động? | Session unit, [operations browser](../../apps/admin-web/tests/browser.mjs), [RN browser](../../scripts/test-public-shelf.mjs) |

Đọc ADR 0013, 0017–0025 và các báo cáo feature được trỏ từ START_HERE khi đánh giá
R03–R08. Không áp quy tắc nghiệp vụ dự kiến của ViaPoint/auction vào API chưa có.
Hai managed points mô phỏng và carrier/topup simulator không là tích hợp đời thật.

## Cách kiểm chứng một phát hiện

1. Ghi invariant bị vi phạm, trạng thái đầu, actor và chuỗi lệnh tối thiểu.
2. Chạy test liên quan trên DB riêng có hậu tố `_test` theo START_HERE. Không dùng
   shared app DB; không chạy hai suite đồng thời trên cùng DB khi chúng sửa fixture.
3. Với race, dùng barrier và kiểm trạng thái cuối/ledger/receipt, không dùng sleep
   hoặc chỉ đếm status HTTP. Với auth, kiểm cả actor sai/quyền mới bị mất trước replay.
4. Nếu cần sửa contract/schema, tuân thủ contract-first và migration mới được review;
   không sửa lịch sử migration hoặc xóa assert để làm test qua.
5. Sau fix chạy focused regression rồi các gate bị ảnh hưởng. Ghi commit fix và
   reviewer kiểm lại; không bắt chạy lại gate đã đóng nếu không có liên quan.

Ví dụ lệnh đọc source và chạy focused test (đã cấu hình môi trường QA):

```sh
git show --stat 76230ca
pnpm --filter @used-books/api exec vitest run --config vitest.config.e2e.ts test/order-payment.e2e-spec.ts
```

Không thêm `--` trước tên file khi gọi script pnpm, tránh vô tình chạy toàn suite.
Không đưa `.env`, dump DB, signed URL hoặc body chứa PII vào nhận xét.

## Phiếu review cần điền

```text
Target commit / baseline đã đối chiếu:
Reviewer owner / reviewer thứ hai / ngày:
R01..R09: mỗi ID ghi files/functions đã đọc | invariant | kiểm chứng | kết luận
Phát hiện: ID | mức độ | file/hàm | bước tái hiện | ảnh hưởng | đề xuất
Fix commit / test sau fix / reviewer đã kiểm lại:
Giới hạn chưa review / việc cần tiếp tục:
Kết luận từng reviewer: cần sửa / chấp nhận phạm vi (kèm lý do)
```

Hiện trạng: R01–R09 **NOT_REVIEWED độc lập**. Chưa có nhận xét/ký nhận từ người
ngoài tác giả. Agent không tự điền tên reviewer hoặc gửi lời mời thay người dùng.
Sau khi có báo cáo, link từ [READINESS](READINESS.md). Review này không đóng gate
[native](NATIVE_ACCEPTANCE.md); native PASS cũng không thay review tiền/quyền.
