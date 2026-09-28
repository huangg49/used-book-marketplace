# Bàn giao nền móng UI React Native

Ngày 25/09/2026. Phạm vi: bước 3, thư viện UI và quy tắc triển khai cho Lật lại.

## Đã triển khai

- `src/core/ui/` là nguồn chung cho token, chữ, logo, nút, ô nhập, checkbox,
  thông báo, trạng thái nội dung, sheet, xác nhận và cách trình bày sách/giá.
- BrandProvider nạp font một lần. Nhận diện “Dấu chuyền tay” dùng palette brand
  1.1, logo gốc, Lora và Be Vietnam Pro; không tải font từ CDN.
- Auth/profile và ba màn hình nghiên cứu dùng cùng thư viện. API, session owner
  và TanStack Query vẫn giữ trách nhiệm cũ.
- `/ui` có sáu nhóm component tương tác, tình huống thất bại và chế độ chữ 135%.
  `/ui` và `/design` chỉ hiện khi build với `EXPO_PUBLIC_DESIGN_PREVIEW=1`.
- Bộ luật UI và ESLint ngăn một số sai lệch phổ biến: native control trực tiếp
  trong feature, màu hex/rgb tùy ý. Review thẩm mỹ vẫn cần con người.

## Bằng chứng kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `pnpm contract:check` | Đạt; bước này không sửa API contract |
| React Native lint và typecheck | Đạt |
| React Native unit tests | 22/22: 10 session, 6 model màn hình mẫu, 4 trình bày lỗi, 2 token/contrast |
| ESLint kiểm tra ngược qua stdin | Từ chối đủ 3 lỗi cố ý: Text, Modal và màu hex trong feature |
| Expo export Android/iOS/web, cấu hình thường và preview | Đạt; đây là JS/Hermes bundle, chưa phải APK/IPA |
| Cấu hình thường trên static server | `/ui` và `/design` chuyển về `/`; màn đăng nhập xuất hiện |
| Console bản export preview cuối | Không ghi nhận error/warn khi tải `/design` ở desktop và 390px, hoặc `/ui` và mở dialog ở 320px/chữ 135% |
| Nút busy | Giữ nhãn, có spinner, không nhận lần nhấn tiếp theo |
| Form mẫu và đăng nhập | Lỗi nằm tại trường; trường có liên kết mô tả lỗi; đăng nhập thiếu dữ liệu focus trường sai đầu tiên |
| Xác nhận bỏ bản nháp mẫu | Lần lỗi giữ dialog và nội dung; thử lại thành công mới đóng |
| Modal trên web | Một dialog có tên; Tab nằm trong dialog; Escape đóng và trả focus về nút mở |
| Màn hình hẹp và chữ lớn | Đã xem 320×740 với chữ 135%, cùng màn đăng nhập/chi tiết 390×844 |
| Luồng đăng sách mẫu | Nội dung nhập và hai giá được giữ qua bước; tình trạng không đủ điều kiện chặn tiếp tục; hoàn tất giải thích rõ đây là bản mẫu |

Kiểm tra export phát hiện bundler có thể giữ cờ preview cũ khi đổi cấu hình.
Các script export đã thêm `--clear`; hai cấu hình phải chạy tuần tự. Kiểm tra
trang `/design` cũng phát hiện lệch cây HTML khi hydrate ở desktop: phần panel
phụ thuộc viewport nay dùng snapshot server/client qua `useSyncExternalStore`.

## Giới hạn còn lại

- Cập nhật 27/09/2026: đã build/cài APK Android debug và mở catalog trên Pixel_7
  Android 15; đã sửa tương phản thanh trạng thái. Kết quả bổ sung và giới hạn ở
  [Android quality](../ANDROID_QUALITY.md). Báo cáo ban đầu chưa kiểm tra native.
  Safe area, bàn phím, nút Back,
  quyền chọn ảnh, VoiceOver/TalkBack và font scaling hệ điều hành cần kiểm tra
  trên native trước phát hành. Chữ 135% trong catalog chỉ là một stress test.
- Chưa đăng nhập tài khoản thật để kiểm tra trực quan profile sau lần chuyển UI
  này; session tests đạt nhưng không thay thế kiểm thử tích hợp auth thực tế.
- Khám phá, chi tiết, đăng sách và thao tác bỏ nháp trong catalog vẫn là dữ liệu
  mẫu. Chưa có lưu nháp bền vững, listing API hoặc giao dịch thật trong bước này.
- Lint và contrast tests không chứng nhận accessibility toàn ứng dụng, cũng
  không tự quyết định giao diện có đẹp hay đúng tinh thần thương hiệu.

## Team bắt đầu thế nào

Đọc [bộ luật UI](UI_CODING_RULES.md), dùng [component chung](UI_COMPONENTS.md),
kiểm tra trạng thái tại `/ui`, rồi triển khai từng lát cắt tính năng thật. Khi
thiếu component, mở rộng thư viện và catalog cùng lúc. Không sao chép control
hoặc tạo một bộ token riêng trong feature.

Điểm xuất phát tiếp theo là nối một luồng nghiệp vụ vào API theo contract,
kèm kiểm tra quyền, trạng thái lỗi và QA native; không cần dựng thêm một thư
viện UI tổng quát trước khi bắt đầu tính năng.

Đã có [đặc tả lát cắt listing](../features/LISTING_SLICE.md) làm đầu vào cho bước
contract/dữ liệu tiếp theo; đây chưa phải luồng nghiệp vụ đã triển khai.
