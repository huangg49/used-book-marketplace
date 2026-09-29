# MongoDB — sửa lỗi toàn vẹn và kiểm tra bản sao dữ liệu

29/09/2026, nhánh `codex/mongodb-integrity-fixes`, từ review **f39abb8** của nguồn
teammate **e860856**; remote main **b49cc52**. Không push/merge/deploy trong lượt này.
Đây là phần tiếp theo của [review R1/R2](MONGODB_REVIEW_2026_09_29.md), không thay
thế review độc lập của con người hoặc chứng nhận cutover toàn bộ.

## Phần sửa

- **R1/P1:** `LedgerService.reconcile` kiểm mọi entry → journal/account và mọi tài
  khoản UserAvailable → user, OrderHold → Order, kể cả tài khoản chưa có entry.
  Kiểm journal vốn mở đầu tồn tại; `checkJournal` cũng từ chối tài khoản bị thiếu.
  Các kiểm tra nằm trong cùng snapshot, chỉ đọc; không sửa số dư hoặc dữ liệu lỗi.
  `$lookup` chạy trước aggregate có `$unwind`, tránh bỏ qua entry mồ côi.
- **R2/P1:** `checkPackaging` cho phép lịch sử evidence tiếp tục hợp lệ khi Order
  ở InTransit. Điều kiện tạo/upload của service giữ nguyên. Kiểm receipt, shipment,
  chronology, hold và commitment không bị nới lỏng.
- Không đổi OpenAPI (HEAD **0.21.0**, 73 operations / 15 controllers), migration,
  quyền DB, retry budget, lock order, dependency hoặc UI. Không mở nghiệp vụ mới.

Các lookup bổ sung làm tăng chi phí sweep theo dữ liệu. Đây là backstop đối soát,
không biến MongoDB thành có FK/constraint trigger liên-document: raw app writer
vẫn có thể ghi dữ liệu sai trước khi sweep phát hiện. Giới hạn MIG-05 vẫn áp dụng.

## Kiểm thực chạy

Windows, Node 24.19.0, pnpm 11.19.0; MongoDB QA replica set có auth 57017, failover
57021–57023, PostgreSQL test 55434. DB kiểm thử có hậu tố `_test`, app user tối thiểu
quyền; không tắt validator. Không dùng DB dev để chạy fixture phá bất biến.

| Kiểm | Kết quả |
|---|---|
| Regression ledger trước sửa | 4 negative FAIL, 1 positive PASS — tái hiện backstop bị thiếu |
| Sweep sau pickup trước sửa | FAIL `Packaging intent/receipt mismatch` |
| Ledger sau sửa | 5/5 PASS: opening + ví rỗng hợp lệ; orphan journal/account/owner/Order |
| Pickup sau sửa | Sweep trước/sau pickup và ResolutionPending PASS; tạo intent mới và upload Pending sau pickup đều 409 |
| `pnpm contract:check`, `pnpm contract:routes` | PASS, contract không đổi |
| API lint / typecheck / build | PASS |
| API unit | 33/33 PASS |
| `pnpm test:api:mongo` | **42/42 PASS**, 6 file, 17,08 s; gồm PostgreSQL import và failover 3 node |
| `pnpm test:api:e2e` | **493/493 PASS**, 24 file, 647,71 s; một lượt toàn bộ trên nguồn đã sửa |
| Import bản sao local và sweep bằng app user | PASS; xem dưới |
| Android native smoke | PASS trong phạm vi bên dưới; chưa đóng toàn bộ native acceptance |

Regression ledger ở `apps/api/test/mongo/ledger-integrity.mongo-spec.ts`; assertions
pickup được thêm vào `apps/api/test/carrier-pickup.e2e-spec.ts`. Full E2E vẫn 493 ca
do mở rộng các ca pickup hiện có. Log 500/503 trong E2E là các đường lỗi chủ động
và tranh chấp được suite kiểm; kết quả cuối exit 0, không bỏ qua test.

Log local ignored: `.tmp/mongodb-fixes/{ledger-red,ledger-green,pickup-red,pickup-green,mongo-full,e2e-full}.log`.
QA environment theo START_HERE và Compose; cần cả `MONGO_FAILOVER_URL` và
`TEST_DATABASE_URL` để thực chạy failover/import, không chấp nhận skipped làm PASS.

## Import bản sao local, không đổi nguồn chính

- Đọc PostgreSQL local **5433**, 17 migration; session nguồn đặt
  `default_transaction_read_only=on`, importer dùng snapshot repeatable-read/read-only.
  Không seed/reset/migrate/ghi SQL, không thay `.env` hoặc mật khẩu nguồn.
- Đích riêng: Compose project **latlai-mongo-acceptance**, cổng **57117**, replica set
  `rs-dev`, volume riêng, DB **latlai_acceptance_20260929**. Bootstrap app/migrator
  credentials ngẫu nhiên và áp 3 migration MongoDB. Không ghi kép.
- Import: **0 lệch đếm/hash, 0 lỗi toàn vẹn**. Có 4 users, 21 sessions, 3 listings,
  3 revisions, 7 media, 7 photo links, 37 receipts, 37 audit events, 4 outbox events,
  1 catalog đã duyệt, 1 opening journal / 2 entries. Vốn **100.000.000 VND**;
  available = held = 0. Báo cáo số lượng/hash ở
  [evidence import](evidence/MONGO_LOCAL_IMPORT_2026_09_29.json).
