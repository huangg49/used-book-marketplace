# Dựng hành trình demo bằng API

H01a tạo một đầu sách và listing có nhãn `[DEMO]`, đi qua catalog request → reviewer
confirm → draft → upload/finalize/worker → submit → reviewer approve → public shelf.
Không thêm API hoặc sửa nghiệp vụ. Seller, buyer, reviewer và operator là bốn account
fixture riêng; chỉ seller/reviewer tham gia H01a. Reviewer không có role Member.
Ảnh do công cụ tự tạo, ghi rõ mô phỏng; không đại diện cho sách thật hoặc custody.

## Chạy trên máy nhóm

Theo [TEAM_WINDOWS](TEAM_WINDOWS.md) trước để có Node/pnpm/Docker và dependencies.
Tại root repo, chạy:

```powershell
pnpm infra:mongo:test:up
pnpm --filter @used-books/api build
pnpm demo:books init demo-sang
pnpm demo:books run demo-sang
pnpm demo:books serve demo-sang
```

Hai lệnh cuối dùng cấu hình đã lưu, không nhận URL API tùy ý. `serve` giữ API ở
`http://127.0.0.1:3012/api/v1`; Ctrl+C dừng API. Muốn port khác, đặt `--port 3016`
ở lệnh `init`. Port bận thì dừng với lỗi, không tắt process khác. Lệnh `run` đóng
API sau khi hoàn tất; dùng `serve` khi thao tác client. Một run chỉ có một process
giữ khóa, vì vậy dừng `serve` trước khi `run` lại.

Mặc định là Supabase thật. Trong terminal riêng, nạp `DEMO_SUPABASE_URL` và
`DEMO_SUPABASE_STORAGE_KEY` từ cấu hình riêng theo [ENV_HANDOFF](ENV_HANDOFF.md).
Không paste key vào chat hoặc lưu trong history/lệnh ví dụ. Tool tạo/kiểm bucket
private `latlai-demo-<random run id>`, giới hạn 10MB; không dùng bucket của app chính.
Thiếu quyền/config thì BLOCKED, không tự chuyển sang fake. Không sửa `.env` hiện có.

Để phát triển khi chưa có storage, chọn rõ từ đầu:

```powershell
pnpm demo:books init demo-fixture --fixture-storage
pnpm demo:books run demo-fixture
pnpm demo:books serve demo-fixture
```

Fixture dùng file local và Sharp thật, được ghi **FAKE** trong output/manifest.
Kết quả này không đóng gate Supabase. Không đổi chế độ storage của run cũ; tạo
run có tên mới. Tool không chạy cleanup DB/object; dữ liệu demo nhỏ được giữ để xem.

Ví dụ harness bên dưới dùng Expo web của RN. React/Vite user-web riêng đã có nhưng
CORS fixture hiện không mặc định cho origin5174; kiểm harness/config trước dùng.
Đặt API base cho terminal client trước khi build/chạy,
không sửa file cấu hình dùng cho dữ liệu chính:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3012/api/v1'
pnpm --filter @used-books/mobile-react-native web
```

Admin dùng `VITE_API_BASE_URL` cùng endpoint. Android emulator dùng
`http://10.0.2.2:3012/api/v1`; hoặc `adb reverse tcp:3012 tcp:3012` và base loopback.
Đổi env cần restart/rebuild client tương ứng. API chỉ bind loopback, không hỗ trợ
điện thoại ngoài mạng. CORS cho localhost5173/8081 và QA127.0.0.1:8087.

## Dữ liệu và phục hồi

Mỗi run nằm trong `.tmp/demo/<name>/`, bị Git ignore:

| File | Dùng để |
| --- | --- |
| `private.json` | Account/email/password demo, app/migrator credentials và JWT secret; chỉ đọc local để login, không gửi cả file |
| `journal.json` | Intent key/body/version/fingerprint + receipt; không token, contact hay signed URL |
| `manifest.json` | Bằng chứng H01a hoàn tất, IDs và receipt; có thời gian và giới hạn kiểm chứng |
| `outcome.json` | Kết quả lần `run` gần nhất: RUNNING/PASS/BLOCKED; manifest PASS cũ không thay kết quả lần mới |
| `demo-cover.png` | Ảnh gốc mô phỏng; giữ nguyên bytes để upload replay |
| `run.lock` | PID/host của process đang sở hữu run |

