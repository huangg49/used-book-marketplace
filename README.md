# Lật lại — Used-Book Marketplace

**Sách cũ. Chương mới.** Nền tảng chuyền tay sách, dùng chung NestJS API cho các client.

![Lật lại](packages/brand/applications/github-banner.png)

## Bắt đầu

- Thành viên nhóm: [hướng dẫn Windows](docs/handoff/TEAM_WINDOWS.md), rồi [setup chi tiết](docs/handoff/START_HERE.md).
- Tiếp tục công việc: [điểm lưu hiện tại](docs/handoff/SESSION_STATE.md).
- Làm việc bằng AI trong nhóm: [cửa vào, skills và cách giao việc](docs/AI_WORKFLOW.md).
- Tra tài liệu: [mục lục](docs/README.md); trước mở nghiệp vụ mới đọc [release gates](docs/handoff/READINESS.md).

## Trạng thái sản phẩm

Cập nhật09/10/2026, source main `da59199`: OpenAPI **0.30.0**,15 migration Mongo.
Catalog/listing, purchase chat24h, đấu giá web/realtime và inbox đã có.
DirectDelivery tới F2h; ViaPoint đấu giá có source inspection/claim/settlement,
nhưng gate nghiệm thu vẫn mở. Xem [trạng thái](docs/handoff/SESSION_STATE.md).
SRS1.1 là yêu cầu mục tiêu, không phải danh sách tính năng đã triển khai.

| Thành phần | Thực trạng |
| --- | --- |
| React Native / Expo web | Client Member chính: phiên, kệ/chi tiết, đăng sách, địa chỉ |
| User web React/Vite | Kệ/tìm/chi tiết/đăng sách, purchase chat, đấu giá và thông báo; Exchange/register/profile còn mock/scaffold |
| Admin web | Duyệt catalog/listing và xem danh sách user; chưa có lock/unlock user |
| Flutter | Scaffold, chưa có auth/API feature tương đương RN |
| NestJS API | MongoDB replica set; catalog/media, quote/Order, ví/carrier mô phỏng, purchase/auction/point-order/notification |
| Media / Order workers | Process riêng, trạng thái bền vững trong MongoDB; ảnh ở Supabase Storage |

CI tích hợp đã đạt; full native và review người thật vẫn còn phần mở. Phạm vi từng
bằng chứng nằm ở READINESS, không suy thành production-ready.

## Chạy local

Node theo [.nvmrc](.nvmrc), pnpm theo [package.json](package.json), Docker Desktop
Linux containers. Trong root:

```powershell
pnpm install --frozen-lockfile
pnpm setup:local
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait mongo
pnpm db:bootstrap
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

Mỗi người dùng database/credential riêng. Seed tạo4 tài khoản local, không tạo sẵn
sách. Chạy client phụ trách ở terminal khác: pnpm dev:rn hoặc pnpm dev:admin.
Chạy hằng ngày bằng hai terminal: `pnpm dev:api` (Mongo/API/hai worker) và
`pnpm dev:rn` (A Android, W Expo web), `pnpm dev:user` cho React/Vite user-web,
hoặc `pnpm dev:admin` cho admin. Upload cần cấu hình
[Supabase](docs/features/SUPABASE_MEDIA_SETUP.md). Xem
[hướng dẫn chạy](docs/DEVELOPMENT.md) để phân biệt setup một lần, build APK và
chạy hằng ngày. Launcher không tự seed/migrate/reset dữ liệu.

API: http://localhost:3000/api/v1 · Swagger: http://localhost:3000/docs · Admin: http://localhost:5173 · User web: http://localhost:5174.

## Cấu trúc repository

| Thư mục | Vai trò |
| --- | --- |
| apps/ | API và các client |
| packages/ | Contract, session client, brand dùng chung |
| infra/ | Docker Compose và cấu hình MongoDB |
| scripts/ | Setup, build và công cụ kiểm tra |
| docs/ | Hướng dẫn, yêu cầu, quyết định và bằng chứng |
| .agents/skills/ · .claude/skills/ | Quy trình AI dùng chung và adapter Claude, đi theo Git |

Các file cấu hình ở root cần cho Git/pnpm/Node và công cụ. node_modules/, .tmp/,
.env chỉ là dữ liệu local, không thuộc bản bàn giao Git; không xóa mù quáng khi có
process hoặc thông tin phục hồi đang dùng. PostgreSQL migrations giữ làm lịch sử import.

Quy tắc đóng góp: [CONTRIBUTING](CONTRIBUTING.md), [TEAMWORK](docs/TEAMWORK.md).
Hướng dẫn agent: [AGENTS](AGENTS.md); báo lỗi bảo mật theo [SECURITY](SECURITY.md).
