# ADR0040: Phiếu thỏa thuận và hội thoại mua/đổi chung

Chấp nhận theo yêu cầu và kế hoạch được chủ dự án duyệt ngày19/10/2026.
Mở rộng [ADR0037](0037-seller-selected-purchase-orders.md); giữ Mua ngay của
[ADR0038](0038-direct-buy-now-orders.md), snapshot lịch sử và READINESS.

## Quyết định

- Một cuộc trao đổi riêng cho Buyer + Seller + listing, không phải phòng công khai
  theo sản phẩm. Navbar Chat mở danh sách card có sách, đối tác, vai trò và trạng thái.
  Detail Chat/Đổi sách đi vào cùng workspace; Mua ngay vẫn độc lập theo giá niêm yết.
- Workspace có phiếu bên trái và chat bên phải; mobile chuyển giữa hai vùng mà
  không unmount bản nháp. Phiếu ban đầu là thỏa thuận dự kiến, không là Order và
  không có quyền giữ sách/thu tiền.
- Listing Both cho phép Negotiation hoặc Exchange. Seller đề xuất chuyển hình
  thức, Buyer xác nhận đúng phiên bản. Buyer có thể yêu cầu đổi sách; Seller xác
  nhận. Listing Exchange-only bắt đầu ở Exchange; Sale-only không được chuyển
  thành Exchange trong chat. Thay đổi chỉ thuộc cuộc trao đổi, không sửa listing.
- Hai bên gửi đề nghị giá có cấu trúc. Đối tác chấp nhận/từ chối; không tự nhận
  diện giá hoặc sự đồng ý từ văn bản tin nhắn. Người đề xuất được rút đề nghị chưa
  chốt nhưng không được tự chấp nhận. Mỗi đề nghị gắn revision listing; đổi
  revision buộc thống nhất giá mới. Phiếu và lịch sử sự kiện chỉ cập nhật sau ACK.
- Switch hình thức cũng cần xác nhận hai bên. Khi chấp nhận chuyển, giá đã chốt
  và quote của hình thức trước được bỏ khỏi phiếu hiện hành; lịch sử bất biến còn.
  Chỉ một đề nghị thỏa thuận chờ xử lý mỗi cuộc trao đổi, tránh chấp nhận nhầm bản.
- Seller tạo Order Negotiated từ giá đã được chấp nhận và quote hợp lệ. Giá tự
  điền, không sửa trong hộp tạo đơn. Server kiểm cùng version, mode, revision,
  participant, listing và exclusive commitment. Buyer vẫn xem tổng rồi thanh toán.
- Exchange mới gắn conversationId + expectedConversationVersion trong chính lệnh
  tạo đề nghị. Chỉ Buyer của cuộc trao đổi chọn sách mình sở hữu; target/đối tác
  phải khớp. Link, proposal và version cuộc trao đổi commit cùng nhau. Tạo proposal
  chưa giữ sách; acceptance/funding vẫn theo Exchange hiện hành.
- Một Exchange còn mở khóa chuyển mode/giá. Muốn thay hình thức phải hủy đề nghị
  qua đúng lệnh trước. Sau OrderCreated hoặc Exchange acceptance, không đổi điều
  kiện tại workspace. Hoàn/hủy/đặt cọc không được thực hiện bằng switch hay chat.
- Một cuốn có thể có nhiều Buyer trao đổi; tạo đơn/chấp nhận Exchange vẫn cạnh
  tranh với Mua ngay. Khi người khác giữ sách, phiếu khóa thao tác chốt, chat giữ lại.
- Chat của participant ACTIVE tiếp tục sau OrderCreated; đây không là cấp quyền
  mới cho tài khoản LOCKED. Các quyền ExistingObligation/giao nhận/settlement giữ
  phạm vi hiện hành. Tin nhắn không chứng minh giao nhận hoặc thanh toán.

## Dữ liệu và tương thích

Migration0032 thêm conversation_terms (mutable), conversation_events và
conversation_exchange_links (append-only). Conversation là khóa tuần tự hóa mọi
thay đổi phiếu; actor/session được kiểm trước replay, body/key/version được giữ
khi mất phản hồi. Events không chứa địa chỉ hoặc nội dung chat riêng tư.

CreatePurchaseConversation.intent là opt-in. Client legacy/native không gửi intent
và chưa có terms giữ semantics ADR0037. Khi tạo terms qua các lệnh mới, các lần
chốt tiếp theo phải qua thỏa thuận có cấu trúc; không dùng client cũ để bỏ qua.
Không ép chuyển hay ghi đè conversation/order/exchange/message lịch sử.

Các Exchange cũ xuất hiện trong inbox với link về phiếu/chat cùng bố cục. Exchange
mới đã liên kết tự quay về workspace; lịch sử các lần đề nghị còn xem được ở phiếu.
Messages đọc gộp cả purchase_messages và exchange_messages của các link đã xác
thực, giữ id/tác giả/thời điểm; không copy hoặc viết lại tin nhắn. Socket vẫn dùng
namespace hiện có, không tạo token store hay transport song song.

## Kiểm chứng và giới hạn

Negative/replay/race tests chạy trên replica set QA và database *_test. Có ca
khác Buyer, tự chấp nhận, seller-only switch, revision cũ, sai giá tạo đơn, session
bị thu hồi trước replay, malformed Mongo document và hai thao tác chốt cạnh tranh.
Browser kiểm phiếu/chat, inbox card, mode xác nhận, retry đúng key/body, giữ nháp,
OrderCreated tiếp tục chat, desktop/mobile/chữ lớn. Evidence thực chạy ghi trong
[SESSION_STATE](../handoff/SESSION_STATE.md); không đóng gate native/human/release.
