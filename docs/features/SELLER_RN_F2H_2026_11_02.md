# Seller RN: đóng gói và đăng ký gửi sách — 02/11/2026

Owner duyệt sau gói quote/review, gồm tích hợp main mới, sửa socket và nối Seller
RN trong phạm vi F2h. Branch `codex/rn-seller-shipping`, base
`20e1a67b1d29fa64633bff434f5d0f40618d748e`, subject
`feat(rn): connect seller packaging and shipment journey`.
Đây là source/check local; chưa publish, native hoặc human acceptance.

## Hành trình hiện có

| Vai trò / entry | Điều kiện, thao tác | Kết quả và bước tiếp / phục hồi |
| --- | --- | --- |
| Seller: Tài khoản → đơn đang xử lý hoặc Đơn trực tiếp → Mở chi tiết đơn | Buyer đã thanh toán, có preparation và còn hạn bàn giao | Đọc đúng bản sách/bộ sách, giá, tiền giữ, hạn và địa chỉ giao snapshot. Không tự dùng địa chỉ mới trong sổ địa chỉ |
| Seller: Chọn ảnh đóng gói | Đã đọc được đơn/vận đơn/ảnh, chưa có vận đơn, Preparing còn hạn | Picker ảnh JPG/PNG/WebP ≤10MB, đọc bytes native/web, SHA256; tạo evidence rồi PUT content. Ảnh Ready mới được dùng; ảnh không tự chứng minh custody |
| Seller: ảnh chưa rõ kết quả | Mất create/content ACK, lỗi mạng/auth/rate-limit | Retry đúng key/body/bytes/version, đã có evidence ID thì không tạo ID khác. Back và mở lại đúng đơn giữ intent trong bộ nhớ cùng identity; chặn đăng ký vận đơn trong lúc ảnh bất định |
| Seller: nhập mã → Đăng ký vận đơn mô phỏng | Server cho đăng ký; ít nhất1ảnh Ready, tối đa8ảnh | Pin Order version, mã và danh sách evidence vào một intent. LatLaiSimulator hiện có, không GHN; server kiểm lại owner/state/deadline/funds dưới lock |
| Seller: vận đơn mất ACK hoặc GET lỗi sau ACK | Chưa rõ kết quả hoặc đã có receipt nhưng chưa đọc được chi tiết | Retry intent gốc qua Back; không thêm ảnh/đổi mã để tạo lệnh khác. Có ACK thì chỉ tải lại vận đơn, không tạo thay thế |
| Buyer/Seller: theo dõi vận đơn | GET private shipment của participant | Phân biệt LabelCreated/chờ bàn giao và PickedUp/InTransit. Pickup do TEST_OPERATOR độc lập qua simulator trong QA; client Member không tự xác nhận pickup/Delivered |
| Seller: quá hạn hoặc ResolutionPending | Không còn bước Preparing hợp lệ | Gỡ thao tác tạo ảnh/vận đơn mới, cập nhật đơn để xem trạng thái. Pending intent cũ vẫn có đường retry exact receipt; server quyết định quyền/state hiện tại |

## Source và các ranh giới

- [OrderFocus](../../apps/mobile-react-native/src/features/orders/order-focus-screen.tsx)
  thay lời nhắc chép mã/sang web bằng
  [OrderShipping](../../apps/mobile-react-native/src/features/orders/order-shipping.tsx).
  Dùng core UI, safe-area/scroll/Back hiện có, picker và photoBytes đã có; không
  thêm thư viện/client/framework, đổi brand hoặc motion. Thông báo lỗi local dùng
  copy allowlist, không in raw server/exception text; trạng thái vận đơn mới thay
  thông báo chờ cũ sau pickup.
- [Schemas](../../apps/mobile-react-native/src/features/orders/shipping-contracts.ts)
  đọc contract hiện có; [intent store](../../apps/mobile-react-native/src/features/orders/shipping-intents.ts)
  chỉ chứa command metadata/bytes bất định, không là token store. Byte view được
  copy đúng phạm vi; ACK/rejection chắc chắn giải phóng attempt; đổi identity
  xóa store và ngăn continuation/late ACK cập nhật intent tài khoản mới.
- Input giữ khi lỗi; upload/registration pending không cho lệnh ngược, double
  submit dùng chung flight. GET lỗi không biến thành “chưa có vận đơn”; chỉ404
  private shipment mới là chưa có. Ready count không dùng0thay read failure.
- Ngân sách deadline dựa trên serverTime và thời gian đã trôi từ lần đọc; timer
  dọn khi blur/unmount và guard kiểm lại ngay trước command mới. Network/role/
  state vẫn do backend xác nhận. Không tự nâng version hoặc đổi key vì conflict.
- Intent trong bộ nhớ phiên ứng dụng, không hứa khôi phục bytes sau force-stop/
  reload. Tài khoản mở lại đọc evidence/shipment thật; không persist ảnh/token
  bằng kho mới. Sổ địa chỉ hoặc picker không được ghi vào log.
- API packaging/shipment và contract không đổi trong gói RN. Giữ
  [ADR0062](../adr/0062-direct-delivery-completion-release-gate.md),
  [READINESS](../handoff/READINESS.md), ledger/hold/commitment. Không mở Delivered,
  Buyer receipt/claim/settlement, carrier/GHN hoặc quyền vận hành mới.

