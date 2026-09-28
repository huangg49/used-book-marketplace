# Người bán nhận đơn và hạn chuẩn bị giao — F2d

28/09/2026 · `codex/order-seller-acceptance` · OpenAPI **0.16.0**.
[ADR 0021](../adr/0021-order-preparation.md) chốt quyền, deadline và giới hạn.
Nhánh kế thừa các increment chưa commit; không phải PR sạch chỉ chứa F2d.

## Phần đã triển khai

- Seller nhận Order đã trả tiền qua `/orders/{orderId}/accept`; expectedVersion/key
  bắt buộc. Chuyển Preparing và chốt 48 giờ từ thời điểm nhận đơn, không thay hạn cũ.
- Chỉ mở địa chỉ nhận đã snapshot cho Seller sau nhận đơn. Edit sổ địa chỉ không
  sửa giao kết; receipt/list/public không chứa địa chỉ.
- Nhận đơn đua với Buyer hủy hoặc worker hết hạn: một transition thắng. Replay sau
  mất response/restart trả receipt gốc. LOCKED/RESTRICTED được nhận nghĩa vụ cũ,
  không có quyền mua/review mới.
- Worker quá hạn pickup tạo PickupReview Open và ResolutionPending một lần. Giữ
  nguyên tiền/commitment, không suy diễn “chưa gửi”, không hoàn/thu phí/ghi strike.
- Migration additive và SQL deferred checks bắt buộc preparation/review đi kèm
  receipt, audit, outbox và actor đúng. Lịch sử/deadline không sửa/xóa được.
- Worker báo riêng backlog cần chạy và số/tuổi hồ sơ còn Open. Một task đã mở không
  tiếp tục bị quét như một deadline chưa xử lý.

`sellerAcceptanceEnabled` là capability hiện tại theo vai/state/deadline;
`shipmentRegistrationEnabled=false` thể hiện đúng phần chưa triển khai. `canCancel`
và `canRequestRefund` giữ nghĩa cũ, không dùng để cho hủy sau acceptance. API private
Order có thêm preparation, shippingAddress; tên schema PrivateUnpaidOrder giữ để
không phá các references cũ, nhưng mô tả đã bao gồm paid/preparation states.

## Bằng chứng

Test mới dùng Nest HTTP và PostgreSQL `_test` thật, schema riêng. Setup seed sách
qua API và nạp qua TEST_OPERATOR simulator; ảnh fixture/storage signing giả không
phải bằng chứng Supabase hoặc native upload.

- Upgrade từ 12 migration có Order AwaitingPayment, reservation/snapshot, topup/
  journal/receipt thật: dữ liệu trước/sau không đổi; Order cũ trả tiền/accept được.
- Acceptance giữ đủ P+S, không tăng listing version/commitment events hoặc thêm
  journal; Seller chưa được nhận tiền. BR-46 đúng trước/sau nhận và khi sửa địa chỉ.
- Buyer/ngoài cuộc/Staff/Admin, mất MEMBER, disabled/unverified/revoked bị chặn;
  LOCKED/RESTRICTED đúng seller được nhận nghĩa vụ cũ, kể cả buyer đã disabled.
- T−1ms/T/T+1ms tại confirmation deadline và pickup deadline; request chờ user hoặc
  hold-account lock kiểm tra lại thời gian/phiên/quyền sau khi được khóa.
- Acceptance/cancel và acceptance/confirmation expiry hai thứ tự thắng, có barrier
  PostgreSQL; 20 requests cùng key chỉ một receipt/preparation, replay sau restart.
- Failpoint preparation/Order/receipt/audit/outbox khi nhận và review/Order/receipt/
  audit/outbox khi quá hạn: rollback, retry không nhân đôi; worker không cần phiên.
- Raw SQL không tạo Preparing/ResolutionPending nếu thiếu records, không sửa hạn
  hoặc xóa history; wallet:check vẫn bảo toàn nguồn + available + hold.
