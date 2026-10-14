# ADR0036: VNPay sandbox trên localhost qua QueryDR

Chấp nhận trong phạm vi dev sandbox theo yêu cầu chủ dự án15/10/2026.
Không mở gate release, không xử lý tiền thật, không đổi settlement/hold của Order.

## Bối cảnh

Return trỏ về URL tunnel cũ gây lỗi3200; backend local vẫn chạy nhưng không nhận
được IPN từ Internet. Chủ dự án yêu cầu chỉ chạy localhost, không mở ngrok.
Return query không chứng minh payment; không ghi credit dựa vào browser status.

## Quyết định

- Return server config dùng loopback Web `/wallet`. Member mở kết quả/lịch sử
  gọi POST QueryDR cho intent của mình; key bằng intentId, không nhận client
  amount, callback payload hoặc payment destination.
- Backend gọi endpoint QueryDR cố định qua HTTPS, không theo redirect, timeout10s.
  HMAC response, merchant/ref/amount/type01 và trạng thái payment00 phải hợp lệ.
  Query acknowledgement00 khác với payment status00; query chưa xác nhận hoặc
  non-success không ghi tiền. Lỗi provider giữ intent và trả503.
- Owner/current Member role/session kiểm trước HTTP call, sau call dưới lock trước
  mutation/replay; session expiry kiểm lại trước commit. LOCKED chỉ được xác minh
  nghĩa vụ cũ. IPN public giữ kiểm HMAC độc lập.
- Member Web giữ tab ví và mở VNPay trong tab thanh toán riêng với opener=null.
  Return gate chỉ trao intentId/ACK qua BroadcastChannel cùng origin rồi đóng;
  tab ví giữ session memory-only và tự QueryDR. Không persist access/refresh token
  hoặc chuyển credential sang tab provider/Return. Popup blocked không tạo intent.
- Cùng executor/ledger/commit-time invariant, payment identity toàn cục và chain
  event→receipt→audit→outbox. Query receipt dùng `applyVNPayQuery`; migration0024
  chỉ mở operation này cho system VNPay với topup target, giữ checksum0022/0023.
  QueryDR/IPN cùng transactionNo không credit hai lần. Không refund hoặc tạo Order.

## Giới hạn

Query chạy khi người dùng mở intent; không có worker poll nền. ReviewRequired và
failed/unconfirmed query cần đối soát, không tự đảo bút toán. Token browser memory
only; đóng/reload tab ví hoặc phiên hết hạn vẫn cần đăng nhập lại. Người dùng xem lại intent cũ qua lịch sử,
không đổi key/URL đã ký để ép một giao dịch chưa rõ thành công.

Nguồn: [VNPay QueryDR](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html).
Evidence/giới hạn tại [SESSION_STATE](../handoff/SESSION_STATE.md), setup tại
[WALLET_CHECKOUT](../features/WALLET_CHECKOUT.md).
