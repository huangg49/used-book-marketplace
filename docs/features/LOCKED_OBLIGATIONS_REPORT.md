# Quyền xử lý nghĩa vụ cũ khi tài khoản bị khóa — F2b

28/09/2026 · `codex/locked-obligations-access` · OpenAPI 0.14.0.
[ADR 0019](../adr/0019-locked-existing-obligations.md) quy định phạm vi và khóa dữ liệu.
Cập nhật 0.15.0: [F2c](ORDER_PAYMENT_REPORT.md) mở thêm paid cancellation cho Buyer và
rejection cho Seller LOCKED. Payment mới vẫn 403, kể cả replay; worker hoàn tiền
không phụ thuộc phiên/tình trạng tài khoản. Các bằng chứng 0.14.0 dưới đây giữ nguyên.
Cập nhật 0.16.0: [F2d](ORDER_PREPARATION_REPORT.md) cho Seller LOCKED nhận Order
đã trả tiền của mình; kiểm tra MEMBER/session/ownership và deadline dưới khóa.

## Hành vi đã triển khai

LOCKED đã xác minh email có thể đăng nhập/refresh/xem hồ sơ. Ngoài danh sách thao
tác cho phép cụ thể, API trả 403; phiên vẫn hợp lệ để xem nghĩa vụ cũ. DISABLED,
chưa xác minh, phiên bị thu hồi hoặc hết hạn vẫn bị chặn. Tài khoản nhiều role
không được vượt giới hạn LOCKED.

| Thao tác LOCKED | Điều kiện |
|---|---|
| Xem hồ sơ | Phiên còn hiệu lực; trả đúng status LOCKED |
| Xem danh sách/chi tiết đơn và ảnh pinned | Có MEMBER và là Buyer/Seller của đơn |
| Hủy đơn chưa trả tiền | Buyer, expectedVersion/key đúng, trước hạn gốc; không có hoàn tiền giả |
| Xem ví/lịch sử nạp/journal | Có MEMBER và dữ liệu của mình; topupEnabled=false |
| Tạo đơn/quote/listing/nạp mới; sửa địa chỉ; review/simulator | 403 trước mutation hoặc replay |

API mới `GET /me/orders` có state/cursor/limit (1–100), phục hồi danh sách đơn theo
participant sau đăng nhập lại. Cursor người khác 404; dữ liệu không có contact đối
tác. Contract và generated types được cập nhật cùng nhau, không có migration mới.

Service mặc định vẫn chặn LOCKED sau khi chờ user/session lock; handler không thể
chỉ dựa vào việc ẩn nút. Login/refresh kiểm tra lại status/role/session/password
dưới khóa đúng thứ tự. Client dùng cùng session owner cũ; không thêm token store.

RN account nhận được status LOCKED, hiển thị cảnh báo và ẩn lối vào sổ địa chỉ/sách
của tôi. Client không xóa phiên khi nhận 403. Operations không mở quyền review cho
LOCKED. Chưa có màn ví/Order inbox/giao nhận/khiếu nại để coi UX nghĩa vụ cũ hoàn chỉnh.

## Kiểm chứng

PostgreSQL `_test`, schema riêng, HTTP thật; không khóa tài khoản demo local.
21 ca suite nghĩa vụ mới, 5 ca Order bổ sung, cập nhật các kỳ vọng cũ theo policy:

- Login/restore LOCKED, refresh đồng thời chỉ một winner, logout thu hồi access.
- Duyệt mọi operation authenticated không có allowlist trong OpenAPI bằng tài khoản
  LOCKED đủ bốn role: đều 403, kể cả route mới không có business handler tiền.
- Quyền sở hữu ví/history/cursor/Order/media, Buyer/Seller, role bị gỡ, body/JWT giả;
  gọi service trực tiếp vẫn không tạo nạp mới khi LOCKED.
- Barrier PostgreSQL xác nhận request đang chờ: login gặp lock/disable/unverified/
  password change; refresh gặp lock/disable/mất role/revoke/hết hạn; wallet read gặp
  lock/disable/revoke/mất role; tạo mới đã qua guard vẫn bị chặn khi lock thắng.
