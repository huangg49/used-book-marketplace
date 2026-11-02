# Uy tín trong thẻ bạn đọc — 03/11/2026

Owner yêu cầu bổ sung chỉ dấu uy tín/đánh giá ngay trong banner hồ sơ cá nhân.
Nhánh `codex/profile-reputation-card`, base4146e3a3. Không đổi API/contract hoặc
nghiệp vụ điểm, quyền, tiền, profile/avatar/email commands hay thời hạn review.

## Hành trình và thiết kế

| Người dùng | Entry và điều kiện | Thông tin và bước tiếp |
| --- | --- | --- |
| Member đã đăng nhập | Hồ sơ & bảo mật `/profile`, đúng session/owner | Điểm đối tác và chất lượng sách, số mẫu riêng, giao dịch hoàn tất và vi phạm xác minh; mở `/members/:ownerId` rồi Back về form |
| Chưa được chấm | API trả null và count0 | “Chưa có điểm”, chưa có đánh giá công khai; không giả0/5 hoặc nhãn đáng tin |
| Lỗi/đổi phiên | Network giữ số liệu cũ kèm thông báo;401/403/404 che cache | Retry độc lập; session/owner key ngăn số liệu/tác vụ tài khoản cũ xuất hiện ở tài khoản mới |

`ProfileReputation` dùng public reputation API/validator hiện có, regular query
key `['memberReputation','summary',ownerId]`, riêng với public infinite query.
Invalidation prefix sau review vẫn cập nhật được. Đang hoạt động là trạng thái
tài khoản, không là chứng nhận uy tín; không tự thêm rank/badge/thưởng/phạt.

Component có paper/wine tone trong CSS riêng. Canonical editor gắn trước form;
checkout app đang chạy có banner do teammate sửa nên áp riêng hai hunk import/
mount bên dưới tên/email/avatar controls, dùng wine tone. Giữ nguyên hero, avatar,
quick links, motion và nội dung còn lại; không chép đè editor/CSS của teammate.

## Bằng chứng và giới hạn

- PASS browser HTTP fixture ở cả worktree và checkout app: loading, điểm/count,
  null/empty, stale503/404/retry, summary/public cùng owner không xung đột cache,
  phản hồi cũ tới sau đổi account không lộ số liệu/link cũ, dirty form → mở link →
  Hủy giữ nguyên tên đang nhập,1440/1000/390/320 và chữ130%.
- Fixture ghi nhận0profile/review/avatar/email mutation; không dùng Mongo hoặc
  provider. Không được diễn giải thành backend/auth hoặc native integration PASS.
- PASS app chính5174/API3000: User1 thấy5.0/4.5 từ2mẫu,2giao dịch,0vi phạm; bấm
  mở đúng hồ sơ công khai, Back về profile. Đăng nhập bình thường; không sửa dữ
  liệu/profile/review hoặc tạo tài khoản/seed phục vụ kiểm.
- Typecheck cả hai checkout, build worktree, lint component và diff check PASS.
  Build còn warning chunk cũ. Detector một lượt báo font22px lệch ramp; đã dùng
  bước20px hiện có, không tự cập nhật DESIGN hoặc tuyên bố detector rescan.
- Chưa push/CI/PR/merge/native/human acceptance; READINESS giữ nguyên. App chính
  tiếp tục chạy; Vite fixture5184 tự dọn sau test.

Lệnh tái kiểm: `pnpm --filter @used-books/user-web test:profile-reputation:browser`.
Baseline editor của teammate, ảnh và journal tích hợp giữ trong ignored `.tmp/`.
