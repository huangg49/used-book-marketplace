# Nạp ví VNPay sandbox và thanh toán mua bán

Ngày 14/10/2026 · nhánh `codex/vnpay-wallet-listing-fees`, base `7be68a4`.
Phần phí đăng bài14/10 đã được thay bởi [ADR0040](../adr/0040-free-listings-five-active-cap.md)
theo chủ dự án19/10: đăng miễn phí, tối đa5 bài hiển thị/chờ admin duyệt mỗi tài khoản.
Người mua dùng ví trả tiền sách; hoàn tất chuyển tiền cho người bán. VNPay sandbox
dùng nạp ví, không có khoản cọc mua bán trả lại khi hoàn tất.

## Hành vi

- Gửi bài Draft/Rejected và sửa bài Approved miễn phí, không cần nạp ví. Tối đa5
  bài Approved Visible hoặc PendingReview, trade Available/Reserved, chưa gỡ/lưu
  trữ. Approved Hidden không tính; mở lại/sửa bài ẩn phải còn chỗ. Lỗi409
  `ListingLimitReached` giữ nguyên dữ liệu và key/body để thử lại sau khi có chỗ.
  Phí đã giữ trước chính sách mới vẫn được quyết toán khi duyệt hoặc hoàn khi từ
  chối, đúng một lần; không sửa/xóa bút toán lịch sử. Bài cũ có phí đang giữ vẫn
  cần quyết định duyệt/từ chối trước khi bỏ/gỡ để giữ đường xử lý khoản tiền.
- Tạo Order mặc định: ghi Order, snapshot, commitment, đóng reservation chat và
  chuyển tổng báo giá từ ví sang OrderHold nguyên tử. Thiếu tiền không tạo Order
  hoặc thay đổi sách/chat. Receipt đầu tiên là PendingSellerConfirmation/version2;
  commitment/context vẫn version1. Các đơn AwaitingPayment lịch sử vẫn có lệnh pay.
- Tổng giữ DirectDelivery là P+S theo ADR0016, không chỉ P. Ví dụ sách50.000đ,
  ship30.000đ: cần80.000đ. Khi hoàn tất, seller nhận77.500đ gồm tiền sách trừ
  commission5% và hoàn ứng ship; nền tảng nhận2.500đ. Bài đăng mới không thu phí.
  Hủy hợp lệ trước acceptance hoàn tổng giữ về ví; không gọi refund này sau acceptance.
  Giữ quy trình delivery/inspection72h/settlement hiện có và các gate READINESS.
- VNPay 2.1.0: tạo URL sandbox có số tiền nguyên đồng nhân100, giờ GMT+7 và hạn5phút
  từ **Tiếp tục thanh toán** theo [ADR0036](../adr/0036-vnpay-local-querydr.md).
  Hạn cũ giữ snapshot đã ký; retry cùng key/body không gia hạn. Hết hạn tự hủy
  Pending/Processing thành Cancelled, không ghi dòng lịch sử giao dịch hoặc đổi
  số dư. Giữ event/receipt/audit nội bộ để đối soát; worker vẫn chạy khi đóng tab.
  IPN kiểm HMAC-SHA512, merchant, mã intent, số tiền, thời gian và giao dịch provider.
  Xác minh lại trước replay; ghi event/credit/receipt/audit/outbox cùng transaction.
  TransactionNo không được dùng để nạp một ví khác. Hai callback đồng thời chỉ ghi
  có một lần. Callback đến trễ nhưng chứng minh đã trả trước hạn vẫn nạp ví ban
  đầu đúng một lần; trả từ hạn đã ký trở đi vào ReviewRequired, không credit.
  Không tự tạo/thanh toán Order.
- VNPay mở trong tab riêng, được tạo ngay khi bấm nạp, để tab ví giữ phiên
  memory-only. Tab thanh toán bỏ opener trước khi sang provider. Return gate
  trước Dashboard auth chỉ gửi thông báo intentId qua BroadcastChannel cùng
  origin, nhận ACK rồi đóng tab. Tab ví truy vấn QueryDR để hiển thị credit;
  callback/status URL không ghi tiền và không truyền token giữa các tab.
  Browser chặn popup thì báo lỗi trước khi tạo intent; mất ACK vẫn retry cùng
  key/body. Nếu tab ví đã đóng/reload hoặc phiên thật hết hạn, phải đăng nhập
  lại và xem lịch sử. Raw provider/bank query được gỡ khỏi Return URL.
