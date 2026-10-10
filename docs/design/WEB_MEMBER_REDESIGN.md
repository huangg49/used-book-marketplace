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

- Trang chủ: hero đỏ, tiêu đề Anton, bìa minh họa, search có tác dụng; kệ mới đăng
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
