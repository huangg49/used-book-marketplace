# UI-1 — Lượt phê bình 01

30/09/2026 · `codex/ui-direction` · **CHỜ CHỦ DỰ ÁN DUYỆT — CHƯA SỬA CODE**.

## Kết luận thiết kế

Giao diện hiện tại chưa kể được “lý lịch từng bản sách” theo [DESIGN](../DESIGN.md).
Sự ấm áp chủ yếu nằm ở nền kem, chữ serif và câu giới thiệu. Khi bỏ logo/khẩu hiệu,
phần thông tin sách vẫn gần một trang chi tiết marketplace, còn form có nhịp của
một công cụ nhập liệu. Đổi màu riêng lẻ sẽ không giải quyết được khoảng cách này.

Đây là lượt tự phê bình của AI theo vai trò giám đốc nghệ thuật, dựa trên ảnh mới
và thao tác thật, không bảo vệ quyết định UI trước đó. Không là review người thật,
nghiên cứu người dùng hay nghiệm thu accessibility/native toàn bộ.

## Nguồn và cách quan sát

- Product source **main `4273f10`**; branch lúc chụp `3f70caf` chỉ thêm điểm lưu UI-1.
  `git diff 4273f10 -- apps packages` không có thay đổi. DESIGN đã viết trước
  khi bắt đầu chụp/phê bình, token đề xuất chưa được áp dụng.
- Android Pixel_7, API35, x86_64, APK debug hiện có + Metro8081 của người dùng.
  Màn hình1080×2400px, override density443dpi → khoảng **390×867 logical px**;
  OS font scale1.0. Ảnh PNG nguyên bản, không ghép, sửa màu hoặc dựng UI giả.
- API Nest/Mongo thật tại3046, QA57017/rs-test, database random `*_test` mới,
  run `.tmp/demo/ui-direction`; storage **fixture/FAKE**, ảnh bìa mô phỏng có nhãn
  DEMO. Account/email trong ảnh là fixture tổng hợp, không phải liên hệ người thật.
  Không đưa mật khẩu/token/config/snapshot app vào evidence chia sẻ.
- Dùng H01a qua API để có một listing Approved và ảnh; đăng nhập seller qua UI.
  Mở ví số dư 0/lịch sử rỗng; địa chỉ rỗng; lọc bản nháp rỗng; tìm từ khóa không
  khớp; mở form và chọn condition `Worn` (Cũ nhiều) trong state chưa lưu.
  Nút “Tạo bản nháp” tạo một nháp QA thật qua API hiện có; rời editor bỏ lựa chọn
  chưa lưu, không xóa nháp trên DB. Không gửi duyệt, mua, đổi hoặc tác động tiền.
- Lỗi kệ được tạo bằng cách tạm bỏ riêng adb reverse3046 rồi đổi bộ lọc; không
  sửa API/code/phản hồi. Đã nối lại và bấm retry thấy sách trở lại. Lỗi địa chỉ
  là validation thật khi bấm lưu form rỗng; không lưu địa chỉ.
- Một listing và bìa DEMO đủ xem phân cấp/độ dài chữ, **không đủ chấm sự hấp dẫn
  của nhiều bìa sách thật hoặc nhịp cuộn một kệ đầy**. Không coi cột trống do chỉ
  có một cuốn là lỗi thiết kế, không lấy chữ mô phỏng để phê bình microcopy sản phẩm.
- Ảnh bàn phím đã xem riêng để kiểm vùng nhập/footer, không đưa vào bộ ảnh chia
  sẻ vì thanh gợi ý có nội dung ngoài app. Không chụp lại chữ 130%, ví có tiền,
  mọi bước cuối của đăng sách, mọi dialog/lỗi, loading thoáng qua, TalkBack,
  ARM, iOS hoặc web trong lượt này; không cộng evidence cũ thành kết quả mới.

## Chấm từng màn

Thang 1–5 theo DESIGN: 1 mâu thuẫn/cản trở; 3 dùng được nhưng còn chung chung;
5 đáp ứng trọn hướng trong phạm vi quan sát. Điểm là nhận định thiết kế, không
phải số đo độ hài lòng. “Đọc/chạm” chỉ dựa trên hình và thao tác ở 390 px/font 100%.

