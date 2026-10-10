# Kế hoạch thiết kế các trang Member web tiếp theo

Lập10/10/2026 từ nguồn `b27047e`; chủ dự án đã duyệt triển khai.
Cập nhật11/10: Tìm sách đã triển khai và hoàn tất review/canonical;
các nhóm bên dưới vẫn là kế hoạch, không phải nghiệm thu toàn bộ.
Chủ dự án chọn thứ tự: Tìm sách → Chi tiết sách → Đăng sách, sau đó tài khoản,
chat và đấu giá. Phạm vi `apps/user-web`; Android/admin có kế hoạch riêng.

## Hướng chung

Giữ thế giới tiệm sách đã chốt trong [DESIGN](../../DESIGN.md): đỏ rượu vang,
kem giấy, vàng ấm, logo gốc, Be Vietnam Pro và Anton cho tiêu đề ngắn.
Trang chủ là điểm biểu đạt mạnh nhất. Trang bên trong ưu tiên bìa, ảnh bản sách,
giá và thao tác; mỗi trang có một điểm nhấn riêng, không nhân bản hero.

- Nền giấy ấm, nét kẻ và nhấn đỏ nối các trang. Trang trí mùa thu chỉ ở vùng
  trống hoặc trạng thái rỗng, không phủ trường nhập/giá/nội dung giao dịch.
- Chim cánh cụt dùng tiết chế cho hướng dẫn, hoàn tất và rỗng; icon chức năng
  cần đọc được ở cỡ nhỏ. Không biến mọi nút thành bookmark.
- Dùng navbar đã chốt cho khám phá; auth giữ bố cục riêng, form dài và chat có
  header tác vụ phù hợp. Bổ sung lối vào sau đăng nhập theo chức năng thực có.
- Motion ngắn cho phản hồi, chuyển ảnh và chuyển bước; không tự áp ngoại lệ
  reduced-motion của Home sang tất cả các trang. Dữ liệu hiện ngay mặc định.

## 1. Tìm sách — khám phá nhiều bản sách mà vẫn dễ quét

Triển khai11/10: đầu trang gọn, bộ lọc cột trái, kệ5cột từ1440px/4cột laptop,
2cột mobile;20cuốn/trang, panel bộ lọc native trên mobile. Chế độ preview rõ
`data=preview` dùng91ấn bản có nguồn; dữ liệu thật/lỗi API giữ riêng.
[Evidence và giới hạn](WEB_MEMBER_REDESIGN.md).

Hiện có `/books`, query API/URL và diện mạo đỏ–kem; đây là hoàn thiện màn đã có.

- Đầu trang gọn: tiêu đề ngắn và search; đưa kết quả lên sớm trong viewport.
- Desktop: bộ lọc bên trái, kết quả bên phải; thanh trên có hình thức mua/đổi,
  sắp xếp và bộ lọc đang áp dụng. Laptop nhắm 4–5 cột trong vùng kết quả,
  điều chỉnh theo chiều rộng thực tế; ảnh giữ toàn bìa, card nhỏ như Home.
- Mobile: hai cột khi đủ chỗ, bộ lọc mở thành panel có tên/đóng/áp dụng/xóa rõ.
  Search, lựa chọn và Back giữ đồng bộ URL; không mất vị trí vô cớ.
- Chỉ đưa thể loại vào lọc catalog khi contract hỗ trợ; thể loại Home preview
  hiện là lọc cục bộ. Không giả tổng kết quả khi API chỉ trả cursor.
- Nghiệm thu: tìm → lọc → mở sách → quay lại giữ đúng query; phân trang không
  lặp/mất sách; tải/rỗng/lỗi/giá không hợp lệ đều có đường phục hồi.

## 2. Chi tiết sách — ảnh bản sách làm điểm nhấn

Hiện có `/books/:id`, API thật và bố cục hai cột theo brand mới.

- Trái: ảnh lớn contain, thumbnail ảnh bìa/gáy/ruột và xem ảnh lớn bằng thao tác
  rõ ràng. Phân biệt ảnh bản sách với hình minh họa catalog.
- Phải: tên/tác giả, tình trạng, giá bán và giá trị đổi tách nhãn; hành động chính
  cùng giải thích ngắn về hậu quả. Phần thông tin thấp hơn chia bằng nhịp chữ/nét kẻ.
- Desktop có thể giữ vùng hành động trong cột khi cuộn; mobile đặt hành động
  gần phần giá, chỉ dùng thanh đáy nếu không che nội dung/keyboard.
- Giữ đúng hành vi mua hiện tại: mở chat và giữ sách24h, chưa là checkout hay
  thanh toán. Không thêm rating/badge/khẩn cấp hoặc gợi ý sách giả.
- Nghiệm thu: tên dài, hai giá, ảnh thiếu/lỗi, bài không tồn tại, khách chưa đăng
  nhập, chủ sách và sách không còn khả dụng đều dễ hiểu.

## 3. Đăng sách — một bàn soạn bài sáng và dễ kiểm tra

Hiện có `/sell`, form nhiều bước và service upload/submit; cần thay diện mạo cũ.

- Giữ các bước/field và quy tắc thật. Trình bày theo cụm ảnh → thông tin/tình trạng
  → hình thức/giá → xem lại; khi triển khai ánh xạ vào bước hiện có trước khi gộp.
- Desktop: tiến trình gọn bên trái, form ở giữa, bản xem trước bên phải khi đủ
  chiều rộng. Mobile: tiến trình dạng chữ ngắn và form một cột, preview ở bước xem lại.