Không commit/chia sẻ thư mục run hoặc copy DB từ máy chủ dự án. Mỗi thành viên
khởi tạo account/database riêng. File tạo với mode600; Windows vẫn theo ACL của
thư mục người dùng, không phải một vault bí mật.

Command được ghi xuống file và sync trước khi gửi. Mất ack/timeout/5xx: tối đa ba
lần thử, mỗi request tối đa15s; giữ nguyên key/body/version. Sau đó dừng với intent
pending để lần sau replay. Upload lấy ticket mới theo session hiện tại, giữ cùng
bytes/digest/key; ticket không được ghi ra file. Receipt được lưu theo trường đã
cho phép; bước sau đọc projection hiện tại. 4xx (ngoại trừ408) dừng intent bền vững,
không tự làm mới version hoặc đổi key. Journal lỗi/intent bị sửa thì fail closed.

HTTP429 có thể do đăng nhập nhiều lần liên tiếp: đợi cửa sổ throttling thật rồi
chạy lại; không xóa `login_attempts`, sửa guard hay tạo IP giả. Phiên được dùng lại
trong cùng tiến trình, chỉ ở memory. Không persist access/refresh token.

Sau crash, giữ run/journal. Nếu `run.lock` còn lại, đọc PID/host, xác minh đúng
process đã dừng rồi chỉ xóa **file khóa đó** trước khi chạy lại; tool không tự cướp
khóa. Sau khi được backend từ chối, xem HTTP status/receipt/projection để xác định
nguyên nhân; nếu cần kịch bản khác thì tạo run mới, không sửa intent cho chạy xanh.

Mongo bị giới hạn QA `127.0.0.1:57017`, replica `rs-test`; mỗi DB tên random
`latlai_demo_<id>_test`, có app role ít quyền và migrator riêng. Seed chỉ tạo account
mới bằng `$setOnInsert`; catalog/listing/media/decision đều qua API. Không reset
hoặc ghi nghiệp vụ vào DB/bucket chính. QA là tmpfs: **restart container mất dữ
liệu**. Run đã provisioned thiếu identity sẽ dừng `SANDBOX_LOST`; khởi tạo tên mới,
không replay lịch sử vào DB trống. Không dùng QA làm kho dữ liệu cần giữ lâu dài.

## Kiểm tra và mở rộng

```powershell
pnpm test:demo
pnpm infra:mongo:test:up
pnpm --filter @used-books/api build
pnpm test:demo:api
pnpm test:demo:funding
pnpm test:demo:orders
pnpm test:demo:transit
```

Test API tạo namespace riêng, giữ artifact trong `.tmp/demo/qa-<id>`, không chạm
DB app. Real Nest/Mongo/Sharp, storage FAKE. Ca mất upload ack sau server commit,
restart cả API và chạy lại kiểm không trùng records/key, không lộ secret trong
journal/manifest, và chặn target đã mất. CI chạy cùng phạm vi; live Supabase phải
kiểm riêng bằng cấu hình private, không đưa service key vào workflow.

Code ở `scripts/demo/`: sandbox quản lý target/accounts, journal quản lý intent,
HTTP giữ auth ở memory, books điều phối API. `Commands` nhận `projectReceipt` khi
mở rộng sang kiểu receipt khác; mặc định là MutationReceipt cho sách. H01b đã có
funding và bốn trạng thái Order bên dưới. Bảo tiếp review/debug H02
theo [DEMO_PLAN](DEMO_PLAN_2026_10_06.md),
không ghi ledger/balance/state trực tiếp. H01a không đóng native/human review hoặc
gates cho Delivered/settlement.

## Bằng chứng local 30/09/2026

