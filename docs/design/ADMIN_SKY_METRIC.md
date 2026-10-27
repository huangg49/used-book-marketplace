# Bầu trời nhỏ trên Dashboard —27/10/2026

Follow-up cùng ngày: owner yêu cầu đổi chim và thêm chi tiết; hiện dùng chim
xanh mới/lông vũ/khí cầu xa theo [gói chi tiết](ADMIN_ECOSYSTEM_DETAILS.md).
Các con số asset và evidence bên dưới mô tả phiên bản ban đầu.

Owner yêu cầu hoàn tất ô cuối sau khi duyệt cảnh rừng nhiều chi tiết. Đã gắn
[SkyMetric](../../apps/admin-web/src/features/dashboard/SkyMetric.tsx) vào ô
**Lượt gửi duyệt**. Giữ tổng submitted từ overview API theo7/30ngày, gồm cả
các lần gửi lại; null là “—”, zero là0. Trời/khí cầu/sách/chim chỉ trang trí,
không biểu thị hồ sơ hoặc việc giao sách. Hai ô rừng và đại dương giữ nội dung
và asset đã duyệt. Không đổi API/session/quyền/contract/migration hoặc seed DB.

## Hình và chuyển động

Built-in ImageGen tạo7asset mới: nền trời sớm, mây, vòm khí cầu, giỏ+dây treo,
sách, máy bay giấy, diều. Dùng lại thân/cánh chim từ rừng, tổng9asset phân lớp;
không copy hai file chim. [README/manifest](../../apps/admin-web/public/ecosystems/sky/README.md)
và [prompt set](ADMIN_SKY_PROMPTS.json) ghi nguồn/hash/dimensions. WebP mới143620
byte,6cutout alpha và1nền opaque, ảnh gốc giữ trong generator default. Đây là
raster có phong cách vector-cartoon; không là SVG editable.

Tông đào–kem/wine hợp brand, khác rừng sage và nước mint. Caption giữa chân
mây, tiêu đề/số ở vùng thoáng trên trái. Khí cầu nổi≤7px/nghiêng2°, giỏ lắc3°,
mây trôi±5px, diều lắc/bay5px, máy bay giấy/chim trôi12×9px, cánh vỗ độc lập.
Hai đốm sáng là hình học CSS; không chữ/nhân vật vẽ bằng CSS thay asset thật.
11animated elements,11image instances/9file, CSS transform/opacity không rAF
mỗi frame/Canvas mới. Sáu lớp thân/cánh/giỏ/sách vẫn độc lập để dễ chỉnh.

[Ecosystem playback](../../apps/admin-web/src/features/dashboard/ecosystem-playback.ts)
trích từ logic rừng đã kiểm; forest-playback giữ compatibility re-export.
Hai scene dùng dataset key riêng, pause độc lập; loaded/manual/offscreen/hidden/
focus/pagehide gates và dispose semantics giữ nguyên. Sky đợi decode, lỗi giữ
text/cảnh tĩnh còn tải được và có nút tải lại riêng. Asynccompletion bị bỏ sau
unmount/StrictMode; refetch/đổi ngày không restart hoặc bỏ manualpause. Giữ motion
dưới OS reduced-motion theo owner, không đổi setting máy.

Desktop ba thẻ280px;721–1100px hai thẻ trời/rừng ở hàng trên, bể cá ngang dưới;
≤720px grid một cột/gap12px. Bỏ rule plainMetric cũ chỉ dành cho text-only.
Không thêm dependency hay font mới.

## Kiểm chứng

PASS42tests/9files: thêm2test cho submitted/null/zero/kỳ/semantics và playback
sky/forest độc lập, offscreen/focus/pageshow/dispose/stalereadiness; giữ3test
rừng và toàn bộ checks Dashboard/aquarium liên quan. Admin lint/typecheck/build/
bundle budget PASS. Taste source lint0fail/0warn. Detector1lượt còn advisory
separator wine cũ #9e5750 ở Dashboard, không chỉnh ngoài scope.

Runtime API/Admin trước QA đã dừng; bật lại đúng dev-api supervisor (Mongo vẫn
healthy) và Vite5173. ready/login/CORS/queues/overview7+30 đều200 bằng session
kiểm chứng riêng rồi logout. Không suy đây là bằng chứng fix root cause process
từng dừng; không migration/reseed. CUA đăng nhập local và xem desktop1440×1000:
11images tải đủ, alpha sạch/không nền đen, đủ ba scene. Pause trời dừng11elements,
rừng vẫn chạy; đổi30ngày giữ pause, Enter resume. Phone320×780 không tràn ngang
(scrollWidth305), tiêu đề/số/khí cầu/caption rõ. Tablet850×900 đủ ba cảnh, không
tràn (scrollWidth835); đi review/Back khởi tạo lại đúng một sky và một forest.
FPS/GPU/comfort dài hạn/cross-browser/ảnh lỗi tương tác NOT RUN. Unit evidence
không thay usability/human review. Nhánh codex/admin-ui-refactor, base d3b19e5
+ local work trước; chưa commit/push; READINESS giữ nguyên.
