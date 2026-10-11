# Những cuốn sách đi tiếp — 11/10/2026

Ba minh họa do built-in ImageGen tạo theo phương án chủ dự án duyệt. Nhân vật
tham chiếu bộ chim cánh cụt hiện hữu ở `../penguins/post.png` và
`../penguins/auction.png`: đỏ rượu, mặt/bụng kem, mỏ/chân vàng và má hồng.
Không thay logo, ảnh sách thật hoặc dữ liệu API.

| Asset | Dùng ở đâu | Kích thước | Dung lượng | Prompt và provenance |
| --- | --- | --- | --- | --- |
| pending.webp | Đã gửi duyệt, sau khi service trả kết quả | 800×600 | 56.5 KB | [pending.webp.json](pending.webp.json) |
| empty.webp | Kệ sách cá nhân trống ở trang đầu, chưa lọc | 800×600 | 61.4 KB | [empty.webp.json](empty.webp.json) |
| auction.webp | Phần giới thiệu danh sách đấu giá | 900×600 | 60.1 KB | [auction.webp.json](auction.webp.json) |

Mỗi sidecar lưu prompt đầy đủ, nguồn, tham chiếu, SHA-256 nguồn/delivery và alpha.
`auction.webp.json` lưu cả yêu cầu chỉnh đèn. Bản delivery chỉ resize/encode WebP
bằng Sharp; giữ toàn bố cục, màu và alpha, không vẽ lại hay ghép bằng script.
Nguồn PNG nằm trong thư mục generated_images của phiên, không đưa bản nặng vào repo.

Các cảnh là trang trí: ảnh có alt rỗng, aria-hidden và không nhận pointer.
Đồng hồ cát biểu thị chờ duyệt; không diễn tả bài đã công khai hoặc được duyệt.
Ảnh kệ trống không dùng cho lỗi tải, kết quả lọc rỗng hay trang cursor rỗng.
Quầy đấu giá không tạo phiên, giá, người tham gia hay badge tin cậy mẫu.
