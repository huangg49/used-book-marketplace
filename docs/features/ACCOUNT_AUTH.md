# Đăng ký, xác minh email và khôi phục mật khẩu

11/10/2026 · `codex/auth-brevo-otp`, base `79f006d`.
Checkpoint: `feat(auth): add email OTP verification and Brevo delivery`.
Phạm vi: SRS1.1 FR-A01/A02/A04, UC-01; API chung và Member Vite web.
Không thay login/session contract, trạng thái hạn chế hoặc workflow giao dịch.

## Hành vi

| Lệnh public | Kết quả |
| --- | --- |
| `POST /auth/otp/register` | 202; cùng validation đăng ký, trả challenge UUID, OTP6 số hạn5 phút |
| `POST /auth/otp/request` | 202; email và purpose VerifyEmail/ResetPassword, cooldown60 giây |
| `POST /auth/otp/verify-email` | 204; challengeId + code6 số, kích hoạt tài khoản chưa xác minh |
| `POST /auth/otp/reset-password` | 204; challengeId + code + password, đổi mật khẩu/thu hồi phiên |
| `POST /auth/register` | 202; chuẩn hóa email, tên1–80 ký tự, mật khẩu10–128 ký tự, xác nhận quy tắc mô phỏng; chỉ MEMBER/PENDING_VERIFICATION |
| `POST /auth/verification/resend` | 202; ít nhất60 giây giữa hai liên kết, liên kết mới thay thế liên kết cũ |
| `POST /auth/verify-email` | 204; token hiện hành dùng một lần, hạn30 phút; kích hoạt tài khoản, chưa đăng nhập tự động |
| `POST /auth/forgot-password` | 202; tài khoản đã xác minh đủ điều kiện nhận liên kết hạn15 phút |
| `POST /auth/reset-password` | 204; token dùng một lần, thay hash mật khẩu, thu hồi mọi phiên, gửi thông báo thay đổi |

Đường dẫn nằm dưới `/api/v1`. OpenAPI0.33.0 là contract; generated types đi cùng
YAML. Đăng ký trùng không ghi đè tài khoản hoặc mật khẩu. Các yêu cầu email dùng
cùng phản hồi202 cho email không tồn tại, không đủ điều kiện, trùng hoặc cooldown.
Reset không kích hoạt lại tài khoản disabled và không gỡ LOCKED/RESTRICTED.
Liên kết sai/lặp/hết hạn trả400 `INVALID_AUTH_LINK`; giới hạn theo từng lệnh,
email/token hash và IP là5 yêu cầu/15 phút;429 không làm đổi quota login.

Web mặc định dùng OTP; năm endpoint liên kết cũ vẫn giữ cho client/email đã phát hành.
Mã được tạo bằng crypto.randomInt, giữ số0 đầu. Mỗi challenge tối đa5 lần sai,
trả400 OTP_INVALID hoặc OTP_ATTEMPTS_EXCEEDED; vượt hạn phải yêu cầu mã mới.
Phản hồi202 luôn có UUID mới và cùng cấu trúc/hạn300giây/resend60giây, kể cả
email không tồn tại, trùng, chưa đủ điều kiện hoặc cooldown. Challenge giả không
gửi thư, không trả ID của mã thật và không vô hiệu hóa mã thật trong cooldown.
Gửi mã mới hoặc liên kết mới vô hiệu hóa cả hai loại credential cùng purpose.

## Lưu trữ và bảo vệ

Migration mới `0017-account-recovery` thêm `auth_action_tokens`, `auth_mail_jobs`
và `auth_events`; không sửa migration đã áp dụng. Token32 byte ngẫu nhiên chỉ
lưu SHA-256 trong collection token. Payload gửi thư dùng AES-256-GCM; xóa payload
sau gửi/hủy/thất bại cuối cùng. Queue có lease30 giây, poll2 giây, tối đa10 job/poll
và8 lần thử với backoff. Final lease bị bỏ dở được đóng khi hết hạn. TTL dọn token
khi hết hạn và job một ngày sau expiry; không dựa vào TTL để quyết định token hợp lệ.

