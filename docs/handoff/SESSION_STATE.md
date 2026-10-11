# Điểm lưu hiện tại — 11/10/2026

Snapshot tổng quan: main `da59199`; docs context `d77290a`, docs refresh `2e13f04`.
Checkout/gói Android hiện hành và primary main mới được ghi bên dưới.
OpenAPI0.31.0,16 migration Mongo,114 operation HTTP trên nhánh bộ lọc hiện hành. Đây là trạng thái theo Git/
source; remote CI hiện tại và human sign-off chưa được xác minh trong hai gói docs.
Tổng quan: [PROJECT_CONTEXT](PROJECT_CONTEXT.md); [inventory](PROJECT_CONTEXT_INVENTORY.md).

## Gói thiết kế web Member — logo mới và tiệm sách nhiều màu

- Chủ dự án đã duyệt [kế hoạch](../design/WEB_MEMBER_NEXT_PAGES_PLAN.md) sau
  `6d6b6a8`: Tìm sách → Chi tiết → Đăng sách, sau đó tài khoản/chat/đấu giá.
  Nhóm Tìm sách11/10 đã triển khai đầu trang gọn/sidebar/kệ4–5cột/2mobile,
  panel native Apply/Reset,20cuốn/trang; preview91ấn bản tách nhánh API thật.
  Build/typecheck/25unit PASS; lint0error/6warning cũ. CUA desktop/mobile/filter/
  cursorpreview/Back/error/retry PASS; QA Nest/Mongo13bài storagefake đã dọn.
  Review độc lập FIX docs/nút40px; đã merge canonical/tăng44px, verdict SHIP
  cho hai fix. docs/diff PASS. [Evidence](../design/WEB_MEMBER_REDESIGN.md).
  Full integration/native/200%/human NOT RUN; READINESS không đổi.
  Checkpoint subject `feat(web): refine catalog search and mobile filters`;
  local, chưa push. Chi tiết tiếp nối đã hoàn thiện gallery thumbnail/native
  viewer, metadata hai cột và giữ query kệ khi quay lại. Build/typecheck25unit
  PASS; lint0error/6warning cũ. CUA4viewport không tràn, viewer/keyboard/Escape/
  focus/body-scroll, guest return và Back PASS; QA riêng đã dọn. Review SHIP,
  canonical scoped merge; owner/held/ảnh lỗi/200%/native/human NOT RUN lượt này.
  Checkpoint subject `feat(web): refine book detail photo gallery`; local chưa
  push. Đăng sách tiếp nối đã thay form legacy bằng bàn soạn5bước/preview,
  condition/ownership rõ, bảo vệ thoát và giữ closure retry. Build/typecheck/
  25unit PASS; lint0error/6warning cũ. CUA4viewport/validation/giữ dữ liệu/
  ảnh/thoát-hủy/gửi/reset PASS. Nest/Mongo *_test storagefake xác nhận đúng1bài
  PendingReview với1ảnh và hai giá. Reviewer FIX viền, đã đổi token tương phản,
  closure SHIP; canonical merge. Fullintegration/browser lost-response/200%/
  native/human/beforeunload UI NOT RUN. READINESS không đổi; local chưa push.
  Checkpoint subject `feat(web): redesign book posting workspace`.
  Kệ Tài khoản tiếp nối đã dùng owner API/cursor/trạng thái và hai giá thật;
  bỏ dashboard demo, mobile dùng menu có nhãn. Register hiển thị chưa mở theo
  contract, không nhận đăng ký. Build/typecheck/28unit PASS; lint0error/6warning
  cũ. CUA4viewport/filter/Back/metadata-retry/menu/logout/guest-return/error PASS;
  QA riêng đã dọn. Review độc lập SHIP; canonical scoped merge/docs/diff PASS.
  Browser>20pagination/200%/native/human và mọi trạng thái populated NOT RUN.
  Checkpoint subject `feat(web): replace account mock dashboard with owner shelf`;
  local chưa push, READINESS không đổi. Account checkpoint `8d9cdf0`.
  Chủ dự án đã duyệt [plan Tìm sách/bộ lọc](../design/WEB_SEARCH_FILTER_REFINEMENT_PLAN.md).
  Đã triển khai panel264px ghim dưới navbar, tình trạng hai cột, giá và action
  nằm ngang, native select khi viewport thấp/giá sai. Mobile cuộn thân dialog,
  action đáy luôn hiện. CUA1366×768/1535×735 đủ control tại scrollY0 kể cả lỗi;
  320px đọc đủ giá sáu chữ số. Sticky/draft/Apply/reset/Back/cursor/rỗng/lỗi/retry
  PASS; build/typecheck/28unit PASS, lint0error5warning cũ. Review độc lập SHIP
  cho hai material fixes; canonical scoped merge/preservation/docs/diff PASS.
  200%/OS keyboard/native/live-success/fullintegration/human NOT RUN. READINESS
  không đổi. Checkpoint subject `feat(web): pin compact catalog filters`;
  local chưa push. Vite5186 giữ chạy để chủ dự án xem preview.
  Sau checkpoint `aadbd88` (preview8thể loại), chủ dự án duyệt mở rộng bộ lọc
  theo danh mục trên nhánh `codex/catalog-contextual-filters`:10 nhóm chính+
  Sách khác,29nút/16facet; OR trong nhóm/AND giữa nhóm, phụ thuộc chứng chỉ/lớp.
  Search URL/Apply/chip/Back/giá trị đổi và sidebar dài tự nhiên; chỉ ghim khi
  vừa vùng nhìn. Form tái dùng đầu sách Confirmed hoặc đề nghị metadata mới;
  API lọc trước cursor, Admin đọc nhãn, optional fields/legacy giữ tương thích.
  OpenAPI0.31.0/migration0016 (chỉ QA)/shared vocabulary catalog-v1; chưa có
  Admin CRUD vocabulary. Preview97ấn bản, thuộc tính/giá/tình trạng là mẫu.
  API119/Web34/Admin15unit,105E2E,Mongo39PASS4SKIP; build/typecheckAPI/Web/Admin,
  RNtypecheck,contract/routes PASS; lint0error/Web5warning cũ. CUA2laptop,
  390/320px/màn thấp,context prune/picker thật/form/Admin PASS. QA riêng Mongo8.0
  và storagefake; [chi tiết/giới hạn](../design/CATALOG_CONTEXTUAL_FILTERS.md).
  Browser200%/OSkeyboard/native runtime/Supabase/mainDB migration/fullintegration/
  human NOT RUN. Review SHIP cho2materialfixes (URLmalformed/draftmobile),
  QA riêng đã dọn, Vite5186 preview giữ chạy/proxy trảAPI3000 (đang tắt).
  Finish documenter đồng bộ Search canonical/surface, parity/preservation PASS;
  tokens/surface khác giữ nguyên. Chi tiết trong báo cáo; READINESS không đổi.
  Checkpoint subject `feat(catalog): add contextual classification and search filters`;
  local chưa push. Bước tiếp: chủ dự án xem preview và chạy migration theo setup
  trước khi sử dụng metadata mới trên DB chính.
  Chat/Thông báo còn source UI uncommitted; QA/reviewer/documenter chưa hoàn tất.
  Browser phát hiện race join trước auth socket hoàn tất (Unauthorized); chưa
  sửa API hoặc nhận Chat PASS. QA5190/API3009 disposable đã dừng, không đụng
  dữ liệu chính. Bước tiếp: chủ dự án xem Search, Chat vẫn là gói còn mở.
