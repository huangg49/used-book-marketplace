# Sân khấu Hero Đấu giá — 13/10/2026

Source: nhánh `codex/auction-stage-curtains`, base `bd3bb1f`.
Phạm vi: Hero của `apps/user-web`, không đổi API/session/nghiệp vụ.
Hướng chủ dự án duyệt: chim lớn ở tiền cảnh, ba sách tách nhau trên bục oval
thấp, hai rèm nhung vén hai bên mỗi lần thực sự vào trang Đấu giá.

## Bằng chứng hiện tại

- Desktop1440×900: [đóng](closed-desktop.png), [đang mở650ms](opening-desktop.png),
  [toàn trang](desktop.png), [Hero sau mở](hero-desktop.png).
- Mobile390×844: [đóng](closed-mobile.png), [đang mở650ms](opening-mobile.png),
  [toàn trang](mobile.png), [Hero sau mở](hero-mobile.png).
- [Laptop1280×600](laptop.png), [tablet768×900](tablet.png),
  [320px/chữ gốc200%/tên dài/một phiên](large-type.png).
- [Đang tải](pending.png), [trống](empty.png), [lỗi đọc](error.png),
  [lỗi ảnh có tải lại](image-error.png).

Mọi phiên và bìa trong các ảnh là fixture giả lập, có nhãn QA; không phải dữ liệu
sản phẩm hoặc bằng chứng live API/Supabase/custody. Browser harness chỉ intercept
HTTP và đổi cache UI; không ghi API/Mongo, đặt bid hoặc mua ngay.
Ảnh đóng/đang mở chụp viewport; ảnh settled chụp full-page; hai ảnh Hero là crop
trực tiếp của section. WAAPI chỉ pause/seek trong storyboard QA.
Video chuyển động liên tục Chromium được ghi riêng ở `.tmp/auction-stage/opening.webm`
(local, không commit). Không suy FPS từ screenshot hoặc video.

## Kiểm tra

Node24.19.0/pnpm11.19.0 (bundled runtime):

- `pnpm --filter @used-books/user-web lint`: PASS, oxlint0 lỗi.
- `pnpm --filter @used-books/user-web test`: PASS141/141,20file.
- `pnpm --filter @used-books/user-web build`: PASS TypeScript/Vite;
  warning bundle>500kB có sẵn, chưa xử lý ngoài phạm vi.
- `pnpm --filter @used-books/user-web test:auction-stage:browser`: PASS;
  [runtime](runtime.json) ghi từng kiểm tra, không có pageerror.
- Một detector pass trên bốn file Hero/Curtains: [kết quả](detector.json) `[]`.
- WebP provenance scan:1raster,0missing; asset37KB và
  [prompt/tool/provenance](../../../apps/user-web/public/illustrations/auction-stage/velvet.webp.json).

Kiểm tra route: StrictMode chỉ một lần mở; Home→Back mở lại; filter URL và giá
query-cache không replay; focus mở ngay và link kệ chuyển focus; resize/tabẩn/
ngoài viewport/unmount/partial setup failure có unit coverage và cleanup.
Không có WAAPI hoặc texture lỗi thì nội dung mở sẵn. Giữ đủ1284ms khi Chromium
`reducedMotion=reduce`, theo chính sách chủ dự án; scene600ms overlap từ360ms.

DOM fold bounds chỉ chứng minh các hình chữ nhật overlap. Kiểm tra pixel riêng
chụp Hero đóng trước/sau khi ẩn nội dung phía sau, giữ layout và clock: zero pixel
thay đổi trên desktop/mobile (ngưỡng sai khác kênh3). Nếp vải được rasterize ở
chiều rộng đóng rồi co nhỏ; không phóng lớn strip nhỏ gây khe xuyên nền.
Ảnh đang mở dành cho visual review; không coi overlap là bằng chứng pixel.

## Review và giới hạn

Fresh AI finish review ban đầu: `fix` cho khe vải mobile, claim kiểm tra quá mức
và brief/checkpoint cũ. Batch sửa giữ nguyên hướng và toàn bộ nội dung factual;
recapture cùng15ảnh. Verdict pass cuối: **`ship`**, cả ba điểm được chấm
**resolved**: vải liên tục, evidence đúng phạm vi, brief/checkpoint hiện hành.
Reviewer không thấy regression trong15recapture; verdict chỉ bao phủ ba điểm sửa.
Documenter kiểm source/runtime/provenance/cả15ảnh, consolidate brief route và
bảo toàn hệ thống chung. `pnpm docs:check` và `git diff --check`: PASS.
AI review không thay human sign-off hoặc mở release gate.

Live API/ảnh đấu giá thật, Safari, physical phone/native, speech screen reader,
actual browser zoom, forced-colors runtime và continuous FPS trace: **NOT RUN**.
200% root font không tương đương browser zoom. Global DESIGN/sidecar giữ nguyên;
brief route supersede số đo Hero cũ trong phạm vi component.