## Dependency đã tích hợp trong cùng lượt owner duyệt

- Main `d44b813b`/PR85 được ghép tại `86dc7cd9`; contract kết hợp0.69.0,
  213operation/33controller. AI ADR0061 giữ nguyên, gate chưa publish đổi0062;
  migration0050/checksum giữ nguyên, AI mặc định tắt, DB chính chưa migrate.
  PASS322API unit và62E2E AI giả/wallet/gate trước sửa socket; consumer types PASS.
  Main có9job CI PASS trên SHA đó; source local mới chưa CI.
- Socket fix `20e1a67b`: delayed-auth regression FAIL trước sửa, namespace
  middleware chờ auth trước connect, vẫn kiểm quyền tại mỗi handler service.
  PASS5unit và [real socket runner](../../scripts/test-purchase-socket.mjs): gửi
  hai chiều, replay cùng ID, outsider/LOCKED/session revoked sau connect/reconnect
  bị chặn. Không thay token store hoặc nới quyền. Web review regression sau sửa
  PASS và không còn log Unauthorized ở join như lượt trước.

## Bằng chứng và giới hạn

Windows, Node24.22.1/pnpm11.19.0, RN Vitest4.1.2/API Vitest4.1.11, TypeScript6.0.3.
QA rs-test/database `_test` riêng. Nest/Socket.IO/Mongo, SHA256 và xử lý ảnh Sharp
thật; storage/ảnh tổng hợp/mail local/wallet/carrier simulator. Không provider trả
phí, Brevo hoặc live Supabase ở lượt này. Không lấy fake thành tích hợp storage thật.

| Check | Kết quả |
| --- | --- |
| RN unit | PASS223/28file, gồm17ca shipping intent: body/version/key/byte snapshot, POST/PUT mất ACK, 4xx/5xx, opposite command, double submit, identity change/late ACK, projection |
| API unit sau socket | PASS327/43file; gồm5ca gateway mới |
| Packaging + shipments E2E | PASS60/2file; owner/role/LOCKED, state/deadline/version, binding/immutability, race/replay/rollback/bytes/quota/negative image. Giữ assertion nghiệp vụ, không sửa API để khớp UI |
| RN type/lint/export | PASS; Expo web export32route, không native build. Có NO_COLOR/shutdown warning sau export; exit0, không sửa dependency để che |
| RN browser | PASS [runner](../../scripts/test-rn-buy-now.mjs) bằng real picker/HTTP/Mongo: evidence GET lỗi, POST/PUT lostACK + Back, chỉ1Ready asset; đăng ký lostACK/Back/GET lỗi, exact key/body, chỉ1shipment; pickup độc lập tới InTransit, tiền giữ/no settlement; worker mở quá hạn pickup thật→ResolutionPending gỡ thao tác cũ. Gồm quote/order/pay/cancel regression cũ |
| Web review sau socket | PASS1440/390/320, actual pickup/delivery reviews; Inspection response fixture riêng. Không claim toàn chat/native/human PASS |
| Contract/source UI/docs | Contract0.69.0/routes213/33 PASS; detector0findings hai component RN. Screenshot320 đọc được thao tác trước/sau gửi; giữ identity. Docs/diff/scope được kiểm cuối gói |
| Remote CI source mới / Android/iOS/TalkBack / người thật | NOT RUN. Native policy block cũ giữ nguyên, không đi vòng; Expo web không thay native/human acceptance |

Lệnh sau setup QA/API build/Expo export theo [START_HERE](../handoff/START_HERE.md#5-chạy-kiểm-thử-mà-không-dùng-database-của-app):
`pnpm test:rn-buy-now:browser`, `pnpm test:purchase-socket:api` và
`pnpm --filter @used-books/user-web test:order-review:browser`.
Runner RN hiện có trong Operations CI; socket runner được thêm vào User Web CI.
Chưa push/PR/merge/deploy trong gói này; không gọi local checks là CI mới.

Lượt đầu lint bắt Date.now trong render; đã chuyển render sang snapshot/timer,
giữ kiểm thời gian thực tại handler. Browser đầu bắt locator text trùng với route
RN cũ còn trong DOM; sửa chọn heading/alert/visible đúng màn, giữ assertion ID,
tiền/quyền và payload. Ca quá hạn sau đó cần chờ/chọn đúng ID khi danh sách còn
snapshot cũ, thay vì bấm dòng đầu. Khi xem ảnh thấy success “đang chờ” còn sau pickup, đã để
projection hiện tại thay thông báo ACK cũ; thêm assertion không còn câu chờ sai.
Không giảm assertion để làm xanh. Một lượt apply patch không khớp chưa ghi thay đổi.

QA DB/users/roles riêng được dọn/đối soát cuối lượt, dịch vụ do QA mở được dừng;
DB/bucket/env chính và28file UI/ảnh ngoài gói giữ nguyên. READINESS không đổi.
Nhóm cần nghiệm thu ảnh điện thoại thật, picker/Back/keyboard/chữ lớn trên thiết
bị native, storage thật và vận hành giao nhận; chưa đóng bất kỳ gate này.
