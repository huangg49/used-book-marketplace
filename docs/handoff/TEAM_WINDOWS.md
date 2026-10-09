# Nhóm Windows — bắt đầu phát triển trên MongoDB

Cập nhật09/10/2026: mỗi thành viên chạy database riêng bằng Docker.
Owner/reviewer theo nhiệm vụ hiện hành; bảng dưới là ranh giới code,
không phải chứng nhận tính năng đã hoàn thành. Dữ liệu trên máy chủ dự án được bảo toàn riêng,
không phát dump, session hay storage key cho cả nhóm qua Git.

## Thiết lập chung

Theo [START_HERE](START_HERE.md) và [ENV_HANDOFF](ENV_HANDOFF.md): clone main
(MongoDB đã tích hợp qua [PR5](https://github.com/huangg49/used-book-marketplace/pull/5)),
Node >=24.15/pnpm11.19, Docker Desktop Linux containers.
Trong PowerShell tại root repo:

```powershell
pnpm install --frozen-lockfile
pnpm setup:local
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait mongo
pnpm db:bootstrap
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

Nếu port27017 bận, sửa `MONGO_PORT` và port trong các URL Mongo của API cho khớp.
Không dùng database acceptance hay URL của máy chủ dự án. Seed hiện tạo4 tài khoản
local theo `DEV_SEED_PASSWORD`, không có sẵn kệ sách demo. Tạo dữ liệu sách qua API/UI;
không tự thêm số dư, role hoặc trạng thái duyệt bằng database editor.
API/worker dùng app user, migration dùng migrator, không chạy API bằng root.
`setup:local` chưa tạo env user-web; nếu cần, tạo từ `apps/user-web/.env.example`,
giữ file đã có. Backend `CORS_ORIGINS` phải chứa đúng origin web5174 đang dùng.

Storage là bước cấu hình riêng: bucket dev riêng của thành viên, cấu hình backend
theo [Supabase media](../features/SUPABASE_MEDIA_SETUP.md). Chưa có storage thì ghi rõ
upload chưa chạy; không dùng bucket nguồn để thử cleanup. Media worker chạy bằng
launcher `pnpm dev:api` sau khi đã cấu hình đúng bucket/database; không mở thêm
worker trùng. Chạy hằng ngày chỉ cần `dev:api` và `dev:rn` (A Android/W web),
`dev:user` cho React/Vite user-web hoặc `dev:admin`. Build/cài development APK và môi trường theo
[DEVELOPMENT](../DEVELOPMENT.md).

## Ranh giới để phân công sau

Nếu dùng AI, mở tại root repo và làm theo [AI_WORKFLOW](../AI_WORKFLOW.md).
Hướng dẫn/skills được chia sẻ qua Git; memory cá nhân và lịch sử chat không đi theo pull.

| Phần | Nơi làm việc | Trạng thái và cách bắt đầu |
| --- | --- | --- |
| API dùng chung | `apps/api`, `packages/api-contract` | NestJS/MongoDB; contract-first, không tự đổi endpoint riêng cho từng client |
| Admin web | `apps/admin-web` | Có catalog/listing review và quản lý user; `pnpm dev:admin`, xem README của app |
| Expo web | `apps/mobile-react-native` | `pnpm dev:rn` rồi W; cùng feature/session của RN |
| User web React/Vite | `apps/user-web` | App riêng đã có trên main; `pnpm dev:user` (5174), API/CORS theo env example; Exchange/register/profile còn mock/scaffold |
| React Native | `apps/mobile-react-native` | Client thành viên chính, Android emulator; `pnpm dev:rn`, xem REACT_NATIVE_START và ANDROID_QUALITY |
| Flutter | `apps/mobile-flutter` | Hiện chỉ scaffold `lib/main.dart`, chưa có auth/API feature. `flutter pub get`, `flutter run` trong app; không coi chạy màn scaffold là parity với RN |

Mỗi feature một nhánh `codex/...` hoặc prefix nhóm thống nhất. Trước sửa API, thống nhất
contract với người làm client. Không tự mở Delivered/settlement khi release gate còn mở.
Không cần mỗi người chạy mọi client/worker; chỉ phần đang phát triển và dependency thật.

## Tiêu chí nhận bàn giao

- Thành viên tự bootstrap/migrate/seed local, API ready và đăng nhập bằng seed local.
- Chạy được client mình phụ trách; ghi rõ feature nào hiện thực, feature nào scaffold.
- Thay đổi permission/session/transaction có negative/race test tương ứng.
- QA dùng replica set riêng `pnpm infra:mongo:test:up` và `MONGO_TEST_URL`; không chạy
  E2E trên database dev. Xem START_HERE cho PowerShell và test import PostgreSQL riêng.
- CI xanh là điều kiện tích hợp code; không đồng nghĩa human review, native toàn diện
  hoặc cutover dữ liệu chính đã hoàn tất. Nhóm hiện chưa có reviewer độc lập được chỉ định.
