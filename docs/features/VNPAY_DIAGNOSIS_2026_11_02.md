# VNPay đã thanh toán nhưng ví chưa cộng — đối chiếu02/11/2026

Owner báo đã thao tác thanh toán trên VNPay nhưng ví chưa tăng. Khảo sát source
và runtime thật, không tạo topup mới, không thay credential, không chạy migration,
không ghi credit hoặc bù tiền qua simulator.

## Bằng chứng hiện tại

- Runtime local API/Member đang chạy từ checkout `f3291409` cộng các thay đổi UI
  có trước. Nhánh khảo sát `codex/vnpay-topup-diagnosis`, base `185dd2b2`.
  Không chỉnh WalletPage/Profile/router đang có việc của teammate.
- VNPAY_SANDBOX_ENABLED bật; TMN_CODE/HASH_SECRET/RETURN_URL có cấu hình.
  Hai URL nạp gần nhất khớp merchant, HMAC-SHA512 với secret hiện hành, Return
  Member local, số tiền và create/expire GMT+7. Không đưa giá trị env vào báo cáo.
- Hai topup1.000.000đ tạo khoảng20:42 và20:43 đã thành Cancelled sau deadline
  5phút, chưa có Topup journal. Không có transaction VNPay được xác minh trong
  bảng provider. Điều này chưa chứng minh người dùng không trả tiền ở VNPay.
- Đọc lại checkout cũ hiện chỉ thấy thông báo hết thời gian thanh toán; do URL
  đã hết hạn tại lúc kiểm tra, kết quả này không chứng minh kết quả thanh toán
  tại thời điểm người dùng thao tác.
- Gateway sandbox trả HTTP200, clock server khớp thời điểm kiểm tra. Hai QueryDR
  chỉ đọc cho chính các intent cũ trả HTTP200 nhưng payload chỉ có
  `vnp_ResponseCode=99`, `vnp_Message=Unexpected error`, không có SecureHash,
  TransactionStatus hoặc bằng chứng payment xác minh được.

## Kết luận có giới hạn

**FAIL đối soát live tại thời điểm kiểm:** provider không trả bằng chứng hợp lệ.
[VNPaySandbox.queryPayment](../../apps/api/src/modules/wallet/vnpay-sandbox.ts)
đúng khi từ chối credit cho response thiếu chữ ký/amount/ref/status. Không được
sửa thành chấp nhận HTTP200 hoặc Return URL để cộng ví. Mã99 là lỗi khác/generic
theo [bảng mã VNPay](https://sandbox.vnpayment.vn/apis/docs/bang-ma-loi/), không
tự chứng minh một sự cố toàn hệ thống hoặc nguyên nhân merchant/network cụ thể.

[WalletService.queryVNPay](../../apps/api/src/modules/wallet/wallet.service.ts)
vẫn cho đối soát intent Cancelled. Nếu provider chứng minh payment trước hạn,
service hiện có có thể áp đúng ví/đúng một lần; query outage của intent đã Cancelled
được trả lại trạng thái local thay vì phá trạng thái hủy bền vững. Đây cũng là
giới hạn hiển thị hiện tại: trạng thái local Cancelled không xác nhận rằng provider
chưa ghi nhận thanh toán. Chưa sửa contract/UI để suy kết quả ngược lại.

Hai request đã có config hợp lệ và link đúng chữ ký, nhưng chưa có xác nhận từ
provider cho kết quả thanh toán. Giữ ref/intent cũ để đối soát tiếp khi QueryDR
hoạt động hoặc merchant có bằng chứng từ cổng VNPay. Không tạo intent/credit mới
để thay thế bằng chứng thiếu. Nếu cần kiểm merchant, dùng cổng/kênh riêng, không
yêu cầu API key, OTP, mật khẩu hay thông tin thẻ qua chat.

Lượt demo User2 trước đó dùng simulator topup API được owner cho phép; PASS của
lượt đó không chứng minh VNPay live đã nạp thành công. Đây là hai nguồn evidence
khác nhau theo [ADR0036](../adr/0036-vnpay-local-querydr.md).

## Trạng thái kiểm tra

PASS kiểm cấu hình hiện diện/link ký/Return/clock; FAIL QueryDR live như trên;
BLOCKED xác nhận provider-paid và credit hợp lệ. Không chạy harness ghi DB chính,
không thử nhập thẻ, nạp mới hoặc replay payment. DB chỉ đọc; không có tiền bù.
Evidence riêng ignored `.tmp/vnpay-diagnosis/` chứa IDs, URL ký và payload riêng;
không commit/chia sẻ chúng. Shared report chỉ ghi mã lỗi và kết quả kiểm chứng.
Chưa push/CI/merge hoặc đóng READINESS.
