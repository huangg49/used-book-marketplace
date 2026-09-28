# Quá hạn giao hàng và báo chưa nhận sách — báo cáo triển khai

28/09/2026 · OpenAPI **0.20.0** · nhánh `codex/delivery-overdue`.
Quyết định: [ADR0025](../adr/0025-delivery-overdue.md).
Nối sau [carrier pickup](CARRIER_PICKUP_REPORT.md).

## Đã triển khai

Sau Applied pickup, hệ thống dùng đúng hạn giao240giờ đã pin trên sự kiện. Tới hạn,
worker mở hồ sơ xác minh bền vững; Buyer có thể báo chưa nhận sách vào cùng hồ sơ.
Order chuyển InTransit4 → ResolutionPending5, giữ nguyên P+S, sách Reserved và
commitment Active. Không kết luận sách thất lạc, không phạt, hoàn hoặc trả Seller.

| Bề mặt | Hành vi |
|---|---|
| POST `/orders/{orderId}/non-receipt` | Buyer MEMBER verified, kể cả LOCKED/RESTRICTED; key, expectedVersion4/5, description20–2000ký tự; từ đúng hạn giao trở đi |
| Worker `expireDelivery` | Principal OrderDeliveryExpiry, khóa/recheck độc lập, key bền vững; tối đa100candidate/lượt |
| GET Order | `deliveryReview`, báo cáo Buyer nếu có, hạn đã pin và `canReportNonReceipt`; participant riêng tư/no-store |
| Worker logs | `deliveryRemaining`, `openDeliveryReviews`, `oldestDeliveryReviewAgeSeconds`; lỗi/retry/backlog rõ ràng |

Nếu Buyer gửi trước, một transaction tạo review và report. Nếu worker mở trước,
Buyer tải lại Order version5 rồi nộp báo cáo; không đổi người/mốc mở hồ sơ cũ.
Gửi lặp cùng key/payload trả receipt cũ sau kiểm tra quyền; key mới không tạo báo
cáo thứ hai. Báo cáo không cần ảnh, chưa có sửa/rút báo cáo. Description không vào
audit/outbox/log và chỉ hai participant đọc qua Order hiện có.

CarrierReview đã mở do pickup mâu thuẫn vẫn được giữ. Các review là bằng chứng/
tác vụ xác minh, chưa là hệ thống dispute có phân công và phán quyết. Future dispute
phải gộp chúng theo quy tắc một hồ sơ tranh chấp đang mở/giao dịch. Duplicate hoặc
conflicting pickup đến sau không xóa delivery review hay phục hồi InTransit.

## Tính toàn vẹn và kiểm thử

Migration17 giữ16migration cũ, thêm hai bảng append-only cùng composite FK tới
Applied pickup đúng Order. Deferred checks đối chiếu thời gian, deadline đã pin,
version/state, principal, receipt, audit, outbox và bất biến tiền/cam kết hiện có.
Khóa participant → fulfillment → Shipment → ledger theo giao thức chung; DB clock
và session được đọc lại sau khóa cuối. Không có network I/O trong transaction.

`apps/api/test/delivery-overdue.e2e-spec.ts` dùng HTTP/auth/PostgreSQL thật. Fixture
dựng listing/quote/funding/acceptance/packaging/label/pickup qua API; ảnh packaging
dùng Sharp thật với storage fake đã ghi nhãn. Không phải một lần xác minh Supabase
hoặc carrier thật. Kiểm tra upgrade với Applied pickup, PickupReview và CarrierReview
cũ, giữ tiền/sách, thời hạn, quyền, replay/restart, race dưới khóa PostgreSQL, failpoint
receipt/audit/outbox, worker phục hồi, privacy và raw SQL invariants.

Kết quả đã xác nhận:

| Kiểm tra | Kết quả |
|---|---|
| Contract generate/check | Pass, OpenAPI0.20.0 và generated types đồng bộ |
| Lint/typecheck toàn workspace | Pass, API/RN/operations không lỗi |
| Unit/contract/client tests |122/122: API33, session-client15, RN61, operations13 |
| API/database E2E |480/480 trong22file;35ca delivery-overdue mới |
| API build | Pass, Prisma generate + Nest build |
| Upgrade |16migration cũ với Applied pickup, PickupReview và CarrierReview; snapshot/receipt/ledger không bị viết lại |
| Local migration |17applied, checksum history khớp, không pending; có backup trước khi cập nhật |
| Runtime smoke | API0.20.0, ready200; guest report401, Member/Order không tồn tại404, operator report403; private reads200 |
| Worker/ledger | failed0, deliveryRemaining0; debit=credit=100.000.000đ, nguồn demo còn100.000.000đ, hold0 |

Các ca race có barrier thực ở user/ledger và xác nhận waiter bằng
`pg_blocking_pids`; cả hai thứ tự thắng worker/Buyer đều được kiểm tra. Failpoint
receipt/audit/outbox phải rollback review/report/state; lỗi worker ở một Order còn
trong backlog và sweep sau phục hồi. NUL/độ dài sai và trường server-owned bị chặn.

480ca chạy trên database riêng tên kết thúc `_test`, không sửa tiền hoặc tạo đơn
demo trong database ứng dụng. Runtime smoke chỉ login/read/yêu cầu bị từ chối rồi
logout. Logs local ignored: `.tmp/delivery-full-e2e.log`, `.tmp/delivery-unit.log`,
`.tmp/delivery-build.log`, `.tmp/delivery-local-worker.stdout.log`.
Backup trước migration: `.tmp/latlai-before-delivery.dump`.

## Giới hạn và bước tiếp theo

Đã xử lý nhánh **quá hạn giao** của BR-17. Carrier Delivered, Buyer xác nhận nhận,
cửa sổ kiểm tra72giờ và báo chưa nhận ngay khi carrier nói đã giao **chưa có**.
Các phần đó cần triển khai cùng điều kiện claim/hạn và kiểm thử đồng thời, không
được dùng việc “đã nhập vận đơn” hoặc pickup thay cho giao thành công.

Chưa có giao diện báo chưa nhận, Staff assignment, hồ sơ dispute đầy đủ, bổ sung
ảnh khiếu nại, quyết định/kháng nghị, return hay settlement. Không mở checkout member
trước khi có đầy đủ đường kết thúc an toàn. Luồng kế tiếp là Delivered/Buyer receipt
→ Inspection, gắn đúng Shipment, không rút ngắn72giờ hoặc giải ngân khi còn blocker.

Vận hành: backup → Prisma generate/migrate deploy → build → restart API/worker →
wallet:check. Không cần env mới hoặc dịch vụ trả phí; giữ nguyên dữ liệu, tài khoản
seed và lịch sử migration. Không sửa SQL để đóng review hoặc giải phóng tiền/sách.
