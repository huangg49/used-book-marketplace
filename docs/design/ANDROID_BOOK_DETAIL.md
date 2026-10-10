# Chi tiết sách Android — 10/10/2026

Mode: **Operate**. Gói tiếp nối tìm sách `2f766ca`, giữ hệ thống
[DESIGN](../../DESIGN.md); không thay visual world, token hoặc sidecar.
Kế thừa direction và seed `3a051903` ở [brief tìm sách](ANDROID_SEARCH.md).

## Việc người dùng cần làm

Nhận ra sách, xem đủ ảnh bản sách, hiểu giá bán/giá trị đổi và hư hại trước khi
quyết định lưu. Android hiện chưa có purchase/chat/exchange UI; không tạo CTA giả.

## Cấu trúc đã chốt

Tên và tác giả dùng toàn chiều ngang, không cắt dòng. Ảnh contain cạnh giá có
nhãn và người đăng; chữ lớn ở320dp chuyển xếp dọc. Nút xem ảnh có chữ và số ảnh;
chọn ảnh có trạng thái selected/disabled. Không có thanh giá cố định chiếm màn.
Lưu/lối vào đăng nhập và lời giải thích khả năng thật đứng trước tình trạng.
Tình trạng, mô tả thêm, thông tin xuất bản mở rộng và giao nhận theo thứ tự đọc.

## Dữ liệu và trạng thái

`PublicListing`/`MediaRead` thật; giữ refresh30s, signed-media expiry/retry,
revision reset, foreground và404. Lỗi refresh giữ dữ liệu có cảnh báo, khóa xem
ảnh/lưu; không ngụ ý thông tin còn mới. Giá trị đổi không là giá thanh toán.
Thiếu trang được khai báo riêng; ảnh/kiểm duyệt không chứng nhận chính hãng.
`InNegotiation` chỉ báo sách đang được giữ, không tự cung cấp giao dịch.

## Quy tắc trình bày

Be Vietnam Pro400/700, browse canvas, forest/ink/rustText theo token hiện hành.
Không phiếu đóng dấu, viền trang trí, slogan hoặc rating/trust badge. Labels:
“Trang sách”, “Thông tin xuất bản”, “Làm mới thông tin”, “Quay lại”.
BookPresentation/BookGallery cùng phục vụ chi tiết showcase có banner dữ liệu mẫu.

## Kiểm chứng và giới hạn

Ma trận dự kiến trên Android35 emulator:390dp/100%,320dp/130%, nội dung dài, Sale/Exchange/Both,
nhiều ảnh/xem lớn/Back, metadata, không tìm thấy/lỗi/retry. Kiểm consumer mẫu.
Kết quả thực, evidence và ca chưa chạy ở [bàn giao](../ui/ANDROID_BOOK_DETAIL_REDESIGN.md).
TalkBack/hardware/ARM/iOS/human usability vẫn là gate riêng.