Nhánh `codex/h01-demo-scenarios`, base46f988d, gói commit có subject
`feat(demo): orchestrate recoverable book scenarios on isolated API`.
API/contract/migrations/UI product không đổi. Các checks thực chạy:

- API build, unit8/8, focused real API test, oxlint, docs:check và diff-check PASS.
- QA dùng replica57017/rs-test, DB random *_test, storage FAKE: mất upload ack ba
  lần sau commit, restart API rồi resume; rerun giữ IDs/keys và một record mỗi
  catalog/listing/media/job/catalog decision/listing decision. Chặn SANDBOX_LOST,
  target main/remote, body drift, xung đột409, lock cạnh tranh và malformed receipt.
- Supabase live: run `h01-acceptance`, dedicated private random bucket/DB; run và
  rerun PASS,9 receipts cùng key/IDs. Không ghi vào bucket hoặc DB local chính.
- Expo web export tới `.tmp/demo/member-web`, API demo3012; browser IAB thực tế
  shelf → detail (ảnh live và thông tin demo) → Back PASS. Screenshot local:
  `.tmp/demo/h01-live/member-detail.jpg`. Không đổi source UI.

Parser receipt ban đầu chưa nhận ListingState object và login lặp gặp429 trong
test; đã sửa tool và tái dùng phiên memory trong tiến trình, giữ throttling thật.
Một lệnh lint ban đầu dùng path chứa `..` bị oxlint từ chối; chạy lại absolute paths
PASS. Đây là lỗi triển khai/tool invocation đã xử lý, không phải bug backend mới.
CI workflow đã thêm nhưng remote CI NOT RUN; native/human review NOT RUN. QA data
là disposable tmpfs; artifact/screenshot private bị ignore, không có trong clone mới.

## H01b — nguồn tiền mô phỏng (increment đầu)

```powershell
pnpm demo:funding init demo-tien --fixture-storage
pnpm demo:funding run demo-tien
pnpm test:demo:funding
```

Port mặc định3016; đặt `--port` khi init nếu bận. Init sinh simulator secret riêng,
opt-in chỉ cho namespace mới; các run H01a cũ vẫn tắt simulator. Có thể chạy live
storage bằng cấu hình private như H01a; bản thân funding không có media và không
kiểm storage. `--fixture-storage` chỉ chọn backend storage giả, không giả API/tiền.

Buyer tạo topup1M qua `/me/topups`; TEST_OPERATOR độc lập gửi sự kiện Succeeded qua
adapter đã có. Event ID/amount/recipient/occurredAt/key được giữ trong intent; thời
gian lấy từ intent server, không chỉnh clock. Adapter ký/kiểm HMAC ở server. Secret
không xuất hiện trong request, journal hoặc manifest. Tool không ghi ledger/balance.
Chỉ có một topup trong run; không nạp bù khi reconciliation lệch.

Đối chiếu topup/receipt/wallet/history qua API và `LedgerService.reconcile` chỉ đọc
trong snapshot transaction trên sandbox: nguồn còn99M, Member available/held tổng1M,
debit/credit cân bằng. `funding-manifest.json` chứa IDs/receipts/số liệu mô phỏng;
`funding-outcome.json` ghi lần chạy gần nhất. Không dùng manifest sách để suy kết
quả tiền, hoặc kết quả funding để suy Order đã được dựng.

Bằng chứng local: nhánh `codex/h01-f2h-scenarios` từae0f1d9; subject
`feat(demo): add finite funding scenario with ledger reconciliation`.
Unit9/9, focused funding HTTP/Mongo test PASS: mất ack sau khi credit ba lần,
restart API rồi resume/rerun cùng event/key/body; vẫn1topup,1event,2journals gồm
opening,4entries,2receipts. Member gửi operator event bị403, simulator không opt-in
và operator trùng recipient bị chặn; không phát sinh posting. CLI init/run/rerun
`h01-funding` PASS. H01a API test chạy lại PASS vì sandbox dùng chung thay đổi.
Oxlint/docs/diff checks PASS; remote CI/human review NOT RUN.

## H01b — Order chưa thanh toán, đã trả tiền và Preparing