Migration0018-auth-otp thêm auth_otp_challenges (mutable, TTL và index user/emailHash
+purpose+createdAt). Chỉ lưu HMAC-SHA256 có khóa, ràng buộc UUID+purpose+code;
email được HMAC riêng, không lưu code/email thô. Queue giữ code trong payload
mã hóa rồi xóa sau gửi/hủy; worker hủy thư OTP đã hết hạn/đã dùng/đã thay thế.

Tạo user/token/OTP/mail/audit cùng transaction. Khóa user trước challenge,
đọc lại trạng thái/time $NOW trong transaction; đếm sai commit rồi mới trả lỗi
để tránh rollback làm mất ngân sách thử mã. Thành công đồng thời chỉ một lệnh
được dùng mã; queue lỗi rollback cả đổi mật khẩu và revocation/audit. Xác minh/reset/gửi lại khóa user rồi
đọc lại trạng thái và thời gian Mongo `$$NOW`. Reset ghi revocation vào session
trong transaction; login/refresh cùng khóa user và session. `auth_events` là
appendOnly với ba action Registered/EmailVerified/PasswordReset, không chứa
email, mật khẩu hoặc token. Không thêm token store hoặc cookie auth mới.

Email dùng origin cấu hình, không dùng Host/returnUrl từ request. Liên kết
`/register#verify=…` hoặc `/forgot-password#reset=…` giữ token ở fragment, không
đưa vào HTTP query/referrer. Token chưa dùng sống qua reload, được bỏ khỏi URL
sau thành công. Xác minh cần bấm nút, tránh trình quét email tự tiêu thụ token.

Web OTP chỉ giữ challenge UUID ở #verify-otp=… hoặc #reset-otp=… để sống qua
reload; fragment không chứa email/code/token phiên. Email/draft/code ở memory,
reload cần nhập lại email nếu muốn gửi lại. Challenge ID một mình không đủ xác
thực. Thành công xóa fragment; không thêm token store/session mới.

## Demo local

Nếu cần đổi tài khoản liên tục để demo, đặt `LOGIN_RATE_LIMIT_DISABLED=true`
trong `apps/api/.env` rồi khởi động lại API. Cờ chỉ có tác dụng khi
`NODE_ENV=development` và chỉ bỏ giới hạn đăng nhập; không bỏ kiểm tra mật khẩu,
trạng thái tài khoản, OTP, đăng ký hay khôi phục tài khoản. Mặc định vẫn giới hạn
5 lần/15 phút; môi trường test/production luôn giữ giới hạn dù cờ được bật.
Đặt lại `false` và khởi động lại API để bật giới hạn trở lại.

Sau khi nhận source, giữ mật khẩu/cấu hình Mongo riêng; chạy `pnpm db:migrate`
và `pnpm db:bootstrap` để thêm validator/index và quyền collection mới.
Không reset hoặc seed lại DB đang dùng.

Trong `apps/api/.env`:

```dotenv
AUTH_MAIL_PROVIDER=local
AUTH_WEB_ORIGIN=http://127.0.0.1:5186
AUTH_MAIL_LOCAL_DIR=.tmp/auth-mail
```

Thêm origin web vào `CORS_ORIGINS`, không ghi đè các origin đang dùng. Khởi động
lại API sau đổi env. Chạy web ở5186 bằng
`pnpm --filter @used-books/user-web exec vite --host 127.0.0.1 --port 5186 --strictPort`;
API dùng `pnpm dev:api`; hộp thư dùng `pnpm auth:mailbox` ở
`http://127.0.0.1:3186/`. Nếu dùng `pnpm dev:user` mặc định5174 thì đổi origin và
CORS tương ứng. Custom mail directory nên là đường dẫn tuyệt đối và truyền cùng
`AUTH_MAIL_LOCAL_DIR` cho viewer.

1. Đăng ký trên web; mở hộp thư local và sao chép mã6 số trong thư xác minh.
2. Nhập mã, bấm Xác minh email; quay lại đăng nhập với mật khẩu đã chọn.
3. Yêu cầu quên mật khẩu; nhập mã trong thư mới và hai ô mật khẩu rồi đăng nhập lại.
4. Mật khẩu cũ/phiên cũ và mã/liên kết đã dùng đều bị từ chối.

