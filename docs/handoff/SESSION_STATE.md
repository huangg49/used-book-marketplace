# Điểm lưu để tiếp tục — 30/09/2026

## Đã tích hợp MongoDB vào main — điểm chốt

- PR[#5](https://github.com/huangg49/used-book-marketplace/pull/5) **đã merge** ngày30/09
  theo quyền chủ dự án, merge commit **8e844dc**. Cả5 check trên head7587983 đều PASS:
  API, React Native, admin-web, operations/public shelf, compose. Không suy kết quả
  này thành human review hay full native acceptance; các gate đó vẫn mở.
- Database local chính đã là Mongo57117; API/media/order dùng `.env` thật, không cần
  launcher ignored. PostgreSQL5433 giữ nguyên; snapshot source và Mongo +14media objects
  được backup ngoài repo theo [cutover](LOCAL_MONGO_CUTOVER_2026_09_30.md).
- Đã restore thật cả hai archive vào database QA UUID `_test` riêng: Mongo checksum/
  integrity PASS; PG43 tập dữ liệu/146 bản ghi khớp nguồn read-only sau toDocuments.
  Hai DB restore đã dọn. Chưa diễn tập phục hồi Mongo credential trên host mới.
- Hướng dẫn [nhóm Windows](TEAM_WINDOWS.md) dùng database/credential riêng, seed4
  tài khoản; Flutter mới scaffold, member web hiện là Expo web. Chưa tự phân công
  người hoặc mở workflow Delivered/settlement. Mốc mong muốn: bàn giao trong6 ngày.
- Closeout tài liệu ở nhánh `codex/mongodb-handoff-closeout` từ8e844dc; không đổi code
  sau CI. Bước tiếp dành cho nhóm: clone main và mỗi người chạy phần mình phụ trách;
  chỉ xử lý lỗi setup thực tế hoặc công việc đã phân công. Không lặp native/suite
  đã đạt nếu không có thay đổi liên quan. Không restore snapshot cũ đè dữ liệu đang chạy.

## PR tích hợp và cutover local — điểm mới nhất

- Nhánh `codex/mongodb-team-handoff`, PR[#5](https://github.com/huangg49/used-book-marketplace/pull/5)
  đã push/mở theo quyền chủ dự án; CI đang chạy, chưa merge tại điểm lưu này.
  [Nhóm Windows](TEAM_WINDOWS.md) đã có hướng dẫn theo phần việc, Flutter vẫn scaffold.
- [Cutover local](LOCAL_MONGO_CUTOVER_2026_09_30.md) đã thực hiện: dùng bản Mongo57117
  có toàn bộ bản ghi PG và thay đổi QA mới. Không reimport đè, không dual-write.
  Root/API `.env` đã cập nhật riêng; compose project trỏ volume hiện có. Nguồn PG5433
  giữ nguyên. Nhóm dùng DB riêng, không lấy config/backup của máy này.
- Backup ngoài repo `C:/Users/ASUS/Documents/LaiLai/backups/cutover-2026-09-30/` gồm
  PG custom dump, Mongo archive/users/roles, config và14 objects của7media. Có hash;
  PG list/Mongo dryRun PASS, chưa full restore drill. Chứa secret, không in/commit.
- Integrity0 lỗi, ledger cân bằng100M,3 checksum khớp, doctor/readiness/storage PASS.
  API3000 PID31696/media30464/order5068 dùng .env trực tiếp, Metro8081 giữ nguyên.
  Worker order0failed; native đọc sách cũ200. Không cần launcher acceptance nữa.
  Từ nay DB57117 là local chính, không dùng làm nơi QA cleanup tùy tiện.
- Bước tiếp: theo CI PR5, sửa lỗi có evidence nếu có, merge khi các check cần thiết
  đạt. Không lặp suite local/native đã đóng. Human review chưa có người, vẫn mở;
  chưa deploy ngoài máy. Không quay .env/phiên về backup sau khi đã có ghi mới.

## Bàn giao nhóm / tích hợp MongoDB — đang thực hiện

- Chủ dự án đã chốt: bàn giao cho nhóm trong6 ngày; chuyển toàn bộ dữ liệu hiện có
  trên máy này; mỗi thành viên Windows có Docker/Android Studio, dùng MongoDB riêng.
  Nhóm chưa phân công web/admin/Flutter; không có teammate đang sửa hoặc reviewer.
  **Đã cho phép push, tạo PR và merge khi kiểm tra cần thiết đạt** cho gói này.
  Chưa có deploy ngoài máy; human review vẫn ghi chưa thực hiện.
- Nhánh `codex/mongodb-team-handoff` từ `5fedc53`; fetch xác nhận main `b49cc52` là
  ancestor, không có PR mở. Bao gồm teammate Mongo + hai P1 fix + import/live/native
  evidence + cleanup. [Hướng dẫn nhóm Windows](TEAM_WINDOWS.md) nêu rõ Flutter chỉ
  scaffold và member web hiện là Expo web, không tự thêm app/phân công tính năng.
- Đối chiếu read-only nguồn PG5433 với acceptance57117: cùng4 users/3 listings/7media;
  Mongo có thêm1 address book/address/identity và2 receipt/audit (39 so với37).
  Chưa chuyển `.env` hoặc ghi đè bản nào. Cần so nội dung/snapshot và bảo toàn thay
  đổi Mongo trước cutover; không import đè acceptance hoặc quay app về PG cũ.
- PostgreSQL nguồn đã khởi động lại để đọc; không đụng PG5432 dự án khác. Script so
  sánh `.tmp/handoff-compare.mjs` chỉ đọc; không commit dữ liệu/config riêng.
- Bước tiếp: push PR tích hợp, xem CI; xử lý lỗi CI nếu có trước merge. Đồng thời
  sao lưu nguồn và acceptance ngoài Git, xác định bản Mongo đầy đủ để chuyển cấu hình.

## Dọn phần PostgreSQL an toàn — điểm mới nhất

- Chủ dự án đã cho dọn phần an toàn, giữ thành phần cần chạy/import. Nhánh
  `codex/postgres-cleanup`, base `3aabadc`; commit subject
  `chore: exclude legacy Prisma output and align MongoDB setup docs` (SHA xem log).
- Ignore `apps/api/src/generated/prisma/`, exclude khỏi typecheck/build; rebuild
  đã loại `dist/generated` (~3,89MB). 52 file generated local/4.573.831 byte vẫn còn
  nguyên, không xóa. API/media-worker/order-worker và CLI/import module vẫn có trong dist.
- Bỏ pendingMongoPort=[]/comment cũ; sửa ENV_HANDOFF và admin-web README sang MongoDB
  runtime/QA; thêm prisma/README đánh dấu lịch sử chỉ đọc. Giữ schema/17 SQL migrations,
  pg dependency/import/tests/CI và PostgreSQL containers/volumes, không đổi `.env`.
- Thực chạy: API lint/typecheck/build, contract check, formatter, diff-check PASS;
  discovery E2E trước/sau cùng24 file. Đây là kiểm discovery, không chạy493E2E hoặc
  native lại. Không sửa nghiệp vụ/UI/API contract, không restart process đang chạy.
- Không push/merge/deploy. Gói cleanup đã hoàn tất; không mở thêm native theo yêu cầu
  mới nhất. Các gate human review/CI remote/cutover ở mục trước vẫn chưa được đóng.

## Rà phần PostgreSQL còn lại — yêu cầu mới nhất

- Chủ dự án chuyển ưu tiên sang kiểm code PostgreSQL còn sót; dừng mở thêm ca native.
  Nhánh `codex/postgres-cleanup-audit`, base `bb5be67`; chỉ rà source/config/artifact,
  chưa sửa runtime hoặc xóa file, không push/merge. Không chạy lại suite.
- API/worker dùng MongoService; không còn Prisma dependency trong manifest/lockfile.
  `pg` chỉ được import bởi CLI import và test import (kể cả type import). Giữ
  schema.prisma/17 SQL migrations, importer/test và legacy-postgres profile theo
  ADR0027/runbook, không xóa như code chết khi cutover chính còn mở.
- Chưa sạch hoàn toàn: local `src/generated/prisma` untracked có52 file/~4,57MB;
  `dist/generated` có156 file/~3,89MB. tsconfig.build include toàn src, chưa exclude
  generated; .gitignore cũng chưa ignore lại thư mục này. Không được add/xóa nhầm.
- Tài liệu hiện hành còn sai: ENV_HANDOFF dùng PostgreSQL/DATABASE_URL cho setup/E2E;
  admin-web README hướng dẫn TEST_DATABASE_URL dù fixture đã yêu cầu MONGO_TEST_URL.
  vitest.config.e2e còn pendingMongoPort=[] và comment chuyển đổi đã hết hiệu lực.
- Bước dọn phù hợp: exclude/ignore generated cũ mà bảo toàn local; đồng bộ hai hướng
  dẫn env/test và bỏ cấu hình chuyển đổi rỗng. `pg` vẫn là dependency phục vụ import;
  chỉ tách khỏi gói deploy khi tách công cụ import rõ ràng. Không xóa DB/volume/migration.

## Native finalize/submit lost ACK — điểm mới nhất

- Nhánh **codex/native-finalize-submit-retry**, base **307341e**; commit subject
  `docs(native): verify finalize and submit lost-ack recovery` (SHA xem log).
  Chỉ evidence/tài liệu; không sửa runtime/UI, không push/merge/deploy.
  `apps/api/src/generated/` cũ vẫn untracked, giữ nguyên.
- [N13 thực chạy và bằng chứng](NATIVE_ACK_2026_09_30.md): Android15/API35 x86_64,
  APK Q01 + Metro; Mongo `_test`/Supabase bucket mới hoàn toàn, API và Sharp thật.
  Finalize4 request/cut200 cùng key/body→Processing; retry đọc trạng thái, không
  upload/finalize thêm, worker→Ready. Submit2 cut200 +1 retry cùng key/body, save1
  lần; PendingReview/version3, revision/thời điểm gửi/receipt giữ nguyên. PASS.
- Assertion effect/hash/snapshot và integrity sweep PASS0 lỗi; contract/diff PASS.
  Không phát hiện lỗi sản phẩm mới. Pilot401/token harness và giả định số retry
  sai đã xử lý trong harness; không chạy lại full API/RN suite vì không đổi code.
- Đầu lượt các process/container đã dừng. Đã mở lại emulator, Mongo acceptance57117
  (dữ liệu còn) và QA57017. API3000 PID6424, Metro8081 PID1928 đang chạy; PG5433,
  QA PG55434/failover57021–23 chưa khởi động lại. Không chạy cleanup trên acceptance.
- QA3002/worker/proxy3102 đã dừng; đúng3 object keys, bucket/DB QA đã dọn. Khôi phục
  backup app tạo trong lượt này; refresh200 và UI nháp N18 cũ/1ảnh. App ở Sách của
  tôi, reverse3000/8081 bình thường. Log/secret/backup `.tmp/native-ack/` ignored;
  không restore backup lần nữa vì sẽ rollback phiên sau refresh.
- **Bước tiếp:** không lặp finalize/submit vừa đóng. Q01 còn ca giết app giữa upload/
  phục hồi từ server; nếu làm dùng DB/bucket mới và backup mới. N21 cần quan sát
  audio TalkBack; ARM/iOS và review người thật cần điều kiện tương ứng. CI remote/
  push/merge/cutover chưa được tự mở; không mở Delivered/settlement.

## Native pricing / N20 — điểm mới nhất

- Nhánh **codex/native-pricing-acceptance**, base **56d01dc**; commit subject
  `docs(native): record pricing and review acceptance at large text` (SHA xem log).
  Chỉ tài liệu/4 ảnh; không sửa runtime, không push/merge/deploy. Giữ generated cũ.
- Android 15/Pixel_7 x86_64, APK Q01 có sẵn, Metro8081/API3000/Mongo acceptance57117:
  chữ OS130% + bàn phím số docked; giá sai hiện lỗi/scroll đúng; hai giá hợp lệ,
  nơi gửi dài, review/checkbox/footer đọc và thao tác được. Gửi thiếu thông tin
  quay về lỗi tình trạng; không gửi mutation HTTP. Đã bỏ thay đổi nháp qua confirm.
  [Bằng chứng và phạm vi](Q01_NATIVE_COMPLETION_2026_09_29.md#n20--giá-nơi-gửi-và-review-trên-mongodb).
- Không phát hiện lỗi sản phẩm mới trong nhóm này. Log đầy đủ xác định cảnh báo
  `Error: undefined` trước đó thuộc **Cannot connect to Expo CLI**; khớp
  `expo/src/async-require/hmrUtils.native.ts`. Chưa xác định nguyên nhân lần mất
  kết nối; không coi đó là lỗi Mongo/upload, không sửa dependency để che warning.
- Đã trả font_scale=1.0, handwriting override=null; app ở kệ. API/Metro/reverse
  giữ nguyên. Không chạy worker cleanup trên acceptance copy có media keys nguồn.
  Kiểm tra gói này: thao tác native và `git diff --check`; không chạy lại bộ API/RN
  vì không đổi code, không gán kết quả cũ thành mới.
- **Bước tiếp:** N13 native lost-ack finalize/submit chưa kiểm là phần tự động hóa
  độc lập còn mở: dùng DB/bucket QA riêng, không dùng acceptance copy để cleanup.
  N20 đã thêm nhóm pricing/origin/review, không tuyên bố full native PASS. N21 cần
  quan sát TalkBack có audio; ARM/iOS và review người thật vẫn mở. Không lặp nhóm
  vừa đóng nếu source không đổi; không mở Delivered/settlement hoặc tự cutover.

## Live packaging MongoDB — điểm mới nhất

- Nhánh **codex/mongodb-live-packaging**, base **616d1d8**; commit subject
  `test(mongo): verify live packaging recovery and fix QA cleanup` (SHA xem log).
  Không push/merge/deploy, không sửa runtime/UI/migration. Giữ generated cũ untracked.
- Thêm lane opt-in packaging vào live-media runner: real HTTP + Mongo app user +
  Supabase QA bucket riêng + Sharp. JPEG/PNG/WebP/private permissions/replay PASS;
  PNG fault sau remote original/trước DB ack→Pending→retry Ready, không ghi đè;
  Order/hold230k/commitment không đổi, sweep0 lỗi. Lượt cuối PASS7/ok=true.
  [Cách chạy và giới hạn](../refactor/MONGODB_LIVE_MEDIA_2026_09_29.md).
- Hai pilot fail do harness so observation `serverTime` của Order rồi wallet;
  đã sửa, không phải lỗi nghiệp vụ. Sửa cleanup harness: emptyBucket bất đồng bộ
  khiến delete chạy sớm; nay remove các key đúng run rồi delete bucket. Các DB/
  bucket QA đã dọn, kể cả bucket pilot còn lại. Không đụng bucket/DB nguồn.
- Kiểm tra: packaging live PASS7, oxlint/prettier/contract/diff PASS. Lane listing
  chạy lại một lần do sửa cleanup chung: PASS7/ok=true, dọn DB/bucket thành công. Không lặp
  full493E2E/build/native vì runtime/UI không đổi. API3000/Metro8081/DB57117 như cũ.
- **Bước tiếp:** đóng ma trận native còn thiếu (N20/N21) theo ca cụ thể; TalkBack
  có cài nhưng chưa có kênh audio quan sát nên chưa nghiệm thu. Cảnh báo native
  `Error: undefined` vẫn chưa rõ nguồn; cần tái hiện có stack trước khi sửa.
  Human review tiền/quyền cần người độc lập; CI remote/cutover chính cần quyền
  tương ứng, không tự suy từ yêu cầu tiếp tục. Không mở Delivered/settlement.

## Android upload trên MongoDB — điểm mới nhất

- Nhánh **codex/mongodb-native-upload**, base **1452927**. Commit gói có subject
  `docs(mongo): record Android upload and lost-ack acceptance`; xem `git log -1`
  để lấy SHA. Chỉ evidence/tài liệu, không sửa runtime/UI/contract, không push/merge.
  `apps/api/src/generated/` cũ vẫn untracked, không add/xóa.
- [Báo cáo và ảnh](../refactor/MONGODB_NATIVE_UPLOAD_2026_09_29.md): Pixel_7/API35,
  APK Q01 có sẵn + Metro8081 preview=0, API/worker thật, DB Mongo QA UUID `_test`
  và bucket Supabase private **riêng**. Không copy media keys nguồn vào QA.
- PASS trong phạm vi: hủy picker không tạo media; native PNG/WebP/JPEG→Ready;
  lost ACK sau content PUT200 năm lần, retry cùng key/body→đúng1 effect/receipt/job;
  lưu/mở lại3 ảnh; preview503→ẩn ảnh + retry phục hồi; cold start giữ phiên/3 ảnh,
  không đứng splash. Sweep0 lỗi,3 media/3 links/3 finished jobs. N14 không phủ
  hết hạn URL/giết app giữa upload; log có một `Error: undefined` chưa rõ nguồn.
- Đã khôi phục files/shared_prefs của app, reverse3000→3000/8081→8081; API3000
  refresh200 và mở sách cũ thành công. API3002/worker QA/proxy3102 đã dừng;
  bucket/DB QA đã xóa (cleanup lần2 thành công). API3000/Metro và bản sao57117
  giữ như trước; PG5433, `.env`, bucket nguồn không đổi. Không chạy worker cleanup
  trên DB acceptance vì media keys còn trỏ bucket nguồn.
- Harness/log/private config/backup nằm `.tmp/mongodb-native/` ignored; backup
  chứa session, không in/commit. Evidence đã lọc secret trong docs/refactor/evidence.
  Không chạy lại493E2E/build/lint cho gói chỉ evidence; contract/diff/JSON check
  là kiểm tra bổ sung, không đổi evidence runtime của ec4a9c9 và43Mongo của1f5d636.
- **Tiếp theo:** N21 TalkBack thật (cần dịch vụ/audio để quan sát, không thay bằng
  UI hierarchy); N20 còn tổ hợp chưa kiểm. Nếu bị chặn môi trường, làm live packaging
  trên DB/bucket QA riêng. Human review tiền/quyền, CI remote và quyết định cutover
  chính vẫn mở; không tự push/merge hoặc mở nghiệp vụ Delivered/settlement.

## Live media MongoDB — điểm mới nhất

- Nhánh **codex/mongodb-live-media**, base **1f5d636** (gói import Order đã commit).
  Commit gói live: subject `test(mongo): add isolated live Supabase media acceptance`.
  Không push/merge/deploy. Untracked Prisma generated cũ giữ nguyên.
- Thêm script opt-in `apps/api/scripts/mongo-live-media.mjs`: Nest HTTP/Mongo app
  user/MediaStorage/Sharp thật, tự tạo DB UUID `_test` và bucket Supabase private QA
  riêng; không dùng keys/bucket dữ liệu nguồn. [Báo cáo](../refactor/MONGODB_LIVE_MEDIA_2026_09_29.md).
- JPEG/PNG/WebP upload/replay/finalize→1job→Ready→signedWebP/hash original PASS;
  người ngoài404/anonymous denied; lưu/mở draft PASS; linked retention + unlinked
  cleanup xóa object/budget release PASS; sweep không lỗi. PASS7 checkpoints,
  bucket/DB QA đã dọn. Script lint/prettier/diff-check PASS. Không sửa runtime/UI.
- Gate import Order trước đó PASS43Mongo, source PG snapshot giữ nguyên; commit
  **1f5d636**. Hai gói mới chưa chạy CI remote. 493E2E/native của ec4a9c9 vẫn là
  evidence runtime gần nhất, không báo như đã chạy lại trong lượt chỉ thêm test.
- **Tiếp theo:** native upload trên Mongo với bucket QA riêng (không lấy bản sao
  media cũ để chạy cleanup), tiếp tục Q01/N20/N21 theo acceptance. Live packaging
  nếu xét gate pipeline đó vẫn chưa chạy. Human review cần người độc lập, chưa ký.
  Không tự push/merge/cutover DB chính. API3000/Metro8081/bản sao57117 và PG5433 giữ
  cấu hình lượt trước; script test không thay runtime này. Log ignored
  `.tmp/mongodb-fixes/live-media.log`; không in private config trong thư mục đó.

## Import Order MongoDB — điểm mới nhất

- Nhánh **codex/mongodb-order-import**, base **ec4a9c9**; commit subject
  `test(mongo): verify PostgreSQL import of funded shipment obligations`.
  Không push/merge; `apps/api/src/generated/` cũ vẫn giữ untracked.
- Bổ sung fixture PostgreSQL QA có PendingSellerConfirmation2, InTransit4,
  ResolutionPending5 sau pickup xung đột; mỗi đơn giữ230.000đ/sách Reserved.
  17 SQL migration/trigger nguyên vẹn; commit từng giai đoạn, không sửa DB dev.
- Import count/hash/invariant PASS; đối soát bằng app user PASS; nguồn99M +
  available310k + holds690k =100M. Snapshot PG không đổi sau import. Ledger/label
  write trái phép bị trigger23514. [Báo cáo](../refactor/MONGODB_ORDER_IMPORT_2026_09_29.md).
- Thực chạy: targeted3/3, **full Mongo43/43**, API lint/typecheck/build,
  contract check/routes PASS. Không lặp493E2E/native do chỉ đổi fixture/test.
- Gate ba trạng thái import này đã kiểm. Bước tiếp: live upload/Sharp/worker trên
  Mongo QA với bucket riêng, không cleanup bucket nguồn từ bản sao acceptance.
  Full native, human review và CI remote cho commit mới còn mở. Runtime/secret
  launcher của lượt trước giữ nguyên như mục dưới.

## Sửa MongoDB sau review — điểm mới nhất

- Nhánh **codex/mongodb-integrity-fixes**, base review **f39abb8** trên teammate
  **e860856**; remote main **b49cc52**. Commit gói này: xem `git log -1` với subject
  `fix(mongo): validate ledger references and preserve pickup evidence`.
  **Chưa push/merge/deploy**. Giữ untracked `apps/api/src/generated/` cũ, không add/xóa.
- Đã sửa **R1/P1** đối soát bỏ lọt entry thiếu journal/account và account thiếu
  owner/Order; **R2/P1** sweep báo sai lịch sử ảnh sau pickup. Service vẫn chặn
  tạo/upload mới ở InTransit. Không đổi migration, OpenAPI0.21.0, UI hoặc lock order.
  [Báo cáo sửa + native + giới hạn](../refactor/MONGODB_INTEGRITY_FIXES_2026_09_29.md).
- PASS: contract check/routes, API lint/typecheck/build, **33 unit, 42 Mongo**
  (có PostgreSQL import + failover), **493 E2E / 24 file / 647,71s** một lượt.
  Regression đã chạy đỏ trước sửa rồi xanh; source test giữ 5 ledger cases và
  assertions sweep Preparing/InTransit/ResolutionPending + upload409 sau pickup.
- Import **bản sao** PostgreSQL5433 → Mongo57117 `latlai_acceptance_20260929`:
  0 lệch count/hash, 0 lỗi invariant, vốn100M bảo toàn. Nguồn có 4 users/21 sessions/
  3 listings/7 media, **không có Order/topup**; không coi là proof paid/InTransit import.
  Nguồn đọc read-only, `.env`, password, SQL/volume cũ giữ nguyên.
- Native Pixel_7/API35/x86_64 dùng APK Q01 hiện có + Metro mới: session import
  refresh200; thêm/lưu/mở lại địa chỉ; đọc JPEG Supabase cũ; chọn catalog và lưu draft;
  force-stop/mở lại giữ session và dữ liệu. Không gặp splash đứng ở lượt này.
  Chưa test upload mới, full native/TalkBack/ARM/iOS, không gọi đó human review.
- Runtime giữ: API3000 trỏ **bản sao Mongo**, Metro8081 preview=0, adb reverse3000/8081;
  Compose `latlai-mongo-acceptance` port57117/volume riêng, PG gốc5433, QA Mongo57017/
  failover57021–23/PG55434. Font1.0, handwriting trả lại `null`. Không chạy media/order
  worker bản sao, vì keys media cùng trỏ Supabase nguồn; không cleanup bucket từ clone.
- Log/launcher/private config ở `.tmp/mongodb-fixes/` ignored. Node24.19 qua PATH
  riêng process; `node .tmp/mongodb-fixes/acceptance.mjs api` khi3000 trống, mode
  `check` chỉ đọc. Config có secret **không in/commit**. Không chạy lại import vào
  đích đã nhận ghi. Refresh emulator đã rotate trên Mongo; trở lại PG cần login lại.
- **Bước tiếp cụ thể:** bổ sung PostgreSQL import fixture có paid/InTransit/
  ResolutionPending và chuỗi hold/receipt/evidence đúng trigger trên QA; tiếp đó kiểm
  upload/worker với storage QA riêng, đóng native gates còn mở. Human review tiền/quyền
  và CI GitHub cho commit mới còn thiếu; không tự merge/push/cutover chính.

## Review MongoDB của Codex — mới hơn điểm lưu teammate bên dưới

Phần dưới là lịch sử tại f39abb8; hai phát hiện đã được sửa theo điểm lưu mới ở trên.

- Theo yêu cầu chủ dự án: fetch origin, kiểm working tree trước khi chuyển nhánh;
  fast-forward `codex/mongodb-refactor` tới **e860856**. Remote main tại **b49cc52**,
  đã nằm trong lịch sử nhánh MongoDB. Không pull/merge đè local, không merge/push main.
- Nhánh lưu kết quả **codex/mongodb-review**, base e860856; commit điểm lưu xem
  `git log -1`. Chỉ thêm báo cáo/patch tái hiện, source sản phẩm không sửa.
  [Báo cáo review](../refactor/MONGODB_REVIEW_2026_09_29.md).
- Hai lỗi đã tái hiện trên MongoDB QA có auth/quyền app thật: **R1/P1** ledger entry
  không có journal vẫn tăng số dư và qua `mongo:check`/reconcile; **R2/P1** sau pickup
  hợp lệ → InTransit, sweep báo sai `Packaging intent/receipt mismatch`. Chưa sửa.
  Patch assertion đỏ đính kèm báo cáo, chưa áp vào test suite thường.
- Đã chạy PASS: frozen install; contract:check; contract:routes (**0.21.0**, 73/15);
  API lint/typecheck/build, 33 unit, 37 Mongo (bao gồm import PostgreSQL và failover).
  API E2E toàn bộ **493/493 PASS**, 24 file, 651,64 s trên database review riêng.
  Hai assertion bổ sung R1/R2 vẫn FAIL; suite xanh không phủ nhận các phát hiện này.
- Docker Desktop đã khởi động; QA Mongo 57017/failover 57021–57023, PostgreSQL test
  55434. `.env`/DB dev/Supabase không đổi, không import dữ liệu thật. Các DB review
  đều `_test`. Thư mục Prisma generated cũ hiện untracked sau khi nhánh bỏ ignore;
  giữ nguyên, không add/commit/delete. Log ở `.tmp/mongodb-review/` (ignored).
- Chưa chạy lại browser/native và chưa xác minh GitHub CI trong lượt này. Review AI
  không đóng human-review gate. Bước tiếp theo: sửa R1/R2 + regression tests, review
  diff sửa rồi mới xét cutover và native acceptance. Báo cáo DONE của teammate bên
  dưới không thay kết quả review hoặc đóng các gate này.

## Lane MongoDB — điểm lưu teammate trước review

- Theo [MONGODB_PLAN](../refactor/MONGODB_PLAN.md). Nhánh tạo từ main `b49cc52`.
  Chưa push/merge. **Runtime giờ chỉ dùng MongoDB** (MIG-06 cutover mã nguồn); không ghi kép.
- **MIG-01 DONE**: driver `mongodb@7.6.0`, runner/lock/clock trong
  `apps/api/src/database/mongo/transaction.ts`, probe `apps/api/test/mongo`.
  [Báo cáo](../refactor/MIG01_TRANSACTION_PROBE.md), [ADR 0027](../adr/0027-mongodb-persistence-protocol.md).
- **MIG-02 DONE**: [bản đồ 44 model/backstop](../refactor/MIG02_MODEL_MAP.md), migration
  0001–0003, role `latlai_app`/`latlai_migrator`, `MongoService`, cursor v2.
- **MIG-03 DONE** [auth/executor](../refactor/MIG03_AUTH_COMMAND.md); **MIG-04 DONE**
  [catalog/listing/media/địa chỉ](../refactor/MIG04_CATALOG_LISTING_MEDIA.md).
- **MIG-05 DONE**: [báo cáo](../refactor/MIG05_QUOTE_ORDER_WALLET_SHIPMENT.md). Mọi suite
  E2E F2h đã port, số test mỗi file bằng bản PostgreSQL; sửa 1 lỗi (cửa sổ upload ảnh
  đóng gói theo giờ quyết định Order). Thiết kế tiền/quyền: chủ dự án duyệt, chưa có review độc lập.
- **MIG-06 PARTIAL**: [báo cáo](../refactor/MIG06_DATA_CUTOVER.md), [runbook](../refactor/MIG06_CUTOVER_RUNBOOK.md).
  Gỡ Prisma/PostgreSQL khỏi runtime, importer + `mongo:check`, setup/doctor/CI/tài liệu
  chuyển sang Mongo, clone sạch PASS, browser suites PASS, E2E toàn bộ 493/493 PASS một lượt, suite Mongo 37/37, unit 33/33.
  **Còn mở**: import dữ liệu dev/thật của chủ dự án (`.env` và volume PostgreSQL 5433
  chưa đổi — API nhánh này cần thêm biến `MONGODB_*`/`MONGO_ROOT_PASSWORD` theo runbook
  bước 2 mới chạy được), CI trên GitHub, native acceptance.
- QA: `pnpm infra:mongo:test:up` (57017, tmpfs), `pnpm infra:mongo:failover:up`
  (57021-57023); `MONGO_TEST_URL` như START_HERE §5. Không dùng cho `.env` app.

## Đọc ngay — sau merge ca16a22, lượt Codex trên Pixel_7

- Đầu phiên working tree sạch; main/origin/main và remote kiểm read-only cùng
  **ca16a22065ae67c620c4c212d953ebefef188608**, mới hơn 382dda2. Teammate đã merge
  A00/U02–U06, Q01 một phần, operations fix và ADR0026 Proposed.
- Nhánh **codex/q01-native-completion**, base ca16a22. Sửa lỗi picker/font Q01-F01
  cùng evidence native; commit local xem `git log -1`. **Chưa push/merge/deploy**.
- **Q01-F01 PASS trên Android15 x86_64**: Expo plugin thêm fontScale để tránh
  recreate Activity làm unregister picker. AppText remount riêng native Text theo
  OS fontScale để Fabric đo lại nhãn; không remount input/form hoặc tắt scaling.
  /ui và UI_COMPONENTS cập nhật. Không đổi API/nghiệp vụ/migration/dependency.
- Native lượt này: N03 sai→đúng PASS; N11 WebP Supabase/Sharp thật PASS; N13 cắt
  giữa PUT và lost-ack content PASS phạm vi proxy; N16 keyboard/Back bài+địa chỉ
  PASS; N18 archive bài QA riêng PASS. N20 thêm font130% với form dài, keyboard,
  sheet/dialog/checkbox, vẫn PARTIAL cho walkthrough toàn bộ.
  [Bằng chứng, hash APK, ảnh và giới hạn](Q01_NATIVE_COMPLETION_2026_09_29.md).
- Bản sửa native đã build JDK21.0.11/Node24.19.0; APK SHA256 `62e7dfd6…`, cài
  install -r giữ session/data. Đã kiểm Home→đổi font100↔130→resume, giữ nháp,
  chữ đủ/picker mở-hủy-chọn/Ready/lưu, keyboard/Back. JDK25 build đầu thất bại ở
  CMake; Metro cũ treo sau build, restart đúng process đã bundle6,2s và vào app.
  Không dùng splash timeout hay sửa node_modules.
- Kiểm thực chạy: API build, doctor (Node/DB/17 migration checksum/private bucket/
  readiness), contract check, RN lint/typecheck/68 unit PASS. APK build PASS.
  Web export0/gate route mẫu PASS; export1 + **3 browser suite PASS** trên DB
  _test55434, storage fake. Lượt browser đầu dùng nhầm export0 timeout ở showcase,
  chạy lại cấu hình đúng đã PASS; không che lần lỗi.
  Không chạy lại full480 API E2E.
- DB app local5433: nháp JPEG cũ giữ nguyên. Một bài QA có 6WebP đã archive qua UI
  sau dựng Approved bằng Member/Admin API hợp lệ. Catalog QA nhãn N18 còn lại.
  Không SQL mutate/reset/seed/migrate/đổi mật khẩu; không gọi đây là human review.
- Runtime: API3000, media/order worker cùng build, PostgreSQL5433, Pixel_7/API35
  emulator-5554 và reverse3000/8081. Metro8081 đã restart với preview=0 sau QA /ui; `.env` không đổi.
  Test DB55434 đang chạy; web dist hiện là preview=1 cho browser fixture3009,
  không dùng dist đó làm bản sản phẩm, export lại đúng env khi cần.
  Không nhầm máy Medium_Phone/API37 của teammate. Node hệ thống24.12 thấp minimum;
  dùng PATH riêng process tới runtime24.19 đã có. Font scale1.0, handwriting null.
- Gate còn mở: N20 phần còn lại, N21 TalkBack, ARM/iOS; U01 phản hồi thẩm mỹ và
  A02/R01–R09 reviewer người thật. ADR0026 vẫn Proposed, không mở D/T/C.
- **Bước tiếp theo**: tiếp tục Q01/N20 walkthrough các màn còn lại theo
  NATIVE_ACCEPTANCE; N21 cần người thực sự nghe/kiểm TalkBack. Không lặp
  A00/U02–U06 khi không có thay đổi liên quan. Điểm lưu này đi cùng commit local
  `fix(rn): preserve picker and text layout across Android font changes`; lấy SHA
  bằng `git log -1`, kiểm working tree khi nhận.

## Lịch sử bàn giao 28/09 — không dùng thay trạng thái mới nhất ở trên

Chủ dự án yêu cầu lưu tiến trình, push an toàn và giao kế hoạch dài cho bạn tiếp
nhận dùng Claude. **Chỉ bàn giao nguồn; chưa chứng nhận release hay mua sách hoàn chỉnh.**
Kế hoạch: [CONTINUATION_PLAN](CONTINUATION_PLAN.md). Prompt:
[NEXT_SESSION_PROMPT](NEXT_SESSION_PROMPT.md). Setup: [START_HERE](START_HERE.md).

- Chủ dự án yêu cầu tích hợp nhánh `codex/handoff-roadmap` vào `main` để bàn giao;
  người nhận dùng `main` trên remote
  `https://github.com/huangg49/used-book-marketplace.git`.
- Mốc code UI mới nhất: `7211236`; báo cáo lỗi mở lại cuối: `3808b57`.
- Baseline nguồn F2h: `beea372`; checkpoint cũ
  `checkpoint/f2h-handoff-2026-09-28` được giữ nguyên.
- Commit của tài liệu bàn giao: lấy bằng `git log -1`; xác minh SHA nhánh remote
  theo lệnh dưới. Không suy ra đã push chỉ từ việc file này tồn tại.
- Chủ dự án cho phép merge trực tiếp mốc bàn giao này, thay quy trình PR/reviewer
  thông thường cho đúng lần tích hợp này. Không ghi đó là independent review hoặc
  release acceptance; các gate và review cho thay đổi nghiệp vụ tiếp theo vẫn còn.
- Không force push/sửa tag cũ. Chủ dự án chuyển env qua kênh riêng theo
  [ENV_HANDOFF](ENV_HANDOFF.md), không commit/export secret vào gói Git.

```sh
git ls-remote origin refs/heads/main
git rev-parse HEAD
```

## Phần đã xong

| Phạm vi | Hiện trạng / bằng chứng |
|---|---|
| Backend | F2h/OpenAPI 0.20.0, 17 migration; auth/listing/media/address/quote/Order/ví mô phỏng đến InTransit và review quá hạn. [START_HERE](START_HERE.md) phân biệt từng API/UI |
| Baseline QA | Clone sạch baseline: 127 unit, 480 API E2E, hai suite browser; [REBUILD](REBUILD.md). Đây là kết quả ở mốc đã ghi, không phải vừa chạy lại mọi test |
| Media native | Sửa launcher worker bằng Nest; JPEG qua Supabase thật trên Android đã có bằng chứng; không đồng nghĩa mọi ca native đều qua |
| Mobile vòng 1 | Thanh điều hướng, account/login, kệ và bộ lọc với footer cố định; [MOBILE_EXPERIENCE](MOBILE_EXPERIENCE.md) |
| Mobile vòng 2 | Kệ/chi tiết dùng chung presentation, ảnh dễ mở, thông tin gọn, mẫu riêng có attribution; [SHELF_DETAIL_REVIEW](SHELF_DETAIL_REVIEW.md) |
| QA vòng UI mới nhất | 61 RN unit/9 file, RN lint/typecheck, contract check, preview/normal export và RN browser regression qua; gate route mẫu qua |
| Native vòng UI mới nhất | Pixel_7/Android 15 x86_64: kệ, detail, modal/Back, chữ OS 130%; font đã trả về 1.0. JS qua Metro trên APK sẵn có, không build APK mới |
| Operations | Queue/detail, nhãn giá, retry/conflict/focus đã có evidence; không cần làm lại nếu không đổi code liên quan |

## Lịch sử 29/09/2026 — teammate tiếp nhận trên máy mới (đã merge tại ca16a22)

| Mục | Trạng thái |
|---|---|
| Nhánh / base | `codex/a00-android-startup` từ `main` `382dda2`; chưa push/merge |
| A00 | **DONE** trên AVD `Medium_Phone` API 37 x86_64: cold start, `/`, deep link `/showcase` (nóng và cold), Back, reopen. Cơ chế: Metro watcher quá hạn khi build song song (`/status` vẫn running, bundle 500) và bundle đầu sau xóa cache ~103 s. Nguyên nhân ở máy cũ không kết luận chắc. [Evidence](A00_ANDROID_STARTUP.md) |
| Sửa kèm | `scripts/build-android.mjs` gọi `.\gradlew.bat` (chạy được khi `NoDefaultCurrentDirectoryInExePath=1`); ANDROID_QUALITY thêm cách kiểm bundle thật |
| Môi trường máy mới | Node 25.0.0 (≠ `.nvmrc` 24.15.0, vẫn thỏa engines), pnpm 11.19.0, JDK 21, Docker, Ninja 1.12.1 `.tmp/`. `.env` đủ biến (không ghi giá trị). DB Compose port 5433 mới, migrate + seed. `doctor:local` PASS |
| Test đã chạy | RN unit 61/61 PASS; `pnpm build:android --emulator` BUILD SUCCESSFUL; API `nest build` OK. Không chạy lại API E2E (backend không đổi) |
| A01 | **DONE** 29/09: kệ Android, login Member `member@latlai.local` trên Android (profile thật), operations `pnpm dev:admin` login Staff → queue listing rỗng đúng DB mới. Bucket Supabase private PASS (doctor, read-only); upload live sẽ chạy trong U02 |
| A02 | BLOCKED — cần reviewer người thật theo TEAMWORK; AI không ký thay |
| U01 | BLOCKED phần DONE — cần phản hồi thẩm mỹ thực tế của user |
| U02 | **DONE** trên `codex/u02-listing-form`: tab bước từ dữ liệu thật, footer lưu/tiếp tục trên bàn phím, cuộn tới lỗi đầu tiên, lỗi tự co khi sửa. RN 64/64, lint/typecheck, contract, browser regression 3 suite PASS; native Android create→upload thật→reject→resubmit, bàn phím, chữ 130% PASS. [Evidence](U02_LISTING_FORM.md) |
| U03 | **DONE** trên `codex/u03-address-book`: form nhóm + footer, mặc định phân biệt, hành động gọn, editor liệt kê mặc định trước. Browser regression 3 suite PASS; Android form/bàn phím số/2 địa chỉ/picker. [Evidence](U03_ADDRESS_BOOK.md) |
| U04 | **DONE** trên `codex/u04-my-books`: dòng sách có trạng thái, ghi chú từ dữ liệu thật và hành động kế tiếp duy nhất. RN 66/66, browser 3 suite PASS, Android list. Phát hiện: tab Sách của tôi theo session lúc login khi bị khóa sau đó (API vẫn chặn). [Evidence](U04_MY_BOOKS.md) |
| U05 | **DONE** trên `codex/u05-action-bar`: `core/ui/ActionBar` (dùng ở editor bài đăng + form địa chỉ, ví dụ trong `/ui`, UI_COMPONENTS cập nhật); `Screen.footer` cùng lề/max width với nội dung. RN 66/66, lint/typecheck, browser 3 suite PASS; Android footer thẳng hàng (`docs/verification/u05-footer-aligned.png`) |
| U06 | **DONE** trên `codex/u06-states-copy`: quét copy không có thuật ngữ backend; `formatVnd` một nguồn (`core/ui/format.ts`), bước Kiểm tra hiện giá như kệ. RN 68/68, browser 3 suite PASS, Android “85.000 ₫”. [Evidence](U06_STATES_COPY.md) |
| Q01 | IN_PROGRESS trên `codex/q01-native`: 29/09 PASS N01/N02/N07/N08/N11(JPEG+PNG)/N12/N13(mất mạng trước gửi)/N14/N15/N17/N18(trừ archive)/N19; PARTIAL N03/N16/N20; NOT_RUN N21 TalkBack, WebP. Sửa lỗi operations mở lại hồ sơ cũ trên `codex/ops-detail-reopen-fresh`. [Phiếu](NATIVE_RUN_2026_09_29.md) |
| Q02 | DONE cho phạm vi JS: không đổi native/tài nguyên nên APK `c5d55846…` (build 28–29/09 trên máy này) vẫn là artifact; Metro JS từ nhánh hiện tại. Export thường (preview=0) + `scripts/test-showcase-gate.mjs` PASS. ARM/iOS: N/A trên máy này (không có thiết bị/Mac), gate còn mở |
| Blocker cần người | U01 phản hồi thẩm mỹ của user; A02/R01–R09 reviewer người thật (tiền/quyền cần reviewer thứ hai); N21 TalkBack (bật dịch vụ trợ năng là thay đổi cài đặt hệ thống của thiết bị, để người thử thực hiện); ARM/iOS cần thiết bị |
| D01 | IN_PROGRESS trên `codex/d01-delivery-design`: ADR 0026 **Proposed** (actor×command, bảng chuyển trạng thái, deadline/time source, wire/dữ liệu dự kiến, ma trận test, 8 câu hỏi mở). Không code/migration. Cần reviewer tiền/quyền và chủ dự án chốt Q1–Q8 |
| Bước tiếp theo | Chờ người: phản hồi U01, review A02/R01–R09, chốt ADR 0026 Q1–Q8, TalkBack N21. Việc agent làm được tiếp khi có quyết định: D02 nháp claim/custody hoặc T01 sau khi ADR 0026 Accepted |

Process ở cuối phiên teammate (metadata lịch sử, không phải runtime hiện tại): Postgres Compose app 5433 và test 55434 (`pnpm infra:test:stop` khi xong); API/worker từ `dist` qua
`start:prod`/`worker:*:prod`; Metro `pnpm dev:rn` port 8081; AVD emulator-5554
với reverse 8081/3000. Khảo sát lại trước khi dừng; không giết toàn bộ node/java.

## Lịch sử: phần dở trước phiên 29/09

**A00 — Android dừng splash sau lượt export cuối** (đã xử lý, xem trên). Trước đó cùng code đã chạy
và có ảnh QA. Sau force-stop/mở lại bằng `mobilereactnative:///showcase`, app đứng
ở logo. Metro port 8081 trả running; `adb reverse` 8081/3000 đúng. Log được đọc
không có ReactNativeJS/AndroidRuntime error; chưa biết nguyên nhân.

Một lệnh tiếp theo mở lại MainActivity và đọc bundle HTTP bị bộ duyệt tự động
chặn với lý do chung “blocked by policy”. Không thực thi và không lách chặn.
Người tiếp nhận kiểm môi trường/quyền của mình trước khi tiếp tục; không coi việc
đổi công cụ là cách vượt một chặn còn hiệu lực. Nếu vẫn bị chặn, ghi blocker và
chuyển sang công việc không phụ thuộc thao tác đó; không đánh dấu A00 hoàn thành.

Thông tin máy trước chỉ để chẩn đoán, **không hard-code khi chuyển máy**:

- Repo Windows: `C:\Users\ASUS\Documents\LaiLai\used-book-marketplace`.
- Android package: `com.huangg49.mobilereactnative`; AVD Pixel_7, emulator-5554.
- API 3000, Metro 8081; QA API 3009/media 3010/web 8087; Postgres test 55434.
- Metro/API/worker là process local đang có. Khảo sát lại owner/command trước khi
  dừng/restart; PID trong chat cũ không còn là căn cứ. Không giết toàn bộ node/java.
- Secret nằm ở `.env` local, không gửi trong chat/Git. Máy mới tạo `.env` từ setup
  và nhập key riêng qua kênh an toàn; chưa có key thì ghi rõ media test bị giới hạn.

## Chưa làm / không được hiểu nhầm

- Form đăng sách và địa chỉ đã có U02/U03; còn phản hồi thẩm mỹ U01 và các tổ hợp
  native chưa kiểm. Không coi đó là yêu cầu thiết kế lại hai form từ đầu.
- Native N01–N21 còn ca chưa chạy, TalkBack/iOS/ARM và independent R01–R09 còn mở.
- Chưa có wallet/checkout/Order/shipment/report UI; backend có không nghĩa là UI có.
- Chưa Delivered/Buyer receipt/inspection 72h, xử lý claim/review, trả sách,
  quyết toán Seller, rút tiền, reconciliation hằng ngày hay account lock/unlock UI.
- Chưa workflow Exchange/ViaPoint/auction; DEMO-A/B là mã vùng mẫu, không là hai điểm.
- Chưa đăng ký/email verification/password recovery hoàn chỉnh; không demo login
  bằng tài khoản seed như đã có onboarding người dùng mới.
- Kệ `/` có thể rỗng đúng dữ liệu. `/showcase` là ảnh tư liệu và dữ liệu mẫu có nhãn,
  không phải hàng đang bán; đừng publish các ảnh này để lấp kệ.

## Quy trình cập nhật điểm lưu

Sau mỗi gói: ghi ID, commit, file chính, test đã chạy/kết quả, bằng chứng native
nếu có, lỗi còn mở và đúng một bước tiếp theo. Không ghi test chưa chạy là PASS.
Không lặp full suite để tiêu thời gian; chỉ lặp gate khi có thay đổi/rủi ro liên quan.
Trước khi kết thúc phiên: `git status`, commit việc đã hoàn chỉnh và push nhánh đã
được chủ dự án cho phép; đối chiếu remote SHA. Việc chưa xong ghi rõ working tree.
