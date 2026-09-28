# Đăng ký vận đơn DirectDelivery — báo cáo triển khai

Phần nối tiếp: [carrier pickup độc lập](CARRIER_PICKUP_REPORT.md) đã có ở0.19.0.
Báo cáo dưới đây giữ phạm vi và bằng chứng của bước đăng ký0.18.0.

28/09/2026 · OpenAPI **0.18.0** · nhánh `codex/direct-shipment-registration`.
Quyết định: [ADR 0023](../adr/0023-direct-shipment-registration.md).
Nối sau [ảnh đóng gói](PACKAGING_EVIDENCE_REPORT.md).

## Phần đã triển khai

Seller đã nhận Order có thể đăng ký một vận đơn chiều gửi trước hạn pickup,
gắn1–8ảnh đóng gói Ready thuộc đúng Order. Carrier có nhãn mô phỏng rõ ràng;
mã carrier/tracking không được dùng cho vận đơn thứ hai. Buyer/Seller đọc vận
đơn riêng tư, bao gồm khi tài khoản LOCKED/RESTRICTED đang xử lý nghĩa vụ cũ.

| Endpoint | Hành vi |
|---|---|
| POST `/orders/{orderId}/shipment` | Seller, expectedOrderVersion/key, carrier/tracking và ảnh Ready; receipt Shipment riêng |
| GET `/me/orders/{orderId}/shipment` | Participant; absent/unrelated404; Seller thấy hai địa chỉ snapshot, Buyer chỉ thấy địa chỉ nhận của mình |
| GET Order hiện có | `shipmentRegistrationEnabled` dựa trên vai, trạng thái, hạn, ảnh Ready, hold đầy đủ và chưa có label |

`LatLaiSimulator` nhận mã `LL-` +8–32ký tự A–Z/0–9. Input chung trim khoảng trắng
ngoài, chuẩn hóa UUID chữ thường trước validation/idempotency; khoảng trắng giữa
và tracking chữ thường bị từ chối. Không có tích hợp đặt ship hoặc đường dẫn tra
cứu tới một hãng vận chuyển thật. Dữ liệu địa chỉ/phí lấy từ agreement đã chốt,
không nhận override từ client. DirectDelivery giữ chính sách Seller ứng ship,
Buyer hoàn phí theo quyết toán sau này; đăng ký label chưa thu/trả khoản này.

**LabelCreated không có nghĩa đã gửi.** Order vẫn Preparing, pickupConfirmed=false,
không đổi version Order, deadline, hold, commitment hoặc listing. Hết hạn chưa có
pickup vẫn mở PickupReview/ResolutionPending. Không tự refund, mở bán lại sách,
gia hạn hoặc credit Seller từ việc nhập mã vận đơn.

## Bảo vệ dữ liệu và đồng thời

- Shared command executor: kiểm tra quyền trước replay; sorted participant/session
  locks, Order fulfillment locks, packaging rows, tracking advisory lock, ledger
  accounts. Không có network I/O trong transaction. Deadline/session dùng giờ DB
  sau các khóa quyết định; tới đúng hạn là bị chặn dù worker chưa chạy.
- Giữ toàn bộ tiền P+S và commitment Active; registration không ghi journal mới.
  Current capability chỉ là gợi ý UI, handler kiểm tra lại độc lập.
- Một outbound/Order; unique carrier/tracking trên toàn DB. Tranh cùng mã giữa hai
  Order độc lập có một winner; lỗi409 không lộ Order của người còn lại.
- Ảnh được lưu theo thứ tự, composite FKs khóa đúng Order. Chỉ ảnh Ready,
  uploadedAt<=registeredAt. Sau receipt, không thêm/bớt/đổi ảnh trong vận đơn;
  các ảnh nộp thêm ở Order không tự thay tập bằng chứng đã đăng ký.
- Shipment/links/receipt/audit/outbox commit cùng nhau; failpoint ở audit/outbox
  rollback toàn bộ. Retry cùng key/payload sau restart/deadline/review trả receipt
  ban đầu, nhưng revoked/disabled/unverified/role removal vẫn bị chặn.
- GET riêng tư không cấp quyền chung cho Staff/Admin/TEST_OPERATOR. Receipt/outbox
  không chứa địa chỉ, tracking hoặc signed URL. Preview dùng endpoint có audit từ0.17.

Migration15 `20260928050000_direct_shipment_registration` thêm hai bảng và unique
identity cho packaging; không sửa dữ liệu cũ. Deferred checks đối chiếu snapshot,
deadline, ảnh Ready, receipt/Seller/context/audit/outbox và bất biến Order/ledger.
Insert guard chặn Order ngoài Preparing; UPDATE/DELETE đều bị chặn. Migrations
đã áp dụng trước đó giữ nguyên. Future pickup cần migration/event model riêng.

## Phạm vi kiểm thử

31ca mới trong `apps/api/test/shipments.e2e-spec.ts` dùng HTTP/auth/PostgreSQL thật.
Fixture tạo catalog/listing/address/quote/Order/topup/pay/accept và upload ảnh qua
API thật với Sharp; storage vẫn là fake riêng có nhãn, không phải Supabase live.

