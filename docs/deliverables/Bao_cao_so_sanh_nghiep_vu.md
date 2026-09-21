# Báo cáo so sánh và đề xuất hoàn thiện nghiệp vụ nền tảng sách cũ

**Kết luận:** Nên lấy `proj.txt` làm khung chức năng và mô hình dữ liệu, bổ sung cách mô tả ngoại lệ có mã BR/EF của bản Word. Không nên ghép nguyên văn hai bản vì chúng khác nhau về giữ chỗ, kiểm duyệt, vận chuyển, phân quyền và đánh giá. Cả hai chưa đủ làm đặc tả cuối cùng cho phần tiền và trao đổi sách.

Đối chiếu dưới đây dùng ký hiệu **A** cho `proj.txt` và **B** cho `Business_Rules_Exception_Flows.docx`. Dẫn chiếu A theo số mục; B theo mã BR/EF hoặc tên phần. B tự xác định là tài liệu bổ sung, vì vậy việc không có đầy đủ tài khoản, forum hoặc catalog không được coi là lỗi độc lập của B. Các nhận xét về “thiếu” là thiếu trong hai tài liệu đã cung cấp, không phải kết luận rằng phần mềm đã triển khai sai. Các quy tắc hợp nhất bên dưới là đề xuất cần đưa vào đặc tả.

## 1 So sánh ưu điểm và hướng kế thừa

| Khía cạnh | Điểm mạnh của A | Điểm mạnh của B | Hướng kế thừa |
|---|---|---|---|
| Mô hình sách | Tách `book`, `book_listing`, `forum_post`; phân biệt đầu sách với bản vật lý | Nhấn mạnh mỗi sách cũ là một hiện vật duy nhất | Giữ mô hình A; mỗi listing chỉ đại diện một bản vật lý |
| Kiểm duyệt | Có Draft, PendingReview, Rejected, kiểm duyệt lại khi đổi giá/tình trạng | Không mô tả sâu vì là phần bổ sung | Dùng A, bổ sung phiên bản nội dung và hạn chế sửa khi có giao dịch |
| Giữ chỗ | Đề xuất đổi chưa giữ sách; chấp nhận thì giữ cả hai listing | BR-08, BR-15 chỉ rõ loại các yêu cầu cạnh tranh trên cả hai cuốn | Giữ nguyên tắc A và phạm vi xử lý cạnh tranh của B; phải thực hiện nguyên tử |
| Ngoại lệ | Bao quát Order, Exchange, ticket, tác vụ nền | Có mã BR/EF; nêu rõ không xác nhận, không gửi, không nhận, sai mô tả | Dùng cấu trúc BR/EF của B để chi tiết hóa toàn bộ A |
| Tiền | Có hai loại số dư, các loại giao dịch ví, hoa hồng, rút tiền và trạng thái yêu cầu rút | BR-09, BR-20 diễn đạt rõ tiền tạm giữ và tiền được rút | Dùng A làm khung, bổ sung giữ tiền cho yêu cầu rút và sổ cái cân bằng |
| Chống lạm dụng | Cọc, bằng chứng, uy tín, cảnh báo giao dịch ngoài sàn | BR-02 nhận ra rủi ro thổi giá; BR-13 có ngưỡng vi phạm cụ thể | Giữ mục tiêu; sửa cách định giá và cơ chế cọc, không coi chúng là bảo đảm tuyệt đối |
| Vận chuyển | Có webhook carrier, pickup và mốc Delivered | BR-12, BR-18 có hạn gửi hàng và phân công phí ship; cho phép giảm tích hợp để phù hợp đồ án | Giữ hạn gửi và quy tắc phí; nếu mô phỏng phải mô phỏng đủ pickup/delivered/failed/returned |
| Khiếu nại | Phân cấp Staff/Admin, escalation, nhật ký căn cứ | Có loại không nhận hàng, không phản hồi và bảo vệ đánh giá làm bằng chứng | Kết hợp; thêm trả hàng, kết quả giữ nguyên giao dịch và trạng thái thực thi tiền |
| Đánh giá | Gắn với giao dịch hoàn tất, tách chất lượng sách và uy tín | Có đánh giá hai chiều và chặn xóa bằng chứng | Có thể dùng hai chiều, nhưng cần chống trả đũa và ghi nhận vi phạm bằng sự kiện hệ thống |
| Phạm vi | Đủ bức tranh tổng thể để chia module | Hướng tới logic nội bộ, hạn chế tích hợp ngoài | Giữ lõi giao dịch chặt; giảm hub, nhiều carrier và hệ thống uy tín phức tạp |

## 2 Các điểm phải thống nhất trước khi ghép

### 2.1 Reserved có hai ý nghĩa khác nhau

A mục 3, 5 dùng Reserved để chặn một cuốn tham gia giao dịch khác. B phần 1 dùng Reserved khi có yêu cầu đầu tiên nhưng vẫn nhận thêm yêu cầu; tới Locked mới chọn độc quyền. B BR-14 còn diễn đạt việc nhận nhiều yêu cầu khi Available, chưa làm rõ hành vi sau Reserved.

Đây là khác biệt thiết kế quan trọng. Nếu sử dụng lẫn lộn, người viết API có thể coi Reserved là bị khóa trong khi giao diện vẫn cho chốt thêm.

**Đề xuất:** Chỉ dùng một trạng thái giữ độc quyền là Reserved. Đề xuất đổi ở Proposed không giữ sách; khi chấp nhận mới giữ cả hai. Luồng mua giữ độc quyền ngắn hạn từ lúc tạo checkout hợp lệ, có hạn thanh toán. Không bổ sung cơ chế người bán chọn giữa nhiều đơn đã thu tiền trong MVP.

