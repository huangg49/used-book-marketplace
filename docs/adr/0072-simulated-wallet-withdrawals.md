# ADR 0072: Rút tiền mô phỏng có giữ tiền và Admin độc lập

Accepted 03/11/2026 theo yêu cầu owner trong phiên triển khai rút tiền.
SRS1.1 FR-W01–W08, POL-15 và UC-13 là nguồn nghiệp vụ. Gói này cho phép riêng
rút tiền mô phỏng; không mở gate giao nhận, settlement hay thanh toán ngân hàng thật.

- Member web vào Ví → Rút tiền, nhập bằng popup và kiểm tra lại trước gửi.
  Số tiền nguyên VND từ50.000đ, không vượt available; phí0đ. Lý do bắt buộc;
  chọn Khác cần mô tả. Thông tin ngân hàng/tài khoản/chủ nhận được snapshot.
- Tạo yêu cầu chuyển UserAvailable → WithdrawalHold trong cùng transaction.
  Hold riêng theo withdrawalId, không dùng OrderHold hoặc hold của đơn khác.
  Số dư vẫn suy từ ledger bất biến; total bao gồm cả tiền đang giữ để rút.
- ACTIVE ADMIN khác người yêu cầu duyệt/từ chối có lý do. Phiên đăng nhập mới
  trong15phút được kiểm trước replay và khi commit. Duyệt không tạo payout.
  Từ Requested hoặc Approved có thể từ chối trước khi gửi chi, trả đúng hold.
- Gửi chi từ Approved tạo đúng một payoutRef cố định và chuyển Processing.
  TEST_OPERATOR độc lập với người rút dùng adapter mô phỏng có xác thực để
  ghi kết quả; đối chiếu amount/VND/recipient/reference. Không có callback public.
  Unknown giữ Processing/hold; không phát lại lệnh chi với reference khác.
- Thành công chuyển WithdrawalHold → SimulatorClearing và Completed.
  FailedVerified giữ tiền để Admin thực hiện hoàn nguyên tử → Refunded.
  Refunding là bước ghi sổ nguyên tử, không có trạng thái trung gian đã commit.
  Không vừa hoàn vừa chi, không hoàn khi chỉ timeout/chưa rõ kết quả.
- Lịch sử khả dụng ghi Rút tiền khi giữ tiền và hoàn khoản giữ khi từ chối/hoàn.
  Dòng Rút tiền đọc trạng thái hiện tại; payout dùng hold nên không trừ available
  lần hai. Chi tiết yêu cầu có timeline và thông báo riêng tư mở đúng hồ sơ.
- Commands dùng key/body/version cố định, current auth trước replay, user/session/
  aggregate/account locks và commit-time invariants. Event identity và payout
  journals chống lặp. Không sửa migration cũ; thêm0060 và refresh app privileges.

API chung cho các client. UI tạo đơn và quản trị trong gói này là Member web và
Admin; RN chỉ cập nhật bộ đọc ví/lịch sử/thông báo để tương thích. Daily scheduled
reconciliation và tích hợp ngân hàng thật chưa nằm trong gói. `wallet:check` có
kiểm withdrawal holds, journals, receipts, evidence và bảo toàn nguồn mô phỏng.

Hành trình và evidence: [gói rút tiền](../features/WALLET_WITHDRAWALS.md).
