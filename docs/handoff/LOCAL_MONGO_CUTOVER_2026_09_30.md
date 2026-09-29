# Máy chủ dự án — chuyển cấu hình local sang MongoDB

30/09/2026. Chủ dự án yêu cầu bảo toàn toàn bộ dữ liệu trên máy và cho phép tích
hợp code sau kiểm tra. Đây là cutover local để phát triển, không phải deploy hoặc
chứng nhận release/human review.

## Quyết định dữ liệu

PostgreSQL5433 đã được import sang Mongo acceptance57117 trong lượt trước. Không
import lại đè Mongo: bản này đã nhận thay đổi QA hợp lệ qua API. Đối chiếu lần này
dùng snapshot PostgreSQL read-only và cùng hàm `toDocuments` của importer:

- Không thiếu bản ghi nguồn; cùng4 users,21 sessions,3 listings/revisions,7media/links/jobs.
- Mongo thêm1 address book/address/identity và2 mutation receipt/audit event.
- Bản ghi có thay đổi: lockSeq; một phiên có refresh hash mới; một listing/revision
  có version/bookId mới từ lượt QA đã ghi ở SESSION_STATE. Các receipt/audit nguồn
  giữ nguyên nội dung. Các collection khác không khác field từ nguồn đã chuyển đổi.
- Sách/tiền không được dựng lại bằng seed hoặc ghi database để ép trạng thái.
  Toàn bộ nguồn PostgreSQL và snapshot Mongo được giữ để truy hồi phiên bản trước.

Vì vậy dùng chính bản Mongo đầy đủ làm database local chính, giữ tên database và
volume hiện có; không đổi tên/copy lại chỉ để bỏ chữ acceptance. Cấu hình root
đặt `COMPOSE_PROJECT_NAME=latlai-mongo-acceptance`, `MONGO_PORT=57117`; đã kiểm
`docker compose config` chọn đúng project/volume. API dùng app user; bootstrap và
migration có credential riêng. Máy teammate tạo project/DB riêng theo TEAM_WINDOWS.

## Sao lưu và kiểm tra

Trong lúc API cũ dừng, đã lưu ngoài repository tại
`C:/Users/ASUS/Documents/LaiLai/backups/cutover-2026-09-30/`:

- PostgreSQL custom dump274.878 byte; `pg_restore --list` đọc được.
- Mongo archive gzip28.974 byte kèm database users/roles;
  `mongorestore --dryRun` đọc được. Đây không phải diễn tập restore đầy đủ.
- Root/API env và credential của container; chứa secret, không chia sẻ qua Git.
- 14 object đang dùng bởi7 media (original pinned và preview), tổng5.118.376 byte;
  manifest riêng giữ key/hash. Lượt đầu thử đọc cả staging đã dọn của ảnh Ready nên
  dừng; đã dùng pinned original khi có, tải đủ14 object. Không xóa object nào.

`manifest.json` ngoài repo giữ SHA-256 của archive. Không đưa dump, import report,
config riêng hoặc manifest media vào Git. Không restore env/session cũ trên app
đang nhận ghi mới; PostgreSQL chỉ còn làm nguồn bảo toàn, không dual-write.

Đã cập nhật `.env` thật của máy này (không commit): MONGODB_URL/app user, URL admin/
migrator, database/password bootstrap; giữ URL PG cũ làm SOURCE_DATABASE_URL.
API3000/media-worker/order-worker khởi động cùng build hiện hành trực tiếp từ dist,
không cần launcher acceptance riêng nữa. PID khi kiểm:31696/30464/5068.

- Integrity trước/sau mở runtime: failures=[], ledger debit=credit=100M VND,
  sourceRemaining100M, memberAvailable0, transactionHeld0.
- 3 migration/checksum khớp; readiness200; storage private/size-bounded PASS.
- Order worker chạy sweep:0 failed,0 remaining. Media worker chạy; không overdue job.
- Android emulator vẫn đọc nháp cũ/1ảnh, GET owner listings200; không clear session.
- Doctor đầu chạy khi API còn khởi động nên WARN chưa ready; lần sau readiness PASS.
  WARN localhost còn phù hợp vì emulator đang dùng adb reverse3000/8081.

Không chạy lại native acceptance hay full suite cho việc đổi cấu hình này. CI PR
tích hợp chạy riêng. Backup archive được đọc/dry-run, chưa diễn tập restore vào DB
khác; full native/TalkBack/ARM/iOS/human review vẫn mở. Nguồn PG và volume giữ nguyên.
