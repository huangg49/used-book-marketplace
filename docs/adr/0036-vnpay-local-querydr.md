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
- Tích hợp main ngày15/10 dùng migration0027 hợp nhất receipt/audit với pointId
  của point administration. Các migration đã áp dụng của hai nhánh giữ nguyên;
  validator cuối giữ đúng một target và cặp system principal/operation, gồm
  QueryDR/IPN và DirectDelivery settlement. Nâng cấp từ mỗi nhánh được kiểm riêng.

## Cửa sổ thanh toán5phút — 19/10/2026

Theo yêu cầu chủ dự án, yêu cầu VNPay mới có hạn thanh toán cố định5phút kể từ
transaction tạo yêu cầu khi bấm **Tiếp tục thanh toán**. URL ký `vnp_ExpireDate`
theo GMT+7; replay cùng key/body giữ nguyên intent, URL và hạn gốc. Yêu cầu cũ
giữ `expiresAt` đã lưu (có thể15phút), không sửa URL hay dữ liệu append-only.

- `TopupIntent` trả `expiresAt` và `serverTime` để client đếm ngược theo server;
  simulator không có hạn VNPay và trả `expiresAt: null`.
- Hết hạn, Pending/Processing thành **Cancelled**. Worker Order hiện có quét
  theo chu kỳ tối đa60giây; đọc/list yêu cầu và tạo yêu cầu mới cũng bắt kịp
  trạng thái quá hạn. Việc hủy không cần tab ví/VNPay đang mở hoặc browser timer.
- Deadline command dùng cùng owner/topup lock và executor; ghi event nội bộ
  `VNPayExpiry-v1`, receipt `expireVNPayTopup`, audit/outbox để đối soát, không ghi
  journal, không đổi số dư và không thêm dòng lịch sử giao dịch ví.
- IPN/QueryDR có chữ ký chứng minh đã trả trong cửa sổ vẫn được credit đúng một
  lần kể cả callback đến sau khi hủy. Success có thời điểm trả từ hạn đã ký trở
  đi vào ReviewRequired, không tự credit/refund. Cạnh tranh expiry/IPN/QueryDR
  giữ nguyên transaction identity toàn cục và invariant ledger.
- Cancelled vẫn cho QueryDR để đối soát; provider lỗi không che trạng thái hủy
  đã lưu. Không coi return/browser close hoặc timeout là bằng chứng trả tiền.

Migration cộng thêm `0032-vnpay-topup-expiry` mở enum/đúng system operation và
index quét hạn; không sửa checksum migration cũ. Máy đang chạy cần
`pnpm db:migrate` rồi khởi động lại API và Order worker cùng source. Không cần
reset/reseed hoặc đổi app role vì không thêm collection.

Đối chiếu [đặc tả VNPay](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html)
về `vnp_ExpireDate`, `vnp_PayDate` và IPN; các quy tắc5phút/Cancelled là chính sách
Lật lại, không là cam kết hệ thống VNPay tự đóng tab trình duyệt.

## Giới hạn

QueryDR chạy khi người dùng mở intent; không có worker poll VNPay nền. Worker
hết hạn ở trên chỉ hủy yêu cầu quá hạn trên máy chủ. ReviewRequired và
failed/unconfirmed query cần đối soát, không tự đảo bút toán. Token browser memory
only; đóng/reload tab ví hoặc phiên hết hạn vẫn cần đăng nhập lại. Người dùng xem lại intent cũ qua lịch sử,
không đổi key/URL đã ký để ép một giao dịch chưa rõ thành công.

Nguồn: [VNPay QueryDR](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html).
Evidence/giới hạn tại [SESSION_STATE](../handoff/SESSION_STATE.md), setup tại
[WALLET_CHECKOUT](../features/WALLET_CHECKOUT.md).
