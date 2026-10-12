# Tìm sách Android — 10/10/2026

Mode: Operate. Target: `apps/mobile-react-native/src/features/shelf/shelf-screen.tsx`.

Direction contract:
- THESIS: chọn sách cũ bằng ảnh, tình trạng và hai loại giá đọc được cùng chỗ.
- OWN-WORLD: danh mục hiệu sách độc lập; nền sáng, Be Vietnam Pro, xanh rừng,
  ảnh thật và đường phân cách tạo nhịp; không đưa khẩu hiệu vào tác vụ.
- STORY: tìm/lọc → so sánh danh sách theo thứ tự API → mở chi tiết → Back giữ context.
- FIRST VIEWPORT: logo/địa bàn, tiêu đề Tìm sách, tìm kiếm và Bộ lọc có nhãn,
  mode chips, mô tả kết quả, ảnh/tình trạng/giá của cuốn đầu tiên, điều hướng.
- FORM: code-led, concept-seed key `3a051903`, assigned direction4. Danh sách
  ảnh cạnh thông tin; native font-scale/narrow reflow được ưu tiên hơn mật độ.
  Hai prototype native dùng cùng dữ liệu; không có raster comp được user duyệt.

Người dùng tìm một cuốn sách cũ tại TP.HCM, so sánh tên, ảnh, tình trạng và
giá, rồi mở chi tiết. API, thứ tự, filter và cursor giữ nguyên. Không thêm
checkout, điểm thưởng, đánh giá, xác thực hoặc hành động giao dịch chưa có.

## Hướng được triển khai

Danh mục của một hiệu sách độc lập: nền sáng, chữ Be Vietnam Pro, màu xanh
làm điểm tựa; ảnh thật và thông tin sách tạo sự khác biệt. Bỏ mặt tiền xanh
đặc, Lora, khẩu hiệu và các hàng cuộn ngang. Tìm kiếm nằm ngoài vùng cuộn;
“Bộ lọc” có nhãn nhìn thấy. Danh sách dọc đặt ảnh cạnh thông tin; tiêu đề,
tình trạng, giá bán và giá trị đổi có thứ bậc riêng. Thanh điều hướng sáng,
đích đầu tiên gọi đúng việc là “Tìm sách”.

Hai phương án dùng cùng dữ liệu, thứ tự và component: danh sách để chọn sách
và lưới để xem bìa. Lưới chỉ ở `/showcase?composition=grid`, có nhãn dữ liệu
mẫu; không thêm công tắc bố cục cho sản phẩm. Chọn danh sách vì thông tin
không bị chia vào cột hẹp và người dùng chỉ cần cuộn một chiều. Chữ lớn ở
320dp chuyển ảnh/thông tin thành khối dọc; lưới mẫu chuyển về danh sách.

## Quyết định và giới hạn

Chủ dự án duyệt tiến hành; agent chọn hướng phù hợp theo kế hoạch đã duyệt,
không mở thêm vòng xin duyệt.
Impeccable concept-seed đã chạy, chỉ số4 được áp vào danh mục hiệu sách;
Taste redesign dùng cho typography/hierarchy/preservation, mobile guidance
cho safe area, nhãn và sự nhất quán. Bản code là chuẩn kiểm chứng, không dùng
ảnh sinh làm native evidence.

Những hệ thống đã cân nhắc: mục lục thư viện; tờ giới thiệu hội sách; nhật ký
đọc; danh mục hiệu sách; chỉ dẫn thư viện; tạp chí truyện; thẻ câu lạc bộ đọc.
Danh mục hiệu sách là hướng4. Các challenger quang phổ, streaming, vé máy
bay, bản đồ transit, ký hiệu vũ đạo, marketing monochrome không thay thế
mục tiêu tìm sách bằng một cơ chế tương tác khác. Tiếp
thu kỷ luật căn hàng, ảnh nguyên vẹn, trạng thái rõ và màu có chủ đích;
không lấy biểu tượng/trang trí của chúng vào sản phẩm.

Be Vietnam Pro regular400/bold700 đã có trong repo; không thêm font giả500/600.
Logo giữ artwork gốc. Đổi font các role chung tác động các màn RN còn lại,
không có nghĩa bố cục các màn đó đã được redesign. Web Vite/Flutter chưa đổi.
Kiểm chứng và ảnh thực chạy được ghi trong báo cáo bàn giao cùng gói này.