HTML thư nằm trong `apps/api/.tmp/auth-mail`, bị Git ignore; có địa chỉ nhận và
mã/liên kết riêng nên không chia sẻ/commit cả thư. Viewer chỉ bind127.0.0.1, kiểm
Host/Origin/Sec-Fetch-Site, chỉ GET/UUID HTML, no-store/no-referrer/frame-deny.
Không public viewer hoặc expose endpoint thư trên API. Local không gửi Internet.

## Gửi thư thật bằng Brevo

Chọn AUTH_MAIL_PROVIDER=brevo; cấu hình BREVO_API_KEY, BREVO_SENDER_EMAIL
(sender đã xác minh), BREVO_SENDER_NAME và AUTH_MAIL_ENCRYPTION_KEY trong
apps/api/.env riêng. Cho phép IP máy/API trên Brevo Security; thay IP cần kiểm
tra lại. Key chỉ backend, không vào client/log/Git. Key đã chia sẻ cần xoay trong
tài khoản và cập nhật env riêng. Khởi động lại API sau sửa cấu hình. Không
tự fallback local khi Brevo lỗi: job retry theo lease/backoff để không báo gửi
nhầm kênh. HTTP201 là provider nhận, không chứng minh inbox đã nhận.

Gọi API HTTPS cố định /v3/smtp/email, timeout8giây; JSON headers.idempotencyKey
là UUID job (Brevo window30phút), duplicate_parameter được coi là replay đã nhận.
Retry lâu hơn window không có đảm bảo exactly-once của provider; không tạo mã
mới khi retry. [Brevo API](https://developers.brevo.com/docs/send-a-transactional-email),
[idempotency](https://developers.brevo.com/docs/heterogenous-versions-batch-emails).
QA luôn ép provider local, chỉ replica set/DB _test; test không gửi email thật.
Lượt test Internet chỉ dùng thư mẫu được chủ dự án cho phép, không tạo/đổi tài khoản.
Trạng thái provider và inbox của phiên này ghi trong evidence.

## Provider Resend tùy chọn

Chọn `AUTH_MAIL_PROVIDER=resend`, cấu hình backend-only `RESEND_API_KEY`,
`AUTH_MAIL_FROM` với sender đã xác minh, `AUTH_MAIL_ENCRYPTION_KEY` riêng ít nhất32
ký tự ngẫu nhiên và HTTPS `AUTH_WEB_ORIGIN`. Giữ key ổn định khi còn job pending;
xoay key cần xử lý queue theo quy trình riêng. Timeout8 giây, idempotency theo job
ID; retry không tạo token mới. Không gửi key qua chat hoặc client env.
Production mặc định disabled và cấm local;503 `MAIL_UNAVAILABLE` được UI giải thích.
Resend/domain/inbox Internet chưa kiểm chứng, không là gate đã đạt.

## UI và bằng chứng

Ba tờ giấy/texture/font, shuffle850ms và login success flow giữ nguyên. Register
có checkbox quy tắc, validation rõ và gửi lại; recovery có request/reset/success;
lỗi giữ giá trị. Đang gửi khóa submit, live status/error thông báo, heading nhận
focus sau đổi trạng thái, tờ dưới inert không bị focus. Draft chỉ ở memory;
password đăng ký được bỏ sau thành công. Laptop1536×700 không thêm scroll ở
form bình thường; mobile/error/chữ lớn được scroll tự nhiên.

OTP dùng một input numeric/one-time-code cho nhập/dán sáu số; label/hint và
aria-invalid rõ. Recovery hai ô mật khẩu cùng hàng desktop, stack dưới400px;
compact height≤800px giữ đủ OTP/form trong1536×700, không khóa scroll mobile/error.

[Báo cáo OTP hiện hành](../../.impeccable/review/auth-otp/README.md) và
[bằng chứng link trước đó](../../.impeccable/review/auth-registration/README.md) ghi checks,
capture và giới hạn. QA write/race chạy replica set57017, database `_test` riêng;
không chạy harness trên DB local chính. Native/RN/Flutter UI, physical mobile,
NVDA/human acceptance, Resend thật và toàn bộ E2E nghiệp vụ còn NOT RUN.
READINESS không đổi. Endpoint change-password khi đang đăng nhập là phạm vi khác.
