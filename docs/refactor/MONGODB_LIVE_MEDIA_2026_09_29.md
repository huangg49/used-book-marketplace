# MongoDB — upload và media worker với Supabase thật

## Bổ sung packaging — 29/09, sau native616d1d8

Nhánh `codex/mongodb-live-packaging`: thêm `scripts/mongo-live-packaging.mjs`,
dùng môi trường cách ly của runner bên dưới. Không sửa runtime/contract/migration.
Chạy cùng lệnh listing bên dưới, thêm `$env:RUN_MONGO_LIVE_PACKAGING='1'` trước
`node --env-file=.env scripts/mongo-live-media.mjs`. Khi bật, runner chỉ chạy lane
packaging; đặt0 hoặc bỏ biến để chạy lane listing. Actor/session là fixture QA;
catalog/listing/address/quote/Order/topup/payment/acceptance đi qua HTTP thật.

- PASS JPEG/PNG/WebP: original đúng hash, preview WebP80×120 bỏ EXIF, Buyer/Seller
  đọc được; Buyer upload404, outsider404, generic Staff/Admin/operator403,
  anonymous401 và public storage URL bị từ chối. Replay create/upload có đúng
  receipt, changed bytes422, metadata list không lộ keys/URL.
- Fault PNG xảy ra **sau khi Supabase thật ghi original**, trước preview/DB ack:
  Pending và reservation còn nguyên, chưa có upload receipt. Retry cùng bytes/key
  qua adapter create-only→Ready, một upload receipt; original không bị ghi đè.
  Fault chỉ bọc method để ném lỗi sau real I/O, không thay storage bằng fake.
- Listing cleanup giữ originals packaging; Order Preparing/version3, hold230.000đ,
  wallet và active commitment không đổi; sweep0 lỗi. Chưa kiểm native packaging
  vì UI nghiệp vụ này chưa có, cũng không suy ra custody/delivery/settlement.
- Tìm/sửa lỗi **harness**: so cả `serverTime` gây false failure (Order rồi wallet,
  hai lượt chạy đầu); nay chỉ bỏ observation time, vẫn so toàn bộ business response.
  Cleanup cũ gọi `emptyBucket` rồi xóa ngay có race vì empty được xếp hàng
  ([Supabase API](https://supabase.com/docs/reference/self-hosting-storage)). Nay ghi
  nhận mọi key định ghi qua adapter, remove đúng các key đó rồi delete bucket mới
  tạo; vẫn báo thất bại nếu chưa dọn xong. Bucket còn lại của pilot đã xóa riêng.
- Lượt cuối packaging **7 checkpoints, ok=true**, DB/bucket đã dọn. Đã kiểm lại lane
  listing vì sửa cleanup dùng chung; kết quả ghi ở SESSION_STATE. Oxlint/prettier,
  contract check/diff-check PASS. Không lặp493E2E hoặc build vì runtime không đổi.

Gate còn mở: TalkBack/full native/N20, human review, CI remote và cutover chính.
TalkBack có trên AVD nhưng chưa có kênh audio quan sát trong lượt này; không đánh
dấu PASS bằng UI hierarchy. Cảnh báo RN `Error: undefined` ở lượt native trước vẫn
chưa xác định nguồn. Không có lỗi nghiệp vụ mới được xác nhận trong gói packaging.

## Listing media — bằng chứng gói1452927

29/09/2026, nhánh `codex/mongodb-live-media`, base **1f5d636**. Thêm script kiểm
opt-in `apps/api/scripts/mongo-live-media.mjs`; không đổi source runtime/API/UI.

## Phạm vi và cách ly

- Nest HTTP thật (Supertest), MongoDB8 có auth/replica set QA57017, app user ít quyền,
  MediaStorage/Supabase thật và Sharp thật. Không override storage hoặc worker.
- Mỗi run tự tạo một DB có UUID/hậu tố `_test`, migrate3 và một **bucket Supabase mới**
  tên `latlai-qa-<UUID>`: private, giới hạn10MB, MIME JPEG/PNG/WebP. Tạo bằng cấu hình
  server local đã có, không in key/project URL/signed URL; không sửa `.env`.
- Không lấy media keys từ DB import, không chạy cleanup trên bucket nguồn. Cleanup
  chỉ tác động DB/bucket tạo trong chính run; thử dọn từng resource kể cả bước trước
  thất bại. Nếu dọn thất bại, exit1 và báo tên resource QA cần xử lý.
- Actor/session là fixture QA, không phải test đăng nhập qua mật khẩu. Luồng token
  vẫn qua auth/permission của HTTP API thật. Không thay evidence native picker.

## Kết quả thực chạy

JPEG, PNG và WebP mỗi loại một ảnh200×300:

1. Tạo draft/intent và lấy upload ticket qua HTTP; người khác lấy ticket404.
2. Upload cùng key hai lần qua API vào Supabase; finalize/replay200, đúng **một job**.
3. Private read trước xử lý422; `MediaWorker.tick()` claim từ Mongo, đọc Supabase,
   Sharp chuyển WebP, upload derivative, Ready; tick kế tiếp không còn job.
4. Signed URL tải được WebP200×300 không EXIF; đọc original đúng hash bytes ban đầu.
   Người khác đọc qua API404; anonymous public URL không đọc được.
5. Lưu/mở lại draft giữ đúng3mediaIds. Chỉ age clock của media trong DB QA riêng để
   kiểm cleanup: ảnh còn link không bị purge; tháo link qua API rồi cleanup tạo
   tombstone, xóa original/derivative thật, `reservedBytes=0`.
6. Sweep cuối `failures=[]`. Bucket QA được xóa, DB QA được drop, không để lại ảnh QA.

Run đầu PASS7 checkpoints. Script đã được chỉnh cleanup để vẫn thử dọn resource
sau nếu một bước close thất bại; run cuối theo đúng source commit cũng PASS7,
`ok=true`, exit0. Log local ignored `.tmp/mongodb-fixes/live-media.log`.
Script lint/prettier và `git diff --check` PASS. API build dùng từ lượt import
(runtime không đổi); không lặp493 E2E hoặc native cho việc thêm script.

## Chạy lại có chủ đích

Node24.19/pnpm11.19; build API trước. Tại `apps/api`, dùng private `.env` server
đã cấu hình Supabase và QA replica set đã chạy. Bật opt-in rõ ràng:

```powershell
$env:RUN_MONGO_LIVE_MEDIA='1'
$env:MONGO_TEST_URL='mongodb://latlai_qa_root:local_test_only@127.0.0.1:57017/latlai_live_media_root_test?replicaSet=rs-test&authSource=admin'
node --env-file=.env scripts/mongo-live-media.mjs
```

Credential trong lệnh là QA-only công khai của Compose. Script tự sinh mật khẩu app/
migrator và JWT chỉ trong process. Không chạy mặc định trong CI để tránh phụ thuộc
secret/provider và tài nguyên từ xa. Chỉ chạy khi muốn tạo/xóa bucket QA thật.
Lỗi chỉ báo stage, không dump response có token hoặc URL.

**Giới hạn:** Đây là HTTP/worker/live-provider acceptance cho listing media, chưa là
Android/iOS upload acceptance trên MongoDB; chưa kiểm live packaging pipeline hoặc
fault mạng/background của native. Q01/TalkBack/ARM/iOS, human review tiền/quyền,
CI remote và quyết định cutover DB chính vẫn mở. Database acceptance57117, bucket
nguồn và PostgreSQL5433 không đổi bởi script.
