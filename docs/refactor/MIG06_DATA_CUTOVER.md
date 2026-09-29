# MIG-06 — Chuyển dữ liệu và cutover sang MongoDB

29/09/2026, nhánh `codex/mongodb-refactor`. Cách làm: [runbook](MIG06_CUTOVER_RUNBOOK.md).
Nền: [ADR 0027](../adr/0027-mongodb-persistence-protocol.md), [MIG-05](MIG05_QUOTE_ORDER_WALLET_SHIPMENT.md).

## Đã làm

- **Runtime chỉ còn MongoDB**: gỡ `DatabaseService`/Prisma, yêu cầu `DATABASE_URL`,
  probe PostgreSQL ở `/health/ready`, script/config/seed Prisma và dependency
  `@prisma/*`, `prisma`. `prisma/migrations` + `schema.prisma` giữ làm lịch sử chỉ đọc
  cho importer (không sửa migration cũ).
- **Importer** `mongo:import-postgres`: snapshot `REPEATABLE READ READ ONLY`, kiểm đúng
  17 migration nguồn, đếm + hash nội dung từng collection, đếm mốc bị cắt micro giây,
  thay journal/tài khoản mở đầu của 0002 bằng bản gốc PostgreSQL, đặt counter sequence,
  rồi chạy `checkIntegrity` (mọi kiểm C trên toàn DB + đối soát sổ cái). Từ chối đích
  đã có dữ liệu nghiệp vụ hoặc nguồn khác lịch sử.
- **`mongo:check`**: đối soát toàn DB chỉ đọc, dùng định kỳ và sau import.
- **Thiết lập**: `pnpm setup:local` sinh mật khẩu MongoDB root/app/migrator dùng chung
  cho root `.env` và `apps/api/.env`; `db:bootstrap`/`db:migrate`/`db:seed` chạy CLI Mongo;
  `infra:up` khởi động dịch vụ `mongo` (replica set có auth, volume `mongo_data`);
  PostgreSQL chỉ còn profile `legacy-postgres`. URL dev dùng `directConnection=true`
  để đổi `MONGO_PORT` không làm hỏng phát hiện replica set.
- **doctor:local** kiểm MongoDB: kết nối bằng app user, replica set, checksum migration,
  job media quá hạn.
- **Test/CI**: E2E không còn cần PostgreSQL (chỉ test import dùng `TEST_DATABASE_URL`,
  tự bỏ qua nếu thiếu). Harness browser tạo database `ops_browser_*_test` riêng với user
  tối thiểu quyền rồi xóa. `api-ci` chạy unit + Mongo + import + E2E trên replica set QA
  (gộp lane `api-mongo-ci` cũ); `operations-ci` dùng MongoDB; `infrastructure-ci` kiểm cả
  ba file compose.
- Tài liệu thiết lập (README, AGENTS, START_HERE, RN start, API README, Supabase setup)
  cập nhật; báo cáo tính năng lịch sử giữ nguyên.

## Bằng chứng

| Kiểm | Kết quả |
|---|---|
| Unit API | 33/33 PASS |
| Suite MongoDB (probe, failover 3 node, migration/quyền, import PostgreSQL) | 37/37 PASS |
| E2E API toàn bộ, một lượt, database mới | 493/493 PASS (24 file, không đặt `TEST_DATABASE_URL`) |
| Browser operations (admin-web, API/Mongo thật, storage giả) | PASS |
| Browser RN web: kệ công khai, sổ địa chỉ, hành trình listing | 3/3 PASS |
| API typecheck, lint, build; compose config ×3 | PASS |
| Dry-run import DB dev (PostgreSQL 5433 → `latlai_dryrun_test`, chỉ đọc nguồn) | ok, 0 lệch đếm/hash, 0 lỗi toàn vẹn, vốn 100.000.000 bảo toàn |
| Clone sạch → install → setup:local → compose → bootstrap/migrate/seed → build → API | PASS (xem dưới) |

Dry-run: users 4, sessions 9, listings 2, revisions 5, media 4, receipts 34, audit 101,
1 journal. Sau đó dừng container dev, xóa database nháp; không ghi dump/URL vào Git.

Clone sạch (thư mục tạm, compose project riêng `latlai_fresh_check`): cổng 27017 trên máy
đang bận nên đã đi đúng nhánh tài liệu (đặt `MONGO_PORT=27117` và sửa port trong URL
`MONGODB_*`). Bootstrap tạo user, migrate áp 3 migration, seed 4 tài khoản; API build và
khởi động, `/health/ready` ok, đăng nhập tài khoản seed 200, kệ công khai 200;
`doctor:local` PASS toàn bộ mục DB/migration/readiness (WARN storage chưa cấu hình, URL RN
localhost — đúng kỳ vọng); `mongo:check` cân bằng; chạy lại migrate không đổi gì. Đã gỡ
project, volume và thư mục tạm.

## Chưa xong / cần chủ dự án

1. **Cutover dữ liệu thật chưa thực hiện**: `.env` local và volume PostgreSQL của chủ dự án
   không bị sửa. Để chạy nhánh này với dữ liệu hiện có, làm theo runbook (thêm các biến
   `MONGODB_*` và `MONGO_ROOT_PASSWORD`, `infra:up`, bootstrap, migrate, import,
   `mongo:check`). Chưa import thì API trên nhánh này dùng database MongoDB rỗng.
2. **CI chưa chạy trên GitHub** (chưa push); các workflow mới chỉ được kiểm cục bộ bằng
   chạy cùng lệnh.
3. **Native acceptance** (Android/iOS, TalkBack, ARM) chưa chạy trên bản MongoDB; gate mở.
4. Review độc lập về tiền/quyền chưa có (chỉ phê duyệt của chủ dự án).
5. Các giới hạn tầng ứng dụng/hiệu năng ở [MIG-05](MIG05_QUOTE_ORDER_WALLET_SHIPMENT.md)
   và [MIG-04](MIG04_CATALOG_LISTING_MEDIA.md).