- Sau `1101fac`, chủ dự án báo OS giảm chuyển động làm mất hiệu ứng mới.
  Home nay giữ đầy đủ animation cả khi reduced-motion=true: tán lá12s,
  sáu lá nền16–19s, card lift240ms/banner320ms, filter180ms/card thêm220ms,
  cáo settle650ms một lần. Override chỉ trong Home; giữ observer/visibility/
  cleanup, hero/bookmark/navbar và layout. Không đổi API/routes/data/dependency.
  Build/typecheck PASS; lint0error/6warning cũ; docs/diff PASS. CUA1535×900
  reduced=true xác nhận tán lá đổi matrix theo thời gian, lá dịch chuyển,
  card focus scale1.025/lift5px/240ms; vùng khuất pause, không tràn ngang.
  Reviewer độc lập SHIP. Fox timing/document-hidden simulation/FPS/backend/
  native/human NOT RUN; 22unit đã PASS ở1101fac, không chạy lại cho fix preference.
  [Evidence](../design/WEB_MEMBER_REDESIGN.md). DESIGN/canonical/surface đồng bộ.
  READINESS giữ nguyên. Checkpoint subject
  `fix(web): retain home motion with OS reduction enabled`; local, chưa push.
  Bước tiếp: chủ dự án tải lại Home để xem hiệu ứng trên máy đang giảm motion.
- Sau `ed24784`, thay Chúa nhẫn thứ hai ở hero bằng Truyện Kiều — Nguyễn Du
  do chủ dự án gửi; giữ một Chúa nhẫn và đủ tám bìa, bố cục/hiệu ứng không đổi.
  Asset WebP363×560/~50KB có provenance/hash. Build/typecheck PASS;
  browser1535×735 tải đủ tám ảnh, không tràn ngang. [Ảnh](../../.impeccable/review/web-member/home-truyen-kieu.jpg).
  Backend/native/200% NOT RUN; READINESS giữ nguyên.
  Checkpoint subject `fix(web): replace duplicate hero cover with Truyen Kieu`; local, chưa push.
  Bước tiếp: chủ dự án xem hero với bìa mới.
- Sau `a860408`, gộp nguyên lời mời đăng sách/link /sell vào cảnh mùa thu:
  đồi z0, wine card z1, cáo alpha z2 chồng nhẹ mép card; desktop trái/phải,
  mobile trên/dưới. Wrapper accessible, chỉ art hidden/pointer-inert. Giữ hero/
  bookmarks/tán lá/24 motif/kệ/footer/API. Hai asset ImageGen có full provenance.
  Build/typecheck/lint PASS (0error/6warning cũ; bundle warning đã biết).
  CUA1535/1000/390/320px không tràn, action rõ, footer gap0; mobile capture
  chỉ CTA/đầu cáo. Detector một lượt8advisory; reviewer độc lập SHIP/không fix.
  Canonical scoped merge; docs/diff PASS. [Evidence](../design/WEB_MEMBER_REDESIGN.md).
  Backend/native/human/200% NOT RUN; READINESS giữ nguyên.
  Checkpoint subject `style(web): layer posting invitation over autumn hills`; local, chưa push.
  Bước tiếp: chủ dự án duyệt tổng thể Home.
- Sau `912ecec`, giữ hero y nguyên; bookmark desktop144px/chim88px/padding đáy24px.
  Mobile152px/88px không đổi. Build/typecheck PASS; CUA1535×735/1366×768 hàng
  đủ trong khung đầu,390px vẫn2×2; không tràn ngang. [Evidence](../design/WEB_MEMBER_REDESIGN.md).
  Actual hover/200%/backend/native/human NOT RUN; READINESS giữ nguyên.
  Reviewer độc lập ship, không material fix; docs/diff PASS.
  Checkpoint subject `fix(web): compact bookmarks without shrinking hero`;
  local, chưa push. Bước tiếp: chủ dự án xem trên laptop.
- Sau `7af062d`, dấu sách880px/gap32px, chim104/88px, góc8px/khía sâu hơn,
  viền nhẹ/texture giấy login và nét chỉ wine. Hover bóng theo giấy; focus không
  clip. Giữ hero/routes/API/session. Build/lint PASS (6 warning cũ); CUA5width
  không tràn,4ảnh/label/notch/focus PASS; actual hover/200%/native/backend/human
  NOT RUN. Reviewer độc lập ship, không material fix; docs/diff PASS.
  [Evidence](../design/WEB_MEMBER_REDESIGN.md). READINESS giữ nguyên.
  Checkpoint subject `feat(web): soften paper bookmark shortcuts`; local, chưa
  push. Bước tiếp: chủ dự án xem bản thử.
