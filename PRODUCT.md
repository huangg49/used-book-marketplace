# Lật lại — product context

<!-- impeccable:product-schema 1 -->

Nguồn: [SRS1.1](docs/SRS_V1_1.md), [phụ lục](docs/features/LOCAL_HANDOVER_AUCTION.md),
source main `da59199` và phản hồi/chấp thuận của chủ dự án09/10/2026.
Đọc [SESSION_STATE](docs/handoff/SESSION_STATE.md) khi cần trạng thái triển khai;
file này không thay contract hoặc tự đóng gate.

## Platform

web

Đây là context chung và mặc định cho các web app trong monorepo. RN/Flutter có
PRODUCT.md riêng để engine nạp hướng dẫn native; Expo web vẫn phải kiểm browser.

## Users

Người đọc muốn tìm, mua/bán hoặc đổi từng bản sách cũ tại TP.HCM, nhiều độ tuổi.
Người bán dùng ảnh và mô tả tình trạng bản sách để đăng bài. Staff/Admin thực
hiện kiểm duyệt và nghiệp vụ vận hành theo quyền API; Test Operator độc lập.
Chưa có nghiên cứu định lượng để khẳng định tuổi, hành vi hay tỷ lệ chuyển đổi.

## Product Purpose

Giúp người dùng tìm đúng bản sách, hiểu tình trạng/giá và hoàn thành tác vụ được
triển khai với kết quả rõ ràng. Thành công được quan sát qua hành trình sử dụng,
không qua số animation hoặc lời khen về mockup.

## Positioning

Marketplace từng bản sách vật lý có tình trạng/ảnh riêng và cam kết độc quyền.
ViaPoint đấu giá yêu cầu intake/inspection; không phải chỉ một catalog sách mới.

## Operating Context

Đồ án, TP.HCM only, hai điểm HCM-DEMO-01/02; tiền và carrier mô phỏng.
RN là Member client ưu tiên, Expo web chia sẻ RN; React/Vite user-web và admin
đã có. Flutter scaffold. Cùng NestJS/Mongo API, contract và SessionClient.

## Capabilities and Constraints

- DirectDelivery tới F2h. Auction ViaPoint có completion code nhưng review/release
  vẫn có gate. [READINESS](docs/handoff/READINESS.md) là nguồn gate.
- Purchase chat giữ sách24h, không tạo Order/thanh toán/hold tiền. Nhãn nút phải
  phản ánh đúng kết quả này; không báo mua thành công.
- Exchange user-web còn mock, register/profile/admin dashboard còn scaffold;
  không lấy giao diện làm bằng chứng API đã triển khai.
- Phân chia mục tiêu đã duyệt: mobile ưu tiên tìm/xem/lưu sách, chụp ảnh/đăng bài,
  chat/thông báo và tác vụ giao dịch thường xuyên; web thuận tiện cho mô tả dài,
  quản lý nhiều bài/phiên và vận hành. Đây là hướng lập scope, không là cam kết
  mọi màn đã có. Giữ hành trình thông thường liền mạch, không tự bỏ tác vụ thiết yếu.
- Không tạo client/framework/token store/API mới để cải thiện UI. Không thay
  state, quyền, retry hoặc idempotency chỉ để rút bước.

## Brand Commitments

Tên Lật lại, sách cũ và câu chuyện chuyền tay. Logo/ảnh phải đúng quyền sử dụng.
Giọng tiếng Việt cụ thể, dễ hiểu; cảm giác gần gũi có cá tính. Chủ dự án phản hồi
UI cũ khó hiểu/khó dùng, đặc biệt Lora và diễn đạt; đã duyệt sửa định hướng.
Visual direction tại [DESIGN](DESIGN.md), không suy brand cũ là yêu cầu giữ Lora.

## Evidence on Hand

Source, contract, tests và screenshot có provenance trong repo. Nội dung/ảnh QA
phải ghi fixture; không bịa rating, trust badge, doanh thu, testimonial hoặc tình
trạng sách. AI critique không là nghiên cứu user hay human sign-off.

## Product Principles

1. Người dùng hiểu thao tác và hậu quả trước xác nhận.
2. Tình trạng thật, ảnh và giá giúp quyết định; thông tin cần thiết không bị che.
3. Tác vụ thường xuyên liền mạch trên thiết bị được giao.
4. Lỗi giữ dữ liệu và có đường phục hồi đúng semantics API.

## Accessibility & Inclusion

Giữ chữ lớn, tên sách dài/dấu tiếng Việt, touch targets, safe area, Back/keyboard,
focus và labels. Kiểm tương phản thực; native/TalkBack/iOS cần evidence riêng.
