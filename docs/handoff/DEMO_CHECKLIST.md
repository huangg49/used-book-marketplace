# Demo từ mốc F2h

Mục tiêu: chứng minh các chức năng đã có và nơi tiếp tục phát triển. Không diễn
luồng mua sách hoàn chỉnh bằng nút giả. Setup và lệnh nằm ở [START_HERE](START_HERE.md).

## Trước khi demo

- [ ] Đúng commit bàn giao; API và cả hai worker cùng revision/migration.
- [ ] PostgreSQL chạy; migrate/seed local thành công, không reset database dùng chung.
- [ ] `doctor:local` không còn FAIL. Đã xử lý đúng URL emulator/LAN và CORS.
- [ ] Muốn demo upload thật: bucket Supabase riêng tư sẵn sàng, media worker chạy.
  Chuẩn bị ảnh cuốn sách mình có quyền chụp, JPEG/PNG/WebP dưới 10 MB.
- [ ] Tài khoản Member và reviewer độc lập đăng nhập được. Seed local có
  `member@latlai.local`, `admin@latlai.local`, `staff@latlai.local`,
  `test_operator@latlai.local`; mật khẩu theo cấu hình local, không lấy từ chat.
  Seed không đổi mật khẩu account cũ. Không dùng account demo trong production.
- [ ] RN web export trỏ API của buổi demo, không phải fixture cổng 3009 đã tắt.
  `/ui` và `/design` chỉ bật khi chủ ý giới thiệu component/dữ liệu mẫu.
- [ ] Phân biệt phiên trình duyệt RN và operations; token browser ở bộ nhớ, reload
  cần đăng nhập lại. Tránh quá 5 login/account/IP trong 15 phút; không tắt limiter.

## Hành trình sản phẩm đã có

| Người thao tác | Thực hiện | Kết quả cần thấy |
|---|---|---|
| Guest | Mở kệ, tìm/lọc, mở chi tiết | Kệ thật hoặc trạng thái rỗng; giá bán/giá trị đổi có nhãn, ảnh/tình trạng do người đăng cung cấp |
| Member | Tài khoản → sổ địa chỉ | Địa chỉ riêng, vùng TP.HCM demo A/B có nhãn mô phỏng; lỗi nhập tại trường |
| Member | Sách của tôi → tạo nháp → chọn hoặc đề nghị đầu sách | Nội dung nhập giữ lại khi đổi bước; catalog chưa xác nhận được chặn phù hợp |
| Admin | Operations → duyệt đề nghị đầu sách nếu có | Quyết định thật, không tự duyệt yêu cầu của mình; chỉ có quyền phù hợp mới thấy thao tác |
| Member | Ảnh/tình trạng → giá → nơi gửi → kiểm tra → gửi duyệt | Ảnh qua xử lý; có mô tả khuyết điểm, xác nhận quyền đăng; bài chờ duyệt |
| Reviewer độc lập | Mở hồ sơ, đọc ảnh/tình trạng, checklist rồi duyệt hoặc từ chối có lý do | Lỗi thiếu lý do/checklist nằm đúng chỗ; kết quả cập nhật theo API |
| Member / Guest | Xem kết quả hoặc sửa/gửi lại nếu bị từ chối; tìm sách đã duyệt trên kệ | Bài đủ điều kiện mới công khai; người đọc thấy đúng revision/ảnh/tình trạng |
| Member | Thử sửa giá trong bản nháp rồi bấm quay lại và hủy rời màn | Có cảnh báo, nội dung chưa lưu vẫn còn; không tự gửi mutation khi chỉ điều hướng |

Nếu thời gian ít, dùng đầu sách đã được xác nhận. Không bỏ bước xử lý ảnh hoặc
gán Approved bằng SQL để buổi demo trông thông suốt. Kệ rỗng là trạng thái hợp lệ.

## Giới thiệu nền tảng giao dịch riêng

Swagger/contract và API tests chứng minh quote → Order → funding → Preparing →
shipment → pickup/InTransit hoặc review. Chỉ giới thiệu trong phạm vi báo cáo đã có.
Hiện chưa có member checkout/ví/Order UI, Delivered, Inspection 72h hay settlement
cho Seller. Carrier/topup dùng simulator, không có giao hàng hoặc thanh toán thật.

Buyer và Seller cần hai Member độc lập, operator phải không phải hai bên. Seed
local hiện chỉ tạo một Member; đừng hứa demo giao dịch hai bên ngay sau seed hoặc
mượn role Staff để thay. Có thể dùng suite API trên DB `_test` để trình bày các
bằng chứng này; fixture không tự trở thành dữ liệu bền vững trên app demo.

## Nếu có lỗi trong buổi demo

- Giữ request ID hợp lệ, không chụp token/khóa hoặc request body nhạy cảm.
- Lỗi mạng khi gửi: dùng hành động retry của màn hình đang giữ cùng yêu cầu;
  không reload/tạo bản mới khi kết quả chưa rõ.
- Ảnh chưa Ready: kiểm worker và trạng thái; không gọi browser fixture là live Supabase.
- Version conflict: đọc trạng thái mới và xác nhận nội dung còn giữ; không bỏ khóa
  expectedVersion để đi tiếp.
- Native picker/Back/keyboard/TalkBack chưa nghiệm thu trong đợt bàn giao; nói rõ
  nếu đang demo browser. APK debug cần Metro, không phải bản cài độc lập để phát hành.