- Nguồn **không có Order/topup/shipment/packaging**. Import thành công này không
  chứng minh chuyển dữ liệu paid/InTransit. Fixture importer hiện tại cũng chưa có
  những trạng thái đó; cần bổ sung trước khi nhận cutover dữ liệu có nghĩa vụ tiền/sách.
- API3000 dùng bản build đã sửa + app user của DB đích. JWT và Supabase adapter lấy
  cấu hình local hiện hữu qua process environment, không đổi file `.env`.
- Sweep sau thao tác native: catalog1/listing3/addressBook1/journal1,
  `failures=[]`, vốn100M/available0/held0. Địa chỉ và sửa draft chỉ ghi vào bản sao.

## Android thật trong emulator, không phải Expo web

Pixel_7 / Android15 API35 / x86_64, `emulator-5554`, package
`com.huangg49.mobilereactnative`, fontScale1.0. Dùng APK debug hiện có của lượt Q01
(không sửa RN, không build APK mới). Metro8081 `EXPO_PUBLIC_UI_PREVIEW=0`,
adb reverse3000/8081, Nest/Mongo thật. Ảnh JPEG cũ đọc từ Supabase thật.

| Thao tác thực | Evidence |
|---|---|
| Mở app, session cũ import refresh200, profile200 | [01](evidence/mongodb-native-2026-09-29/01-imported-session.png) |
| Nhập địa chỉ QA, keyboard và nút lưu hiện đúng; POST200 | [02](evidence/mongodb-native-2026-09-29/02-address-keyboard.png), [03](evidence/mongodb-native-2026-09-29/03-address-saved.png) |
| Mở lại địa chỉ, thông tin giữ đúng; Back có xác nhận rời form | [04](evidence/mongodb-native-2026-09-29/04-address-reopened.png) |
| Mở draft có JPEG nhập từ PostgreSQL, private read200 và preview hiện ảnh | [05](evidence/mongodb-native-2026-09-29/05-imported-jpeg-preview.png) |
| Chọn catalog QA có sẵn rồi lưu draft, PUT200/GET200 | [06](evidence/mongodb-native-2026-09-29/06-draft-saved.png) |
| Force-stop rồi mở lại: vào kệ, refresh200; sách đã chọn và ảnh vẫn giữ | [07](evidence/mongodb-native-2026-09-29/07-native-restart.png), [08](evidence/mongodb-native-2026-09-29/08-draft-after-restart.png) |

Không tái hiện splash đứng ở lượt này. Kệ rỗng đúng dữ liệu nguồn (bài đã duyệt đang
archive). Có thao tác nhập nhầm focus khi tự động hóa, đã sửa trước lưu; không coi đó
là lỗi sản phẩm. Tạm tắt stylus handwriting để gõ bằng adb, đã trả về giá trị ban đầu
`null`; fontScale không đổi. Không chỉnh giao diện hoặc dữ liệu PostgreSQL gốc.

Giới hạn: chỉ đọc ảnh cũ; **không** tuyên bố upload/Sharp/cleanup trên MongoDB đã được
kiểm Supabase lại. Media/order worker chưa khởi động ở môi trường bản sao vì media
keys cùng trỏ bucket nguồn; không chạy cleanup trên dữ liệu clone. Worker trong
E2E đã chạy với storage fake. Chưa kiểm toàn hành trình native, TalkBack, ARM/iOS,
hoặc dùng screenshot này thay human review.

## Tiếp tục và điều kiện còn mở

1. Review diff R1/R2 và evidence; human review tiền/quyền vẫn mở. Không áp lại patch
   tái hiện cũ lên nhánh sửa — regression đã nằm trong source test.
2. Bổ sung fixture import PostgreSQL có paid Order/InTransit/ResolutionPending,
   receipt/audit/hold/packaging thật trong QA; so sánh count/hash/invariant. Không
   dựng bằng cách tắt trigger hoặc chỉnh số dư DB dev.
3. Kiểm upload/worker bằng Mongo với namespace/bucket QA riêng trước cleanup; tiếp
   tục các native gates còn mở theo Q01. Không cần lặp UI polish không bị ảnh hưởng.
4. CI GitHub của **commit sửa mới** chưa có (chưa push). Đạt tests local không là
   CI remote PASS. Merge/push/cutover chính cần quyết định riêng của chủ dự án.

Môi trường bản sao còn giữ để kiểm tiếp. Launcher/config nằm ở ignored
`.tmp/mongodb-fixes/acceptance.mjs` và `acceptance-private.json` (chứa secret,
không in/commit). Với Node24.19: `node .tmp/mongodb-fixes/acceptance.mjs api` để mở
API khi cổng3000 trống; mode `check` chỉ đối soát. Không chạy lại `import` trên DB đã
nhận ghi. Không bật worker cleanup vào bản sao dùng chung keys Supabase.

Đây là môi trường acceptance, không là chuyển DB chính. Refresh token trên emulator
đã rotate ở MongoDB; nếu quay về runtime PostgreSQL gốc cần đăng nhập lại thay vì
chép token/hash giữa hai DB. Giữ PostgreSQL và mọi dữ liệu cũ để đối chiếu.
