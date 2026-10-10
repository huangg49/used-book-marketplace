# Bìa tư liệu dùng để minh họa

Kế thừa ba nguồn public-domain đã dùng trong RN `assets/design/sources.json`:

- `alice.jpg`: https://commons.wikimedia.org/wiki/File:Alice%27s_Adventures_in_Wonderland_cover_(1865).jpg
- `oz.jpg`: https://commons.wikimedia.org/wiki/File:The_Wonderful_Wizard_of_Oz_first_edition_cover.jpg
- `pride.jpg`: https://commons.wikimedia.org/wiki/File:AUSTEN(1894)_Pride_and_prejudice_(15811958311).jpg

Tối ưu kích thước truyền tải, giữ nguyên nội dung/tỷ lệ/màu bìa. Chỉ dùng trang trí
Home, có chú thích. Không thay ảnh bài đăng API bằng các bìa này. Tham chiếu thiết
kế là [Dribbble](https://dribbble.com/shots/26947471-Bookstore-Landing-Page), không
trích ảnh bìa nhỏ từ screenshot hoặc nhận đó là bộ asset gốc đã được cung cấp.

10/10/2026, chủ dự án cung cấp thêm bốn ảnh và yêu cầu dùng trang trí hero:

- `tuoi-tho.webp`: Cho tôi một vé về tuổi thơ.gif (ảnh GIF tĩnh một frame).
- `one-piece.webp`: One Piece Chap 1000.webp.
- `gachiakuta.webp`: Gachiakuta tap 1.webp.
- `duoc-su.webp`: Duoc su tu su chap 1.webp.

Bản phục vụ web được thu nhỏ trong400×560, giữ tỷ lệ/toàn ảnh và nén WebP;
không vẽ lại/cắt nội dung. Nguồn do chủ dự án gửi, không nhận là public-domain.
Provenance của WebP nằm ở sidecar `.webp.json`. Hero có tám vị trí: giữ bốn vị trí
cũ (Oz vốn xuất hiện hai lần) và thêm bốn ảnh mới. Chỉ là minh họa, không khẳng
định đang có bài bán những cuốn này.

Lượt thay bìa tiếp theo cùng ngày: chủ dự án gửi Chúa nhẫn.webp, Alice.webp và
nghìn lẻ một đêm.jpg. Bản delivery tương ứng `chua-nhan.webp`, `alice-moi.webp`,
`nghin-le-mot-dem.webp`, cùng quy trình tối ưu và provenance sidecar ở trên.
Home hero thay cả hai vị trí Oz bằng Chúa nhẫn, Alice cũ bằng Alice mới,
Pride and Prejudice bằng Nghìn lẻ một đêm; ba mục khám phá dùng cùng bìa thay thế.
Các JPEG tư liệu cũ giữ để đọc lịch sử, không còn được Home hiện tại tham chiếu.