| Nhóm | Bằng chứng được kiểm tra |
|---|---|
| Upgrade |14migration cũ có Order đã trả/nhận và Ready evidence; snapshot/receipt/journal không đổi sau migration15 |
| Nghiệp vụ | Snapshot địa chỉ/phí, ảnh theo thứ tự, một label, không đổi tiền/sách/Order |
| Input | Carrier/code/size tập ảnh, UUID normalization, duplicate IDs khác case, ảnh Pending/listing/Order khác, field override |
| Quyền | Guest/Buyer/outsider/Staff/Admin/operator; LOCKED/RESTRICTED; Buyer disabled; Seller mất role/session/email verification |
| Retry |20request cùng key, mismatch payload, replay sau deadline/review/restart, không ghi thêm receipt/link |
| Đồng thời | User-row barrier cho hai key cùng Order; advisory barrier cho hai Order cùng tracking; hold-account wait qua deadline; session hết hạn sau tracking lock |
| Deadline | Đúng hạn từ chối; sát trước hạn đăng ký được nhưng vẫn mở review; review trước thì chặn label mới |
| Rollback/SQL | Audit/outbox failpoints; chặn edit/delete, đổi/thêm ảnh sau đăng ký, FK khác Order, đăng ký SQL không có receipt/bằng chứng |

Hai test upgrade cũ của preparation/packaging tiếp tục snapshot trước/sau đúng
migration mục tiêu, sau đó áp dụng các migration cộng thêm để handler hiện tại đọc
được schema mới. Không bỏ checks/triggers hoặc reset dữ liệu dùng chung để suite qua.

## Kết quả chạy và nâng cấp local

| Kiểm tra | Kết quả |
|---|---|
| Contract | OpenAPI0.18.0 parse qua; generated types khớp |
| Lint/typecheck | Qua toàn workspace, không warning lint API |
| API/database E2E | **415/415**,20files, bao gồm31ca shipment mới |
| Unit | **122/122**: API33, session15, RN61, operations13 |
| Build | API và operations qua; không có native build mới |
| Migration local | Backup trước migrate,15/15checksum khớp, không pending |
| Runtime smoke | API0.18.0 ready200,2route shipment; Guest write401, absent shipment404, private wallet/Order reads200 |
| Worker local | failed/backlog/openPickupReviews đều0 ở thời điểm kiểm tra |
| Đối soát local | Balanced, debit=credit100M, nguồn100M, Member available/held0 |
| Doctor | DB/API/checksums/private bucket read-only qua; RN localhost cần đổi khi dùng Android/điện thoại |

Logs ignored: `.tmp/shipment-full-e2e.log`, `.tmp/shipment-unit.log`,
`.tmp/shipment-build.log`, `.tmp/shipment-local-api.stdout.log`,
`.tmp/shipment-local-worker.stdout.log`. Backup local trước nâng cấp nằm trong
`.tmp/latlai-before-shipment.dump`; đây chỉ là PostgreSQL backup, không chứa object ảnh.
Không reset DB, đổi mật khẩu seed, nạp tiền local, commit/push hoặc sửa SRS1.0.

Lỗi500/503 trong E2E gồm các failpoint có assert rollback; pg8 có cảnh báo query
đồng thời trong fixtures. Hai lỗi phát hiện và sửa trước lần chạy đầy đủ cuối:
Prisma nested create với composite FK được chuyển sang ghi links tường minh trong
cùng transaction; test/code thống nhất normalization khoảng trắng/UUID theo parser
chung. Không bổ sung log raw database errors vào runtime để chẩn đoán.

## Giới hạn và bước tiếp theo

Carrier pickup/event simulator **chưa triển khai**. Không có Staff xác minh custody,
giải quyết PickupReview, delivery/timeout, return hoặc settlement. Chưa có RN UI
vận đơn/checkout. Không đánh toàn bộ FR-S01–05 hoặc AC giao hàng là pass từ increment
này. Hết hạn thì chỉ đọc lại label cũ; label mới bị chặn, ảnh bổ sung vẫn theo0.17.

Chưa có sửa/thay/hủy mã vận đơn nhập sai. Không sửa SQL để né unique/retention.
Cần một quy trình correction riêng bảo toàn lịch sử khi bổ sung; chưa có vận đơn
thật nên mã demo chỉ cần được dùng nhất quán cho simulator ở bước tiếp theo.

Bước tiếp theo: independent TEST_OPERATOR phát sự kiện pickup qua adapter xác thực,
chống lặp, pin đúng shipment/Order và phân biệt occurredAt/receivedAt. Chỉ sự kiện
đủ điều kiện mới chuyển InTransit; đến muộn/xung đột giữ kiểm tra, không tự hoàn
tiền hoặc lấy cam kết của giao dịch khác. Sau đó cần delivery/claim/settlement trước
khi mở checkout cho Member.

Setup: [API README](../../apps/api/README.md#directdelivery-label-registration-0180).
