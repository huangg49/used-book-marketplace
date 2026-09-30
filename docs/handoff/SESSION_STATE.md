# Điểm lưu hiện tại — 30/09/2026

## Nguồn và việc đang làm

- main đã tích hợp MongoDB và bàn giao qua [PR5](https://github.com/huangg49/used-book-marketplace/pull/5)/[PR6](https://github.com/huangg49/used-book-marketplace/pull/6), mốc1be5144.
- Gói hiện tại: hướng dẫn AI cho nhóm, nhánh codex/team-ai-handoff từ19ffb84
  (gói dọn docs trước, nhánh codex/docs-navigation-cleanup). Hai gói chưa push/merge;
  quyền tích hợp trước dành cho gói MongoDB. Không cherry-pick gói AI bỏ dependency docs.
- Đã hoàn thiện [AI_WORKFLOW](../AI_WORKFLOW.md): AGENTS gọn, domain rules đọc theo
  nhiệm vụ, ba skill nguồn chung + adapter Claude, mẫu issue/PR và docs:check/CI.
  Commit0182e40: docs(ai): add shared team skills and verified onboarding workflow.
  [Bằng chứng/phạm vi](AI_TEAM_HANDOFF_2026_09_30.md): checker 5/5, skills 6/6,
  docs links/contract/diff-check PASS; AI mới sửa form mẫu và nhận đúng gate.
  Không đổi app/DB. Chưa test tự nạp Claude/máy teammate hoặc chạy remote CI.
- Gói docs trước: README/index/SESSION/READINESS rút gọn, sửa DB/contract/prompt;
  [phạm vi](DOCS_AUDIT_2026_09_30.md). Evidence lịch sử giữ nguyên.

## Trạng thái đã chốt

- API/worker: MongoDB, OpenAPI0.21.0,3 migrations; nghiệp vụ giao dịch đóng tại F2h.
  Admin có list user, chưa lock/unlock. Flutter chỉ scaffold; Member web là Expo web.
- CI của head7587983 trong PR5: API/RN/admin/operations/compose PASS. Các gate độc
  lập/full native còn mở ở [READINESS](READINESS.md), không suy từ merge thành release.
- Yêu cầu mới30/09: tiếp tục code buổi sáng, dự kiến bàn giao/merge main vào trưa
  cùng ngày để nhóm pull và phát triển. Mốc còn6 ngày là thời gian dự án đã nêu,
  không còn là thời điểm bắt đầu bàn giao. Mọi thành viên Windows có Docker/
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

Lập kế hoạch buổi sáng: chọn một gói nhỏ giúp nhóm dùng baseline hiện có; đề xuất
công cụ tạo dữ liệu demo qua API trên môi trường riêng (seed hiện chưa có sách),
chưa bắt đầu implementation. Chốt phạm vi trước code, không mở Delivered/settlement.
Tích hợp dự kiến khi bàn giao trưa: cả docs19ffb84 và AI0182e40 cùng gói code đủ
điều kiện, qua PR/checks/review; chưa thực hiện push/merge hay remote CI.
Nhóm bắt đầu theo [AI_WORKFLOW](../AI_WORKFLOW.md)/[TEAM_WINDOWS](TEAM_WINDOWS.md),
phân công phần việc và reviewer; kiểm cửa vào Codex/Claude trên máy mình.
Chi tiết phiên trước ở [SESSION_HISTORY](SESSION_HISTORY_2026_09_30.md); không đọc
trạng thái “chưa merge/cutover” trong lịch sử thành việc hiện tại chưa hoàn tất.
