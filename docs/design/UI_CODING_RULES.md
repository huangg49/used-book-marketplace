# Luật giao diện Lật lại

09/10/2026: [brief mới](../../DESIGN.md) được chủ dự án duyệt, ưu tiên hơn các
quyết định thẩm mỹ UI-1/brand bên dưới. Lora không còn bắt buộc; hướng sans-serif
cần kiểm bằng màn thật trước đổi runtime. Invariant/accessibility/data vẫn giữ.

UI-1 (30/09/2026): [DESIGN.md](../DESIGN.md) là nguồn sự thật về định hướng trình
bày mới, ưu tiên khi mâu thuẫn với quyết định thẩm mỹ cũ bên dưới hoặc brand v1.1.
Đã duyệt màn chuẩn chi tiết; cho phép áp sang kệ sách, chờ duyệt ảnh kệ. Quy tắc về
nghiệp vụ, component chung, accessibility và bảo toàn dữ liệu vẫn giữ hiệu lực.

Áp dụng cho React Native. Bản đầu: 25/09/2026. Đọc cùng
[component và cách dùng](UI_COMPONENTS.md), [nghiên cứu màn hình](SCREEN_STUDY.md)
và [nhận diện Dấu chuyền tay](../../packages/brand/v1.1/README.md).

## 1. Bản sắc phải gắn với công việc của người đọc

Lật lại kể việc sách đi từ người đọc này sang người đọc khác. Trong mỗi màn hình,
chọn một điểm thể hiện câu chuyện đó: bìa sách, tình trạng thật, dấu lưu sách hoặc
lời nhắn có ích. Không phủ khẩu hiệu lên form, lỗi và thông tin giao dịch.

- Giữ logo gốc qua `BrandLogo`; không gõ tên app bằng font khác để giả logo.
- Nền giấy, chữ rừng, ảnh bìa nguyên màu. Cam là dấu nhấn tiết chế; không tô cam
  chữ nhỏ. Dùng `rustText` cho chữ mang sắc đất nung.
- Lora cho tiêu đề/tên sách; Be Vietnam Pro cho thân bài, nút, nhãn và tiền.
  Lora trong repo thiếu glyph đồng. Không dựa vào fallback để hiển thị giá.
- Tránh gradient trang trí, kính mờ, bóng nổi đồng loạt, emoji làm icon và các khối
  card lặp vô cớ. Divider, khoảng cách và chữ thường đủ để phân nhóm thông tin.
- Chỉ dùng ảnh có nguồn/quyền sử dụng. Không sửa màu/cắt mất chi tiết quan trọng
  của sách. Ảnh minh họa phải được phân biệt với ảnh bản sách đang bán.
- Không tạo rating, huy hiệu xác thực, số độc giả, lượng giao dịch hoặc độ khan
  hiếm giả để làm màn hình “đầy”. Nội dung mẫu phải được nhận biết là mẫu.

## 2. Một nguồn cho các quyết định dùng chung

Import component qua `src/core/ui`. Màu nền tảng ở
`packages/brand/v1.1/identity.tokens.json`; vai trò màu, chữ, khoảng cách và kích
thước React Native ở `core/ui/theme.ts`. Component không import feature, gọi API,
đọc session hoặc tự quyết định quyền nghiệp vụ.

- Dùng `AppText`, `Button`, `TextField`/`SearchField`, `Sheet`/`ConfirmDialog`.
  ESLint chặn import trực tiếp Text/TextInput/Button/Modal trong route và feature.
- ESLint chặn literal màu hex/rgb trong route và feature. Thay đổi màu cần cập nhật
  vai trò dùng chung và kiểm tra tương phản; không chữa từng màn hình riêng lẻ.
- Chọn spacing/radius token cho bố cục mới. Kích thước riêng của bìa, icon hoặc
  trang trí được phép khi có lý do trong mô tả thay đổi. Không tạo token cho mọi số.