### 2.2 Đăng sách có cần duyệt trước hay không

A mục 3 quy định PendingReview trước Available. B phần 1 ghi Available là trạng thái khởi tạo khi Seller đăng bài.

**Đề xuất:** Dùng A. Sơ đồ của B cần ghi rõ đây là vòng đời sau khi listing đã được duyệt, hoặc thêm các trạng thái kiểm duyệt.

### 2.3 Tích hợp vận chuyển và điều kiện tự hoàn tất

A mục 4, 6, 15 dựa vào carrier để xác nhận giao hàng. B BR-16 cho phép chỉ nhập mã thủ công và theo dõi Đã gửi → người nhận xác nhận; nhưng BR-10/EF-10 lại cần mốc giao thành công của carrier. Riêng trao đổi, BR-07/EF-06 tính thời hạn từ lúc cả hai khai đã gửi.

**Đề xuất:** Dùng cùng nguyên tắc cho mua và đổi: mở hạn kiểm tra sau sự kiện nhận/giao hàng hợp lệ. Có thể dùng carrier giả lập cho đồ án; nếu không có dữ liệu carrier thì phải có xác nhận người nhận hoặc Staff xác minh. Thiếu xác nhận giao thì chuyển điều tra sau hạn vận chuyển, không tự giải ngân chỉ vì hết thời gian từ ngày gửi.

### 2.4 Phân quyền rút tiền và khóa tài khoản

A mục 9 chỉ Admin duyệt rút; B BR-19 cho Staff/Admin. A mục 1 chỉ Admin khóa tài khoản, trong khi mục 15 có khóa tạm tự động; B BR-13 cho Staff mở sớm hạn chế đăng bài.

**Đề xuất:** Tách `account_locked` do Admin áp dụng với `listing_creation_suspended_until` do cơ chế vi phạm áp dụng. Staff có thể đề nghị gỡ hạn chế; Admin quyết định ngoại lệ. Rút tiền do Admin duyệt, Staff chỉ đối chiếu thông tin nếu được phân công.

### 2.5 Đánh giá

A mục 11: Order đánh giá một chiều, sửa/xóa trong 7 ngày. B BR-21/23: hai chiều, 48 giờ. Đây là lựa chọn sản phẩm, không có bản nào tự nhiên đúng hơn.

**Đề xuất:** Chọn hai chiều nếu nhóm đủ thời gian; thống nhất 48 giờ cho việc sửa/xóa sau khi đăng. Giữ lịch sử nội bộ và nội dung đang dùng làm bằng chứng. Nếu dùng đánh giá hai chiều, nên công bố khi cả hai đã đánh giá hoặc hết hạn gửi đánh giá để giảm trả đũa.

## 3 Lỗ hổng của A và cách sửa

### A1 Vòng đời giao dịch chưa đủ để xử lý tiền và hàng

**Nguồn:** mục 4, 5, 8, 15. **Mức:** P0, phải chốt trước khi lập trình lõi.

A chưa tách rõ đặt hàng chưa trả tiền, thanh toán đang xử lý, thất bại, tiền đến muộn và hoàn tiền đang thực hiện. Nhánh Order `Disputed → Refunded` cũng chưa thể hiện trường hợp khiếu nại bị bác hoặc hoàn một phần nhưng giao dịch vẫn được hoàn tất. Exchange `Disputed → Reversed` chưa đủ cho trường hợp chỉ bồi thường, không trả cả hai sách.

**Hậu quả:** một trạng thái giao dịch bị dùng thay cho cả tiến độ hàng, tiến độ tiền và kết luận khiếu nại. Ví dụ Staff đã quyết định hoàn nhưng lệnh hoàn chưa thành công, giao diện vẫn báo đã hoàn tiền.

**Sửa:** tách trạng thái nghiệp vụ, Payment/Refund, từng Shipment và Dispute; chỉ đóng hồ sơ tiền khi thực thi thành công. Khiếu nại phải có kết quả giữ nguyên, bồi thường một phần, trả hàng rồi hoàn, hoặc hoàn không cần trả theo quyết định có căn cứ.

### A2 Thiếu hạn thanh toán và hạn gửi hàng của Order

**Nguồn:** mục 4 và 15. **Mức:** P0.

A có timeout người bán xác nhận nhưng chưa chỉ rõ timeout sau Confirmed/Preparing mà chưa gửi hàng. B BR-12/EF-08 bổ sung tốt điểm này. A cũng chưa định nghĩa thời gian giữ listing khi thanh toán chưa hoàn tất và khi Exchange chờ cọc/bù tiền.

**Sửa:** thêm deadline thanh toán, nộp cọc, xác nhận và pickup. Mỗi deadline có thời điểm bắt đầu, điều kiện dừng, hành động khi quá hạn. Một bên đã nộp cọc nhưng bên kia chưa nộp phải được hoàn khi hết hạn, nếu chưa phát sinh giao hàng.

### A3 Giải phóng Reserved quá rộng

**Nguồn:** mục 3, 6 và 15. **Mức:** P0.

“Giải phóng khi đơn chết”, “không pickup → flag và revert” chưa kiểm tra tình trạng vật lý. Đơn có thể bị lỗi đồng bộ trong khi sách đã được hãng vận chuyển lấy; giao dịch đổi có thể thất bại khi một cuốn đã tới tay bên kia.

**Sửa:** hủy giao dịch không tự động đồng nghĩa sách được bán lại. Chỉ Available khi xác minh chủ listing đang giữ sách và listing vẫn đủ điều kiện hiển thị. Nếu đang vận chuyển hoặc chờ hoàn về, giữ không giao dịch được. Có thể dùng ReturnPending hoặc giữ Reserved kèm lý do.

