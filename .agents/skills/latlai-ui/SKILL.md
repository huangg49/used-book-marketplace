---
name: latlai-ui
description: "Build or fix Lật lại screens and shared UI in React Native, Expo web, admin or Flutter using the project brand, real API behavior and platform acceptance."
---

# Làm UI Lật lại

Các đường dẫn code bên dưới tính từ root repository. Đọc [AGENTS](../../../AGENTS.md)
và [ranh giới client](../../../docs/AI_WORKFLOW.md#ranh-giới-các-phần) trước khi sửa.

1. Đọc [UI rules](../../../docs/design/UI_CODING_RULES.md),
   [UI components](../../../docs/design/UI_COMPONENTS.md) và
   [brand v1.1](../../../packages/brand/v1.1/README.md). Kiểm tra màn hình và code
   hiện có liên quan nhiệm vụ; chọn component/mẫu hiện có trước khi tạo mới.
2. RN dùng `apps/mobile-react-native/src/core/ui/`; routes chỉ compose feature.
   Admin dùng control/CSS của app web; Flutter dùng widget/theme của client đó.
   Giữ cùng ngôn ngữ brand, không sao chép primitive RN sang DOM/Flutter. Không
   tạo thêm framework, thư viện UI hoặc client khác khi nhiệm vụ chỉ sửa màn hình.
3. Xác định API, quyền và state thật. UI không tự cấp quyền, tự bịa endpoint,
   số dư, rating, xác thực hoặc lịch sử chuyền tay. Giữ session owner và cơ chế
   mutation/idempotency đang có; không báo thành công trước server hoặc đổi key
   khi retry một thao tác chưa biết kết quả. Nếu API chưa có, ghi dependency và
   dừng phần cần API; chỉ dùng mock khi nhiệm vụ yêu cầu rõ và gắn nhãn.
4. Dùng bìa/tình trạng sách và nội dung có ích làm trọng tâm. Theo font/token/giọng
   văn trong brand; tránh gradient, card lặp, khẩu hiệu và trang trí không có chức
   năng. Component chung thay đổi phải cập nhật ví dụ `/ui` và xem consumer bị ảnh hưởng.
5. Kiểm tra trạng thái liên quan: loading, rỗng, lỗi, retry, pending mutation; lỗi
   form giữ dữ liệu. Trên mobile xem keyboard, safe area, Back, chữ lớn/nội dung dài;
   trên web thêm keyboard/focus và viewport. Giữ nhãn accessibility và font scaling.
6. Chạy [kiểm tra đúng phạm vi](../../../docs/AI_WORKFLOW.md#kiểm-tra-theo-thay-đổi)
   và thao tác UI thật trên nền tảng bị sửa. Chụp evidence không lộ dữ liệu riêng.
   Web export không là native PASS. Thiếu emulator/browser/tool thì ghi phần chưa
   kiểm, không tự coi screenshot của thiết kế hoặc hierarchy là nghiệm thu hành vi.

Bàn giao ngắn: hành vi đã đổi, component tái sử dụng, nền tảng/ca đã xem, test thực
chạy, ảnh/video phù hợp và phần còn thiếu. Không mở rộng sang luồng mua/settlement
chưa qua gate chỉ để làm màn hình trông hoàn chỉnh.
