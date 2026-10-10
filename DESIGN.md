---
name: Lật lại — React Native Member
description: Token RN hiện hành; web Vite và Flutter chưa áp dụng redesign Android.
colors:
  forest: "#214B40"
  paper: "#F5EFDF"
  surface: "#FFFCF4"
  shelfCanvas: "#F6F8F3"
  ink: "#202C27"
  muted: "#58685E"
  rustText: "#963F28"
  border: "#788477"
  rule: "#D5D8C8"
  successSurface: "#E8EFDF"
typography:
  searchTitle:
    fontFamily: Be Vietnam Pro
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "36px"
  shelfTitle:
    fontFamily: Be Vietnam Pro
    fontSize: "16px"
    fontWeight: 700
    lineHeight: "23px"
  shelfPrice:
    fontFamily: Be Vietnam Pro
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "25px"
  body:
    fontFamily: Be Vietnam Pro
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "24px"
rounded:
  book: "2px"
  control: "8px"
  sheet: "20px"
  pill: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "13px 20px"
  text-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  navigation-selected:
    backgroundColor: "{colors.successSurface}"
    textColor: "{colors.forest}"
    rounded: "{rounded.control}"
    padding: "8px 4px"
---

# Lật lại — brief UI hiện hành

09/10/2026: chủ dự án duyệt tích hợp Impeccable, cập nhật brief và critique ba màn
tìm sách/chi tiết/đăng sách. Quyết định ở đây ưu tiên hơn thẩm mỹ UI-1/brand1.1
cũ. 10/10: bắt đầu triển khai redesign trên màn tìm sách Android theo
[brief màn](docs/design/ANDROID_SEARCH.md). Các màn web chưa áp dụng hướng mới.

## Overview

Hệ thống React Native Member hiện hành dùng một họ chữ Be Vietnam Pro, nền sáng
và xanh rừng để người dùng đọc và thao tác rõ ràng. Hướng “Danh mục hiệu sách
độc lập” đã được triển khai đầu tiên ở màn tìm sách Android; ảnh sách, tình trạng
và giá tạo điểm nhìn. Các màn RN khác mới nhận thay đổi primitive/font/điều hướng
chung; web Vite và Flutter chưa áp dụng hướng mới.

Một marketplace sách cũ dễ dùng, rõ việc và có cá tính. Người dùng nhận ra cuốn
sách, tình trạng, giá và hành động tiếp theo ngay vùng chính. Tác vụ mua/bán
ưu tiên rõ ràng; trang khám phá có thể biểu cảm hơn form/giao dịch.
Product truth tại [PRODUCT](PRODUCT.md); không đổi SRS/contract để làm giao diện đẹp.

## Colors

Xanh rừng dành cho hành động/chọn; ink cho nội dung, muted cho thông tin phụ.
Tình trạng sách dùng rustText, không mang nghĩa xác thực. Browse dùng shelfCanvas,
header/navigation dùng surface. Logo và ảnh sách giữ artwork gốc.

## Typography

Frontmatter dùng đơn vị CSS để trao đổi; source RN dùng logical pixels và vẫn
scale theo hệ điều hành. Các role còn lại ở `theme.ts` vẫn hợp lệ. Một họ chữ:
phân cấp bằng role/kích thước/weight thật, không giả500/600.

- Bỏ yêu cầu giữ Lora trong luồng sản phẩm. Sans-serif là hướng mới; Be Vietnam
  Pro400/700 được triển khai cho RN; web vẫn cần đối chiếu riêng.
- Một họ font cho tiêu đề, nhãn/nút, nội dung và giá trong luồng tác vụ. Phân cấp
  bằng kích thước/độ đậm; không trộn serif/chữ viết tay vào form để tạo cá tính.
- Dùng weight có file thật. Bộ Be hiện chỉ400/700; muốn500/600 cần bổ sung và
  kiểm glyph/license/bundle trước, không giả weight. RN dùng hai file font đã có.
- Kiểm tên sách dài, dấu tiếng Việt, ₫, chữ lớn và dòng phụ. Không thu nhỏ dữ kiện
  quan trọng hoặc khóa chiều cao để giữ bố cục.