### A4 Cọc và miễn cọc chưa có mô hình trách nhiệm nhất quán

**Nguồn:** mục 5, 6. **Mức:** P0.

A đồng thời đưa ra cọc bằng giá trị sách đối phương, cọc theo tỷ lệ, miễn cọc người uy tín cao và chỉ bên mới cọc khi lệch uy tín. Những phương án này bảo vệ khác nhau, nhưng chưa chọn một phương án và chưa quy định khi nào số cọc đủ bồi thường. Uy tín cao không loại bỏ rủi ro chiếm tài khoản hoặc gian lận ở giao dịch giá trị lớn.

**Sửa:** MVP dùng một công thức cọc thống nhất, không miễn theo uy tín. Ghi rõ mức trách nhiệm tối đa, tiền nào được dùng bồi thường và xử lý phần tổn thất vượt khoản giữ. Nếu chỉ giữ một phần giá trị, phải mô tả đây là bảo đảm một phần.

### A5 Tự động mất toàn bộ cọc và đóng băng toàn ví quá mạnh

**Nguồn:** mục 6 và 10. **Mức:** P0.

Quy tắc “không tracking = mất cọc toàn bộ” nhầm thiếu dữ liệu với bằng chứng vi phạm. Lỗi nhập mã, hãng vận chuyển chậm đồng bộ và gian lận là các tình huống khác nhau. “Đóng băng số dư khả dụng của cả hai bên khi ticket Open” còn cho phép một ticket thiếu căn cứ làm tê liệt toàn bộ ví đối phương.

**Sửa:** mặc định giữ khoản tiền liên quan tới giao dịch bị tranh chấp; phong tỏa rộng hơn phải có căn cứ, thẩm quyền và nhật ký riêng. Thiếu tracking chuyển sang xác minh, cho thời hạn bổ sung. Tiền phạt/bồi thường chỉ ghi nhận sau kết luận và theo chính sách đã chốt.

### A6 Gửi hàng mù không bảo đảm hai bên cùng gửi

**Nguồn:** mục 5. **Mức:** P1, cần hoàn thiện trước nghiệm thu.

Ẩn trạng thái bên kia chỉ thay đổi thông tin hiển thị, không chứng minh pickup và không xử lý được giao hàng một chiều. Một bên vẫn có thể nhập mã giả hoặc gửi gói rỗng. Cách này còn làm người dùng khó biết lúc nào cần nhờ hỗ trợ.

**Sửa:** ưu tiên hai bản ghi vận chuyển độc lập và xác minh pickup. Có thể bỏ cơ chế mù trong MVP; không trình bày nó như biện pháp chống gian lận chính.

### A7 Sổ cái ví và rút tiền chưa đủ ràng buộc

**Nguồn:** mục 8, 9. **Mức:** P0.

Liệt kê `wallet_transaction` chưa đủ bảo đảm không trừ/hoàn hai lần. A chưa nêu khóa chống yêu cầu lặp, cân bằng sổ cái, xử lý webhook đến muộn và thao tác đồng thời. Yêu cầu rút “trừ available ngay” là hợp lý về việc ngăn tiêu lại, nhưng khoản tiền này phải đi vào khoản giữ riêng, không biến mất khỏi sổ cái. Chưa có trạng thái chuyển khoản thất bại hoặc chưa rõ kết quả.

**Sửa:** mỗi biến động có nguồn, đích, số tiền, tiền tệ, giao dịch nguồn và khóa chống lặp. Khi rút, chuyển available → withdrawal hold; từ chối thì trả về available. Nếu kết quả chuyển khoản chưa rõ, giữ Processing và đối soát trước khi thử lại.

### A8 Thiếu quy tắc giỏ hàng nhiều người bán và phí

**Nguồn:** mục 4, 8. **Mức:** P0 nếu giữ giỏ nhiều Seller.

Chưa rõ một checkout có nhiều Seller tạo một hay nhiều Order; ai trả phí vận chuyển, phí nào được hoàn, hoa hồng tính trên tiền sách hay cả ship. `exchange_flat_fee` “trên phần chênh” chưa rõ là phí cố định hay tỷ lệ, ai trả và khi nào thu.

**Sửa:** MVP giới hạn một Seller mỗi lần checkout, hoặc tách thành Order theo Seller và phân bổ thanh toán rõ ràng. Định nghĩa từng khoản tiền bằng công thức; không dùng cùng tên cho phí cố định và phần trăm.

### A9 Quyền sửa và gỡ listing có thể phá giao dịch đang chạy

**Nguồn:** mục 3, 7, 10. **Mức:** P1.

Seller được ẩn/mở/xóa nhưng chưa giới hạn khi Reserved; Staff gỡ bài vi phạm cũng chưa có hậu quả cho Order/Exchange liên quan. Khi thay đổi ảnh/mô tả, bằng chứng ban đầu có thể bị mất nếu chỉ đọc dữ liệu hiện tại.

**Sửa:** chốt bản sao nội dung, giá, ảnh, tình trạng và chính sách tại lúc giao kết. Không hard delete dữ liệu đã có giao dịch. Seller không sửa dữ liệu trọng yếu khi đang giữ chỗ; hành động kiểm duyệt phải có quy trình hủy/giữ điều tra phù hợp tiến độ hàng.

## 4 Lỗ hổng của B và cách sửa

### B1 Tự hoàn cọc từ lúc khai đã gửi là lỗi nghiêm trọng nhất

**Nguồn:** BR-07, EF-06 và ghi chú dưới Hình 1. **Mức:** P0.

