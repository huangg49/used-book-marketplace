# MIG-05 — Báo giá, Order, ví, vận chuyển trên MongoDB

29/09/2026, nhánh `codex/mongodb-refactor`. Nền: [ADR 0027](../adr/0027-mongodb-persistence-protocol.md),
[bản đồ backstop](MIG02_MODEL_MAP.md), [thiết kế tiền/quyền](MIG05_MONEY_PERMISSION_DESIGN.md)
(chủ dự án duyệt 29/09 — phê duyệt của chủ dự án, **không** phải review độc lập về
bảo mật/kế toán). Phạm vi giữ F2h/OpenAPI 0.20.0; không mở Delivered/inspection/settlement.

## Đã chuyển

- Báo giá DirectDelivery (`QuoteClock` = `tx.now()` sau khóa), giữ sách độc quyền
  (`exclusive_commitments` partial unique Active + `checkListing`/`checkOrder`).
- Sổ cái: entry/journal appendOnly với app user; số dư = tổng entry trong transaction;
  khóa `account_locks` theo thứ tự id trước khi đọc số dư; sequence từ
  `counters.ledger_journal_sequence`; `checkJournal` lúc commit; `reconcile` thay
  `wallet:check` (vẫn là lệnh `wallet:check`, thêm `mongo:check` toàn DB).
- Ví/nạp mô phỏng, Order: tạo/hủy/thanh toán P+S/hoàn trước khi seller nhận/seller
  nhận đơn/hạn 48 h; ảnh đóng gói; vận đơn; pickup mô phỏng; review quá hạn giao và
  Buyer báo chưa nhận. `order-invariants.ts` port các hàm `latlai_check_*`
  (order, funding, preparation, pickup, delivery review, shipment, packaging).
- Worker Order: claim bằng transaction + điều kiện trạng thái, quyết định bằng giờ server
  sau khóa (`OrderClock`), idempotency theo orderId với principal hệ thống.
- Duy nhất mã vận đơn toàn cục: upsert `command_locks` (thay advisory lock + unique).

Sửa lỗi phát hiện khi port test: cửa sổ upload 1 giờ của ảnh đóng gói tính từ giờ
quyết định Order (như PostgreSQL), không phải đồng hồ máy; upload listing không đổi.

## Bằng chứng

E2E trên MongoDB (database `_test` riêng, app user tối thiểu quyền). Mỗi suite do
subagent port chạy ≥3 lần liên tiếp PASS; lead chạy lại độc lập từng nhóm và review diff.
Số test tính cả các trường hợp `it.each`.

| Suite | Test | Thay đổi đáng chú ý |
|---|---|---|
| quotes, quote-migration | 19 | tạm dừng lệnh trong transaction để ép thứ tự thắng |
| wallet, wallet-migration | 41 | 100 emit cùng event: 503 được retry cùng key, kết thúc 100×200, 1 journal |
| orders | 29 | đua tồn kho/hạn mức 100 request: đúng 1 (hoặc 2) thắng; 503 retry → 409 replay |
| obligations | 11 | LOCKED chỉ thao tác nghĩa vụ cũ; gate thay khóa hàng |
| order-payment | 44 | lỗi trigger → validator từ chối (khẳng định mã 121); ghi thô bị C/13 chặn với thông điệp chính xác |
| order-preparation | 42 | khóa ngân sách lưu trữ = gate trên `counters` |
| packaging-evidence | 29 | xem giới hạn 2 bên dưới |
| order-migration, order-payment-migration | 2 | áp lại spec lên lịch sử có dữ liệu; Reserved cũ được `checkIntegrity` báo |
| delivery-overdue | 35 | thứ tự thắng tại khóa sổ cái được ép tường minh |
| shipments | 31 | khóa mã vận đơn = gate trên `command_locks` |
| carrier-pickup | 30 | lịch sử 128 event: timeout 60→180 s, không đổi assertion |

Quy ước chung: ngưỡng khóa FIFO của PostgreSQL được thay bằng abort+retry; khi test cần
một bên thắng xác định, bên thắng bị tạm dừng trong transaction và bên thua được quan sát
retry (`onTransactionRetry`) trước khi thả. Câu trả lời 503 chỉ được chấp nhận khi test
retry cùng idempotency key và khẳng định kết quả cuối như bản gốc. Không `it.skip`,
không giảm assertion nghiệp vụ; số test mỗi file bằng bản PostgreSQL (99c2d51).

Tải: 100 lệnh cùng một user/event dưới khóa thật, trong ngân sách 5 s chỉ một phần hoàn
tất ở lượt đầu, phần còn lại nhận 503 và hoàn tất khi retry cùng key (không double
credit). Đây là hành vi đã duyệt (thiết kế §5.2); client phải retry cùng key.

## Giới hạn và bảo đảm giờ chỉ còn ở tầng ứng dụng

Ghi trực tiếp bằng thông tin đăng nhập app (không qua executor) có thể làm những điều
sau mà DB không chặn ngay; `mongo:check`/`wallet:check` (đối soát toàn DB) phát hiện 1
và phần lớn 3, còn 2 chỉ bị chặn ở đường lệnh:

1. Chèn journal/entry không cân bằng: C `checkJournal` chỉ chạy khi writer đăng ký
   (`LedgerService.journal`). PostgreSQL trigger chạy với mọi insert.
2. Ảnh đóng gói: đổi `sha256` của bản Pending, hoặc kích thước/field dẫn xuất của bản
   Ready (PostgreSQL: trigger `latlai_guard_packaging`). MIG02 xếp vào W; đường lệnh vẫn
   giữ định danh (upload lại ảnh Ready → 409, tài liệu không đổi).
3. Các mục tương tự MIG-04 (nội dung revision đã nộp, định danh ảnh Ready, payload outbox,
   `version` nhảy).

Hiệu năng (chưa tối ưu, không đổi nghiệp vụ): `checkOrderPickup` truy vấn theo từng event
trước đó (≈250→600 ms/emit ở 112 event, giới hạn 128); `reconcile` chạy `checkOrder` cho
mọi Order nên chi phí tăng theo dữ liệu. Tài liệu nóng (tài khoản SimulatorClearing, một
listing) có thể trả 503 dưới tranh chấp cao.

Uppercase `mediaId` ở đọc ảnh Order trả 404 như PostgreSQL (so sánh chuỗi trong snapshot);
giữ nguyên hành vi.
