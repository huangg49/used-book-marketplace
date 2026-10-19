# Chim cánh cụt — lối khám phá Home

Chủ dự án duyệt bộ minh họa chim cánh cụt và bốn ô màu ngày10/10/2026.
Tạo bằng built-in image_gen, dùng mẫu chim ôm sách cùng phiên làm reference
nhận diện: đỏ rượu vang, bụng/mặt kem, mỏ/chân vàng, má đào.

- `buy.png`: túi mua hàng có sách.
- `exchange.png`: hai cuốn sách để trao đổi.
- `budget.png`: ví nhỏ và đồng xu.
- `post.png`: giơ sách có dấu cộng.

PNG256×256 có alpha thật. Chỉ resize/encode tối ưu delivery, giữ toàn bố cục,
màu và nội dung. Bốn file tổng202026byte. Sidecar `.png.json` giữ prompt đầy đủ,
source/delivery SHA256, dimensions/alpha và mục đích sử dụng. Không lấy asset
từ Fahasa/Dribbble. Đây là minh họa phụ cho lối vào, không thay logo cú hiện tại
và không làm ảnh sách hay chứng minh tính năng/giao dịch.

Lượt dấu sách bổ sung `auction.png`: chim cầm búa, edit từ mẫu `budget.png`
bằng built-in image_gen. File mới256px/51004byte/alpha; prompt và hash ở
`auction.png.json`. Bộ đang render là buy/exchange/auction/post, tổng201799byte;
budget giữ làm nguồn/lịch sử. Dấu sách được dựng bằng SVG hình học trong code,
không cắt từ ảnh mockup hoặc biến ảnh mockup thành UI.

Render88px desktop/mobile, `alt=""`; chữ bên cạnh là accessible name.
Những file này là bitmap illustration; icon tác vụ nhỏ của app vẫn dùng Lucide.

Paper refinement reuses `/login-art/ivory-paper.webp` at20% multiply opacity inside geometric SVG clips. No new bitmap; provenance stays with that existing texture. Wine thread and shallow silhouette hover shadow are code geometry.

Chat19/10 reuses `exchange.png` at64px for the active conversation's empty greeting.
The books are decorative, not a selected transaction mode; empty alt/aria-hidden
and no pointer interaction. Errors and expired rooms omit the mascot. Chat also
reuses the existing ivory-paper texture under an85% paper-color overlay, plus a
CSS geometric wine bookmark; no new bitmap or external illustration source.
