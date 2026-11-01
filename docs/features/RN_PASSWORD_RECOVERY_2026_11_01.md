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
| OTP Brevo + reset + login trên UI | **PENDING người dùng** tự nhập OTP và mật khẩu QA; chưa tính PASS từ test API |
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

## Lượt QA thật đang chờ

Runner riêng ignored `.tmp/rn-recovery-qa.mjs` dùng createTestApi với DB ngẫu nhiên
`ops_browser_<hex>_test`, không DB chính. RN web export phục vụ ở8087; API3009,
fake storage3010. Chỉ recipient đã được owner duyệt trong file cấu hình riêng,
Brevo tối đa4lần/20phút, không log key/email/OTP/password. Mail có nhãn QA, chỉ
đổi mật khẩu user tổng hợp. Chưa gửi thư khi ghi checkpoint này.

Người dùng cần tự nhập Gmail đã dùng ở lượt Brevo trước, lấy OTP, chọn mật khẩu
chỉ cho QA và tự submit; đây là handoff bắt buộc theo quy tắc điều khiển trình
duyệt khi đổi credential. Sau đó kiểm Login bằng mật khẩu mới và thư cảnh báo.
Không yêu cầu gửi OTP/password qua chat. Chưa xác nhận Inbox hoặc login mới thì
giữ PENDING. Runner tự dọn DB/user/role khi dừng hoặc hết20phút; cleanup chưa
được xác nhận tại checkpoint này. Các dịch vụ QA cần được đối soát khi tiếp tục.

Ảnh local trong `.tmp/rn-recovery-qa/`: recovery-empty-320.png và
recovery-code-synthetic.png chỉ có form trống/email tổng hợp; không commit ảnh
hoặc cấu hình riêng. Không chụp form chứa email thật/OTP/mật khẩu.

Sau handoff: đối soát auth event, thu hồi access/refresh cũ, queue Sent/payload
erased và báo cáo người dùng; dừng/dọn runner rồi cập nhật kết quả thực tế.
Không mở PR trước yêu cầu gom gói của owner; không coi checklist này là release.
