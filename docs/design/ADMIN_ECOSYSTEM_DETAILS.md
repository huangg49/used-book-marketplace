# Sky và đại dương — bổ sung chi tiết27/10/2026

Owner yêu cầu đổi chim của **Lượt gửi duyệt**, thêm chi tiết cho trời và nâng
bể **Hồ sơ đang chờ** ngang chất lượng hai cảnh mới. Source trên
codex/admin-ui-refactor/base d3b19e5 + local work trước, chưa commit/push.
Không thay số submitted/processed/pending, API/quyền/session/DB hoặc READINESS.

## Thay đổi

- Sky: thay chim vàng dùng chung với rừng bằng chim xanh thân/cánh riêng; thêm
  lông vũ trôi và khí cầu xa nhỏ tái dùng hai asset balloon/basket. Giữ tông
  đào–kem/wine, main balloon, diều và máy bay.10file/14image instances, mới3ảnh;
  cảnh rừng không đổi. Cánh/lông/khí cầu xa cùng manual/visibility pause boundary.
- Ocean: giữ nước mint, cá vàng; thêm cá xanh thân/đuôi riêng, hai san hô hồng/
  vàng, sò và ốc. Bốn cá minh họa: hai vàng/hai xanh; không đại diện số hồ sơ.
  San hô root sway, ốc dịch chậm±9world units; props ở trên đường caption giữa
  bãi cát. Rút bớt chiều cao rong cũ để san hô không bị che.12file gốc dùng trong
  renderer,6ảnh mới; static fallback bổ sung coral/shell/snail.
- Bọt:14bọt có bán kính/tốc độ/lệch pha/độ lắc khác nhau, trong lòng, rim và
  highlight. Sprite hình học64×64 tạo một lần khi load; drawImage reuse,
  không blur/filter hoặc tạo radial gradient mỗi frame. Bán kính<24world units,
  x≥440 tránh vùng đọc trái, fade tại đầu/cuối vòng. Drawcalls≤33/frame gồm
  19image layers +14bubble sprites;30fps/DPR≤2/lifecycle gates giữ nguyên.

Built-in ImageGen tạo9cutout mới,144014byte WebP; [asset README/manifest](../../apps/admin-web/public/ecosystems/details-v2/README.md)
và [prompt set](ADMIN_ECOSYSTEM_DETAILS_PROMPTS.json) ghi provenance/hash. Tất cả
là raster phong cách vector-cartoon, không SVG editable. Không overwrite PNG
gốc, không thêm thư viện. Prototype `/design/aquarium` vẫn là frozen v2 cũ;
Dashboard dùng renderer ứng dụng mới.

## Kiểm chứng

PASS44tests/9files (Dashboard + renderer): hai ca mới cho bubble bounds/fade và
sprite reflection/cache preparation; renderer kiểm hai loại cá/tail, đủ coral/
shell/snail và draw budget; ca bounds/vùng đọc mở rộng cho cả4cá. Lint/typecheck/
build/bundle budget PASS. Một lượt Impeccable detector scoped[]; Taste source
lint2file0fail/0warn. Typecheck lần đầu phát hiện inferred return của loader quá
hẹp khi thêm bubble sprite, đã sửa bằng Images return contract tường minh rồi
build/typecheck đạt; không thay test để che lỗi.

CUA desktop1440×1000 xem chim xanh/chi tiết đầy đủ và Canvasready, ảnh không
nền đen. Browser giữ module cũ trước reload, đã reload/đăng nhập local và xác
nhận DOM dùng đường dẫn details-v2. Pause sky/ocean, đổi30ngày vẫn giữ cả hai,
Enterresume; mobile320×780 không tràn (scrollWidth305), số/caption không bị
san hô/đáy che. CUA850×900 xem đủ scene/chi tiết, đi review/Back rồi khởi tạo
lại đủ một Canvas và sky; sau lượt chỉnh bubble cuối không có lỗi renderer.
Backend main ready/login/CORS/queues/overview7+30 đều200 bằng session kiểm
chứng riêng rồi logout. Không mutation demo/seed/DB reset. FPS/GPU/comfort dài
hạn/cross-browser/assetfailure tương tác vẫn NOT RUN. UI QA không là humanreview.
