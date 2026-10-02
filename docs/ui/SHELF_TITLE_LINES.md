# Kệ sách — căn hàng và so tên hai/ba dòng

30/09/2026 · `codex/ui-direction` · base f13a1c1.
Checkpoint: `fix(rn): align shelf cards and compare title limits`.
[Xem hai phương án](shelf-title-lines.html). Tại thời điểm chụp: chờ chọn số dòng.
Ngày01/10 đã chốt ba dòng; lượt kế tiếp ở [SHELF_STOREFRONT_01](SHELF_STOREFRONT_01.md).

## Phạm vi và kết quả

Chủ dự án duyệt căn thẻ và sửa DESIGN, thêm yêu cầu chụp hai/ba dòng trên cùng
QA ở100%/130%. Chỉ sửa ShelfGrid và tài liệu, không đổi màn chi tiết, AppText,
BookOffer, API, query, session, navigation hay nghiệp vụ. Không có dependency mới.
Showcase dùng lại ShelfGrid nên kế thừa cách tóm tắt, không thiết kế màn khác.

- Hai cột: vùng tên dành tối thiểu ba dòng, tác giả một dòng, tình trạng không
  cắt; giá dành tối thiểu hai dòng. Các thẻ stretch theo hàng; một giá thì để
  khoảng trống, không render giá giả. Font scaling được giữ, chiều cao tối thiểu
  tính từ typography×fontScale×TextScale; nội dung giá vẫn được tăng chiều cao.
- Một cột130%/màn hẹp: tên vẫn giới hạn dòng nhưng không chừa dòng rỗng cho tên
  ngắn. Giá nằm riêng phía dưới, được wrap. Không khóa chiều cao toàn thẻ.
- Ellipsis do native Text; dữ liệu không bị sửa/cắt chuỗi. Nhãn accessible giữ
  tên/tác giả đầy đủ, chạm tên mở chi tiết đủ nội dung. Chừa4dp bên phải tên để
  dấu ellipsis không sát mép. Giới hạn tên mặc định3, đang chờ quyết định.

## Kiểm thực tế

Pixel_7/API35/x86_64, APK debug hiện có + Metro8081.1080×2400,density443~390dp;
font_scale1.0/1.3. Kiểm thêm density540~320dp/font1.3. API3046/Mongo QA57017 thật,
storage fixture FAKE, run ui-refine trên database riêng *_test. Không tạo/sửa DB
hoặc listing trong lượt này. Cùng bốn bản DEMO và thứ tự, đủ Worn/Fair/Good/LikeNew:

| Mẫu                                                       | Hình thức và giá |
| --------------------------------------------------------- | ---------------- |
| Những con đường nhỏ, những mùa mưa và một cuốn sách ở lại | Bán35K/Đổi45K    |
| Người giữ những trang sách cũ                             | Chỉ đổi60K       |
| Những buổi chiều bên cửa sổ                               | Bán125K/Đổi150K  |
| Mùa đọc                                                   | Chỉ bán85K       |

12 ảnh native trong evidence/ui-1-shelf-lines: hai giới hạn×hai font×đầu/giữa/cuối
kệ. Khi chụp2 dòng chỉ tạm đổi hằng shelfTitleLines3→2, giữ mọi thứ khác, sau đó
phục hồi3 bằng finally. Không chỉnh PNG. Ở100%, ảnh giữa/cuối có thể giống nhau
vì cuộn đã tới cuối;130% cần ảnh giữa để xem đủ cuốn thứ ba.

Đã xem ảnh, thao tác cuộn, chạm tên dài→chi tiết đủ tên, Android Back→kệ.
Nhãn accessible còn đầy đủ. Bounds của hai vùng chạm thông tin cùng hàng bằng
nhau ở cả hai phương án100% (đầu và cuối); đây là bằng chứng bổ trợ cho ảnh,
không thay nghiệm thu TalkBack. 320dp/130% có wrap giá, cuộn đọc được cả hai giá.

Qua ảnh thật đã sửa khoảng trống của tên ngắn ở một cột và ellipsis sát mép.
Harness từng chụp hierarchy khi màn đang tải; đã chờ dữ liệu xuất hiện và chụp
lại. Không dùng ảnh loading hoặc XML chưa tải làm bằng chứng bố cục đạt.

Kiểm RN:91/91 tests, lint/typecheck PASS; Prettier/docs-check/diff-check PASS.
Không thêm test phản chiếu spacing; không chạy lại API gates/export/native build
vì phần tương ứng không đổi. Chưa kiểm TalkBack thực, ARM/máy yếu/FPS, iOS/web.
Không đóng gate review/native/release. Chưa push/merge.

Nhận định để chủ dự án chọn:3 dòng giữ thêm tên phân biệt;2 dòng tiết kiệm26dp
mỗi hàng ở100% nhưng cắt nhiều tên. Ở130%, khung bìa thường quyết định chiều cao,
nên2 dòng không giảm nhiều chiều cao thẻ. Source giữ3 dòng tạm, chưa chốt thay chủ.

Kết thúc: đã phục hồi app snapshot/font/density/adb reverse; dừng emulator và
API/media QA do agent mở, giữ Metro8081/Docker57017/preview8089 của người dùng.
Harness và snapshot riêng nằm ignored tại .tmp/ui-shelf-lines. QA data giữ nguyên.