Sau X ngày từ lúc cả hai xác nhận gửi, hệ thống hoàn cọc dù chưa chứng minh sách đã giao. Người gửi có thể nhập mã giả; vận chuyển chậm cũng làm tiền được trả khi quyền khiếu nại của người nhận chưa có cơ hội thực hiện.

**Sửa:** tính hạn kiểm tra theo mốc giao/nhận hợp lệ của từng chiều. Chỉ quyết toán toàn bộ Exchange khi cả hai chiều đủ điều kiện và không còn tranh chấp. Quá hạn vận chuyển mà chưa nhận phải chuyển điều tra, không tự coi là thành công.

### B2 Vận chuyển thủ công không cung cấp mốc mà các luật khác yêu cầu

**Nguồn:** BR-10, BR-16, EF-10. **Mức:** P0.

BR-16 chỉ có khai gửi và người nhận xác nhận, trong khi cơ chế auto-release cần thời điểm carrier giao thành công. Nếu người nhận im lặng, hệ thống không có sự kiện đủ tin cậy để bắt đầu đếm hạn.

**Sửa:** chọn rõ một trong hai chế độ: carrier thật/giả lập có sự kiện giao hàng, hoặc Staff xác minh có bằng chứng. Không âm thầm lấy ngày nhập mã vận đơn làm ngày giao thành công.

### B3 Hủy giao dịch rồi cho sách bán lại có thể bán cuốn không còn ở chủ

**Nguồn:** phần 1, EF-02, EF-08. **Mức:** P0.

EF-02 cho sách quay về Đang bán sau khi một bên không gửi. Nhưng cuốn của bên tuân thủ có thể đang trên đường hoặc đã nằm ở bên vi phạm. EF-08 cũng cần phân biệt “thiếu mã trên hệ thống” với “thật sự chưa gửi”.

**Sửa:** trạng thái thanh toán, giao dịch và hiện vật phải được xử lý riêng. Sách chỉ được bán lại sau khi chưa từng giao đi hoặc đã xác minh nhận hoàn, đồng thời kiểm tra lại tình trạng.

### B4 Chưa có vòng đời cho việc nộp cọc không đồng thời

**Nguồn:** BR-03, BR-04, BR-08. **Mức:** P0.

BR-08 khóa hai sách khi Seller chọn, BR-04 chỉ kích hoạt khi cả hai cọc. Chưa có thời hạn giữa hai mốc, xử lý một bên cọc và một bên im lặng, thay đổi chênh lệch trong lúc chờ cọc, hoặc chủ sách đang tham gia giao dịch khác trước khi khóa.

**Sửa:** thêm AwaitingFunding với deadline. Chấp nhận đúng phiên bản đề xuất, giữ hai listing trong cùng thao tác; hết hạn trước khi giao hàng thì hoàn khoản đã nộp và giải phóng giữ chỗ hợp lệ.

### B5 Có tính bù tiền nhưng chưa mô tả giữ và trả khoản bù

**Nguồn:** BR-01, BR-03 đến BR-07, Hình 1. **Mức:** P0.

B nói bên có sách thấp giá phải bù, nhưng điều kiện kích hoạt chỉ nhắc cả hai đặt cọc; chưa nêu bù tiền phải nộp trước lúc nào, ai giữ, trả cho ai và xử lý khi thất bại. Sơ đồ cũng chỉ thông báo mức bù cho Buyer, trong khi bên phải bù có thể là người nhận đề xuất.

**Sửa:** Exchange chỉ được phép gửi khi đã đủ hai cọc và đủ khoản bù. Dùng vai Initiator/Recipient và tính riêng payer/payee theo giá trị, không mặc định Buyer trả. Tiền bù có khoản giữ riêng, được quyết toán hoặc hoàn theo kết quả giao dịch.

### B6 Cọc 20 đến 30 phần trăm không bảo đảm bồi thường toàn bộ

**Nguồn:** BR-04, EF-02. **Mức:** P0.

B chưa nói tỷ lệ tính trên sách của mình hay sách nhận. Nếu hai sách cùng trị giá 300.000 đồng và cọc 30%, mỗi bên giữ 90.000 đồng. Khi một bên nhận sách nhưng không gửi, 90.000 đồng không đủ bù giá trị cuốn sách 300.000 đồng, chưa tính phí vận chuyển.

**Sửa:** quy định cơ sở tính cọc và phạm vi bảo đảm. Tăng cọc, giảm trần giá trị hoặc chấp nhận bảo đảm một phần; không diễn đạt như đã khép kín rủi ro chỉ vì có cọc.

### B7 Khung giá chưa đủ chống thao túng

**Nguồn:** BR-02. **Mức:** P1.

Giá bìa do người đăng nhập chưa được xác minh vẫn có thể bị nâng. Trung bình các listing đang bán cùng thể loại/tình trạng không phản ánh giá của cùng đầu sách/ấn bản; cũng có thể bị các tài khoản thông đồng làm lệch. Chưa có xử lý trường hợp không có dữ liệu, quá ít mẫu hoặc sách sưu tầm.

**Sửa:** nếu dùng giá tham chiếu, quản lý theo đầu sách/ấn bản và lưu nguồn, thời điểm xác minh. Thiếu dữ liệu thì Staff duyệt hoặc áp trần cấu hình cho MVP. Giá bất thường nên được gắn cờ để xét duyệt; không dùng trung bình listing thô làm giá chuẩn đáng tin cậy. Khung phần trăm tình trạng chỉ là chính sách đề xuất, không phải bằng chứng giá thị trường.

### B8 Từ chối một đề xuất không được tự mở khóa sách của giao dịch khác

**Nguồn:** EF-01 kết hợp BR-08, BR-14, BR-15. **Mức:** P0.