- Sau `6beee98`, thử bốn dấu sách kem/vàng thay hộp pastel theo duyệt chủ dự án.
  Chim88/72px trên nhãn ngắn, khía SVG/viền1px, nối hero12px, không clip focus.
  Hero đáy32px giữ caption cách20px; thêm chim cầm búa alpha256px/51KB, ba ảnh
  cũ giữ nguyên. Bốn route/kệ/logo/session/API không đổi. Build/typecheck/lint
  PASS (6 warning cũ); CUA6width không tràn, laptop hàng trọn khung mở đầu,
  keyboard4route/focus/4ảnh PASS. Scan trước sửa0finding;200%/actual mouse hover/
  native/backend giao dịch/human NOT RUN. [Evidence](../design/WEB_MEMBER_REDESIGN.md).
  Reviewer độc lập ship, không material fix; docs/diff PASS. READINESS giữ nguyên;
  checkpoint subject `feat(web): refine home bookmark shortcuts`;
  local, chưa push. Bước tiếp: chủ dự án xem bản thử.
- Sau `708f8da`, ô khám phá thứ ba đổi từ “Đến 100.000₫” thành “Đấu giá”, dùng
  ROUTES.auctions (/auctions). Giữ màu đào/chim ôm ví; bộ lọc ngân sách trong kệ
  và banner giá giữ nguyên. Build/typecheck/lint PASS (6 warning cũ), CUA Enter
  mở đúng “Phiên đấu giá đang mở”; [ảnh](../../.impeccable/review/web-member/home-auction-shortcut.jpg).
  Docs/diff PASS; không kiểm backend đấu giá/native hoặc đóng gate READINESS.
  Checkpoint subject `fix(web): link home shortcut to auctions`; local, chưa push.
- Sau `6196b88`, ẩn dải thông báo preview và link “Xem bài đăng thật” theo yêu
  cầu chủ dự án; bốn ô khám phá theo ngay hero. Bỏ CSS không dùng; caption hero,
  heading/nhãn mẫu trên card, preview source và data=live giữ nguyên.
  Build/typecheck/lint PASS (6 warning cũ); CUA1366/390 không có banner/tràn ngang,
  bốn link còn đủ. [Ảnh](../../.impeccable/review/web-member/home-notice-hidden-desktop.jpg).
  Docs/diff PASS; backend/native/200% NOT RUN, READINESS giữ nguyên.
  Checkpoint subject `fix(web): hide home preview notice`; local, chưa push.
- Sau `a704bdf`, Home có bốn ô mua/đổi/ngân sách/đăng màu vàng kem/mint/đào/tím,
  kèm bộ4 chim cánh cụt image_gen local alpha,256px/~50KB. Desktop4/mobile2×2;
  hình72/56px, full-link, hover lift2px/viền wine, focus/reduce motion giữ rõ.
  Không đổi hero/logo/kệ/API/session. Build/lint0error6warning cũ PASS; CUA5width
  không tràn,4ảnh và keyboard/four-route checks PASS;200%/actual hover NOT RUN.
  Scan layout trước sửa0finding; native/backend thành công/DB/human NOT RUN,
  READINESS giữ nguyên. Evidence/provenance ở [brief](../design/WEB_MEMBER_REDESIGN.md).
  Reviewer độc lập disposition ship, không material fix; docs/diff PASS.
  Checkpoint subject `feat(web): add penguin discovery shortcuts`; local, chưa push.
- Sau `10358bb`, thu gọn card riêng Home theo duyệt của chủ dự án:5 cột laptop,
  6 desktop rộng,4/3/2 ở mốc1100/850/600px; khung bìa200/180/160px, title hai dòng
  vẫn giữ tên đầy đủ/tooltip, nguồn44px. Kệ chính10/thêm10, chủ đề10/kệ, đổi4.
  Hero/Search mặc định/API/session/91edition và nhãn mẫu giữ nguyên. Build22unit
  PASS/lint0error6warning cũ; CUA6width không tràn, expansion/filter/reset/title
  PASS. Scan layout một lượt0finding;200%/ảnh lỗi chưa chạy lại, backend thành công/
  DB/native/human NOT RUN. READINESS giữ nguyên; ảnh/giới hạn ở [brief](../design/WEB_MEMBER_REDESIGN.md).
  Reviewer độc lập disposition ship, không material fix; docs/diff PASS.
  Checkpoint subject `feat(web): compact home book shelves`; local, chưa push.
- Sau `100f872`, mở rộng Home preview lên91 Open Library editions/tám thể loại:
  15văn học/6kỹ năng/7kinh doanh/8khoa học/6lịch sử/8thiếu nhi/25manga/16LN.
  Kệ đầu xen tám nhóm; thêm ba kệ chủ đề4sách/kệ và link lọc/đường về toàn bộ.
  Giữ nguyên hero, cache metadata+remote covers, không dùng sách
  hero cho kệ/banner. Giá/tình trạng/mua-đổi mẫu có nhãn; card chỉ mở nguồn,
  không tạo người bán/media/giao dịch hoặc ghi DB. Env/query bật preview;
  data=live ưu tiên, production tắt; backend lỗi không fallback. Search/filter/
  budget hoạt động trong Home preview; Header/Search/Detail vẫn API thật.
  Build/typecheck22unit PASS/lint0error6warning cũ; CUA4width/filter/expansion/
  topic/live-error isolation PASS, chữ200% chưa chạy lại. Detector4advisory hero
  legacy; metadata/bìa upstream
  đã dùng thật, backend thành công/DB/native/human NOT RUN, READINESS giữ nguyên.
  Reviewer độc lập3capture disposition ship, không material fix. Preview bật ở
  config local riêng máy, không commit env. Hướng dẫn và evidence ở
  [brief](../design/WEB_MEMBER_REDESIGN.md).
  Checkpoint subject `feat(web): broaden preview catalog and home subjects`. Local, chưa push.
