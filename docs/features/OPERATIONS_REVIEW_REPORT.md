# Bàn kiểm duyệt Lật lại — bàn giao

Ngày: 27/09/2026. Phạm vi: web Staff/Admin sử dụng API thật theo OpenAPI 0.6.0.
Quyết định kiến trúc: [ADR 0010](../adr/0010-operations-review-client.md).

## Đã triển khai

- Đăng nhập, đọc quyền hiện tại, xoay token và đăng xuất thu hồi phiên. Token chỉ
  ở bộ nhớ; đổi người dùng xóa cache. Profile lỗi chặn thao tác và cho thử lại.
- Staff/Admin: hàng chờ bài đăng theo trạng thái, cursor pagination, đọc phiên bản
  đã gửi, ảnh riêng tư, mô tả tình trạng, giá và lịch sử các lần gửi.
- Admin: hàng chờ đầu sách, metadata, lịch sử quyết định, xác nhận hoặc từ chối.
  Staff không có quyền catalog; Member/Test Operator đơn lẻ không có bàn kiểm duyệt.
- Duyệt đúng revision/version với sáu mục kiểm tra. Chặn duyệt khi chưa đọc được
  đầu sách đã xác nhận hoặc chưa tải được toàn bộ ảnh. Từ chối có lý do 10–1.000 ký tự.
- Không tự duyệt hồ sơ mình gửi. Quyền phía UI bổ sung trải nghiệm; backend vẫn
  là nơi kiểm tra độc lập chủ thể, quyền, eligibility, trạng thái và concurrency.
- Mất phản hồi giữ nguyên payload/key. Có receipt nhưng GET lỗi thì chỉ tải GET
  lại. Conflict không tự gửi lại trên version mới. Có cảnh báo khi rời phần nhập;
  không reset checklist trong lúc polling/focus. Ảnh có nút xem lớn và Escape đóng.
- Nhận diện dùng logo/token/font có sẵn của Lật lại, hỗ trợ tên dài, chữ lớn,
  màn hình hẹp, loading/empty/error và dữ liệu cũ khi refresh danh sách lỗi.

Không tạo thêm số liệu, trust badge hay lời cam kết sách chính hãng. Duyệt không
tự mở kệ công khai vì API/UI kệ công khai vẫn thuộc mốc kế tiếp.

## Bằng chứng chạy thực tế

Node 24.19.0; pnpm 11.19.0; Edge headless/Playwright 1.62.1; PostgreSQL riêng `_test`.
API và migrations thật, upload HTTP thật, Sharp thật; adapter lưu ảnh cục bộ giả.
Không dùng các ca này thay bằng chứng Supabase live ở báo cáo media trước đó.

| Kiểm tra | Kết quả |
|---|---|
| Contract check | Types sinh ra khớp YAML, không thay hợp đồng API |
| Workspace lint/typecheck | Qua; không bỏ rule để né lỗi |
| Unit tests | 68: API 14, RN 30, session dùng chung 11, operations 13 |
| API HTTP/PostgreSQL E2E | 75/75 qua, gồm quyền, lock/race, rollback và media |
| Operations production build | Qua |
| RN export web/Android/iOS JS | Qua sau khi tách transport dùng chung; không phải native build |
| Browser chính | Xác nhận đầu sách → đọc ảnh → duyệt/từ chối qua API; guard/checklist/lý do |
| Browser phục hồi | Mất acknowledgement sau commit → retry cùng key; hai phiên xem cũ → 409 → đọc kết quả mới |
| Browser phân quyền | Staff không vào catalog; Member không có workspace; tự gửi không được tự duyệt |
| Browser trạng thái | Rỗng, lỗi mạng vẫn giữ danh sách, retry, phân trang, refresh token và phiên hết hạn |
| Responsive | Desktop 1440; 390; 320 với font gốc ×1,35, không cuộn ngang |

Ảnh trong `docs/verification/operations-*.png` là dữ liệu thử nghiệm; ô màu trong
ảnh là file ảnh tổng hợp dùng kiểm thử upload, không phải ảnh sách thật. Bộ chạy lại
lưu ảnh mới vào `apps/admin-web/test-results/` (Git ignore).

API E2E có log 500/503 do chủ động giả lập lỗi rollback. Có cảnh báo deprecation
`pg` khi adapter thực hiện truy vấn đồng thời; ca kiểm thử vẫn qua. Không coi đó là
đã sửa cảnh báo của dependency. Workflow CI đã thêm, chưa có kết quả hosted CI.

## Chạy lại

1. Cài dependencies, đặt `TEST_DATABASE_URL` tới DB riêng có tên kết thúc `_test`.
   Không dùng DB demo/production. Không đưa giá trị bí mật vào chat/log.
2. `pnpm --filter @used-books/api build` tạo API/Prisma artifacts.
3. `pnpm --filter @used-books/admin-web exec playwright install chromium`.
4. `pnpm --filter @used-books/admin-web test:browser`.

Suite tự mở cổng loopback 3009/3010/5174, tạo schema `ops_browser_<random>`, áp dụng
migration rồi dọn schema và server khi kết thúc. Các cổng cần đang trống. Trên máy
có Edge có thể đặt `PLAYWRIGHT_CHANNEL=msedge` thay bước cài Chromium. Fixture chỉ
cấp tài khoản thử nghiệm trong schema riêng; không đổi password seed hay `.env`.

Các lệnh còn lại: `pnpm contract:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm test:api:e2e`, `pnpm --filter @used-books/admin-web build`,
`pnpm --filter @used-books/mobile-react-native export:all`.

## Giới hạn và việc tiếp theo

Chưa có full screen-reader audit; đã kiểm tra focus mở/đóng dialog, Escape, guard,
nhãn form và resize/chữ lớn trên Edge. Chưa kiểm chứng Safari/Firefox. Ý định và
lý do chưa gửi mất khi reload/crash; mở lại phải đọc kết quả hiện tại.

Native picker/upload và form RN trên thiết bị vẫn cần chạy riêng. Bộ kiểm tra
web không thay thế Android/iOS. Public shelf/detail/media và bảy operation còn
planned là bước triển khai tiếp theo; cần giữ điều kiện owner đủ quyền hiện tại
trong public reads. Point/auction/shipping/ledger chưa phải workflow hoàn chỉnh.
