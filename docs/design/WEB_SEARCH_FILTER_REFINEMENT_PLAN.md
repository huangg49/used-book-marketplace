# Đề xuất làm lại trang Tìm sách và bộ lọc

> Plan và evidence dưới đây thuộc checkpoint đến `aadbd88`. Chủ dự án sau đó
> duyệt bộ lọc theo danh mục đầy đủ, cho phép sidebar dài/cuộn tự nhiên và
> mở rộng API/DB. [Phạm vi và kết quả mới](CATALOG_CONTEXTUAL_FILTERS.md) thay
> yêu cầu luôn vừa viewport và giới hạn chỉ lọc thể loại preview của plan này.

11/10/2026. Chủ dự án đã duyệt và yêu cầu triển khai ngày11/10/2026. Evidence thực thi ghi ở báo cáo refinement.
Nguồn hiện tại: `8d9cdf0`, BookSearchPage.tsx/module.css, DESIGN.md và các ảnh
search-shelf-laptop/mobile trong .impeccable/review/web-member. Local5186 không
phản hồi lúc lập plan; đã chạy lại và kiểm CUA trong lượt triển khai bên dưới.

## Mục tiêu và hướng

Người đọc tìm một bản sách, hiểu điều kiện đang lọc và xem nhiều kết quả. Mode
Operate, cải tiến trong brand đã duyệt: đỏ rượu vang, giấy kem, Anton cho đầu trang,
Be Vietnam Pro cho control. Bìa và thông tin sách là trọng tâm. Hero Home giữ nguyên.

Ở mốc lập kế hoạch, áp dụng Impeccable shape/layout/adapt và skill UI cũ.
Taste Skill chưa được cài
local; đã đọc [nguồn chính chủ](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md),
phần brief/audit/redesign-preserve. Chỉ dùng các nguyên tắc phù hợp với trang tìm
sách, không áp mẫu landing hoặc motion mạnh vào control tác vụ. Định hướng:
DESIGN_VARIANCE4, MOTION_INTENSITY2, VISUAL_DENSITY6; giá trị phục vụ đề xuất,
không thay token canonical hoặc cài thêm thư viện.

## Vấn đề đã xác định

- Sidebar hiện216px, có padding phải24px: vùng nhập giá quá hẹp. Không có sticky.
- Năm lựa chọn tình trạng và ba mức giá nhanh đều xếp dọc, mục44px nối tiếp;
  hai action nằm cuối nên ở ảnh laptop1366×768 chưa thấy hết bộ lọc.
- Khoảng cách28px giữa nhóm làm cột dài thêm. Kệ sách đã có card gọn, giữ toàn
  ảnh và4cột laptop/5desktop; cần cân lại cột, không tăng card.

## Bố cục đề xuất

1. Đầu trang tìm kiếm thấp hơn, tên trang bên trái, search lớn bên phải. Căn mép
   với vùng nội dung. Bỏ khoảng trống thừa; không dựng thêm hero hoặc banner.
2. Cột lọc khoảng248–264px, gutter24–28px, kệ bên phải giữ4cột ở laptop đủ rộng
   và5cột desktop khi bề rộng card cho phép. Mục tiêu panel khoảng460–500px ở
   cỡ chữ thường, đo lại bằng nội dung thật trước khi chốt.
3. Panel giấy kem khác nhẹ với nền, nét viền mảnh, góc12px, không thêm glow/
   gradient hoặc lớp card bên trong. Header “Bộ lọc sách” và trạng thái lựa chọn
   rõ; tên nhóm đậm, khoảng cách giữa nhóm lớn hơn giữa control cùng nhóm.
4. Tình trạng: nhóm lựa chọn hai cột, giữ một lựa chọn hoặc tất cả; phải đọc được
   cả “Gần như mới”, “Còn tốt”, “Đã dùng nhiều”, “Cũ nhiều”. Không rút nhãn thành
   thuật ngữ khó hiểu. Khoảng giá: hai ô Từ/Đến đủ rộng trên một hàng; các mức
   giá nhanh50k/100k/200k nằm ngang, có nhãn rõ đây là mức tối đa.
5. Đáy panel: nút chính “Áp dụng” đỏ, hành động đặt lại ở bên cạnh, cùng một hàng
   và luôn trong vùng nhìn thấy. Giữ phân biệt bản nháp với bộ lọc đã áp dụng;
   reset nháp rồi Apply để commit như hiện tại, hoặc đổi semantics riêng sau
   khi thống nhất nhãn. Không để một nút “Đặt lại” mơ hồ về hậu quả.
6. Hình thức Tất cả/Mua/Đổi/Bán hoặc đổi và Sắp xếp ở thanh trên kệ; nhãn lọc
   đang áp dụng nằm dưới, bỏ riêng từng điều kiện được. Loading giữ cấu trúc
   kệ, rỗng/lỗi có đường sửa tìm kiếm hoặc thử lại.

## Ghim và thích ứng theo chiều cao