- Worker không hoàn tự động, không release, không xử lý lặp task đã mở; private
  projection/list filter thể hiện Preparing và ResolutionPending.

Kết quả trên working tree này (Node 24.19.0, pnpm 11.19.0):

| Gate | Kết quả |
|---|---|
| Contract check | Qua, generated types khớp OpenAPI 0.16.0 |
| Lint/typecheck | Qua toàn workspace; lint API lần cuối không warning |
| API/database E2E | **355/355**, 18 files; thêm **42 ca** trong order-preparation.e2e-spec.ts |
| Unit | **122/122**: API 33, session 15, RN 61, operations 13 |
| Build | API và operations qua; không có native build mới |
| Upgrade local | Backup trước migrate; **13/13** migration khớp checksum, không pending |
| Smoke local | API 0.16.0 ready, Guest accept 401, private reads/state filters 200 |
| Worker | failed/backlog/openPickupReviews đều 0 trong dữ liệu local hiện có |
| Đối soát local | Nguồn còn 100M, available/held=0, debit=credit=100M; không nạp tiền demo |
| Doctor | DB/API/migrations/private bucket read qua; RN localhost cần đổi khi dùng Android/điện thoại |

Log ignored: `.tmp/preparation-full-e2e.log`, `.tmp/preparation-unit.log`,
`.tmp/preparation-build.log`, `.tmp/preparation-local-worker.stdout.log`.
E2E có lỗi 500/503 được cố ý tạo và assert để thử rollback. Cảnh báo concurrent
query của pg8 nằm ở barrier fixtures, không phải chứng nhận hỗ trợ pg9. Không sửa
mật khẩu seed, không reset database, không commit/push hoặc thay SRS 1.0.

## Chạy local

Giữ volume/database hiện có. Sao lưu, `pnpm db:generate`, `pnpm db:migrate`,
`pnpm --filter @used-books/api build`; restart API và Order worker cùng phiên bản.
`pnpm dev:api` và `pnpm dev:orders` chạy ở terminal riêng. Sau build, từ `apps/api`
có thể dùng `node dist/order-worker.js --once` để kiểm tra một sweep.

Log orderExpirySweep thêm pickupRemaining, openPickupReviews,
oldestPickupReviewAgeSeconds. Backlog trễ quá 120 giây/failed cần kiểm tra; Open review
là hồ sơ chờ xác minh, không được coi đã xong khi remaining=0. Chưa có alert delivery
hoặc scheduler đối soát. `pnpm --filter @used-books/api wallet:check` chỉ đọc.

## Gate còn mở

Follow-up 0.17.0: [ảnh đóng gói](PACKAGING_EVIDENCE_REPORT.md) đã có API riêng tư;
số liệu kiểm thử ở trên giữ nguyên bằng chứng lịch sử của 0.16.0.

Follow-up0.18.0: [đăng ký vận đơn](DIRECT_SHIPMENT_REPORT.md) đã có API; label chưa
có pickup vẫn chịu deadline/worker nêu trên. Carrier và giải quyết review còn planned.

**Chưa có luồng gửi hàng hoàn chỉnh.** Carrier simulator,
bằng chứng pickup, phân công/giải quyết review, hủy hai bên sau nhận đơn, trả hàng và
quyết toán Seller còn planned. Đơn đã nhận có thể đến ResolutionPending nhưng chưa
có handler giải quyết hồ sơ đó; đây là giới hạn backend đã ghi rõ, không tự sửa SQL.

Vì vậy chưa mở checkout cho Member và không đánh AC-13–16 là pass. AC-11 mới có phần
race Buyer hủy trước xác nhận vs Seller nhận; phần sau pickup chưa làm. FR-S05 có
phần phát hiện quá hạn/mở task, chưa có xác minh custody và quyết định cuối. Không
coi bộ test này là kiểm thử native hoặc chứng minh toàn bộ F2 đã hoàn thành.
