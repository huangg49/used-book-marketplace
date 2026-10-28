# Bể cá thử cho Admin —27/10/2026

Owner yêu cầu dựng một bể trước, gen từng asset riêng. Cá chi tiết v1 bị owner
yêu cầu đổi sang hoạt hình đơn giản/cute. Bản đang dùng v2 có hình phẳng, mắt
chấm, má hồng, không vảy/texture chi tiết; cùng mint/cream/gold của Lật lại.
Nhánh `codex/admin-ui-refactor`, base `d3b19e5` + local work trước, chưa push.

## Bản thử

Dashboard hiện đã được owner yêu cầu bổ sung cá xanh, san hô/sò/ốc và bọt phản
sáng; xem [gói chi tiết mới](ADMIN_ECOSYSTEM_DETAILS.md). Bản thử public và các
evidence v2 bên dưới giữ lịch sử đúng source, không đồng nhất với renderer mới.

URL `http://localhost:5173/design/aquarium/index.html`.
Source [HTML](../../apps/admin-web/public/design/aquarium/index.html),
[CSS](../../apps/admin-web/public/design/aquarium/aquarium.css),
[lifecycle](../../apps/admin-web/public/design/aquarium/aquarium.mjs),
[renderer/logic](../../apps/admin-web/public/design/aquarium/scene.mjs).

- Bể độc lập, chưa gắn vào ba metric của Dashboard; không gọi API/session,
  không đổi contract/migration/DB. Metric dùng dấu “—” và ghi chưa nối số liệu.
  Ba cá là minh họa cố định, không phải số hồ sơ hoặc sự kiện vận hành.
- Built-in image_gen tạo6asset rời: thân, đuôi, rong dải, cây lá tròn, đá, nền.
  [Asset README](../../apps/admin-web/public/design/aquarium/assets/README.md)
  ghi dimensions/bytes/hinge; [prompt set](ADMIN_AQUARIUM_PROMPTS.json) lưu đúng
  prompt, basename gốc/SHA256. Tổng WebP177342byte,5cutout có alpha,1background
  opaque. PNG gốc giữ nguyên ở default generator directory, không copy vào repo.
- Canvas2D ghép từng lớp: route cá theo thời gian, yaw/quay hướng, đuôi pivot và
  co giãn/quẫy riêng. Cây affine sway từ root; không mesh slicing gây sọc alpha.
  Đá/front/back layers tạo chiều sâu nhẹ; bọt/vòng nước là hình học, không đồ họa
  nhân vật tự vẽ thay cho asset user yêu cầu.13image draws/frame, cap khoảng30fps,
  DPR≤2. Không shader/blur/framework hoặc dependency mới.
- Chạm nước/call button gọi cá lại gần trong4giây, tọa độ được chặn, rồi trả
  về route liên tục. Pointer drag>10px/cancel/leave bỏ tương tác để mobile scroll
  không vô tình gọi cá. Có Pause/Resume và xem cỡ thẻ; control native≥44px từ CSS.
- Manual pause/hidden/offscreen/blur/pagehide hủy rAF; resume không cộng thời
  gian lúc tắt vào simulation. Stale callback có generation guard; Back/bfcache
  boot lại và chặn async load cũ. Cleanup observer/listener. Giữ authored motion
  theo owner kể cả OS reduced-motion, không đổi setting máy.
- Canvas/asset load không dùng được thì giữ DOM static fallback, feedback rõ,
  không để một khung trắng hoặc giả dữ liệu. Văn bản/metric ngoài Canvas để đọc
  bằng AT; cảnh có mô tả và button keyboard tương đương chạm nước.

## Tích hợp Dashboard sau khi owner duyệt —27/10/2026