- Order cũ đọc/hủy/replay đúng quyền; hủy tại deadline vẫn conflict; LOCKED sau
  storage signing còn quyền participant, DISABLED sau signing bị chặn.
- Danh sách Order theo keyset/state không trùng, không lộ đơn/cursor người ngoài;
  worker vẫn hết hạn đơn khi participant mất quyền, không đổi deadline vì lock.
- Shared session test khôi phục LOCKED rồi nhận 403 mà không mất token/refresh loop;
  operations gate từ chối LOCKED.

Node 24.19.0, pnpm 11.19.0, ngày 28/09/2026: **268 ca API/database qua trong 15
files**. Nhóm tập trung auth/Order/wallet/nghĩa vụ trước đó qua 116 ca. **122 unit
tests qua** (API 33, shared session 15, RN 61, operations 13); contract check,
lint/typecheck toàn workspace và build API/operations qua. Ba assertion legacy
LOCKED 401 ở quote/draft/address được đổi thành 403 theo contract mới; vẫn kiểm
tra bị chặn và không có dữ liệu phát sinh. Log 500/503 từ failpoint có assertion.
Cảnh báo pg 8 concurrent query từ nền cũ còn tồn tại; không tuyên bố hỗ trợ pg 9.

API local đã khởi động bản 0.14.0; readiness 200, guest Order list 401, Member
đăng nhập/xem profile/ví/history/Order list 200. Kiểm tra chỉ đọc nghiệp vụ, đã logout
phiên test; không khóa user demo, tạo topup hay thay số dư trên database ứng dụng.
LOCKED và các race được kiểm chứng trong PostgreSQL `_test`, không đánh đồng với
smoke Member ACTIVE ở database local.

`doctor:local` qua database/migration/API/Supabase private bucket read-only;
**11/11 migration khớp**, không thêm migration cho increment này. Đối soát ví local
vẫn cân bằng 100.000.000 VND, Member available=0, một journal mở nguồn, không topup.
Order worker `--once` chạy mã 0, processed/failed/remaining/oldestLagSeconds đều 0.
API local hiện chạy theo phiên, chưa tự khởi động sau reboot. Log local trong `.tmp`
được ignore, không có mật khẩu/token hoặc request body.

Chưa chạy build Android/iOS hoặc kiểm tra thị giác/native tương tác cho cảnh báo
LOCKED ở Account. Lint/typecheck/unit không thay nghiệm thu đó. Các màn wallet/
Order inbox vẫn planned; không tuyên bố đã có luồng xử lý nghĩa vụ hoàn chỉnh trên RN.

## Vận hành và giới hạn

Không cần migration, seed, cloud hay env mới. Build API rồi khởi động lại process;
khởi động lại RN/operations để lấy shared parser mới. Giữ worker Order chạy riêng.
Không cập nhật trạng thái user bằng SQL trên database ứng dụng để demo tính năng.

Đây là phần backend của SRS §4/FR-A07/CM-AC16 cho workflow đã tồn tại, không đánh
pass toàn các yêu cầu này. Admin khóa/mở kèm lý do/audit, chat trong đơn, evidence,
shipment/return, paid obligations và native UI vẫn chưa triển khai. Không cấp quyền
cho handler tương lai chỉ vì mang tên “nghĩa vụ”. Trước mắt LOCKED chỉ được đọc ví;
nạp mới/withdrawal/payment vẫn bị chặn. Nạp hợp lệ của intent cũ do simulator độc
lập vẫn có thể đến, không tự thanh toán hoặc mở lại đơn đã hết hạn.

Bước tiếp theo: Order payment/hold nguyên tử, kiểm thử payment vs cancel/expiry,
và chính sách nghĩa vụ trả tiền cụ thể; chưa mở demo mua hoàn chỉnh khi chưa có
seller confirmation/giao nhận/khiếu nại/settlement và client tương ứng.
