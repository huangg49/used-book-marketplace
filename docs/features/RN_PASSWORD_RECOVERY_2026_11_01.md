# Khôi phục mật khẩu trên React Native — 01/11/2026

Nhánh `codex/rn-password-recovery`, base `39f9b023`.
Checkpoint subject: `feat(rn): add OTP password recovery with safe failure handling`.
Owner duyệt triển khai; giữ local, chưa push/PR/merge/deploy.

## Hành trình và giới hạn

Trước thay đổi, nút Quên mật khẩu trong RN Login chỉ hiện thông báo liên hệ quản
trị. Nay Login → `/forgot-password` → email → OTP sáu số và hai ô mật khẩu →
ACK204 → chủ động về Login. Giữ `returnBook` UUID để tiếp tục ngữ cảnh sách.
Người đã đăng nhập được chuyển về Account; reset không tự tạo phiên đăng nhập.

- [Route](../../apps/mobile-react-native/src/app/forgot-password.tsx) chỉ compose
  screen, kiểm query và điều hướng; không nhận redirect URL tùy ý.
- [Screen](../../apps/mobile-react-native/src/features/auth/forgot-password-screen.tsx)
  dùng Screen/BackAction/TextField/Button/Notice và brand hiện hành; có scroll,
  keyboard avoidance, label, focus OTP, trạng thái gửi và lỗi theo field.
- [Flow](../../apps/mobile-react-native/src/features/auth/recovery-model.ts)
  chặn double tap; dùng thời gian tuyệt đối cho cooldown/expiry; bỏ late ACK sau
  blur; mã sai cho sửa, vượt lần thử yêu cầu challenge mới. API quyết định expiry.
- [Transport](../../apps/mobile-react-native/src/features/auth/auth-api.ts)
  dùng `publicRequest` của session client chung, OTP request purpose ResetPassword
  và reset hiện có. Không đổi backend, contract, session storage hoặc schema.

OTP/password/confirmation chỉ ở memory của screen, xóa khi đổi challenge, rời
màn hình hoặc tới kết quả. Chỉ UUID challenge vào query; reload không giữ email
đã nhập. Challenge khôi phục không biết giờ cấp nên không tự đặt thêm hạn hiệu
lực; cooldown60giây bảo thủ, validation cuối vẫn ở API. Các phản hồi202 không
phân biệt email tồn tại/đủ điều kiện và không tự chứng minh thư đã gửi.

API reset không có command receipt/idempotent replay. Nếu network/timeout/5xx
sau reset, không tự gửi lại: xóa challenge khỏi route, báo kết quả chưa xác định
và hướng về Login thử mật khẩu mới trước. Mất ACK gửi mã thì bỏ challenge cũ,
chờ cooldown rồi yêu cầu mã mới. Không đổi key/version để ép thành công.

## Kiểm chứng đã chạy

Source là base trên cộng thay đổi của checkpoint này. Windows, Node24.22.1
(repo yêu cầu ≥24.15.0); tool lấy từ dependency đã cài, không nâng dependency.
pnpm trên máy11.25.0 khác packageManager11.19.0; lượt này chạy CLI/checker bằng
Node trực tiếp, không install hoặc đổi lockfile.

| Kiểm tra | Kết quả và phạm vi |
| --- | --- |
| RN Vitest4.1.2 | **PASS184/184**,25file;20ca recovery mới, còn lại regression |
| RN TypeScript6.0.3 | **PASS** `tsc --noEmit` |
| RN ESLint src | **PASS**,0error;1warning có sẵn `myReceivedAt` trong exchange-shipping-card.tsx, không sửa ngoài phạm vi |
| Expo57.0.24 web export | **PASS**,32route gồm forgot-password; exit0 nhưng CLI có thông báo forcefully exiting; không là native runtime |
| API OTP E2E Vitest4.1.11 | **PASS19/19** toàn file otp-auth.e2e-spec.ts; Mongo8 rs-test57017, database `latlai_rn_recovery_20261101_test`; mail local, storage fake, không gọi provider |
| Expo web UI với HTTP/Mongo thật | **PASS** Login→recovery, email rỗng, email tổng hợp không tồn tại→ACK/form OTP/cooldown, reload chỉ giữ UUID, Back→Login giữ returnBook;320px không tràn ở form email |
| OTP Brevo + reset trên UI | **PASS** owner tự nhập OTP/mật khẩu QA, báo hoàn tất và nhận thư thông báo; audit có1PasswordReset,2job Sent/payload erased,2provider201 |
| Login mới sau reset trên UI | **NOT CONFIRMED**: chưa thấy session mới khi đối soát; đã hỏi owner, chưa có xác nhận riêng trước khi phiên QA hết hạn |
| Android/iOS/TalkBack/ARM | **BLOCKED/NOT RUN**: native runtime đã bị automatic policy block ở lượt trước; không thử đi vòng bằng cách mở Metro khác |
| Remote CI / nghiệm thu UX độc lập | **NOT RUN**, chưa push; không đóng READINESS |