- Sau `973e3c4`, Home giữ nguyên hero, body theo yêu cầu tham khảo Fahasa và
  kết hợp thể loại + mua/đổi + giá: lối vào nhanh, kệ mới đăng, banner ngân sách,
  kệ đổi và CTA đăng sách. API chỉ hỗ trợ mode/giá; thể loại lọc cục bộ tối đa24
  bài trong kệ, ghi rõ phạm vi; không mở rộng contract/backend. BookCard compact
  là tùy chọn riêng Home, Search/AuctionCard giữ hành vi cũ. Build/typecheck16unit
  PASS/lint0error6warning cũ;7width100/130/200% fixture và CUA desktop/cửa sổ thật
  PASS layout/filter/link/states. API3048 không chạy; API thật/native/human NOT RUN,
  READINESS giữ nguyên. Detector một lượt12advisory (8legacy ngoài diff,4role mới
  ghi canonical), provenance11raster0missing. Documenter cập nhật canonical/parity
  PASS; reviewer độc lập8capture disposition ship, không có material fix;
  docs/diff PASS. Ảnh và giới hạn ở [brief](../design/WEB_MEMBER_REDESIGN.md).
  Checkpoint subject `feat(web): redesign home discovery shelves`. Local, chưa push.
- Sau `f79e81f`, bỏ viền focus đỏ bên trong input tìm sách Home theo ảnh chủ dự
  án; focus chuyển ra mép ngoài thanh search màu vàng2px/offset4px, không đổi
  submit/query hoặc CSS global. CUA xác nhận input border0/outline none khi focus,
  outer focus còn hiện; build/typecheck PASS. Ảnh `home-search-focus.jpg` trong
  `.impeccable/review/web-member`. Checkpoint local, chưa push.
- Sau `1e569eb`, Login thêm texture giấy kem local512px/85%, gạch vàng headline;
  theo correction chủ dự án đã bỏ hình sách, “Lại gặp nhau rồi.” một hàng bình
  thường và wrap khi chữ lớn. Ánh sáng nền2400ms một lượt rồi tắt, reduce-motion
  bỏ hiệu ứng. Không đổi ảnh/logo trái hoặc auth. Build/typecheck PASS, lint0error
  6warning cũ;9viewport100/130/200% fixture/material QA và CUA PASS, tương phản
  muted tối thiểu4.73:1. Provenance1raster0missing; canonical được documenter cập
  nhật; reviewer độc lập8capture disposition ship, docs/diff PASS.
  API thật/native/human NOT RUN, READINESS giữ nguyên; ảnh ở brief.
  Checkpoint subject `feat(web): add subtle paper material to login`. Local, chưa push.
- Sau `5c88499`, Login bỏ masthead đỏ riêng, logo gốc được key nền thành alpha
  bằng SVG filter trên ảnh; mobile có vùng ảnh logo gọn, home trên nền giấy.
  Form400px/title2.5rem/input trắng52px, thêm Quên mật khẩu/Đăng ký dạng disclosure
  thông báo chưa hỗ trợ vì API chưa có register/reset; không request giả hoặc
  đổi session/handler/Register. Build16unit PASS/lint0error6warning cũ;
  9viewport100/130/200% response fixture và CUA desktop/mobile PASS, ảnh ở brief.
  Docs/diff PASS; documenter cập nhật canonical, reviewer chấm persistence resolved.
  API thật/native/human NOT RUN, READINESS giữ nguyên. Checkpoint subject
  `feat(web): overlay login branding and refine account actions`. Local, chưa push.
- Sau `6de0289`, Login dùng ảnh bookstore Unsplash local, blur2px/tint đỏ64%,
  desktop45/55 và form400px/52px control, logo/home riêng; <=900px chỉ form.
  Handler/session/returnUrl/Register giữ nguyên. Build/typecheck16unit/lint0error
  6warning cũ PASS;9viewport100/130% response fixture và CUA PASS, ảnh ở brief.
  Docs/diff PASS. Detector2advisory credit/footer; canonical Login được documenter cập nhật và
  reviewer kiểm finding persistence. API thật/native/human gate NOT RUN, không
  đổi READINESS. Checkpoint subject `feat(web): frame login with a warm bookshop photograph`.
  Local, chưa push/PR/merge/deploy.
- Sau `29ff82e`, navbar morph360ms + viền kem sáng nhẹ trong collapse rồi tắt;
  expand hủy ngay, lần thu sau replay. Chủ dự án yêu cầu hiệu ứng thấy được trên
  laptop reduce-motion, nên giữ360ms riêng navbar, không sửa preference/global.
  Focused desktop/390/320 reduce/no-preference PASS width/edge/replay/reversal/
  no jump; CUA xác nhận sáng rồi về0. Build/typecheck/16unit/lint6warning cũ/docs/
  diff PASS; detector6advisory legacy ngoài diff. Ảnh ở brief; API/native/gate
  giữ nguyên. Checkpoint subject `feat(web): illuminate navbar edge during compact transition`.
  Local, chưa push/PR/merge/deploy.
- Sau `4cffb71`, navbar shared Member web đã gọn76px→64px và bo/nổi khi scroll,
  slot ổn định; mobile72px, menu/notification popup không tràn ở320px/130%text.
  Focused7viewport khách + authenticated response fixture PASS: scroll/return/no
  jump, menu/Escape/focus/route/resize, skip/reduced motion/layout consumers.
  CUA desktop/mobile và build/typecheck/16unit/lint6warning cũ/docs/diff PASS;
  detector một lượt có advisory legacy/scale,32px nav radius được duyệt/ghi DESIGN.
  [Brief](../design/WEB_MEMBER_REDESIGN.md) có ảnh/giới hạn; API3048 không chạy,
  không test auth thật/native hay đổi gate. Checkpoint subject
  `feat(web): add compact floating member navigation`. Chưa push/PR/merge/deploy.
