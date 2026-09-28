# Rà soát nhận diện Lật lại — bước 1

Ngày: 2026-09-24. Phạm vi: nhận diện thương hiệu, chưa thiết kế màn hình nghiệp vụ.

## Căn cứ đã đọc

- `packages/brand/guidelines/Lat_Lai_Brand_Guidelines.pdf`: đủ 8 trang nội dung;
  render và xem trực quan trang logo, màu và typography.
- Brand board, logo SVG, icon, tệp font và token v1.
- Mục tiêu, listing vật lý và yêu cầu minh bạch tình trạng sách trong SRS.
- Mã nguồn login/account RN và phần đăng ký font hiện tại.

## Đánh giá và quyết định

| Quan sát | Quyết định ở bước 1 | Kiểm chứng cần tiếp tục |
|---|---|---|
| Logo sách mở khá quen thuộc; trang cam có nét riêng có thể phát triển | Giữ logo; phát triển trang lật thành ngôn ngữ đồ họa | Nhận diện khi bỏ logo khỏi màn hình; phản hồi người dùng |
| Xanh, kem và cam phù hợp chất sách, nhưng board v1 chủ yếu là bảng tài sản | Tạo nhịp bố cục và hệ ứng dụng có câu chuyện chuyền tay | Thử với nhiều bìa sách thật, không chỉ nền phẳng |
| Font thương hiệu đã có; màn hình RN chưa khai báo `fontFamily` và chưa nạp font | Đặc tả lại vai trò, cung cấp mẫu dấu tiếng Việt | Native font loading, font scaling, nhiều kích thước thiết bị |
| RN dựng chữ `lật lại.` thay wordmark vector | Yêu cầu dùng asset logo đúng trong bước tích hợp | Kiểm tra app header sau bước 2 |
| Token v1 chưa có ngữ nghĩa lỗi/cảnh báo/viền | Bổ sung đề xuất có cặp tương phản đo được | Các state và focus thực tế trên component |
| Cam v1 trên kem đạt 3,8201:1 | Dành cho đồ họa; thêm rustText #963F28 cho chữ nhỏ | Kiểm tra các cặp màu mới nếu thêm |
| Font Lora đi kèm thiếu glyph U+20AB | Dùng Be Vietnam Pro cho tiền và dữ liệu | Render native; không dựa vào fallback ngầm |
| Slogan đang chiếm nhiều chỗ ở auth/profile | Phân biệt ngôn ngữ truyền thông và ngôn ngữ thao tác | Màn hình phải ưu tiên việc người dùng cần làm |

## Hướng được phát triển

**Dấu chuyền tay** kể khoảnh khắc một người đọc xong và một người khác đọc tiếp.
Ba yếu tố: trang lật; nhịp gáy sách; thẻ nhắn gửi. Tên, tagline, logo, năm màu cốt lõi
và hai họ font được giữ. Thay đổi nằm ở bố cục, phân cấp, ứng dụng đồ họa, giọng nói
và các vai trò màu còn thiếu.

Đây là đánh giá thiết kế của người thực hiện, chưa phải kết quả nghiên cứu độc giả.
Không có việc tự công bố đã được chủ dự án duyệt hoặc độc quyền thương hiệu.

## Tài sản bàn giao

- [Trang trình bày responsive](../../packages/brand/index.html).
- [Quyết định và hướng dẫn v1.1](../../packages/brand/v1.1/README.md).
- Sáu nghiên cứu SVG có bản PNG: campaign, identity-board, page-turn, handoff-note,
  bookmark, size-proof. Chữ trong SVG đã outline; title/description được giữ.
- [Token đề xuất](../../packages/brand/v1.1/identity.tokens.json), CSS sinh tự động
  và [số đo tương phản](../../packages/brand/v1.1/contrast-report.json).
- Script dựng lại từ font, logo và JSON trong repo. Không dùng font hoặc ảnh từ CDN.

PDF, ZIP, token runtime và brand board v1 vẫn là tài sản lịch sử, không được ghi đè
hoặc diễn đạt thành v1.1. Các ứng dụng chưa được chuyển sang v1.1.

## Kiểm tra và giới hạn

- Sinh vector thành công; kiểm tra dấu tiếng Việt ở Lora 600, Be Vietnam Pro 400/700;
  kiểm tra ký hiệu tiền ở hai tệp Be Vietnam Pro.
- 13 cặp màu vượt ngưỡng khai báo; so sánh trên giá trị chưa làm tròn. Cam gốc/kem được
  báo riêng là cặp trang trí, không được gắn nhãn đạt tương phản chữ nhỏ.
- Đã xem ảnh render campaign, identity-board, thẻ nhắn và bookmark để kiểm tra bố cục.
- Font web tải từ tệp đi kèm; server trả 200 cho cả ba tệp font.
- Browser: đã xem bố cục tại viewport 320, 390, 760 và 1440 px. Không tràn ngang
  ở các kích thước này (scrollWidth bằng clientWidth). Đã xem các phần logo/màu/chữ/
  vật phẩm trên desktop và hero trên màn hình hẹp; chưa kiểm tra mọi phần trên mọi
  kích thước hay thiết bị vật lý.
- Browser không ghi nhận console error/warning ở lần kiểm tra cuối; ảnh tải thành
  công. Các anchor điều hướng nhận diện và về đầu hoạt động.
- Đường dẫn local và anchor trong HTML tồn tại; ID không trùng; SVG có title/desc,
  không phụ thuộc font ngoài. Sinh lại SVG/CSS/báo cáo cho cùng SHA-256.
- Năm màu cốt lõi trong token đề xuất khớp token v1. Python/JS authoring script hợp
  lệ cú pháp; `pnpm contract:check` và `git diff --check` đạt. Không chạy lại bộ test
  nghiệp vụ vì bước này không đổi mã ứng dụng hoặc hợp đồng API.
- Không có native build, user testing, thử màu in, hay chứng nhận accessibility toàn app
  trong phạm vi này. Sáu mẫu đồ họa không phải màn hình sản phẩm đã chạy nghiệp vụ.

## Điều kiện để sang bước 2

Thiết kế màn hình khám phá, chi tiết listing và đăng sách bằng cùng ngôn ngữ. Dùng
nhiều tên sách dài, ảnh thật được phép sử dụng, sách nhiều mức giá và tình trạng;
kiểm tra thiếu ảnh, lỗi mạng, quyền thao tác và chữ lớn. Các vật phẩm thương hiệu
không được biến thành tính năng app khi chưa được xác định phạm vi.

Tiếp nối ngày 25/09/2026: đã có [prototype ba màn hình React Native](SCREEN_STUDY.md)
dùng đề xuất 1.1 trong route opt-in. Token runtime chung và các luồng sản phẩm
chưa được chuyển đổi; xem báo cáo riêng để phân biệt kiểm tra browser với native.
