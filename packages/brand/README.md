# Lật lại - Bộ nhận diện v1.0

Tên: **Lật lại**. Tagline: **Sách cũ. Chương mới.**

Hướng thiết kế: hai trang sách mở và một trang lật; xanh lá trầm, giấy kem, cam đất.
Đây là bộ concept gốc dành cho dự án mua bán/trao đổi sách đã qua sử dụng.

## Mở và sử dụng

- Mở `index.html` để xem toàn bộ bộ nhận diện offline.
- Đọc `guidelines/Lat_Lai_Brand_Guidelines.pdf` trước khi triển khai.
- SVG logo đã chuyển chữ thành vector; mở được trong Figma, Illustrator hoặc Inkscape mà không cần cài font.
- PNG logo có nền trong suốt; logo trắng chỉ nhìn thấy trên nền màu tối.
- App icon là ảnh vuông nền đặc, không bo góc sẵn. Các kích thước 16-512 px là tài sản nguồn; công cụ build của từng nền tảng cần tạo bộ asset đúng cấu hình.
- Favicon 16 px nên dùng biểu tượng một màu để bảo toàn độ rõ. ICO có 16/32/48 px.
- Hình splash là tham chiếu bố cục; triển khai bằng logo căn giữa vùng an toàn và nền kem.
- Bookmark là bản thiết kế RGB tham chiếu 3:8; cần kiểm tra kích thước, bleed và màu in theo nhà in.
- Token thương hiệu không thay thế màu ngữ nghĩa cho lỗi, cảnh báo, thành công trong sản phẩm.

## Teamwork

Dùng một bộ nguồn chung. Khi được chốt, đặt vào `packages/brand/` trong monorepo; cập nhật phiên bản cùng pull request.
Không tự đổi tên, dấu tiếng Việt, tỷ lệ hoặc màu logo tại từng app.
Ứng dụng Flutter đăng ký font trong pubspec; React Native nạp font bằng cơ chế tương ứng của Expo; web dùng @font-face.
Tệp JSON là nguồn tham chiếu chung; CSS/TypeScript/Dart là các bản xuất đồng bộ trong phiên bản này.

## Giới hạn phạm vi

Đây là concept v1.0, chưa phải xác nhận độc quyền tên hoặc logo. Chưa tra cứu nhãn hiệu hay tên miền.
Bộ nhận diện được lưu chung trong monorepo tại `packages/brand/`; chưa tích hợp vào giao diện các ứng dụng.
Font đi kèm có giấy phép SIL OFL riêng trong `fonts/`; giữ các giấy phép khi phân phối font.
