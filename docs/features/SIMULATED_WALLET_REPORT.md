# Ví và nạp tiền mô phỏng — F2a

28/09/2026 · Nhánh `codex/simulated-wallet-ledger` · OpenAPI 0.13.0.
[ADR 0018](../adr/0018-simulated-wallet-ledger.md) chốt thiết kế và giới hạn.
Cập nhật F2b: [quyền LOCKED](LOCKED_OBLIGATIONS_REPORT.md) đã cho đọc ví/history
riêng, topupEnabled=false; không mở nạp mới. Các mốc kiểm thử F2a bên dưới là lịch sử.
Cập nhật F2c: [Order payment/refund](ORDER_PAYMENT_REPORT.md) thêm OrderHold,
OrderPayment/OrderRefund, transactionHeld và history theo posting sequence; đối soát
conservation bao gồm hold. Mô tả “hai loại journal” bên dưới là phạm vi gốc F2a.

## Phần đã triển khai

| API | Quyền và hành vi |
|---|---|
| `GET /me/wallet` | Member ACTIVE/RESTRICTED; available/tổng từ ledger; nhãn mô phỏng và capability rõ ràng |
| `POST /me/topups` | Tạo intent Pending, chưa cộng tiền; Idempotency-Key; chỉ nhận amount |
| `GET /me/topups` | Lịch sử intent riêng, lọc state/ngày, keyset cursor/limit |
| `GET /me/topups/{topupId}` | Chỉ chủ intent; foreign/missing 404 |
| `GET /me/wallet/history` | Journal đã posted, lọc loại/ngày/topupId; balanceAfter không bị tính lại từ trang đã lọc |
| `POST /operations/simulator/topup-events` | TEST_OPERATOR ACTIVE độc lập với người nhận; phát sự kiện qua adapter ký/xác minh phía server |

Ledger, intent, sự kiện, receipt, audit và outbox nằm trong một transaction. Sai tiền,
VND/người nhận hoặc bằng chứng terminal mâu thuẫn chuyển ReviewRequired; không tự
cộng/thu hồi tiền. Lặp cùng provider event hoặc thành công lần nữa không cộng thêm.
Cùng HTTP key trả receipt gốc sau khi kiểm quyền hiện tại. Quota 10 intent chưa xong.

Sổ cái dùng hai entry/journal cho hai loại đang hỗ trợ: OpeningCapital và Topup.
Nguồn demo 100.000.000đ chỉ được mở một lần qua migration có journal đối ứng; không
có API tăng nguồn hoặc sửa available. Hết nguồn thì cả lệnh rollback và trả 503.
Mỗi intent 1.000–10.000.000đ. Đây là hạn mức demo kỹ thuật, không phải phí dịch vụ
hay quỹ sự cố điểm POL-42. Không có tiền thật hoặc kết nối ngân hàng.

## Chạy local

1. Giữ database/volume hiện có; chạy `pnpm db:generate` và `pnpm db:migrate`.
2. `apps/api/.env`: đặt `PAYMENT_SIMULATOR_SECRET` ít nhất 32 ký tự ngẫu nhiên riêng
   cho server, NODE_ENV=development. `pnpm setup:local` sinh khóa cho file mới,
   không ghi đè file đang có. Không gửi khóa qua chat hoặc đặt ở client.
3. `pnpm --filter @used-books/api build`, chạy API bằng `pnpm dev:api`.
4. Member tạo intent; TEST_OPERATOR dùng intentId, recipientId, amount, currency,
   eventId UUID, outcome và occurredAt ISO để phát sự kiện. Dùng phiên riêng; một
   người có cả hai role vẫn không được phát sự kiện nạp cho chính mình.
5. Đọc lại intent/ví/history, chạy `pnpm --filter @used-books/api wallet:check`.

Secret trống tắt tạo intent/phát sự kiện nhưng vẫn cho đọc lịch sử. Cấu hình có
secret trong production bị từ chối khởi động. Không có public webhook nhận kết quả
tự gửi từ trình duyệt. Bộ điều khiển simulator bằng UI còn planned.

## Bằng chứng kiểm thử

Test chạy PostgreSQL `_test` với schema riêng, HTTP Nest thật. Không dùng database
ứng dụng để bơm tiền test. Nhóm kiểm tra gồm:

- Nạp thành công có đúng hai entry cân bằng, available/history khớp; tạo intent
  không cộng tiền; lọc/phân trang không đổi số dư sau giao dịch.
