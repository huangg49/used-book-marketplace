# Đơn chờ thanh toán và giữ sách — F1 backend

27–28/09/2026 · OpenAPI **0.12.0** · [ADR 0017](../adr/0017-unpaid-direct-orders.md).
Nhánh `codex/unpaid-direct-orders` kế thừa các increment chưa commit; không phải
một PR sạch chỉ chứa Order. Không sửa SRS 1.0 hoặc reset dữ liệu ứng dụng.
Cập nhật F2b: [quyền nghĩa vụ cũ](LOCKED_OBLIGATIONS_REPORT.md) bổ sung Order list
và LOCKED read/media/cancel. Phần dưới ghi phạm vi và kiểm chứng của F1 tại thời điểm đó.
Cập nhật F2c: [funding/refund](ORDER_PAYMENT_REPORT.md) thêm Order paid states,
hold và hoàn trước xác nhận; các giới hạn “chưa funding” bên dưới thuộc mốc F1.

## Phạm vi hoạt động

| API, tiền tố /api/v1 | Kết quả |
|---|---|
| POST `/orders` | Tạo Order AwaitingPayment từ quote hiện hành, giữ một cuốn Sale/Both, snapshot điều kiện; hạn 15 phút, quota hai đơn/buyer |
| GET `/me/orders/{orderId}` | Buyer/Seller có MEMBER đọc snapshot/trạng thái; chỉ địa chỉ của chính người đọc |
| POST `/orders/{orderId}/cancel` | Buyer hủy đơn chưa trả trước hạn với expectedVersion/key; giải phóng đúng commitment |
| GET `/me/orders/{orderId}/media/{mediaId}/read` | Đọc ảnh thuộc revision đã chốt theo quyền participant; không phụ thuộc sách còn trên kệ |

Worker riêng đóng đơn quá hạn thành PaymentExpired. Hủy/hết hạn ghi event, receipt,
audit/outbox và trả trade về Available cùng transaction. Visibility/moderation giữ
nguyên. Đơn cũ không thể giải phóng quyền giữ của đơn mới. Quote cũ không tự hợp lệ
trở lại sau khi sách được trả về kệ, vì listing version đã tăng.

Chưa có ví, nạp simulator, thanh toán, Seller acceptance, giao hàng hoặc hoàn tiền.
Projection ghi rõ paymentEnabled=false và moneyHeld=0. Chưa có UI mua/Order history,
Order list API, ViaPoint hoặc Exchange/auction workflow. Account LOCKED vẫn bị chặn
ở HTTP; worker vẫn xử lý nghĩa vụ hết hạn. Đây chưa phải gate mua hàng hoàn chỉnh.

## Kiểm chứng và trace

Code test: [Order HTTP/DB](../../apps/api/test/orders.e2e-spec.ts),
[migration nâng cấp](../../apps/api/test/order-migration.e2e-spec.ts),
[tiến trình worker độc lập](../../apps/api/test/helpers/order-worker-child.ts).
Node 24.19.0, pnpm 11.19.0; PostgreSQL `_test`, schema riêng mỗi suite.

| CM-AC | Phần đã kiểm tra trong F1 backend |
|---|---|
| 01, 02 | Sale/Both, 15 phút, không giữ tiền; guest/foreign/operations, forged principal/amount, Restricted/Locked và quyền participant |
| 03, 04 | Quote/version/revision/address stale, listing hidden/reserved, public shelf/detail/media bị rút; các điều kiện catalog/media hiện có được kế thừa từ quote/public predicate và hồi quy cũ |
| 05, 06 | Barrier PostgreSQL: 100 requests từ năm buyer tranh một sách; 100 requests cùng buyer trên ba sách, chỉ hai AwaitingPayment; hủy giải quota |
| 07 | Thay địa chỉ/ẩn/mất role trước checkout; checkout thắng thì các lifecycle API bị chặn ngay cả khi dùng listing version mới; buyer role/status/session thay đổi khi đang chờ |
| 08 | Cùng key cạnh tranh chỉ một receipt; đổi payload conflict; replay create/cancel sau closure và khởi tạo lại application, vẫn kiểm quyền/phiên |
| 09 | Failpoint item/agreement/commitment/event/projection/receipt/audit/outbox rollback toàn bộ; retry tạo đúng một đơn |
| 10 | Quote T−1/T/T+1; cancel T−1/T/T+1; session hết hạn sau chờ khóa; clock không được lấy trước khóa listing |
| 11 | Cancel/expiry hai thứ tự, hai worker cùng xử lý, replay sau restart; worker thất bại có backlog và chạy lại; hai tiến trình worker mới liên tiếp không nhân đôi effect |
| 12, 30 | SQL từ chối Reserved không Active và ngược lại, orphan Order/context thiếu item, duplicate Active, sửa snapshot/event/context, hồi sinh commitment, giả system principal; release sai context bị chặn |
| 13, 31 | Phần backend: GET riêng, ảnh pinned, recheck session sau storage signing, không lộ contact đối tác; xóa sổ địa chỉ không đổi snapshot |
| 32 | Fresh migration; upgrade dữ liệu address/listing/receipt/audit cũ giữ nguyên; legacy Reserved bị chặn, không tự đổi trạng thái |

