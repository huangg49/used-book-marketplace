# Kệ sách công khai — API và React Native

Ngày 27/09/2026 · OpenAPI 0.7.0 · [ADR 0011](../adr/0011-public-shelf.md).

Cập nhật tiếp nối: bốn lifecycle operation đã được triển khai trong OpenAPI 0.8.0;
xem [báo cáo lifecycle](LISTING_LIFECYCLE_REPORT.md). Các số đo và giới hạn bên dưới
giữ nguyên theo thời điểm bàn giao mốc public shelf.

## Đã triển khai

Guest mở `/` để xem sách đã duyệt; tìm theo tên/tác giả không dấu hoặc ISBN,
lọc chế độ/tình trạng/khoảng giá, sắp xếp và chuyển trang. `/book?id=<uuid>` có
ảnh thật từ API, giá bán và giá trị đổi phân biệt, mô tả người đăng, tình trạng
ruột/bìa/gáy/ghi chú/phụ kiện/trang thiếu và metadata đầu sách. `/account` giữ
đăng nhập/profile, dẫn tới Sách của tôi. `/design` là mẫu, `/ui` là catalog controls.

Ba public handler dùng chung predicate đủ điều kiện; không trả email, storage key,
ghi chú moderation hay nội dung bản nháp. Ảnh trong projection chỉ có ID/kích thước;
URL ký được lấy riêng, kiểm tra lại quyền sau khi ký. Tách khỏi URL ảnh private.
Owner bị restrict/mất MEMBER hoặc sách Hidden/Removed/deleted/không Available sẽ
không xuất hiện ở lần đọc mới. List/detail giữ cùng snapshot giữa chọn ID và đọc
nội dung để tránh trộn revision khi có thay đổi đồng thời.

UI dùng Lora/Be Vietnam Pro, màu giấy/xanh rừng/đất nung và các control hiện có.
Tên dài được xuống dòng, giá có nhãn riêng, không tạo huy hiệu kiểm định/rating.
Có loading/empty/error/retry, lỗi bộ lọc tại chỗ, ảnh lỗi có nút thử lại, xem ảnh lớn
đóng được bằng Escape trên web. Không có nút mua/đổi giả.

## Bằng chứng chạy trên máy phát triển

| Kiểm tra | Kết quả |
|---|---|
| `pnpm contract:check` | Pass; YAML và types sinh tự động đồng bộ |
| `pnpm lint`, `pnpm typecheck` | Pass toàn workspace có script |
| `pnpm test` | 80 pass: API 14, session 14, RN 39, operations 13 |
| `pnpm test:api:e2e` | 93 pass trên PostgreSQL 17.10, DB riêng có hậu tố `_test` |
| `pnpm build` | Nest API và Vite operations build pass |
| RN `export:all` | Web static + Android/iOS JS bundle pass; không phải iOS native build |
| `pnpm test:public:browser` | Pass Edge headless, RN export + API thật + PostgreSQL; storage giả |
| Operations `test:browser` | Pass hồi quy review/catalog/session; API/DB thật, storage giả |
| Android `pnpm build:android --emulator` | Debug x86_64 assemble pass; 338 tasks; không phải runtime smoke |

API E2E bao gồm closed projection, thứ tự ảnh, ảnh không gắn/khác listing,
draft/pending/rejected và ảnh revision cũ, trạng thái catalog/owner/role/verification,
mọi trạng thái không public, sort/giá null/giá bằng nhau, cursor không đúng filter,
tìm tiếng Việt/ISBN-10/tác giả/ký tự LIKE, snapshot race và thu hồi role lúc đang ký.
Các lỗi 500/503 được chủ động tạo ở failpoint tests; không phải lỗi bị bỏ qua.

