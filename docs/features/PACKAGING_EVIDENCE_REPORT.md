# Ảnh đóng gói riêng tư của Order — báo cáo triển khai

28/09/2026 · OpenAPI **0.17.0** · nhánh `codex/order-packaging-evidence`.
Quyết định: [ADR 0022](../adr/0022-order-packaging-evidence.md).
Nối sau [nhận đơn và hạn pickup](ORDER_PREPARATION_REPORT.md).

## Phạm vi đã chạy

Seller đã nhận đơn có thể tạo lượt tải và nộp ảnh đóng gói riêng cho Order đang
Preparing hoặc ResolutionPending. Buyer/Seller có quyền hiện hành xem danh sách
và bản xem ảnh đã nộp. Có quyền xử lý nghĩa vụ cũ cho LOCKED/RESTRICTED, nhưng
không mở thanh toán mới. Không dùng ảnh listing làm bằng chứng đóng gói.

| API | Quyền và kết quả |
|---|---|
| POST `/orders/{orderId}/packaging-evidence` | Seller, expected Order version + key; Pending evidence receipt |
| PUT `/orders/{orderId}/packaging-evidence/{evidenceId}/content` | Seller, bearer + key riêng + binary đúng hash/size/MIME; Ready evidence receipt |
| GET `/me/orders/{orderId}/packaging-evidence` | Participant; tối đa32 metadata, không có object key/URL |
| GET `/me/orders/{orderId}/packaging-evidence/{evidenceId}/read` | Participant; Ready preview có signed URL120giây, audit cấp quyền xem |

Version trong receipt thuộc evidence (1→2), không tăng version Order. Không có
thay đổi ledger, hold, cam kết giữ sách, hạn pickup, custody hoặc listing. Ảnh đến
muộn được ghi uploadedAt theo giờ quyết định của server và không tự giải quyết
PickupReview. Ready chỉ chứng minh tệp được nhận/kiểm tra kỹ thuật thành công;
không chứng nhận ảnh thật, sách chính hãng hay carrier đã lấy hàng.

## Dữ liệu và tính riêng tư

Migration14 `20260928040000_order_packaging_evidence` tạo bảng riêng có FK tới
OrderPreparation; create/upload receipt dùng chung command executor, context FK,
audit và outbox trong một transaction. Deferred constraints kiểm tra đúng Seller,
operation, evidence ID, context, thời điểm và phiên bản. Guard chặn sửa bản gốc,
xóa bằng chứng và đổi Ready. Migration không viết lại bảng tiền/snapshot cũ.

Ảnh gốc giữ tại prefix riêng; preview WebP tối đa1600px đã bỏ metadata. Thực thi
Sharp thật: JPEG/PNG/WebP tối đa10MB, một frame,40MP, preview tối đa2MB. Không nhận
URL/object key của client. Generic Staff/Admin không được đọc bằng vai trò chung.
Không có API tải bản gốc; quyền theo phân công hồ sơ cần triển khai sau.

Kiểm tra quyền trước và sau remote I/O; receipt replay vẫn kiểm tra session/role/
ownership hiện hành. Audit ghi người được cấp preview, evidence ID, context và
request ID, không ghi signed URL hoặc nội dung ảnh. URL đã cấp tồn tại tới hết hạn;
audit là cấp URL, không theo dõi mọi lần fetch từ CDN bằng URL đó.

## Upload, thử lại và giới hạn tài nguyên

Packaging xử lý đồng bộ trong request có giới hạn; không có Processing/finalize/
worker job. Dùng chung hai upload slots mỗi process với listing. Intent dùng
storage budget800MB mặc định chung cả hai pipeline, cùng PostgreSQL advisory lock;
reserve số byte gốc +2MB. Giới hạn20intent/giờ/người tính cả listing lẫn packaging,
tối đa32intent giữ lại/Order. Các ngưỡng sau là quyết định triển khai demo trong ADR,
không phải cap của claim trong SRS.

Hai object key cố định, create-only; retry cùng byte/key không overwrite hoặc tăng
số object. Storage thành công nhưng acknowledgement thất bại để lại Pending và
vẫn tính reservation. Client gửi lại cùng byte/key để phục hồi; list giúp tìm intent
theo hash. Intent sai ảnh không bị sửa thành ảnh khác: chọn ảnh khác tạo intent mới.
Same Order/hash với key khác trả409. Không tự giải phóng dung lượng khi request lỗi.

