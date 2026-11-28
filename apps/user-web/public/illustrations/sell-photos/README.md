# Ảnh bản sách — minh họa ô trống — 28/11/2026

Minh họa SVG vẽ tay (viết trực tiếp bằng mã, không dùng công cụ tạo ảnh hay asset
bên ngoài) cho bước 2 "Ảnh bản sách" ở `/sell`, theo yêu cầu chủ dự án tạo hình
mới thay vì tái sử dụng minh họa sẵn có. Cùng ngôn ngữ nét với bộ
`../auction-create`: viền tròn `#5c0202`, nền đỏ rượu `#7c1a17`, kem `#fffcf5`,
bơ `#f6e0a8`, vàng `#f4cb67`, gỗ `#b9814f`.

| Asset | Dùng ở đâu | viewBox |
| --- | --- | --- |
| cover-empty.svg | Ô ảnh bìa khi chưa chọn ảnh: cuốn sách trong bốn góc khung máy ảnh, dấu cộng | 160×140 |
| back-cover.svg | Ô gợi ý "Bìa sau": mặt sau có đoạn giới thiệu và mã vạch | 64×64 |
| spine.svg | Ô gợi ý "Gáy sách" | 64×64 |
| inner-pages.svg | Ô gợi ý "Trang ruột": sách mở | 64×64 |
| flaw.svg | Ô gợi ý "Vết lỗi nếu có": trang gấp góc, vết ố, kính lúp | 64×64 |

Tất cả là trang trí: `alt=""`, `aria-hidden`, không nhận pointer; chữ trên nút là
accessible name. Biến mất khi ô đã có ảnh, không thay ảnh bài đăng.