- Desktop: sticky trong cột riêng, mốc bám dưới navbar+16px. Tính từ vùng navbar
  thực tế ở cả trạng thái rộng và thu gọn; không chồng logo/menu, không nhảy ngang.
  Chỉ kệ cuộn qua; panel dừng trong vùng catalog trước footer. Không dùng fixed
  phủ nội dung hoặc khóa toàn bộ trang.
- Laptop100%: toàn bộ control/nhóm lọc/action phải nhìn thấy ngay khi vào trang,
  không cuộn trang hoặc cuộn riêng sidebar để tìm nút cuối. Mục tiêu kiểm thực
  1366×768 và1535×735. Chiều cao panel theo nội dung, không kéo thành một cột
  trống dài hoặc ép chiều cao rồi cắt phần dư.
- Viewport thấp/chữ200%: đổi tình trạng và giá nhanh sang control chọn gọn trước
  khi hết chỗ; vẫn có đủ điều kiện, hai ô giá và action. Không thu chữ/control
  dưới mức dùng được. Nếu keyboard/mobile chiếm màn hình, nội dung được cuộn
  an toàn thay vì bị clip; không hứa toàn bộ mọi giá trị đều mở cùng lúc ở mọi cỡ.
- Mobile/tablet: nút Bộ lọc và số điều kiện ở cạnh Sắp xếp, mở panel có tiêu đề/
  đóng rõ. Nhóm hiện đủ, action đáy luôn thấy; focus/Escape/Back và keyboard
  không bị che. Kệ2cột,320px vẫn không tràn ngang.

## Hành vi và phạm vi giữ đúng

Giữ q/mode/condition/sort/minSalePrice/maxSalePrice/cursor,20cuốn/trang, URL/Back,
giá không hợp lệ giữ dữ liệu, giá bán khác giá trị đổi, API thật khác preview.
Không thêm lọc thể loại/tác giả/ngôn ngữ như một tính năng live khi contract chưa
hỗ trợ. Không bịa tổng số sách, rating, trust badge hoặc giá giao dịch.
Motion chỉ phản hồi chọn/hover150–200ms và panel mở/đóng; tuân reduced-motion,
không có hiệu ứng chạy liên tục trong bộ lọc.

## Trình tự và tiêu chí duyệt

Sau khi duyệt: dựng cấu trúc/panel trước, kiểm chiều cao laptop, rồi hoàn thiện
chữ/viền/trạng thái/kệ. Kiểm desktop1535×900, laptop1366×768 và1535×735,
mobile390px/320px, viewport thấp/chữ200%, keyboard/focus và navbar thu gọn.
Kiểm chọn→Apply→bỏ lọc/reset, giá sai, Back từ chi tiết, cursor/rỗng/lỗi/retry.
Một lượt QA theo lô, một lượt sửa và xác nhận; finish reviewer độc lập và
documenter theo Impeccable khi triển khai. Chỉ nhận đủ điều kiện “không cần cuộn
để thấy hết filter” khi geometry và thao tác thật đạt ở các laptop nêu trên.

## Kết quả triển khai11/10/2026

Đã triển khai264px sidebar/28px gutter, ghim dưới navbar, lựa chọn tình trạng
hai cột, hai ô giá và mức tối đa nằm ngang, action44px cùng hàng. Viewport thấp
dùng native select; giá sai ở desktop cao701–850px cũng đổi tình trạng sang
select để giữ nguyên thông báo lỗi và nút khôi phục. Mobile chỉ cuộn thân panel,
action đáy luôn hiện. Không đổi hero, API/session hoặc truy vấn hiện có.

CUA hai laptop mục tiêu đều hiện đủ filter tại scrollY0; panel thường505.375px,
đáy719.46875px; panel lỗi487.65625px, đáy701.75px. Sticky/màn thấp/mobile320px,
draft/Apply/reset/Back/cursor/rỗng/lỗi/retry đã kiểm. Build/typecheck/28unit PASS,
lint0error/5warning cũ. Review độc lập SHIP cho hai fix; canonical scoped merge
và preservation PASS. Browser200%/bàn phím OS thật/native/live-success và human
NOT RUN; không dùng viewport thấp thay bằng chứng zoom/keyboard.
[Báo cáo và ảnh](WEB_MEMBER_REDESIGN.md) ghi evidence thực tế.
Chat/Thông báo dở được giữ riêng; lỗi race xác thực socket còn mở, chưa sửa.

## Bổ sung thể loại đã duyệt11/10/2026

Sau checkpointbc5d98f, chủ dự án duyệt ưu tiên Thể loại → Giá → Tình trạng.
Thêm searchable combobox từ8thể loại của bộ demo91ấn bản, tình trạng luôn là
native select. Chọn một thể loại, Apply mới áp dụng; chip cho phép bỏ, URL/Back
giữ lựa chọn. Lọc toàn bộ catalog trước phân trang; live API chưa hỗ trợ nên
không hiển thị control hoặc gửi tham số category trong live. Không đổi contract.
Hai laptop giữ sidebar ghim; cao≤700px dùng nút Bộ lọc/native dialog để action
không bị đẩy khỏi vùng nhìn. Evidence cuối ghi trong báo cáo và surface brief.