Không đánh pass toàn bộ CM-AC 03/07/12/13/16/26/32 hoặc các hàng xuyên F2–F5 từ bảng
này: chưa có custody/ledger/transfer, không chạy mọi tổ hợp state/race của các miền
chưa triển khai. Native recovery/countdown và quyền LOCKED dành nghĩa vụ cũ vẫn
pending. Hai fixture Reserved thô của suite listing đã được thay bằng ca Order thật
và SQL rejection, không nới constraint để test qua.

Worker process test dùng TypeScript compiler để giữ metadata của Nest, database
thật trong schema test và thời gian tạo fixture có kiểm soát. Process worker mới
dùng đồng hồ thật, không endpoint chỉnh giờ. Đây không phải thao tác restart API
ứng dụng đang chạy và không là bằng chứng worker production đã được giám sát.

Hồi quy đầy đủ ngày 27/09: **201 API/database tests qua trong 12 files**, gồm
42 ca Order và 1 upgrade mới; hai ca Reserved thô cũ được thay bằng kiểm tra Order
thật. **117 unit tests** qua: API 29, session 14, RN 61, operations 13. Contract,
lint/typecheck toàn workspace và build API/operations qua. Ngày 28/09 tiếp tục kiểm
tra bản cuối, xem ghi chú vận hành bên dưới. Log 500/503 từ failpoint có
assertion, không phải lỗi bỏ qua. Cảnh báo pg 8 concurrent query đã có từ nền cũ;
không tuyên bố tương thích pg 9. Storage ký ảnh trong fixture là adapter giả, không
đánh đồng với kiểm chứng Supabase live của increment trước.

## Cài đặt

```sh
pnpm db:generate
pnpm db:migrate
pnpm --filter @used-books/api build
pnpm dev:api
# Terminal riêng, worker chỉ khởi động khi chạy lệnh này:
pnpm dev:orders
```

Migration mới `20260927030000_unpaid_direct_orders` là migration thứ 10. Không cần
env/cloud/seed mới. Nếu preflight gặp legacy Reserved, dừng để đối soát record IDs;
không reset database hoặc đổi trade tùy ý. Bảng snapshot giữ thông tin liên hệ của
thỏa thuận đã tạo, dù người dùng xóa địa chỉ trong sổ cá nhân.

Sau build, chạy một sweep bằng `node dist/order-worker.js --once` từ `apps/api`;
lệnh liên tục production là `pnpm --filter @used-books/api worker:orders:prod`.
Worker quét mỗi phút tối đa 100 candidate, dedupe bền vững qua Order ID. Log có số
failed/remaining/oldestLagSeconds; backlog quá 120 giây cần kiểm tra. Không có HTTP
endpoint expire/reserve/release cho Member hoặc TEST_OPERATOR.

API HTTP không tự chạy worker. Nếu worker dừng, đơn quá hạn vẫn giữ quota/sách tới
khi được xử lý; API không tự cướp commitment. Đây là lựa chọn an toàn, cần vận hành
worker để demo. Outbox mới được ghi bền vững; consumer thông báo chưa triển khai.

### Ghi chú vận hành ngày 28/09/2026

Bản cuối qua `pnpm contract:check`, lint/typecheck/build API và chạy lại **43 ca
Order/upgrade trong hai files** trên PostgreSQL test riêng, gồm worker Node process
thật. Kết quả này bổ sung cho hồi quy 201 ca ngày 27/09, không phải lần chạy lại
toàn bộ 201 ca sau thay đổi cuối.

Sau khi người dùng khởi động lại Docker, container PostgreSQL của dự án đã healthy
ở cổng 5433. Kiểm tra trước deploy: chín migration cũ khớp checksum, chỉ migration
Order đang pending. `pnpm db:migrate` áp thành công migration thứ 10; kiểm tra lại
**10/10 checksum khớp, không còn migration pending**. Không reset database, xóa
volume hoặc chạy lại seed.

Build API thành công. Worker `--once` trên database ứng dụng local kết thúc mã 0:
`processed=0, skipped=0, failed=0, remaining=0, oldestLagSeconds=0`. API đã khởi động
và `/api/v1/health/ready` trả 200; cả bốn endpoint Order trả 401 khi không có phiên.
`pnpm doctor:local` qua kiểm tra cấu hình, database/migrations, API readiness và
bucket Supabase live (read-only). RN URL localhost vẫn cần đổi thành `10.0.2.2` nếu
demo trên Android emulator.

API và worker Order liên tục đã được mở dưới dạng tiến trình local ẩn; log nằm tại
`.tmp/order-local-api.*.log` và `.tmp/order-local-worker.*.log` (không đưa vào Git).
Worker đã ghi sweep thành công. Đây là tiến trình của phiên làm việc hiện tại,
không phải Windows service tự khởi động sau reboot; có thể chạy lại bằng các lệnh
ở phần cài đặt. Không tạo đơn giả trong database ứng dụng để kiểm thử: bằng chứng
create/cancel/expiry và race vẫn là bộ test PostgreSQL `_test` ở trên, còn lần này
xác minh deploy, readiness, auth guard và sweep không có backlog.

Bước tiếp: **F2 ledger và nạp mô phỏng**, sau đó thanh toán Order, giao nhận và UI
React Native theo [lộ trình](TRANSACTION_FOUNDATION_PLAN.md). Chưa mở nút mua trước
khi các điều kiện tiền, nghĩa vụ và client đã được kiểm chứng.