| Màn / ảnh đã xem | Câu chuyện | Phân cấp | Khác biệt | Nhất quán | Đọc/chạm | Căn cứ ngắn |
| --- | --- | --- | --- | --- | --- | --- |
| [Kệ](evidence/ui-1/shelf.png) | 3 | 2 | 2 | 4 | 3 | Khẩu hiệu kể thay sách; bìa bắt đầu khoảng y = 470 dp, tên/giá đầu tiên chưa thấy đủ trước khi cuộn |
| [Chi tiết đầu trang](evidence/ui-1/detail-top.png), [phần tình trạng](evidence/ui-1/detail-record.png) | 3 | 2 | 2 | 4 | 4 | Condition nằm chung dòng với hình thức giao dịch; “Dấu đọc còn lại” là card/dòng phân cách đều, chưa thành lý lịch |
| [Bộ lọc](evidence/ui-1/filters.png) | 2 | 3 | 2 | 4 | 4 | Các nhóm cùng dãy pill; dễ chạm nhưng khó phân biệt vai trò chỉ bằng hình thức, giá nằm sâu dưới cuộn |
| [Đăng nhập](evidence/ui-1/login.png) | 3 | 4 | 2 | 4 | 4 | Tác vụ rõ; nét tiệm sách chủ yếu nằm ở logo và lời chào, chưa có dấu hiệu riêng ngoài brand nền |
| [Tài khoản](evidence/ui-1/account.png) | 2 | 3 | 2 | 4 | 4 | Khối tên lớn và các hàng icon phổ thông; “Góc của bạn” chưa làm trải nghiệm khác trang tài khoản thông thường |
| [Sách của tôi](evidence/ui-1/my-books.png), [bản nháp rỗng](evidence/ui-1/my-books-empty.png) | 2 | 2 | 2 | 3 | 3 | Nút/bộ lọc chiếm đầu màn; danh sách nghiêng về văn bản và trạng thái duyệt, khó lướt như tủ sách |
| [Đăng sách bước 1](evidence/ui-1/listing-create.png), [bước 2](evidence/ui-1/listing-condition.png), [các ô tình trạng](evidence/ui-1/listing-fields.png) | 3 | 2 | 2 | 3 | 3 | Tiêu đề lớn hai dòng cạnh stepper chữ nhỏ; vùng ảnh rỗng đẩy nút chọn ảnh khỏi viewport đầu; lựa chọn condition như bốn nút hành động lớn |
| [Địa chỉ rỗng](evidence/ui-1/addresses-empty.png), [form](evidence/ui-1/address-form.png), [lỗi](evidence/ui-1/address-errors.png) | 2 | 2 | 2 | 3 | 3 | Nhiều lớp lời dẫn trước ô đầu; nút phụ “Quay lại sổ địa chỉ” hai dòng cao hơn nút lưu, tranh trọng lượng với hành động chính |
| [Ví số dư 0](evidence/ui-1/wallet-empty.png), [lịch sử rỗng](evidence/ui-1/wallet-history-empty.png) | 2 | 3 | 2 | 4 | 4 | Số liệu rõ nhưng nhiều khoảng và lớp lời dẫn; trạng thái rỗng theo mẫu icon/tiêu đề giữa màn, không có dấu riêng |
| [Kệ tìm không thấy](evidence/ui-1/shelf-empty.png), [kệ lỗi kết nối](evidence/ui-1/shelf-error.png) | 3 | 3 | 2 | 3 | 4 | Lời chỉ dẫn cụ thể, nhưng cùng các khối lớn khiến thông báo/hành động tách xa; chưa cùng nhịp với nhóm rỗng ở tài khoản |

## Ba vấn đề lớn nhất và hướng sửa

### 1. Lớp giới thiệu đang chiếm chỗ của cuốn sách và tác vụ

**Bằng chứng:** [kệ](evidence/ui-1/shelf.png) đặt logo/tìm kiếm/banner/chips/tiêu
đề trước bìa, tới khoảng 470 dp mới bắt đầu ảnh. [Chi tiết](evidence/ui-1/detail-top.png)
đặt ảnh cao và hai lớp chú thích trước tên, khiến nhận diện sách/giá nằm sâu.
[Đăng sách](evidence/ui-1/listing-condition.png) có headline lớn, lời dẫn, tiêu
đề ảnh và empty panel trước nút chọn ảnh. Đây là cấu trúc, không phải lỗi do bìa DEMO.

