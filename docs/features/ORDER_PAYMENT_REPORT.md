# Thanh toán Order và hoàn tiền trước xác nhận — F2c

28/09/2026 · Nhánh `codex/order-wallet-payment` · OpenAPI 0.15.0.
[ADR 0020](../adr/0020-order-wallet-payment.md) giải thích quyết định và ràng buộc.
Nhánh kế thừa các increment chưa commit của workspace; không phải một PR sạch chỉ
chứa F2c. Không commit/push, không thay mật khẩu seed, không sửa snapshot SRS 1.0.
Cập nhật F2d: [Order preparation](ORDER_PREPARATION_REPORT.md) đã thêm Seller nhận
đơn và task xác minh quá hạn pickup. Giới hạn F2c bên dưới là mốc lịch sử; vận đơn/
carrier/giải quyết hồ sơ vẫn chưa triển khai.

## Backend đã triển khai

| Thao tác | Kết quả |
|---|---|
| Buyer `POST /orders/{orderId}/pay` | Chuyển đúng P+S từ available sang hold riêng Order, một lần; đặt hạn xác nhận 48 giờ |
| Buyer `POST /orders/{orderId}/cancel-paid` | Trước hạn xác nhận: lưu quyết định hoàn toàn bộ, SettlementPending |
| Seller `POST /orders/{orderId}/reject` | Trước hạn xác nhận: lưu SellerRejected, SettlementPending |
| Worker hết hạn xác nhận | Lưu SellerConfirmationExpired, kể cả tài khoản mất phiên/bị vô hiệu |
| Worker hoàn tiền | Ghi bút toán trả về đúng Buyer, đóng Cancelled và giải phóng sách cùng transaction |
| Đọc Order/ví/history | Phân biệt held với refunded; lịch sử debit/credit, reason, deadlines; chỉ participant/chủ ví |

Hủy đơn chưa trả tiền giữ nguyên endpoint `/cancel`. API thanh toán không nhận amount,
không nạp hộ và không gia hạn 15 phút. Thiếu tiền không để lại hold/journal dở dang.
Khi quyết định hoàn đã được lưu nhưng ghi sổ lỗi, sách vẫn Reserved và tiền vẫn held;
worker thử lại từ PostgreSQL, không cần người dùng bấm hủy lần nữa. Không trả phí ship
cho Seller khi chưa có giao hàng, không thu commission ở bước này.

LOCKED được xem và yêu cầu hủy/từ chối nghĩa vụ cũ, không được trả tiền mới. RESTRICTED
được trả tiền cho Order đã có. Role/session/status được kiểm tra lại dưới khóa. Seller
bị khóa/vô hiệu/mất MEMBER trước funding khiến lệnh mới bị chặn; Buyer vẫn hủy được.

## Kiểm chứng

PostgreSQL thật trên database `_test`, schema riêng mỗi suite; HTTP Nest thật.
Tiền test đi qua intent và TEST_OPERATOR simulator độc lập. Media trong fixture là
storage giả để dựng listing, không phải bằng chứng Supabase/native upload.

Nhóm mới: 44 ca payment/refund + 1 ca migration, bao gồm:

- P+S được giữ đủ, không chuyển cho Seller; 48 giờ tính từ paidAt; không sửa listing
  version/commitment khi funding. Reconcile cả available + hold + nguồn hữu hạn.
- Thiếu số dư không ghi một phần; nạp riêng rồi retry cùng key; deadline không đổi.
- 100 requests cùng key dưới barrier DB chỉ một journal/receipt; hai Order tranh cùng
  số dư không âm; receipt gốc vẫn replay sau refund/restart.
- Payment và unpaid cancel hai thứ tự thắng; payment/expiry trước và tại hạn; nạp muộn
  không mở lại Order. Barrier xác nhận contender thực sự chờ khóa PostgreSQL.
- Deadline T−1ms/T/T+1ms; chờ khóa qua deadline/phiên hết hạn; Buyer/Seller bị khóa
  trong lúc request đang chờ. Guest/foreign/wrong role/unverified/revoked bị chặn.