```powershell
pnpm demo:orders init demo-don --fixture-storage
pnpm demo:orders run demo-don
pnpm demo:orders serve demo-don
pnpm test:demo:orders
```

Port mặc định3020; `--port` chỉ ở init. Để dùng Supabase thật, nạp private env như
H01a và bỏ `--fixture-storage`. Không repurpose run books/funding cũ: Order cần
namespace mới, simulator opt-in và hai địa chỉ ghi rõ mô phỏng ở `private.json`.
Không điền contact thật. Journal chỉ lưu actor/ref/hash; lúc gửi request, tool đọc
lại private input đúng digest. Binding giữ hash cấu hình Order; sửa đầu vào sẽ
fail closed trước replay, không đổi contact dưới key cũ.

Tool tạo địa chỉ qua API, nạp1M qua operator độc lập rồi lần lượt tạo ba sách với
fulfillment DirectDelivery, media/submit/review thật. Buyer lấy quote server cho
mỗi sách; amount/deadline/version không tự tính hoặc gán trong DB. Thứ tự tạo tuân
theo giới hạn hai đơn unpaid đồng thời:

| Slot trong manifest | Trạng thái | Tiền/sách |
| --- | --- | --- |
| `awaiting` | AwaitingPayment | Chưa debit; commitment Active, sách Reserved |
| `paid` | PendingSellerConfirmation | Buyer payment một lần, OrderHold=P+S |
| `preparing` | Preparing | Seller acceptance, hold vẫn giữ, pickup deadline cố định; seller chưa nhận tiền |

Tool đọc projection cả hai participant, private listing Reserved và kiểm invariant
Order trong Mongo snapshot chỉ đọc. Wallet history đối chiếu **debit âm** đúng Order;
ledger cân bằng, nguồn99M, tổng available+held1M. Với policy hiện tại: available690K,
held310K; số trả lấy từ quote, không hardcode trong command. Seller=0.

Intent quote/create/pay/accept ghi trước request. Nếu create có intent, tool phục
hồi receipt trước, không đòi sách đã Reserved phải còn public. Books/funding/orders
dùng chung một journal trong tiến trình để không ghi đè bước của nhau. Payment/
acceptance không tự nâng version của listing hoặc commitment.

`orders-manifest.json` chứa Order/quote/context/listing IDs, amount/deadline, receipt
và reconciliation. `orders-outcome.json` là lần chạy gần nhất; PASS cũ không thay
kết quả mới. `manifest-orders-<slot>-book.json` là evidence sách lúc approved,
trước reservation, không là visibility hiện tại. Manifest không contact/token/URL ký.

Deadline thật: unpaid15 phút, seller confirmation/pickup48 giờ. Run quá deadline
hoặc projection khác state yêu cầu bị BLOCKED; giữ đơn/hold/intent để điều tra,
không sửa clock, restock, refund hoặc quay lại phiên bản cũ. Dựng run mới sát demo.
Tool không tự tick OrderWorker; khi thử expiry/carrier workflow phải dùng worker/
API thực trong sandbox. AwaitingPayment quá hạn không là ca demo hợp lệ.

Order dùng bốn login ở lần đầu. Restart **toàn bộ CLI** ngay có thể gặp429 do
limit5 login/IP trong cửa sổ15 phút; chờ cửa sổ thật có thể vượt unpaid deadline.
Không persist token, xóa login attempts hoặc nới guard. Evidence restart bên dưới
chỉ là restart API, giữ session trong memory của test process; chưa chứng nhận
phục hồi toàn bộ CLI sau crash. Journal vẫn bảo toàn intent khi bị chặn.

Bằng chứng local30/09: nhánh `codex/h01-order-scenarios`, base428cafd; subject
`feat(demo): build recoverable F2h order scenarios through existing APIs`.