Browser suite tạo 13 bài qua upload/worker/submit/approve thật trong schema riêng,
kiểm tra trang 12+1, tìm không thấy, bộ lọc sai/đúng, ảnh hết chu kỳ refresh gặp lỗi
và retry, dialog Escape, title dài ở 320 px và chữ CSS 135%, owner bị hạn chế làm
mất detail/kệ, mạng lỗi/retry, login rồi quay lại kệ; public requests không gửi bearer.
Ảnh fixture là hình màu đơn, có nhãn dữ liệu kiểm thử; không dùng ảnh đó làm bằng
chứng live Supabase hay chất lượng ảnh sách ngoài đời. Large-text web là mô phỏng
CSS, không thay thế kiểm tra accessibility/font scale của Android.

Ảnh chụp viewport từ suite:

- [Kệ 390 px](../verification/public-shelf-390.png)
- [Chi tiết 390 px](../verification/public-book-390.png)
- [Chi tiết 320 px, chữ lớn](../verification/public-book-320-large.png)

APK: `apps/mobile-react-native/android/app/build/outputs/apk/debug/app-debug.apk`
(ignored), SHA-256 `046FA8C3B1B8F85CA376C29008724F56CF3160417EF6074297B88642E1140BE8`.
Debug APK cần Metro để chạy JS; JS mới nhất đã được export riêng. Build này không
chứng minh luồng kệ/form/picker trên thiết bị. Trong lượt này, automatic approval
review đã từ chối khởi động Metro với lý do chính sách, không cung cấp chi tiết
cụ thể; không thử vượt chặn đó, nên chưa có native runtime smoke mới.
Live Supabase của mốc trước xem
[media report](MEDIA_UPLOAD_REPORT.md), không chạy lại provider cho increment đọc này.

## Chạy lại

Node >=24.15, pnpm theo root, PostgreSQL riêng có tên kết thúc `_test`.
Đặt `TEST_DATABASE_URL` trong môi trường; không dùng database chung. Suite cần
quyền tạo/xóa schema và migration extensions, không reset database. Cổng test
3009 (API), 3010 (storage fixture), 8087 (RN export) phải trống.

```powershell
pnpm --filter @used-books/api build
pnpm --filter @used-books/admin-web exec playwright install chromium
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3009/api/v1'
$env:EXPO_PUBLIC_DESIGN_PREVIEW = '1'
pnpm --filter @used-books/mobile-react-native export:web
pnpm test:public:browser
Remove-Item Env:EXPO_PUBLIC_API_BASE_URL
Remove-Item Env:EXPO_PUBLIC_DESIGN_PREVIEW
```

Nếu dùng Edge đã cài: đặt `PLAYWRIGHT_CHANNEL=msedge`. Fixture tự dọn schema và
test servers. Screenshots ở `apps/mobile-react-native/test-results` (ignored).
Workflow `operations-ci.yml` chạy operations browser rồi export/test kệ tuần tự;
chưa tuyên bố GitHub Actions đã chạy chỉ vì cấu hình đã thêm.

## Giới hạn và bước kế tiếp

URL ảnh đã cấp có TTL 120 giây; không thể thu hồi nội dung người xem đã tải.
Kệ/detail refresh foreground 30 giây, ảnh 90 giây; không có realtime. Khi mất mạng,
UI ghi rõ dữ liệu lần trước, ẩn ảnh và cho retry. Phân trang không snapshot toàn
bộ tập dữ liệu qua nhiều request. Chưa đo tải/egress hay xác nhận SRS performance.

Còn 4 lifecycle operation chưa có handler: sửa Approved, ẩn/mở, archive và Staff
remove. Đây là bước kế tiếp để chủ sách rút/cập nhật nội dung đã lên kệ và Staff
xử lý bài vi phạm qua UI. Song song cần native Android workflow QA (kệ, keyboard,
font scale, background/resume, picker/upload), sau đó mới sang reservation/giao
dịch. Checkout, trao đổi, tiền, ship, điểm giao và đấu giá vẫn planned; TP.HCM ở UI
là phạm vi sản phẩm, chưa phải xác thực vị trí hay cấu hình điểm vận hành.