## Layout

RN content tối đa480dp, padding20dp. Target tối thiểu48dp; control minHeight52dp,
tăng theo chữ. Screen sở hữu safe area. Tìm sách: header ngoài vùng cuộn, ảnh32%
cạnh thông tin; dưới360dp với text scale từ1.29 chuyển xếp dọc. Đây là recipe màn
tìm sách, không là bố cục bắt buộc cho mọi app.

Logo và ảnh sách thật được giữ. Xanh rừng là vật liệu nhận diện hiện có; màu nền
giấy/cam đất có thể điều chỉnh khi so sánh phương án, không phải ràng buộc giữ UI cũ.
Bìa và dấu vết bản sách tạo điểm nhìn. Độ nổi bật đến từ bố cục, tương phản và
ảnh có ích; hiệu ứng không được làm chậm tìm sách hoặc nhập liệu.

Grid/card sách đều nhau có thể phù hợp để so sánh. Không áp máy móc lệnh cấm card,
font phổ biến hoặc đối xứng của một reference. Form dùng phân nhóm rõ, một hành
động chính; các giải thích chi tiết mở khi cần. Giữ cấu trúc trong error/empty/loading.

## Elevation & Depth

Phân nhóm bằng lớp nền và đường phân cách; không thêm shadow trang trí. Sheet
dùng scrim `rgba(20,36,28,.45)`, giữ focus/Back và hành động áp dụng riêng.

## Shapes

Button/field8dp, chip24dp, sheet20dp; ảnh2dp. Khung contain giữ đầy đủ ảnh sách.

## Components

Dữ kiện quyết định: ảnh, tình trạng và hai loại giá giữ nghĩa API; grid mẫu chỉ
là phương án đối chiếu. Component RN tại `src/core/ui`, recipe màn ở feature;
sidecar snippets là bản dịch trình bày, không là một UI web mới.

### Câu chữ

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

### Ba màn chuẩn của lượt đầu

| Màn / mode | Việc phải giúp người dùng làm | Phạm vi cần giữ |
| --- | --- | --- |
| Tìm sách / Operate | Tìm/lọc/sắp xếp, biết kết quả và mở đúng cuốn | Filters, pagination, empty/error và query thật |
| Chi tiết / Operate | Hiểu ảnh/tình trạng/giá, biết bước tiếp theo | Owner/availability, purchase giữ24h, không nhầm thanh toán |
| Đăng sách / Operate | Chọn catalog, chụp/tải ảnh, nhập tình trạng/giá, lưu/gửi duyệt | Form state, upload/retry/idempotency và revision |

Web có thể đặt thông tin liên quan cạnh nhau; native chia thành bước hợp lý,
dùng camera/keyboard/Back đúng nền tảng. Giữ context của cùng tác vụ giữa web/mobile.
Phạm vi chưa có API ghi dependency, không thêm nút giả để minh họa luồng hoàn chỉnh.

## Do's and Don'ts

Đánh giá cấu trúc/câu chữ trước tạo hiệu ứng. So sánh phương án trên cùng nội
dung, desktop và narrow viewport; sau sửa mới nhân rộng. Kiểm với người ngoài
nhóm: tìm sách, hiểu tình trạng, hiểu giữ sách chưa thanh toán, đăng bài.
Không đặt điểm AI thành mục tiêu hoặc dùng nó thay bằng chứng người dùng.

RN đã thay Lora bằng Be Vietnam Pro, chuyển tìm sách sang danh sách dọc,
tìm kiếm cố định và câu chữ trực tiếp. Thay font/target48dp/thanh điều hướng
chung tác động các màn RN khác; không xem các bố cục đó là đã redesign. Web
vẫn nhiều font; critique cũ mô tả source ở SHA ghi trong từng báo cáo.
[UI-1](docs/DESIGN.md) giữ quyết định/evidence lịch sử; [workflow](docs/design/IMPECCABLE_WORKFLOW.md)
quy định cách dùng bộ pinned; [UI rules](docs/design/UI_CODING_RULES.md) giữ nền chất lượng.
