# MIG-03 — Auth và command executor trên MongoDB

29/09/2026, nhánh `codex/mongodb-refactor`. Giao thức: [ADR 0027](../adr/0027-mongodb-persistence-protocol.md).

## Đã chuyển

- `AuthService` (login/refresh/logout/authenticate) và `LoginLimiter` dùng `MongoService`.
  Login khóa user rồi đọc lại; refresh khóa user → session rồi đổi hash có điều kiện;
  logout là ghi thẳng lên document session (chờ hoặc xung đột với lệnh đang giữ khóa).
  `authenticate` đọc session+user bằng một `$lookup` (cùng snapshot).
- `LoginLimiter`: hai bộ đếm email/IP tăng trong **một transaction** theo thứ tự khóa
  đã sắp. Lượt chạy đầu dùng hai lệnh nguyên tử độc lập làm lệch thứ hạng giữa hai bộ
  đếm (4×401 thay vì 5×401 ở 2/3 lần chạy); đã sửa nguyên nhân, 10/10 lần PASS.
- `MongoCommandService` (`src/modules/commands/mongo-command.service.ts`): cùng API với
  `CommandService`. Thứ tự: khóa key → khóa user/người liên quan/session → kiểm quyền
  hiện hành → replay/conflict receipt → mutate → receipt+audit+outbox → kiểm bất biến
  lúc commit (`tx.check`) → commit. Principal hệ thống `system:<Actor>`; carrier event
  giữ định danh toàn cục. Danh sách thao tác nghĩa vụ cũ cho LOCKED giữ nguyên.
- `MongoPageService` + `regexLiteral`; admin `GET /operations/users` dùng Mongo (ILIKE →
  regex `i` đã escape; thứ tự role theo enum như PostgreSQL).
- `/health/ready` ping cả MongoDB và PostgreSQL trong giai đoạn chuyển.
- `mongo:seed` thay prisma seed (không reset tài khoản đã có; chạy 2 lần kiểm).
- `MONGODB_URL` bắt buộc trong env validation; `.env.example` có mẫu app/migrator.

## Bằng chứng

| Suite | Kết quả |
|---|---|
| `test/auth.e2e-spec.ts` (fixture Mongo): contract, JWT hết hạn/sai audience, email chuẩn hóa, chỉ lưu hash, logout, 8 refresh đồng thời → 1×200/7×401, LOCKED, role hiện hành, session hết hạn, lỗi body, 8 login sai đồng thời → 5×401/3×429 | 8/8 PASS, 10 lần liên tiếp |
| `test/commands.e2e-spec.ts`: chuỗi receipt/audit/outbox qua validator, replay, body khác → 409, 5 request cùng key → 1 effect, 2 member tranh version → 1 thắng, role bị gỡ/LOCKED/revoke kiểm trước replay, LOCKED chỉ qua thao tác nghĩa vụ, read/readObligation, lỗi sau effect, check commit-time thấy receipt trong txn và rollback toàn bộ, principal hệ thống replay | 9/9 PASS |
| `test/operations-users.e2e-spec.ts`: tìm tên tiếng Việt không phân biệt hoa thường, lọc status/role, ký tự regex là chữ, phân trang trùng createdAt, cursor khác scope → 400, staff/admin RESTRICTED/member → 403 | 3/3 PASS |
| `app.e2e-spec.ts` | 1/1 PASS |
| E2E đã port chạy 3 lần | 21/21 mỗi lần |
| Unit (`vitest run`) | 33/33 |
| Mongo suite (probe + schema + keyset + failover) | 35/35 |

Chạy E2E cần cả PostgreSQL test (các module chưa port vẫn khởi tạo Prisma) và Mongo QA:

```sh
pnpm infra:test:up
pnpm infra:mongo:test:up
cd apps/api
TEST_DATABASE_URL=postgresql://usedbooks_test:local_test_only@127.0.0.1:55434/usedbooks_test \
MONGO_TEST_URL='mongodb://latlai_qa_root:local_test_only@127.0.0.1:57017/latlai_probe_test?replicaSet=rs-test&authSource=admin' \
pnpm test:e2e
```

`vitest.config.e2e.ts` loại tạm các suite của module chưa port (danh sách
`pendingMongoPort`); không coi đó là PASS.

## Giới hạn

- Các module catalog/listing/media/address/quote/order/wallet/shipment vẫn dùng Prisma
  nên nhánh chưa chạy được end-to-end như một ứng dụng; không deploy.
- Chưa có compose MongoDB cho môi trường dev (`.env` hiện có của chủ dự án không bị sửa);
  làm ở MIG-06 cùng cutover.
- Không có review người thật.