**Lệch DESIGN:** “Cuốn sách là nhân vật chính” và “gọn để đọc, ấm ở đúng chỗ”.
Người đọc phải đi qua lời giới thiệu trước khi gặp dữ kiện; người đăng phải cuộn
qua lời kể trước thao tác. Thư thái không đồng nghĩa khoảng trống kéo dài tác vụ.

**Hướng sửa:** rút các đoạn dẫn lặp, giảm độ cao nhóm mở đầu; đặt nhận diện sách,
condition và giá thành một cụm ưu tiên, cân lại chiều cao ảnh. Khẩu hiệu trên kệ
thành một dòng biên tập nhỏ; giữ đủ tìm/lọc và các hành động, không thêm carousel
hay khối gợi ý. Form giảm headline, đưa hướng dẫn ảnh sát vùng chọn ảnh và làm
empty panel gọn. Thay bố cục, không đổi quy trình hoặc giấu cảnh báo cần thiết.

**Tiêu chí trên màn chuẩn:** ở 390 px/font 100%, tên sách dài của fixture, tác giả,
condition và giá phải đọc được trong viewport đầu cùng ảnh nhận diện; chú thích
nguồn ảnh vẫn hiện rõ, không thành tooltip hay bị xóa để đạt mục tiêu.

### 2. Dấu vết riêng của bản sách còn là trường dữ liệu, chưa có ngôn ngữ thị giác

**Bằng chứng:** [detail-record](evidence/ui-1/detail-record.png) dùng card sáng
với các hàng Ruột sách/Bìa và gáy/Ghi chú/Phụ kiện ngang trọng lượng. Nhãn “CÒN
TỐT · BÁN HOẶC ĐỔI” ở [đầu trang](evidence/ui-1/detail-top.png) hòa condition và
mode vào một dòng chữ nhỏ. Tên “Dấu đọc còn lại” có câu chuyện, hình thức bên
dưới chưa tạo cảm giác một bản sách có hồ sơ riêng.

**Lệch DESIGN:** nguyên tắc “Một bản sách, một lý lịch có căn cứ” và lựa chọn 4B
của chủ dự án. Màu kem/serif không đủ thay cho cách tổ chức đặc điểm cuốn sách.

**Hướng sửa:** tách condition thành nhãn viền đất nung đậm như dấu mộc, giữ đúng
“Cũ nhiều”/các mức thật; đặt mode riêng. Gom mô tả tình trạng hiện có thành một
phiếu thư viện duy nhất, lề nhỏ, nhãn nguồn “Người đăng mô tả”, chữ thẳng và nội
dung nguyên nghĩa. Khác nhau đến từ ảnh và ghi chú thật, không phải tem ngẫu nhiên.
Không tự sinh ngày nhập kho, mã kệ, tên chủ trước hay số lần chuyền tay. Không
biến dấu mộc thành tuyên bố kiểm định, và không bọc thêm card bên ngoài phiếu.

**Tiêu chí trên màn chuẩn:** nhìn thấy condition và hiểu đó là mô tả của người
đăng; phần bìa/ruột/ghi chú vẫn đầy đủ, dễ quét, chỉ một cụm trang trí ấm. Ảnh
nguyên màu và mọi dấu hư hại được giữ; không có dữ kiện mới ngoài response.

### 3. Thang chữ và trọng lượng điều khiển chưa phân biệt đúng vai trò

**Bằng chứng:** [listing-create](evidence/ui-1/listing-create.png) và
[listing-condition](evidence/ui-1/listing-condition.png) dùng tiêu đề 32 px trong
khi nhãn bước 11px; [listing-fields](evidence/ui-1/listing-fields.png) biểu diễn
lựa chọn condition giống nút submit. [address-form](evidence/ui-1/address-form.png)
có nút Back dài hơn và cao hơn nút lưu; “Quay lại” trên đầu vẫn xuất hiện.
Trên chi tiết, condition quan trọng dùng label11px còn heading phần23px.

