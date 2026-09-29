# Review MongoDB — 29/09/2026

Review nguồn `origin/codex/mongodb-refactor` tại **e860856**, so với
`origin/main` **b49cc52**. Fetch rồi fast-forward nhánh local; không merge vào main.
Nhánh lưu báo cáo: `codex/mongodb-review`, cùng source sản phẩm với e860856.

**Kết luận: cần sửa hai lỗi tái hiện bên dưới trước khi chấp nhận MIG-06/cutover.**
Đây là review kỹ thuật bằng AI và test thực chạy, không thay thế human review
tiền/quyền hay native acceptance. Không sửa implementation trong lượt review này.

## R1 — P1: đối soát bỏ lọt ledger entry không có journal

Nguồn: `apps/api/src/modules/wallet/ledger.service.ts`, `LedgerService.reconcile`
(vòng lặp `ledger_journals` và aggregate `ledger_entries`);
`apps/api/src/integrity/integrity.ts` cũng không kiểm entry → journal.

Tái hiện trên database QA mới, bằng user **latlai_app**, validator và quyền thật:

1. Tạo user và tài khoản UserAvailable hợp lệ.
2. Chèn hai entry có cùng journalId mới nhưng không tạo journal: credit 1.000 VND
   từ SimulatorClearing, debit 1.000 VND vào tài khoản đó.
3. Đọc số dư qua `LedgerService.available`, chạy `checkIntegrity` (bao gồm reconcile).

Kết quả thực: số dư thành viên **1.000**, `failures=[]`, `balanced=true`,
`sourceRemaining=99.999.000`, `memberAvailable=1.000`, `journals=1`, `topups=0`.
Journal duy nhất là vốn mở đầu. Assertion yêu cầu đối soát phát hiện lỗi đã FAIL.

Nguyên nhân: chỉ các journal tồn tại được `checkJournal` kiểm. Entry mồ côi vẫn được
cộng vào số dư và tổng đối soát; tổng debit/credit và vốn 100 triệu vẫn cân nên cả
`wallet:check` lẫn `mongo:check` có thể báo thành công trên dữ liệu sai.

Đây không phải chứng minh Member có API tạo tiền. Đây là lỗ hổng của backstop đối
soát mà MIG-05/MIG-06 dựa vào khi các FK/trigger PostgreSQL đã được bỏ; báo cáo MIG-05
đã thừa nhận raw writer có thể bypass C nhưng lại dựa vào sweep để phát hiện.

Đề nghị: kiểm quan hệ từ **mọi entry** về journal và account, kiểm account → owner/
Order, rồi mới tính đối soát. Thêm negative tests cho orphan journal/account và
balanced transfer không có nguồn nghiệp vụ. Không sửa số dư/dữ liệu dev bằng tay.

## R2 — P1: lịch sử ảnh hợp lệ bị coi là sai sau pickup

Nguồn: `apps/api/src/modules/orders/order-invariants.ts`, `checkPackaging`, điều kiện
`!['Preparing', 'ResolutionPending'].includes(o.state)` (dòng 592 tại e860856).

Tái hiện bằng fixture/API thật của test
`confirms authenticated timely pickup, pins factual time and retains full money and stock`:

1. Tạo/pay/accept Order, upload ảnh đóng gói, đăng ký shipment.
2. `checkIntegrity` trước pickup: không lỗi.
3. Operator độc lập emit pickup đúng hạn: HTTP 200, Order → InTransit.
4. `checkIntegrity` sau pickup: `Packaging intent/receipt mismatch` trên ảnh đã tồn tại.

Assertion sau bước 4 đã FAIL. MongoDB, HTTP và Sharp thật; storage in-memory fake.
Không dùng fake này làm evidence Supabase.

Nguyên nhân: điều kiện cho phép **tạo/upload** evidence được dùng như bất biến của
**lịch sử** evidence. Lịch sử phải còn hợp lệ khi đơn chuyển InTransit. Importer cũng
gọi `checkIntegrity`, nên PostgreSQL có đơn InTransit với ảnh đóng gói hợp lệ sẽ bị
đánh dấu import không đạt; công cụ đối soát sau cutover cũng báo lỗi giả.