EF-01 ghi từ chối yêu cầu thì sách quay lại Đang bán. Nếu yêu cầu đó đã lỗi thời và listing đang Locked cho người khác, xử lý máy móc sẽ mở khóa nhầm.

**Sửa:** thao tác kết thúc yêu cầu chỉ được giải phóng reservation do chính yêu cầu/giao dịch đó sở hữu. Từ chối một Proposed chưa sở hữu reservation không thay đổi trạng thái giao dịch của listing.

### B9 Nhiều yêu cầu mua và escrow chưa được nối thành một luồng

**Nguồn:** BR-09, BR-14, BR-15. **Mức:** P0.

B chưa chốt thanh toán trước hay sau khi Seller chọn. Nếu mọi Buyer trả trước, cần quản lý nhiều khoản giữ và hoàn tất cả bên không được chọn. Nếu trả sau, phải có hạn thanh toán và cách chọn lại người khác.

**Sửa:** chọn một cơ chế duy nhất. Đề xuất MVP mua theo giữ chỗ độc quyền từ checkout; cơ chế nhiều đề xuất chỉ dành cho Exchange khi chưa chấp nhận.

### B10 Phí ship giữ chung nhưng chưa có người nhận và thời điểm chi

**Nguồn:** BR-18. **Mức:** P0.

Buyer trả ship vào escrow nhưng tài liệu chưa xác định Seller ứng phí trước hay nền tảng thanh toán carrier; khi hoàn một phần phải hoàn khoản nào. “Mỗi bên chịu phí gửi” của Exchange chưa xử lý phí hoàn do lỗi một bên.

**Sửa:** cho MVP, có thể quy định Seller ứng ship Order và nhận khoản ship đã báo giá khi giao thành công; Exchange mỗi bên ứng chiều gửi của mình. Phí hoàn phân theo kết luận lỗi. Nếu phí không đủ trong khoản đang giữ, ghi rõ giới hạn và nghĩa vụ còn lại, không tạo số dư âm hoặc tiền bồi thường không có nguồn.

### B11 Đồng tên tài khoản không thay thế được xác minh rút tiền

**Nguồn:** BR-19, BR-20. **Mức:** P1.

So tên tài khoản ngân hàng với tên hồ sơ mà user tự sửa chưa chứng minh được sở hữu. B chưa có trạng thái yêu cầu rút, giữ tiền, chống rút lặp và xử lý chuyển tiền thất bại.

**Sửa:** lấy state machine của A, giữ tiền khi yêu cầu rút, chốt thông tin người nhận trong yêu cầu và lưu chứng từ thực hiện. Với đồ án dùng dữ liệu giả lập, nêu rõ bước đối chiếu là mô phỏng, không trình bày như xác minh danh tính thực tế.

### B12 Đánh giá và xử lý im lặng cần công bằng hơn

**Nguồn:** EF-05, BR-21 đến BR-23. **Mức:** P1.

“Mất quyền khiếu nại thêm” khi không phản hồi chưa xử lý lỗi thông báo hoặc bằng chứng mới. Đánh giá hai chiều sau Completed không tự nhận diện Buyer bùng đơn, vì các đơn bùng thường không Completed. Hai bên nhìn thấy đánh giá ngay có thể dẫn đến trả đũa.

**Sửa:** có deadline phản hồi, ghi nhận đã gửi thông báo, ra quyết định theo bằng chứng nhưng cho một lần yêu cầu xem xét lại trong hạn đã định. Hành vi hủy/bùng được đo bằng sự kiện vi phạm đã xác minh; điểm sao là tín hiệu riêng. Lưu phiên bản đánh giá phục vụ tranh chấp, kể cả khi bản công khai đã ẩn/xóa.

## 5 Bộ quy tắc hợp nhất đề xuất

### 5.1 Những điều luôn phải đúng

1. Một listing chỉ có tối đa một reservation đang hiệu lực, bất kể đến từ Order hay Exchange.
2. Chấp nhận Exchange phải giữ đồng thời cả hai listing; hoặc thành công cả hai, hoặc không giữ cuốn nào.
3. Chỉ reservation thuộc giao dịch đang xử lý mới được giải phóng; một đề xuất bị từ chối không mở khóa của giao dịch khác.
4. Không được phép giao hàng khi thiếu khoản tiền bắt buộc; không quyết toán khi còn tranh chấp đang mở hoặc nghĩa vụ trả hàng chưa thực hiện.
5. Không suy ra Delivered từ thao tác nhập mã vận đơn. Có mã, đã pickup và đã giao là ba sự kiện khác nhau.
6. Tiền mua, tiền bù, cọc, phí và khoản giữ rút tiền được phân biệt trong sổ cái, có nguồn và người hưởng rõ ràng.
7. Mỗi sự kiện chỉ gây tác động tài chính một lần dù callback, tác vụ nền hoặc người vận hành thực hiện lại.
8. Tổng số tiền phân bổ không vượt tiền thực tế đang giữ. Khoản bồi thường thiếu nguồn phải được ghi nhận riêng, không tự cộng tiền cho người nhận.
9. Không đưa sách về Available khi chưa xác minh sách vẫn ở người đăng hoặc đã được nhận hoàn.
10. Chính sách, giá trị, ảnh/mô tả, địa chỉ và phí liên quan được chốt phiên bản theo giao dịch. Đổi cấu hình không áp hồi tố cho giao dịch đang chạy.
11. Người dùng không được mua/đổi với chính mình; quyền thao tác phải kiểm tra trên đối tượng giao dịch, không chỉ theo vai trò chung.
12. Khóa tài khoản không được làm mất khả năng xử lý nghĩa vụ đang tồn tại. Phải có kênh gửi bằng chứng, hoàn hàng hoặc hỗ trợ xử lý giao dịch cũ.