**Lệch DESIGN:** phục vụ nhiều độ tuổi, “như người trông tiệm” và “tinh tế”.
Nội dung cần đọc nhanh lại nhỏ; trang trí/hướng dẫn và thao tác phụ có lúc nổi
ngang hoặc hơn hành động chính. Lặp từ chuyền tay trên từng form không tạo thêm sự gần gũi.

**Hướng sửa:** thực thi vai trò chữ trong DESIGN: title28, section22, body16,
secondary 14; nâng nhãn quan trọng lên 14 thay ép nhỏ. Tách vai trò nhãn condition,
trường dữ liệu, option đang chọn và nút hành động bằng typography/viền/nền; giữ
hit target và semantics hiện có. Rút nhãn Back trên form thành “Về sổ địa chỉ”,
cân bố cục nút để chính/phụ rõ; không đổi onPress/dirty guard. Giảm eyebrow/
lời dẫn lặp, giữ lỗi cụ thể và toàn bộ giới hạn nghiệp vụ.

**Tiêu chí trên màn chuẩn:** nhãn condition/nguồn thông tin đọc được ở 14 px,
heading không tranh với tên sách, body giữ line-height dễ đọc; ở 130% chữ xuống
dòng tự nhiên, Back và nút xem ảnh có vùng chạm ít nhất 44×44. Cần kiểm thực khi
triển khai, không xem đề xuất token như kết quả đã PASS.

## Đề nghị duyệt: chỉ một màn chuẩn

Chọn **chi tiết cuốn sách**, gồm phần đầu và phiếu tình trạng, làm màn chuẩn đầu.
Màn này trực tiếp kiểm chứng cả 3 hướng: ưu tiên sách, “lý lịch” thị giác và vai
trò chữ. Form/địa chỉ/kệ đã được chấm để biết ảnh hưởng về sau, **chưa nằm trong
phạm vi sửa màn đầu**. Không bắt đầu C02.

Sau khi chủ dự án duyệt 3 vấn đề và màn chuẩn mới được làm:

1. Đổi token/theme cần thiết, giữ một nguồn chung; xem ảnh hưởng consumer nhưng
   không tiện tay thiết kế lại các màn còn lại.
2. Áp dụng3 hướng lên chi tiết sách bằng component chung, dữ liệu/API hiện có.
3. Kiểm test/lint/typecheck và trạng thái liên quan; chụp trước/sau cùng fixture,
   viewport 390 px, thêm chữ 130% và nội dung dài. Có ảnh sách thật được phép dùng
   thì bổ sung để đánh giá màu/độ hấp dẫn; không lấy ảnh sinh giả listing thật.
4. **Dừng chờ chủ dự án ưng màn chuẩn** trước khi áp dụng sang kệ/form/tài khoản.

## Điểm lưu và giới hạn kiểm chứng

- Đã chụp/xem 18 ảnh trong thư mục evidence; các ảnh thao tác trung gian và bản
  có bàn phím giữ ignored ở `.tmp/ui-direction`, không dùng thay ảnh trong báo cáo.
- Không có thay đổi source app/API/contract/token/config. Test RN91/91, lint,
  typecheck và CI C01 là evidence cũ trên head4e4851e, giữ nguyên phạm vi;
  **không chạy lại và không gọi đó là test mới của UI-1**. Lượt này kiểm docs/diff
  và quan sát UI theo yêu cầu, không đóng thêm gate READINESS.
- Khởi động đầu tiên có ảnh đen lúc app đang nạp, sau đó tự hiện UI; không xác
  định đây là lỗi splash. Một lệnh ghép kiểm Metro/restart bị công cụ chặn; không
  cần restart để tiếp tục. Không sửa code hoặc tuyên bố đã sửa splash.
- Đã đăng xuất QA, phục hồi snapshot app mới chụp đầu lượt, density420/font1.0/
  reverse ban đầu; dừng emulator và API/media fixture3046/3047 do lượt này mở.
  Metro8081 và preview8087 của phiên trước giữ nguyên. DB/config/bucket chính
  không thay đổi; QA run giữ lại để tái hiện, không reset/cleanup dữ liệu.

**Trạng thái cuối: DESIGN + CRITIQUE hoàn tất, CHỜ DUYỆT. Không sửa code tiếp.**