- Chưa trích xuất một component lớn chỉ vì hai khối cùng có border. Trích xuất
  khi ý nghĩa, dữ liệu đầu vào và hành vi giống nhau. Ưu tiên composition; không
  tạo một component có hàng chục cờ cho mọi màn hình.
- Sửa component chung: cập nhật ví dụ `/ui`, kiểm tra các màn hình đang dùng.
  Đừng sao chép component sang feature để tránh sửa hợp đồng của nó.

## 3. Phân cấp và nội dung

Mỗi vùng tác vụ có một hành động chính. Nút nói hành động cụ thể: “Gửi duyệt”,
“Thử lại”, “Bỏ bản nháp”; không dùng “OK” cho thao tác có hậu quả.
Giá bán và giá trị đổi luôn có nhãn phân biệt. Tên sách dài phải xuống dòng;
không thu nhỏ font tự động chỉ để vừa một hàng. Dữ liệu cần quyết định không
bị cắt bằng dấu ba chấm mà không có cách xem đầy đủ.

Giọng văn ấm, ngắn, cụ thể. Lỗi nói điều gì chưa làm được và bước tiếp theo;
không đổ lỗi cho người dùng. Thuật ngữ nội bộ như DTO, endpoint, SRS, exception
không xuất hiện trong luồng sản phẩm. Trang `/ui` là công cụ nội bộ, không phải
một tab điều hướng của app dành cho bạn đọc.

## 4. Phản hồi đúng nơi, đúng mức

| Tình huống                   | Thành phần                                         | Hành vi bắt buộc                                                                       |
| ---------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Sai dữ liệu một ô            | `TextField error`                                  | Nhãn vẫn còn; nói cách sửa; giữ giá trị; không chỉ đổi màu viền                        |
| Lỗi gửi form                 | `Notice tone="error"` trong form                   | Giữ dữ liệu; cho thử lại khi phù hợp; không thông báo thành công trước phản hồi server |
| Lỗi tải lần đầu              | `StatePanel` + hành động                           | Phân biệt với dữ liệu rỗng; nút retry có trạng thái busy                               |
| Refresh lỗi nhưng có dữ liệu | `Notice` cạnh dữ liệu hiện có                      | Giữ dữ liệu cũ, nói rõ chưa cập nhật; không thay bằng màn hình rỗng                    |
| Thành công nhẹ               | `Notice tone="success"` hoặc trạng thái điều khiển | Không yêu cầu đóng modal; thông tin quan trọng không tự biến mất theo timer            |
| Cảnh báo không chặn xem      | `Notice tone="warning"`                            | Nói rõ thao tác nào bị hạn chế                                                         |
| Người dùng cần quyết định    | `ConfirmDialog`                                    | Nêu hậu quả; hủy dễ thấy; lỗi ở trong dialog; chỉ đóng sau khi thành công              |
| Xem thông tin/chọn tùy chọn  | `Sheet`                                            | Có tên, nút đóng, nội dung cuộn được; hỗ trợ Back/Escape                               |

`presentError` ánh xạ lỗi transport thành lời giải thích được kiểm soát. Không
render `error.message`, stack trace hoặc response body tùy ý. Request ID hợp lệ
có thể dùng khi hỗ trợ; không log mật khẩu, token, nội dung form. Không biến
gợi ý `recovery: retry` thành tự gửi lại mutation: phải biết server đã nhận hay
chưa và có bảo đảm idempotency trước khi retry giao dịch.

Modal không thay thế lỗi trong form. Không xếp nhiều modal. Chủ màn hình sở hữu
`visible`, `busy`, `error` và quyết định thành công; component chỉ trình bày.
Trong lúc confirm đang xử lý, khóa xác nhận/đóng/hủy và có timeout ở tầng request
để tránh khóa người dùng vô thời hạn. Xóa dữ liệu bền vững cần quy trình backend
phù hợp; ví dụ catalog chỉ xóa dữ liệu minh họa trong phiên.

## 5. Component phải dùng được

- Vùng chạm tối thiểu 44 × 44; nút/ô nhập chuẩn cao ít nhất 52. Không khóa chiều
  cao ô chứa văn bản; chữ lớn được xuống dòng. Giữ font scaling của hệ điều hành.
