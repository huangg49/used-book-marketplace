# MongoDB — import nghĩa vụ tiền/sách

29/09/2026, `codex/mongodb-order-import`, base **ec4a9c9**. Chỉ thêm kiểm thử và
tài liệu; không sửa API/runtime, SQL migration, OpenAPI hoặc dữ liệu dev.

## Fixture và kết quả

Fixture mới `apps/api/test/mongo/postgres-order-fixture.ts` được suite importer gọi
trên schema UUID riêng của PostgreSQL QA55434 (`usedbooks_test`). Áp nguyên 17 SQL
migration; không tắt trigger, không thay function hoặc bypass validation. Tạo nguồn
bằng SQL tham số hóa trong các transaction cho từng giai đoạn, không chỉnh số dư.
Nguồn tiền là topup mô phỏng 1 triệu, có journal/entries/event/receipt/audit/outbox.
Đây là fixture dữ liệu, không chứng minh HTTP authorization hoặc chữ ký simulator.

Ba Order trên ba sách riêng:

| Trạng thái | Order version | Tiền giữ | Context/commitment |
|---|---|---|---|
| PendingSellerConfirmation | 2 | 230.000đ | Holding/Active, version1 |
| InTransit | 4 | 230.000đ | Holding/Active, version1 |
| ResolutionPending sau pickup xung đột | 5 | 230.000đ | Holding/Active, version1 |

Hai Order sau có Ready packaging, shipment LabelCreated bất biến và Applied pickup;
Order cuối thêm event ReviewRequired cùng carrier review. Packaging được commit khi
Preparing rồi mới pickup ở transaction sau, đúng trigger lịch sử PostgreSQL.

Importer thật → MongoDB QA có auth, migrate3, quyền migrator; sau đó sweep lại bằng
**latlai_app**. Kết quả: count/hash toàn bộ collection khớp, failures rỗng; nguồn còn
99 triệu, ví310.000đ, holds690.000đ, tổng vốn100 triệu. Assertion từng hold230.000đ,
listing Reserved, agreement giữ nguyên, label vẫn version1/LabelCreated, Applied
pickup và deadline240h giữ nguyên; review không làm refund/release.

Có3 orders,5 journals,10 entries,2 packaging/link,3 pickup events,1 carrier review.
So snapshot PostgreSQL trước/sau import: bằng nhau. Hai lệnh thử sửa ledger và label
bị PostgreSQL từ chối23514, chứng minh backstop không bị tắt. Không ghi vào5433,
không dùng dữ liệu tài khoản thật, không gọi Supabase.

## Kiểm thực chạy

Node24.19.0/pnpm11.19.0/Windows, PostgreSQL17, MongoDB8 replica set có auth.

- Targeted importer: **3/3 PASS**.
- `pnpm test:api:mongo`: **43/43 PASS**,6 file,19,40s; gồm import và failover3node,
  không skip. Cần `TEST_DATABASE_URL`, `MONGO_TEST_URL`, `MONGO_FAILOVER_URL` QA.
- API lint/typecheck/build; contract:check/routes: PASS (0.21.0,73operations/15controllers).
- `git diff --check`: PASS. Không chạy lại493 E2E hoặc native vì chỉ đổi fixture/test;
  kết quả runtime/native trước ở [báo cáo ec4a9c9](MONGODB_INTEGRITY_FIXES_2026_09_29.md).
- CI hiện có gọi suite này kèm PostgreSQL service; chưa push nên chưa có CI remote
  cho commit mới. Không merge/push/deploy trong lượt này.

Gate import **ba trạng thái trên** đã có bằng chứng tự động tái chạy. Không đồng nghĩa
đã cutover dữ liệu chính hay phủ tất cả trạng thái refund/delivery review. Live
upload/worker với bucket QA riêng, full native và human review vẫn còn mở.