- Unit11/11; focused HTTP/Nest/Mongo/Sharp Order test PASS, storage **FAKE**: mất
  ack ba lần sau commit ở quote/create/pay/accept, restart API giữa các điểm rồi
  resume bằng session memory. Giữ key/body/receipt/deadline; rerun không thêm dữ
  liệu:40 receipts,3 orders/contexts/commitments,1 preparation,4 journals/8 entries.
  Actor sai, replay sai actor và create mới từ quote đã Reserved bị từ chối. Kiểm
  journal/manifest không có secret/contact; transport projection deadline giả lập
  quá hạn bị tool chặn, không chỉnh DB/clock server.
- `test:demo:api` và `test:demo:funding` PASS vì books/funding/sandbox dùng chung đổi;
  oxlint/format/docs/diff checks PASS. Node24.19.0/pnpm11.19.0.
- CLI `order-live` init/run PASS trên Supabase thật, dedicated private random
  bucket/QA DB, ba pipeline ảnh thật và ledger khớp. Live lost-ack/restart chưa
  chạy; ca này kiểm bằng fixture API thật. Không dùng bucket/DB chính.
- Member web export riêng `.tmp/demo/order-member-web`, API3024; IAB thật: kệ
  public trống vì3 sách Reserved; seller login → địa chỉ → Back → Sách của tôi
  thấy3 “Đang giữ cho một đơn” → quản lý sách, ảnh live và input disabled đúng
  trạng thái. Screenshot `.tmp/demo/order-live/member-reserved.jpg`. Không đổi UI.

Trong phát triển có lỗi tool dùng tên trường hold/commitment version chưa đúng,
so payment history với amount dương và test đếm nhầm tên collection. Đã sửa theo
contract/code/ledger rồi chạy lại; không đổi backend hoặc hạ invariant để test xanh.
API/contract/migration và dữ liệu chính không đổi. Remote CI, full CLI crash
recovery, Android và human review NOT RUN; READINESS giữ nguyên.

## H01b — InTransit bằng packaging, label và carrier simulator

```powershell
pnpm demo:orders init demo-ship --in-transit --fixture-storage --port 3026
pnpm demo:orders run demo-ship
pnpm demo:orders serve demo-ship
pnpm test:demo:transit
```

`--in-transit` chỉ ở init và nằm trong binding của run; không sửa `private.json`
để thêm flag vào run cũ. Live Supabase dùng private env như trên, bỏ fixture flag.
CLI vẫn ghi kết quả gần nhất vào `orders-outcome.json`. Xem `transit-manifest.json`
cho **toàn bộ** hành trình; `orders-manifest.json` chỉ là checkpoint trước shipping.
PASS ở checkpoint không thay kết quả shipping BLOCKED hoặc outcome mới hơn.

Tool giữ ba mẫu unpaid/paid/Preparing và thêm một Order thứ tư cho InTransit:

1. Tạo sách/fulfillment/review/quote/pay/accept qua cùng API; giữ unpaid cap.
2. Seller reserve packaging bằng Order version hiện tại rồi PUT cùng bytes/key.
   Đây là ảnh carton **do tool tạo, có nhãn DEMO** để kiểm pipeline, không phải ảnh
   kiện sách thật hay xác nhận quyền sở hữu/custody. Sharp chuẩn hóa đồng bộ, original
   giữ private; participant GET preview qua API. Không tái dùng ảnh listing làm evidence.
3. Seller đăng ký một label LatLaiSimulator với tracking mô phỏng và một Ready
   evidence thuộc đúng Order. Receipt version1 là Shipment; Order vẫn Preparing3,
   pickupConfirmed=false, không thay tiền/commitment/deadline.
4. TEST_OPERATOR độc lập gửi PickedUp; **Idempotency-Key=eventId** ghi bền vững trước
   request. `occurredAt` lấy từ serverTime của API sau đăng ký label, không dùng
   clock client hay chỉnh DB. Adapter ký/kiểm domain carrier ở server bằng secret
   simulator đã opt-in; client không gửi signature/secret hoặc tự chọn actor override.
5. Chỉ Applied event kịp hạn mới cho Order InTransit4, Shipment view PickedUp2;
   delivery deadline cố định240h từ occurredAt. Label registration/ảnh không tự chứng
   minh dispatch. Đối chiếu canonical event/history, Order/Shipment/Packaging invariant
   và ledger snapshot chỉ đọc. API/contract/migration/UI product không đổi.

