# Rèm sân khấu đấu giá — 13/10/2026

`velvet.webp` là texture trang trí do built-in `image_gen` tạo theo kế hoạch
chủ dự án duyệt: rèm nhung đỏ rượu, nếp dọc, viền vàng mảnh. Hai panel dùng
cùng texture và panel phải lật ngang; mỗi panel có tám lớp gom nếp bằng WAAPI.
Ảnh không chứa sách, giá, trạng thái kiểm tra hoặc thông tin phiên.

Delivery1024×683, khoảng37KB, Sharp resize/encode WebP quality84; không ghép
hay vẽ lại. [Prompt/provenance](velvet.webp.json) lưu nguyên prompt và tool.
Nguồn PNG được giữ trong generated_images của phiên; production dùng file local
ở thư mục này. Scan/embedding của engine dùng sidecar cho WebP.

Linh vật tiền cảnh dùng lại `../penguins/auction.png`, không tạo lại nhân vật.
Fallback giữ `../book-journey/auction.webp`; provenance ở các thư mục nguồn.
Các ảnh này có alt rỗng/aria-hidden và không nhận pointer.
