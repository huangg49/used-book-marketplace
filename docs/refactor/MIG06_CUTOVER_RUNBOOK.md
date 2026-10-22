# MIG-06 — Runbook chuyển dữ liệu và cutover sang MongoDB

29/09/2026, nhánh `codex/mongodb-refactor`. Nền: [ADR 0027](../adr/0027-mongodb-persistence-protocol.md),
[bản đồ](MIG02_MODEL_MAP.md). Không ghi dump, URL hay token vào Git.

## Nguyên tắc

- PostgreSQL chỉ được **đọc** (một snapshot `REPEATABLE READ READ ONLY`). Không reset,
  không sửa migration cũ, không đổi seed password, không xóa volume `postgres_data`.
- Import vào một database MongoDB **mới đã migrate**, chỉ có reference/tài khoản
  hệ thống do migration tạo. Importer từ chối database đích có dữ liệu nghiệp vụ.
- Không ghi kép. Trong cửa sổ cutover API dừng ghi (dừng API + worker), import, kiểm,
  rồi chỉ khởi động bản MongoDB.
- Bằng chứng chỉ gồm số lượng, hash nội dung, kết quả kiểm toàn vẹn — không dữ liệu cá nhân.

## Các bước

1. Dừng API, media worker, order worker bản PostgreSQL. Sao lưu volume PostgreSQL
   (ví dụ `docker run --rm -v used-book-marketplace_postgres_data:/v -v "$PWD":/b alpine tar czf /b/pg-backup.tgz -C /v .`;
   file sao lưu **không** đưa vào Git).
2. Khởi động MongoDB dev/prod (replica set có auth): `pnpm infra:up` (dịch vụ `mongo`).
   Cài đặt đã có `.env` từ trước (setup:local không ghi đè): tự thêm vào root `.env`
   `MONGO_ROOT_PASSWORD` (ngẫu nhiên) và `MONGO_PORT` nếu 27017 bận; vào `apps/api/.env`
   các dòng `MONGODB_*` theo `apps/api/.env.example` với mật khẩu ngẫu nhiên riêng, cùng
   mật khẩu root ở `MONGODB_ADMIN_URL`. Giữ `DATABASE_URL` cũ làm `SOURCE_DATABASE_URL`
   cho bước 5; API không còn đọc `DATABASE_URL`. PostgreSQL dev giờ ở profile
   `legacy-postgres` (`docker compose --env-file .env -f infra/docker-compose.yml --profile legacy-postgres up -d postgres`).
3. Tạo user tối thiểu quyền: `pnpm --filter @used-books/api mongo:bootstrap`
   (`MONGODB_ADMIN_URL`, `MONGODB_DATABASE`, `MONGODB_APP_PASSWORD`, `MONGODB_MIGRATOR_PASSWORD`).
4. Migrate: `pnpm --filter @used-books/api mongo:migrate` (`MONGODB_MIGRATOR_URL`).
5. Import: `SOURCE_DATABASE_URL=<postgres> pnpm --filter @used-books/api mongo:import-postgres -- --report=<ngoài repo>`.
   Importer kiểm lịch sử 17 migration nguồn, số lượng từng collection, hash nội dung,
   số thời điểm bị cắt micro giây, rồi chạy toàn bộ kiểm bất biến (`checkIntegrity`)
   gồm bảo toàn 100.000.000 VND vốn mô phỏng. `ok=false` ⇒ dừng, không mở traffic.
6. `pnpm --filter @used-books/api mongo:check` lần nữa trên đích; lưu kết quả.
7. Chuyển `.env` API/worker sang `MONGODB_URL` (user `latlai_app`), build, khởi động
   API + media worker + order worker cùng bản. Kiểm `/api/v1/health/ready`.
8. Phiên cũ: session (refresh token hash) được import nguyên vẹn nên người dùng không
   phải đăng nhập lại; access token JWT vẫn hợp lệ vì `sid`/`sub` giữ nguyên UUID.
9. Cursor phân trang cũ (v1) bị từ chối 400; client tải lại danh sách.

## Rollback

- **Trước khi mở ghi trên MongoDB**: chỉ cần khởi động lại bản PostgreSQL (dữ liệu nguồn
  chưa đổi) và bỏ database MongoDB đích.
- **Sau khi MongoDB đã nhận ghi mới**: không trỏ ngược PostgreSQL (dữ liệu đã lệch).
  Không có importer ngược. Phải dừng ghi, xuất các thay đổi từ `mutation_receipts`/
  `audit_events` sau thời điểm cutover và đối soát thủ công; quyết định do chủ dự án.
  Vì vậy chỉ mở traffic ghi sau khi bước 5–7 đạt.

## Giới hạn đã biết

- Tương thích địa danh ADR0039 (22/10/2026): nguồn F2h giữ nguyên hai locality
  DEMO-A/B và nhãn cũ; đích đã migrate0030 giữ ba locality TP.HCM/Bình Dương/
  Vũng Tàu. Importer chỉ chấp nhận đúng cặp reference snapshot đã biết, đối chiếu
  A/B với nhãn đích và giữ DEMO-C là reference Mongo-native. Báo cáo count/hash
  của bảng nguồn vẫn chỉ tính hai hàng tương ứng; nguồn PostgreSQL không bị ghi.
  Mọi drift khác ở nguồn hoặc đích vẫn bị từ chối trước khi nhập dữ liệu nghiệp vụ.
  Không sửa migration đã áp dụng hoặc bỏ kiểm tra reference để né lỗi.

- Thời điểm micro giây bị cắt về mili giây; importer báo số lượng theo collection.
  Validator có thể từ chối một bản ghi nếu hai mốc chỉ khác nhau dưới 1 ms theo chiều
  bất lợi — khi đó import dừng và cần xử lý có chủ đích, không tự sửa.
- Import ghi theo lô, không trong một transaction: nếu lỗi giữa chừng, drop database đích,
  migrate lại và chạy lại (nguồn không đổi).
