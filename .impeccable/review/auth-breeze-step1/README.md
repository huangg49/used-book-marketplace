# Login breeze — bước1 chờ duyệt nhịp,13/10/2026

Nhánh `codex/login-breeze-step1`, base `b726d61`.
Subject: `feat(web): add a gentle login breeze and dandelion tail`.
Chủ dự án yêu cầu thực hiện từng bước rồi dừng để duyệt. Bước này chỉ thêm gió,
bồ công anh và chút nhấc mép giấy; chưa glow/bụi sao/lá mùa thu.

## Hành vi

- Hai nét cong màu kem được vẽ dần, mờ rồi tan; không dịch chuyển nguyên hình gió.
- Sáu hạt mobile/mười desktop có tán sợi mảnh và cuống hạt, xuất phát từ đường xé
  lúc280ms. Kích thước, độ trễ, độ chao khác nhau, cùng hướng lên/phải với giấy.
- Sau paper finish, lấy pose hiện tại để nối sang trôi nhẹ2500ms; không đặt lại
  vị trí. Hạt ít dần và mất hoàn toàn, không loop. Lớp này pointer-events:none,
  aria-hidden và độc lập với overlay; focus/unlock không chờ nó.
- Back giữa tear, rời trang giữa tail, hidden/new journey/unmount đều dispose.
  Không có WAAPI thì vẫn technical cover fallback hiện có, không thêm seed giả.
- Timing/coverage gate giấy, Login→Auction không rèm và API/session giữ.
- Hạt và nét gió là linework SVG/WAAPI; không raster hoặc dependency mới.

## Evidence

- Node24.19.0/pnpm11.19.0; lint PASS0warning; build gồm TypeScript PASS,
  giữ warning chunk>500kB;143unit PASS. Một detector4source trả0findings.
- `tests/auth-auction-arrival.mjs`, AUTH_MOTION_EVIDENCE=`.impeccable/review/auth-breeze-step1`:
  [runtime](runtime.json) PASS trên Chromium1366×768/390×844, reduced preference
  với app React/StrictMode thật và Login/API fixtures riêng, không DB/bucket writes.
  401/draft/no gust; success gust/seed counts; paper-only Auction; query/hash;
  H1 focus/inert/scroll unlock; checkbox dùng ngay khi tail tồn tại; finite cleanup;
  navbar/reload rèm bình thường; navigation giữa tail/Back giữa tear cleanup. JSerror0.
- [Desktop lingering](desktop-lingering.png), [mobile lingering](mobile-lingering.png)
  được mở kiểm tra. Màu kem mảnh trên wine, cùng đường bay chéo; không glow.
  Desktop seed quanh vùng phải; mobile còn vài seed ở phía nội dung Hero.
- AUTH_MOTION_VIDEO=1 ghi riêng một journey sau401 tới hết tail, không quay các
  lượt navbar/reload sau đó. [Desktop clip](desktop.webm), [mobile clip](mobile.webm)
  và [video checks](video-runtime.json) có nhãn Login giả lập/không DB.
  Clip mobile có thao tác checkbox/cuộn sau paper để thể hiện vẫn dùng trang được.
  Không coi video headless là chứng nhậnFPS hoặc thiết bị thật.
- Chưa có human motion approval; bước2 glow không được thực hiện.
  Physical phone/Safari/native/live authentication/speech/memory/FPS: NOT RUN.
  READINESS và WIP API teammate giữ; không push/merge/deploy.

Ảnh/video dùng API503 fixture ở trang đích, nên Hero hiển thị recovery thật.
Không phải thay đổi bố cục Hero, dữ liệu sách hoặc thiết kế loading.
