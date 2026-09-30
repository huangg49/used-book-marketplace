# Chuyển cấu hình local cho người tiếp nhận

Chủ dự án có thể chuyển các file dưới đây qua kênh riêng cho teammate được phép.
Không upload vào GitHub, không paste key vào prompt/chat. Tài liệu chỉ chứa tên
file/biến; không chứa giá trị cấu hình thật. Hướng dẫn cập nhật cho MongoDB ngày
30/09/2026; file local cũ cần đối chiếu với `.env.example`, không chép đè tự động.

| File tương đối từ root repo | Dùng cho | Cần làm ở máy mới |
|---|---|---|
| `.env` | Docker Compose/local port và cấu hình root | `MONGO_PORT` và `MONGO_ROOT_PASSWORD` phải khớp port/credential trong URL admin của API; `POSTGRES_PORT` chỉ dành cho import legacy |
| `apps/api/.env` | API, worker, bootstrap/migrate/seed; có Supabase server key và secret simulator/JWT | Đối chiếu `MONGODB_URL`, `MONGODB_MIGRATOR_URL`, `MONGODB_ADMIN_URL`, database/password bootstrap, CORS và key backend với `.env.example` |
| `apps/mobile-react-native/.env` | URL API của RN, cờ preview/nội bộ | Chỉnh EXPO_PUBLIC_API_BASE_URL theo emulator/điện thoại; chỉ cấu hình public. C01 opt-in theo [README RN](../../apps/mobile-react-native/README.md); default ẩn ví, không là quyền API |
| `apps/admin-web/.env` | URL API operations web | Chỉnh VITE_API_BASE_URL theo máy chạy API; chỉ chứa cấu hình public |

Không có `apps/mobile-flutter/.env` trên máy này; Flutter chưa là ưu tiên.
Nếu cần Flutter sau, tạo từ `.env.example` tương ứng. Không cần giao `.env` của
node_modules, Expo cache, build output, DB dump hoặc các fixture test.

## Cách khuyến nghị để teammate bắt đầu

1. Clone main; dùng Node/pnpm theo repo rồi chạy `pnpm install --frozen-lockfile`
   và `pnpm setup:local`. Script tạo bốn file khi thiếu và không ghi đè file có sẵn.
2. Script sinh JWT_ACCESS_SECRET, PAYMENT_SIMULATOR_SECRET và mật khẩu MongoDB
   root/app/migrator local mới. Nếu chỉ một trong hai file root/API vừa được tạo,
   đồng bộ credential tương ứng theo hướng dẫn của script. Giữ
   secret mới trên máy riêng khi không cần chia sẻ session/simulator với máy cũ;
   không cần dùng chung mọi secret chỉ để chạy project.
3. Chủ dự án chuyển riêng cấu hình storage cần dùng: SUPABASE_URL,
   SUPABASE_STORAGE_KEY, SUPABASE_MEDIA_BUCKET trong `apps/api/.env`. Có thể
   chuyển cả bốn file làm tham chiếu rồi teammate đối chiếu, không chép đè mù quáng.
   Key này là server credential, tuyệt đối không chuyển vào EXPO_PUBLIC_* hoặc VITE_*.
4. API/worker dùng MongoDB replica set; Supabase chỉ lưu media. Chép `.env`
   không chép tài khoản/dữ liệu hiện có; máy mới bootstrap/migrate/seed theo START_HERE.
   Seed không tự đổi mật khẩu của account đã tồn tại. Không reset DB cũ để làm lại.
   PostgreSQL chỉ còn làm nguồn import theo [runbook](../refactor/MIG06_CUTOVER_RUNBOOK.md),
   dùng `SOURCE_DATABASE_URL`; không dùng URL này làm cấu hình runtime API.
5. Nếu tách môi trường storage, dùng bucket dev riêng đã tạo/cấu hình đúng và
   sửa SUPABASE_MEDIA_BUCKET. Dùng chung project/bucket nghĩa là chia sẻ tài nguyên
   và quyền truy cập; phối hợp worker/cleanup, không chạy cleanup thử trên ảnh của nhau.

## Các giá trị phụ thuộc máy

- Web trên cùng máy: API thường `http://localhost:3000/api/v1`.
- Android Emulator: dùng `http://10.0.2.2:3000/api/v1`, hoặc localhost khi đã
  cấu hình `adb reverse tcp:3000 tcp:3000`; Metro debug có thể cần reverse 8081.
- Điện thoại thật: IP LAN của máy chạy API, cùng mạng và firewall phù hợp;
  localhost trên điện thoại không trỏ đến máy tính.
- CORS_ORIGINS khớp origin web thực tế của operations/RN web; localhost và
  127.0.0.1 là hai origin khác nhau. Không sửa auth guard để né lỗi CORS.
- API và media/order worker dùng cùng cấu hình/version; sau thay config cần
  khởi động lại đúng process. Không giết toàn bộ node/java trên máy.
- `MONGO_TEST_URL` trỏ replica set QA riêng (`pnpm infra:mongo:test:up`), database
  kết thúc `_test`, theo START_HERE; không dùng `MONGODB_URL` của app để chạy E2E.
  Browser suite cũng dùng replica set này và tự tạo database `_test` riêng.
- `TEST_DATABASE_URL` chỉ dành cho test import PostgreSQL → MongoDB, trỏ database
  PostgreSQL QA kết thúc `_test`; không dùng DB nguồn đang chạy. Các biến QA này
  không phải file env thứ năm cần gửi và không cần chia sẻ secret môi trường thật.

## Kiểm trước khi commit

`git status --short` không được có file env thật. Repo đã ignore `.env`/`.env.*`
trừ `.env.example`; không dùng `git add -f` để đưa secret vào Git. Ví dụ công khai
chỉ giữ placeholder. Khi cần hỗ trợ, gửi tên biến, loại lỗi và request ID hợp lệ,
không gửi key/password/URL ký riêng tư.

Setup đầy đủ: [START_HERE](START_HERE.md), [media setup](../features/SUPABASE_MEDIA_SETUP.md),
[Android](../ANDROID_QUALITY.md). Việc chuyển key do chủ dự án thực hiện qua kênh
riêng; agent không tự gửi các file chứa secret cho người khác.