- Sau `288a385`, thay headline Home bằng Hero text final.png chủ dự án cung cấp:
  SÁCH MỚI. CHƯƠNG MỚI. CÙNG LẬT LẠI. Giữ pixels RGBA/dấu/minh họa, chỉ bỏ lề
  alpha trống và chừa16px; raw pixel comparison PASS. H1 tương ứng/không đọc lặp,
  CSS giữ ratio/cap responsive. Build/typecheck/16unit/lint6warning cũ/docs/diff
  PASS; CUA laptop/mobile và focused9viewport100/130%text/search PASS, detector0.
  Source/evidence ở brief/brand README. Checkpoint subject
  `feat(web): use owner-designed final hero lettering`. Không đổi API/gate/motion;
  raster typography và thiếu motion stop control chưa là accessibility acceptance.
- Sau `1d9e5c5`, bỏ nút/state pause theo yêu cầu chủ dự án, sway liên tục cả hover;
  giữ offscreen/hidden và OS override. Hạ description/search20px ở laptop, mobile
  description8px; hero469px và kệ đầu vẫn hiện ở1536×730. Focused responsive/motion/
  search PASS, build/typecheck/16unit/lint6warning cũ/docs/diff, detector0findings.
  Ảnh ở brief; thiếu visitor stop control là limitation accessibility, chưa nghiệm
  thu accessibility. Checkpoint subject `feat(web): give hero copy and search more breathing room`.
  Local branch, chưa push/PR/merge/deploy; API/gate giữ nguyên.
- Sau `33f0544`, sửa tỉ lệ hero cho desktop laptop thấp: chỉ Home CSS compact
  width≥1101/height≤850, clamp chữ/bìa theo vh và nén khoảng dọc, không scale/crop.
  CUA1536×730 hero686→497px, thấy search/pause/kệ đầu;1366×650 kệ đầu vừa viewport.
  Focused9viewport100/130%text và search Enter PASS, đủ8bìa/không tràn ngang;
  layout assessment riêng + detector0findings, build/typecheck/16unit/lint6warning
  cũ/docs/diff PASS. Header/mobile/API giữ nguyên, ảnh ở brief. Checkpoint subject
  `fix(web): fit hero proportions to short laptop viewports`. Chưa push/PR/merge.
- Sau `8a871f8`, chủ dự án duyệt trang trí hero: ba SVG gốc giấy lật/sách mở màu
  kem, tĩnh/aria-hidden/pointer-none; responsive ra mép, tâm chữ/search thoáng.
  Bìa có cạnh sáng/contact/cast shadow rõ hơn và bóng hover sâu hơn, giữ sway/pause.
  Build/typecheck/16unit/lint0error6warning cũ/docs/diff PASS; focused browser
  motion và overflow1440/390/320px100/130% PASS, ảnh CUA desktop/mobile ở brief.
  Detector advisory size/màu cũ ngoài diff; proxy API3048 vẫn không chạy, kệ lỗi.
  Checkpoint subject `feat(web): illustrate hero with turning pages and cover depth`.
  Giữ quyền gói hiện tại: local checkpoint, chưa push/PR/merge/deploy.
- Sau `1c68ec3`, chủ dự án yêu cầu ép hero animate dù OS reduce-motion. Scoped CSS
  exception cho bìa, giữ manual pause/hoverpause/offscreen/hidden; không sửa Windows.
  Focused browser reduce/no-preference PASS, IAB reduce=true vẫn running6s/infinite;
  build/typecheck/docs/diff PASS. Checkpoint subject
  `fix(web): keep hero motion enabled per owner preference`.
- Sau `c06a288`, thêm sway hero±3px/±1°,6–7.5s lệch nhịp; pause/resume, hoverpause,
  tự pause offscreen/hidden; giảm chuyển động tắt. Focused Chromium motion/layout
  PASS, build/typecheck/lint0error6warning cũ/docs/diff PASS. Preview5186 khởi động
  lại; proxy API3048 hiện không chạy, kệ báo lỗi; IAB reduced-motion=true giữ ảnh
  tĩnh. Checkpoint subject `feat(web): add gentle pausable hero cover sway`.
- Sau `6c0e266`, thay bìa Gachiakuta→SAO theo ảnh chủ dự án gửi; vị trí/CSS/hover
  giữ nguyên. Build/typecheck, ảnh tải/hiện CUA, docs/diff PASS. Checkpoint subject
  `feat(web): replace Gachiakuta hero cover with SAO`.
- Sau `48e806d`, chủ dự án gửi ba bìa thay thế: Oz→Chúa nhẫn (cả hai vị trí),
  Alice→Alice mới, Pride→Nghìn lẻ một đêm; áp vào hero và ba mục khám phá Home.
  Giữ CSS/hover/API. Build/typecheck, ảnh CUA1440/390px đủ8bìa/mobile không tràn,
  provenance/docs/diff PASS. Checkpoint subject `feat(web): use owner-selected replacement covers`.
- Sau `e0b739f`, chủ dự án yêu cầu thêm bốn bìa và hover hero. Đã giữ bốn vị trí
  cũ thành tám, hai cụm2×2 desktop/4×2 mobile dưới search; hover phóng/nâng/bóng,
  touch tĩnh/reduced-motion không phóng. Focused browser QA1440–320px100/130%
  PASS đủ ảnh/không tràn/hover reset/reduced-motion/search Enter; layout assessor
  xác nhận yêu cầu đạt. Build/typecheck/lint0error6warning cũ/docs/diff PASS;
  chứng cứ và nguồn ảnh ở brief. Checkpoint subject
  `feat(web): arrange eight hero covers and add hover depth`.
- 10/10: chủ dự án báo đã merge PR31; fetch xác nhận main `dec19b3` chứa merge.
  Primary đã fast-forward sạch rồi tạo `codex/web-member-redesign` từ main đó.
  Managed worktree Android/pilot và local config/dataset được giữ.
