# ADR0038: Mua ngay độc lập với thương lượng

Chấp nhận theo yêu cầu chủ dự án ngày 16/10/2026. Bổ sung đường mua giá niêm yết
cho Sale/Both DirectDelivery, giữ đường Seller tạo Order của [ADR0037](0037-seller-selected-purchase-orders.md).
Không mở gate Delivered/inspection/settlement trong [READINESS](../handoff/READINESS.md).

## Quyết định

- Buyer tạo quote từ địa chỉ của mình; xem sách, khuyết điểm, tiền sách, phí giao
  và tổng. Quote, giỏ và chat không giữ sách. Phạm vi đầu: một listing/đơn, TP.HCM,
  DirectDelivery và ví mô phỏng hiện có; ordinary ViaPoint không được mở thêm.
- `POST /orders/buy-now` nhận CreateDirectOrder, chỉ Buyer MEMBER verified ACTIVE,
  dùng quote thuộc Buyer. Không nhận conversation hoặc giá từ client. Dùng giá
  niêm yết của quote sau khi khóa/kiểm lại revision, listing, địa chỉ, policy,
  quyền hiện tại và thời hạn. Snapshot lưu `purchaseMode: BuyNow`.
- Tạo unpaid Order và exclusive commitment cùng transaction, giữ 15 phút. Buyer
  tối đa hai đơn unpaid. Hai luồng và Exchange/intake cạnh tranh cùng commitment;
  chat không có ưu tiên. Unpaid cancel/expiry chỉ release commitment của chính đơn.
- Sale/Both cho phép Mua ngay; đăng bán là cam kết bán theo giá niêm yết. UI đăng
  sách giải thích nghĩa vụ. Thanh toán thành công chuyển thẳng Preparing, không
  cho Seller chọn lại Buyer hoặc từ chối qua API pre-acceptance.
- `payOrder` giữ nguyên key/body/version và transaction/ledger. BuyNow ghi payment
  hold, paidAt, hai bước version 1→2→3 và preparation trong cùng transaction.
  Không ai quan sát PendingSellerConfirmation. Giữ shape DB lịch sử của
  sellerConfirmationDeadline=paidAt+48h nội bộ; projection BuyNow trả null, worker
  chỉ quét PendingSellerConfirmation. PickupDeadline=paidAt+48h.
- Receipt payment BuyNow có version3/Preparing, preparation tham chiếu chính
  receipt `payOrder` của Buyer, event `OrderBuyNowPaid`. Commit-time invariant
  đối chiếu purchaseMode với receipt tạo `createBuyNowOrder`, giá với quote và
  chuỗi hold/preparation/receipt/audit/outbox. Negotiated và snapshot lịch sử
  không có purchaseMode giữ acceptance/refund/version cũ.
- Thông báo bền vững cho Buyer và Seller ghi cùng transaction thanh toán, không
  chứa địa chỉ/PII, dedupe theo Order/user. Migration0029 chỉ mở kind/target Order
  của inbox, giữ các kind/index cũ; không sửa migration đã áp dụng.
- Sau payment, không dùng nhánh hoàn trước Seller acceptance. Quá hạn pickup mở
  review, giữ tiền/commitment theo cơ chế hiện hành; label/ảnh không là custody.
  Không tự hoàn/restock đơn đã Preparing. UI chưa mở Delivered/claim/settlement.
- Web có `/buy-now/:listingId`, `/orders`, `/orders/:orderId`; cùng SessionClient,
  token memory-only, giữ dữ liệu/ý định trong bộ nhớ khi lỗi. Mất ACK retry đúng
  key/body/version. Đơn đã tạo có thể tìm lại qua danh sách; không lưu địa chỉ,
  token hay payment intent vào browser storage. API chung cho RN/Flutter, UI
  Mua ngay native chưa nằm trong gói này.

## Kiểm chứng và triển khai

Test mới kiểm giá niêm yết/không chat, quote ngoại lai, payload chèn giá,
Buyer không hợp lệ, địa chỉ stale, replay/body conflict, thiếu tiền không hold,
auto preparation và hai thông báo một lần, từ chối pre-acceptance sau payment,
đơn thương lượng cạnh tranh Mua ngay và unpaid cancellation. Browser kiểm hai
phiên Buyer/Seller, mất ACK create/pay, ảnh đóng gói/label/pickup mô phỏng.
Evidence thực chạy và giới hạn ghi ở [SESSION_STATE](../handoff/SESSION_STATE.md).

Máy nhận phải áp migration0029 (và pending trước đó) bằng migrator trước chạy
API/worker mới. Không tự migrate DB app, deploy hoặc sửa gate trong gói này.
