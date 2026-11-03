# Logo mới — chủ dự án cung cấp, 10/10/2026

`logo-original.png` giữ nguyên pixel của `C:/Users/ASUS/Documents/LaiLai/Logo.png`.
Chủ dự án yêu cầu dùng logo này cho Member web. Header dùng hai cửa sổ CSS lấy
biểu tượng và chữ từ cùng ảnh gốc; không vẽ lại hoặc thay đổi dấu tiếng Việt.
Màu nền đo từ ảnh: RGB(92, 2, 2), `#5c0202`.

`hero-lettering.png` lấy từ bản `Hero text final.png` chủ dự án cung cấp cùng
ngày: SÁCH MỚI. CHƯƠNG MỚI. CÙNG LẬT LẠI. Giữ nguyên toàn bộ pixel RGBA,
chữ/dấu/màu và minh họa; chỉ bỏ lề alpha=0 bên ngoài, chừa16px an toàn. Bản
delivery1313×655 PNG lossless, không resize/vẽ lại/nén mất dữ liệu. Sidecar
`hero-lettering.png.json` ghi source SHA256 và crop box. Kiểm raw RGBA xác nhận
bản delivery trùng vùng tương ứng của source. H1 chứa câu chữ tương ứng, ảnh
alt rỗng/aria-hidden tránh đọc lặp. Đây là câu thương hiệu chủ dự án chọn,
không khẳng định tình trạng sách trong marketplace; description vẫn ghi sách cũ.

## Bản WebP lossless cho Member web — 03/11/2026

`logo-original.webp` và `hero-lettering.webp` lấy từ hai PNG bên trên.
Sharp 0.35.4 / libvips 8.18.6 / libwebp 1.6.0 dùng
`sharp(input).webp({ lossless: true, effort: 6 }).toFile(output)`.
So RGBA sau giải mã bằng Sharp, cả hai ảnh khớp từng byte và giữ kích thước
2000×2000 / 1313×655. PNG gốc giữ làm nguồn và phương án dự phòng.

- Logo WebP 17.920 B, SHA256
  `7f20fb541f993095877344be8c93d40c0eaf9157f5294b968ccfe2ed1e0430f8`.
- Hero WebP 51.636 B, SHA256
  `1b3c1daefa79a51edac997536d6b5c9589999e1bc196b156e80c7ac10d05633e`.

Home preload đúng WebP. Ảnh chuyển sang PNG một lần nếu WebP tải lỗi.
