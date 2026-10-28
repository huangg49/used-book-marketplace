# Bể cá Lật lại — asset rời v2

Owner duyệt thử một bể27/10/2026, sau đó yêu cầu cá vector-like đơn giản/cute,
không cá nhiều vảy/chi tiết. Đây là raster minh họa phong cách vector, không
phải SVG vector có thể sửa path. Tất cả được tạo bằng built-in image_gen,
không dùng API key/CLI, không lấy asset từ thư viện bên ngoài.

| File | Kích thước | Byte | Dùng cho |
| --- | --- | --- | --- |
| [fish-body.webp](fish-body.webp) | 512×347 | 21614 | Thân cá hướng phải, không đuôi; root gần x0/y55% |
| [tail.webp](tail.webp) | 320×327 | 15880 | Đuôi rời, hinge phải x98%/y52% |
| [ribbon-plant.webp](ribbon-plant.webp) | 360×531 | 44252 | Rong dải, root dưới giữa |
| [broad-plant.webp](broad-plant.webp) | 360×710 | 52426 | Cây lá tròn, root dưới giữa |
| [pebbles.webp](pebbles.webp) | 400×262 | 14546 | Hai đá cuội, một lớp riêng |
| [water.webp](water.webp) | 1200×800 | 28624 | Nền nước/cát, không cá/cây/đá |

Tổng177342byte (~173.2KiB). Năm cutout có alpha thật; water là opaque.
File PNG gốc vẫn ở thư mục generated_images mặc định của image_gen; không
nhân bản PNG lớn vào repo. Derivative WebP trim alpha-padding/resize/encode95,
không vẽ lại nhân vật bằng code. Body v1 nhiều chi tiết bị loại, không dùng.
Nguồn basename/SHA256 và nguyên văn prompt từng asset ở
[prompt set](../../../../../../docs/design/ADMIN_AQUARIUM_PROMPTS.json).

[manifest.json](manifest.json) được runtime dùng để tải file. Muốn thay hình,
giữ id và cập nhật width/height/bytes; hinge được đặt trong scene.mjs. Thân/đuôi
chuyển động độc lập; cây dùng root-pinned affine sway một draw, không cắt lát gây
seam. Không dùng filter đổi màu ảnh. Bọt/vòng nước là hình học Canvas native.

Xem [ghi chú triển khai và kiểm chứng](../../../../../../docs/design/ADMIN_AQUARIUM_STUDY.md).
