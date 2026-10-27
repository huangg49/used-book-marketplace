# Khu rừng nhỏ trên Dashboard —27/10/2026

Owner duyệt bể cá và yêu cầu làm phần tiếp theo, sau đó yêu cầu nhiều asset hơn.
Ô **Lượt đã xử lý** dùng cảnh rừng nhỏ, giữ tổng processed7/30ngày từ overview
API; null là “—”, zero là0. Caption Chấp thuận và từ chối giữ đúng nghiệp vụ.
Không sửa API/quyền/session/migration, không seed DB. Nhánh codex/admin-ui-refactor,
base d3b19e5 + local work trước, chưa commit/push; READINESS không đổi.

[ForestMetric](../../apps/admin-web/src/features/dashboard/ForestMetric.tsx) dùng
9asset rời từ built-in ImageGen: nền, cây, thân cáo ôm sách, đuôi cáo, chim,
cánh chim, bướm, dương xỉ, nấm. [Asset README](../../apps/admin-web/public/ecosystems/forest/README.md)
và [prompt set](ADMIN_FOREST_PROMPTS.json) lưu provenance/dimensions/hash. WebP
tổng189026byte,8cutout alpha; PNG gốc giữ ngoài repo tại generator default.
Giữ hình đơn giản/cute theo yêu cầu owner, không dựng nhân vật bằng SVG/CSS.

CSS ghép cây xa/gần, cáo/đuôi, chim/cánh, bướm, fern/nấm và3đốm sáng hình học.
Transform/opacity loops lệch nhịp, không Canvas/rAF mỗi frame hoặc dependency
mới. Cây nghiêng≤1.3°, fern≤2.5°, cáo thở scaleY≤1.018, chim nhảy5px, bướm
trôi trong14×20px; vùng tiêu đề/con số trên trái giữ thoáng. Caption giữa chân
rừng. Ba cây/hai fern dùng lại cùng asset, không gọi là năm ảnh riêng.

[Playback boundary](../../apps/admin-web/src/features/dashboard/forest-playback.ts)
đợi mọi ảnh decode, pause khi offscreen/hidden/blur/pagehide, resume khi phù hợp;
manual pause giữ qua đổi kỳ/refetch/pageshow. Cleanup observer/listeners, chặn
async completion sau unmount. Ảnh lỗi giữ DOM số liệu/các ảnh tĩnh còn tải được,
có nút Tải lại cảnh để retry riêng phần hình. Authored animation vẫn chạy khi
OS reduced-motion theo owner; scoped duration và play-state override giữ các
clock, không đổi setting máy. Cá/cáo/chim/bướm không biểu thị số hồ sơ.

PASS40tests/8files gồm3test mới: số null/zero/tổng/kỳ; lifecycle loaded/manual/
offscreen/hidden/focus/pageshow; dispose/stale readiness. Admin lint/typecheck/
build/bundle budget PASS. Taste source lint0fail/0warn. Detector một lượt còn
advisory #9e5750 separator wine cũ ở Dashboard, không chỉnh ngoài phạm vi.
Kiểm ảnh thật qua metadata/alpha và HTTP/browser; CUA desktop1440×1000 xem đủ
12image instances/9file tải được, không nền đen; nút dừng đồng bộ14animated
elements, Enter resume, giữ pause khi đổi30ngày. CUA mobile320×780 không tràn
ngang (scrollWidth305), tablet850×900 đủ cảnh/chữ, đi review và Back khởi tạo
lại đúng một scene. FPS/GPU/comfort dài hạn/cross-browser/ảnh lỗi tương tác NOT RUN;
test server markup/lifecycle không thay các ca đó. Không gọi human review PASS.