- Nút busy giữ tên hành động và chặn nhấn lặp. Feature vẫn phải bảo vệ mutation;
  disabled UI không phải khóa transaction hoặc kiểm tra quyền trên server.
- Ô nhập có nhãn, kiểu bàn phím, autofill phù hợp, hint/error và giới hạn có lý do.
  Placeholder không thay nhãn. Khi submit nhiều lỗi, đưa người dùng đến lỗi đầu
  tiên hoặc phần tổng hợp lỗi có thể đọc được.
- Mọi icon tương tác có tên; trạng thái selected/checked/disabled/busy được công
  bố cho công cụ hỗ trợ. Màu không được là tín hiệu duy nhất.
- Có focus nhìn thấy khi dùng bàn phím. Sheet có tên dialog, vùng cuộn, nút đóng
  và safe area; kiểm tra focus khi mở/đóng và thao tác Tab trên web, VoiceOver/
  TalkBack trên native. Không tuyên bố đạt accessibility chỉ vì có aria props.
- Với bảng lọc hoặc bảng lựa chọn dài, đặt hành động chính trong `Sheet.footer`
  ngoài vùng cuộn; không bắt người dùng kéo hết danh sách để áp dụng. Giữ lựa chọn
  tạm riêng với bộ lọc đang áp dụng; đóng bảng không thay đổi truy vấn hiện tại.
- Tương phản chữ thường tối thiểu 4.5:1, ranh giới điều khiển 3:1. Các cặp đang
  dùng được test từ token. Divider trang trí không thay border ô nhập.
- Không bắt người dùng xem chuyển động trang trí. Sheet mặc định không animation;
  `motion="photo"` chỉ dùng cho xem ảnh lớn theo DESIGN, đóng ngay. Chuyển động
  hỗ trợ reduced motion cập nhật trực tiếp, không che giá hoặc trì hoãn thao tác.

## 6. Cách team triển khai một màn hình

1. Ghi mục tiêu người dùng, dữ liệu thật cần có, hành động và quyền/state transition.
2. Chọn component từ `/ui`; chỉ bổ sung cái còn thiếu. Quyền luôn do API quyết định.
3. Làm luồng chính và các trạng thái thực sự áp dụng: tải/rỗng/lỗi/thiếu ảnh/dữ liệu
   dài/chữ lớn. Giữ dữ liệu khi thất bại; xác định rõ có lưu nháp bền vững hay không.
4. Xem cạnh ba màn hình tham chiếu. Nếu bỏ logo mà màn hình thành một template
   marketplace bất kỳ, kiểm tra lại phân cấp, ảnh và chi tiết gắn với việc chuyền sách.
5. Chạy lint, typecheck, test liên quan, contract check và export/build phù hợp.
   Review ảnh render/thao tác thực tế, không chỉ JSX hoặc ảnh tĩnh tự dựng.

## 7. Điều kiện bàn giao

Mô tả thay đổi phải ghi màn hình, component dùng chung bị ảnh hưởng, trạng thái
đã kiểm tra và giới hạn. Review ít nhất 320/390 px, tên dài, ảnh thiếu, chữ lớn,
lỗi submit và retry; xác nhận vị trí cuộn/nội dung nhập sau điều hướng. Thay đổi
native cần kiểm tra điện thoại/emulator: safe area, keyboard, Back, thư viện ảnh,
TalkBack/VoiceOver và focus. Expo export chỉ chứng minh bundle thành công.

Không merge một luồng giả lập dưới danh nghĩa nghiệp vụ đã hoàn thành. Không xem
lint là thẩm định thẩm mỹ: bộ luật tự động chỉ bắt một số sai lệch, con người vẫn
cần xem tính rõ ràng, bản sắc và hành vi. Nếu cần ngoại lệ có lý do, ghi phạm vi và
lý do ngay trong thay đổi; không tắt rule cho cả thư mục để vượt kiểm tra.
