# Tích hợp entrance rèm2D — 13/10/2026

Branch `codex/auction-stage-curtains`, sau art/motion checkpoint8c0afdb.
Integration `88d3311`; chỉnh theo yêu cầu nhanh hơn:1500ms thay3000ms, ngắn50%.
Retime2,1giây `fd38a97`; chủ dự án chốt1,5giây.
Speed checkpoint `eaa4c61`; owner approved trying navbar continuity.
Navbar checkpoint `7cd7f6d`; chủ dự án chốt1,5giây.
Duration checkpoint `04b6b72`; chủ dự án yêu cầu gom hai bên gọn hơn.
Side fit checkpoint `d7c870b`; chủ dự án muốn diềm trên gọn hơn.
Valance checkpoint `eb36aff`; chủ dự án muốn fade nhanh gấp đôi và diềm thấp thêm.
Subject: `fix(web): accelerate curtain exit and lower valance`. Model giữ clock3000ms,
retime tại controller; poses/attachments/cleanup/fallback giữ nguyên.
Chủ dự án duyệt bản motion và yêu cầu thực hiện bước tích hợp; bản tích hợp
đang chờ chủ dự án xem lại. Không push/merge/deploy.

Entrance riêng trong AuctionListPage, portal ra body/z50 bên dưới navbar z60,
aria-hidden/pointer-inert, không inert trang/khóa scroll. Hero bỏ rèm nhung cũ và
arrival riêng; sách/bục/chim/giá/query/API như cũ. Không thêm preview controls,
navbar mẫu hoặc dữ liệu giả vào sản phẩm. Cả khung biến mất sau1385ms; nhịp kéo mở giữ như base1500ms.

Renderer và13PNG giữ nguyên bản đã duyệt; model dùng rig đó +SIDE_WIDTH0,8;14instance pose both bao gồm
socket5pendant, clip mảnh dây thừa và điểm treo tua. Static data là art, không là
auction data. Portrait giữ meshes phủ màn hình, y/height/translation diềm/tua
giới hạn1,5× horizontal scale để tránh kéo dài quá mức. Lượt inspect đầu phát
hiện portrait diềm cao, đã chỉnh cùng một batch và xác nhận tỉ lệ sau chỉnh.

Điểm bắt đầu rèm theo chiều cao hàng navbar được giữ sẵn:76px desktop/72px
mobile, hoặc header thực nếu cao hơn. Header.tsx chỉ thêm data marker, không đổi
style/menu/navigation. Observer cập nhật khi viewport/header đổi kích thước.
Navbar không bị primer/diềm thay thế lúc đổi route; opening pace vẫn như base1500ms; total1385ms.

Theo yêu cầu mới, bề ngang silhouettes mở/gom inner giảm20%; outer mesh và
rope/tassel x/width thu cùng hệ số. Closed inner overlap giữ nguyên, đường pull
đổi liên tục tới edge mới. Viền shader/fallback dùng geometry mới; diềm/pendant
không sửa ảnh hoặc điểm treo. Preview art giữ checkpoint rộng cũ để đối chiếu,
runtime là biến thể hẹp đang chờ duyệt. Renderer/PNG byte contents không đổi.

Diềm trên thấp hơn19,25% bằng valanceHeight0,8075 trên y/height/translation của
cả3diềm và5pendant. Mọi lớp top cùng hệ số nên các điểm treo không bị tách.
Không tạo/sửaPNG, không thay độ rộng hai bên hay navbar.
Timing controller giữ tốc độ mở/lắng trước1270ms; đoạn fade230ms rút xuống115ms
(1270→1385ms), cùng easing. Diềm0,85 nhân thêm0,95, y/height/translation
của3diềm+5pendant cùng scale để giữ attachment.
Ảnh desktop/mobile và video đã cập nhật trong lượt kiểm này.

## Kiểm chứng thực chạy

- `pnpm --filter @used-books/user-web lint`: PASS.
- `typecheck` và `build`: PASS; build tsc rồi Vite, giữ warning chunk>500kB.
- `test`:143PASS/21file, gồm7geometry tests trên model runtime: closed overlap,
  symmetry/final footprint giảm20%/outer width152design px, continuity, mesh không
  đảo, recovery không bật lần hai và attachment theo cùng socket. Renderer không đổi. Hai timing test xác nhận pace trước fade, fade duration115ms/
  midpoint opacity0,5, continuity/clamp.
- `test:auction-stage:browser`: PASS theo [runtime.json](runtime.json).
  Suite đã thay invariant của WAAPI nhung bằng behavior của entrance toàn trang.
  Chromium1440×900,390×844 và resize768×900; dữ liệu/ảnh bìa fixture có nhãn QA.
  StrictMode1opening, duration1800 dưới reduced preference, finite resource
  detach; filter/price update không replay, Home→Back mở lại. Closed screenshot
  trước/sau ẩn root nội dung0pixel đổi desktop/mobile trong vùng dưới navbar.
  Navbar geometry/hit testing và vùng pixel kiểm riêng:3sample desktop delta0;
  mobile delta tối đa1/255 tại viền cong nút menu (27channel). Strict comparison
  ban đầu thất bại do rounding antialias compositor ở18pixel border, không che
  navbar; đổi tolerance1channel và lưu số đo thật, không bỏ assertion.
  Home navbar→Auction/Back đều giữ thanh; Resize giữ thời gian.
  Focus/pointer/scroll>24px sau first tick/hidden giải phóng ngay. Context loss
  Canvas fallback giữ clock; Canvas2D full rig; noCanvas mở content. Failed/slow
  art bị bỏ trong1200ms và không sống lại khi ảnh về muộn. Pending/empty/APIerror/
  photo retry giữ content thật theo state. JSerror0. Không gửi bid/DB/bucket writes.
- IAB mở `http://127.0.0.1:5174/auctions`, reload/Home→mobile navbar→Đấu giá; DOM ghi WebGL+WebGL/time3000,
  frame đã kết thúc. API local không có kết nối ở phiên này; live books/prices/
  photos NOT RUN. Bản IAB hiển thị error recovery thật.
- Detector1run trên entrance CSS/TSX/runtime/Hero:0finding; không là đánh giá
  thẩm mỹ hoặc nghiệm thu performance. Docs checker/diff check PASS.

Ảnh [đang mở desktop](opening-desktop.png), [gom desktop](gathered-desktop.png),
[đang mở mobile](opening-mobile.png), [gom mobile](gathered-mobile.png),
[sau mở desktop](desktop.png), [sau mở mobile](mobile.png), closed desktop/mobile,
pending/empty/error nằm cùng thư mục. Pose screenshot dừng clock bằng instrument
RAF riêng của test; không có hook seek/pause test trong code sản phẩm.
[opening.webm](opening.webm) quay chuỗi tự chạy trong Chromium trên app thật
với synthetic API/cover fixtures; video không là bằng chứng60FPS/mobile thật.
Repeated hard navigation trong harness có thể giữ scroll: go() đặt scroll0 trước
test clock để chụp điểm vào trang, không sửa scroll settings của người dùng.

## Giới hạn và bước tiếp

Live API, physical phone, Safari/native/speech/actual zoom/continuous FPS: NOT RUN.
PNG khoảng4MiB cold download; fallback1200ms cố ý bỏ trang trí trên kết nối chậm.
Không nhận các ca headless là gate performance. Chưa thay READINESS hoặc API/WIP.
Chủ dự án xem lớp rèm trên trang; dừng để duyệt trước thay đổi Hero hoặc navbar.
