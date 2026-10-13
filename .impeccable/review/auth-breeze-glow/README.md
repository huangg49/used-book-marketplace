# Login — bước2 ánh vàng và bụi sáng,13/10/2026

Branch `codex/login-breeze-step1`, base `3f8966d`.
Subject `feat(web): add warm glow to the login breeze`.
Chủ dự án duyệt nhịp fluid, cho tiến bước tiếp: glow nhẹ và ít bụi sao cùng gió.

## Kết quả

- Giữ nguyên16mobile/26desktop seed và flight/flutter đã duyệt. Glow quanh tán
 4mobile/6desktop seed tiền cảnh; tone cream/yellow từ palette hiện có.
- Thêm8mobile/14desktop motes5–11px gồm quầng, nhân sáng rất nhỏ. Motes rải thưa
 theo cùng gust, toàn viewport và cùng native fade gate, không particle loop mới.
- SVG radial light nhỏ, không feGaussianBlur/filter/backdrop/viewport wash.
 Chậm tăng giảm opacity35–72% trên2.8–4.04s, lệch pha; parent opacity vẫn điều
 khiển entry/dissolve. Không chớp flash hoặc kéo dài blocking/tail.
- Không thêm raster/library/token/API/session. Local material exception cho glow
 được chủ dự án duyệt, không đổi quy tắc background/shadow chung của UI.

## Evidence

- Node24.19.0/pnpm11.19.0: lint0warning,143unit,build TypeScript PASS;
  warning chunk>500kB giữ. Một detector breeze source0finding.
- [Runtime](runtime.json) Chromium1366×768/390×844, reduced preference,
 Login/API fixtures riêng, không DB/bucket writes; root kind counts16/26seed,
 8/14dust,4/6lit seed PASS; SVG filter count0. Existing flight retained;
 paper coverage9/9sectors cả hai, revealdesktop9/9/mobile8/9.
- 401/draft,focus/unlock/query/hash/filter giữ tail, normalnavbar/reload curtain,
 Back/route cleanup và finite fade PASS; desktop paused-fade2600ms không cutoff,
 resume cleanup PASS; pageErrors0.
- Đã mở kiểm tra ảnh [desktop](desktop-lingering.png), [mobile](mobile-lingering.png):
 ít chấm vàng nhỏ và radiance mỏng, giữ silhouettes/field, không phủ sáng chữ.
 [Desktop clip](desktop.webm), [mobile clip](mobile.webm), [video checks](video-runtime.json)
 ghi journey bình thường qua Login fixture đến hết fade; có nhãn không DB.
- QA503 ở trang đích là recovery thật, không đổi Hero. Physical/Safari/native/
 live auth/speech/FPS NOT RUN; thêm nguồn sáng nhỏ không chứng minhFPS thực.
 Chủ dự án đã duyệt kết quả/độ sáng bước2 trong chat13/10/2026. READINESS/WIP API giữ,
 không push/merge/deploy. Server test đóng trong finally.
