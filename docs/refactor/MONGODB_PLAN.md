# Chuyển Lật lại sang MongoDB

29/09/2026. Yêu cầu do chủ dự án xác nhận: giảng viên cho phép NestJS, bắt buộc
MongoDB. Chủ dự án cho push/merge checkpoint Q01 rồi mở nhánh refactor mới.
Đây là chuyển nền lưu trữ của sản phẩm hiện có, không phải một bản demo rút gọn.

## Nguồn và trạng thái

- Baseline PostgreSQL: `1e08969dfeb8c712a286cb2c365bdf7614906f3b` trên main,
  squash merge [PR #2](https://github.com/huangg49/used-book-marketplace/pull/2).
- Nhánh cũ `codex/q01-native-completion` giữ commit `522191f` trên remote.
- Nhánh mới `codex/mongodb-refactor` bắt đầu từ baseline trên (tạo lại từ main
  `b49cc52` ngày 29/09/2026). MIG-00 đã lập inventory và điều kiện kiểm chứng.
  MIG-01 DONE: probe giao dịch 17/17 PASS, [báo cáo](MIG01_TRANSACTION_PROBE.md),
  [ADR 0027](../adr/0027-mongodb-persistence-protocol.md). Runtime/API chính vẫn PostgreSQL.
- Phạm vi chức năng giữ F2h/OpenAPI 0.20.0. Không mở Delivered/inspection/settlement.
  SRS1.1 và ADR hiện có vẫn là nguồn hành vi; các cơ chế PostgreSQL cần ADR thay thế
  có đối chiếu, không xóa lịch sử để coi như chưa có yêu cầu.
- Native/TalkBack/ARM/iOS, U01 và review người thật còn mở. Chủ dự án cho bắt đầu
  refactor trước các gate đó; không đồng nghĩa gate đã đóng hoặc miễn review tiền/quyền.

## Bằng chứng khảo sát ban đầu

[Inventory source](POSTGRES_BASELINE_INVENTORY.md) ghi 44 model, 17 migration,
27 file API source có dấu hiệu phụ thuộc Prisma/SQL/lock/time; 25 file có raw SQL,
trong đó 22 nằm dưới modules. Đây là đếm lexical, không phải đã review hết invariant.

DatabaseService kế thừa PrismaClient và dùng adapter-pg. CommandService mang type
Prisma.TransactionClient qua nhiều module. Chỉ thay một adapter hoặc DATABASE_URL
không đủ. Cần xử lý cả pagination/search, clock, worker lease và test fixtures.

## Quyết định đã chốt và lựa chọn cần chứng minh

Giữ NestJS, client RN/operations, session protocol, OpenAPI và Supabase Storage.
MongoDB là đích lưu trữ chính của backend; không gắn một collection phụ để đáp ứng
hình thức. Không có hai nguồn sự thật cho tiền/sách hoặc ghi kép PostgreSQL/MongoDB.

Giữ UUID bên ngoài, thứ tự mảng, giá trị tiền nguyên VND, phiên bản và mã lỗi hiện có.
Không buộc client đổi sang ObjectId. BSON representation, index, precision thời gian,
posting sequence và cursor compatibility phải được chốt trước port dữ liệu.

Prisma hiện tại là v7; tài liệu chính thức đang hướng MongoDB về v6.19, chưa hỗ trợ
v7. Không downgrade toàn repo chỉ để thử connector. Ứng viên đầu cho MIG-01 là
MongoDB Node driver trong một probe độc lập, để quan sát trực tiếp session,
transaction/retry và index. Đây chưa là quyết định thư viện cuối cùng; so sánh với
Mongoose theo typed model/validation, kiểm soát transaction, chi phí port và test.
[Prisma MongoDB](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mongodb),
[Nest MongoDB](https://docs.nestjs.com/techniques/mongodb).

## Invariant phải có cơ chế thay thế và test

| Phần hiện tại | Điều bắt buộc chứng minh trên MongoDB |
|---|---|
| User/role/session locks | Quyền hiện hành và session được kiểm trước replay/effect; revoke/lock cạnh tranh không lọt quyền. Snapshot read đơn thuần chưa đủ; mọi writer phải tham gia cùng giao thức tranh chấp |
| Advisory key + receipt | Cùng principal/operation/key/body chỉ một hiệu ứng; body khác conflict; authorize trước trả receipt; giữ global provider event identity |
| State + receipt + audit + outbox | Cùng một transaction, lỗi bất kỳ không để lại nửa hiệu ứng; callback retry không phát network/storage side effect |
| Book commitment | Hai lệnh tranh cùng sách chỉ một thắng; trade projection/context/commitment thống nhất; refund failure vẫn giữ tiền và sách |
| Ledger | Journal cân, không âm nguồn/available, không mint, giữ 100M nguồn ban đầu; tiền từ entries bất biến, posting order ổn định |
| FK/CHECK/constraint trigger | Liệt kê từng bảo vệ hiện có, map sang validator/index/write protocol/privilege; chỉ rõ bảo vệ liên-document nào DB không thực hiện tương đương; không âm thầm bỏ backstop |
| DB clock sau lock | Sau tranh chấp mới lấy thời điểm quyết định; exact deadline, expiry và session cùng ngữ nghĩa. Không thay bằng giờ client hoặc giờ lấy trước khi chờ |
| Immutability | Revision/address/agreement/carrier/report/ledger đã chốt không bị sửa; app credentials và mọi writer không có đường bypass không kiểm soát |
| Worker lease | Claim/retry/crash recovery an toàn nhiều process, không double refund hoặc double release; TTL không được quyết định nghĩa vụ nghiệp vụ |
| Read/cursor | Quyền và projection không lộ dữ liệu; thứ tự ổn định khi timestamp trùng, chữ Việt/null/missing đúng; xử lý cursor cũ có chủ đích |

MongoDB transaction cần replica set; local một node chỉ chứng minh chức năng,
không chứng minh failover. Transaction callback có thể chạy lại; thao tác trong
một session phải tuần tự. Chọn retry budget và unknown-commit recovery rõ ràng,
không gom mọi lỗi thành retry vô hạn.
[Node driver transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/),
[Server constraints](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/).

## Gói triển khai theo dependency

| Gói | Trạng thái | Kết quả và điều kiện mở gói sau |
|---|---|---|
| MIG-00 baseline | DONE phạm vi khảo sát ban đầu | Main đã merge, branch mới, inventory có thể đối chiếu, không đổi runtime |
| MIG-01 transaction probe | DONE, [báo cáo](MIG01_TRANSACTION_PROBE.md) | Mongo replica set QA riêng; driver/version pinned; probe auth-before-replay, cùng key, khác body, tranh chấp, rollback, unknown commit; ghi bằng chứng và ADR lựa chọn persistence |
| MIG-02 mô hình + hạ tầng | NEXT | Map đủ 44 model và từng SQL backstop; versioned collection/index/validator migrations, bootstrap least privilege, clock/ID/cursor/precision; CI Mongo riêng |
| MIG-03 auth + command | LOCKED sau MIG-02 | Login/rotation/revoke/rate limit, eligibility và command executor dùng Mongo, negative/race/replay tương đương; không chuyển API chính trước khi đạt |
| MIG-04 catalog/listing/media/address | LOCKED sau MIG-03 | Port quyền/immutable snapshot/worker/review/public reads; HTTP contracts, browser và native với storage thật theo mức ảnh hưởng |
| MIG-05 quote/order/wallet/shipment | LOCKED sau MIG-04 và review tiền/quyền | Full hold/commitment/ledger/worker/event/review parity đến F2h; không thêm nghiệp vụ mới |
| MIG-06 dữ liệu + cutover | LOCKED sau MIG-05 | Dry-run import bất biến, đếm/hash/ledger reconciliation, secret-safe evidence, fresh-clone setup, CI đầy đủ và native acceptance; kế hoạch rollback và switch có chủ đích |

Mỗi gói commit rõ phạm vi, cập nhật SESSION_STATE. Nhánh mới là lane migration;
không merge implementation dở vào main. Việc chủ dự án duyệt PR #2 không là
ủy quyền tự merge/push/deploy mọi increment sau này.

## MIG-01 — công việc đầu tiên cụ thể

1. Dựng Mongo QA replica set trong Compose riêng, volume/port riêng; không sửa
   `.env` app hoặc volume PostgreSQL. Chỉ cho test dùng DB có tên kết thúc `_test`.
2. Probe chưa nối production controllers. Tạo sẵn collection/index cần thiết.
   Tách domain error khỏi transient/unknown commit, giữ key/body qua retry.
3. Barrier tests: cùng key/cùng body → một effect; cùng key/body khác → conflict;
   hai actor tranh một resource → một thắng; revoke/role change khi command đang chờ;
   replay sau revoke; lỗi giữa effect/receipt/audit → không tồn tại partial commit.
4. Kiểm deadline qua thời gian server sau tranh chấp. Chứng minh giá trị đó không
   chỉ là timestamp snapshot cũ. Không giải quyết bằng timeout hoặc sleep trong test.
5. Unknown commit/lost ACK cần fault có vị trí kiểm soát. Single-node không được
   ghi failover PASS; bổ sung topology phù hợp khi cần kiểm bầu primary.
6. Kết thúc bằng báo cáo lệnh chạy/kết quả/giới hạn, ADR chọn thư viện và giao thức.
   Nếu một invariant chưa chứng minh được, giữ gate mở và xử lý nguyên nhân.

## Bảo toàn và chuyển dữ liệu

Không reset/clean DB, sửa migration cũ, sửa số dư SQL hay đổi seed password.
PostgreSQL runtime và lịch sử migration vẫn giữ trong thời gian port. Khi cần import,
đọc nguồn có snapshot nhất quán, giữ ID/hash/pinned metadata và quyền media, không
ghi dump/token vào Git. Bảo toàn dữ liệu và phiên hiện có phải được kiểm riêng;
không mặc định seed một DB Mongo rỗng là đã chuyển dữ liệu thành công.

Rollback sau khi Mongo có ghi mới cần đối soát/quy trình riêng; không đơn giản
trỏ lại PostgreSQL cũ vì dữ liệu đã lệch. Không mở traffic ghi kép để tránh thiết kế này.