Với input/policy demo hiện tại: available535K, held465K, nguồn99M, seller0. Số tiền
được lấy từ quotes; packaging/label/pickup không thêm posting hay release commitment.
Receipt versions của evidence/Shipment/event độc lập với Order. Preview URL chỉ ở
memory; manifest giữ IDs/time/hash/amount/dimensions, không contact/tracking/signature/
token/URL ký. Journal có tracking **mô phỏng** để replay nhưng không contact/secret.
Target preview bị giới hạn đúng project/bucket/object; fixture HTTP không phục vụ original.

Nếu pickup pending đã commit, resume chấp nhận đọc InTransit hiện tại, phục hồi đúng
receipt, không ép Preparing lại. ReviewRequired/projection khác mẫu thì dừng và giữ
hold/evidence, không refund/restock, sửa deadline hoặc tự giải quyết carrier review.
Throttling và giới hạn full CLI crash recovery ở phần trước vẫn áp dụng.

Bằng chứng local30/09: nhánh `codex/h01-intransit-scenarios`, base274d100; subject
`feat(demo): add isolated packaging and carrier pickup scenarios`.

- Unit14/14 và `test:demo:transit` real HTTP/Nest/Mongo/Sharp **FAKE** PASS: mất ack
  ba lần sau commit tại packaging PUT/label/pickup, restart API bằng session memory;
  giữ key/body/bytes/receipt/deadline. Hai pickup request cùng event/key chạy đồng thời
  ngay lần apply đầu: chỉ1 Applied event. Rerun giữ57 intents/receipts:40 bước gói cũ
  +13 cho Order thứ tư +4 shipping;4 Orders/commitments,2 preparations,1 evidence/
  label/pickup,5 journals/10 entries. Không tăng ledger/commitment version tại pickup.
- Thay bytes dưới upload key cũ bị tool chặn. Actor sai, carrier key/eventId lệch,
  payload đổi dưới event cũ và tracking không khớp bị từ chối. Preview original ở
  fixture bị404; journal/manifest không có secret/contact. Ca API riêng sau baseline:
  event ID mới cùng occurredAt → Duplicate; thời gian mâu thuẫn → ReviewRequired/
  ResolutionPending5. Canonical pickup, hold và commitment giữ nguyên; tool chặn run
  không còn đúng mẫu. Đây là exception intake, không là kết luận custody/human review.
- Regression `test:demo:api`, `test:demo:funding`, `test:demo:orders`, oxlint/format,
  docs/diff checks PASS. Node24.19.0/pnpm11.19.0. Không chạy lại full backend/native
  baseline vì source nghiệp vụ/UI không đổi; remote CI NOT RUN.
- `transit-live` init/run và **rerun bằng CLI process mới sau cửa sổ login thật** PASS
  trên Supabase dedicated private random bucket + QA DB;57 keys/receipts/IDs và business
  counts/deadlines/ledger không đổi. Đây là acknowledged rerun, chưa là CLI crash/lost-ack
  live acceptance. Packaging preview qua participant API đã tải/xem WebP800×600, chỉ
  lưu ảnh ở `.tmp/demo/transit-live/packaging-preview.webp`, không lưu URL/token.
- Expo web export riêng `.tmp/demo/transit-member-web`, API3030; IAB thật seller login
  → Sách của tôi thấy4 Reserved (kể cả InTransit), không có UI shipping/Order mới.
  Screenshot `.tmp/demo/transit-live/member-reserved.jpg`. Không suy thành native PASS.

Harness ban đầu giữ tham chiếu mutable khi so snapshot intent và đếm58 thay vì57;
đã sửa cách chụp snapshot/phép cộng, đối chiếu counts thật rồi chạy lại. Không phát
hiện lỗi backend mới trong phạm vi này; kết quả không bảo đảm mọi source đều hết bug.
H01a/H01b **tooling đã đủ local** để bàn giao review. Human/native gates vẫn mở;
không mở Member checkout/shipping UI, Delivered/inspection/settlement từ evidence này.

