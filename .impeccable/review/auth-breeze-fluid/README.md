# Bồ công anh — nối nhịp và tan tự nhiên,13/10/2026

Branch `codex/login-breeze-step1`, base `4959dfd`.
Subject `fix(web): smooth dandelion drift and dissolve`.
Chủ dự án đã duyệt field/không khí; chỉ yêu cầu sửa bay và biến mất còn khựng.

## Nguyên nhân và sửa

- Trước: khi paper finish, thay transform bằng quỹ đạo mới chỉ nối vị trí,
  không nối vận tốc/góc chao. Gust sinus cũng còn vận tốc ở endpoint rồi dừng.
  Nay gust giảm dần, ripple có endpoint velocity0; một flutter khác pha/chu kỳ
  cho từng hạt chạy từ lúc sinh tới fade. Reveal chỉ thêm opacity animation,
  giữ nguyên native flight/rotation clock, không đọc pose để reset transform.
- Trước: timer2500ms dispose mọi animations có thể cắt trước frame trong suốt
  cuối. Nay opacity dùng quintic smoothstep, delay180–500ms/fade lệch thời điểm,
  tổng nominal2160–2500ms; Promise.all(native fade.finished) mới dispose.
  Hạt tiếp tục chao trong fade, không có loop mới hoặc glow.
- Query/filter thay đổi cũng từng dispose tail ngay. Clip cũ có checkbox click
  sau paper, vô tình thể hiện chính cutoff này. Nay cùng pathname giữ tail;
  rời pathname/Back giữa tear/hidden/new journey/unmount vẫn dọn ngay.
- Giữ16mobile/26desktop, phân bố toàn màn hình, giấy/stamp/handoff/focus/inert/API.

## Kiểm chứng

- Node24.19.0/pnpm11.19.0; lint PASS0warning;143unit PASS; build TypeScript PASS,
  giữ bundle>500kB warning. Một detector breeze source0finding; không rescan.
- [Runtime](runtime.json): Chromium1366×768/390×844, reduced preference,
  Login/API synthetic fixtures, không DB/bucket writes. Native transform chỉ
  có flight ban đầu ở reveal; full-screen coverage9/9sector cả hai, reveal
  desktop9/9/mobile8/9. Không coi số đo sector là điểm thẩm mỹ.
- Assertion query/filter giữ tail PASS. Desktop chủ động pause fade, đợi2600ms:
  root/hạt vẫn còn, không cutoff bởi timer; resume→native completion dọn hết PASS.
  Test ban đầu phát hiện query-change cleanup cũ làm hidden trước khi pause;
  sửa lifecycle pathname theo phát hiện, không bỏ assertion.
- Success/401/draft/query/hash/focus/unlock/controls, normal navbar/reload curtain,
  finite tail/route leave/Back cleanup giữ PASS;pageErrors0.
- [Desktop clip](desktop.webm), [mobile clip](mobile.webm), [video checks](video-runtime.json)
  ghi run bình thường, không pause fade. Checkbox sau reveal vẫn không cắt tail.
  Ảnh [desktop](desktop-lingering.png), [mobile](mobile-lingering.png) đã mở xem,
  giữ hình và trường hạt được duyệt. Clip có nhãn Login giả lập/không DB.
- Human motion acceptance pending. Physical/Safari/native/live auth/speech/FPS
  NOT RUN; READINESS/WIP API giữ, không push/merge/deploy. Glow chưa làm.
