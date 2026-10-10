# Họa tiết mùa thu — Home

`motifs.webp` là một sprite atlas3×2 được tạo bằng built-in ImageGen cho gói này.
Ba lá phong/oval/sồi, nhánh hai lá, quả sồi và cặp hạt chung phong cách minh họa
phẳng; bảng màu đỏ nâu/vàng/olive theo ảnh Background demo.png chủ dự án cung cấp.
Không lấy bộ icon từ website khác và không dùng làm bìa hoặc thông tin sản phẩm.

Delivery768×512, alpha thật,55946byte. Chỉ resize/encode toàn atlas; CSS chọn ô,
đổi kích thước/góc/opacity. Prompt và SHA256 source/delivery ở `motifs.webp.json`.
Original giữ ở kho generated_images trên máy; ứng dụng chỉ dùng asset trong repo.

Home đặt16 motif static không đều ở hai mép, dưới lớp nội dung. Layer aria-hidden,
pointer-events:none; không thêm animation, lặp tile, tán lá lớn, cáo hoặc đồi.