- Cùng key sau restart, cùng provider event qua key/operator khác, 100 yêu cầu dưới
  barrier PostgreSQL và nhiều event thành công cho một intent: chỉ một journal.
- Amount/currency/recipient/time sai, terminal mâu thuẫn, Processing trễ, review
  sticky; không lộ ví/cursor người khác, không giả quyền qua request body.
- Guest/Member/Staff/Admin không phát sự kiện; operator không tự nạp; role/status/
  revoke thay đổi khi đợi khóa; session hết hạn trong lúc đợi nguồn tiền.
- Lỗi tại event/journal/entry/receipt/audit/outbox rollback toàn bộ; thử lại cùng key.
- Hai người tranh phần nguồn cuối, quota intent đồng thời, SQL từ chối sửa/xóa dữ
  liệu posted hoặc journal thừa entry; kiểm tra HMAC và cấu hình tắt/production.
- Đối soát phát hiện fixture cố ý làm lệch entry trong transaction test rồi rollback
  cả dữ liệu và thao tác tắt trigger; không tắt constraint ở database ứng dụng.
- Migration từ 10 bản cũ giữ nguyên dữ liệu address/listing/receipt/audit và các
  trigger cũ; tạo nguồn bằng journal, không seed số dư Member.

Node 24.19.0, pnpm 11.19.0; ngày 28/09/2026: **242 ca API/database trong 14 files
qua**, gồm 40 ca ví và một ca upgrade mới. **121 unit tests** qua (API 33, session
14, RN 61, operations 13). Contract check, lint/typecheck toàn workspace và build
API qua. Sau chỉnh sửa cuối kiểm tra bảo toàn nguồn trong CLI, chạy lại **41 ca
ví/upgrade đều qua**, gồm bỏ qua kiểm tra số dư ở service trong test để chứng minh
constraint SQL vẫn từ chối ghi âm nguồn. Log lỗi 500/503 của failpoint có assertion;
không phải lỗi bị bỏ qua. Cảnh báo pg 8 concurrent query từ nền cũ vẫn còn; không
tuyên bố tương thích pg 9.

Database local đã áp migration 11, **11/11 checksum khớp**, không reset volume/seed.
Cấu hình simulator riêng đã được sinh trong file env server (ignored), không đổi
khóa hoặc mật khẩu hiện có. API local mới đã khởi động: readiness 200, guest ví 401,
Member đọc ví/history 200 và bị chặn phát simulator 403. Phiên đăng nhập kiểm tra
đã logout; không tạo topup hoặc cộng tiền Member trong database ứng dụng.

Đối soát local: debit = credit = 100.000.000 VND, một journal mở nguồn, không có
topup, tổng available Member = 0, nguồn còn 100.000.000 VND. `doctor:local` qua DB,
migration, API và bucket Supabase live (read-only); RN URL localhost vẫn cần đổi
thành `10.0.2.2` khi chạy Android emulator. Worker Order cũ tiếp tục sweep thành
công, không backlog. Tiến trình API/worker là local theo phiên, chưa là service tự
khởi động sau reboot. Full nạp/thất bại/race đã kiểm trên `_test`, không coi smoke
đọc ví local là bằng chứng đã chạy nạp tiền trên database ứng dụng.

## Giới hạn nghiệm thu

F2a đóng phần nạp của AC-38 và nền journal liên quan FR-W02/03/04. FR-W01 mới có ví
available; hold đang bằng 0 vì chưa có handler. Không đánh pass toàn FR-W01–08,
AC-39–41, CM-AC14–16 hoặc F2. CLI đối soát read-only chưa là worker hằng ngày, hồ sơ
discrepancy hay cơ chế chặn settlement tự động. ReviewRequired chưa có quy trình
giải quyết; không sửa DB để làm intent thành công.

LOCKED vẫn bị chặn bởi nền auth hiện tại; capability xem ví/xử lý nghĩa vụ cũ phải
được triển khai trước khi bật Order payment. Sự kiện hợp lệ của intent đã tạo vẫn
được xử lý kể cả người nhận đã Locked/Disabled/mất role. Không tự thanh toán Order,
gia hạn reservation hoặc mở lại đơn hết hạn khi tiền đến.

Chưa có giao diện ví React Native, nút thanh toán, rút tiền, hold, settlement hoặc
tiền thật. Không dùng test backend thay nghiệm thu native hay trình diễn mua hoàn chỉnh.
