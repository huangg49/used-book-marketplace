# Màn chuẩn03 — bìa nổi bật, hình thức rõ ngay đầu

30/09/2026 · `codex/ui-direction`, base25c8319.
Checkpoint: `feat(rn): refine book cover and trade labels`.
Chủ dự án duyệt hướng A, yêu cầu tinh chỉnh bìa/dấu/hình thức/lời nhắn và dừng
chờ duyệt lại. [So sánh trước/sau](detail-standard-03.html).

- Cột bìa34%→40%, khoảng cách tới tên20→16px. Khung2:3 nền giấy thay nền trắng,
  vẫn contain: không crop, không tẩy nền có trong ảnh người đăng. Bìa DEMO rộng
  khoảng140dp thay119dp; ảnh tư liệu vuông cũng giữ nguyên nội dung.
- Bỏ chữ “Tình trạng” nhìn thấy phía trên dấu; accessibility label vẫn nêu
  “Tình trạng: …”. Hình thức Bán/Đổi/Bán hoặc đổi lấy trực tiếp từ mode hiện có,
  đặt ngay dưới dấu. Không thêm dữ liệu hoặc chứng nhận.
- Thanh đáy: “Tiệm chưa nhận đơn ở bản này.”, một dòng ở390dp/font130% trên cả
  bốn bản QA. Không ép numberOfLines hoặc giảm cỡ chữ. Footer130% khoảng99dp,
  giảm khoảng25dp so với màn chuẩn02, không gồm safe area.
- Giữ API/query/retry/session/navigation/nghiệp vụ; chỉ đổi trình bày. Component
  chung, showcase và ví dụ `/ui` đồng bộ. DESIGN/UI_COMPONENTS đã cập nhật.

## Evidence thực chạy

Pixel_7/API35/x86_64, APK debug hiện có + Metro mới;1080×2400/density443 (~390dp),
font hệ thống1.0/1.3. Đã xem tám ảnh đầu màn của LikeNew/Good/Fair/Worn, đủ
Sale/Exchange/Both, tên ngắn/dài: bìa, tên, dấu, hình thức, giá và trạng thái đều
đọc được ở viewport đầu. Dấu Fair dài không cắt ở130%.
[Cuối màn130%](evidence/ui-1-refine/bottom-130.png) cuộn tới nút cuối, footer không che.
Mở ảnh lớn/Android Back vẫn hoạt động. Đã xem consumer showcase với ảnh vuông.

[Ảnh không khả dụng130%](evidence/ui-1-refine/missing-130.png): cố ý ngắt reverse
API khi refetch, placeholder trên nền giấy vẫn đọc rõ, footer giá ẩn theo logic
cũ. Khôi phục reverse/bấm retry phục hồi ảnh và giá. Hierarchy có nhãn “Tình
trạng: Cũ nhiều”; không gọi đây là nghiệm thu TalkBack.

Ảnh trước dùng lại bộ Sau màn chuẩn02 tại25c8319; ảnh sau chụp mới, không chỉnh
sửa PNG. Docker/Metro ban đầu dừng; người dùng mở lại. QA tmpfs cũ không còn,
nên tạo lại4 bản qua API với cùng nội dung/giá/bìa DEMO, khác ID. Run riêng
`.tmp/demo/ui-refine`, random `*_test`/57017, API3046/media3047. Nest/Mongo/Sharp
thật, **storage fixture FAKE**. Không sửa DB/bucket/config chính hoặc tiền/đơn.

PASS: RN typecheck/lint (0 warning),91/91 tests/12 files, contract:check,
Prettier, docs:check, git diff --check. Node24.19.0/pnpm11.19.0. Không chạy lại
API E2E/export/native build vì không đổi phần tương ứng. Chưa kiểm native `/ui`
(DESIGN_PREVIEW=0),320px/TalkBack/ARM/iOS/Expo web; không đóng release/human review.

App snapshot/font/density/reverse phục hồi; API/media QA/emulator do agent mở đã
dừng, giữ Docker/Metro người dùng và preview8089. **Chờ duyệt màn chuẩn03; chưa
áp sang màn khác, chưa push/merge hoặc mở C02/C04.**