- Buyer hủy đua Seller từ chối hai thứ tự; deadline xác nhận; hai worker refund/expiry
  chống lặp. LOCKED yêu cầu hoàn và DISABLED vẫn được worker hoàn tiền về ví cũ.
- Failpoint entry/receipt/audit/outbox khi trả; journal/entry/commitment/Order/receipt/
  audit/outbox khi hoàn: rollback, giữ decision trước đó, retry không nhân đôi.
- SQL từ chối funding không journal, receipt quyết định thiếu, nguồn/amount sai,
  release trước hoàn, sửa/xóa lịch sử. Migration giữ address/listing/receipts và
  opening balance; không reset hoặc cấp thêm nguồn.
- History lọc type/Order, pagination và balanceAfter đúng; cursor người khác bị chặn.

Kết quả chạy trên working tree của nhánh này, Node 24.19.0/pnpm 11.19.0:

| Gate | Kết quả |
|---|---|
| `pnpm contract:check` | Qua; types sinh từ OpenAPI 0.15.0 |
| `pnpm lint`, `pnpm typecheck` | Qua toàn workspace |
| `pnpm test` | 122 unit qua: API 33, session 15, RN 61, operations 13 |
| `pnpm test:api:e2e` | 313 test qua / 17 files, gồm 45 test mới |
| `pnpm build` | API và operations qua; không phải native build |
| Local upgrade | Sao lưu trước migrate; 12/12 migration khớp checksum, không còn pending |
| Local runtime | API 0.15.0 ready, 3 command từ Guest trả 401, private reads 200; worker backlog/failed=0 |
| `wallet:check` | Debit=credit=100M, available=held=0, nguồn còn 100M; không bơm tiền demo |
| `doctor:local` | DB/API/migrations/private bucket read qua; RN localhost vẫn cần đổi cho emulator/điện thoại |

Log local (ignored): `.tmp/order-payment-e2e.log`, `.tmp/payment-full-e2e.log`,
`.tmp/payment-unit.log`, `.tmp/payment-build.log`, `.tmp/payment-local-worker.stdout.log`.
Các dòng 500/503 trong E2E là failpoint có chủ đích và đã được assert. pg8 phát
cảnh báo concurrent query trong barrier test; không xem đây là bằng chứng tương thích pg9.

## Chạy local

1. Docker/PostgreSQL đang chạy, giữ volume hiện có. `pnpm db:generate`, `pnpm db:migrate`.
2. `pnpm --filter @used-books/api build`. Restart API và worker theo cùng build mới.
3. Chạy API `pnpm dev:api`; ở terminal riêng `pnpm dev:orders`, hoặc sau build
   `pnpm --filter @used-books/api worker:orders:prod`.
4. Smoke một lần: từ `apps/api`, `node dist/order-worker.js --once`. Log vẫn dùng
   event `orderExpirySweep`, nay có unpaidRemaining/confirmationRemaining/refundRemaining.
5. `pnpm --filter @used-books/api wallet:check` đối soát read-only. Không sửa số dư
   bằng SQL; nguồn 100M được bảo toàn cả khi nằm trong hold.

Worker quét mỗi phút, tối đa 100 bản ghi mỗi pha. Backlog quá 120 giây hoặc failed
cần kiểm tra log/request ID và nguyên nhân lỗi; không tự đánh Cancelled để bỏ qua
tiền. Không log token, địa chỉ, password hoặc body. Chưa có hệ thống gửi cảnh báo tự động.

## Phần chưa hoàn thành

Seller nhận đơn → Preparing, vận chuyển/custody, khiếu nại, quyết toán trả Seller và
RN checkout/ví/Order inbox vẫn planned. Vì vậy chưa mở hành trình mua cho Member;
đây là backend funding/refund, không phải giao dịch mua sách trọn vẹn.

AC-10 và phần payment của CM-AC14 đã có bằng chứng. CM-AC15 chỉ gồm hoàn trước xác
nhận; AC-11 còn thiếu đua với seller acceptance; AC-12 chưa có xác minh căn cứ/strike.
Chưa có refund sau pickup, ViaPoint, auction hoặc Exchange. Không có tiền thật,
native QA mới, daily reconciliation scheduler hay xử lý discrepancy có thẩm quyền.
