# Ba hướng kệ — nghiên cứu thị giác, chưa áp vào app

01/10/2026 · `codex/shelf-visual-directions`, base `fd2947d`.
Checkpoint: `design: explore three distinct shelf directions`.

Chủ dự án đồng ý chẩn đoán bản kệ trước quá trầm và ít sức hút cửa hàng, yêu cầu
2–3 hướng thật sự khác nhau, bìa nhiều màu và tên dài/ngắn, rồi dừng chờ chọn.
Đây là **prototype HTML riêng**, không phải client mới hoặc code RN để merge.
`main`, `codex/ui-direction`, runtime app/API và DESIGN.md giữ nguyên.

## Xem và chọn

Từ root repo: `node docs/ui/shelf-directions/serve.mjs`, mở
[bảng so sánh local](http://127.0.0.1:8090/). Server chỉ bind127.0.0.1.
Trang mở đầu có ảnh A/B/C cùng kích thước; chạm ảnh để mở mẫu tương tác390×844px.
Đổi100%/130%, cuộn trong màn, tìm/lọc và mở phiếu mẫu. Nút về đầu khôi phục sáu
cuốn, bỏ tìm/lọc ở cả ba mẫu. Thanh điều hướng dưới chỉ là minh họa, không có route app.

| Hướng               | Thay đổi tổ chức thông tin                                                               | Giá trị / đánh đổi                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A · Cửa hàng sáng   | Lưới hai cột trên trắng ấm, bìa/giá làm trọng tâm, dấu tình trạng nhỏ; phiếu khi mở sách | So sách nhanh, gần cấu trúc RN hiện tại nhất. Tính riêng phụ thuộc bìa và dữ liệu thật; tên ngắn còn khoảng trống do dành ba dòng    |
| B · Dạo kệ          | Mặt tiền xanh rừng, hai hàng bìa cuộn ngang, nút qua cuốn; giá/tình trạng theo từng bìa  | Có nhịp dạo tiệm rõ hơn. Cần nhiều thao tác để so giá; ở130% phải cuộn để thấy đủ cụm thông tin. Chưa được phép thêm gesture vào app |
| C · Quầy có ghi chú | Cuốn đầu như phiếu lớn; các cuốn sau thành hàng ngang kèm lời người đăng                 | “Sách cũ có lý lịch” rõ nhất. Ít sách/viewport; ghi chú cần dữ liệu thật, không suy diễn từ condition hoặc ảnh bìa                   |

Đề xuất A làm nền phát triển vì cân bằng bìa, giá và mật độ. Quyết định còn chờ
chủ dự án; không tự trộn cả ba rồi triển khai. Bỏ mẫu nào không hợp sau khi xem.
Các thử nghiệm về nền, bố cục, banner và chữ ở đây chưa thay các quy tắc đã duyệt
trong DESIGN.md. Sau chọn mới đề xuất cập nhật nguồn sự thật và port vào component RN.

## Bộ dữ liệu và nguồn ảnh

Sáu tác phẩm dùng **cùng thứ tự, giá và tình trạng** ở cả ba mẫu: The Great Gatsby,
Mrs. Dalloway, The Strange Case of Dr. Jekyll and Mr. Hyde, The Secret Garden,
Siddhartha, Alice’s Adventures in Wonderland. Gồm tên ngắn/dài; bán/đổi/cả hai;
Như mới/Còn tốt/Đã dùng nhiều/Cũ nhiều. Giá35K–90K và mọi ghi chú là dữ liệu thử,
không nói về tình trạng của ảnh tư liệu, không ghi vào DB/API/cache sản phẩm.

Bìa SVG nguyên bản từ các repository chính thức Standard Ebooks; URL và blobSHA
ở [sources.json](assets/sources.json), giấy phép của từng nguồn lưu cạnh ảnh
(`*-LICENSE.md`). Nguồn ghi artwork được tin là public domain ở Hoa Kỳ; đóng góp
của Standard Ebooks theo CC0. Đây không là kết luận về quyền thương mại mọi quốc
gia; tài sản nghiên cứu không được mặc nhiên đưa vào listing thật/brand runtime.
Không sửa ảnh bìa, không dùng tác phẩm như chứng nhận một bản sách đang bán.
Logo gốc và font từ repo; OFL đi cùng bản font. Không tải font/CDN lúc xem.

Imagegen built-in đã thử tạo bộ bìa hư cấu nhưng trả `usage_limit_reached`.
Không có ảnh AI được tạo và không dùng CLI/API key để vượt hạn mức. Đổi sang
tư liệu có nguồn để hoàn thành mẫu thử. Không bịa khuyến mãi/rating/lượt bán.

## Kiểm đã thực hiện

- Xem cả ba màn tại390×844px ở100% và130% trên in-app browser; ảnh nguyên bản ở
  [evidence](evidence/a-100.png), tên file `a/b/c-100/130.png`.
- Tìm Jekyll ở C130%, mở phiếu thấy đủ tên dài/Cũ nhiều/hai giá, đóng trả focus
  về cuốn vừa mở: [ảnh phiếu](evidence/long-title-130.png).
- B130%: nút qua cuốn chuyển sang Dalloway/Jekyll; lọc Both ra3cuốn; tìm chuỗi
  không khớp ra thông báo rỗng. Không có call API hoặc action mua/đổi.
- Tổng quan ba ảnh; dropdown chọn từng hướng/chữ lớn và về đầu được kiểm browser.
- Node syntax check cho JS/server, Prettier, docs:check và git diff --check PASS.
  [Ảnh tổng quan](evidence/overview.png) đặt cả ba hướng cạnh nhau.

Chữ130% là mô phỏng CSS, **không phải native PASS**. Chưa kiểm Android/iOS,
TalkBack, keyboard thiết bị, safe area hệ thống hoặc hiệu năng máy yếu. Không
chạy lại91RN tests/API gates vì không đổi app. Dừng chờ chủ dự án chọn A/B/C;
chưa cập nhật theme/components runtime, chưa push/PR/merge.
