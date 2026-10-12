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

## Cảnh nhiều lớp phía trên footer

Home hiện dùng hai lớp được tạo bằng built-in ImageGen từ Background demo.png
của chủ dự án, chỉ resize/encode toàn output WebP quality92/alpha100; không sửa
tay hoặc mask ảnh nguồn. Không dùng làm bìa hoặc dữ kiện sách.

- `hills-background.webp`:1600×900/80992byte, không alpha. Prompt yêu cầu bỏ
  cáo và dựng tiếp đồi/lá/cỏ, giữ cây/mây/palette/nền kem của reference.
- `fox-foreground.webp`:600×750/53050byte, alpha thật. Prompt yêu cầu cáo
  ngồi đầy đủ, cùng nét/màu/biểu cảm, bỏ nền/cây/đồi/lá và không thêm bóng.

Prompt đầy đủ, đường dẫn nguồn, kích thước nguồn/delivery, processing và SHA256
ở [hills-background.webp.json](hills-background.webp.json) và
[fox-foreground.webp.json](fox-foreground.webp.json). Asset generated gốc giữ trong
kho generated_images trên máy; runtime chỉ dùng delivery trong repo.

Wrapper chứa lời mời đăng sách vẫn accessible. Đồi ở z0, wine card ở z1 và
cáo ở z2; chỉ artwork aria-hidden/alt rỗng/pointer-inert, lazy/async. CSS mask
alpha72px ở đầu lớp đồi chỉ hòa đường nối; ảnh đồi bottom-center/min-width960px.
Desktop card trái/cáo phải, mobile card trên/cáo dưới với16px overlap mép card;
nút và mô tả không bị che. Footer Home margin-top0; hero/tán lá/24 motif giữ nguyên.

## Biến thể trước được giữ lại

`fox-landscape.webp` là bản encode toàn ảnh Background demo.png gốc,
WebP quality92,1920×1080/94602byte, không sinh lại/crop/mask/sửa nội dung.
Runtime Home hiện không dùng biến thể này. Hash nguồn/delivery và processing
vẫn ở [fox-landscape.webp.json](fox-landscape.webp.json).
