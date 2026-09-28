# Xác nhận lấy hàng mô phỏng — báo cáo triển khai

Phần nối tiếp: [quá hạn giao và báo chưa nhận](DELIVERY_OVERDUE_REPORT.md) có ở0.20.0.
Báo cáo dưới đây giữ phạm vi và bằng chứng của bước pickup0.19.0.

28/09/2026 · OpenAPI **0.19.0** · nhánh `codex/carrier-pickup`.
Quyết định: [ADR 0024](../adr/0024-carrier-pickup.md).
Nối sau [đăng ký vận đơn](DIRECT_SHIPMENT_REPORT.md).

## Hành vi đã triển khai

TEST_OPERATOR độc lập xác nhận carrier mô phỏng đã lấy hàng. Buyer/Seller không
được tự xác nhận, kể cả khi kiêm quyền vận hành. Sự kiện đúng hạn đưa Order từ
Preparing sang InTransit. Đến muộn hoặc mâu thuẫn mở hồ sơ xác minh bền vững,
giữ nguyên toàn bộ tiền và sách; không tự hoàn tiền, trả người bán hoặc mở bán lại.

| API | Quyền và kết quả |
|---|---|
| POST `/operations/simulator/pickup-events` | ACTIVE verified TEST_OPERATOR độc lập; eventId/key trùng nhau; chữ ký nội bộ tách miền với thanh toán |
| GET `/me/orders/{orderId}/shipment/pickup-events` | Hai participant MEMBER, kể cả LOCKED; lịch sử giới hạn128 bản ghi, không lộ chữ ký/operator |
| GET Shipment hiện có | PickedUp/pickupConfirmed, thời điểm thực tế/tiếp nhận, hạn giao đã pin; giữ nguyên ảnh và địa chỉ snapshot |
| GET Order hiện có | InTransit hoặc ResolutionPending, nullable carrierReview; không mở quyền đăng ký lại vận đơn |

Sự kiện phải khớp Order, Shipment, carrier và tracking. Thời điểm lấy hàng từ lúc
đăng ký đến giờ DB tiếp nhận; đúng pickupDeadline đã là muộn. Không dùng timestamp
carrier gửi đến để né hồ sơ quá hạn. Mỗi vận đơn có tối đa một Applied event.
Hạn giao240giờ được lưu bất biến cùng chính sách, chưa có worker xử lý quá hạn giao.

Gửi lại eventId/payload bởi cùng hoặc operator khác trả receipt cũ; không tạo thêm
event/journal/audit. Thay payload bị chặn. EventId mới nhưng cùng thời điểm lấy hàng
là Duplicate; khác thời điểm mở review và giữ bằng chứng ban đầu. Review không tự
đóng khi có thêm sự kiện. Old PickupReview và CarrierReview có thể cùng tồn tại.

## Bảo vệ và kiểm thử

Migration16 thêm bảng sự kiện/review append-only, composite FK, unique Applied,
giới hạn chuỗi và kiểm tra receipt/audit/outbox/state. Không sửa15migration cũ.
Shared command executor khóa event toàn cục, kiểm tra quyền trước replay, khóa
participants và fulfillment/ledger theo giao thức chung. Decision time/session
được kiểm tra sau khóa cuối. OrdersService sở hữu chuyển trạng thái; không có
network I/O trong transaction. `wallet:check` đối soát cả bất biến pickup mới.

`apps/api/test/carrier-pickup.e2e-spec.ts` kiểm tra HTTP/auth/PostgreSQL thật: upgrade
có dữ liệu cũ, quyền/độc lập/HMAC, sự kiện trùng và mâu thuẫn, late/worker, đồng thời
dưới khóa DB, session/role thay đổi khi chờ, rollback receipt/audit/outbox, ràng buộc
SQL và giới hạn128. Fixture packaging dùng Sharp thật và storage giả có nhãn;
không phải lần kiểm chứng Supabase live mới hoặc bằng chứng carrier thật.

Kết quả đã xác nhận:

| Kiểm tra | Kết quả |
|---|---|
| OpenAPI generate/check | Pass, schema và generated types0.19.0 đồng bộ |
| Lint/typecheck toàn workspace | Pass, API/RN/operations không lỗi |
| Unit/contract/client tests |122/122: API33, session-client15, RN61, operations13 |
| API/database E2E |445/445 trong21file, gồm30ca pickup mới |
| API build | Pass, Prisma generate + Nest build |
| Upgrade có dữ liệu | Giữ nguyên Order Preparing và ResolutionPending/PickupReview cũ, vận đơn, evidence, receipt và sổ tiền |
| Local migration |16migration applied, checksum history khớp, không pending; có backup trước migration |
| Runtime | API0.19.0, ready200; guest pickup401, Member403, operator với Shipment không tồn tại404; private reads200 |
| Worker/ledger | Worker failed0/backlog0; debit=credit=100.000.000đ, nguồn demo còn100.000.000đ, hold0 |

Runtime smoke chỉ login/read/kiểm tra yêu cầu bị từ chối rồi logout, không tạo giao
dịch demo mới trong DB ứng dụng. Bộ445ca chạy trên database riêng có tên kết thúc
`_test`; fixture tạo đầy đủ chuỗi Order/tiền/vận đơn bên trong schema thử nghiệm.
Log cục bộ (ignored): `.tmp/pickup-full-e2e.log`, `.tmp/pickup-unit.log`,
`.tmp/pickup-build.log`; backup `.tmp/latlai-before-pickup.dump`.

## Vận hành và giới hạn

Sao lưu DB, generate Prisma, deploy migration16, build rồi restart API và Order
worker cùng nhau. Chạy contract:check, tests và wallet:check. Dùng lại secret simulator
đang cấu hình; không in/gửi secret hoặc nhập lại mật khẩu seed. Worker báo riêng
`openCarrierReviews`; một Order có thể được tính trong cả hai loại review.

Backend mới là mô phỏng lấy hàng, chưa tích hợp hãng ship thật. Chưa có UI shipment,
xử lý Delivered/không nhận hàng, quá hạn giao, giải quyết review, hoàn sau nhận đơn,
return hay quyết toán cho Seller. Bước tiếp theo là vòng đời giao hàng/điều tra với
quy tắc giữ tiền nhất quán; member checkout vẫn đóng cho tới khi đủ đường kết thúc.
