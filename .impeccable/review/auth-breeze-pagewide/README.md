# Bồ công anh cùng những trang giấy lớn — 13/10/2026

Branch `codex/login-breeze-step1`, base `fd30eba`.
Subject `refine(web): carry dandelions across the full-screen paper breeze`.
Chủ dự án sửa hướng bước1: không khí hoài niệm trên toàn màn hình, những trang
sách cũ bay theo gió và bồ công anh còn ở lại. Chưa làm bước glow.

## Thay đổi

- Hạt khởi hành cùng giấy lớn từ420ms, thay vì tụ quanh đường xé thẻ Login.
 16mobile/26desktop; hai trục phân bố độc lập, không thành hàng/dải đều.
 Có kích thước12–24px mobile/14–30px desktop, opacity32–72% theo độ sâu.
- Cùng hướng lên/phải với giấy; hạt nhẹ chao và có drag riêng. Một nét gió
 bắt đầu gần thẻ, một nét dài đi cùng trang giấy lớn. Không loop nét gió.
- Viền mực wine16% dưới sợi kem giúp đọc được trên giấy sáng; không glow.
 Native inner sway giữ hơi chuyển động nếu trang đích mount chậm. Nối pose thật
 sang tail2500ms; không đổi gate navigation/focus/inert/scroll/cleanup.

## Kiểm chứng

- Lint/build TypeScript/143unit PASS với Node24.19.0; build giữ warning>500kB.
 Một detector source trả0findings, không rescan sau chỉnh vị trí phân bố.
- Browser fixture Chromium1366×768/390×844 reduced preference, noAPI/DB/bucket:
 [runtime](runtime.json) giữ success/401/draft/focus/unlock/query/hash/controls,
 normal navbar/reload curtain, finite tail và route/Back cleanup;JSerror0.
 Sau chỉnh phân bố,9/9sector có hạt trên cả hai viewport ở reveal; đây là số đo
 vị trí, không phải đánh giá thẩm mỹ hoặcFPS.
- [Video checks](video-runtime.json) còn đo hạt khi paper đang covered:
 desktop8/9/mobile6/9sectors, rồi9/9khi paper kết thúc. Source thực tạo field từ
 giấy lớn và không chờ overlay biến mất mới spawn. [Desktop](desktop.webm),
 [mobile](mobile.webm) là journey liên tục qua Login fixture, có nhãn QA.
- Mở kiểm tra ảnh [desktop](desktop-lingering.png), [mobile](mobile-lingering.png):
 field rộng, không còn plume tập trung quanh mascot. Ảnh/video API503 fixture
 khiến Hero có recovery thật, không phải sửa Hero hoặc dữ liệu đấu giá.
- Live auth/physical phone/Safari/native/speech/FPS NOT RUN. Human rhythm approval
 pending; dừng trước glow. READINESS/WIP API giữ, không push/merge/deploy.