## Đường đọc H02 cho gói bàn giao H01

Đã tích hợp qua [PR7](https://github.com/huangg49/used-book-marketplace/pull/7):
mainf875df9, CI6/6 job PASS trên head9c430ac; tree merge giống head được kiểm.
Code/source bên dưới giữ SHA trước squash để truy vết từng increment. CI không
đóng full CLI crash/native/human release gates; ngoại lệ review chỉ cho tích hợp này.

Review gói H01 lấy base main1be5144, implementation head d4f8220; nhánh
`codex/h01-handoff` giữ cả docs/AI/plan và code phụ thuộc. Không chỉ đọc commit
InTransit cuối. Nhận xét phải gắn source, invariant và ca tái hiện; findings của
AI không thay ký nhận người thật theo [TEAMWORK](../TEAMWORK.md).

| Phần cần đọc | Điểm vào | Câu cần kiểm chứng |
| --- | --- | --- |
| Tiếp nhận AI và tài liệu | [AI_WORKFLOW](../AI_WORKFLOW.md), [AGENTS](../../AGENTS.md), [checker](../../scripts/check-agent-docs.mjs) | Có phân biệt hướng dẫn/contract/implementation/evidence và giữ release gates không? Teammate nhận đủ dependency trên cùng SHA không? |
| Target/accounts/storage | [sandbox](../../scripts/demo/sandbox.mjs) | Chỉ QA57017/rs-test, random *_test/bucket riêng; SANDBOX_LOST chặn replay vào DB rỗng; role tách biệt, không đổi account cũ? |
| Intent và transport | [journal](../../scripts/demo/journal.mjs), [HTTP](../../scripts/demo/http.mjs) | Intent lưu trước request, không đổi key/body/version/bytes sau mất ack; rejected command dừng, token chỉ ở memory và lỗi không in payload riêng? |
| Tiền và Order | [funding](../../scripts/demo/funding.mjs), [orders](../../scripts/demo/orders.mjs) | Mọi mutation qua API; source hữu hạn, ledger/hold/commitment/deadline khớp quote và projection, replay/race không nhân đôi? |
| Packaging và pickup | [transit](../../scripts/demo/transit.mjs), [focused QA](../../scripts/test-demo-transit.mjs) | Label không tự chuyển InTransit; operator độc lập, key=eventId; conflict giữ canonical pickup/hold; preview private, ảnh DEMO không là custody proof? |

Đối chiếu bảng evidence phía trên trước chọn test; không chạy lại mọi backend/
native baseline. Nếu sửa findings, chạy ca liên quan và cập nhật source/evidence;
giữ full CLI crash/lost-ack live và giới hạn login/deadline là phần chưa nghiệm thu.
Owner/reviewer thứ hai chưa được chỉ định; chưa có human sign-off. Remote CI đã
đạt tại PR7 trên source9c430ac, không phải kết quả tại increment d4f8220 lịch sử.

Ngoại lệ tích hợp30/09: chủ dự án yêu cầu merge gói H01 khi checks cần thiết đạt,
không yêu cầu human review cho riêng PR này. Human review vẫn NOT RUN, không là
PASS của gate review độc lập trong READINESS. Không bypass CI hoặc mở release/
nghiệp vụ sau F2h; không thay quy tắc TEAMWORK cho thay đổi khác.

Preflight bàn giao trên source d4f8220 riêng không node_modules: Node24.19.0 chạy
14/14 unit PASS không cần install. pnpm11.19.0 run trên source chưa cài kích hoạt
implicit install (fixture đầu thiếu workspace manifests nên bị từ chối). Job unit
trong demo CI chuyển sang `node --test scripts/demo/*.test.mjs`, sau đó mới cài
dependency bằng `pnpm install --frozen-lockfile`. YAML parse/order/format và docs
checker5/5 PASS local; không thay kết quả CI trên GitHub hoặc kiểm thử backend.
