# Điểm lưu hiện tại — 30/09/2026

## Nguồn và việc đang làm

- main đã tích hợp MongoDB và bàn giao qua [PR5](https://github.com/huangg49/used-book-marketplace/pull/5)/[PR6](https://github.com/huangg49/used-book-marketplace/pull/6), mốc1be5144.
- Gói hiện tại: funding đầu H01b, nhánh codex/h01-f2h-scenarios từae0f1d9 (H01a,
  nhánh codex/h01-demo-scenarios từ46f988d). Working tree sạch lúc mở mỗi nhánh.
  Stack docs/AI/plan19ffb84 →0182e40 →e2e7f21 →b9026a5 →46f988d →ae0f1d9
  chưa push/merge. Không cherry-pick code bỏ dependency docs; tích hợp theo mốc trưa.
- Đã hoàn thiện [AI_WORKFLOW](../AI_WORKFLOW.md): AGENTS gọn, domain rules đọc theo
  nhiệm vụ, ba skill nguồn chung + adapter Claude, mẫu issue/PR và docs:check/CI.
  Commit0182e40: docs(ai): add shared team skills and verified onboarding workflow.
  [Bằng chứng/phạm vi](AI_TEAM_HANDOFF_2026_09_30.md): checker 5/5, skills 6/6,
  docs links/contract/diff-check PASS; AI mới sửa form mẫu và nhận đúng gate.
  Không đổi app/DB. Chưa test tự nạp Claude/máy teammate hoặc chạy remote CI.
- H01a đã hiện thực: `demo:books init/run/serve`, API loopback quản lý riêng,
  QA57017/rs-test + DB random *_test/roles riêng; seed chỉ account, toàn bộ hành
  trình catalog/media/listing/review qua API. Durable key/body/version + receipt,
  bounded retry, run lock, fingerprint và chặn DB đã mất. Cấu hình/intent/ảnh nằm
  trong .tmp/demo, không sửa .env hoặc DB/bucket chính. Subject điểm lưu:
  `feat(demo): orchestrate recoverable book scenarios on isolated API`.
  [Cách dùng và evidence](DEMO_SCENARIOS.md). Commitae0f1d9; H01a hoàn tất local.
- Checks H01a thực chạy: API build; test:demo8/8; test:demo:api real Nest/Mongo/Sharp
  với storage FAKE (upload lost-ack sau commit, restart API, rerun không duplicate,
  secret-free manifest, SANDBOX_LOST); oxlint; docs:check/diff-check PASS.
  Live Supabase trên bucket private random riêng: init/run/rerun PASS,9 receipts
  không đổi key/IDs. Member web export tách ở .tmp/demo/member-web và IAB thật:
  shelf → detail/ảnh live → Back PASS; ảnh .tmp/demo/h01-live/member-detail.jpg.
  Không gọi web là native PASS. Remote CI/human review NOT RUN; READINESS không đổi.
- Trong phát triển tool có lỗi parser receipt chưa nhận ListingState object và
  HTTP429 khi test login lặp. Đã sửa parser và dùng lại phiên memory cùng tiến
  trình; không sửa contract/guard hoặc xóa login attempts. Test cuối PASS.
- Funding đầu H01b đã hiện thực: `demo:funding init/run`, simulator secret opt-in
  ở namespace mới; Buyer tạo topup1M, operator độc lập qua adapter API; intent event
  bền vững và wallet/history/topup + ledger snapshot reconciliation. Không seed tiền.
  Subject: `feat(demo): add finite funding scenario with ledger reconciliation`.
  Unit9/9 và focused real HTTP/Mongo PASS (credit lost-ack ba lần, restart API/rerun
  không posting trùng;403 Member event; disabled/same-recipient chặn). CLI fixture
  init/run/rerun PASS: available1M/source99M. H01a API regression/oxlint/docs/diff
  PASS. Không dựng Order, không mở ví UI, không đóng human/native/remote CI gate.
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
- Nhóm5 người: bạn và Bảo nhận phần khó; ba bạn còn lại chưa chọn tên/phân công.
  Ưu tiên web/admin/RN tới demo thứ Ba06/10, Flutter hoãn. Kế hoạch hiện hành:
  [DEMO_PLAN](DEMO_PLAN_2026_10_06.md); giờ demo chưa được cung cấp.

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
- H01 QA đang chạy trên container used-book-marketplace-mongo-quality-mongo-test-1.
  Đây là tmpfs: restart mất dữ liệu, phải init run tên mới. Run live kiểm cuối:
  .tmp/demo/h01-acceptance (port3016); private.json không được chia sẻ. Run đầu
  h01-live dùng để xem UI; demo data/bucket giữ riêng, không phải app local chính.

## Bước tiếp

H01a và funding H01b đã đủ dùng. Tiếp H01b Order: address/fulfillment qua API,
revision mới submit/review; quote server → AwaitingPayment → pay/accept, đối chiếu
hold/commitment/payment ledger. Giữ intent cả quote bị hết hạn, không tự đổi key.
InTransit cần packaging/label/carrier event thật trong mô phỏng, không gán state.
Chưa có Order do tool tạo. H01b không bắt buộc xong trưa. Bảo nhận H01b còn lại
cùng H02 review/debug sau bàn giao; ba lane UI
làm tính năng hiện có. C01/C02 giữ dependency, không tự mở Delivered/settlement.
Tích hợp dự kiến khi bàn giao trưa: cả docs19ffb84 và AI0182e40 cùng gói code đủ
điều kiện, qua PR/checks/review; chưa thực hiện push/merge hay remote CI.
Nhóm bắt đầu theo [AI_WORKFLOW](../AI_WORKFLOW.md)/[TEAM_WINDOWS](TEAM_WINDOWS.md),
phân công phần việc và reviewer; kiểm cửa vào Codex/Claude trên máy mình.
Chi tiết phiên trước ở [SESSION_HISTORY](SESSION_HISTORY_2026_09_30.md); không đọc
trạng thái “chưa merge/cutover” trong lịch sử thành việc hiện tại chưa hoàn tất.