- Localhost dùng QueryDR: trang kết quả gọi `POST /me/topups/{topupId}/vnpay-query`
  với `Idempotency-Key` bằng topupId. Backend kiểm owner/session/role, truy vấn
  VNPay qua HTTPS POST, xác minh HMAC-SHA512 theo chuỗi pipe của QueryDR, merchant,
  reference, amount và payment type01. Chỉ query status00 có evidence hợp lệ mới
  vào transaction ghi credit; query pending/non-success giữ trạng thái hiện tại.
  Kiểm lại owner/session trước mutation/replay và session trước commit. Receipt/
  audit dùng `applyVNPayQuery`; chạy đồng thời IPN vẫn chỉ có một journal/credit.
- Lỗi ghi ledger giữ intent Pending, trả IPN99 để provider retry. Kết quả mâu thuẫn,
  giao dịch thành công thứ hai hoặc thời gian bất hợp lệ chuyển ReviewRequired;
  không tự tạo tiền hoặc đảo bút toán đã ghi. Mỗi intent giữ tối đa128 event.

## Cấu hình local

Đăng ký merchant theo [VNPay sandbox](https://sandbox.vnpayment.vn/devreg/).
Trong `apps/api/.env` riêng của máy, điền `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`,
`VNPAY_RETURN_URL` là URL Member Web `/wallet`, rồi bật `VNPAY_SANDBOX_ENABLED=true`.
Secret chỉ ở server, không đưa vào VITE/EXPO_PUBLIC, Git hoặc chat. Ví dụ cấu hình
không chứa credential nằm trong [API env example](../../apps/api/.env.example).

Để chạy hoàn toàn trên máy dev, đặt `VNPAY_RETURN_URL=http://localhost:5174/wallet`
trong API env và `VITE_API_BASE_URL=/api/v1`,
`LATLAI_DEV_API_ORIGIN=http://localhost:3000` trong Web `.env.local`.
Chạy `pnpm dev:api` và `pnpm dev:user`, mở `http://localhost:5174/wallet`.
QueryDR là request đi từ backend tới VNPay, nên không cần ngrok/IPN public;
cần Internet và merchant sandbox hợp lệ. Mỗi developer có cấu hình backend riêng,
nhận credential qua kênh riêng theo [ENV_HANDOFF](../handoff/ENV_HANDOFF.md).

IPN vẫn có thể dùng khi có backend public: đăng ký
`https://<API có thể truy cập>/api/v1/payments/vnpay/ipn` với VNPay.
Server VNPay không gọi được localhost; QueryDR giải quyết nhánh dev không tunnel.
Return URL được cấu hình ở server, không cho client chọn redirect. Chỉ cho HTTP
loopback hoặc HTTPS, không query/fragment/userinfo. Sandbox bị chặn ở production.

Có thể dùng một tunnel tới Member Web cổng5174 cho cả Web và callback. Trong
`apps/user-web/.env.local`, đặt `LATLAI_DEV_ALLOWED_HOST` là hostname tunnel,
`LATLAI_DEV_API_ORIGIN=http://localhost:3000` và
`VITE_API_BASE_URL=/api/v1`. Proxy `/api` và `/socket.io` chuyển về
API local trên cùng origin trang đang mở; localhost không phụ thuộc tunnel.
Return là `https://<hostname-tunnel>/wallet`, IPN là
`https://<hostname-tunnel>/api/v1/payments/vnpay/ipn`. Host/key thật giữ ngoài Git.
Giữ Mongo/API/Web/ngrok hoạt động; đổi URL thì cập nhật env và IPN với VNPay.
Nên dùng dev domain cố định đã cấp trong ngrok Dashboard → Domains và chạy
`ngrok http 5174 --url https://<dev-domain>` để các lần bật lại giữ cùng URL.
Sau đổi Return URL, restart API trong terminal đang chạy để nạp cấu hình mới;
URL đã ký của intent cũ vẫn giữ snapshot ban đầu. Không tạo lượt nạp mới chỉ
vì trang Return lỗi: đọc lịch sử ví và đối chiếu Merchant Admin/IPN trước.
Đăng nhập SIT theo thông tin VNPay cấp để đăng ký/kiểm tra IPN theo hướng dẫn
của portal. HTTP200 với `RspCode=97` khi gọi IPN không chữ ký chỉ chứng minh route
public tới API và từ chối callback không hợp lệ; không là giao dịch provider PASS.

Chạy `pnpm db:migrate`, build/restart API và Order worker cùng source. Migration
0022 thêm validator/index/reference account;0024 mở đúng operation QueryDR cho
system principal VNPay;0027 hợp nhất receipt/audit với point administration từ
main sau khi áp dụng các migration của cả hai nhánh;0032 thêm Cancelled/deadline
event và index quét hạn VNPay. Giữ pointId và đúng một
target, cặp principal/operation VNPay và DirectDelivery worker. Không sửa checksum
migration cũ hoặc reset/seed database.
Máy nhận bản hợp nhất từ nhánh ví cũ cần chạy `pnpm db:bootstrap` trước
`pnpm db:migrate` để bổ sung quyền collection N4/exchange cho app và migrator.
Giữ credential hiện có trong env; không seed lại hoặc đổi mật khẩu.
Trong phiên15/10, theo yêu cầu chạy localhost, credential/Return env đã cấu hình và
0024 đã áp dụng trên máy chủ dự án; owner restart terminal API để nhận env mới.

`LISTING_SUBMISSION_FEE_VND` không còn hiệu lực; server luôn trả phí bài mới0.
`ORDER_CHECKOUT_MODE` mặc địnhWallet; Unpaid giữ tương thích lịch sử ở server.
Member request không thể chọn profile checkout. Suite `wallet-checkout` cố ý
truyền giá trị phí cũ20000 để kiểm vẫn miễn phí, hạn mức và xử lý phí lịch sử.
User Web CI chạy cả các browser suite lịch sử và
`pnpm --filter @used-books/user-web test:wallet:browser` để kiểm nạp ví mặc định.

## Phạm vi sandbox và kiểm chứng

Tiền vẫn là mô phỏng đồ án; VNPay sandbox dùng nguồn clearing hữu hạn100triệu
đã có trong ADR0018. Không nạp thêm capital, không xử lý tiền thật hoặc rút tiền.
Hoàn phí và hoàn đơn là ledger credit về ví, không gọi API refund ngân hàng.
QueryDR chạy khi Member mở/kiểm tra một yêu cầu nạp, không có worker poll nền.
ReviewRequired không tự giải quyết; query non-success không tự đánh dấu Failed.
Merchant sandbox thật đã có probe read-only QueryDR/chữ ký/amount PASS; full
giao dịch tạo→thanh toán→credit trên merchant thật và human review chưa xác nhận.

Nguồn protocol: [PAY/IPN](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html)
và [phân biệt Return/IPN](https://sandbox.vnpayment.vn/apis/docs/faqs/),
[QueryDR](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html),
[ADR0036](../adr/0036-vnpay-local-querydr.md).

Evidence thực chạy được ghi trong mục VNPay của [SESSION_STATE](../handoff/SESSION_STATE.md).
User Web có trang ví và xác nhận tổng báo giá trước thanh toán. Luồng mua direct
hiện yêu cầu Buyer gửi địa chỉ/báo giá trong chat trước; Seller chọn Buyer, nhập
giá đã thỏa thuận và tạo Order unpaid. Listing chỉ được reserve khi Order được
tạo; Buyer xem tổng đã chốt rồi mới thanh toán. RN chỉ cập nhật parser/nhãn
history tương thích, chưa thêm giao diện nạp VNPay native.
Human money/permission review, remote CI, merchant sandbox thật và release giữ
nguyên gate; code/test không thay nghiệm thu đó.