Không có packaging cleanup/reclamation. Original, preview và metadata giữ theo
vòng đời đồ án, vượt tối thiểu365ngày sau đóng của POL-25; listing cleanup không
đụng tới bằng chứng. **Hết cap có thể vẫn hết cap khi chờ**; chưa có quy trình giải
phóng intent lỗi. Kho Free hữu hạn có thể dừng nhận ảnh. Backup database đơn thuần
không chứa ảnh: vận hành phải sao lưu cả object riêng tư và ánh xạ UUID.

## Kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| Contract | OpenAPI0.17.0 parse thành công, generated types khớp |
| Lint/typecheck | Qua toàn workspace, API không warning lint |
| API/database E2E | **384/384**,19files;29ca packaging mới |
| Kiểm tra riêng sau siết receipt/outbox constraints | **29/29** packaging qua |
| Unit | **122/122**: API33, session15, RN61, operations13 |
| Build | API và operations qua; không có native build mới |
| Upgrade local | Backup trước migrate;14/14migration đúng checksum, không pending |
| API local | 0.17.0,4route mới; ready200, Guest write401, Order không sở hữu/không tồn tại404 |
| Worker local | failed/backlog/openPickupReviews đều0 tại lần kiểm tra |
| Ledger local | Balanced; debit=credit100M, nguồn100M, Member available/held0 |
| Supabase | Read-only bucket check qua: private, giới hạn size hợp lệ |

E2E dùng PostgreSQL thật trong DB `_test`, HTTP/auth thật và Sharp thật.
**Storage là in-memory fake có chủ đích**, không phải bằng chứng upload packaging
thành công qua Supabase thật. Provider check local chỉ đọc cấu hình bucket. Không
có native picker/upload hoặc UI packaging được kiểm tra trong increment này.

29ca bao phủ: upgrade có Order đã trả/đã nhận; metadata stripping và bảo toàn bản
gốc; quyền participant/outsider/Staff/Admin/Guest; LOCKED/RESTRICTED; version/input
sai; upload quá hạn; replay khi storage lỗi; changed bytes/size/MIME; ảnh giả và
JPEG khai PNG; partial storage success; đổi trạng thái sau ghi object; đổi quyền
khi ký preview; cross-order/cross-media; restart và listing cleanup; rollback audit;
20request cùng key; binary đồng thời; shared upload slots; global budget dưới DB
barrier; listing cùng budget; session hết hạn sau lock; role revoke trước replay;
hourly/lifetime quotas; hai thứ tự với pickup expiry; unverified/revoked; SQL guards.

Logs ignored: `.tmp/evidence-full-e2e.log`, `.tmp/evidence-e2e-final.log`,
`.tmp/evidence-unit.log`, `.tmp/evidence-build.log`,
`.tmp/evidence-local-api.stdout.log`, `.tmp/evidence-local-worker.stdout.log`.
500/503 trong E2E là các failpoint có assert; pg8 có cảnh báo query đồng thời trong
fixtures. Không reset DB, đổi mật khẩu seed, nạp tiền local hoặc công bố test giả
là bằng chứng live-provider. Không commit/push trong increment này.

## Bước kế tiếp và gate còn mở

Follow-up0.18.0: [đăng ký vận đơn](DIRECT_SHIPMENT_REPORT.md) đã triển khai riêng;
các số liệu ở trên giữ nguyên bằng chứng của0.17.0. Carrier pickup còn planned.

Shipment registration phải tham chiếu Ready packaging evidence đúng Order/Seller,
pin snapshot, chống trùng carrier/tracking và không tự đánh pickup. Tiếp theo mới
cho independent TEST_OPERATOR phát carrier event qua adapter xác thực, chống lặp,
đối chiếu deadline và giữ review khi muộn/xung đột. Cần kiểm thử race với expiry
và không đảo hoàn tiền/giải phóng cam kết của giao dịch khác.

**Chưa hoàn thành luồng giao hàng.** Shipment/carrier simulator, giải quyết review,
claim PDF/video, bằng chứng theo phân công, hủy sau nhận đơn, trả hàng, quyết toán
Seller và RN checkout/wallet/packaging UI còn planned. Chưa mở checkout hoặc đánh
toàn bộ AC-13–16/FR-S02/BR-37 là pass; đây là nền upload/retention/participant preview.

Setup và retry protocol: [API README](../../apps/api/README.md#order-packaging-images-0170).
