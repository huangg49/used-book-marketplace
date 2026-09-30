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

Member web vẫn là Expo web. Đặt API base cho terminal client trước khi build/chạy,
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
```

Test API tạo namespace riêng, giữ artifact trong `.tmp/demo/qa-<id>`, không chạm
DB app. Real Nest/Mongo/Sharp, storage FAKE. Ca mất upload ack sau server commit,
restart cả API và chạy lại kiểm không trùng records/key, không lộ secret trong
journal/manifest, và chặn target đã mất. CI chạy cùng phạm vi; live Supabase phải
kiểm riêng bằng cấu hình private, không đưa service key vào workflow.

Code ở `scripts/demo/`: sandbox quản lý target/accounts, journal quản lý intent,
HTTP giữ auth ở memory, books điều phối API. `Commands` nhận `projectReceipt` khi
mở rộng sang kiểu receipt khác; mặc định là MutationReceipt cho sách. H01b đã có
bước funding bên dưới; các kịch bản Order chưa triển khai. Bảo tiếp phần còn lại
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

Phần tiếp cụ thể: địa chỉ mô phỏng qua API (giữ contact ngoài manifest), fulfillment
revision/submit/review, server quote, AwaitingPayment và pay/accept theo version đã
đọc; giữ hold/commitment, đối chiếu payment posting. InTransit cần label/packaging
evidence và carrier event đúng API, không gán state/fast-forward deadline. Chưa có
Order nào được tạo bởi tooling này; không gọi đây là H01b hoàn tất hoặc mở ví UI.
