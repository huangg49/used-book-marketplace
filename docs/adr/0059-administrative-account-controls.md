# ADR0059: Admin khóa/mở tài khoản và bảo toàn nghĩa vụ

01/11/2026. Gói owner duyệt thực hiện FR-A07/AC-02/AC-49; không mở settlement,
GHN hoặc READINESS. Staff không được khóa/mở; workflow Staff đề nghị chưa thuộc gói.

- Chỉ ACTIVE ADMIN, đọc lại current session/role trước replay. Không tự khóa/mở.
  Executor khóa actor/target users theo cùng sorted order; expectedVersion chung
  với hồ sơ Member. Hai Admin khóa nhau đồng thời không thể khóa cả hai.
- Khóa ACTIVE/RESTRICTED sang LOCKED, ghi lý do, phạm vi NewTransactions,
  điều kiện mở, reference tùy chọn, actor/time. Giữ trạng thái gốc và khi mở bắt
  buộc khôi phục đúng nó. Legacy LOCKED thiếu metadata phải chọn trạng thái rõ
  ràng (UI mặc định RESTRICTED) và ghi lý do; không đoán ACTIVE.
- Không revoke session chỉ vì khóa: existing-obligation endpoints cần tiếp tục
  truy cập. Guard/service chặn giao dịch/funding mới. Không thay role, ledger,
  balance, hold, freeze, violations, snapshots hoặc tự hủy giao dịch.
- Lịch sử lấy append-only audit qua cursor ký ràng buộc Admin/target. Không lưu
  profile/contact/password/session snapshots; lý do nghiệp vụ có thể chứa dữ liệu
  riêng nên UI chỉ Admin, không log/request-body ra console.
- Order chat là kênh liên hệ nghĩa vụ: LOCKED participant có thể mở/đọc/gửi vào
  OrderCreated room gắn real Order cùng buyer/seller. Không mở negotiation/quote/
  terms/new trade. Socket send kiểm current session/role/state tại từng message.
  Đây là mở quyền có điều kiện cho nghĩa vụ đã có, không phải allowlist toàn chat.
- UI giữ command path/key/body/version qua Back/remount/mất ACK, khóa quyết định
  ngược đến receipt. Confirmation chụp path/body/version; background refresh không
  thể đổi Lock thành Unlock. Sau ACK phải đọc lại state trước quyết định tiếp.

Migration0048 chỉ thêm optional administrativeLock và audit index, không backfill
hoặc sửa0047/cũ. Phiên này chỉ chạy QA `_test`; DB chính chưa áp dụng.
