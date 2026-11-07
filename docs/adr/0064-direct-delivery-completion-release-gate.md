# ADR0064: Chặn completion DirectDelivery khi bảo vệ Buyer chưa đủ

Ghi chú tích hợp02/11: đổi số ADR local chưa publish từ0062 sang0064 để giữ
nguyên ADR trên main. Nội dung quyết định và gate không đổi.

01/11/2026. Accepted cho gói giới hạn an toàn theo owner sau khảo sát core và PR84.
Không chấp nhận toàn bộ đề xuất ADR0026, mở sau F2h hoặc đóng READINESS.

## Vấn đề

Main `2ae2212b` có Buyer receipt, carrier Delivered và worker quyết toán sau72h.
Buyer không có đường phủ nhận carrier Delivered trong Inspection hoặc claim chất
lượng DirectOrder tương ứng FR-D01/BR-17/18. READINESS/ADR0038 chưa cho mở phần này.
Chỉ ẩn nút trên client không chặn API hoặc worker. Không được giải ngân trước khi
quyền khiếu nại có đường thực thi và chặn settlement tương ứng.

## Quyết định

**Ngoại lệ owner03/11/2026:** riêng Buyer acknowledgement được mở theo
[bổ sung ADR0052](0052-transaction-reviews-and-reputation.md), để nhận sách và
viết đánh giá riêng trong72h. `canConfirmReceipt` đọc quyền/trạng thái thật;
tiền/commitment giữ nguyên. Các quy định Completed-only receipt/projection bên
dưới là baseline01/11, được thay riêng phần này. Carrier Delivered, settlement,
worker và điều kiện mở gate còn lại không đổi; không reset Inspection lịch sử.

- Giữ route và request schema receipt/delivery để client cũ giữ intent. Quyền,
  phiên hiện tại, owner và tính độc lập kiểm trước receipt replay. Mọi command
  **mới** trả409 InvalidState sau authorization và trước mutation; không ghi event,
  receipt thành công, audit/outbox, window kiểm tra hoặc bút toán mới.
- Exact historical receipt vẫn replay với đúng actor/key/body/target, chỉ trả
  snapshot đã commit. Payload/target khác bị idempotency conflict nếu hợp schema;
  sai schema bị422; mất quyền/phiên không replay. Không dùng receipt cũ như quyền
  tạo quyết định mới, không đảo các quyết định/bút toán đã hoàn tất.
- `canConfirmReceipt=false` trong projection/contract. Đọc đơn cũ vẫn trả timestamps,
  trạng thái, tiền và snapshots thật; không bịa giao hàng, hoàn tiền hay reset hạn.
- Worker không gọi settlement của Inspection khi gate đóng. Báo `inspectionBlocked`
  cho tất cả Inspection, `inspectionOverdueBlocked` cho phần qua hạn; phần này
  không cộng vào executable `remaining`, `inspectionRemaining` hoặc `oldestLagSeconds`.
  Log cảnh báo gate riêng để không coi danh sách executable rỗng là đã xử lý xong.
- Service settlement và ledger DirectOrder đều chặn mutation mới. Shared payout
  writer cũ cũng nhận diện DirectOrder để gọi alias PointOrder không vượt gate.
  PointOrder/Exchange đủ điều kiện giữ protocol riêng, không mở thêm quyền.
- Giữ toàn bộ hold P+S, listing Reserved, commitment/context và lịch sử của đơn
  Inspection chưa giải quyết. Không đổi sang ResolutionPending giả, refund, Sold,
  mở sách hoặc sửa timestamps. Intake quá hạn pickup/giao hàng trước completion,
  unpaid expiry và refund hợp lệ trước Seller acceptance vẫn hoạt động riêng.
- Policy đóng bằng code, không lấy trạng thái từ request/env/provider. Việc mở
  lại cần gói được duyệt riêng có claim, dispute/return và settlement interlocks,
  kiểm quyền/receipt/race, contract/client và evidence/gate tương ứng. Test QA
  dùng policy fake có phạm vi để dựng dữ liệu lịch sử; đó không phải quyền bật
  production, acceptance hoặc bằng chứng gate được đóng.
- Khi thiết kế mở lại, phải xử lý riêng Inspection lịch sử có hạn đã trôi qua
  trong lúc Buyer chưa có đường claim. Không chỉ đổi policy sang released rồi
  tự giải ngân các hồ sơ cũ; cần chứng minh cơ hội khiếu nại/hiệu lực quyết định
  và điều kiện chuyển tiếp được chấp thuận. Gói này không tự reset hạn cũ.

## Giới hạn

Đây là biện pháp bảo vệ khi workflow chưa đủ, không triển khai hoàn chỉnh claim
và phân xử. Đơn Inspection cũ có thể tiếp tục giữ tiền chờ gói đã được duyệt;
không tự khẳng định đã có đường hoàn tất thủ công. Không migration mới, không sửa
checksum cũ hoặc DB chính. GHN/carrier routes, đấu giá ViaPoint và Flutter không
được mở rộng trong gói này. [Khảo sát](../features/CORE_BUY_NOW_AUDIT_2026_11_01.md),
[evidence gói](../features/DIRECT_COMPLETION_GATE_2026_11_01.md) và
[READINESS](../handoff/READINESS.md) giữ các giới hạn nghiệm thu tương ứng.