### 5.2 Listing

Giữ cấu trúc `book → book_listing`; forum chỉ gắn tham chiếu. Vòng đời cơ bản: Draft → PendingReview → Available; khi không đạt thì Rejected và được sửa gửi lại; khi giữ chỗ thì Reserved; hoàn tất thì Sold hoặc Exchanged.

Hidden/Removed nên là trạng thái hiển thị/kiểm duyệt tách khỏi trạng thái giao dịch, để biểu diễn được listing đã Reserved nhưng bị gỡ công khai. Nếu nhóm giữ chung một trường trạng thái thì phải có bảng chuyển trạng thái đầy đủ cho tổ hợp này.

Seller chỉ chủ động ẩn/sửa dữ liệu trọng yếu khi không có giao dịch đang hiệu lực. Staff gỡ nội dung không được xóa lịch sử. Việc trở lại Available sau hoàn hàng cần kiểm tra tình trạng; nếu khác mô tả thì sửa và duyệt lại.

### 5.3 Order

Luồng đề xuất: AwaitingPayment → PendingSellerConfirmation → Preparing → InTransit → Delivered → Inspection → Completed. Confirmed có thể gộp với Preparing để tránh thêm trạng thái không tạo hành động khác biệt.

Tại checkout, giữ listing có hạn; thanh toán thành công mới chuyển chờ Seller. Thanh toán thất bại/hết hạn giải phóng giữ chỗ nếu chưa giao hàng. Seller từ chối hoặc quá hạn xác nhận thì hoàn tiền. Sau xác nhận, quá hạn pickup phải kiểm tra xem hàng thật sự đã được giao carrier chưa; không chỉ dựa vào việc có mã.

Delivered khởi động thời hạn kiểm tra. Người mua có thể bấm xác nhận đã nhận, nhưng với MVP nên vẫn giữ hết hạn kiểm tra đã công bố rồi mới giải ngân. Cách này tránh mâu thuẫn giữa xác nhận sớm và quyền khiếu nại trong N ngày. Nếu nhóm muốn giải ngân ngay khi người mua xác nhận hài lòng, phải quy định rõ thao tác đó kết thúc hạn kiểm tra và cách xử lý các khiếu nại sau đó.

Hủy sau xác nhận nhưng trước pickup có thể là yêu cầu hủy có Seller đồng ý; không bắt buộc biến mọi yêu cầu hủy thành tranh chấp về chất lượng. Sau pickup, chuyển sang quy trình giao thất bại hoặc trả hàng.

### 5.4 Exchange

Luồng đề xuất: Proposed → AcceptedAwaitingFunding → Preparing → InTransit → Inspection → Completed. Rejected, Expired, Cancelled và trường hợp kết thúc sau xử lý tranh chấp là các nhánh riêng. CounterOffer tạo phiên bản đề xuất mới; đồng ý chỉ có hiệu lực với phiên bản hiện hành.

Khi chấp nhận, kiểm tra lại chủ sở hữu, trạng thái, chế độ cho đổi và phiên bản của cả hai listing; giữ hai sách trong một thao tác nguyên tử. Các yêu cầu cạnh tranh trên cả hai sách, bao gồm mua và đổi, không được phép tiếp tục chốt. Thông báo có thể gửi sau, nhưng dữ liệu phải được bảo vệ ngay.

Tách `deposit_A`, `deposit_B`, `difference_payment`. Chỉ mở cửa sổ gửi hàng khi tất cả khoản bắt buộc đủ. Hết hạn funding khi chưa ai gửi thì hủy, hoàn khoản đã giữ và xử lý reservation. Thanh toán đến sau hết hạn không tự hồi sinh giao dịch đã hủy.

Mỗi chiều có Shipment riêng. Trạng thái tổng BothShipped/BothDelivered nếu muốn hiển thị phải được suy ra từ hai Shipment, không che mất việc một bên đã giao còn bên kia chưa gửi. Hạn khiếu nại chất lượng tính theo thời điểm nhận của mỗi bên; chỉ quyết toán khi cả hai chiều đã đạt điều kiện, cả hai hạn liên quan đã kết thúc và không có tranh chấp.

Nếu một bên gửi, bên kia không gửi: mở xử lý vi phạm; chặn bán lại cuốn đang trên đường; tổ chức thu hồi/hoàn về nếu khả thi; tính phí và bồi thường theo bằng chứng. Không tự xóa nghĩa vụ giao/hoàn hàng bằng việc gắn nhãn FailedByX.

### 5.5 Cọc và tiền bù

Ký hiệu `V_A`, `V_B` là giá trị trao đổi đã được duyệt và chốt cho sách của A và B. Nếu `V_A < V_B`, A bù `V_B − V_A`; nếu ngược lại thì B bù; bằng nhau thì không bù.

**Phương án dễ trình bày cho MVP mô phỏng:** cọc của mỗi bên dựa trên giá trị sách mình sẽ nhận, `D_A = r × V_B`, `D_B = r × V_A`, dùng cùng r cho mọi người và không miễn cọc. Nếu chọn r = 100%, khoản giữ lớn hơn nhưng dễ giải thích hơn về bảo đảm giá trị hiện vật; vẫn không tự bảo đảm toàn bộ phí và thiệt hại khác. Nếu r = 30%, phải công bố bảo đảm một phần.

