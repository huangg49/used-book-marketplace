# ADR 0073: Admin duyệt là hoàn tất rút tiền trong ví

Accepted03/11/2026 theo làm rõ của owner: nhập số tài khoản bất kỳ để gửi yêu cầu,
Admin duyệt thì rút được, không cần bước vận hành simulator riêng.

Đơn mới dùng `processingMode=Manual`. Không phụ thuộc PAYMENT_SIMULATOR_SECRET,
không gọi API ngân hàng hoặc kiểm chứng tài khoản nhận. Tài khoản chỉ là thông tin
người dùng nhập; giữ validation định dạng, lý do bắt buộc và snapshot theo đơn.
Đây là thao tác trên sổ cái của ứng dụng, không xác nhận chuyển khoản ngân hàng.

- Gửi: Requested + chuyển available vào hold riêng nguyên tử.
- Admin độc lập duyệt: trong cùng transaction ghi WithdrawalPayout từ hold,
  chuyển Completed và thông báo; có ghi nhận xác nhận, receipt, audit và mã tham chiếu.
- Từ chối: trả hold về available. Không tự duyệt, không chi/refund hai lần.
- Giữ current auth trước replay, phiên Admin trong15phút, expectedVersion,
  idempotency và commit-time ledger checks. Nhập tài khoản tùy ý không bỏ các kiểm
  tra quyền hoặc cho phép rút vượt số dư.

Quyết định này thay yêu cầu simulator củaADR0072 và SRSFR-W07 đối với **đơn mới
Manual**. Đơn cũ không có field này giữ semantics Simulator, đặc biệt Processing
chưa rõ kết quả không tự hoàn/chi lại. Endpoint cũ chỉ phục vụ tương thích lịch sử;
bỏ mục Chi tiền mô phỏng khỏi menu của luồng mới. Không giả event simulator để
làm bằng chứng cho quyết định Admin.

Migration0061 thêm field tùy chọn, không rewrite bản ghi/ledger/migration cũ.
UI giữ popup và phong cách hiện có, bỏ nhãn mô phỏng trong form rút và đơn mới.
Không đổi các gate giao nhận/settlement củaREADINESS.

Làm rõ tiếp03/11: Admin chỉ bấm “Xác nhận” trong popup duyệt, không nhập lý do.
UI gửi ghi nhận “Đã xác nhận yêu cầu rút tiền.” qua field reason hiện có để giữ
receipt/audit; không coi đây là lời giải thích do Admin nhập. Từ chối vẫn cần lý
do. Chi tiết bố cục và kiểm chứng ở [feature](../features/WALLET_WITHDRAWALS.md).
