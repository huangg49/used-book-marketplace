# Điểm lưu hiện tại — 30/09/2026

## Nguồn và việc đang làm

- main đã tích hợp MongoDB và bàn giao qua [PR5](https://github.com/huangg49/used-book-marketplace/pull/5)/[PR6](https://github.com/huangg49/used-book-marketplace/pull/6), mốc1be5144.
- Gói hiện tại: tích hợp H01, nhánh codex/h01-handoff từd4f8220;
  working tree sạch lúc mở nhánh. Fetch origin30/09 vẫn main1be5144, không có
  commit main mới cần tích hợp; không pull/reset/clean, giữ local work.
  Stack docs/AI/plan19ffb84 →0182e40 →e2e7f21 →b9026a5 →46f988d →ae0f1d9 →428cafd →274d100 →d4f8220
  cùng CI fix d47d3bf nằm trong nhánh bàn giao. Không cherry-pick code bỏ dependency docs.
- Chủ dự án đã cho phép push/tạo PR/merge H01 ngay sau checks cần thiết, miễn
  human review cho riêng gói này (yêu cầu trực tiếp30/09). Không có human sign-off;
  không đóng gate review/native/release hoặc mở nghiệp vụ sau F2h từ ngoại lệ này.
- Đã hoàn thiện [AI_WORKFLOW](../AI_WORKFLOW.md): AGENTS gọn, domain rules đọc theo
  nhiệm vụ, ba skill nguồn chung + adapter Claude, mẫu issue/PR và docs:check/CI.
  Commit0182e40: docs(ai): add shared team skills and verified onboarding workflow.
  [Bằng chứng/phạm vi](AI_TEAM_HANDOFF_2026_09_30.md): checker 5/5, skills 6/6,
  docs links/contract/diff-check PASS; AI mới sửa form mẫu và nhận đúng gate.
  Không đổi app/DB. Chưa test tự nạp Claude/máy teammate hoặc chạy remote CI.
- H01 tooling đã đủ local để bàn giao review; API/contract/migration/UI product
  không đổi. Accounts fixture tách role, DB random *_test trên QA57017/rs-test,
  private bucket riêng; mọi command nghiệp vụ qua API, không seed tiền/state.
  Durable key/body/version/receipt, run lock, binding và chặn SANDBOX_LOST.
  Cách chạy/phạm vi/test/lỗi harness cụ thể ở [DEMO_SCENARIOS](DEMO_SCENARIOS.md).

  | Increment | Source / đầu ra |
  | --- | --- |
  | H01a | ae0f1d9: demo:books init/run/serve; catalog/media/listing/review/public shelf |
  | Funding | 428cafd: demo:funding; Buyer1M qua operator độc lập, nguồn99M |
  | Order | 274d100: demo:orders; unpaid/paid/Preparing,40 receipts |
  | InTransit | d4f8220: init thêm --in-transit; giữ3 mẫu cũ + Order thứ tư, packaging/label/pickup;57 receipts |

- Gói InTransit đã commit d4f8220 trên codex/h01-intransit-scenarios.
  Ảnh packaging do tool tạo, có nhãn DEMO; không chứng minh kiện sách thật/custody.
  Seller reserve/PUT/label không đổi Order3, deadline hay tiền; operator độc lập
  gửi PickedUp với key=eventId, thời gian từ API server; Applied → InTransit4.
  Snapshot checkOrder/checkShipment/checkPackaging và ledger chỉ đọc khớp:
  available535K/held465K/source99M/seller0, commitment vẫn Active/version1.
- Checks thực chạy trên source d4f8220: unit14/14; test:demo:transit HTTP/Nest/Mongo/
  Sharp FAKE PASS: upload/label/pickup lost-ack sau commit3 lần, API restart bằng
  session memory; actual concurrent identical pickup chỉ1 Applied; rerun57 intents/
  receipts,4 Orders/commitments,2 preparations,1 evidence/label/pickup,5 journals/
  10 entries. Wrong actor/key/payload/bytes bị từ chối; secret/contact không có
  trong manifest/journal. Ca API riêng duplicate/conflict giữ canonical pickup,
  hold/commitment; conflict → ResolutionPending5, tool dừng, không refund/restock.
  H01a/funding/Order regression, oxlint/format/docs/diff PASS. Node24.19.0/pnpm11.19.0.
- Supabase live `transit-live` trên dedicated private random bucket/QA DB: init/run
  và acknowledged rerun bằng CLI process mới sau cửa sổ login thật PASS; keys/IDs/
  counts/deadline/ledger không đổi. Preview packaging WebP800×600 qua participant
  API đã tải/xem, chỉ lưu ảnh, không URL/token. IAB Member web riêng với API3030:
  seller →4 Reserved, không thêm UI Order/shipping; ảnh trong .tmp/demo/transit-live/.
  Đây không là native PASS. Evidence H01a/Order live trước giữ ở DEMO_SCENARIOS.
- Full CLI crash/lost-ack live, remote CI và human review NOT RUN. Login4 actor có
  thể429 khi restart trong cùng cửa sổ5 login/IP/15 phút; không persist token/nới
  guard/xóa login attempts. Deadline thật; run quá hạn dừng, không đổi clock/DB.
  Các manifest là evidence tại thời gian/source ghi, không thay outcome mới nhất.
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
  .tmp/demo/transit-live (API3030); private.json không được chia sẻ. Run cũ
  h01-live/order-live giữ evidence riêng; kiểm port/process thực tế trước serve.
  API3030 và preview web8081 đã dừng sau QA để trả port Metro; chỉ giữ artifact.

## Bước tiếp

H01a/H01b tooling đã đủ local. Đã chuẩn bị nội dung PR theo template trong
`.tmp/handoff-h01/pr-body.md` (local, không có secret) và đường đọc H02 trong
DEMO_SCENARIOS. Nhánh bàn giao chứa đủ stack docs/AI/code từ main1be5144;
Checkpoint subject `fix(ci): run demo units before explicit frozen install`.
Preflight source riêng không có node_modules: pnpm run kích hoạt implicit install;
fixture đầu thiếu workspace manifests nên install bị từ chối. Job unit đổi sang
Node trực tiếp để không cài ngầm trước pnpm install --frozen-lockfile; không đổi
unit/API source. Source riêng không node_modules:14/14 PASS bằng Node24.19.0;
docs checker5/5, docs157/1132links/3adapters, YAML/order/format/diff PASS.
Scan diff60 file đúng scope, không private config/credential-shaped literals;
scan có giới hạn, không bảo đảm tuyệt đối hết secret. Không chạy lại API/native.
Chủ dự án đã thay mốc trưa bằng yêu cầu merge hiện tại, miễn review cho gói H01.
Checkpoint ủy quyền subject `docs(handoff): record approved H01 integration`.
Tiến hành push nhánh, tạo PR từ body đã chuẩn bị, chỉ squash merge khi CI đúng
head đạt; không bypass check hoặc đổi branch protection. Human review NOT RUN.
Bảo tiếp H02 review/debug nền/source và giới hạn recovery đã ghi; ba lane UI
làm tính năng hiện có. C01/C02 giữ dependency, không tự mở Delivered/settlement.
Gói tích hợp giữ cả docs19ffb84 và AI0182e40 cùng code/checks; trạng thái remote
CI/merge cần đọc tại PR trước khi ghi kết luận. Baseline release gate không đổi.
Nhóm bắt đầu theo [AI_WORKFLOW](../AI_WORKFLOW.md)/[TEAM_WINDOWS](TEAM_WINDOWS.md),
phân công phần việc và reviewer; kiểm cửa vào Codex/Claude trên máy mình.
Chi tiết phiên trước ở [SESSION_HISTORY](SESSION_HISTORY_2026_09_30.md); không đọc
trạng thái “chưa merge/cutover” trong lịch sử thành việc hiện tại chưa hoàn tất.
