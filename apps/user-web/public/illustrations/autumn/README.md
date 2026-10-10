# Họa tiết mùa thu — Home

`motifs.webp` là một sprite atlas3×2 được tạo bằng built-in ImageGen cho gói này.
Ba lá phong/oval/sồi, nhánh hai lá, quả sồi và cặp hạt chung phong cách minh họa
phẳng; bảng màu đỏ nâu/vàng/olive theo ảnh Background demo.png chủ dự án cung cấp.
Không lấy bộ icon từ website khác và không dùng làm bìa hoặc thông tin sản phẩm.

Delivery768×512, alpha thật,55946byte. Chỉ resize/encode toàn atlas; CSS chọn ô,
đổi kích thước/góc/opacity. Prompt và SHA256 source/delivery ở `motifs.webp.json`.
Original giữ ở kho generated_images trên máy; ứng dụng chỉ dùng asset trong repo.

Home đặt24 motif static không đều ở hai mép, dưới lớp nội dung. Layer aria-hidden,
pointer-events:none; không thêm animation hoặc lặp tile.

## Tán lá ở đường nối hero

`canopies.webp`: hai cụm lá bất đối xứng từ built-in ImageGen, tham chiếu phần lá
trong Background demo.png của chủ dự án. Alpha thật,1200×800/76574byte;
chỉ resize/encode toàn atlas. CSS chọn hai nửa và thu nhỏ ở mobile; không tile,
không animation. Layer riêng clip/pointer-inert dưới nội dung, hero giữ nguyên.
Prompt đầy đủ và hashes ở `canopies.webp.json`.

## Cảnh cáo và đồi phía trên footer

`fox-landscape.webp` là chính ảnh Background demo.png chủ dự án cung cấp,
encode toàn ảnh thành WebP quality92,1920×1080/94602byte. Không sinh lại,
không crop/mask/sửa nội dung ảnh. CSS chỉ lấy khung nhìn phần dưới, giữ tỷ lệ,
canh giữa/đáy; mobile có minimum image width960px để cáo rõ và lá phía đầu ảnh
không lọt vào frame. Phần giữa nền cùng #ffefcb. Lazy/async, alt rỗng và
aria-hidden vì chỉ trang trí. Hash nguồn/delivery và processing ở
`fox-landscape.webp.json`. Chỉ Home nối trực tiếp cảnh này với footer.
