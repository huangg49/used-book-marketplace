# ADR0037: Seller chọn Buyer trước khi tạo Order

Chấp nhận theo yêu cầu nghiệp vụ ngày 15/10/2026. Thay đổi luồng mua direct
Sale/Both; không mở rộng gate Delivered/inspection/settlement.

16/10/2026: [ADR0038](0038-direct-buy-now-orders.md) bổ sung Mua ngay độc lập;
những quyết định dưới đây tiếp tục áp dụng cho đường thương lượng.

## Quyết định

- Mở chat không phải là reservation. Nhiều Buyer có thể chat cùng Seller về một
  listing; chat Active và báo giá của Buyer không làm listing đổi khỏi Available.
- Buyer gửi địa chỉ nhận và báo giá giao nhận trước. Khi gắn báo giá vào hội
  thoại, địa chỉ chỉ được chia sẻ với Buyer và Seller của đúng hội thoại đó.
- Seller chọn một hội thoại còn hợp lệ, nhập giá sách đã thương lượng và tạo
  unpaid Order. Server kiểm tra participant, quote, listing revision, quyền và
  khả năng reservation trong cùng transaction; giá đã chốt được ghi bất biến vào
  agreement snapshot, phí giao nhận lấy từ quote.
- Chỉ transaction tạo Order mới tạo exclusive commitment và chuyển listing sang
  Reserved. Listing có Order unpaid vẫn xuất hiện công khai với trạng thái
  “Chờ thanh toán”; chỉ sau payment thành công mới hiển thị “Đang giao dịch”.
  Không nhận Order thứ hai trong lúc giữ chỗ. Buyer xem tổng từ snapshot rồi thanh toán.
- Listing không được giữ khi chỉ có chat hoặc quote. Nếu Order chưa thanh toán
  hết hạn/hủy, quy trình Order hiện tại release reservation; Buyer/Seller có thể
  mở thêm hội thoại theo quy tắc hiện hành.

## Tương thích dữ liệu

Migration 0028 thay unique active-conversation-per-listing bằng unique
active-conversation-per-buyer/listing, thêm quote/order references và trạng thái
OrderCreated. Hội thoại cũ đã tạo reservation 24 giờ được phép hết hạn theo hành
vi cũ; không release/hủy dữ liệu trong migration. Chat mới không có expiry.

Contract đổi `POST /orders` thành lệnh Seller tạo Order từ hội thoại. Buyer quote
được gắn vào hội thoại riêng; Order payment tiếp tục dùng endpoint payment hiện
có. OpenAPI/generated type là nguồn contract cho API chung; user-web không thay
thế bằng state cục bộ.

## Hệ quả

- Races giữa hai Seller order-create được quyết định bởi exclusive commitment và
  transaction, không bởi UI hoặc thứ tự chat.
- Snapshot Order phải dùng agreedBookPrice, không đọc lại giá listing để thu tiền;
  mọi payment/refund/settlement dùng số tiền snapshot.
- UI cần thể hiện rõ “chat chưa giữ sách”, “Seller đã tạo Order” và bước Buyer
  thanh toán; không được hứa listing sẽ được giữ trước khi Order tồn tại.
- Không thay đổi lịch sử snapshot v1.0 hoặc READINESS; các gate hiện hành vẫn áp
  dụng cho lifecycle giao hàng và quyết toán.
