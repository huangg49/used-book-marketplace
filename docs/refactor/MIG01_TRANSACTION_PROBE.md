# MIG-01 — MongoDB transaction probe

29/09/2026, nhánh `codex/mongodb-refactor`. Quyết định: [ADR 0027](../adr/0027-mongodb-persistence-protocol.md).
Probe độc lập, chưa nối controller/API chính; PostgreSQL runtime giữ nguyên.

## Môi trường

- `infra/docker-compose.mongo-test.yml`, project Compose riêng
  `used-book-marketplace-mongo-quality`, volume riêng; không đụng `.env` app hay
  volume PostgreSQL. Image `mongo:8.0`. `enableTestCommands=1` chỉ cho QA (failpoint).
- `mongo-test`: replica set một node `rs-test`, `127.0.0.1:57017`.
- `mongo-failover` (profile `failover`): ba mongod `rs-failover` trong một container,
  `127.0.0.1:57021-57023`.
- Driver `mongodb@7.6.0` pinned; Node 25.0.0 trên Windows 10, Docker Desktop 29.7.2.
- Test chỉ chạy khi tên DB kết thúc `_test` (`test/mongo/mongo-test-env.ts`).

```sh
docker compose -f infra/docker-compose.mongo-test.yml up -d --wait mongo-test
docker compose -f infra/docker-compose.mongo-test.yml --profile failover up -d --wait mongo-failover
cd apps/api
MONGO_TEST_URL='mongodb://127.0.0.1:57017/latlai_probe_test?replicaSet=rs-test' \
MONGO_FAILOVER_URL='mongodb://127.0.0.1:57021,127.0.0.1:57022,127.0.0.1:57023/latlai_failover_test?replicaSet=rs-failover' \
pnpm test:mongo
```

## Kết quả

17/17 PASS, chạy 5 lần liên tiếp đều PASS (~40 s/lần). Typecheck và oxlint PASS.
Hai lần chạy đầu có lỗi do chính test chưa ép thứ tự ai giữ lock trước (kết quả
vẫn đúng: chỉ một bên thắng); đã sửa barrier, không nới assertion.

| Invariant trong kế hoạch | Test | Kết quả |
|---|---|---|
| Cùng key/cùng body → một effect | racing, receipt giống nhau, một `replayed` | PASS |
| Cùng key/body khác → conflict | tuần tự và racing → `IdempotencyConflict` | PASS |
| Hai actor tranh một sách → một thắng | người thứ hai `VersionConflict`; một commitment active | PASS |
| Backstop DB | partial unique index từ chối commitment active thứ hai (11000) | PASS |
| Role đổi khi lệnh đang chờ | lệnh retry, thấy role hiện hành → 403, không effect | PASS |
| Snapshot read đơn thuần chưa đủ | đối chứng âm: bỏ lock user → role cũ lọt qua | PASS (lỗi được tái hiện có chủ đích) |
| Revoke trước lock | 401 `SESSION_EXPIRED`, không effect | PASS |
| Revoke trong lúc lệnh giữ lock | revoke xếp sau lệnh (`revokedAt ≥ decidedAt`); replay sau revoke → 401 | PASS |
| Lỗi giữa effect/receipt/audit | không commitment/receipt/audit/outbox; key dùng lại được | PASS (3 vị trí) |
| Giờ quyết định sau tranh chấp | `decidedAt ≥` giờ server đo sau commit đối thủ | PASS |
| Deadline qua trong lúc chờ | lệnh bắt đầu trước deadline, quyết định sau deadline → `InvalidState`, sách vẫn Available | PASS |
| Retry có giới hạn | tranh chấp kéo dài → `TransactionBusyError` 503 sau 3 lần | PASS |
| Mất ACK sau commit đã áp dụng | failpoint `writeConcernError` → `CommitOutcomeUnknownError`; cùng key → replay, đúng 1 effect | PASS |
| Commit chưa áp dụng, kết quả không rõ | failpoint `closeConnection` → unknown; server hủy txn mồ côi; cùng key → chạy lần đầu, đúng 1 effect | PASS |
| Bầu primary | ba node, `replSetStepDown` giữa lệnh → retry trên primary mới, đúng 1 effect đọc majority | PASS |

## Giới hạn — gate vẫn mở

- Failover chỉ kiểm step-down có kiểm soát; chưa kiểm kill -9, network partition,
  rollback của ghi chưa majority hay commit đúng lúc bầu.
- Unknown commit chỉ tạo bằng failpoint trên một node; chưa kiểm trên mạng thật.
- Probe là bản rút gọn của executor. Pagination/search/cursor, worker lease,
  immutability, ledger và bản đồ CHECK/trigger chưa làm (MIG-02…MIG-05).
- Hiệu năng dưới tải cao chưa đo; abort-retry có thể trả 503 ở document nóng.
- `transactionLifetimeLimitSeconds` production chưa chốt.
- Không có review người thật; đây là bằng chứng máy của tác tử.
