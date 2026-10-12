# Lượt thử đầu: tìm → xem → lưu sách

Ngày10/10/2026. Chủ dự án duyệt bước tiếp sau detail `2dc069b`; nhóm chưa từng
mua/bán sách cũ, hiện chỉ có Android Studio/emulator. Vì vậy đây là **pilot trong
nhóm trên emulator**, tập trung khả năng hiểu và hoàn thành thao tác lần đầu.
Chưa có buổi thử với người thật được thực hiện trong gói chuẩn bị này.

## Mục tiêu và phạm vi

- Người đọc tìm đúng bản sách theo nhu cầu, hiểu giá/tình trạng và biết việc lưu
  không đặt mua, giữ chỗ hoặc trả tiền.
- Sau đăng nhập, người dùng tiếp tục cuốn đang xem; tìm lại sách đã lưu và hiểu
  hậu quả của bỏ lưu. Lỗi phải có phản hồi, không tự báo thành công.
- Kiểm câu chữ, thứ tự đọc và việc tìm hành động. Chưa đánh giá cảm giác cầm máy,
  chụp ảnh, thao tác một tay, TalkBack hoặc khả năng dùng ngoài môi trường nhóm.

Chọn2–3 thành viên chưa trực tiếp sửa màn tìm/chi tiết/wishlist nếu có. Không cần
đã mua bán sách cũ. Ghi họ có biết giao diện trước hay không; người đã được hướng
dẫn luồng chỉ tính rehearsal. Nếu cả nhóm đã quen UI, vẫn làm rehearsal để tìm
lỗi, không ghi nhận như evidence first-use. Không dùng AI đóng vai người dùng.

Nguồn phương pháp: [GOV.UK moderated usability testing](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing).
Dùng nhiệm vụ trung tính, quan sát thao tác và hỏi người thử nói suy nghĩ; không
chỉ nút hoặc dạy cách làm. Lựa chọn số người, thời lượng và ngưỡng bên dưới là
quy ước pilot của nhóm, không là chuẩn thống kê hoặc chứng nhận usability.

## Chuẩn bị trước mỗi buổi

1. Một người điều phối, một người ghi nhận; tác giả không hướng dẫn thao tác.
   Dự kiến25–35 phút/người. Bắt đầu bằng kiểm tra emulator, chuột/bàn phím và
   phím Back hoạt động. Ghi model/API/dp/font scale và SHA thực tế.
2. Dùng development APK + Metro cùng source; không dùng screenshot thay app.
   Setup theo [START_HERE](../handoff/START_HERE.md) và
   [Android QA](../ANDROID_QUALITY.md); runner và các lệnh ở
   [pilot setup](../ui/ANDROID_PILOT_SETUP.md). Giữ API/media/Metro khi đang thử;
   debug APK không tải được JS khi Metro tắt không là lỗi UX mạng của sản phẩm.
3. QA là database `*_test` riêng, tài khoản Member giả và dữ liệu có nhãn QA.
   Không dùng database/bucket local chính. Tạo fixture mới; database của các
   lượt search/detail trước đã dọn, không dùng journal cũ như dataset còn tồn tại.
4. Dataset cần Sale, Exchange, Both; ít nhất một bản nhiều ảnh và một bản khai
   báo thiếu trang phụ nhưng vẫn đọc được. Ví dụ Both có giá bán65.000đ, giá trị
   đổi80.000đ; chỉ dùng các số này làm đáp án khi fixture thực sự khớp.
   Chuẩn bị một sách phù hợp và một sách vượt ngân sách để lựa chọn có ý nghĩa.
5. Kiểm kỹ thuật trước: login→quay về, lưu/bỏ lưu được API xác nhận, tìm lại qua
   tài khoản, lỗi đọc/lỗi ghi có phục hồi, sách đã lưu nằm ngoài trang đầu.
   Ghi kết quả hiện hành ở [báo cáo](../ui/ANDROID_SAVE_USABILITY.md).
   Nếu thao tác chính hỏng, sửa hoặc ghi BLOCKED trước khi mời người thử.
6. Người điều phối giữ credential QA ở local; không chép vào bài thử hay Git.
   Dừng ghi màn hình khi nhập credential. Mỗi người bắt đầu anonymous/danh sách
   đã lưu trống trên tài khoản QA riêng; không tiếp tục trạng thái của người trước.
7. Copy [phiếu](../ui/templates/ANDROID_USABILITY_SESSION.md) sang
   `.tmp/usability-round-01/`; dùng mãP01/P02, không lưu tên/email/số điện thoại
   hoặc video cá nhân trong Git. Chỉ chia sẻ kết luận đã bỏ dữ liệu riêng.

Lời mở đầu: “Bọn mình thử ứng dụng, không kiểm tra bạn. Hãy làm theo cách bạn
nghĩ là hợp lý và nói điều đang nghĩ. Bạn có thể dừng bất cứ lúc nào. Chúng mình
sẽ ghi thao tác/nhận xét; chỉ ghi âm hoặc màn hình nếu bạn đồng ý.”

## Nhiệm vụ đọc cho người thử

Chỉ đọc cột nhiệm vụ. Cột quan sát/đáp án dành cho điều phối, không cho người
thử xem trước. Thay tên/ngân sách bằng fixture đã kiểm, giữ cùng độ khó.