Đề nghị: tách điều kiện command tạo/upload khỏi kiểm lịch sử, giữ kiểm receipt,
chronology, shipment links và tiền/sách. Thêm positive sweep/import cho InTransit,
ResolutionPending và negative test bảo đảm không mở upload mới sau pickup.

## Bằng chứng kiểm thực chạy

Windows, Node 24.19.0, pnpm 11.19.0; install frozen lockfile. Docker Desktop khởi động
cho QA; MongoDB 8 replica set có auth tại 57017, failover 3 node 57021–57023;
PostgreSQL QA 55434 chỉ làm nguồn test importer. Không đổi `.env` hoặc DB app cũ.

| Kiểm | Kết quả lượt review |
|---|---|
| contract:check | PASS |
| contract:routes | PASS: OpenAPI **0.21.0**, 73 operations / 15 controllers |
| API typecheck / lint / build | PASS |
| API unit | 33/33 PASS |
| Mongo probe, schema/quyền, failover, keyset, PostgreSQL import | 37/37 PASS |
| API E2E toàn bộ từ source e860856 | 493/493 PASS, 24 file, 651,64 s |
| R1 — orphan ledger assertion | FAIL đúng lỗi nêu trên |
| R2 — sweep sau pickup assertion | FAIL đúng lỗi nêu trên |

Contract 0.21.0 do phần manage-user đã có trên main; tài liệu F2h/0.20.0 là baseline
nghiệp vụ lịch sử, không còn là version contract HEAD. Suite importer hiện có fixture
auth/catalog/address/listing và vốn mở đầu; không chứng minh đã import paid/InTransit
Order. Import dữ liệu local thật, browser/native trên máy này và GitHub CI chưa kiểm
trong lượt này. Phạm vi đọc code: transaction/session/replay, port quyền, ledger/Order/
shipment/evidence, schema/roles, importer/integrity và cấu hình QA. Không coi đó là
chứng nhận toàn bộ hơn một vạn dòng thay đổi đều đúng.

## Tái hiện và bàn giao

Patch [MONGO_REVIEW_REPRO_2026_09_29.patch](evidence/MONGO_REVIEW_REPRO_2026_09_29.patch)
thêm hai assertion đỏ. Patch chưa áp vào source test thường; đã kiểm `git apply --check`.
Chỉ áp trên checkout review sạch tại e860856 hoặc nhánh báo cáo này. Sau khi áp:

```powershell
$env:MONGO_TEST_URL='mongodb://latlai_qa_root:local_test_only@127.0.0.1:57017/latlai_review_root_test?replicaSet=rs-test&authSource=admin'
$env:MONGO_E2E_DATABASE='latlai_review_pickup_test'
pnpm --filter @used-books/api exec vitest run --config vitest.config.mongo.ts test/mongo/review-orphan.mongo-spec.ts
pnpm --filter @used-books/api exec vitest run --config vitest.config.e2e.ts test/carrier-pickup.e2e-spec.ts -t 'confirms authenticated timely pickup'
```

Hai lệnh dùng QA-only credentials công khai của Compose, chỉ tác động database `_test`.
Lượt review đã chạy assertion pickup trên bản sao tạm của suite gốc để tránh sửa source;
patch lưu lại chỉ phần assertion bổ sung, không nhân đôi suite.
Log local ở `.tmp/mongodb-review/` (ignored), gồm `mongo-suite.log`, `e2e-suite.log`,
`orphan-ledger.log`, `pickup-integrity.log`; không commit log chứa dữ liệu fixture.

Bước tiếp theo: teammate sửa R1/R2 kèm regression tests và cập nhật report MIG-05/06;
review lại diff sửa, rerun các suite liên quan. Sau đó mới thực hiện cutover theo runbook,
kiểm native trên runtime MongoDB và lấy human review theo gate còn mở.
