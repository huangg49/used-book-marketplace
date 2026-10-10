# Web Member — logo mới và hướng tiệm sách nhiều màu

10/10/2026, nhánh codex/web-member-redesign từ main dec19b3 sau khi chủ dự án
merge PR31. Làm trong apps/user-web React/Vite hiện có; web trước, Android theo sau.

## Hướng đã được chọn

Chủ dự án yêu cầu thay hẳn design cũ bằng Logo.png mới (cú và chữ LẬT LẠI,
đỏ rượu vang–kem) kết hợp bố cục/hình ảnh/màu sắc
[Bookstore Landing Page](https://dribbble.com/shots/26947471-Bookstore-Landing-Page)
của Md. Rakibul Hasan. Ba sketch xanh trước đó đã được thay thế bởi lựa chọn này.

Code-led theo Impeccable; direction roll 20e973c0 được ghi nhận, yêu cầu cụ thể
của chủ dự án ưu tiên hơn roll. [Direction contract](../../apps/user-web/.impeccable/surfaces/apps-user-web-src-pages-booksearchpage-tsx.md)
ghi sáu khối và tiêu chí hoàn tất. DESIGN.md/sidecar mô tả kết quả sau review.

## Phạm vi triển khai

- Trang chủ: hero đỏ, headline ảnh final chủ dự án, bìa minh họa, search có tác dụng; kệ mới đăng
  và kệ để đổi lấy API thật; ba lối lọc theo hình thức/giá, CTA đăng sách.
- Tìm sách: q/mode/condition/giá/sort/cursor theo OpenAPI; giữ URL/Back, trạng thái
  đang tải/rỗng/lỗi/thử lại; đếm số sách trên trang, không bịa tổng kho.
- Chi tiết: ảnh bản sách đầy đủ, chuyển ảnh, giá bán và giá trị đổi đều VNĐ;
  tình trạng/trang thiếu/metadata/người đăng rõ; giữ sách24h mở chat, chưa thanh toán.
- Header/footer/thẻ sách/dialog đồng bộ. Logo giữ nguyên pixel, CSS lấy biểu tượng
  và chữ từ ảnh gốc. Be Vietnam Pro400/700 cho tác vụ, Anton cho tiêu đề hiển thị,
  tự host kèm OFL. Không giữ Lora hoặc câu chữ văn khố trên các màn đã làm lại.
- Đăng nhập được làm lại vì là đường bắt buộc từ CTA giữ sách; Email/Mật khẩu rõ,
  trở về sách sau login, không tự giữ sách. SessionClient/tokens giữ nguyên.
- Sửa tối thiểu lỗi hook có điều kiện và tràn stepper130% của form đăng sách cũ
  để hành trình kiểm thử liên tục. Chưa redesign toàn form, dashboard, đăng ký,
  chat, đấu giá, admin hay Flutter; Android giữ checkpoint riêng.

## Home — catalog xem trước để làm UX/UI

Sau `912ecec`, chủ dự án yêu cầu giữ nguyên hero và chỉ thu bốn nút do đáy bị
cắt ở cửa sổ1535×735. Bookmark desktop168→144px, chim104→88px, padding đáy30→24px;
mobile152px/88px, kiểu giấy/routes và toàn bộ hero giữ nguyên. Source diff chỉ
bốn giá trị CSS thuộc bookmark; thay đổi thu hero đã hoàn tác trước checkpoint.
Build/typecheck PASS; CUA1535×735 đáy hàng723.95px,1366×768 đáy734.75px;
không tràn ngang/4ảnh tải đủ. Mobile390×844 vẫn2×2/min152px, không tràn.
[Ảnh cửa sổ tương ứng](../../.impeccable/review/web-member/home-bookmarks-compact-desktop.jpg).
Scan trước sửa0finding; actual hover/200%/backend/native/human NOT RUN.
READINESS giữ nguyên; checkpoint subject `fix(web): compact bookmarks without shrinking hero`.
Local, chưa push. Bước tiếp: chủ dự án xem trên cửa sổ laptop.
Reviewer độc lập ship, không material fix;
[review](../../.impeccable/review/web-member/home-bookmarks-compact-finish.md). Docs/diff PASS.

Sau `7af062d`, chủ dự án duyệt làm dấu sách mềm hơn: hàng880px/gap32px,
chim104px, hai góc trên8px, khía40×19.5px, viền warm50% alpha và nét wine nhỏ.
Tái dùng texture giấy login20% multiply, clip riêng bằng useId; anchor/focus
không clip. Hover nâng3px/bóng mềm theo silhouette giấy; reduced motion bỏ lift.
<=1000px hàng440px/2cột/gap16px; <=600px chim88px/min152px/gap12px, nhãn tự wrap.
Giữ hero/caption/routes/logo/kệ/API/session; không thêm asset hay noise động.

Build/typecheck/lint PASS (6 warning cũ); CUA1366/1024/800/390/320 không tràn,
4/2cột,4ảnh tải đủ, nhãn không chạm notch. Laptop1366×768 hàng đủ trong khung đầu;
keyboard Tab/focus wine không clip PASS; source4href không đổi. Một scan trước
sửa0finding. Actual hover/chữ200%/backend giao dịch/native/human NOT RUN.
Ảnh [laptop](../../.impeccable/review/web-member/home-bookmarks-soft-desktop.jpg),
[mobile](../../.impeccable/review/web-member/home-bookmarks-soft-mobile.jpg),
[320px](../../.impeccable/review/web-member/home-bookmarks-soft-320.jpg).
READINESS giữ nguyên; checkpoint subject `feat(web): soften paper bookmark shortcuts`.
Local, chưa push; chủ dự án xem bản thử.
Reviewer độc lập disposition **ship**, không material fix;
[review](../../.impeccable/review/web-member/home-bookmarks-soft-finish.md). Docs/diff PASS.

Sau `6beee98`, chủ dự án duyệt thử dấu sách hợp với web thay bốn hộp pastel và
mockup nhiều viền/bóng. Recipe hiện hành ở DESIGN.md: hàng1040px/4→2 cột, nối
mép hero12px; giấy kem và vàng nhẹ cho đấu giá, chim88/72px trên nhãn ngắn.
SVG chỉ là hình học giấy/khía nhỏ ở đáy, không clip anchor hoặc focus; viền1px,
không shadow/gradient/arrow. Hero padding đáy32px giữ caption cách giấy20px.
Giữ ba ảnh chim, thêm chim cầm búa đấu giá có [prompt](../../apps/user-web/public/illustrations/penguins/auction.png.json).
Không đổi art hero/logo/kệ/API/session hoặc route. Chủ dự án đang xem bản thử,
không xem đây là human sign-off.

Build/typecheck/lint PASS (6 warning cũ); CUA1366/390/320/800/1024/1680 không
tràn ngang,4/2 cột;1366×768 hàng dấu sách nằm trọn khung mở đầu. Bốn link Enter
PASS (Sale/Exchange/auctions/sell→login), keyboard focus không clip,4 ảnh tải đủ.
Ảnh [laptop](../../.impeccable/review/web-member/home-bookmarks-desktop.jpg),
[mobile](../../.impeccable/review/web-member/home-bookmarks-mobile.jpg),
[320px](../../.impeccable/review/web-member/home-bookmarks-320.jpg).
Một scan layout trước sửa0finding; không scan thêm. Mouse hover/chữ200%/native/
backend giao dịch/human NOT RUN; READINESS giữ nguyên. Không push/merge.
Reviewer độc lập disposition **ship**, không material fix;
[review](../../.impeccable/review/web-member/home-bookmarks-finish.md). Docs/diff PASS.

Sau `708f8da`, ô khám phá thứ ba là “Đấu giá” → /auctions theo yêu cầu chủ dự án;
giữ màu đào và minh họa chim ôm ví. Chỉ đổi lối vào nhanh, bộ lọc/banners giá không
đổi. Build/typecheck/lint PASS (6 warning cũ), CUA Enter xác nhận URL và heading
trang đấu giá. [Ảnh](../../.impeccable/review/web-member/home-auction-shortcut.jpg)
localhost5186, viewport1366×900, vùng scrolled Home. Không nghiệm thu backend/native.

Sau `6196b88`, chủ dự án yêu cầu ẩn dải preview/source và link “Xem bài đăng thật”.
Đã bỏ markup/CSS riêng của dải này; các ô khám phá theo ngay hero. Caption hero,
heading kệ và nhãn mẫu trên card vẫn hiện; nguồn dữ liệu và data=live không đổi.
Build/typecheck/lint PASS (6 warning cũ); CUA1366/390 không còn banner, không
tràn ngang, bốn link còn đủ. [Ảnh CUA desktop](../../.impeccable/review/web-member/home-notice-hidden-desktop.jpg)
là vùng scrolled hero/shortcuts, localhost5186 preview. Backend/native/200% chưa
chạy lại; không mở gate. Các mô tả dải thông báo bên dưới thuộc checkpoint cũ.

Checkpoint shortcuts sau `a704bdf`: chủ dự án duyệt bốn ô màu có chim cánh cụt.
Mua vàng kem, đổi mint, ngân sách đào, đăng tím nhạt; dùng lại màu nền bìa sách.
Built-in image_gen tạo4 minh họa cùng reference, PNG256px có alpha, khoảng50KB/ảnh;
[prompt/provenance](../../apps/user-web/public/illustrations/penguins/README.md).
Hình72px desktop/56px mobile, chữ14px bold/arrow16px; cả ô là Link giữ URL cũ.
Desktop4 cột/min112px, từ1000px trở xuống2 cột; dưới600px hình trên nhãn/arrow,
min132px/gap12px, tự cao thêm khi chữ dài. Hover fine-pointer nâng2px/viền wine,
focus3px/offset3px; giảm motion bỏ lift/transition. Không đổi logo cú/hero/kệ sách.

Build/typecheck PASS, lint0error6warning cũ; CUA1366/1024/800/390/320 không tràn,
4ảnh local tải đủ; Enter/focus, buy/Exchange/budget và sell→login returnUrl PASS.
Ảnh [desktop](../../.impeccable/review/web-member/home-penguins-desktop.jpg),
[mobile](../../.impeccable/review/web-member/home-penguins-mobile.jpg),
[320px](../../.impeccable/review/web-member/home-penguins-320.jpg).
Scan layout một lượt trước sửa0finding; không scan lại. Chữ200%/hover chuột thực
chưa chạy; source có wrap/min-height/hover/reduce rules. Native/backend thành công/
DB/human NOT RUN; READINESS giữ nguyên. Checkpoint subject
`feat(web): add penguin discovery shortcuts`; local, chưa push.
Reviewer độc lập disposition **ship**, không material fix;
[review](../../.impeccable/review/web-member/home-penguins-finish.md).

Checkpoint mật độ sau `10358bb`: chủ dự án duyệt thu nhỏ card theo ảnh Fahasa.
Home dùng5 cột laptop,6 từ1600px,4 tại1100px,3 tại850px,2 tại600px; gap24px16px.
Khung bìa200/180/160px, padding12/8px, chứa nguyên ảnh; metadata gọn hơn,
giữ cỡ chữ title/giá. Title tối đa hai dòng, tên đầy đủ còn trong DOM/accessibility
và tooltip. Nút nguồn/chi tiết vẫn44px; khung lỗi tự cao lên để chứa nút thử lại.
Kệ chính hiện10 rồi thêm10; ba kệ chủ đề10 sách/kệ tránh mười cuốn mở đầu;
kệ đổi giữ4 bên cạnh phần giới thiệu. Hero/Search mặc định/API/session giữ nguyên.

Build/typecheck22unit PASS, lint0error6warning cũ. CUA1366/1680/1024/800/390/320
không tràn ngang;5/6/4/3/2 cột, bìa200/180/160px, vùng bấm44px, title dài hai dòng,
10→20 và lọc/reset PASS. Ảnh [laptop](../../.impeccable/review/web-member/home-density-desktop.jpg),
[desktop rộng](../../.impeccable/review/web-member/home-density-wide.jpg),
[mobile](../../.impeccable/review/web-member/home-density-mobile.jpg).
Một scan layout trước sửa0finding; không có scan thứ hai. Chữ200% và thao tác
ảnh lỗi chưa chạy lại ở lượt thu gọn này; backend thành công/DB/native/human
NOT RUN. READINESS giữ nguyên. Checkpoint subject `feat(web): compact home book shelves`;
local, chưa push. Các số8/4 bên dưới là lịch sử checkpoint catalog trước lượt này.
Reviewer độc lập disposition **ship**, không material fix; [review](../../.impeccable/review/web-member/home-density-finish.md).

Mở rộng sau `100f872` theo yêu cầu chủ dự án:91 edition, gồm15 văn học,
6 kỹ năng sống,7 kinh doanh,8 khoa học,6 lịch sử,8 thiếu nhi,25 manga và16 light
novel. Đã thêm43 sách nguồn ngoài, bỏ kết quả bộ sách gộp; metadata/bìa giữ theo
edition. Kệ đầu xen tám thể loại; ba kệ chủ đề bên dưới banner có4 sách/kệ,
không lặp tám cuốn mở đầu. Banner đổi sang văn học/kỹ năng/khoa học/thiếu nhi.
Các link chủ đề chỉ lọc Home preview, giữ chủ đề khi chọn mua/đổi/giá và có lối
về tất cả chủ đề. Giữ hero và real-mode API/session, không ghi DB. Recipe/token
hiện hành được tái sử dụng; thêm gap32px trước/24px giữa các kệ chủ đề.

Build/typecheck và22unit PASS; lint0error6warning cũ. Detector một lượt4advisory
hero legacy, không có role mới. Ảnh và QA mở rộng:
[desktop](../../.impeccable/review/web-member/catalog-breadth-desktop.jpg),
[mobile](../../.impeccable/review/web-member/catalog-breadth-mobile.jpg),
[kệ chủ đề](../../.impeccable/review/web-member/catalog-breadth-topics.jpg).
CUA1366/850/390/320 không tràn; lọc thiếu nhi/reset,8→16→91, ba link chủ đề,
giữ topic khi lọc Sale và về tất cả chủ đề PASS. Live override bỏ card/kệ mẫu,
giữ lỗi kết nối thật; [QA](../../.impeccable/review/web-member/catalog-breadth-qa.json).
Chữ200% chưa chạy lại ở extension này; recipe wrap hiện hành giữ nguyên.
Backend thành công/DB/native/human NOT RUN; READINESS giữ nguyên. Checkpoint
subject `feat(web): broaden preview catalog and home subjects`; local, chưa push.
Reviewer độc lập kiểm ba capture/source/contract/canonical: disposition **ship**,
không có material fix; [review](../../.impeccable/review/web-member/catalog-breadth-finish.md).

Checkpoint nguồn và kiểm tra ban đầu:

Sau `f4fffdb`, chủ dự án yêu cầu nhiều sách từ API để xem UI, ưu tiên manga/light
novel, không dùng lại sách hero; DB demo sẽ chuẩn bị sau. Đã lấy48 edition thật
từ Open Library (25 manga,16 light novel,7 văn học), giữ tên/tác giả/ISBN/bìa theo
nguồn tiếng Anh. Metadata cache có thời điểm/query/source; bìa vẫn tải remote.
Không scrape Fahasa hoặc ghi MongoDB. [Hướng dẫn nguồn/bật-tắt/làm mới/chuyển DB](../../apps/user-web/src/data/README.md).

Preview chỉ trong dev, bật rõ bằng env/query; `data=live` ưu tiên hơn env,
production luôn tắt. Home có nhãn xem trước và giá/tình trạng/mua-đổi mẫu từng
card; card mở nguồn Open Library, không tạo listing/seller/media ID/giao dịch
giả. Search/quick links/budget/filter hoạt động trên bộ mẫu trong Home;
Header/Search/Detail vẫn là API thật. Chuyển nguồn thật dùng lại `/listings` và
media read, lỗi không tự fallback. Hero art/layout/motion giữ nguyên; caption và
search phản ánh nguồn đang chọn. Bốn bìa banner thay bằng catalog riêng ở cả hai
chế độ. Chuẩn bị DB demo/bài đăng/ảnh đúng schema là gói riêng, không là đổi tên
file JSON hoặc bằng chứng backend đã nghiệm thu.

Build/typecheck21unit PASS; lint0error6warning cũ. Focused browser QA4width
1366/850/390/320 × chữ100/200% PASS: category, mode/price URL, reset,8→16→48,
search/empty, nguồn ngoài, không gọi listings trong preview, ảnh remote lỗi/retry,
live503 không hiện mẫu và không tràn ngang. CUA thật chọn Light novel và tải bìa.
Detector một lượt4advisory hero cũ, không có role mới. API metadata và ảnh remote
đã dùng thật; backend thành công/DB/native/human NOT RUN, READINESS giữ nguyên.

- [Desktop](../../.impeccable/review/web-member/catalog-preview-desktop.png),
  [mobile](../../.impeccable/review/web-member/catalog-preview-mobile.png),
  [CUA Light novel](../../.impeccable/review/web-member/catalog-preview-cua-desktop.jpg).
- [QA](../../.impeccable/review/web-member/catalog-preview-qa.json),
  [detector](../../.impeccable/review/web-member/catalog-preview-detect.json).

Reviewer độc lập kiểm3capture/source/contract/canonical, disposition **ship**,
không có material fix. Docs/diff PASS. Preview đã bật ở `.env.local` riêng máy
chủ dự án; cấu hình này không đưa lên Git. Checkpoint subject
`feat(web): add isolated book catalog preview`; local, chưa push/PR/merge/deploy.

## Home — khám phá theo thể loại, mua/đổi và giá

Sau `973e3c4`, chủ dự án yêu cầu giữ nguyên hero và thiết kế lại phần dưới theo
cách tổ chức của [Fahasa](https://www.fahasa.com/), xác nhận kết hợp thể loại,
mua/đổi và giá. Code-led mở rộng world đã duyệt, không sao chép banner/khuyến mãi.
[Contract Home](../../apps/user-web/.impeccable/surfaces/apps-user-web-src-pages-homepage-tsx.md)
ghi phạm vi và tiêu chí; JSX hero và các declaration responsive được so với HEAD,
không đổi hành vi hoặc hình thức hero.

Body mới có bốn lối vào nhanh, thể loại từ bài đăng thật, kệ mới đăng lọc mua/đổi/
giá, hai banner ngân sách, kệ đổi nền xanh nhạt và CTA đăng sách. Bìa banner là
minh họa có ghi rõ, không đại diện cho giá hoặc hàng đang bán. API chưa hỗ trợ
thể loại: chỉ lọc cục bộ tối đa24 bài mới tải trong kệ, ghi rõ phạm vi; mode/giá
lọc trên server và mở danh sách toàn bộ tương ứng. Hiện8 bài, thêm8 mỗi lần.
Không thêm endpoint hoặc dữ liệu thương mại giả. BookCard có prop compact riêng
Home; Search giữ mặc định, CSS mới không tác động AuctionCard.

Build/typecheck và16unit PASS; lint0error6warning cũ. Response fixture kiểm7width
1536/1366/1000/850/768/390/320 × chữ100/130/200% PASS: bộ lọc, liên kết, thêm bài,
reset thể loại, rỗng/lỗi/thử lại, search Enter, card mặc định và không tràn ngang.
CUA thật xác nhận layout/bộ lọc/link ở desktop và cửa sổ người dùng; API3048
không chạy nên dữ liệu thật hiện trạng thái lỗi kết nối. Fixture chỉ dùng trong
QA, có nhãn; không seed hoặc sửa DB. API thật/native/human acceptance NOT RUN;
READINESS giữ nguyên. Bundle vẫn có warning kích thước chunk.

Detector đúng một lượt:12advisory,8legacy ngoài diff;4role màu/chữ Home mới được
ghi canonical. Provenance scan thư mục minh họa11raster0missing; dùng lại bìa
đã có. Documenter độc lập cập nhật DESIGN/sidecar, parity PASS.

- [Desktop fixture](../../.impeccable/review/web-member/home-discovery-desktop.png),
  [mobile](../../.impeccable/review/web-member/home-discovery-mobile.png),
  [banner mobile](../../.impeccable/review/web-member/home-discovery-mobile-lower.png),
  [320px chữ200%](../../.impeccable/review/web-member/home-discovery-large-text.png).
- [Rỗng](../../.impeccable/review/web-member/home-discovery-empty.png),
  [lỗi](../../.impeccable/review/web-member/home-discovery-error.png),
  [CUA desktop](../../.impeccable/review/web-member/home-discovery-cua-desktop.jpg),
  [CUA cửa sổ người dùng](../../.impeccable/review/web-member/home-discovery-cua-current.jpg).
- [QA](../../.impeccable/review/web-member/home-discovery-qa.json),
  [detector](../../.impeccable/review/web-member/home-discovery-detect.json).

Reviewer độc lập kiểm đủ8capture cùng source/contract/canonical, disposition
**ship**, không có material fix; đây là review frontend giới hạn, không thay
human acceptance. Docs/diff PASS. Checkpoint subject
`feat(web): redesign home discovery shelves`; local, chưa push/PR/merge/deploy.

## Login — ảnh tiệm sách và form riêng

Cập nhật sau `1e569eb`: chủ dự án duyệt nền giấy và yêu cầu bỏ hình quyển sách,
giữ “Lại gặp nhau rồi.” một hàng. Form dùng texture giấy kem local512px, opacity85%,
input vẫn trắng; headline giữ Be Vietnam Pro/size hiện hành, gạch vàng nhỏ dưới
“nhau rồi.” và cho phép wrap tự nhiên khi tăng chữ. Ánh sáng nền chạy một lượt
2400ms rồi tắt, bỏ hoàn toàn khi giảm chuyển động; không có grain động liên tục.
Logo/ảnh trái/session/handler/Register giữ nguyên. Texture được tạo bằng built-in
imagegen, [prompt và nguồn](../../apps/user-web/public/login-art/ivory-paper.webp.json).

Build/typecheck PASS, lint0error6warning cũ. Response fixture9viewport với
100/130/200% chữ PASS; material QA xác nhận không còn hình sách, headline một
hàng ở1366/390/320px100%, motion kết thúc và reduced-motion tắt. Tương phản
muted thấp nhất4.73:1 trên toàn texture. Provenance scan1raster0missing.
Detector chỉ chạy một lượt trước correction:2advisory màu trắng và title2rem;
title hiện đã về1.75rem narrow theo canonical, màu trắng giữ cho input/sweep.
Không chạy lại detector. API thật/native/human NOT RUN, READINESS giữ nguyên.

- [Laptop](../../.impeccable/review/web-member/login-paper-laptop.png),
  [mobile](../../.impeccable/review/web-member/login-paper-mobile.png),
  [320px chữ200%](../../.impeccable/review/web-member/login-paper-small.png).
- [Lỗi](../../.impeccable/review/web-member/login-paper-error.png),
  [thông báo đăng ký](../../.impeccable/review/web-member/login-paper-help.png).
- [CUA cửa sổ hiện tại](../../.impeccable/review/web-member/login-paper-cua-current.jpg),
  [CUA desktop](../../.impeccable/review/web-member/login-paper-cua-desktop.jpg),
  [CUA mobile](../../.impeccable/review/web-member/login-paper-cua-mobile.jpg).

Documenter cập nhật DESIGN/sidecar và parity PASS; reviewer độc lập kiểm đủ8ảnh,
contract/source/canonical, disposition **ship**, không có material fix.
Docs/diff PASS. Checkpoint subject `feat(web): add subtle paper material to login`.
Local, chưa push/PR/merge/deploy. Phần dưới ghi các checkpoint trước đó.

Cập nhật sau `5c88499`, theo yêu cầu chủ dự án: bỏ masthead đỏ riêng và đặt cú/
wordmark trực tiếp trên ảnh bên trái. `Logo` và ảnh PNG gốc không đổi; SVG color
matrix riêng Login chuyển nền đỏ phẳng của PNG thành alpha, giữ đường nét kem.
Scene dùng grid auto/1fr/auto cho logo, story và credit để không chồng lên nhau.
Desktop giữ45/55; <=900px thu ảnh thành vùng logo ngắn, ẩn story/credit; home là
link riêng trên nền giấy. Không sửa Header/AuthLayout/Register hoặc client khác.

Form400px có greeting Be Vietnam Pro tối đa2.5rem, input trắng52px, label/field
group rõ ràng. “Quên mật khẩu?” cạnh nhãn mật khẩu; “Chưa có tài khoản? Đăng ký”
sau nút chính, cách bằng một đường mảnh. Hai nút là disclosure44px, dùng
aria-expanded/controls và thông báo role=status. Contract/controller chỉ có
login/refresh/logout/me: chưa có register/reset; nút không gửi request, không
nhận credential mới hoặc chuyển sang scaffold đăng ký legacy. Handler login,
safe returnUrl, giữ giá trị khi lỗi và SessionClient giữ nguyên.

Build/16unit PASS; lint0error6warning cũ, bundle warning có sẵn. Browser response
fixture9viewport100/130/200% PASS một logo trên ảnh,52px field/44px target,
không tràn ngang, desktop650px100% vừa, màn thấp/chữ lớn/error/help cuộn tự nhiên,
password toggle/error retention/retry/busy/returnUrl/storage memory-only. Hai
disclosure mở/đóng/thay thế đúng và không request. Lượt đầu helper kiểm nav
Register bằng accessibility selector tại390px nên không thấy nav bị CSS ẩn;
đã sửa selector DOM, không sửa source/test sản phẩm để che lỗi. CUA kiểm cả hai
nút và ảnh1366×650/390×844. Scan layout trước sửa0finding; không chạy lại detector.
API thật/native/human acceptance NOT RUN, READINESS giữ nguyên.

- [Laptop](../../.impeccable/review/web-member/login-overlay-laptop.png),
  [mobile](../../.impeccable/review/web-member/login-overlay-mobile.png).
- [320px chữ200%](../../.impeccable/review/web-member/login-overlay-small.png),
  [lỗi](../../.impeccable/review/web-member/login-overlay-error.png),
  [lỗi và thông báo đăng ký](../../.impeccable/review/web-member/login-overlay-help.png).
- [CUA desktop](../../.impeccable/review/web-member/login-overlay-cua-desktop.jpg),
  [CUA mobile](../../.impeccable/review/web-member/login-overlay-cua-mobile.jpg).

Finish reviewer độc lập kiểm đủ7capture: không có sửa visual bắt buộc; yêu cầu
lưu canonical cho bố cục mới. Documenter cập nhật DESIGN/sidecar và kiểm parity;
verdict pass chấm persistence **resolved**, disposition **ship**. Verdict này chỉ
chấm sửa tài liệu; visual review trước đó giữ nguyên, không thay human acceptance.
Docs/diff PASS. Checkpoint subject `feat(web): overlay login branding and refine account actions`.
Local, chưa push/PR/merge/deploy. Mô tả/captures dưới đây thuộc checkpoint5c88499.

Sau `6de0289`, chủ dự án chọn ảnh bookstore làm mờ nhẹ/đặt chữ và chia màn hình
như mẫu [Edusama](https://dribbble.com/shots/27353194-Edusama-Digital-Library-Login-Exploration).
[Contract Login](../../apps/user-web/.impeccable/surfaces/apps-user-web-src-pages-loginpage-tsx.md)
ghi phạm vi code-led: desktop45/55, logo gốc trên masthead đỏ, ảnh tiệm sách
Barcelona của Davit Margaryan từ Unsplash, CSS blur2px + tint đỏ64%, chữ
“Chuyện hay còn tiếp.”; form nền kem400px, Be Vietnam Pro, control52px.
<=900px bỏ mảng ảnh lớn, giữ logo và Về trang chủ. Laptop100% vừa viewport;
màn thấp/chữ lớn/lỗi được cuộn tự nhiên. Không dùng navbar đầy đủ trên Login.
AuthLayout/Register và Header ở các màn khác giữ recipe trước đó.

Ảnh delivery local, không hotlink runtime; [nguồn/giấy phép](../../apps/user-web/public/photography/README.md)
và origin embedded + sidecar ghi rõ là ảnh trang trí, không là cơ sở Lật lại hay
ảnh bài đăng. SessionClient/handler/safe returnUrl vẫn nguyên; không thêm
Google/login khác/đăng ký/khôi phục mật khẩu hoặc thay token storage.

Kiểm: build/typecheck16unit PASS; lint0error6warning legacy. Focused Chromium
response fixture9viewport100/130% PASS: không tràn ngang, một logo hiện, target44px,
laptop vừa/màn thấp cuộn, hiện/ẩn mật khẩu, lỗi giữ dữ liệu/retry, pending disabled,
login return về sách và browser storage trống. CUA xác nhận desktop/mobile,
password toggle và Về trang chủ. API thật/native/human usability NOT RUN;
không ghi/xóa DB hoặc đổi READINESS. Detector một lượt2advisory: credit12px,
footer13px có chủ đích; không được nhận là detector0findings. Tương phản
conservative trên toàn ảnh dưới tint alpha163/255: cream4.84:1, chữ vàng lớn
3.36:1; muted trên nền giấy5.77:1.

Ảnh đã kiểm đúng nội dung/kích thước:

- [Desktop1536×730](../../.impeccable/review/web-member/login-bookshop-desktop.jpg).
- [Laptop1366×650](../../.impeccable/review/web-member/login-bookshop-laptop.png).
- [Mobile390×844](../../.impeccable/review/web-member/login-bookshop-mobile.jpg).
- [320px chữ130%, full page](../../.impeccable/review/web-member/login-bookshop-small.png).
- [Lỗi, full page](../../.impeccable/review/web-member/login-bookshop-error.png).

Review độc lập source/five captures: UI đạt composition, finding còn lại là
recipe Login cũ trong DESIGN; documenter cập nhật canonical rồi reviewer xác
nhận finding này resolved. Recapture64% tint cũng được mở lại đủ5file, verdict
ship ở phạm vi hai sửa persistence/tint; review trước của UI giữ hiệu lực.
Không nhận là human acceptance. Checkpoint subject `feat(web): frame login with a warm bookshop photograph`.
Local trên codex/web-member-redesign, chưa push/PR/merge/deploy.

## Ảnh và dữ liệu

Dribbble cung cấp ảnh thiết kế tổng hợp; chưa có bộ asset tách riêng hoặc ảnh bìa
gốc chất lượng cao từ tác giả. Không cắt bìa nhỏ từ screenshot để gán cho bài đăng.
Home hiện dùng bìa chủ dự án cung cấp: Chúa nhẫn (hai vị trí), Alice mới,
Nghìn lẻ một đêm, Tuổi thơ, One Piece, Sword Art Online, Dược sư tự sự; nguồn trong
[asset README](../../apps/user-web/public/illustrations/README.md); có chú thích
minh họa. Thẻ/chi tiết dùng ảnh API, không thay bằng ảnh stock. Mọi raster mới
được ghi provenance (embedded JPEG/PNG hoặc sidecar WebP). Các screenshot sử dụng
fixture [QA], giá/tình trạng mô phỏng.

## Kiểm chứng

Sau `29ff82e`, chủ dự án yêu cầu nhìn rõ lúc navbar thu trên nền hero cùng màu.
CUA xác nhận laptop bật reduced-motion làm transition cũ chỉ0.01ms. Đã tăng morph
lên360ms và thêm viền kem1.5px pointer-none chỉ trong collapse, opacity0→65%→0;
animationend xóa state, expand hủy ngay, lần thu kế tiếp chạy lại. Giữ360ms cho
riêng morph/edge dù OS reduce, không sửa thiết lập máy hoặc animation khác.
Focused Chromium PASS desktop1536×730/mobile390×844/320×650, cả reduce/no-preference:
sample rAF xác nhận width trung gian/edge sáng rồi về0, replay/reversal và không
nhảy nội dung/tràn ngang. CUA thấy collapsing=true/duration0.36s/edge0.228 rồi
collapsing=false/edge0; [ảnh giữa chuyển động](../../.impeccable/review/web-member/navbar-edge-morph.jpg).
Build/typecheck/16unit/lint0error6warning cũ/docs/diff PASS. Detector một lượt6
advisory màu/type legacy ngoài diff; không có finding mới của morph/edge. Finish
pass source/browser đạt scope, không đổi API/native/gate; auth/API integration
không chạy lại vì không đổi session/command. Checkpoint subject
`feat(web): illuminate navbar edge during compact transition`; local, chưa push.

Sau `4cffb71`, chủ dự án duyệt navbar gọn/nổi theo hai trạng thái trong ảnh BeeWise.
Header dùng chung Main/Auth/Dashboard và form đăng sách:76px ở đầu,64px/top12px/
radius32px/max1280px khi cuộn>48px, trở lại ở<=16px; slot cố định không nhảy nội dung.
Mobile<=1000px:72px ở đầu,64px/top8px/side10px khi nổi; logo nguyên bản scale
CSS82% dưới420px, controls>=44px. Menu tự đóng theo route/Escape/desktop resize,
scroll trong viewport; notification popup hẹp không tràn. Navbar tôn trọng reduced
motion; transition240ms chỉ trên fixed layer, không thêm library hay đổi API/session.
Ảnh CUA: [đầu trang](../../.impeccable/review/web-member/navbar-desktop-top.jpg),
[thanh nổi](../../.impeccable/review/web-member/navbar-desktop-floating.jpg),
[menu mobile](../../.impeccable/review/web-member/navbar-mobile-menu.jpg).
Focused Chromium PASS7viewport1536/1366/1001/1000/800/390/320,100/130%text, khách
và authenticated response fixture: geometry/no overflow/no jump, threshold/return,
menu/Escape/focus/route/resize, skip link/reduced motion, popup bounds và Header
trong các layout/form. Đây là browser fixture, không kiểm auth/API thật. CUA desktop/
mobile đã xem/thao tác; không claim Safari/Firefox/native/human acceptance.
Build/typecheck/16unit PASS, lint0error6warning legacy; docs/diff PASS. Detector
chạy một lần, trả advisory về màu/type/radius CSS ngoài scale;32px là hình navbar
chủ dự án duyệt và đã ghi DESIGN, các literal legacy ngoài diff giữ nguyên.
Finish pass theo diff/browser: scope đạt; dashboard/form/register nội dung còn
legacy, không nhận đã redesign các trang này. API QA3048 không chạy, Home giữ
trạng thái lỗi/thử lại. Local checkpoint subject
`feat(web): add compact floating member navigation`; chưa push/PR/merge/deploy.

Sau `288a385`, chủ dự án cung cấp Hero text final.png để thay headline Home.
Giữ đúng SÁCH MỚI. CHƯƠNG MỚI. CÙNG LẬT LẠI., nét chữ/dấu và minh họa/đồ họa
final; không dùng bản Hero text.png cũ hoặc tự sửa copy thành sách cũ. Source có
alpha; delivery1313×655 PNG lossless chỉ bỏ lề trong suốt/chừa16px, raw RGBA
đối chiếu source crop PASS trùng pixel. H1 chữ tương ứng + ảnh alt rỗng/aria-hidden;
không đọc lặp, fetchPriority high/intrinsic dimensions giữ tỷ lệ. Artwork cap theo
viewport, description sách cũ giữ nguyên. Ảnh là typography cố định, không wrap
glyph như live text; không nhận là accessibility acceptance toàn diện.
CUA1536×730/390×844 PASS ảnh tải/đủ dấu/toàn hình/tỷ lệ/không tràn:
[desktop](../../.impeccable/review/web-member/hero-lettering-desktop.png),
[mobile](../../.impeccable/review/web-member/hero-lettering-mobile.png).
Focused9viewport100/130%text/8bìa/nooverflow/search Enter PASS; laptop1536×730
hero494px, kệ đầu kết thúc671px,1366×650 kệ đầu645px. Build/typecheck/16unit/
lint0error6warning cũ/docs/diff PASS, layout detector0findings. Không đổi motion/
API/DB/session/native/gate; limitation motion control ở lượt trước vẫn còn.

Sau `1d9e5c5`, chủ dự án yêu cầu bỏ nút pause, bìa chuyển động liên tục và hạ
description/search để thoáng hơn. Đã bỏ state/control/hoverpause; giữ offscreen/
hidden guards và OS override đã duyệt. Desktop compact description/search hạ20px;
hero469px tại1536×730 vì bỏ hàng nút, kệ đầu vẫn thấy. Mobile description hạ8px.
[Desktop](../../.impeccable/review/web-member/hero-airy-desktop.png),
[mobile](../../.impeccable/review/web-member/hero-airy-mobile.png).
Focused Chromium PASS9viewport100/130%text/8bìa/nooverflow/search Enter, sway
liên tục cả hover và OS reduce, tự dừng offscreen. Hidden listener kiểm source,
chưa mô phỏng tab background. Build/typecheck/16unit/lint0error6warning cũ/docs/
diff PASS; layout detector0findings. Bỏ control + OS override làm người xem không
có cách chủ động dừng animation; ghi limitation accessibility, không nhận PASS.
Các dòng pause bên dưới là lịch sử trước yêu cầu này. Không đổi API hoặc gate.

Sau `33f0544`, chủ dự án báo hero desktop100% gần chiếm hết viewport laptop.
CUA1536×730 đo header96.8px + hero686px, search y607px, tiêu đề kệ y851px.
Đã thêm compact Home cho width≥1101/height≤850: headline và bìa clamp theo vh,
nén padding/gap/caption; giữ8bìa, hover/sway/pause, nét vẽ và44px touch target.
Không scale trang, khóa height hay cắt nội dung; Header/DOM/mobile giữ nguyên.
Sau sửa1536×730: hero497px, search bottom504px, pause bottom582px, tiêu đề kệ
bottom674px;1366×650 tiêu đề kệ bottom645px.
[Ảnh laptop](../../.impeccable/review/web-member/hero-laptop-desktop.png).
Focused Chromium9viewport1536×730,1366×650,1280×600,1182×562,1051×500,1440×900,
1100×800,390×844,320×650 ở100/130% text size PASS đủ8ảnh/không tràn; search Enter
đúng q. Desktop cao giữ hero686px, mobile/narrow tự cuộn khi cần. Browser zoom
thật không được tự đổi; kiểm theo viewport tương ứng và text scaling riêng.
Layout assessment độc lập + detector layout trước/sau0findings; build/typecheck,
16unit/lint0error6warning cũ/docs/diff PASS. Không kiểm lại API/native hoặc gate.

Sau `8a871f8`, chủ dự án duyệt minh họa giấy lật màu kem và tăng chiều sâu bìa.
Ba SVG gốc vẽ trực tiếp: hai nét trang lật bất đối xứng quanh cụm bìa, sách mở ở
góc dưới phải. Artwork tĩnh/aria-hidden/pointer-none, không cản input/hover;
thu gọn ra mép mobile, ẩn sách mở dưới600px. Shadow có cạnh sáng, contact và cast
offset mềm; hover mở rộng bóng, giữ sway/pause và override OS đã duyệt.
Build/typecheck,16unit, lint0error6warning cũ, docs/diff PASS. Chromium focused
PASS sway/hover/manual/offscreen và reduce/no-preference, đủ8bìa không tràn ngang
1440/390/320px100/130%. CUA1440/390px kiểm ba SVG tải đủ, pointer-none và bố cục:
[desktop](../../.impeccable/review/web-member/hero-illustrated-desktop.png),
[mobile](../../.impeccable/review/web-member/hero-illustrated-mobile.png).
Detector chạy một lần; advisory size/màu thuộc CSS cũ không đổi trong diff này.
Không đổi API/session/native hoặc dữ liệu QA; proxy3048 vẫn không chạy nên kệ
hiện lỗi/thử lại. Không nhận là kiểm lại giao dịch hoặc nghiệm thu người thật.

Sau `1c68ec3`, chủ dự án yêu cầu hero vẫn animate dù máy bật giảm animation.
Đã giới hạn CSS exception cho entrance/sway/hover của bìa, giữ pause/resume và
offscreen/hidden guards; không sửa cài đặt Windows hoặc override các màn khác.
Focused Chromium PASS cả reduce/no-preference đều sway, hover/pause/resume đúng,
không tràn1440/390/320px100/130%. IAB thực tế reduce=true, computed animation6s/
infinite/running và transform thay đổi; [ảnh hiện tại](../../.impeccable/review/web-member/hero-forced-sway.jpg).
Build/typecheck/docs/diff PASS. Các dòng reduced-motion none bên dưới là lịch sử
trước yêu cầu override này.

Sau `c06a288`, chủ dự án yêu cầu bìa đung đưa nhẹ. Inner wrapper sway±3px/±1°,
chu kỳ6–7.5s lệch nhịp; hover tạm dừng wrapper, giữ zoom. Có nút pause/resume,
tự dừng ngoài viewport và khi document hidden; giảm chuyển động tắt sway.
Focused Chromium PASS chuyển động theo thời gian/hover pause/manual pause-resume/
offscreen pause/reduced-motion none, không tràn1440/390/320px100/130%, đủ8ảnh.
Visibilitychange listener kiểm source, chưa mô phỏng tab background. Build/typecheck
PASS, lint0error6warning cũ. CUA in-app thực tế reduced-motion=true nên ảnh tĩnh;
[preview hiện tại](../../.impeccable/review/web-member/hero-sway-preview.jpg).
Proxy QA3048 đang không chạy ở lượt này; kệ API hiện trạng thái lỗi, không đổi API
hoặc dataset để kiểm hiệu ứng. Không nhận là kiểm lại giao dịch/native.

Sau `6c0e266`, thay một bìa Gachiakuta bằng SAO do chủ dự án cung cấp; giữ CSS,
vị trí/hover. Build/typecheck và kiểm ảnh tải/hiện CUA PASS;
[ảnh SAO hiện tại](../../.impeccable/review/web-member/hero-sao.jpg).

Sau `48e806d`, thay Oz→Chúa nhẫn (hai vị trí), Alice cũ→Alice mới,
Pride→Nghìn lẻ một đêm trong hero và ba mục khám phá. CSS/hover không đổi.
Build/typecheck PASS, CUA1440/390px PASS8ảnh tải/hiện và mobile không tràn;
[desktop hiện tại](../../.impeccable/review/web-member/hero-replacement-desktop.jpg),
[mobile hiện tại](../../.impeccable/review/web-member/hero-replacement-mobile.jpg).
Kiểm hover/chữ lớn bên dưới thuộc checkpoint48e806d với cùng CSS.

Cập nhật hero sau checkpoint `e0b739f`: thêm bốn bìa do chủ dự án gửi, giữ bốn vị
trí cũ thành tám; desktop hai cụm2×2, <=1100 dưới search, <=800 thành4×2. Hover
fine-pointer phóng1.12×/nâng8px/bóng đổ, rời chuột trả về; giảm chuyển động tắt
phóng/nâng, touch không hover. Không đổi danh sách/API/mutation hoặc màn khác.
[Desktop8bìa](../../.impeccable/review/web-member/hero-eight-desktop.jpg),
[mobile](../../.impeccable/review/web-member/hero-eight-mobile.jpg),
[hover](../../.impeccable/review/web-member/hero-eight-hover.png),
[320px130%](../../.impeccable/review/web-member/hero-eight-320-130.png).
Focused Chromium QA PASS: tám ảnh tải/hiện đầy đủ, không tràn1440/1100/800/390/320px
ở100/130%; hover phóng/nâng/exit reset, reduced-motion static, touch gate off,
search Enter chuyển q đúng. Layout assessor xác nhận phạm vi yêu cầu đã đạt,
không có lỗi layout đáng kể do lượt sửa này. Scan layout một lượt0findings;
scan provenance7/7 (WebP dùng sidecar). Build/typecheck PASS, lint0error6warning cũ.
Các kết quả integration16unit bên dưới thuộc checkpoint trước, không chạy lại
nghiệp vụ không đổi ở lượt hero.

Build/typecheck và16/16 unit PASS. Lint0error,6warning có sẵn ở chat/exchange.
Build còn cảnh báo bundle JS lớn (1.06MB minified,330KB gzip); chưa tách bundle
trong gói visual này.
Browser integration HTTP Nest/MongoDB thật trên database riêng *_test, storage
FAKE: tìm/lọc/sort/cursor/chi tiết, rỗng/503/retry, login return/owner guard,
form5 bước/dữ liệu giữ lại/upload/submit/mất phản hồi replay,390px100/130% PASS.
Purchase mất phản hồi sau commit→thử lại giữ nguyên key/body/version, API xác nhận
chỉ một conversation PASS. Home/Detail/Search320px130% không tràn ngang PASS.
Browser CUA chụp Home/Search/Detail1440px và390px, Login320px; không tràn ngang
trong các viewport đã đo. [Ảnh desktop](../../.impeccable/review/web-member/home-desktop.jpg),
[mobile](../../.impeccable/review/web-member/home-mobile.jpg),
[tìm sách](../../.impeccable/review/web-member/search-desktop.jpg),
[chi tiết](../../.impeccable/review/web-member/detail-desktop.jpg) và
[login320](../../.impeccable/review/web-member/login-320.jpg) ghi bản sau sửa review.
Finish reviewer độc lập yêu cầu năm sửa: giữ cú/bìa trên mobile; radio chọn một
kèm Tất cả; viền control/focus đủ rõ; caption ảnh trung tính; lưu đúng DESIGN/sidecar.
Verdict Pass của reviewer độc lập: cả năm sửa **resolved**, disposition **ship**.
Verdict này chấm các sửa đã yêu cầu, không chứng nhận toàn sản phẩm hoặc thay
review người thật. Documenter đã cập nhật DESIGN/sidecar và kiểm schema-v2,
token/snippet/narrative parity; giữ riêng sự thật RN và các màn legacy.
Scan raster PASS4/4 có provenance. Không có approved comp; đây là code-led theo
hai ảnh tham chiếu của chủ dự án.
Detector một lượt:101 advisory đối chiếu DESIGN cũ (32 màu,54 cỡ chữ,15 radius),
không có finding cơ học; direction mới thay thế palette cũ theo yêu cầu chủ dự án.

Không đóng READINESS, không coi đây là human usability/native/live Supabase PASS.
Không push/PR/merge/deploy cho gói web này.
