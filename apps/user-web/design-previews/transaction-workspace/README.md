# Bản thử không gian giao dịch — Minh An

Owner yêu cầu mock giao diện vì chat đang chứa quá nhiều thông tin trao đổi/đơn.
Mở bằng Vite của Member web: `/design-previews/transaction-workspace/`.
Đây là HTML entry riêng cho thiết kế, không được nối vào router sản phẩm hoặc
session. Không import API, không gọi backend, không ghi Mongo/localStorage.

## Phương án

- Hai vùng: danh sách hồ sơ bên trái, một nội dung đang đọc bên phải.
- Tổng quan: đối tác, bước tiếp, bản sách, tiền cọc/tiền bù và tiến trình.
- Hội thoại: tin nhắn, composer và một liên kết gọn về hồ sơ, không nhúng cả phiếu.
- Chi tiết: tình trạng sách, khoản tiền, giao nhận và lịch sử; một vùng cuộn.
- Mobile: danh sách → hồ sơ với Back rõ; không ép nhiều cột vào màn hẹp.
- Chỉ vùng chính cuộn; header/tab và composer luôn trong viewport. Danh sách
  bên trái chỉ cuộn khi vượt chiều cao. Không đổi app animation/motion policy.

## Dữ liệu và thao tác minh họa

Minh An (user1) là persona owner yêu cầu; mọi giao dịch/đối tác/tiền và tin nhắn
trong bản thử là dữ liệu mẫu, không được đọc từ tài khoản thật. Không hiển thị
điểm uy tín hay trạng thái online tự bịa. Ảnh bìa dùng tài sản minh họa đã có
trong `public/illustrations/`, theo provenance README/sidecar của thư mục đó;
không nhận là ảnh hiện vật của listing hoặc bằng chứng kiểm định.

Có trao đổi với Gia Bảo, đơn mua từ Hà Linh và hỏi sách với Thu Hà. Bộ chọn
“Thử tình huống” chỉ thay trạng thái trong RAM: đề nghị, đặt cọc, vận chuyển,
kiểm tra, hoàn tất. Gửi chat/đánh giá đều ghi rõ minh họa và mất khi refresh.
Không có thao tác thật nạp ví, chấp nhận, giao nhận hoặc thay đổi deadline.

Khi áp vào sản phẩm: giữ command/service/session hiện hành; đọc quyền/state
từ máy chủ, giữ key/body/version khi retry, đọc lại sau ACK. Review sau receipt
được viết ngay nhưng không giải phóng tiền hoặc công bố sớm. Không dùng bộ chọn
trạng thái hoặc dữ liệu mock trong luồng vận hành thật.

## Kiểm tra bản thử

Typecheck riêng: `pnpm --filter @used-books/user-web exec tsc --project design-previews/transaction-workspace/tsconfig.json`.
Browser thực thi không API: Tổng quan/Hội thoại/Chi tiết, năm tình huống, đơn mua,
gửi tin/lưu review mẫu, giữ nháp theo từng hội thoại, mobile Back, wheel và
không tràn ngang ở1440/950/390/320px, màn thấp950×480 và chữ130%.
Đây là bằng chứng tương tác mock, không thay kiểm tích hợp API hoặc UX người thật.
Chưa áp phương án vào ChatPage/ExchangeDetail/OrderDetails thật.
