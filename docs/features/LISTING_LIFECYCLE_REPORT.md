# Quản lý bài đăng sau duyệt

Ngày 27/09/2026 · [ADR 0012](../adr/0012-listing-lifecycle.md) · OpenAPI 0.8.0.

Đợt bổ sung sau báo cáo này: [đối chiếu 32 ca nghiệm thu](LISTING_ACCEPTANCE_REPORT.md)
với 114 API E2E, 96 unit, barrier DB và hành trình đăng sách trên browser.
Số liệu bên dưới giữ nguyên cho increment lifecycle ban đầu.

## Kết quả

| Người dùng | Hành vi đã có |
|---|---|
| Chủ sách ACTIVE | Sửa bài Approved qua form RN, xác nhận và gửi bản mới PendingReview; giữ lịch sử/ảnh cũ và ngừng công khai trong lúc chờ |
| Chủ sách ACTIVE/RESTRICTED | Ẩn Approved/Available hoặc xóa mềm bài Available chưa bị gỡ, kể cả bài đang chờ duyệt |
| Chủ sách ACTIVE | Mở lại bài Hidden khi catalog/ảnh và tài khoản còn hợp lệ |
| STAFF/ADMIN độc lập | Gỡ bài đã có kết quả review trên web, bắt buộc lý do; owner thấy lý do và không thể tự phục hồi |

API removal cũng cho submitted PendingReview; giao diện bước đó dùng approve/reject.
Working draft chưa submit không thuộc phạm vi operations removal. Bài Reserved/
Sold/Exchanged/ClosedUnavailable bị chặn ở cả bốn lệnh. Mọi lệnh dùng quyền hiện
hành, expectedVersion và Idempotency-Key; không dựa vào nút ẩn trên UI.

Contract cập nhật trước code và sinh lại types. Có đủ 34 operation domain trong
chỉ mục catalog/listing/media, không còn operation planned trong nhóm này. Điều đó
không đồng nghĩa hoàn thành SRS: checkout, trao đổi, ledger, ship, point/custody và
auction chưa triển khai. Không thêm migration, đổi credential, reset DB hay sửa seed.

## Kiểm thử

- API HTTP/PostgreSQL: **107 pass**, bao gồm 14 ca lifecycle mới. Storage signing
  trong suite là giả; DB/migrations/guards/services/HTTP là thật trên DB `_test`.
- Unit: **89 pass** — API 14, session 14, RN 48, operations 13. Có retry cho approved
  replacement, archive/hide/reopen; giữ key/body khi mất phản hồi và không gửi lại
  lệnh đã acknowledge hoặc bị từ chối dứt khoát.
- Browser RN export: pass luồng hide/reopen/revise/archive qua control thực. Làm
  mất phản hồi sau commit của revise và archive, retry đúng key, xác nhận chỉ một
  receipt và giá mới được lưu; public detail trả 404 khi pending/archived. Chạy cùng
  các ca kệ/search/filter/ảnh/mạng/login/320 px của increment trước.
- Browser operations: pass hồi quy review/catalog/session và gỡ Approved với lý do
  sai/đúng, mất phản hồi sau commit, retry cùng intent, đúng một receipt, lý do
  hiển thị trong hồ sơ và public detail 404. Đã sửa nhãn textarea thành label liên
  kết qua `htmlFor` để tên truy cập không bị ảnh hưởng bởi nội dung đang gõ.
- Lint, typecheck, contract check, build API/operations và export JS web/Android/iOS: pass.
- Android debug x86_64: build pass, 338 tasks (310 executed), 3 phút 9 giây. Đây
  là debug APK cần Metro, không phải native runtime smoke. SHA-256:
  `046FA8C3B1B8F85CA376C29008724F56CF3160417EF6074297B88642E1140BE8`.

Ảnh kiểm chứng: [RN gửi bản sửa](../verification/lifecycle-rn-pending.png),
[operations sau gỡ](../verification/lifecycle-operations-removed.png).

API tests kiểm tra lịch sử revision bất biến, ảnh thay thế, declaration, giá trị
không hợp lệ, media sai owner/chưa Ready, stale version, RESTRICTED và mất role,
không tự gỡ/không đủ role, lý do, public/private access sau xóa, replay sau xóa,
Hidden qua sửa/duyệt, mọi trade state bị cấm. Race tests gồm archive vs approve,
revise vs remove, duplicate hide và restrict trong lúc chờ khóa. Failpoint audit
cho cả bốn lệnh buộc rollback revision, visibility/deletedAt, receipt và các hiệu ứng.
Các dòng 500 trong failpoint log là lỗi được chủ động tạo và được assert.

## Chạy lại

Node/pnpm theo root; `TEST_DATABASE_URL` trỏ DB riêng có hậu tố `_test`. Không dùng
DB chung. Các test tự tạo schema riêng, áp full migration và dọn schema đó.

```powershell
pnpm contract:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:api:e2e
pnpm build
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3009/api/v1'
pnpm --filter @used-books/mobile-react-native export:all
pnpm test:public:browser
pnpm --filter @used-books/admin-web test:browser
Remove-Item Env:EXPO_PUBLIC_API_BASE_URL
pnpm build:android --emulator
```

Browser suites dùng Playwright Chromium hoặc `PLAYWRIGHT_CHANNEL=msedge`. Chạy
tuần tự vì cùng cổng API fixture 3009 và ảnh fixture 3010; RN static tại 8087,
operations tại 5174. Cấu hình CI đã chạy hai suite tuần tự; không tuyên bố GitHub
Actions đã chạy chỉ từ việc cập nhật source.

## Demo và giới hạn

Đăng nhập member → Sách của tôi → bài đã duyệt → Ẩn/Mở lại. Chọn Sửa bài đã duyệt,
đổi giá, xác nhận lời khai, gửi bản sửa: API tạo revision mới và kệ ngừng hiển thị.
Operations duyệt lại → kệ hiện giá mới (nếu bài đang Visible). Operations mở bài
Approved/Rejected → ghi lý do → Gỡ bài đăng: owner thấy lý do, không có nút khôi phục.
Xóa bài đang chờ duyệt → không còn trong Sách của tôi và reviewer không thể duyệt nữa.

Bản sửa Approved chỉ giữ trong bộ nhớ trước khi gửi, chưa có draft replacement
bền vững qua tắt app. Không gắn ảnh upload mới vào revision đang public. Xóa mềm
không purge ảnh/lịch sử; chính sách retention sau giao dịch chưa triển khai.
URL ảnh đã cấp vẫn theo TTL 120 giây; không hứa thu hồi nội dung đã tải.
Chưa có push/email notification, native picker/runtime QA mới, native iOS build,
hay tải/hiệu năng production. Các ảnh browser là fixture có nhãn, không là bằng
chứng live Supabase. Metro bị automatic approval review chặn ở lượt trước; lượt
này không thử vượt chặn hay coi export web là native smoke.

Bước tiếp theo: kiểm tra native toàn luồng khi có môi trường runtime được phép;
đối chiếu acceptance listing còn thiếu và thiết kế shared commitment/reservation
trước khi triển khai mua/đổi/tiền/giao nhận theo SRS1.1.