Ví dụ `V_A = 100.000`, `V_B = 300.000`: A bù 200.000; với r = 100%, A cọc 300.000 và B cọc 100.000. Khi hoàn tất bình thường, hoàn đúng cọc cho từng bên, chuyển 200.000 cho B, thu phí nếu có theo chính sách. Khi tranh chấp, không tự động cộng cả cọc, tiền bù và giá trị sách vào một khoản bồi thường; quyết định phải tính tới hàng thực nhận/đã hoàn và khoản tiền đã chi để tránh bồi thường trùng.

Với phí đổi, chọn rõ “phí cố định cho giao dịch có bù” hoặc “tỷ lệ trên khoản bù”; quy định bên trả và cách hoàn. Đồ án có thể để phí đổi bằng 0 trong MVP, vẫn giữ mô hình dữ liệu cho mở rộng.

### 5.6 Tranh chấp và trả hàng

Dispute nên tách tiến độ xử lý khỏi loại kết luận. Tiến độ gợi ý: Open → InReview → AwaitingEvidence hoặc AwaitingReturn → DecisionIssued → Executing → Closed; Escalated là nhánh chuyển thẩm quyền.

Kết luận gồm: không chấp nhận khiếu nại, bồi thường một phần, hoàn tiền sau trả hàng, hoàn không cần trả có căn cứ, hoặc xử lý mất hàng. Ticket chỉ Closed khi các hành động tiền/hàng của quyết định đã thực hiện xong.

Phân biệt không gửi, mất trong vận chuyển, giao sai người, người nhận từ chối, sai tình trạng và mã vận đơn không hợp lệ. Mỗi loại có bằng chứng và trách nhiệm khác nhau. Không nhận được hàng phải có mốc mở vụ việc từ quá hạn giao dự kiến; không thể chờ mốc “đã nhận” vốn chưa xảy ra.

Chỉ giữ tiền giao dịch liên quan theo mặc định. Nếu yêu cầu hoàn hàng, chốt ai gửi trả, địa chỉ, deadline, ai ứng phí, điều kiện xác nhận hoàn và xử lý bên nhận hoàn không hợp tác. Thất lạc trên đường không mặc định là gian lận của Seller.

### 5.7 Ví và rút tiền

Cần phân biệt available, tiền đang giữ theo giao dịch và tiền đang giữ cho withdrawal; số dư tổng phải đối chiếu được với sổ cái. Dùng VND theo đơn vị đồng, quy định làm tròn, không dùng số thực cho tiền.

Withdraw: Requested → Approved → Processing → Completed; nhánh Rejected trước khi thực hiện và Failed khi đã xác minh chuyển tiền không thành công. Kết quả không rõ phải ở Processing chờ đối soát, không vừa trả available vừa thử chuyển tiếp.

Admin duyệt không đồng nghĩa tiền đã chuyển thành công. Mỗi bước có người thực hiện, thời gian, chứng từ/mã tham chiếu và cơ chế chống thao tác lặp. Hoàn tiền và chuyển tiền bồi thường cũng dùng nguyên tắc tương tự.

### 5.8 Phạm vi phù hợp đồ án

**Nên giữ trong lõi:** tài khoản và phân quyền; catalog/listing có duyệt; mua sách; đổi 1 cuốn lấy 1 cuốn có hoặc không bù; cọc; ví mô phỏng và sổ cái; vận chuyển giả lập; khiếu nại/hoàn hàng; đánh giá; nhật ký nghiệp vụ.

**Nên giảm trước:** hub xác minh sách, miễn cọc theo mô hình uy tín phức tạp, nhiều carrier, nhiều phương thức OAuth, dashboard quá rộng, matching nâng cao và lọc nội dung liên hệ tinh vi. Forum có thể giữ phiên bản cơ bản với card listing vì đây là điểm tốt của A.

Nếu dùng số dư và carrier giả lập, phải ghi rõ trong phạm vi và kịch bản demo. Mô phỏng có đủ các trạng thái thất bại và sự kiện lặp sẽ có giá trị bảo vệ nghiệp vụ hơn tích hợp nhiều dịch vụ nhưng chỉ xử lý luồng thành công.

## 6 Các quyết định và tham số phải chốt

| Quyết định | Đề xuất cho MVP | Điều phải ghi trong đặc tả |
|---|---|---|
| Cách mua | Checkout giữ độc quyền; một Seller mỗi checkout | Khi nào giữ, deadline thanh toán, xử lý tiền đến muộn |
| Cách đổi | Proposed chưa giữ, Accepted giữ hai bên | Phiên bản đề xuất, funding deadline, các đề xuất cạnh tranh |
| Cọc | Một tỷ lệ cố định, không miễn theo uy tín | Cơ sở tính, giới hạn trách nhiệm, nguồn bồi thường |
| Vận chuyển | Một carrier giả lập nếu chưa tích hợp thật | Ai phát sự kiện; pickup, delivered, failed, returned |
| Hoàn tất | Sau mốc nhận/giao hợp lệ và hết thời hạn kiểm tra | Tranh chấp ưu tiên trước giải ngân; xử lý deadline đồng thời |
| Hạn thời gian | Chọn giờ liên tục cho MVP để dễ kiểm chứng | Múi giờ, thời điểm bắt đầu, điều kiện tại đúng deadline |
| Phí | Tách tiền sách, ship, phí nền tảng, cọc và tiền bù | Bên trả/nhận, thời điểm thu, quy tắc hoàn và làm tròn |
| Vi phạm | Đếm sự kiện vi phạm đã xác minh | Loại sự kiện, cửa sổ 30 ngày nếu chọn, điều kiện gỡ |
| Đánh giá | Hai chiều nếu triển khai; sửa/xóa 48 giờ | Hạn gửi ban đầu, thời điểm công bố, bằng chứng và lịch sử |
| Thẩm quyền | Admin duyệt rút/khóa; Staff xử lý trong hạn mức | Hạn mức, escalation, cấm tự xử lý giao dịch của mình |

