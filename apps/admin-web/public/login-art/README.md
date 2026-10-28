# Login Admin — minh họa đã chốt, 26/10/2026

- `admin-meadow-v3.png`: nền kem/olive/đỏ hồng, không có sách.
- `admin-books-v3.png`: cụm sách1254×1254 PNG alpha riêng.
- Hai ảnh tạo bằng built-in ImageGen, bản copy dùng trong runtime Admin. Nguồn/
  [prompt đầy đủ](../design/login/assets/prompts-v3.json) và prototype được giữ
  trong [design/login](../design/login/README.md). Không cần API key khi chạy app.
- `ivory-paper.webp` là texture có sẵn, dùng cùng User Login; SHA256 đối chiếu
  hai app trùng nhau. Font Bricolage có sẵn trong `public/fonts/auth`.

Login thật ở `src/features/auth/LoginPage.tsx`; CSS module điều khiển riêng nền,
sách và huy hiệu. Logo dùng ảnh gốc `public/brand/logo-original.png` qua cùng
filter mực như User AuthLayout; khung huy hiệu dựng bằng CSS, không gen lại logo.
