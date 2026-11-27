# Mở phiên đấu giá — 27/11/2026

Minh họa SVG vẽ tay (viết trực tiếp bằng mã, không dùng công cụ tạo ảnh hay asset
bên ngoài) cho trang Member web `/auctions/new`, theo yêu cầu chủ dự án dùng hình
mới thay vì tái sử dụng minh họa sẵn có. Bảng màu theo brand: đỏ rượu `#5c0202`
/`#7c1a17`, kem `#fffcf5`, bơ `#f6e0a8`, vàng `#f4cb67`, gỗ `#b9814f`/`#d9a873`;
nét viền tròn đồng bộ với bộ chim cánh cụt.

| Asset | Dùng ở đâu | viewBox |
| --- | --- | --- |
| step-books.svg | Góc thẻ bước 1 (chọn sách): chồng sách có thẻ lô đấu giá | 120×120 |
| step-dropoff.svg | Góc thẻ bước 2 (điểm gửi): quầy nhận sách, ghim bản đồ, đồng hồ cát 72 giờ | 120×120 |
| step-price.svg | Góc thẻ bước 3 (đặt giá): búa đấu giá và chồng xu | 120×120 |
| empty-shelf.svg | Trạng thái chưa có sách đủ điều kiện ở bước 1 | 200×120 |
| pattern.svg | Lớp nền trôi chậm của trang (tile 240px liền mạch) | 240×240 |

Tất cả là trang trí: `alt=""`, `aria-hidden`, không nhận pointer, không chứa
giá, trạng thái kiểm tra hay dữ liệu phiên. Mỗi file khoảng 1,3–1,7 KB.
