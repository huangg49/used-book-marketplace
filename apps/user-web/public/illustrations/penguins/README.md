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

Render72px desktop,56px mobile, `alt=""`; chữ bên cạnh là accessible name.
Những file này là bitmap illustration; icon tác vụ nhỏ của app vẫn dùng Lucide.