- Ảnh là điểm nhấn: preview, tiến độ, lỗi tải và thử lại theo khả năng service;
  thêm sắp xếp/xóa ảnh chỉ sau khi xác minh hành vi và giới hạn API.
- Các câu hỏi về trang thiếu, độ đọc rõ, phụ kiện và sở hữu phải thấy rõ; không
  giấu trong accordion mặc định đóng. Nút cuối nói đúng gửi duyệt/trạng thái server.
- Giữ dữ liệu khi đổi bước hoặc lỗi gửi; việc lưu nháp bền vững là dependency
  riêng, không hứa tự lưu khi chưa có cơ chế lưu an toàn.
- Nghiệm thu: nhập sai → sửa đúng, upload lỗi, gửi lỗi/retry, quay lại và thoát
  form đang nhập; bảo toàn cơ chế submission/idempotency hiện có.

## 4. Tài khoản và thư viện cá nhân

- Login giữ hướng ảnh tiệm sách bên trái/giấy bên phải đã duyệt; rà lại cân đối
  và trạng thái lỗi. Registration đồng bộ cùng bố cục, câu chữ thông thường.
- Trang cá nhân đổi thành không gian quản lý: thông tin tài khoản, sách của tôi,
  bài chờ duyệt/từ chối/đang giữ, giao dịch liên quan. Desktop sidebar gọn;
  mobile dùng menu có nhãn, không giữ sidebar rộng cố định.
- Ưu tiên danh sách bài và trạng thái hữu ích; thay các chart/stat demo bằng dữ
  liệu thật hoặc trạng thái chưa có. Wishlist/địa chỉ/phiên vào backlog theo contract.
- `/register` hiện scaffold, router chưa có quên mật khẩu. Thiết kế được trước,
  nhưng đăng ký/xác minh/reset cần đối chiếu API và quyền riêng, không giả thành công.

## 5. Chat và thông báo

- Chat: phần tên sách/ảnh nhỏ và hạn giữ sách ở đầu, lịch sử giữa, composer dưới.
  Hai cột danh sách hội thoại/nội dung chỉ triển khai khi API danh sách đáp ứng;
  hiện ChatPage nhận roomId và tải lịch sử của room.
- Trạng thái đang gửi/gửi lỗi/thử lại cạnh tin nhắn; mất kết nối vẫn đọc được
  lịch sử đã tải. Không để footer marketing chiếm vùng soạn tin.
- Thông báo: danh sách gọn theo nội dung/thời gian và trạng thái đã đọc; nhóm
  theo ngày được, bộ lọc nghiệp vụ cần dựa trên dữ liệu hiện có.
- Penguin dùng ở rỗng; không thêm bubble/motion liên tục khi người dùng đọc.

## 6. Đổi sách và đấu giá

- Đổi: hai cuốn đặt đối diện, thông tin/giá trị mỗi bên rõ; đề nghị và phản hồi
  tách khỏi timeline giao dịch. `/exchange` và compose còn mock; chi tiết/mine
  đã có query, phải xác minh contract theo từng màn, không coi cả nhóm là hoàn tất.
- Đấu giá: danh sách theo ảnh/giá/trạng thái; chi tiết tập trung ảnh, giá hiện tại,
  bước giá, thời điểm kết thúc cụ thể, lịch sử và vùng đặt giá. Xác nhận cam kết
  tiền trước thao tác, giữ error/retry và quyền thật.
- Thể hiện tiếp nhận/kiểm tra tại điểm trước mở phiên theo phụ lục TP.HCM.
  UI không biến biên bản thành chứng nhận chính hãng; countdown không thay giờ server.

## 7. Phần SRS còn lại — bản thiết kế theo dependency

SRS12.1 còn hồ sơ công khai, wishlist, giỏ/checkout, Order/giao nhận, ví,
khiếu nại/review và forum. Chưa có route tương ứng trong router Member web hiện
tại; cần inventory endpoint và quyền cho từng luồng trước implementation.
Xếp sau sáu nhóm trên, lập flow + trạng thái + nội dung trước; triển khai trong
gói được giao và gate hiện hành. Staff/admin/simulator không gộp vào Member web.

## Cách triển khai và duyệt

Mỗi nhóm: bản bố cục/nội dung cụ thể → duyệt hướng → triển khai màn và các trạng
thái liên quan → một vòng QA desktop/mobile, sửa lỗi theo lô và xác nhận lại.
Bắt đầu bằng Tìm sách, dùng nó chốt card/lọc/bố cục dùng lại cho các kệ khác.

Kiểm tại laptop1366×768 và1535×735 ở zoom100%, desktop rộng và mobile390px;
thêm320px/nội dung200% để phát hiện tràn. Form dài được cuộn; login gọn trong
viewport thông thường nhưng vẫn cuộn khi keyboard/chữ lớn cần, không khóa overflow.
Giữ keyboard/focus, ảnh lỗi, tên dài, loading/empty/error và dữ liệu khi retry.

Đầu ra mỗi nhóm gồm source đúng app, ảnh desktop/mobile, ca đã kiểm và dependency
chưa mở; không thay acceptance API/native/human bằng ảnh đẹp.

Nguồn: [SRS1.1](../SRS_V1_1.md#121-danh-mục-màn-hình),
[TP.HCM/đấu giá](../features/LOCAL_HANDOVER_AUCTION.md),
[READINESS](../handoff/READINESS.md), router và source ở commit nêu trên.