| ID | Nhiệm vụ | Quan sát và kết quả cần kiểm |
| --- | --- | --- |
| T1 | Bạn muốn đọc The Great Gatsby, ngân sách tối đa100.000đ, muốn bản còn tốt. Hãy tìm và chọn một bản phù hợp; nói vì sao bạn chọn. | Tìm/mở đúng bản, nhận ra tác giả/tình trạng/giá. Có tự tìm lọc hoặc hiểu kết quả không? Không yêu cầu một đường bấm cụ thể. |
| T2 | Với bản vừa chọn, bạn cần biết gì trước khi quyết định lấy cuốn này? Hãy xem thông tin và giải thích các số tiền, tình trạng mà bạn hiểu. | Xem ảnh/hư hại; phân biệt giá bán với giá trị để so sánh khi đổi; không coi kiểm duyệt là chứng nhận chính hãng hoặc lưu là mua/giữ chỗ. Hỏi tiếp trung tính về điều họ chưa nhắc. |
| T3 | Bạn chưa quyết định ngay, nhưng muốn tìm lại đúng bản sách này sau. Hãy làm điều bạn thấy cần. | Anonymous→đăng nhập bằng QA→quay đúng sách→lưu; success sau phản hồi API. Không nhắc tên nút hoặc tự bấm lưu hộ. |
| T4 | Bây giờ hãy quay về nơi tìm sách, rồi tìm lại bản bạn vừa giữ để xem sau. Sau đó, nếu không còn quan tâm, hãy làm để nó không nằm trong danh sách đó nữa. | Back/context, tìm danh sách đã lưu, mở đúng listing, hiểu bỏ lưu; xác nhận kết quả qua API và danh sách tải lại. |
| T5 | Bạn quay lại xem sách này sau một lúc và muốn biết thông tin đang còn mới hay không. Hãy xử lý tình huống đang thấy. | Ca tùy chọn: điều phối gây lỗi API QA sau khi app đã tải JS/dữ liệu. Hiểu cảnh báo cũ, tìm recovery, khôi phục API và thử lại; không tắt Metro hoặc DB chính. |

Đồng hồ bắt đầu sau khi đọc xong nhiệm vụ và màn sẵn sàng. Khi người thử kẹt,
đợi họ tự phục hồi; sau khoảng90 giây không tiến triển, hỏi “Bạn đang muốn làm
gì?” Nếu chỉ đường, ghi assisted. Khoảng3 phút một nhiệm vụ là mốc hỏi tiếp/dừng,
không là chuẩn tốc độ bắt buộc. Không coi thời gian chậm trên emulator là kết
luận về thao tác điện thoại. Nếu T3 không xong, ghi rõ rồi thiết lập lại T4 để
thử riêng; không tính hành trình liên tục là hoàn thành.

Sau mỗi nhiệm vụ: “Bạn thấy bước này dễ hay khó, từ1 đến5? Điều gì khiến bạn
chọn mức đó?” Sau buổi: “Chỗ nào khó hiểu nhất? Bạn nghĩ ứng dụng hiện cho làm
gì? Nếu chỉ sửa một chỗ, bạn muốn sửa chỗ nào?” Không hỏi dẫn “font này đẹp hơn
Lora đúng không?” hoặc gợi ý câu trả lời.

## Ghi nhận và quyết định

Kết quả từng nhiệm vụ: `unassisted`, `assisted`, `not_completed`, `blocked_setup`,
`not_run`. Ghi số giây, bước/lời nói thực tế, trợ giúp và điểm dễ/khó. Báo số
người/nhiệm vụ cụ thể như2/3; mẫu nhỏ không chứng minh tỷ lệ thành công ngoài nhóm.
T5 không chạy thì ghi not_run, không nhập0 hoặc PASS.

| Mức | Ý nghĩa | Hành động |
| --- | --- | --- |
| P0 | Lộ dữ liệu, sai quyền, mất dữ liệu hoặc ngụ ý trả tiền/giữ chỗ sai | Dừng ca, mở bug có evidence; không tiếp tục mở rộng luồng liên quan. |
| P1 | Không thể tìm/xem/lưu/tìm lại; thao tác ngược ý định; lỗi không có đường phục hồi | Sửa trước màn đăng sách; xác nhận lại đúng ca bị ảnh hưởng. |
| P2 | Làm được nhưng nhầm câu chữ, cần hướng dẫn hoặc khó tìm hành động | Ưu tiên chỗ lặp ở ít nhất2 người; một hiểu nhầm trọng yếu vẫn cần xử lý. |
| P3 | Sở thích hình thức không cản việc hiểu/làm | Ghi nhận, không mở vòng polish vô hạn. |

Điều kiện để chuyển sang thực thi redesign đăng sách: technical preflight đạt,
không còn P0/P1 mở, người thử giải thích đúng ý nghĩa lưu/hai giá và hoàn thành
T1–T4 không cần hướng dẫn. Nếu chỉ có rehearsal, được chuẩn bị brief đăng sách
nhưng phải giữ human usability OPEN và nói rõ rủi ro khi quyết định đi tiếp.
Sau một batch sửa, xác nhận các ca đã hỏng; không chạy lại mọi gate không liên quan.

Kết luận sau buổi gồm: số người hợp lệ/rehearsal; thiết bị/source; n/N củaT1–T4;
3 vướng mắc lớn nhất có evidence; sửa gì/giữ gì; người quyết định bước tiếp.
Impeccable và AI hỗ trợ phân tích, không tự điền phản hồi hoặc ký nhận thay nhóm.
