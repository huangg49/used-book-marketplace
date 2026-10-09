# Lật lại — brief UI hiện hành

09/10/2026: chủ dự án duyệt tích hợp Impeccable, cập nhật brief và critique ba màn
tìm sách/chi tiết/đăng sách. Quyết định ở đây ưu tiên hơn thẩm mỹ UI-1/brand1.1
cũ. Đây là hướng được duyệt, **chưa là mô tả redesign đã triển khai**.

## Mục tiêu

Một marketplace sách cũ dễ dùng, rõ việc và có cá tính. Người dùng nhận ra cuốn
sách, tình trạng, giá và hành động tiếp theo ngay vùng chính. Tác vụ mua/bán
ưu tiên rõ ràng; trang khám phá có thể biểu cảm hơn form/giao dịch.
Product truth tại [PRODUCT](PRODUCT.md); không đổi SRS/contract để làm giao diện đẹp.

## Typography

- Bỏ yêu cầu giữ Lora trong luồng sản phẩm. Sans-serif là hướng mới; Be Vietnam
  Pro là ứng viên ưu tiên cho RN/web, chưa chốt bằng nghiệm thu thị giác.
- Một họ font cho tiêu đề, nhãn/nút, nội dung và giá trong luồng tác vụ. Phân cấp
  bằng kích thước/độ đậm; không trộn serif/chữ viết tay vào form để tạo cá tính.
- Dùng weight có file thật. Bộ Be hiện chỉ400/700; muốn500/600 cần bổ sung và
  kiểm glyph/license/bundle trước, không giả weight. Không đổi font runtime ở gói này.
- Kiểm tên sách dài, dấu tiếng Việt, ₫, chữ lớn và dòng phụ. Không thu nhỏ dữ kiện
  quan trọng hoặc khóa chiều cao để giữ bố cục.

## Màu, hình và bố cục

Logo và ảnh sách thật được giữ. Xanh rừng là vật liệu nhận diện hiện có; màu nền
giấy/cam đất có thể điều chỉnh khi so sánh phương án, không phải ràng buộc giữ UI cũ.
Bìa và dấu vết bản sách tạo điểm nhìn. Độ nổi bật đến từ bố cục, tương phản và
ảnh có ích; hiệu ứng không được làm chậm tìm sách hoặc nhập liệu.

Grid/card sách đều nhau có thể phù hợp để so sánh. Không áp máy móc lệnh cấm card,
font phổ biến hoặc đối xứng của một reference. Form dùng phân nhóm rõ, một hành
động chính; các giải thích chi tiết mở khi cần. Giữ cấu trúc trong error/empty/loading.

## Câu chữ

Tên hành động nói kết quả thực. Tiếng Việt ngắn và cụ thể; tránh thơ/ẩn dụ ở lỗi,
form và tiền. Thuật ngữ nội bộ như DirectDelivery/expectedVersion không lộ trong
luồng người dùng; giải thích nghiệp vụ cần thiết bằng lời thông thường.

| Context | Hướng viết để kiểm bằng API |
| --- | --- |
| Purchase conversation | “Giữ sách và mở chat”; “Giữ trong24 giờ. Chưa thanh toán.” |
| Submit listing | “Gửi bài đăng để duyệt”; phân biệt lưu nháp/gửi duyệt/đã đăng |
| Tình trạng sách | “Tình trạng trang sách”, “Bìa và gáy”; giữ ghi chú hư hại |
| Loading | “Đang tải sách…”; không khiến người dùng đoán app đang làm gì |
| Giao nhận mô phỏng | “Giao tận nơi trong TP.HCM — mô phỏng đồ án” nếu đúng lane |

Đây là ví dụ định hướng, chưa thay chuỗi trong source. Review toàn interaction,
không đổi một nút làm lệch confirm/success/error hoặc hứa retry không hỗ trợ.

## Ba màn chuẩn của lượt đầu

| Màn / mode | Việc phải giúp người dùng làm | Phạm vi cần giữ |
| --- | --- | --- |
| Tìm sách / Operate | Tìm/lọc/sắp xếp, biết kết quả và mở đúng cuốn | Filters, pagination, empty/error và query thật |
| Chi tiết / Operate | Hiểu ảnh/tình trạng/giá, biết bước tiếp theo | Owner/availability, purchase giữ24h, không nhầm thanh toán |
| Đăng sách / Operate | Chọn catalog, chụp/tải ảnh, nhập tình trạng/giá, lưu/gửi duyệt | Form state, upload/retry/idempotency và revision |

Web có thể đặt thông tin liên quan cạnh nhau; native chia thành bước hợp lý,
dùng camera/keyboard/Back đúng nền tảng. Giữ context của cùng tác vụ giữa web/mobile.
Phạm vi chưa có API ghi dependency, không thêm nút giả để minh họa luồng hoàn chỉnh.

## Chất lượng và evidence

Đánh giá cấu trúc/câu chữ trước tạo hiệu ứng. So sánh phương án trên cùng nội
dung, desktop và narrow viewport; sau sửa mới nhân rộng. Kiểm với người ngoài
nhóm: tìm sách, hiểu tình trạng, hiểu giữ sách chưa thanh toán, đăng bài.
Không đặt điểm AI thành mục tiêu hoặc dùng nó thay bằng chứng người dùng.

Source hiện tại vẫn có RN Lora/Be và web nhiều font; xem report critique theo SHA.
[UI-1](docs/DESIGN.md) giữ quyết định/evidence lịch sử; [workflow](docs/design/IMPECCABLE_WORKFLOW.md)
quy định cách dùng bộ pinned; [UI rules](docs/design/UI_CODING_RULES.md) giữ nền chất lượng.
