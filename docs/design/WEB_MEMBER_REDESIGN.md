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
Hero/mục khám phá dùng ba bìa tư liệu có nguồn trong
[asset README](../../apps/user-web/public/illustrations/README.md); có chú thích
minh họa. Thẻ/chi tiết dùng ảnh API, không thay bằng ảnh stock. Mọi raster mới
được nhúng provenance. Các screenshot sử dụng fixture [QA], giá/tình trạng mô phỏng.

## Kiểm chứng

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