Các con số trong hai tài liệu như 48 giờ, 2 hoặc 3 ngày làm việc, 5 ngày, 20–30%, 3 lần trong 30 ngày là đề xuất chính sách, không phải giá trị đã được chứng minh phù hợp. Khi chọn ngày làm việc phải định nghĩa lịch nghỉ; nếu chọn giờ liên tục thì nêu rõ để tránh mỗi người hiểu một cách. Mọi deadline và phiên bản chính sách nên được lưu trên giao dịch để thay đổi cấu hình không làm đổi cam kết cũ.

## 7 Tình huống kiểm thử để bảo vệ nghiệp vụ

| Mã | Tình huống | Kết quả bắt buộc |
|---|---|---|
| T01 | Hai Buyer checkout cùng một listing | Chỉ một reservation thành công; bên còn lại không bị giữ tiền ngoài quy trình hoàn đã định |
| T02 | Order mua cuốn A trong lúc Exchange A ↔ B được chấp nhận | Chỉ một giao dịch thắng; không để B bị giữ một mình |
| T03 | Chấp nhận hai đề xuất khác nhau cùng dùng cuốn A | Chỉ một Exchange giữ được sách, các đề xuất còn lại không thể chốt |
| T04 | Từ chối đề xuất cũ sau khi sách đã được giữ cho giao dịch khác | Reservation hiện tại không bị thay đổi |
| T05 | Một bên nộp cọc, bên kia hết hạn không nộp | Hủy funding, hoàn đúng khoản đã giữ một lần, không cho gửi |
| T06 | Cả hai nộp cọc nhưng thiếu tiền bù | Chưa mở cửa sổ giao hàng |
| T07 | Callback thanh toán lặp hoặc tới sau khi giữ chỗ hết hạn | Không ghi có hai lần; giao dịch đã hủy không tự phục hồi |
| T08 | Seller tạo mã vận đơn nhưng chưa pickup | Không coi là đã gửi thực tế; quá hạn chuyển xác minh/xử lý phù hợp |
| T09 | Exchange chỉ có một chiều pickup, chiều kia quá hạn | Không đưa cuốn đang đi về Available; mở xử lý thu hồi/bồi thường |
| T10 | Hai bên khai gửi, nhiều ngày sau vẫn chưa giao | Không tự hoàn cọc; mở điều tra theo hạn vận chuyển |
| T11 | Một chiều Exchange nhận trước nhiều ngày | Hạn kiểm tra tính riêng, chưa quyết toán toàn bộ khi chiều còn lại chưa xong |
| T12 | Ticket được gửi sát lúc tác vụ tự giải ngân chạy | Kiểm tra nguyên tử quyền khiếu nại và trạng thái; ticket hợp lệ không bị bỏ qua |
| T13 | Khiếu nại bị bác hoặc chỉ được bồi thường một phần | Tiền phân bổ đúng kết luận; không bắt buộc hoàn toàn bộ hoặc đảo cả giao dịch |
| T14 | Hủy sau khi sách đã giao cho carrier | Phải có luồng hoàn/điều tra, không bán lại sách ngay |
| T15 | Hai yêu cầu rút đồng thời vượt available | Tổng giữ không vượt số dư; không có số dư âm |
| T16 | Chuyển khoản rút tiền timeout nhưng chưa rõ kết quả | Chờ đối soát; không vừa hoàn available vừa chuyển lại |
| T17 | Thay phí, timeout hoặc giá listing khi giao dịch đang chạy | Giao dịch dùng phiên bản đã chốt, hoặc yêu cầu chấp thuận mới theo quy tắc |
| T18 | Admin khóa tài khoản có đơn và ticket đang xử lý | Chặn giao dịch mới nhưng vẫn có đường hoàn tất nghĩa vụ và nộp bằng chứng |
| T19 | Seller sửa/xóa listing hoặc đánh giá đang là bằng chứng | Dữ liệu giao dịch và phiên bản bằng chứng vẫn truy xuất được |
| T20 | Trả sách về nhưng tình trạng khác ban đầu | Chưa tự Available theo mô tả cũ; cần kiểm tra và cập nhật/duyệt lại |

## 8 Thứ tự thực hiện đề xuất

1. **Chốt chính sách:** mô hình giữ chỗ, phạm vi cọc, tiền bù, phí, deadline, quyền Staff/Admin và điều kiện giải ngân. Giải quyết các P0 trước khi chia người viết module.
2. **Viết bảng chuyển trạng thái:** với mỗi chuyển tiếp ghi actor, trạng thái trước, điều kiện, thay đổi listing/tiền/hàng, thông báo và hành vi khi yêu cầu bị lặp. Tách Order, Exchange, Shipment, Payment, Refund, Withdrawal và Dispute.
3. **Viết quy tắc dữ liệu và truy vết:** reservation độc quyền, ảnh chụp dữ liệu giao dịch, sổ cái, nhật ký quyết định, phiên bản chính sách và liên kết BR → Use case → Test.
4. **Làm demo theo các tình huống khó:** một cuốn bị mua/đổi đồng thời, một bên không cọc, tiền tới muộn, một chiều không gửi, mất hàng, hoàn một phần và rút tiền chưa rõ kết quả.

Điểm mạnh khi bảo vệ sẽ là giải thích được ở mọi thời điểm **sách đang ở đâu, ai có quyền thao tác, tiền đang giữ cho ai, sự kiện nào cho phép chuyển bước và hệ thống làm gì khi sự kiện không xảy ra**. Đó là phần cần siết trước khi mở rộng số lượng chức năng.