Đã áp một bể vào ô **Hồ sơ đang chờ** tại `/dashboard`. Hai ô còn lại giữ giao
diện hiện tại. [AquariumMetric](../../apps/admin-web/src/features/dashboard/AquariumMetric.tsx)
giữ dt/dd và số liệu trong DOM: tổng pending từ overview API, null là “—”, zero
là0; nhãn catalog theo quyền hiện có. Ba cá là trang trí cố định, có mô tả cho AT,
không biểu thị hồ sơ. Thay đổi kỳ7/30/refetch không khởi động lại bể hay bỏ pause.

Renderer ứng dụng ở [aquarium-scene.mjs](../../apps/admin-web/src/features/dashboard/aquarium-scene.mjs),
được đưa vào chunk Dashboard, xuất phát từ bản v2 đã duyệt; study public giữ
nguyên như reference độc lập. Sáu WebP dùng chung, không gen/copy thêm ảnh.
[Runtime React](../../apps/admin-web/src/features/dashboard/aquarium-runtime.ts)
load/decode khi vào viewport, cap30fps/DPR2, pause native44px, nghỉ khi hidden/
offscreen/blur/pagehide, resume khi pageshow; dispose khi unmount, bỏ async kết
quả cũ khi StrictMode/Back. Canvas/module/asset lỗi giữ static fallback và số thật.
Owner motion policy vẫn áp dụng, không đổi cài đặt máy.

Desktop ba cột;721–1100px hai metric nhỏ trên, bể ngang dưới với chữ bên trái/
cảnh bên phải;≤720px xếp dọc. Lượt CUA đầu thấy bể quá hẹp ở850px, đã sửa đúng
breakpoint và xác nhận lại. PASS37tests/7files (6renderer,5integration mới và26
Dashboard trước), lint/typecheck/build/bundle budget, docs/diff. Detector một
advisory separator wine cũ #9e5750, giữ nguyên; Taste source lint0fail/0warn.
CUA đã dùng được trong lượt này: desktop1440×1000, tablet850×900, phone320×780;
pause/resume bằng click/Enter/Space, giữ pause khi đổi30ngày, điều hướng đi/Back
và khởi tạo một scene. Không tràn ngang ở320. Kiểm backend main ready/login/CORS/
queues/overview7+30 trả200 bằng session kiểm chứng riêng rồi logout. Không seed/
đổi API/migration/DB. FPS/GPU/comfort dài hạn/cross-browser vẫn NOT RUN.

## Kiểm chứng và giới hạn của bản thử ban đầu

PASS6tests riêng: bounds qua nhiều thời điểm/aspect ratios, vùng đọc metric trên
trái của card cao, attraction liên tục,
playback gates, pause/restart/dispose/stale frame/maxdelta, body/tail riêng và
draw stack/count. JS syntax và HTTP local HTML/CSS/module/manifest/font trả200
với content-type đúng. PASS Admin lint/typecheck/build/budget/docs/diff.
Đây không phải bằng chứng backend hoặc gate READINESS mới.

Detector một lượt có8findings: radius5/10/16 và heading endpoint3.25rem đã
chuyển về control8/panel12/font2.5rem theo ramp. Cramped aquarium là bề mặt
Canvas full-bleed có chủ ý; metric text có inset18–32px, không flush. Cream là
palette Lật lại được owner duyệt. Không rescan để đuổi zero finding hoặc coi
đó là bằng chứng browser acceptance.

Đã dựng offline artwork frames từ chính renderAquarium qua adapter SVG rồi
Sharp:1000×650 và400×320, time12/18. Thấy body-tail nối đúng, asset alpha không
nền đen, cây không còn strip seams. Artifact `.tmp/aquarium-v2/scene-large.png`,
`scene-card.png`, `scene-later.png` là khung hình renderer, không screenshot UI.

CUA vẫn trả “Local browser use is disabled in Work settings”. Không chuyển qua
Playwright/CDP/shell để vượt quyền. Browser layout/font-render/click/keyboard/
mobile/Back/OS visibility/live FPS/GPU/comfort/cross-browser NOT RUN. Unit gate
và offline artwork không thay QA runtime. Cần browser access hoặc owner xem
link trước tích hợp vào metric thật. Không claim giao diện đã được human duyệt.