Lệnh tương ứng: `vitest run`, `tsc --noEmit`, `eslint src`,
`expo export --platform web --output-dir dist` trong workspace RN;
API `vitest run --config vitest.config.e2e.ts test/otp-auth.e2e-spec.ts` với QA
env riêng. Hai log500 synthetic queue failure là ca rollback chủ động của test,
không phải lỗi ngoài dự kiến. Test API có leading zero, wrong/expired/purpose,
giới hạn lần sai, reset/refresh/login race, giữ LOCKED, disabled sau cấp mã và
rollback khi durable queue hỏng. Không thay test để che lỗi.

Typed route `.expo/types/router.d.ts` đang được repo track, được sinh lại bằng
`setupTypedRoutes` của CLI57.0.26 đã cài; không sửa tay và không mở dev server.
Export có route mới nhưng không tự cập nhật file type ở lượt này.

## Lượt QA thật và phần còn chờ

Runner riêng ignored `.tmp/rn-recovery-qa.mjs` dùng createTestApi với DB ngẫu nhiên
`ops_browser_<hex>_test`, không DB chính. RN web export phục vụ ở8087; API3009,
fake storage3010. Chỉ recipient đã được owner duyệt trong file cấu hình riêng,
Brevo tối đa4lần/20phút, không log key/email/OTP/password. Mail có nhãn QA, chỉ
đổi mật khẩu user tổng hợp. Lượt thật chạy trên source `7ef57f12`.

Owner tự nhập credential và báo “Ok rồi, nó gửi thông báo về mail luôn”. Không
đọc/ghi OTP hoặc mật khẩu của owner. Audit độc lập read-only xác nhận đúng1event
PasswordReset, user còn ACTIVE,2phiên cũ revoked, không còn phiên active lúc
đối soát. HTTP cũ: password401, access401, refresh401. Hai job Sent và encrypted
payload rỗng,2HTTP201 từ Brevo. Owner xác nhận nhận thư; folder Inbox/Spam
**chưa được báo riêng**, không tự cộng thành Inbox PASS.

Hai loại thư trong source là OTP ResetPassword và PasswordChanged. Trường
`warning` trong runner journal dùng tokenId=null nên không phân loại được hai
loại này; không dùng nó để đếm cảnh báo. `.tmp/rn-recovery-qa/audit.json` giữ số
đối soát không chứa PII/credential. Chưa thấy session mới nên đã hỏi riêng owner
về bước Login; không suy Login PASS từ reset hay thư đã nhận.

Runner hết20phút và kết thúc với status `BLOCKED_TIMEOUT`, exit0, cleanup PASS.
Không đổi nhãn tổng này thành full journey PASS: reset/mail/session denial có
evidence riêng ở trên; Login mới còn chưa xác nhận. Kiểm read-only sau teardown
PASS không còn DB/user/role browser QA. API3009, fake storage3010, static8087
đã đóng; Docker mongo-test đã dừng và không còn listener57017. Replica set dùng
tmpfs nên dữ liệu E2E QA cũng không được giữ qua lần stop này. DB/env/bucket
chính giữ nguyên. Không cần nhập tiếp ở URL QA đã hết hạn.

Ảnh local trong `.tmp/rn-recovery-qa/`: recovery-empty-320.png và
recovery-code-synthetic.png chỉ có form trống/email tổng hợp; không commit ảnh
hoặc cấu hình riêng. Không chụp form chứa email thật/OTP/mật khẩu.

Tiếp theo khi cần nghiệm thu trọn hành trình: tạo phiên QA riêng mới, owner tự
đổi và đăng nhập bằng mật khẩu mới trong cùng phiên; không dùng lại credential
QA cũ sau teardown. Native/UI người thật độc lập vẫn là gate khác.
Không mở PR trước yêu cầu gom gói của owner; không coi checklist này là release.

### Lượt thứ hai đang chờ owner

Owner xác nhận lượt trước mới đổi mật khẩu/nhận thư, sẽ thử Login. Vì fixture cũ
đã dọn, đã mở fixture mới với `.tmp/rn-recovery-qa-2.mjs` (ignored), source sản
phẩm `7ef57f12` không đổi. Cùng QA rs-test57017/DB ngẫu nhiên `_test`, API3009,
storage fake3010, static8087. Form trống mở ở tab9. Tối đa4send/40phút để đủ
thời gian handoff; chưa có kết quả hoặc cleanup lượt này.

Runner lượt2 ghi HTTP metadata không body/header: reset204 rồi Login200 và
session có createdAt sau PasswordReset event. Phân loại mail từ kind trước
drain, không suy từ tokenId. Chặn tác động ngoài recipient được duyệt như lượt1.
Journal riêng `.tmp/rn-recovery-qa-2/result.json`; không ghi đè kết quả lượt1.
Owner cần reset lại rồi Login ngay trong cùng phiên, chỉ dùng credential QA.
