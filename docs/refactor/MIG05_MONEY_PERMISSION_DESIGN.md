# MIG-05 — Thiết kế tiền/quyền trên MongoDB (bản cần review trước khi port)

29/09/2026, nhánh `codex/mongodb-refactor`. Kế hoạch yêu cầu "review tiền/quyền"
trước MIG-05. Tài liệu này là gói review đó. **29/09/2026: chủ dự án duyệt trong phiên
làm việc ("approved, go ahead with MIG-05 after MIG-04")**; đây là phê duyệt của chủ dự
án, không phải review độc lập về bảo mật/kế toán. Không đổi
nghiệp vụ F2h/OpenAPI 0.20.0. Nền: [ADR 0027](../adr/0027-mongodb-persistence-protocol.md),
[bản đồ backstop](MIG02_MODEL_MAP.md).

## 1. Sổ cái (ADR 0018/0020)

| Bất biến | PostgreSQL | MongoDB đề xuất |
|---|---|---|
| Số dư chỉ từ entry bất biến | `ledger_entries` + trigger immutable | `ledger_entries` appendOnly (app không update/delete được, đã test quyền); số dư = `$group` tổng debit−credit theo `accountId` trong cùng transaction |
| Journal cân, đúng 2 entry, một phía dương | constraint trigger `latlai_check_journal` | V cho từng entry; C `checkJournal` (đếm 2, tổng 0, đúng tài khoản/số tiền theo loại journal) chạy trước commit |
| Không âm (trừ SimulatorCapital) | kiểm trong trigger journal | W: khóa `account_locks` của mọi tài khoản trong journal (thứ tự id) trước khi đọc số dư; C kiểm lại số dư sau khi ghi |
| Không mint, bảo toàn 100M | trigger + `wallet:check` | Journal mở đầu cố định (0002); C chỉ cho phép loại journal đã biết; công cụ đối soát Mongo thay `wallet:check` |
| Thứ tự posting ổn định | sequence bigint | `counters.ledger_journal_sequence` tăng trong transaction; do đã khóa tài khoản nên thứ tự = thứ tự commit trên cùng tài khoản; unique index `sequence` |
| Tài khoản hold theo Order | upsert + FOR UPDATE | insert-if-absent (bắt 11000 → đọc lại) vì collection appendOnly; khóa `account_locks/<id>` |

**Rủi ro cần quyết định**: mọi topup đều ghi có từ tài khoản SimulatorClearing, nên mọi
topup tranh cùng một `account_locks` document. PostgreSQL xếp hàng; MongoDB abort+retry
trong ngân sách 5 s. Ở tải demo không đáng kể; đề xuất thêm test 20 topup đồng thời,
ghi p95 và số 503. Nếu vượt ngưỡng, phương án (chưa chọn): hàng đợi worker ghi sổ
thay vì ghi đồng bộ.

## 2. Giữ sách (commitment, ADR 0013/0017)

- `exclusive_commitments` partial unique index (status Active) là backstop DB, giống
  PostgreSQL. `listings.trade` = Reserved ⇔ có commitment Active: C `checkListing`
  (đã port) + `checkOrder`.
- Tạo Order: khóa buyer+seller (executor), khóa catalog → listing → revision → địa chỉ
  (thứ tự như PostgreSQL), đọc giờ quyết định sau khóa, chèn order/context/item/agreement/
  commitment/event + receipt/audit/outbox; C `checkOrder` (port `latlai_check_order` và
  các hàm con: funding, preparation, pickup, delivery review, shipment, packaging).
- Hoàn tiền thất bại phải giữ tiền và sách: worker refund chỉ release commitment trong
  cùng transaction với journal OrderRefund và hold về 0 (như `closeRefunded`).

## 3. Quyền và principal

- LOCKED chỉ qua danh sách thao tác nghĩa vụ cũ (đã có trong executor, test ở MIG-03).
- Principal hệ thống: `system:OrderExpiry|OrderConfirmationExpiry|OrderRefund|
  OrderPickupExpiry|OrderDeliveryExpiry`, V buộc cặp actor/operation và contextId.
- Carrier event: định danh toàn cục theo event id (khóa `CarrierSimulator` + key), quyền
  hiện hành của TEST_OPERATOR được kiểm trước replay; operator không được là người mua/bán.
- Payment simulator: chữ ký domain-separated giữ nguyên; event id toàn cục.

## 4. Worker

- Claim theo lô bằng transaction + điều kiện trạng thái (không có SKIP LOCKED): hai
  worker cùng chọn một order thì một bên xung đột, retry, chọn order kế tiếp. Nghĩa vụ
  (hạn thanh toán/xác nhận/lấy hàng/giao) được quyết định bằng `$$NOW` sau khóa, không
  bằng TTL index. Log metric như hiện tại (deliveryRemaining, openDeliveryReviews…).
- Idempotency worker: key = orderId với principal hệ thống (như PostgreSQL).

## 5. Việc cần reviewer xác nhận

1. Chấp nhận C (kiểm lúc commit ở ứng dụng) thay cho constraint trigger cho sổ cái và
   order, cộng quyền appendOnly; writer có quyền admin vẫn có thể phá, được phát hiện
   bằng công cụ đối soát định kỳ.
2. Chấp nhận abort+retry với ngân sách 5 s thay cho xếp hàng khóa (503 khi hết ngân sách).
3. Chấp nhận khóa tài khoản qua `account_locks` và sequence qua counter.
4. Danh sách test tối thiểu: toàn bộ suite F2h hiện có (quotes, orders, payment,
   preparation, packaging, shipments, carrier pickup, delivery overdue, wallet,
   obligations) chạy trên Mongo với ngữ nghĩa giữ nguyên, thêm test tải topup đồng thời.