- Chủ dự án chuyển ưu tiên sang web `apps/user-web`, sau đó đồng bộ Android theo
  thiết kế web đã kiểm chứng. [Brief](../design/WEB_MEMBER_REDESIGN.md): lát cắt
  Trang chủ→Tìm sách→Chi tiết. Chủ dự án đã thay ba sketch xanh bằng logo cú/chữ
  mới đỏ–kem và bản Bookstore Landing Page trên Dribbble. Đã triển khai Home,
  Search, Detail, shared shell/card/dialog và Login nối về đúng sách; chưa đổi API
  hoặc token storage. Giữ ảnh bài đăng thật, ảnh trang trí có nguồn/chú thích.
  Build/16unit/lint0error6warning cũ PASS; browser HTTP/Mongo riêng storage FAKE
  PASS tìm/lọc/sort/cursor/lỗi/login return/owner guard và đăng sách/replay.
  Purchase mất phản hồi→thử lại giữ key/body/version, chỉ một conversation PASS;
  Home/Detail/Search320px130% và search/sell390px100/130% không tràn ngang PASS.
  Finish reviewer chấm cả năm sửa resolved, disposition ship ở phạm vi fix list;
  DESIGN/sidecar đã cập nhật và kiểm schema/parity. Checkpoint subject
  `feat(web): redesign member discovery around new bookstore identity`.
  Scope/checks/ảnh ở brief; preview local5186 dùng dữ liệu [QA].
  Tiếp theo: chủ dự án xem bốn màn mới; form đăng sách/chat/đấu giá còn legacy,
  rồi mới đồng bộ Android theo hướng web. Chưa human usability/native/live storage
  acceptance cho gói này; không push/PR/merge/deploy theo quyền cũ.
  Các checkpoint Android bên dưới là lịch sử trước merge; READINESS giữ nguyên.

## Gói lưu sách và chuẩn bị pilot Android

