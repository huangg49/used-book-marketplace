# Hồ sơ Member — 01/11/2026

Gói local `codex/member-profile`, base `2d051c0a`, subject
`feat(profile): connect member profile avatar and verified email changes`.
Thực hiện FR-A05/AC-02 theo [SRS](../SRS_V1_1.md) và
[ADR0058](../adr/0058-member-profile-and-email-change.md). Chưa publish.

| Vai trò/entry | Điều kiện/command | Kết quả/bước tiếp |
|---|---|---|
| Member web: menu tài khoản → Hồ sơ & bảo mật | Current MEMBER/session; sửa tên, điện thoại, chọn/bỏ ảnh rồi Lưu | Profile version mới; session đọc lại cùng owner; Back có xác nhận dữ liệu chưa lưu |
| Member RN: Tài khoản → Sửa hồ sơ và email | Cùng API/helper; keyboard/safe area, Back và gesture dirty | Kết quả tại màn; trở lại Tài khoản không tạo lần ghi mới |
| Member đổi email trong hồ sơ | Mật khẩu hiện tại → gửi mã → nhập OTP5phút | Chỉ confirm mới đổi email; giữ phiên hiện tại, thu hồi phiên khác; báo email cũ |
| Member LOCKED/RESTRICTED | Vẫn bảo trì hồ sơ của mình | Không cấp thêm role, quyền giao dịch hoặc mở nghĩa vụ mới |

Mất ACK giữ key/body/version qua Back/remount. Các quyết định đối nghịch chờ
receipt cũ. Password không lưu trong pending store; thử lại yêu cầu email phải
nhập lại mật khẩu hiện tại. Đổi identity xóa intent, late ACK không tác động
phiên mới. Đọc hồ sơ đồng bộ lại SessionClient để tên/email nhất quán khi trở lại.

## Source và môi trường

- [API](../../apps/api/src/modules/profile/member-profile.service.ts),
  [controller](../../apps/api/src/modules/profile/member-profile.controller.ts),
  [worker](../../apps/api/src/modules/profile/profile-avatar-worker.ts),
  [mail](../../apps/api/src/modules/auth/auth-mail.service.ts).
- [Shared intent](../../packages/session-client/src/account-commands.ts),
  [web](../../apps/user-web/src/pages/profile/MemberProfileEditor.tsx),
  [RN](../../apps/mobile-react-native/src/features/account/profile-screen.tsx).
- Contract0.65:206operations/32controllers. Migration mới0047; registry60.
  Không sửa migration cũ. Setup receiver cần migrate và bootstrap app role theo
  [START_HERE](../handoff/START_HERE.md); phiên này chỉ áp dụng QA `_test`.
- Mongo8 replica `rs-test` riêng57017, DB `latlai_member_profile_test` và schema
  suite `_test`. Sharp/transactions thật; storage private và mail local fake.
  Không DB chính, GHN/carrier, paid AI hoặc external mail.

## Bằng chứng

| Kiểm tra | Kết quả/phạm vi |
|---|---|
| Profile HTTP/Mongo + auth/session/OTP/obligations | PASS89/89 gồm16profile; owner/overposting/stale/replay/body conflict, genuine contention, revoke, password change/whitespace, unique-email race, OTP expiry/attempt/cooldown, durable mail rollback, actual-image/EXIF/quota/cleanup |
| Mongo schema | PASS27/27; factory0047 tránh import cycle, checksum giữ `fbabcbc789b2951b1d6aeed0e449463d6d1170e2eaafdb0ecc6b6cae2a165789` |
| Shared session | PASS98/98; includes lost ACK, HTTP403/408/429/503, identity change during photo preparation/read, exact bytes/key/body, discard recovery and fresh credential reentry |
| Web/RN unit | PASS253/253 và164/164; typecheck/lint/build web, RN typecheck/lint/export web PASS; warnings cũ ngoài thay đổi |
| Contract/generated/routes | PASS0.65/206/32 |
| Browser web + RN-web | PASS `pnpm test:member-profile:browser`: login từ entry, edit/save/photo replacements/attach, committed response loss+Back/remount, wrong password+fresh proof after remount, OTP/revoke other session, no page errors |
| Responsive/visual | Web1440/768/390/320px chữ130%, RN-web390/320; ảnh QA trong `docs/ui/member-profile-2026-11-01/`; đã xem ảnh, không overflow |
| Native/live storage/mail/human UX | NOT RUN cho source gói này; Expo export/browser không là native PASS |
| Remote CI | NOT RUN, giữ local theo owner; đã nối browser vào Operations CI |

Harness [test-member-profile](../../scripts/test-member-profile.mjs) kiểm QA URL
loopback/`rs-test` trước chạy, tự dọn API3009/media3010/web5194/RNweb8087.
Independent RN email phase dùng QA fixture lùi thời điểm challenge trước61giây;
không tắt cooldown production, API suite kiểm từ chối60giây riêng.
Lệnh bật Metro trực tiếp bị automatic policy block (tool không nêu lý do chi tiết);
không thử vượt block, native verification để lượt cuối của chuỗi được duyệt.
Không đóng [READINESS](../handoff/READINESS.md), không nhận fake là tích hợp thật.
