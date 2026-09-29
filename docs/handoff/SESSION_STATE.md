# Điểm lưu hiện tại — 30/09/2026

## Nguồn và việc đang làm

- main đã tích hợp MongoDB và bàn giao qua [PR5](https://github.com/huangg49/used-book-marketplace/pull/5)/[PR6](https://github.com/huangg49/used-book-marketplace/pull/6), mốc1be5144.
- Gói hiện tại: dọn điều hướng/tài liệu, nhánh codex/docs-navigation-cleanup từ1be5144.
  Chỉ sửa docs; commit subject: docs: consolidate current handoff and archive historical status.
  Chưa push/merge gói docs này; quyền tích hợp trước dành cho gói MongoDB.
- README/docs index được rút gọn; SESSION/READINESS tách trạng thái với lịch sử;
  sửa mô tả DB, contract và prompt tiếp nhận. [Phát hiện/phạm vi](DOCS_AUDIT_2026_09_30.md).
  Kiểm: link nội bộ và diff-check; không chạy lại test/build/native vì không đổi code.

## Trạng thái đã chốt

- API/worker: MongoDB, OpenAPI0.21.0,3 migrations; nghiệp vụ giao dịch đóng tại F2h.
  Admin có list user, chưa lock/unlock. Flutter chỉ scaffold; Member web là Expo web.
- CI của head7587983 trong PR5: API/RN/admin/operations/compose PASS. Các gate độc
  lập/full native còn mở ở [READINESS](READINESS.md), không suy từ merge thành release.
- Chủ dự án muốn bàn giao trong6 ngày từ30/09; mọi thành viên Windows có Docker/
  Android Studio, dùng DB riêng; chưa phân công web/admin/Flutter, chưa có reviewer.
  Không mở thêm ca native chỉ để tăng coverage khi không có thay đổi liên quan.

## Môi trường máy này

- Mongo57117/database latlai_acceptance_20260929 nay là DB local chính, không phải QA.
  Root/API .env trỏ project latlai-mongo-acceptance/volume hiện có; PostgreSQL5433 giữ nguồn.
- [Cutover và backup](LOCAL_MONGO_CUTOVER_2026_09_30.md): PG/Mongo/config/14media objects
  backup ngoài repo tại C:/Users/ASUS/Documents/LaiLai/backups/cutover-2026-09-30/.
  Restore dữ liệu cả hai DB trên QA đạt; chưa restore credential Mongo trên host mới.
  Không in/commit secret/backup hoặc restore đè dữ liệu đã nhận ghi mới.
- PID lúc cutover: API31696, media30464, order5068, Metro8081. Đây là metadata lịch sử;
  kiểm port/process trước khi dừng/chạy lại. Android Pixel_7/API35; reverse3000/8081.
- .tmp/ có log/harness/backup phiên; generated Prisma cũ ignored, không tham gia build.
  Giữ local, không reset/clean/xóa hàng loạt. QA57017 dùng DB *_test riêng.

## Bước tiếp

Nhóm bắt đầu theo [TEAM_WINDOWS](TEAM_WINDOWS.md), phân công phần việc; chỉ sửa lỗi
setup thực tế hoặc triển khai gói đã được giao. Không tự mở Delivered/settlement.
Chi tiết phiên trước ở [SESSION_HISTORY](SESSION_HISTORY_2026_09_30.md); không đọc
trạng thái “chưa merge/cutover” trong lịch sử thành việc hiện tại chưa hoàn tất.