- Chủ dự án yêu cầu push/merge ngày10/10. Đã tích hợp main `d71ad3e` vào nhánh
  tại `9d5874a`, giữ web của nhóm; resolve duy nhất `.gitignore` bằng UTF-8,
  giữ cả rule Taste của main và ignore runtime Impeccable. Đã push và mở
  [PR31](https://github.com/huangg49/used-book-marketplace/pull/31) cho toàn bộ
  chuỗi context/docs/design/Android/pilot đã duyệt (không chỉ commit QA cuối).
  PASS23/23 helper/demo/docs units, docs255/1830 links/4 adapters và whitespace
  của PR sau tích hợp. CI phát hiện browser harness còn nhãn/bố cục cũ; đã cập
  nhật hai journey theo UI được duyệt và PASS toàn hành trình local HTTP/Mongo
  thật, storage FAKE (search/detail/paging/lỗi/quyền, địa chỉ, đăng/duyệt sách,
  replay mất phản hồi và showcase list/grid). Giữ các assertion nghiệp vụ.
  Tại checkpoint `ee8a048`, chủ dự án sẽ review PR31; sau đó chủ dự án tự merge,
  remote main đã xác minh ở gói web bên trên. CI/review hiện hành xem PR;
  review AI không thay reviewer người thật theo TEAMWORK.
  Các dòng “không push/PR” bên dưới mô tả
  phạm vi quyền tại checkpoint trước yêu cầu tích hợp này. READINESS giữ nguyên.
- Preflight tiếp: nhánh `codex/android-pilot-qa` từ `684d2ea`, managed worktree
  `android-pilot-preflight`; subject
  `feat(qa): prepare repeatable Android pilot and verify pagination`.
  Primary hiện clean main `d71ad3e`, giữ nguyên; Android chưa tự lên main.
  Không đổi source RN/API/session/contract. Runner `pnpm qa:android` dựng QA
  riêng7 sách hoặc51 mục phân trang qua API, giữ journal/private config ignored.
  PASS native membership50+1 và5 lần Tải thêm tới mục51; pilot mới PASS login
  return/lưu/tìm lại/bỏ lưu/PUT503/GET503 recovery, buyer QA empty sau test.
  PASS12/12 tests helper/journal, syntax/format/docs/diff; không chạy lại gates
  sản phẩm không đổi. [Evidence](../ui/ANDROID_SAVE_USABILITY.md),
  [setup](../ui/ANDROID_PILOT_SETUP.md). P2 còn: danh sách wishlist lỗi đọc chưa
  có retry trực tiếp, Back→mở lại phục hồi được. Paging DB/users/roles đã dọn;
  giữ API3046/media3047/proxy3048/Metro8081/emulator và QA Mongo57017 cho dataset
  `android-pilot-p01-20261010`, fault none, anonymous, buyer wishlist trống.
  Phiếu P01 local chưa điền. Bước tiếp:2–3 thành viên thực hiện protocol trên
  emulator; human usability/TalkBack/ARM/iOS OPEN, READINESS không đổi.
  Không push/PR/merge/deploy. Dependency primary reuse bằng junction;
  xem flag pnpm riêng trong setup nếu chạy ở worktree này.
- Chủ dự án duyệt tìm→xem→lưu và bước chuẩn bị đăng sách; nhóm chưa từng mua/bán
  sách cũ, chỉ có Android Studio. Pilot chuyển thành trong nhóm/emulator, chưa chạy
  với người thật. [Protocol](../design/ANDROID_USABILITY_ROUND_01.md),
  [phiếu](../ui/templates/ANDROID_USABILITY_SESSION.md),
  [brief đăng sách](../design/ANDROID_POSTING_BRIEF.md).
- Nhánh `codex/android-save-usability` từ `2dc069b`, checkpoint subject
  `fix(rn): clarify saved books and preserve login context`. Login trở về đúng
  sách, không tự lưu; lưu/bỏ lưu có nhãn/trạng thái/lỗi rõ và membership đọc cursor.
  Không đổi API/session storage/tokens/web/framework hoặc triển khai form đăng sách.
- PASS RN120/120 test/typecheck; lint0error4warning cũ. Native login→return→lưu→
  tìm lại→bỏ lưu, PUT/DELETE503 và read503/recovery ở320dp130% có evidence.
  Return parameter sai chỉ kiểm unit; native paging bổ sung ở checkpoint trên.
  PASS format9file và export preview0 Android/iOS/web13routes. Fresh reviewer
  verdict ship cho batch bỏ kicker login/wishlist sau recapture; documenter
  không yêu cầu đổi canonical. QA services/database/users/roles đã dọn;9ảnh
  giữ ở [báo cáo](../ui/ANDROID_SAVE_USABILITY.md). Checklist preflight trước
  pilot tại checkpoint đó còn native paging; checkpoint trên đã bổ sung bằng fixture mới.
  Human usability/TalkBack/ARM/iOS còn mở; READINESS giữ nguyên.

## Checkpoint chi tiết sách Android — `2dc069b`

- Chủ dự án duyệt tiếp màn chi tiết Android; nhánh
  `codex/android-book-detail-redesign` từ `2f766ca`, checkpoint subject
  `feat(rn): redesign Android book detail`. [Brief](../design/ANDROID_BOOK_DETAIL.md),
  [checks/ảnh](../ui/ANDROID_BOOK_DETAIL_REDESIGN.md).
- Tên/tác giả toàn chiều ngang, ảnh cạnh hai giá có nhãn, bỏ footer giá; tình trạng
  và thông tin xuất bản dễ đọc. Gallery/Back và stale/retry giữ semantics; anonymous
  mở tài khoản để lưu, authenticated dùng wishlist cũ. Chip thêm disabled tùy chọn,
  showcase cùng recipe. Không đổi API/session/nghiệp vụ hoặc web Vite/Flutter.
- PASS RN108/108 test/typecheck; lint0error8warning cũ; export Android/iOS/web13routes.
  Android35 x86_64:390dp100%,320dp130%, ảnh/Back, tình trạng, metadata, tên/giá dài,
  mất kết nối và retry, lối vào tài khoản. Storage FAKE/QA `*_test` riêng.
  Fresh Impeccable reviewer verdict **ship** phạm vi detail,13 ảnh; không có material fix.
  Standalone QUALITY BAR card chưa cung cấp riêng; dùng direction đã duyệt/brief màn.
  Documenter không yêu cầu đổi DESIGN/sidecar; recipe/components đã cập nhật.
  QA đã dừng/dọn database/users/roles;14 ảnh hợp lệ giữ trong báo cáo.
  Không push/PR/merge/deploy; READINESS giữ nguyên.

## Checkpoint tìm sách — `2f766ca`

- Chủ dự án duyệt redesign Android trước; nhánh `codex/android-search-redesign`
  từ `270acbf`, checkpoint subject `feat(rn): redesign Android book search`.
- RN tìm sách: danh sách dọc, search cố định, Bộ lọc có nhãn, câu chữ trực tiếp;
  Be Vietnam Pro400/700 thay Lora, target48dp và navigation sáng. Hai prototype
  cùng fixture ở showcase; chọn danh sách. Không đổi API/session/nghiệp vụ;
  Vite/Flutter chưa redesign. [Brief](../design/ANDROID_SEARCH.md),
  [checks/ảnh native](../ui/ANDROID_SEARCH_REDESIGN.md).
- PASS RN108/108 test/typecheck; lint0 error,8 warning wishlist có sẵn. Android35
  x86_64: search/detail/Back/filter, chữ130%,320dp, Gboard, rỗng/lỗi/retry được
  thao tác; storage FAKE/database `*_test` riêng. Review độc lập yêu cầu bỏ viền
  lỗi dày; đã sửa/recapture, verdict ship cho fix đã chấm. Token-bearing DESIGN và sidecar được đối chiếu
  bởi documenter. Taste là reference, Impeccable pinned là quy trình.
- PASS export Android/iOS/web13 route, docs248 file/1750 links/4 adapters,
  formatting và diff; QA đã dừng/dọn database/users/roles. Không đóng READINESS,
  không human sign-off/TalkBack/ARM/iOS/release, không push/PR/merge/deploy.
  Stash, nhánh và local work teammate giữ nguyên.

## Checkpoint design tools — `270acbf`

- Chủ dự án duyệt tích hợp Impeccable/brief/critique, nhánh
  `codex/impeccable-ui-workflow` từ `2e13f04`. Checkpoint subject
  `feat(design): pin Impeccable workflow and record UI critique`.
- Vendored Impeccable4.5.2 tại SHA `d631a8827f99414d2b6daba4ef08b7f8701751d7`,
  engine0.1.14/checksums; wrapper `pnpm ui:design`, adapter Claude, context shared
  và native. [DESIGN root](../../DESIGN.md) thay ràng buộc thẩm mỹ UI-1: Lora không
  còn bắt buộc, sans cho tác vụ, ngôn ngữ rõ; runtime UI chưa đổi. Taste chỉ reference.
- [Workflow/evidence](../design/IMPECCABLE_WORKFLOW.md),
  [critique độc lập3 màn](../../.impeccable/critique/2026-10-09T16-53-10Z__apps-user-web-src-pages.md).
  User cho phép chạy lại; A `/root/ui_review_a_fresh` và B `/root/ui_review_b_retry`
  hoàn tất source/browser riêng. Parent đọc B sau A final. Điểm A12/22/22 trên40
  không là usability/human acceptance; source chưa đổi, không nhận chênh điểm là
  regression. [Lượt đầu DEGRADED](../../.impeccable/critique/2026-10-09T16-30-59Z__apps-user-web-src-pages.md)
  giữ lịch sử. Checkpoint lượt chạy lại: `docs(design): complete independent UI critique`.
- PASS: vendor64 file, pinned engine/probe/cache từ chối file hỏng, context web/
  native adaptive, skill validatorUTF8, docs:check bốn adapters, diff whitespace.
  Detector0 findings nhưng browser/source chỉ ra lỗi sort/filter/mobile/câu chữ/
  state/form. API build để dựng QA, không nhận là full API test PASS.
- QA riêng/storage fake đã dừng/dọn DB/users/roles; không native/live Supabase/
  human sign-off/remote CI. Không đổi source sản phẩm/contract/migration, không
  push/PR/merge/deploy; giữ READINESS và stash/nhánh teammate.

## Checkpoint docs trước đó — `2e13f04`

- Dọn tài liệu theo yêu cầu chủ dự án, nhánh `codex/docs-refresh` từ `d77290a`.
  Checkpoint subject `docs: refresh current guides and archive outdated session notes`.
- Cập nhật README/setup/kiến trúc/code map theo source, thêm user-web React/Vite,
  tách DirectDelivery F2h với ViaPoint completion đã có code nhưng chưa đóng gate.
  Nhật ký dài chuyển nguyên nội dung sang [SESSION_HISTORY09/10](SESSION_HISTORY_2026_10_09.md).
  README API cũ chuyển sang [API README history](../../apps/api/README_HISTORY_2026_10_09.md).
- [Audit docs09/10](DOCS_AUDIT_2026_10_09.md) ghi phạm vi, lưu trữ và checks.
  Không đổi code/contract/migration/data, không push/PR/merge/deploy.
- PASS: `pnpm docs:check` (191 Markdown/1572 link local/3 skill-adapter pairs),
  SRS HTML render + `--check` (33 snapshot lịch sử không đổi), `git diff --check`.
  Hai archive giữ nội dung (bỏ khoảng trắng cuối hai dòng history); trạng thái
  gate và các dòng FR/BR/POL không đổi.
  Không chạy lại test sản phẩm vì chỉ sửa docs và renderer tài liệu.

## Phần đã nhập main

| Gói | Git source | Phạm vi / giới hạn |
| --- | --- | --- |
| Mongo và UI/dev workflow | PR5/6, PR15 | Replica set/runtime và UI/dev tooling đã tích hợp; full native/review còn mở |
| Price assist/wishlist | PR18/20, PR19 | Advisory AI/lookup dưới cờ, wishlist thật; eval/search quota và nguồn reviewed còn gap |
| User web + gộp Minh/Nhật | PR21/22/24/25 | React/Vite app, listing/search/detail/sell thật; reload submission recovery chưa hoàn chỉnh |
| Backend auction | PR23 `78c9a8d` | Intake/bid/point Order/pay/code/inspection + completion/claim/return/violation source |
| Purchase conversations | PR26 `070949e` | Sale/Both Reserved24h, participant chat/expiry; không Order/payment/hold |
| Search/auth/nav web | PR27/29 | Search layout, navbar/auth animation/favicon |
| Auction web/live/inbox | PR28 `da59199` | Bidding/Auto/pay, public socket/inbox; post-payment point steps chưa đủ UI |

Bằng chứng test từng gói có trong PROJECT_CONTEXT, feature reports và lịch sử.
Không coi các số PASS từ SHA cũ là kiểm lại toàn main. Exchange web vẫn mock;
register/profile scaffold, admin dashboard mẫu; Flutter scaffold.

## Việc và gate còn mở

- [READINESS](READINESS.md) giữ trạng thái: Android PARTIAL, TalkBack/ARM/iOS OPEN,
  review tiền/quyền/UX người thật OPEN, release/hậu-F2h BLOCKED. Chưa có evidence
  mới đóng gate trong gói docs hoặc critique này.
- DirectDelivery tới F2h; ViaPoint auction có source inspection/claim/return/
  settlement worker. Cần đối chiếu gate và review trước mở rộng; không chạy worker
  trên DB chính để thử mâu thuẫn tài liệu. Point LOCKED handlers còn gap decorator
  đã ghi trong context; không sửa nghiệp vụ/quyền bằng đợt dọn docs.
- Price assist: cờ tắt mặc định; live eval34 ca/nguồn reviewed chưa có, search quota
  429 là blocker theo report05–06/10, chưa probe lại. Không tự bật cho demo.
- Web sell: recovery reload/ảnh lỗi vĩnh viễn còn gap; Exchange mock nhiều-cuốn/
  meetup lệch SRS một-cuốn/DirectDelivery-ViaPoint, không dùng làm contract backend.
- Native OS dark/API35 ba nút có lỗi tương phản đã ghi; TalkBack/ARM/FPS/iOS/
  release và review người thật chưa được đóng từ các lần build/export.
- SCRIPT credential trong lịch sử Git đã được ghi ở PR24; việc rotation chưa
  xác minh. Không chạy script lịch sử hoặc trích secret vào chat/artifact.
- Owner/reviewer/deadline mới cần theo nhiệm vụ thực tế; kế hoạch demo06/10
  là lịch sử, không là lịch hiện hành.

## Công việc local phải bảo toàn

Stash `e9a4e80` trên `codex/openai-price-provider` (adapter WIP), stash `e988200`
trên `codex/system-architecture`; RN UX `codex/listing-ux` head `891e851` chưa nhập
main. Không pop/drop/reset/cherry-pick để tiếp nhận context. `.env`, `.tmp`, backup/
DB/bucket/process của người dùng giữ nguyên. Metadata máy chỉ dùng ở local notes;
không lấy port/PID/account/config trong lịch sử làm cấu hình mặc định máy mới.

## Bước tiếp

Chat mới dùng [prompt](NEXT_SESSION_PROMPT.md), kiểm Git/source thực tế và nhận
gói cụ thể. Setup theo [START_HERE](START_HERE.md)/[DEVELOPMENT](../DEVELOPMENT.md),
QA `*_test` riêng, skill/checks theo [AI_WORKFLOW](../AI_WORKFLOW.md).
Gói Android search/detail và làm rõ lưu đã ở các nhánh ghi trên; bước tiếp là
pilot nhóm theo protocol mới, xử lý P0/P1 rồi thực thi brief đăng sách.
Không coi các màn ngoài phạm vi là đã redesign hoặc đã có quyền merge/release.
[CONTINUATION_PLAN](CONTINUATION_PLAN.md) là backlog có gate, không tự cấp quyền
code tính năng mới/merge/deploy. Cập nhật mục của mình, không nối nhật ký dài lại.

## Lịch sử

[28–30/09](SESSION_HISTORY_2026_09_30.md),
[các checkpoint tới trước đợt dọn09/10](SESSION_HISTORY_2026_10_09.md).
Giữ evidence và ghi nhận teammate ở đó; tình trạng chưa merge/SHA/PID là mốc cũ.
