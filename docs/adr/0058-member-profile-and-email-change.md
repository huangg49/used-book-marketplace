# ADR0058: Hồ sơ Member, avatar riêng tư và xác minh email mới

01/11/2026. Chủ dự án duyệt gói hồ sơ web/RN, Admin account controls và cart;
gói này thực hiện FR-A05, không mở rộng giao nhận hoặc thay READINESS.

- Hồ sơ riêng ở `/me/profile`, chỉ current MEMBER owner. LOCKED/RESTRICTED vẫn
  sửa thông tin của mình; quyền này không mở giao dịch/funding mới. Tên lưu ở
  `users.displayName`; version/contactPhone/avatarId mới là optional cho dữ liệu
  cũ, đọc version mặc định1. Không backfill, sửa snapshot hoặc tự cấp role/status.
- Commands qua executor với current session/role trước replay, user lock và
  expectedVersion. Receipt/audit chỉ ID/version/state; không chép tên, số điện
  thoại, email, mật khẩu, OTP, signed URL hoặc ảnh vào audit/outbox.
- Avatar đi qua upload riêng tối đa2MB JPEG/PNG/WebP, kiểm bytes/hash/actual format,
  dùng pipeline Sharp hiện có để bỏ EXIF rồi cắt vuông256px. Kho Supabase private
  hiện có; chỉ owner có signed read, recheck auth sau I/O. Upload Ready chưa đổi
  avatar; chỉ Save profile mới attach. Bỏ/thay ảnh không sửa ảnh trên giao dịch.
- Tối đa3 Pending/Ready còn hạn; upload dùng quota/slot hiện có và lease120s.
  Pending/Ready hết hạn24h và ảnh Retired được worker media dọn có kiểm tra lại
  pointer dưới user→asset locks. Deleting bền vững, không attach lại, xóa object
  ngoài transaction; lỗi kho giữ job để retry. Không TTL xóa metadata trước blob.
- Đổi email cần mật khẩu hiện tại, unique normalized email và mã6số HMAC có hạn
 5phút/5lần sai/60giây resend. Mail mã hóa dùng delivery queue hiện có; phản hồi
  gửi mã chung, không xác nhận email của tài khoản khác có tồn tại hay không.
- Chỉ confirm hợp lệ mới đổi email nguyên tử; ràng buộc owner, email cũ và
  fingerprint password hash. Giữ current session, thu hồi phiên khác và reset
  link/OTP cũ, gửi cảnh báo đến email cũ. Tên/ID/snapshot giao dịch không đổi.
- Mật khẩu là bằng chứng quyền hiện tại, không thuộc business payload hash của
  yêu cầu đổi email. Sau lỗi credential, người dùng có thể nhập lại mật khẩu;
  key/email/expectedVersion cũ vẫn giữ. Không lưu password trong pending intent;
  sau remount phải nhập lại bằng chứng hiện tại. Không giữ password/OTP trong
  disk/token storage. Intent trong memory xóa khi đổi identity; late ACK không
  đổi phiên mới.
- HTTP408/429 generic/5xx/network giữ intent. Riêng AvatarQuotaExceeded và
  EMAIL_CHANGE_COOLDOWN được từ chối sau receipt lookup nên có thể sửa nội dung.
  Không tự thay version/key để ép lệnh thành công hoặc báo thành công trước ACK.

Migration0047 thêm trường/collection/target accountId; không sửa checksum migration
cũ. Factory dựng migration từ registry đã load để tránh import cycle; định nghĩa
và checksum của0047 giữ nguyên qua sửa cách khởi tạo trong QA. Setup phải migrate
và cập nhật app role theo START_HERE trước chạy source mới trên DB của người nhận.
Phiên này chỉ dùng QA replica set/DB `_test`; chưa áp dụng DB chính.
