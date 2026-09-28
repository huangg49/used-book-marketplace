# Kết nối kho ảnh miễn phí của Lật lại

Chọn **Supabase Free**. Không nâng lên Pro, không bật add-on trả phí.
Phần này chỉ nối kho ảnh; không chuyển auth hay database nghiệp vụ sang Supabase.

## Bạn cần làm một lần

1. Tạo/chọn **project riêng cho Lật lại** ở Supabase Free. Không dùng chung project
   đang chứa dữ liệu quan trọng của ứng dụng khác. Ghi lại Project URL.
   URL có dạng `https://YOUR-PROJECT.supabase.co`, không có đuôi `/rest/v1/`.
2. Trong Storage, tạo bucket `latlai-media`, **Private**, giới hạn mỗi file
   **10.000.000 byte** (10 MB), cho phép `image/jpeg`, `image/png`, `image/webp`.
   Lưu ý ô nhập `10 MB` trên dashboard có thể lưu thành **10.485.760 byte (10 MiB)**;
   adapter cố ý từ chối mức này. Kiểm tra giá trị thực qua API hoặc đặt đúng
   `fileSizeLimit: 10000000` bằng Storage SDK quản trị.
   Không thêm policy đọc/ghi cho `anon` hoặc `authenticated` vào bucket này;
   ứng dụng sử dụng NestJS và khóa server để kiểm soát truy cập.
3. Trong `apps/api/.env` trên máy của bạn, thêm các dòng dưới. Lấy khóa **server
   secret** hoặc **legacy service_role** trong phần API Keys của project. Không
   gửi giá trị khóa qua chat, không đưa vào Git hoặc biến `EXPO_PUBLIC_*`.

```dotenv
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_STORAGE_KEY=YOUR-SERVER-KEY
SUPABASE_MEDIA_BUCKET=latlai-media
MEDIA_STORAGE_BUDGET_BYTES=800000000
```

Nếu chưa có tài khoản, API auth/catalog/drafts vẫn chạy khi cả URL và key trống.
Upload thật sẽ báo kho ảnh chưa sẵn sàng; hệ thống không tự đổi sang kho giả.

## Kiểm tra và chạy

Từ repository root, sau khi PostgreSQL đã chạy và cấu hình `DATABASE_URL` đúng:

```sh
pnpm db:generate
pnpm db:migrate
pnpm --filter @used-books/api media:check
pnpm --filter @used-books/api media:probe
```

`media:check` chỉ đọc cấu hình bucket. `media:probe` tạo đúng một ảnh kỹ thuật 2×2,
kiểm tra upload/read/link tạm thời và chặn public read, rồi xóa ảnh trong `finally`.
Không in khóa hoặc signed URL. Nếu cleanup thất bại, kiểm tra thư mục `probe/`.
Hai lệnh chỉ được coi là đạt khi trả exit code 0. Cả hai đã chạy thành công với
Supabase thật ngày 26/09/2026; xem bằng chứng và phạm vi trong báo cáo media.
CLI cho biết bước thất bại và tên biến bị thiếu, không in khóa hoặc phản hồi lỗi
thô từ provider. Sau khi sửa `.env`, khởi động lại cả API lẫn worker.

Mở ba terminal riêng:

```sh
pnpm dev:api
pnpm dev:media
pnpm dev:rn
```
`dev:media` gọi Nest CLI biên dịch rồi chạy entry point `media-worker`, tương tự
Order worker. Không thay bằng `tsx src/media-worker.ts`: đường đó thiếu constructor
metadata cho dependency injection. Production dùng `worker:media:prod` sau API build.


Đăng nhập Member → **Bản nháp của tôi** → tạo/mở nháp → chọn ảnh → chờ xử lý →
**Lưu bản nháp** → quay lại và mở lại. Chưa có bước gửi duyệt trong màn hình này.
Không chạy worker thì ảnh sẽ giữ trạng thái Processing; đây không phải thành công.

Điện thoại thật dùng API LAN URL theo [hướng dẫn RN](../REACT_NATIVE_START.md).
Browser web cần HTTPS hoặc localhost để Web Crypto hoạt động. Không mở Expo web
qua HTTP LAN rồi coi lỗi SHA-256 là lỗi Supabase. Native crypto không có giới hạn
secure-origin của trình duyệt.

## Giữ trong gói Free

- Giữ bucket riêng tư, không upload thủ công file khác vào bucket do hệ thống quản lý.
- Theo dõi Storage và Egress trong dashboard. Reservation 800 MB để chừa khoảng trống
  dưới 1 GB; sau khi xử lý thành công giảm giữ chỗ về mức cần thiết.
- Ảnh gốc, ảnh đầu ra, ảnh lỗi còn giữ và retry đều chiếm dung lượng. Không suy ra số
  sách chỉ bằng cách lấy 1 GB chia kích thước thumbnail.
- Giữ nguyên Free plan. Khi vượt quota, có thể bị hạn chế dịch vụ; hệ thống không
  hứa hoạt động không giới hạn. Không tự nâng gói để chữa lỗi 503.
- Kiểm tra project có bị pause trước buổi demo. Khôi phục bằng dashboard nếu cần.
- API/worker/database chạy trên máy team để không phát sinh phí hosting trong demo.
  Điều này không phải triển khai online 24/7 và không thay thế backup.

Tham khảo: [ADR 0008](../adr/0008-free-private-media-storage.md),
[báo cáo kiểm thử](MEDIA_UPLOAD_REPORT.md),
[Supabase pricing](https://supabase.com/pricing).
