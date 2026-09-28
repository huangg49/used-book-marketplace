# Đặc tả yêu cầu phần mềm nền tảng mua bán và trao đổi sách cũ

**Mã tài liệu:** SRS-BOOK-001  
**Phiên bản:** 1.1  
**Ngày:** 26 tháng 09 năm 2026  
**Trạng thái:** Baseline triển khai theo phương án chủ dự án đã duyệt; không phải chứng nhận triển khai hay phê duyệt của giảng viên  
**Ngôn ngữ và tiền tệ:** Tiếng Việt và VND  
**Phạm vi áp dụng:** React Native Member trước, web vận hành, API dùng chung Flutter; TP.HCM; tiền và carrier mô phỏng

Tài liệu xác định hệ thống phải làm gì, ai được thực hiện, điều kiện chuyển bước, cách quản lý sách và tiền, cách xử lý ngoại lệ và điều kiện nghiệm thu. Trọng tâm là mua bán và trao đổi từng bản sách vật lý, có kiểm duyệt, giữ tiền, vận chuyển, khiếu nại và truy vết nghiệp vụ. Một cuốn sách không được đồng thời cam kết cho hai giao dịch; tiền chỉ được phân bổ khi có đủ điều kiện và không được ghi nhận hai lần cho cùng một sự kiện.

Bản 1.1 kế thừa [SRS 1.0 lưu trữ](deliverables/SRS_Nen_tang_sach_cu.md) và thay đổi phạm vi theo quyết định chủ dự án trong phiên làm việc ngày 26/09/2026. Phương án TP.HCM, giữ ship, hai điểm mô phỏng do Lật lại quản lý, điểm tùy chọn cho mua/đổi và bắt buộc trước đấu giá đã được duyệt. Các con số/chính sách biên là baseline do nhóm cụ thể hóa theo ủy quyền, không gán cho giảng viên.

**Bộ đặc tả hiện hành phải đọc cùng nhau:** tài liệu này + [phụ lục nghiệp vụ LOCAL-AUCTION-01](features/LOCAL_HANDOVER_AUCTION.md) + [mô hình logic](features/LOCAL_TRANSACTION_DESIGN.md) + [use case và nghiệm thu](features/LOCAL_TRANSACTION_ACCEPTANCE.md). Phụ lục là một phần quy phạm của SRS 1.1, ưu tiên cho ViaPoint/Auction; phần DirectDelivery giữ hành vi cũ trừ thay đổi được nêu. [ADR 0007](adr/0007-hcm-handover-auction-scope.md) ghi quyết định và giới hạn.

**Hiện trạng phần mềm:** chỉ auth/profile, catalog và nháp listing có API thật; point, auction, tiền và giao dịch ở đây chưa được triển khai. [Báo cáo API](features/CATALOG_DRAFT_API_REPORT.md) là bằng chứng riêng. Bộ ZIP/diagram/HTML 1.0 là snapshot lịch sử, không phải đặc tả 1.1.

## 1 Mục đích và quy ước

### 1.1 Người sử dụng tài liệu

Nhóm phân tích dùng SRS để viết use case, thiết kế dữ liệu và giao diện. Nhóm phát triển dùng các yêu cầu có mã để triển khai. Nhóm kiểm thử dùng tiêu chí chấp nhận và ma trận truy vết. Giảng viên và hội đồng dùng phạm vi, các bất biến nghiệp vụ và tình huống ngoại lệ để đánh giá mức hoàn thiện.

### 1.2 Tài liệu đầu vào và cách kế thừa

| Mã | Tài liệu | Phần kế thừa |
|---|---|---|
| SRC-A | proj.txt, 15 nhóm chức năng | Cấu trúc book/listing/forum; kiểm duyệt; mua và đổi; ví; phân quyền; vận hành và tự động hóa |
| SRC-B | Business_Rules_Exception_Flows.docx | Cách mô tả BR/EF; hạn xác nhận và gửi; xử lý không nhận hàng; khóa hai sách; phí ship; bảo vệ đánh giá làm bằng chứng |
| SRC-C | Báo cáo so sánh nghiệp vụ trong cùng bộ tài liệu | Các mâu thuẫn cần giải quyết; quản lý reservation; tách trạng thái tiền/hàng; đề xuất kiểm thử |

Các quy tắc của SRS này thay thế cách diễn đạt mâu thuẫn trong hai tài liệu nguồn khi triển khai phạm vi phiên bản 1.1. Bảng đối chiếu ở mục 19 giải thích các thay đổi chính. SRS không tuyên bố phần mềm hiện tại đã đáp ứng yêu cầu; kết quả đó phải được xác nhận bằng kiểm thử.

### 1.3 Quy ước yêu cầu

- **FR** là yêu cầu chức năng; **BR** là quy tắc nghiệp vụ; **UC** là use case; **NFR** là yêu cầu phi chức năng; **AC** là ca nghiệm thu; **POL** là chính sách cấu hình.
- **M** là bắt buộc trong baseline nghiệm thu; **E** là mở rộng. Điểm giao nhận và tập đấu giá tối thiểu thuộc M trong 1.1; đấu giá nâng cao vẫn E. Tính năng phụ không có nghĩa bỏ kiểm thử tiền/quyền/concurrency.
- “Phải” là hành vi bắt buộc; “có thể” là lựa chọn được phép nếu vẫn bảo đảm các bất biến.
- Trạng thái tiếng Anh là mã chuẩn; giao diện hiển thị nhãn tiếng Việt tương ứng. Các tên bảng là mô hình logic, không ép nhóm chọn một hệ quản trị cụ thể.
- Các yêu cầu độc lập với lựa chọn framework. Thiết kế API và dữ liệu ở đây là hợp đồng hành vi tối thiểu, không phải toàn bộ tài liệu thiết kế chi tiết.

### 1.4 Thuật ngữ

| Thuật ngữ | Định nghĩa |
|---|---|
| Book | Bản ghi đầu sách và ấn bản; không phải hiện vật đang bán |
| Listing | Một bản sách vật lý do một người dùng sở hữu và đăng bán/đổi |
| Buyer và Seller | Vai theo từng đơn mua; một tài khoản có thể giữ cả hai vai ở các đơn khác nhau |
| Initiator và Recipient | Người tạo và người nhận đề xuất đổi; không mặc định ai phải bù tiền |
| Reservation | Cam kết độc quyền một listing cho một giao dịch có định danh |
| Escrow hoặc khoản giữ | Khoản tiền mô phỏng bị hạn chế sử dụng cho một mục đích nghiệp vụ xác định |
| Deposit | Cọc trao đổi; tách biệt với tiền bù và nạp ví |
| Pickup | Carrier xác nhận đã nhận kiện hàng từ người gửi |
| Delivered | Có sự kiện giao/nhận hợp lệ; không đồng nghĩa đã qua hạn khiếu nại |
| Settlement | Phân bổ cuối cùng các khoản giữ thành hoàn, bồi thường, phí và tiền người bán nhận |
| Snapshot | Bản chụp dữ liệu và chính sách tại thời điểm giao kết, không sửa theo listing hiện tại |
| Idempotency | Thực hiện lại cùng một yêu cầu không phát sinh thêm tác động nghiệp vụ |
| Dispute | Hồ sơ tranh chấp gắn với một giao dịch, có thể chứa khiếu nại từ cả hai bên |
| Custody | Bên được xác minh đang giữ hiện vật; phân biệt với quyền sở hữu pháp lý |

## 2 Tổng quan và phạm vi

### 2.1 Mục tiêu sản phẩm

Hệ thống phục vụ người dùng giao dịch trong TP.HCM, tìm/mua/đổi sách cũ và đấu giá đơn giản, có lựa chọn giao qua điểm kiểm tra tình trạng; giúp người bán quản lý từng bản sách; giúp Staff kiểm duyệt và xử lý tranh chấp; giúp Admin quản lý chính sách, quyền, rút tiền mô phỏng và đối soát. Forum hỗ trợ thảo luận và tìm sách, nhưng giao dịch phải đi qua listing và quy trình có lưu vết.

### 2.2 Phạm vi bắt buộc

Phiên bản nghiệm thu gồm tài khoản bằng email, hồ sơ và địa chỉ; catalog và listing có kiểm duyệt; tìm kiếm; giỏ hàng; mua một listing mỗi Order; đổi một listing lấy một listing có hoặc không bù tiền; ví mô phỏng có sổ cái; nạp và rút mô phỏng; vận chuyển giả lập có đủ trạng thái; khiếu nại, trả hàng và giải quyết tiền; đánh giá hai chiều; chat, forum cơ bản, wishlist; thông báo; quản trị và nhật ký. Bản 1.1 bổ sung hai điểm giao nhận mô phỏng, assignment Staff, custody/inspection/handover, bảng phí từng chặng và đấu giá tối thiểu theo phụ lục. Giao trực tiếp qua ship vẫn được giữ.

Giỏ hàng có thể chứa listing của nhiều người bán, nhưng mỗi checkout trong phiên bản này chỉ chọn **một listing**. Người dùng muốn mua nhiều cuốn tạo các Order độc lập. Đây là giới hạn có chủ ý để tránh phân bổ tiền, giao hàng và hoàn một phần giữa nhiều hiện vật trong cùng đơn.

### 2.3 Ngoài phạm vi bắt buộc

Đăng nhập Google/Facebook/SĐT; payment gateway và ngân hàng thật; carrier thật; COD; giao dịch tiền thật; đổi nhiều cuốn cùng lúc; giao ngoài vùng TP.HCM; đấu giá nâng cao/auto-relist/giá sàn bí mật; chuyển sách giữa các điểm/đối tác ký gửi; chứng nhận sách chính hãng; miễn cọc theo điểm uy tín; định giá thị trường tự động; phát hiện nhiều tài khoản cùng một người bằng danh tính thực; xử lý bồi thường vượt nguồn tiền đang giữ; chatbot; các tích hợp thương mại thật. React Native không còn ngoài phạm vi, theo ADR 0003. Các mục này chỉ được bổ sung khi có yêu cầu thay đổi phạm vi.

### 2.4 Môi trường và phụ thuộc

React Native phục vụ Member, web responsive phục vụ vận hành; NestJS API dùng chung Flutter, PostgreSQL, kho tệp, worker và adapter thanh toán/vận chuyển mô phỏng. Service area được kiểm tra ở server; Guest ngoài vùng vẫn xem được. Hệ thống lưu thời gian UTC, hiển thị theo Asia/Ho_Chi_Minh. Email xác minh có thể dùng hộp thư sandbox trong môi trường trình diễn. Tài khoản người dùng thường không được truy cập màn hình phát sự kiện carrier hoặc callback thanh toán.

Không sử dụng tiền, tài khoản ngân hàng hoặc dữ liệu cá nhân thật trong dữ liệu demo. Giao diện ví và vận chuyển phải ghi rõ “Mô phỏng đồ án”. Mục tiêu nghiệm thu là tính nhất quán của quy trình, không phải chứng nhận khả năng vận hành dịch vụ tài chính thực tế.

### 2.5 Vai trò và ranh giới trách nhiệm

| Actor | Trách nhiệm |
|---|---|
| Guest | Xem dữ liệu công khai và đăng ký |
| Member | Quản lý dữ liệu của mình, mua/bán/đổi, thảo luận, khiếu nại và đánh giá |
| Staff | Kiểm duyệt nội dung; xử lý bằng chứng trong hạn mức; nhận/kiểm tra/bàn giao sách chỉ tại điểm được phân công, không xử lý hồ sơ của mình |
| Admin | Quản trị tài khoản/quyền/chính sách, duyệt rút, giải quyết escalation và kháng nghị |
| System | Kiểm tra quyền và điều kiện; giữ sách/tiền; chạy deadline, đối soát và thông báo |
| Payment Simulator | Cung cấp kết quả nạp/chuyển tiền với mã sự kiện và khả năng mô phỏng lỗi |
| Carrier Simulator | Cung cấp sự kiện pickup, giao, thất bại, thất lạc và hoàn hàng |

Staff/Admin có thể có vai Member để demo, nhưng không được kiểm duyệt listing, quyết định tranh chấp hay duyệt rút của chính mình. Nếu không có người đủ quyền độc lập, hồ sơ chờ phân công, không bỏ qua kiểm soát.

## 3 Quyết định chính sách và cấu hình baseline

### 3.1 Lựa chọn nền tảng

SRS chọn kiểm duyệt trước khi listing xuất hiện công khai; mua theo reservation tại checkout; đổi giữ đồng thời hai cuốn khi chấp nhận; không giữ sách lúc mới Proposed; không dùng trạng thái Locked có ý nghĩa khác Reserved. Mỗi bên trao đổi cọc bằng giá trị sách mình dự kiến nhận. Không miễn cọc theo uy tín. Hai chiều vận chuyển hiển thị minh bạch, không áp dụng gửi hàng mù.

Hoàn tất bình thường xảy ra sau thời hạn kiểm tra kể từ nhận/giao hợp lệ. Bấm “Đã nhận” không làm mất phần thời gian kiểm tra còn lại. Chỉ freeze tiền của giao dịch bị tranh chấp theo mặc định. Staff không sửa trực tiếp số dư; mọi thay đổi tiền có chứng từ nghiệp vụ và sổ cái.

### 3.2 Danh mục chính sách

Các giá trị dưới đây là baseline demo kế thừa để triển khai. POL-27–42 ở phụ lục bổ sung point/auction/phí. Mọi thay đổi phải có policy version và cập nhật ca nghiệm thu; không dùng tên “X ngày” trong bản triển khai cuối.

| Mã | Khóa cấu hình | Mặc định đề xuất | Cách áp dụng |
|---|---|---|---|
| POL-01 | checkout_payment_minutes | 15 phút | Từ khi reservation Order được tạo |
| POL-02 | seller_confirm_hours | 48 giờ | Từ khi thanh toán Order thành công |
| POL-03 | order_pickup_hours | 48 giờ | Từ khi Seller xác nhận |
| POL-04 | exchange_response_hours | 48 giờ | Từ lúc gửi phiên bản đề xuất mới |
| POL-05 | exchange_funding_hours | 24 giờ | Từ khi chấp nhận đề xuất |
| POL-06 | exchange_pickup_hours | 72 giờ | Từ khi đủ hai cọc và tiền bù |
| POL-07 | delivery_overdue_hours | 240 giờ | Theo từng chiều, tính từ pickup; quá hạn mở điều tra |
| POL-08 | inspection_hours | 72 giờ | Theo từng lần giao/nhận hợp lệ |
| POL-09 | evidence_response_hours | 48 giờ | Từ yêu cầu bổ sung bằng chứng |
| POL-10 | decision_appeal_hours | 48 giờ | Từ lúc quyết định có trong hộp thư nội bộ |
| POL-11 | return_pickup_hours | 72 giờ | Từ lúc quyết định trả hàng có hiệu lực |
| POL-12 | exchange_deposit_rate | 100% | Tính trên giá trị sách đối phương, không miễn |
| POL-13 | order_commission_rate | 5% | Trên tiền sách thực giữ lại sau hoàn, không tính ship |
| POL-14 | exchange_fee | 0 đồng | Phiên bản 1.0 chưa thu phí đổi |
| POL-15 | min_withdrawal_amount | 50.000 đồng | Phí rút mô phỏng bằng 0 |
| POL-16 | listing_price_limits | 10.000 đến 1.000.000 đồng | Cho giá bán và giá trị đổi trong phạm vi M |
| POL-17 | violation_window_threshold | 3 sự kiện trong 720 giờ | Hạn chế giao dịch mới 168 giờ khi đủ ngưỡng |
| POL-18 | review_submit_hours | 168 giờ | Từ Completed |
| POL-19 | review_edit_hours | 48 giờ | Từ lần tạo đánh giá, không gia hạn do sửa |
| POL-20 | staff_compensation_limit | 300.000 đồng | Tổng tiền bồi thường/hoàn trong quyết định; vượt thì Admin |
| POL-21 | case_initial_response_hours | 24 giờ | Quá hạn nhắc Staff và báo Admin |
| POL-22 | default_ship_quote | 30.000 đồng | Một chiều Order trong simulator, snapshot tại checkout |
| POL-23 | open_exchange_limit | 5 đề xuất mỗi tài khoản | Chỉ tính Proposed; 1 đề xuất mở cho cùng cặp listing |
| POL-24 | order_reservation_limit | 2 checkout chưa trả tiền | Mỗi Buyer; đã trả không tính vào hạn này |
| POL-25 | evidence_retention_days | 365 ngày | Sau khi kết thúc hồ sơ, trừ hồ sơ đang giữ để điều tra |
| POL-26 | auth_attempt_limit | 5 lần mỗi 15 phút | Theo tài khoản và IP, có thông báo chung tránh lộ tài khoản |

Tất cả deadline dùng giờ liên tục. Quyền thao tác của người dùng còn hiệu lực khi thời gian tiếp nhận hợp lệ tại máy chủ **nhỏ hơn** deadline; tại đúng deadline coi là hết hạn. Worker chạy trễ không kéo dài quyền. Sự kiện carrier/payment đến muộn được xử lý theo quy tắc ngoại lệ, không sửa ngược lịch sử đã quyết toán.

Phiên bản chính sách mới chỉ áp dụng cho giao dịch tạo/chấp nhận sau lúc hiệu lực. Deadline cụ thể và các tỷ lệ phải được snapshot. Cấu hình bảo mật và kiểm duyệt khẩn cấp có thể có hiệu lực ngay, nhưng không tự thay đổi số tiền đã cam kết.

### 3.3 Quyền quyết định và thay đổi phiên bản

Giữ một listing/Order, cọc Exchange 100% cho cả DirectDelivery/ViaPoint, trần giá và commission đã nêu. Chủ dự án ủy quyền nhóm cụ thể hóa nghiệp vụ trong phạm vi đã duyệt. Quỹ incident mô phỏng cho lỗi custody điểm là ngoại lệ có giới hạn đối với quy tắc không ứng tiền nền tảng; xem FR-T04/POL-42. Không diễn đạt baseline demo thành chính sách vận hành thực tế hoặc quyết định đã được giảng viên phê duyệt.

## 4 Ma trận phân quyền

Quyền phải kiểm tra ở máy chủ và gắn với quyền sở hữu đối tượng. Ẩn nút trên giao diện không thay thế kiểm tra quyền.

| Thao tác | Guest | Member | Staff | Admin |
|---|---|---|---|---|
| Xem listing và forum công khai | Có | Có | Có | Có |
| Tạo/sửa listing | Không | Của mình | Theo vai Member | Theo vai Member |
| Duyệt hoặc gỡ listing | Không | Không | Có, không tự duyệt | Có, không tự duyệt |
| Mua/đổi/chat | Không | Giao dịch hợp lệ của mình | Theo vai Member | Theo vai Member |
| Xem địa chỉ và vận đơn | Không | Các giao dịch có tham gia, theo nhu cầu giao hàng | Hồ sơ được phân công | Theo nhiệm vụ có log |
| Đọc chat phục vụ tranh chấp | Không | Chat có tham gia | Chỉ hồ sơ được phân công | Hồ sơ được phân công/escalate |
| Tạo ticket và nộp bằng chứng | Không | Giao dịch có tham gia | Theo vai Member | Theo vai Member |
| Quyết định ticket | Không | Không | Trong hạn mức, không xung đột | Có, không xung đột |
| Giải quyết kháng nghị | Không | Không | Không | Người không ra quyết định ban đầu |
| Duyệt rút | Không | Không | Chỉ kiểm tra và đề xuất | Có, không tự duyệt |
| Đổi số dư trực tiếp | Không | Không | Không | Không |
| Khóa tài khoản/cấp quyền | Không | Không | Đề nghị | Có |
| Quản lý catalog | Không | Đề nghị bổ sung | Đề nghị/sửa bản nháp | Duyệt và quản lý |
| Quản lý chuyên mục và cấu hình | Không | Không | Không | Có |
| Báo cáo tổng hợp và đối soát | Không | Số liệu của mình | Phần công việc được giao | Toàn hệ thống |
| Phát sự kiện simulator | Không | Không | Chỉ tài khoản vận hành test được cấp riêng | Quyền test riêng và log |

Tài khoản bị khóa hoặc hạn chế giao dịch mới được truy cập chế độ xử lý nghĩa vụ cũ: xem đơn, chat trong đơn cũ, gửi/nhận/hoàn hàng, nộp bằng chứng và xem ví. Không được mua/đổi/đăng mới hoặc tạo rút tiền mới khi account_locked. Hạn chế do vi phạm thông thường chỉ chặn đăng mới và tham gia giao dịch mới, không mặc định khóa toàn ví.

## 5 Yêu cầu chức năng

Mọi yêu cầu trong mục này là M trừ khi ghi E. Các tiêu chí AC ở mục 18 kiểm tra theo nhóm; điều kiện chi tiết tại BR và UC có hiệu lực đồng thời.

### 5.1 Xác thực và hồ sơ

| Mã | Yêu cầu |
|---|---|
| FR-A01 | Đăng ký bằng email duy nhất sau chuẩn hóa khoảng trắng và chữ hoa/thường; mật khẩu từ 10 đến 128 ký tự; chỉ kích hoạt sau xác minh email. Không tự gộp hai địa chỉ email khác nhau. |
| FR-A02 | Gửi liên kết xác minh dùng một lần, hạn 30 phút; gửi lại sau ít nhất 60 giây; liên kết mới vô hiệu liên kết cũ. |
| FR-A03 | Đăng nhập/đăng xuất; kiểm tra trạng thái tài khoản ở mỗi thao tác quan trọng; áp giới hạn thử sai POL-26. |
| FR-A04 | Khôi phục mật khẩu bằng token một lần hạn 15 phút; phản hồi công khai giống nhau dù email có tồn tại; đổi mật khẩu thu hồi phiên đang hoạt động. |
| FR-A05 | Người dùng xem/sửa tên hiển thị, avatar và thông tin liên hệ; thay email phải xác minh địa chỉ mới. Không tự cấp vai hoặc sửa điểm uy tín. |
| FR-A06 | Quản lý tối đa 10 địa chỉ, đúng một địa chỉ mặc định nếu có địa chỉ; địa chỉ gồm người nhận, SĐT, tỉnh/thành, địa bàn và chi tiết. Chỉnh hồ sơ không sửa snapshot giao dịch. |
| FR-A07 | Admin khóa/mở tài khoản có lý do, thời điểm, người thực hiện; Staff chỉ đề nghị. Hệ thống giữ khả năng xử lý nghĩa vụ cũ. |
| FR-A08 | Hiển thị số giao dịch hoàn tất, điểm đánh giá và vi phạm đã xác minh dưới dạng các chỉ số riêng; không suy ra vi phạm từ khiếu nại chưa kết luận. |

### 5.2 Catalog và khám phá

| Mã | Yêu cầu |
|---|---|
| FR-C01 | Catalog có tên, tác giả, nhà xuất bản, năm, ngôn ngữ, ấn bản, thể loại và ISBN tùy có; cho phép sách không ISBN; chuẩn hóa và kiểm tra cấu trúc/check digit khi nhập ISBN. |
| FR-C02 | Member chọn catalog có sẵn hoặc gửi yêu cầu đầu sách mới; listing không thể duyệt nếu catalog liên quan chưa được xác nhận. |
| FR-C03 | Admin xử lý trùng catalog bằng ánh xạ/gộp có log; không mất listing, wishlist và lịch sử snapshot. |
| FR-C04 | Tìm theo tên/tác giả/ISBN; lọc giá bán, giá trị đổi, tình trạng và chế độ bán/đổi; có phân trang, sắp xếp mới nhất hoặc giá tăng/giảm. |
| FR-C05 | Kệ mua/đổi thường chỉ gồm listing Approved, Visible, Available của chủ đủ quyền và không custody obligation. Kệ auction dùng predicate riêng Active + Pass + eligibility theo FR-AU; listing của auction có cam kết Reserved nên không dùng Available để lọc nó. |
| FR-C06 | Trang book gom các listing đủ điều kiện; trang listing có ảnh thật, mô tả, giá, tình trạng, người đăng, đánh giá và topic liên quan được công khai. |
| FR-C07 | Admin quản lý banner, bộ sưu tập và thứ tự hiển thị; listing không đủ điều kiện trong bộ sưu tập tự ngừng được đề xuất mua/đổi. |

### 5.3 Listing và kiểm duyệt

| Mã | Yêu cầu |
|---|---|
| FR-L01 | Tạo nháp cho một bản vật lý, chọn Sale/Exchange/Both; có 1–8 ảnh thật, tình trạng, mô tả lỗi và các trường giá bắt buộc tương ứng chế độ. |
| FR-L02 | Bốn mức tình trạng là Như mới, Tốt, Khá, Cũ; phải khai tình trạng trang, bìa, ghi chú, thiếu trang và phụ kiện kèm. Sách không đọc được hoặc thiếu phần nội dung trọng yếu không đủ điều kiện bản M. |
| FR-L03 | Gửi duyệt kiểm tra đủ trường, giới hạn giá, quyền sở hữu khai báo và catalog. Staff xem checklist, phê duyệt hoặc từ chối với lý do. |
| FR-L04 | Đổi book/ảnh/mô tả/tình trạng/giá/chế độ sau khi duyệt phải tạo revision chờ duyệt lại; trong lúc đó listing không nhận giao dịch mới. |
| FR-L05 | Khi có reservation hiệu lực, Seller không sửa dữ liệu trọng yếu, ẩn chủ động hoặc xóa listing. Chỉ được trao đổi bổ sung trong chat mà không thay snapshot. |
| FR-L06 | Cho ẩn/mở listing chưa giữ chỗ; mở lại phải qua kiểm tra trạng thái duyệt và quyền hiện hành. Xóa là soft delete, không xóa lịch sử. |
| FR-L07 | Staff/Admin gỡ công khai với lý do; nếu đang giao dịch phải đồng thời tạo hồ sơ điều tra hoặc hủy trước giao theo tiến độ, không âm thầm giải phóng sách/tiền. |
| FR-L08 | Lưu phiên bản được duyệt và ảnh tại giao kết; quyền truy cập bản chụp giới hạn theo giao dịch. Giao diện công khai vẫn hiển thị dữ liệu live phù hợp. |

### 5.4 Giỏ hàng và mua bán

| Mã | Yêu cầu |
|---|---|
| FR-O01 | Member thêm/xóa listing Sale/Both trong giỏ, tối đa 50 dòng; số lượng mỗi listing luôn bằng 1; thêm giỏ không giữ chỗ. |
| FR-O02 | Checkout một listing: kiểm tra lại giá/phiên bản, địa chỉ, điều kiện listing, không tự mua, báo tổng tiền và tạo reservation cùng Order nguyên tử. |
| FR-O03 | Hiển thị hạn thanh toán, tiền sách, phí ship, phí Buyer nếu có và chính sách đã chốt. Dùng available mô phỏng thanh toán một lần; thiếu số dư cho phép nạp riêng, không kéo dài reservation. |
| FR-O04 | Thanh toán thành công chuyển toàn bộ tiền phải trả vào hold của Order; chờ Seller xác nhận. Buyer có thể hủy trước Seller xác nhận; lệnh đồng thời phải cho đúng một kết quả. |
| FR-O05 | Order thường: Seller xác nhận/từ chối trong POL-02, từ chối/hết hạn hoàn theo custody. Order từ auction: Seller đã cam kết khi mở phiên, không được từ chối lại chỉ vì không hài lòng giá thắng. |
| FR-O06 | Sau xác nhận, Seller nhập vận đơn và ảnh đóng gói; phải có pickup trong POL-03. Mã đơn thuần không thỏa điều kiện đã gửi. |
| FR-O07 | Hệ thống theo dõi giao hàng; Buyer xác nhận nhận được; nhận/giao hợp lệ mở cửa sổ kiểm tra POL-08, không giải ngân ngay. |
| FR-O08 | Hết hạn kiểm tra và không có dispute/return/hold điều tra: quyết toán phí và tiền Seller, đóng Order, listing Sold; mọi bước phải chống lặp. |
| FR-O09 | Buyer xin hủy sau Seller xác nhận nhưng trước pickup; Seller được đồng ý. Không đồng ý thì nghĩa vụ gửi vẫn còn; đã pickup phải dùng quy trình trả hàng/tranh chấp. |
| FR-O10 | Người tham gia xem lịch sử trạng thái, khoản tiền và lý do kết thúc; kết quả hủy/hoàn thể hiện riêng với tiến độ thanh toán thực thi. |

### 5.5 Trao đổi

| Mã | Yêu cầu |
|---|---|
| FR-X01 | Member chọn một listing Exchange/Both của mình và một listing người khác để đề xuất; kiểm tra cả hai đủ điều kiện, không cùng chủ; Proposed không giữ chỗ. |
| FR-X02 | Hiển thị giá trị snapshot hai sách, bên bù, số bù, hai khoản cọc, phí tự chịu và deadline. Khoản bù không được nhập tùy ý. |
| FR-X03 | Recipient chấp nhận, từ chối hoặc đề xuất thay listing của mình bằng một listing khác đủ điều kiện; đề xuất đối ứng tạo revision mới và đổi bên chờ phản hồi. Không thương lượng thay giá trong revision mà bỏ qua duyệt listing. |
| FR-X04 | Chấp nhận phải khớp revision, kiểm tra lại hai listing rồi giữ đồng thời; thất bại một bên thì không giữ bên nào. Các đề xuất cạnh tranh bị đóng với lý do Unavailable. |
| FR-X05 | Từng bên nộp đủ cọc; bên bù nộp thêm tiền bù. Mỗi bên funding trọn nghĩa vụ của mình trong một lần; chưa đủ toàn giao dịch thì chưa cho tạo pickup hợp lệ. |
| FR-X06 | Hết POL-05 khi chưa đủ funding: hủy, hoàn từng khoản đã giữ đúng người, giải phóng reservation hợp lệ. Thanh toán đến muộn không hồi sinh Exchange. |
| FR-X07 | Khi đủ funding: DirectDelivery mở POL-06 và hai Shipment; ViaPoint mở POL-30 và intake hai cuốn, chỉ tạo Shipment cho các chặng chọn carrier. Hiển thị tiến độ hai cuốn và điểm. |
| FR-X08 | Mỗi bên nhận sách có hạn kiểm tra riêng; một bên nhận trước không làm hết quyền bên nhận sau; không hoàn cọc toàn giao dịch khi mới một chiều đủ điều kiện. |
| FR-X09 | Hoàn tất khi cả hai chiều hợp lệ, hết hai hạn kiểm tra và không tranh chấp: hoàn hai cọc, chuyển bù, đóng cả hai listing Exchanged. |
| FR-X10 | Không gửi, chỉ gửi một chiều, thất lạc, sai mô tả hoặc hoàn thất bại phải tạo/ghép dispute; giữ tiền và sách theo thực tế, không tự tịch thu cọc. |
| FR-X11 | Hủy trước funding hoặc khi funding chưa đủ và chưa pickup: bên tham gia được rút; hoàn khoản đã nộp, lưu sự kiện hủy; sau đủ funding cần cả hai đồng ý và chưa pickup, hoặc quyết định xử lý. |

### 5.6 Ví và rút tiền

| Mã | Yêu cầu |
|---|---|
| FR-W01 | Hiển thị available, tiền giữ giao dịch, tiền giữ rút và tổng nghĩa vụ với user; mỗi khoản giữ xem được giao dịch nguồn. |
| FR-W02 | Nạp mô phỏng có intent và sự kiện kết quả; chỉ ghi có khi adapter xác thực và đối chiếu đúng số tiền, VND, người nhận và intent; không tin kết quả trình duyệt tự gửi. |
| FR-W03 | Hold/release/refund/compensation/commission/withdrawal phải tạo bút toán cân bằng, bất biến, có business reference và khóa chống lặp. |
| FR-W04 | Lịch sử ví có lọc loại, ngày, mã giao dịch và số dư sau giao dịch; dữ liệu không được sửa trực tiếp từ màn hình quản trị. |
| FR-W05 | Yêu cầu rút ít nhất POL-15, không vượt available; snapshot thông tin nhận mô phỏng và chuyển ngay tiền vào withdrawal hold nguyên tử. |
| FR-W06 | Staff đối chiếu thông tin nếu được phân công; Admin duyệt/từ chối có lý do; không ai tự duyệt rút của mình. |
| FR-W07 | Duyệt không đồng nghĩa hoàn thành; simulator có thành công/thất bại/chưa rõ. Thành công đóng, thất bại đã xác minh hoàn hold, chưa rõ giữ Processing chờ đối soát. |
| FR-W08 | Worker đối soát hằng ngày và theo yêu cầu; phát hiện lệch thì mở cảnh báo và chặn quyết toán phần liên quan đến khi xác minh. |

### 5.7 Vận chuyển và hoàn hàng

| Mã | Yêu cầu |
|---|---|
| FR-S01 | DirectDelivery: Order một outbound, Exchange hai. ViaPoint: mỗi cuốn có tối đa hai chặng carrier (tới điểm/đến người nhận), tự mang/nhận dùng custody event. Return tạo hành trình mới tham chiếu chặng/receipt gốc, không ghi đè. |
| FR-S02 | Vận đơn gồm carrier, tracking code, người gửi/nhận snapshot, chiều vận chuyển, ảnh đóng gói và thời điểm sự kiện; mã không được gán cho hai Shipment khác nhau. |
| FR-S03 | Chỉ adapter hoặc Staff có bằng chứng mới ghi nhận pickup/delivered; Member được xác nhận mình đã nhận, không được phát carrier event. |
| FR-S04 | Xử lý webhook có xác thực, chống lặp và sự kiện sai thứ tự; sự kiện cũ không được lùi trạng thái đã đạt hoặc mở lại tiền đã quyết toán. |
| FR-S05 | Quá hạn pickup/giao mở tác vụ kiểm tra; nếu có bằng chứng xung đột hoặc sự kiện đến muộn thì giữ điều tra, không tự kết luận sách ở chủ. |
| FR-S06 | Đơn hoàn ghi người chịu phí, deadline, địa chỉ nhận hoàn, chứng từ và kết quả; thất bại/không hợp tác quay lại dispute, không tự báo đã trả. |

### 5.8 Tranh chấp và vi phạm

| Mã | Yêu cầu |
|---|---|
| FR-D01 | Người tham gia tạo khiếu nại loại không gửi, không nhận, sai sách, sai tình trạng, nghi mã giả, giao thất bại hoặc hoàn hàng; mỗi giao dịch có tối đa một dispute đang mở, bổ sung các claim hai chiều vào cùng hồ sơ. |
| FR-D02 | Khi nhận claim hợp lệ, giữ toàn bộ tiền chưa quyết toán của giao dịch, dừng auto-complete và ghi bằng chứng đầu vào; không mặc định freeze available của đối phương. |
| FR-D03 | Staff xem snapshot, ảnh, lịch sử shipment, chat liên quan và tiền; phân công rõ người phụ trách, yêu cầu bổ sung trong POL-09. |
| FR-D04 | Không phản hồi không tự mất cọc; người xử lý dựa trên bằng chứng hiện có, lưu phần thiếu và căn cứ. Có thông báo nội bộ trước khi hết hạn. |
| FR-D05 | Quyết định gồm loại kết luận, tình trạng từng hiện vật, phân bổ từng khoản tiền, ai trả/nhận hoàn và hạn thực hiện; kiểm tra tổng nguồn bằng tổng đích. |
| FR-D06 | Vượt POL-20, xung đột lợi ích, nghi gian lận nhiều giao dịch hoặc bồi thường thiếu nguồn thì escalate Admin. |
| FR-D07 | Cho một lần kháng nghị mỗi bên trong POL-10; gộp cùng hồ sơ, giữ tiền; Admin độc lập xét. Quyết định cuối hết hạn kháng nghị mới có hiệu lực thực thi. |
| FR-D08 | Chỉ đóng dispute sau khi thực thi nghĩa vụ tiền/hàng hoặc ghi rõ phần không thể thu hồi được Admin chấp nhận trong giới hạn phạm vi; không báo đã bồi thường phần chưa có nguồn. |
| FR-D09 | Ghi vi phạm từ sự kiện đã xác minh, chống đếm hai lần; đạt ngưỡng thì hạn chế giao dịch mới; Admin có thể gỡ với lý do và lịch sử. |

### 5.9 Đánh giá

| Mã | Yêu cầu |
|---|---|
| FR-R01 | Chỉ giao dịch Completed và trong POL-18 mới được tạo đánh giá; mỗi participant có một đánh giá cho giao dịch, không tạo lại để kéo dài hạn sửa. |
| FR-R02 | Buyer chấm chất lượng sách và đối tác; Seller chấm đối tác; Exchange mỗi bên chấm sách nhận và đối tác. Thang 1–5 nguyên; không ép Seller chấm chất lượng sách do Buyer không gửi sách ở Order. |
| FR-R03 | Chỉ công bố khi cả hai đã gửi và đều hết hạn sửa/xóa, hoặc khi đã hết hạn gửi và mọi đánh giá đã gửi đều hết hạn sửa/xóa. Trước đó chỉ tác giả thấy bản mình và hệ thống có quyền đọc theo nhiệm vụ. Không cho sửa điểm sau khi đã xem đánh giá đối phương. |
| FR-R04 | Cho sửa/xóa công khai trong POL-19, lưu revision; không cho xóa khi được giữ làm bằng chứng. Sau hạn khóa sửa; người bị đánh giá được một phản hồi, có kiểm duyệt. |
| FR-R05 | Staff ẩn nội dung vi phạm có lý do; điểm tổng tính từ đánh giá công khai hợp lệ, không bao gồm bị xóa/ẩn và không cộng kép các revision. |

### 5.10 Forum chat wishlist và thông báo

| Mã | Yêu cầu |
|---|---|
| FR-F01 | Member tạo topic/bình luận trong chuyên mục Admin quản lý; Guest chỉ đọc nội dung công khai. Nội dung có báo cáo vi phạm và lịch sử kiểm duyệt. |
| FR-F02 | Topic được gắn tối đa một listing của chính tác giả và một wanted_book; card đọc trạng thái live, không dùng giá sao chép trong text để checkout. |
| FR-F03 | Tạo listing trong trình soạn topic đi qua cùng kiểm duyệt; card chờ duyệt không lộ ảnh/mô tả chưa duyệt cho Guest, không có nút giao dịch. |
| FR-F04 | Listing Sold/Exchanged/Reserved/Hidden/Removed đổi card tương ứng, khóa nút; topic được giữ lịch sử và tác giả có thể đóng bình luận. |
| FR-F05 | Một topic không gắn lặp cùng listing; một listing có tối đa 3 topic đang mở của tác giả; kiểm tra chống spam và giới hạn đăng 5 topic/giờ. |
| FR-F06 | Phát hiện thông tin liên hệ/rao bán không gắn listing thì cảnh báo và đưa nội dung nghi vấn vào kiểm duyệt; không coi bộ lọc là bằng chứng gian lận tuyệt đối. |
| FR-M01 | Chat riêng giữa hai Member khác nhau, có ngữ cảnh listing/giao dịch; người ngoài không đọc được bằng cách đổi ID. Nội dung chat không thay điều khoản đã chốt. |
| FR-M02 | Hạn 20 tin/phút/user, tối đa 2.000 ký tự/tin; cho báo cáo, chặn chat mới; chặn không làm mất kênh nghĩa vụ của giao dịch đang mở. |
| FR-M03 | Staff chỉ đọc đoạn chat cần thiết của hồ sơ được phân công, có log truy cập; không có màn hình đọc toàn bộ chat mọi người mặc định. |
| FR-N01 | Wishlist theo book hoặc listing, có wants_exchange; Member thêm/xóa và tắt thông báo matching. |
| FR-N02 | Thông báo có listing đủ điều kiện khớp wanted/wishlist hoặc giá giảm sau duyệt; chống gửi lặp theo user, sự kiện và đối tượng. |
| FR-N03 | Thông báo nội bộ cho quyết định, hạn, tiền, shipment, ticket và kiểm duyệt; realtime là kênh bổ sung, hộp thư lưu bền là nguồn chính. Email lỗi không rollback giao dịch. |
| FR-N04 | Người dùng xem chưa đọc/đã đọc và mở đúng đối tượng được phép truy cập; thông báo không đưa địa chỉ, OTP hoặc dữ liệu bằng chứng ra công khai. |

### 5.11 Quản trị và tác vụ nền

| Mã | Yêu cầu |
|---|---|
| FR-G01 | Staff có hàng đợi listing, nội dung báo cáo, dispute và nhiệm vụ quá hạn; lọc theo trạng thái, thời gian và người phụ trách. |
| FR-G02 | Admin quản lý Staff, catalog, thể loại, banner, chuyên mục và chính sách có phiên bản; mọi đổi quyền/chính sách có audit. |
| FR-G03 | Dashboard tách giá trị giao dịch, hoa hồng thực nhận, số dư giữ, tiền hoàn, giao dịch thất bại và vi phạm; cọc/nạp ví không được tính doanh thu. |
| FR-G04 | Worker xử lý timeout, kiểm tra giao, kết thúc cửa sổ kiểm tra, công bố review, matching, thông báo và đối soát; có retry chống lặp và hàng đợi lỗi. |
| FR-G05 | Nhật ký tra theo actor, entity, transaction ID, event ID, thời gian và lý do; không ghi mật khẩu/token, không cho sửa/xóa bằng API thường. |
| FR-G06 | Có bộ dữ liệu demo và bảng điều khiển simulator cho phép tái hiện thành công, lỗi, lặp, chậm và sai thứ tự mà không đổi trực tiếp trạng thái cơ sở dữ liệu. |

## 6 Quy tắc nghiệp vụ

### 6.1 Sách và quyền giao dịch

| Mã | Quy tắc |
|---|---|
| BR-01 | Một listing đại diện một hiện vật; không có quantity lớn hơn 1. Một người có hai bản giống nhau phải tạo hai listing riêng với ảnh phân biệt. Hệ thống không thể tự chứng minh hai listing không chụp cùng hiện vật; nghi trùng chuyển kiểm duyệt. |
| BR-02 | Chỉ Approved + Visible + Available, không custody obligation và chủ đủ quyền mới tạo checkout/Exchange/auction intake mới. Auction chuyển commitment sẵn có sang Order theo FR-AU06–07, không yêu cầu listing trở lại Available. Mọi bước chốt kiểm tra điều kiện hiện hành. |
| BR-03 | Một listing tối đa một cam kết độc quyền Active xuyên Order, Exchange và AuctionIntake/Auction. Chuyển auction sang Order nguyên tử, không có khoảng trống release; database bảo vệ, không chỉ UI. |
| BR-04 | Chỉ giao dịch sở hữu reservation được giải phóng nó. Từ chối một Proposed không được mở sách đang giữ cho người khác. |
| BR-05 | Giữ hai listing Exchange là nguyên tử, dùng thứ tự khóa ổn định hoặc cơ chế tương đương để tránh giữ một nửa. |
| BR-06 | Không tự mua hoặc đổi với chính mình; không giao dịch trên listing không thuộc participant được chỉ định. |
| BR-07 | Snapshot giá, phí, ảnh, tình trạng, địa chỉ, policy và revision không đổi theo dữ liệu hiện tại. Thay đổi trọng yếu cần một thỏa thuận/giao dịch mới. |
| BR-08 | Hủy giao dịch không tự đặt Available. Chỉ mở nếu không có nghĩa vụ giữ khác, đã xác minh ở chủ và đủ kiểm duyệt; return thay đổi tình trạng phải duyệt lại. |
| BR-09 | Đầu sách/giá trị không có nguồn đáng tin phải được Staff xét, áp trần POL-16; không dùng trung bình listing cùng thể loại làm chuẩn chống gian lận. Giá bìa tự khai chỉ là thông tin tham khảo. |

### 6.2 Giao dịch và thời gian

| Mã | Quy tắc |
|---|---|
| BR-10 | Checkout giữ một listing trong POL-01; thêm giỏ, chat và Proposed không giữ sách. |
| BR-11 | Buyer hủy miễn phí khi AwaitingPayment hoặc PendingSellerConfirmation; sau Seller xác nhận cần đồng ý trước pickup hoặc quy trình dispute/return. |
| BR-12 | Deadline do máy chủ tính và snapshot; thời gian trình duyệt chỉ để hiển thị. Hết hạn không phụ thuộc worker đã chạy hay chưa. |
| BR-13 | Mọi lần chấp nhận đề xuất phải đúng revision; thay listing làm vô hiệu phiên bản cũ và chỉ bên đang chờ phản hồi được chấp nhận. |
| BR-14 | Exchange chỉ cho gửi sau đủ toàn bộ funding. Bên gửi sớm ngoài quy trình không làm hệ thống tự kích hoạt; phải điều tra và ghi nhận rủi ro do vi phạm quy trình. |
| BR-15 | Có tracking không đồng nghĩa pickup; có pickup không đồng nghĩa delivered; delivered không đồng nghĩa completed. |
| BR-16 | Hạn chất lượng bắt đầu từ lần nhận hợp lệ của từng chiều. Khi có hai nguồn nhận hợp lệ, dùng mốc nhận sớm nhất đã xác minh; không cho claim tự khai ngày quá khứ để rút ngắn quyền. |
| BR-17 | Không nhận hàng: được báo ngay khi carrier báo Delivered nhưng người nhận phủ nhận, hoặc khi vượt POL-07 từ pickup. Không chờ một mốc received không tồn tại. |
| BR-18 | Chỉ tự hoàn tất khi hết hạn kiểm tra, không dispute đang mở, không điều tra/return và chưa quyết toán. Worker phải kiểm tra lại tất cả trong giao dịch dữ liệu. |
| BR-19 | Với Exchange, cả hai chiều và hai cửa sổ kiểm tra phải đạt trước khi release; im lặng từ ngày gửi không đủ điều kiện. |

### 6.3 Tiền

| Mã | Quy tắc |
|---|---|
| BR-20 | VND lưu số nguyên đồng. Hoa hồng làm tròn nửa lên tới đồng; không dùng floating point cho phép tính tiền. |
| BR-21 | Order DirectDelivery hold P+S, Seller ứng S và nhận hoàn ứng khi quyết toán; ship không chịu commission. ViaPoint hold P, ship theo từng leg/payer ở hold riêng, không hoàn ship cho Seller lần nữa. Chi tiết FR-H01–03. |
| BR-22 | Tiền bù Δ bằng trị tuyệt đối chênh giá trị hai sách; bên sách giá trị thấp trả bên cao. Δ không âm và không nhập tay. |
| BR-23 | Deposit_A = rate × V_B; Deposit_B = rate × V_A. Deposit không là doanh thu; không giảm vì uy tín ở phiên bản M. |
| BR-24 | Cọc, bù, tiền Order, commission, refund và withdrawal hold có loại/mục đích riêng. Không sử dụng hold của giao dịch khác để bù thiếu. |
| BR-25 | Mỗi thao tác tiền cần khóa chống lặp duy nhất theo loại nghiệp vụ và đối tượng; callback lặp trả kết quả đã xử lý. |
| BR-26 | Không cho available âm hoặc tổng phân bổ vượt nguồn giữ. Hai thao tác chi/rút đồng thời phải kiểm tra và cập nhật nguyên tử. |
| BR-27 | Tiền đến muộn không tạo reservation mới hoặc mở lại giao dịch cũ. Nạp ví hợp lệ vẫn ghi có available; thanh toán trực tiếp mở rộng phải hoàn/đối soát riêng. |
| BR-28 | Quyết định hoàn không đồng nghĩa hoàn xong; giao diện phân biệt Requested, Processing, Completed, Failed/ReviewRequired. |
| BR-29 | Chưa rõ kết quả chuyển tiền thì không được tự hoàn available và thử lại với lệnh mới; phải đối soát theo cùng tham chiếu. |
| BR-30 | Phí của giao dịch hủy trước pickup bằng 0; hoàn P + S nếu đã thu. Hoàn một phần sau giao tính commission trên phần tiền sách Seller thực giữ. |

### 6.4 Khiếu nại và quản trị

| Mã | Quy tắc |
|---|---|
| BR-31 | Dispute giữ tiền giao dịch, không mặc định freeze toàn ví. Freeze tài khoản vì điều tra gian lận là quyết định Admin riêng có phạm vi, lý do và thời hạn xem lại. |
| BR-32 | Thiếu tracking/thiếu phản hồi không tự đồng nghĩa gian lận hoặc mất toàn cọc; phải xác minh và ra quyết định có căn cứ. |
| BR-33 | Một dispute có thể chứa nhiều claim của cả hai bên; settlement cuối không được trả/bồi thường hai lần cho cùng tổn thất. |
| BR-34 | Quyết định phải chỉ rõ custody của từng sách, tiền hoàn, bồi thường, phí hoàn, nguồn chi và số còn lại; mỗi khoản không đủ nguồn được ghi rõ, không ghi có giả. |
| BR-35 | Staff không xử lý hồ sơ của mình; vượt thẩm quyền phải escalate. Admin giải kháng nghị không được là người ra quyết định ban đầu. |
| BR-36 | Chỉ thực thi quyết định sau hết hạn kháng nghị hoặc có quyết định cuối của người độc lập; nghĩa vụ trả hàng bắt đầu tại thời điểm quyết định có hiệu lực. |
| BR-37 | Không sửa/xóa chứng cứ gốc; có thể bổ sung phiên bản hoặc hạn chế hiển thị. Log ai xem/tải bằng chứng. |
| BR-38 | Vi phạm phải có kết luận hoặc sự kiện timeout xác định không lỗi hệ thống; callback lặp không tăng đếm; khi kết luận bị đảo phải thu hồi strike liên quan. |
| BR-39 | Sửa chính sách không hồi tố nghĩa vụ tiền/deadline; mọi ngoại lệ được phép phải là quyết định có thẩm quyền, không sửa cột dữ liệu trực tiếp. |

### 6.5 Cộng đồng và đánh giá

| Mã | Quy tắc |
|---|---|
| BR-40 | Review chỉ từ participant của giao dịch Completed; đơn hủy không tạo review nhưng vẫn có thể ghi vi phạm xác minh. |
| BR-41 | Một review/giao dịch/reviewer, kể cả đã xóa công khai; hạn sửa không đặt lại. Revision và bản dùng làm chứng cứ được giữ. |
| BR-42 | Forum card live phục vụ khám phá; snapshot giao dịch phục vụ cam kết. Không sử dụng forum text/chat để thay giá thanh toán đã chốt. |
| BR-43 | Listing gắn forum phải thuộc tác giả; wanted_book là catalog có thể không thuộc tác giả. Card Removed không tiết lộ nội dung bị gỡ. |
| BR-44 | Nội dung liên hệ ngoài sàn được cảnh báo/kiểm duyệt, không cam kết chặn được mọi cách lách. Thông tin giao hàng hợp lệ nằm trong giao dịch riêng, không bị bộ lọc forum xóa. |
| BR-45 | Thông báo lỗi không rollback tiền/sách. Trạng thái nghiệp vụ và hộp thư lưu bền phải khôi phục được việc gửi sau khi dịch vụ hoạt động trở lại. |
| BR-46 | Chỉ mở địa chỉ nhận cho Seller sau khi nhận Order; chỉ mở địa chỉ hai bên Exchange khi đủ funding. Thông tin cần thiết cho carrier nằm trong Shipment, không đưa lên trang công khai. |
| BR-47 | Đổi địa chỉ sau giao kết không tự sửa Shipment. Trước pickup, các bên xác nhận yêu cầu đổi và báo giá lại nếu có; phạm vi M chọn hủy an toàn và tạo giao dịch mới nếu địa chỉ hoặc phí thay đổi. Sau pickup phải xử lý qua hỗ trợ carrier và có audit. |

## 7 Mô hình trạng thái

### 7.1 Nguyên tắc chung

Một trạng thái chỉ mô tả một khía cạnh. Không dùng trạng thái Order để suy ra thanh toán đã thực thi, hoặc trạng thái listing để suy ra sách đang ở đâu. Mỗi chuyển tiếp lưu trạng thái trước/sau, actor, event ID, timestamp, revision và lý do. Các chuyển tiếp không được liệt kê phải bị từ chối hoặc đi qua hồ sơ xử lý có thẩm quyền. Gửi lặp đúng một thao tác đã thành công trả lại kết quả cũ; không tạo transition thứ hai.

### 7.2 Listing

Listing có ba chiều trạng thái (Auction có state riêng; Reserved dùng cam kết độc quyền, xem mô hình bổ sung): `moderation_status` = Draft/PendingReview/Approved/Rejected; `visibility_status` = Visible/Hidden/Removed; `trade_status` = Available/Reserved/Sold/Exchanged/ClosedUnavailable. Khả năng giao dịch là kết quả kiểm tra cả ba chiều, không chỉ một trường. Nháp có trade_status Available nhưng không hiển thị hay giao dịch được vì chưa Approved.

| Trước | Sự kiện và điều kiện | Sau | Hệ quả |
|---|---|---|---|
| Draft/Rejected | Chủ gửi đủ dữ liệu | PendingReview | Chưa công khai nội dung chưa duyệt |
| PendingReview | Staff chấp thuận, không tự duyệt | Approved | Cho hiển thị nếu Visible và chủ đủ quyền |
| PendingReview | Staff từ chối có lý do | Rejected | Cho sửa và gửi lại |
| Approved, không reserved | Sửa trường trọng yếu | PendingReview | Tăng revision, ngừng nhận giao dịch |
| Available, đủ điều kiện | Checkout/chấp nhận Exchange thắng cạnh tranh | Reserved | Tạo reservation Active |
| Reserved | Hủy an toàn, có custody OwnerConfirmed, duyệt còn hiệu lực | Available | Chỉ giải phóng đúng reservation |
| Reserved | Order quyết toán, sách ở Buyer | Sold | Đóng reservation, cấm tái sử dụng listing |
| Reserved | Exchange quyết toán thành công hai chiều | Exchanged | Đóng hai reservation |
| Reserved | Giải quyết mất/không thể thu hồi hiện vật | ClosedUnavailable | Closure reason, không công khai nút giao dịch |
| Reserved | Nhận hoàn, tình trạng thay đổi | Available + PendingReview | Chưa giao dịch lại cho đến khi duyệt |
| Visible | Chủ ẩn, chưa reserved | Hidden | Không nhận giao dịch mới |
| Hidden | Chủ mở, chưa có hạn chế | Visible | Vẫn phải đủ duyệt và Available |
| Visible/Hidden | Staff gỡ có lý do | Removed | Nếu có giao dịch thì mở xử lý riêng |

Custody dùng OwnerConfirmed, CarrierInbound, AtPoint, CarrierOutbound, RecipientConfirmed, Returning, Unknown, Lost. CounterpartyConfirmed/CarrierReturn của bản1.0 được chuẩn hóa thành RecipientConfirmed/Returning. Giá trị do sự kiện/bằng chứng xác minh cập nhật, không tự do cho Member chọn. Sách đã Sold/Exchanged nếu chủ mới muốn bán lại phải tạo listing mới; lịch sử cũ không chuyển chủ và không được sửa.

### 7.3 Order

Bảng sau giữ luồng DirectDelivery. ViaPoint dùng `Fulfilling` cho tiếp nhận/kiểm tra/
chờ bàn giao thay vì gọi mọi bước là InTransit; Order từ auction bỏ SellerConfirmation.
Ánh xạ đầy đủ ở [mô hình1.1](features/LOCAL_TRANSACTION_DESIGN.md).

| Trước | Sự kiện | Điều kiện | Sau |
|---|---|---|---|
| Không có | Checkout | Listing đủ điều kiện, giữ chỗ thành công | AwaitingPayment |
| AwaitingPayment | Thanh toán ví | Chưa hết hạn, đủ available, hold nguyên tử | PendingSellerConfirmation |
| AwaitingPayment | Buyer hủy/hết hạn | Chưa thanh toán thành công | Cancelled |
| PendingSellerConfirmation | Seller nhận đơn | Đúng Seller, trước deadline | Preparing |
| PendingSellerConfirmation | Buyer hủy/Seller từ chối/hết hạn | Chưa được xác nhận, không xung đột dữ liệu | SettlementPending |
| Preparing | Pickup xác minh | Funding đủ, vận đơn đúng | InTransit |
| Preparing | Hủy hai bên/không pickup đã xác minh | Sách chưa rời chủ, hoàn hợp lệ | SettlementPending |
| Preparing/InTransit | Có nghi vấn hoặc khiếu nại hợp lệ | Tạo dispute/điều tra | ResolutionPending |
| InTransit | Delivered/Buyer nhận hợp lệ | Gắn đúng Shipment, không có dispute | Inspection |
| Inspection | Mở dispute đúng hạn | Claim hợp lệ | ResolutionPending |
| Inspection | Hết hạn kiểm tra | Không cờ giữ/return/dispute | SettlementPending |
| ResolutionPending | Quyết định cuối đã thực hiện phần hàng | Đủ điều kiện phân bổ tiền | SettlementPending |
| SettlementPending | Settlement thành công | outcome là thành công/giữ hàng sau hoàn một phần | Completed |
| SettlementPending | Settlement thành công | outcome là hủy trước giao | Cancelled |
| SettlementPending | Settlement thành công | outcome là hoàn trả/hoàn toàn bộ theo xử lý | ClosedAfterResolution |

`cancellation_reason`, `resolution_outcome` và `resume_stage` lưu riêng. SettlementPending phải có target outcome trước khi thực thi. Lỗi ghi sổ giữ nguyên trạng thái, mở retry/đối soát; không tạo Completed giả. Order ClosedAfterResolution không có review theo FR-R01; vi phạm và quyết định vẫn hiển thị cho participant.

### 7.4 Exchange

Bảng sau giữ luồng DirectDelivery. ViaPoint dùng Preparing → Fulfilling → Inspection,
với barrier hai report/hai acceptance theo FR-H10; các outcome tiền giữ cùng nghĩa.

| Trước | Sự kiện | Điều kiện | Sau |
|---|---|---|---|
| Không có | Tạo đề xuất | Hai listing đủ điều kiện | Proposed |
| Proposed | CounterOffer | Đúng bên phản hồi, thay listing hợp lệ | Proposed với revision mới |
| Proposed | Từ chối/rút/hết hạn | Đúng quyền và revision | Rejected/Cancelled/Expired |
| Proposed | Chấp nhận | Giữ nguyên tử hai listing | AcceptedAwaitingFunding |
| Proposed | Listing không còn đủ điều kiện | Giao dịch khác giữ hoặc nội dung đổi | ClosedUnavailable |
| AcceptedAwaitingFunding | Đủ funding | Hai cọc và Δ đều đủ | Preparing |
| AcceptedAwaitingFunding | Hủy/hết hạn | Không pickup hợp lệ | SettlementPending |
| Preparing | Một Shipment pickup | Có funding, đúng event | InTransit |
| Preparing/InTransit | Thiếu pickup/quá hạn/sự cố/claim | Có căn cứ mở xử lý | ResolutionPending |
| InTransit | Cả hai đã nhận hợp lệ | Không dispute | Inspection |
| Inspection | Có claim hợp lệ | Trong hạn của chiều liên quan | ResolutionPending |
| Inspection | Hết cả hai hạn kiểm tra | Không dispute/return/hold | SettlementPending |
| ResolutionPending | Xong nghĩa vụ hàng theo quyết định | Phương án tiền đã hiệu lực | SettlementPending |
| SettlementPending | Settlement thành công | Hai bên giữ sách đổi, giao dịch được duy trì | Completed |
| SettlementPending | Settlement thành công | Hủy trước pickup | Cancelled |
| SettlementPending | Settlement thành công | Đảo giao dịch hoặc bồi thường thay hoàn | ClosedAfterResolution |

Ngay khi một chiều Delivered, thời hạn kiểm tra chiều đó đã bắt đầu, dù trạng thái tổng vẫn InTransit. Claim chất lượng của chiều này được tạo trong InTransit. Các nhãn BothShipped/BothDelivered trên giao diện là dữ liệu suy ra từ Shipment, không phải điều kiện thay thế cho kiểm tra từng chiều.

### 7.5 Shipment và Return

State machine Shipment áp dụng từng chặng carrier. SelfDropoff/SelfCollect dùng receipt custody, không tạo tracking giả. ViaPoint/Auction có state machine ở [thiết kế logic](features/LOCAL_TRANSACTION_DESIGN.md); không dùng Delivered tới điểm làm mốc inspection của Buyer.

| Trước | Sự kiện | Sau | Điều kiện kiểm soát |
|---|---|---|---|
| Pending | Tạo tracking | LabelCreated | Carrier + code duy nhất |
| LabelCreated | Pickup xác minh | PickedUp | Đã đủ tiền, đúng chiều và người gửi |
| PickedUp | Carrier bắt đầu chuyển | InTransit | Không lùi về LabelCreated |
| PickedUp/InTransit | Giao hợp lệ | Delivered | Lưu thời điểm và nguồn xác nhận |
| InTransit | Giao không thành công | DeliveryFailed | Không coi là Delivered; lần giao lại giữ lịch sử |
| DeliveryFailed | Thử giao lại | InTransit | Có event mới, tối đa 2 lần thử trong simulator |
| PickedUp/InTransit/DeliveryFailed | Carrier xác minh thất lạc | Lost | Tạo/ghép dispute |
| Pending/LabelCreated | Hủy trước pickup đã xác minh | Cancelled | Không có dữ liệu carrier mâu thuẫn |

ReturnRequest: Requested → Authorized → AwaitingPickup → InTransit → Received → Inspected → Closed. Rejected dành cho yêu cầu không được chấp thuận; Overdue/Failed mở lại phần thực hiện dispute. Return Shipment dùng cùng state machine Shipment và `direction=Return`. Delivered return chưa đủ để niêm yết lại nếu chưa kiểm tra tình trạng.

### 7.6 Payment Refund Withdrawal và Dispute

| Đối tượng | Trạng thái | Nguyên tắc |
|---|---|---|
| TopupIntent | Pending → Processing → Succeeded/Failed; ReviewRequired khi dữ liệu mâu thuẫn | Chỉ Succeeded ghi có một lần; hết hạn UI không phủ nhận sự kiện nạp thật hợp lệ |
| WalletPayment | Created → Held hoặc Rejected | Debit available và tạo hold trong một giao dịch dữ liệu; không tồn tại nửa thanh toán |
| Refund | Requested → Processing → Completed; Failed/ReviewRequired nếu thực thi lỗi | Hoàn nội bộ thành công cùng bút toán; lỗi retry cùng mã |
| Withdrawal | Requested → Approved → Processing → Completed | Từ Requested/Approved có thể Rejected nếu chưa gửi lệnh; Processing không hủy khi kết quả chưa rõ |
| Withdrawal lỗi | Processing → FailedVerified → Refunding → Refunded | Chỉ trả available sau xác minh không chi; trạng thái Failure không tự ghi có |
| Dispute | Open → InReview → AwaitingEvidence → DecisionIssued | Có thể lặp InReview/AwaitingEvidence có hạn; không xóa lịch sử |
| Dispute kháng nghị | DecisionIssued → Appealed → FinalDecisionIssued | Admin độc lập; không có vòng kháng nghị tự động thứ hai |
| Dispute thực thi | DecisionIssued/FinalDecisionIssued → Executing → Closed | Chờ quyết định hiệu lực; Executing có AwaitingReturn substage và settlement |

Escalation là thuộc tính người/nhóm thẩm quyền và audit event, không làm mất tiến độ hồ sơ. Khi bác claim mà giao hàng vẫn đang tiếp tục, Dispute có thể Closed sau quyết định có hiệu lực; transaction quay về `resume_stage` suy ra từ Shipment, giữ escrow đến khi đủ điều kiện bình thường. Với quyết định có tiền/hoàn hàng, giữ Dispute Executing đến khi thực thi xong.

## 8 Đặc tả use case

Mỗi use case dưới đây xác định trigger, tiền điều kiện, luồng chính, ngoại lệ và hậu điều kiện. Các biểu mẫu phải hiển thị lỗi cụ thể có thể sửa, không chỉ “Thao tác thất bại”. Mọi quyền và điều kiện được kiểm tra lại ở máy chủ.

### UC-01 Đăng ký và xác minh

**Actor:** Guest. **Trigger:** gửi biểu mẫu đăng ký. **Tiền điều kiện:** chưa có tài khoản cùng email chuẩn hóa.

1. Guest nhập email, mật khẩu và tên hiển thị, chấp nhận quy tắc sử dụng mô phỏng.
2. Hệ thống kiểm tra dữ liệu, tạo tài khoản Unverified và token xác minh.
3. Hệ thống gửi email; Guest mở liên kết trong hạn.
4. Hệ thống tiêu thụ token một lần, đặt tài khoản Active, ghi audit.

**Ngoại lệ:** email trùng trả hướng dẫn đăng nhập/khôi phục không tiết lộ dữ liệu; token hết hạn cho gửi lại; email lỗi giữ Unverified và có retry. **Hậu điều kiện:** chỉ tài khoản đã xác minh mới đăng listing/chat/giao dịch. **Liên kết:** FR-A01–A04, AC-01.

### UC-02 Đăng và duyệt listing

**Actor:** Member, Staff. **Tiền điều kiện:** Member Active, không bị hạn chế giao dịch mới.

1. Chọn book được xác nhận hoặc đề nghị catalog mới.
2. Nhập chế độ, giá, tình trạng, lỗi cụ thể, ảnh; lưu Draft.
3. Gửi duyệt; hệ thống kiểm tra dữ liệu và đặt PendingReview.
4. Staff không xung đột lợi ích xem checklist: nội dung phù hợp, ảnh rõ, mô tả đủ, giá trong trần, catalog đúng.
5. Staff duyệt hoặc từ chối có lý do. Khi duyệt, hệ thống công khai nếu đủ điều kiện và phát matching.

**Ngoại lệ:** catalog chưa duyệt giữ chờ; ảnh lỗi không gửi; giá bất thường yêu cầu chứng cứ/giải thích, không tự sửa giá thay user. **Hậu điều kiện:** chỉ phiên bản đã duyệt được giao dịch. **Liên kết:** FR-C01–C03, FR-L01–L08, AC-04–AC-06.

### UC-03 Tìm và checkout

**Actor:** Buyer. **Trigger:** chọn mua listing từ tìm kiếm, giỏ hoặc forum card.

1. Hệ thống mở listing hiện hành và kiểm tra chế độ mua.
2. Buyer chọn một listing, địa chỉ; hệ thống hiển thị P, S, tổng và hạn dự kiến.
3. Buyer xác nhận tạo Order. Hệ thống kiểm tra giá/revision và điều kiện listing.
4. Trong một giao dịch dữ liệu, tạo Order snapshot, reservation Active và deadline.
5. Hiển thị trang thanh toán đếm thời gian từ deadline máy chủ.

**Ngoại lệ:** giá/phiên bản đổi yêu cầu xem lại, không thu theo giá bất ngờ; bị giữ thì báo không còn khả dụng; tự mua bị từ chối; hết hạn ở tab cũ không tạo thanh toán. **Hậu điều kiện:** tối đa một Buyer có reservation. **Liên kết:** FR-O01–O03, BR-03/10, AC-07–AC-09.

### UC-04 Thanh toán và xác nhận Order

**Actor:** Buyer, Seller. **Tiền điều kiện:** Order AwaitingPayment còn hạn.

1. Buyer bấm trả bằng ví, gửi idempotency key.
2. Hệ thống xác minh available và reservation; trừ available, tạo hold P + S và đổi trạng thái cùng một commit.
3. Thông báo Seller; đặt hạn xác nhận từ thời điểm thanh toán thành công.
4. Seller nhận hoặc từ chối. Nhận đơn mở hạn pickup; từ chối tạo hoàn và đóng theo tiến độ thực thi.

**Ngoại lệ:** thiếu số dư không ghi sổ một phần; click lặp không trừ hai lần; Buyer hủy đồng thời Seller nhận thì xử lý theo commit hợp lệ đầu tiên; quá hạn xác nhận hủy và hoàn. **Hậu điều kiện:** tiền chỉ ở available hoặc đúng hold, không bị mất giữa hai nơi. **Liên kết:** FR-O03–O05, FR-W03, AC-10–AC-12.

### UC-05 Giao và hoàn tất Order

**Actor:** Seller, Carrier Simulator, Buyer, System. **Tiền điều kiện:** đã xác nhận và giữ đủ tiền.

1. Seller tạo Shipment có mã và ảnh đóng gói; simulator xác nhận pickup.
2. Hệ thống chuyển InTransit, cập nhật custody và thời hạn giao.
3. Carrier báo giao hoặc Buyer xác nhận nhận hợp lệ; hệ thống mở hạn kiểm tra.
4. Buyer xem sách và có thể tạo claim trong hạn.
5. Hết hạn, worker kiểm tra không dispute và phân bổ tiền theo mục 9; đặt Completed và Sold.

**Ngoại lệ:** không pickup mở xác minh; mã giả/lost/không nhận chuyển UC-10; sai thứ tự event không lùi trạng thái; tiền quyết toán lỗi giữ SettlementPending. **Hậu điều kiện:** chỉ tiền đã quyết toán mới vào available Seller. **Liên kết:** FR-O06–O10, FR-S01–S05, AC-13–AC-16.

### UC-06 Đề xuất và thương lượng đổi

**Actor:** Initiator, Recipient. **Tiền điều kiện:** hai listing cho đổi, khác chủ, đủ điều kiện.

1. Initiator chọn sách mình và sách Recipient, xem Δ, hai cọc và điều kiện.
2. Gửi Proposed, chưa giữ sách.
3. Recipient từ chối, chấp nhận hoặc thay sách của mình bằng listing khác để counteroffer.
4. Counteroffer tạo revision mới; bên kia phải phản hồi revision đó, deadline phản hồi đặt lại.
5. Khi chấp nhận, hệ thống kiểm tra lại mọi điều kiện, giữ cả hai nguyên tử và đóng đề xuất cạnh tranh.

**Ngoại lệ:** một listing đã bị checkout thì accept thất bại cả hai; revision cũ trả Conflict; chủ sửa giá phải chờ duyệt lại, đề xuất cũ đóng Unavailable. **Hậu điều kiện:** một Exchange giữ được hai cuốn hoặc không giữ cuốn nào. **Liên kết:** FR-X01–X04, AC-17–AC-20.

### UC-07 Nộp cọc và bù tiền

**Actor:** Hai participant. **Tiền điều kiện:** AcceptedAwaitingFunding còn hạn.

1. Hệ thống hiển thị nghĩa vụ từng bên theo snapshot.
2. Từng bên xác nhận nộp trọn nghĩa vụ bằng available; hệ thống tạo các hold riêng cho deposit và Δ.
3. Khi tất cả hold đủ, DirectDelivery mở Preparing/hai Shipment và hạn pickup; ViaPoint mở intake hai cuốn theo POL-30 và các chặng đã chọn, không bắt tạo Shipment khi tự mang.
4. Nếu thiếu đến deadline hoặc hủy đúng điều kiện, tạo refund từng khoản và giải phóng reservation an toàn.

**Ngoại lệ:** thiếu available không nộp một phần; nộp lặp không hold thêm; bên đầu nộp nhưng bên sau im lặng được hoàn khi hết hạn; nạp ví đến sau hạn chỉ tăng available, không tự tài trợ Exchange đã hủy. **Hậu điều kiện:** chưa đủ funding thì chưa gửi trong hệ thống. **Liên kết:** FR-X05–X07/11, AC-21–AC-23.

### UC-08 Giao và hoàn tất trao đổi

**Actor:** Hai participant, Carrier Simulator, System. **Tiền điều kiện:** đủ funding.

1. DirectDelivery: mỗi bên tạo vận đơn, ảnh và giao carrier trước hạn. ViaPoint: mỗi bên thực hiện inbound theo kế hoạch đã chốt.
2. DirectDelivery theo dõi hai Shipment độc lập; ViaPoint thực hiện UC-H03–06 và barrier hai cuốn/hai acceptance trước release.
3. Mỗi bên nhận tạo mốc nhận và cửa sổ kiểm tra riêng, cho claim dù bên kia chưa nhận.
4. Cả hai cửa sổ hết hạn không dispute: hoàn hai deposit, chuyển Δ cho payee, đóng hai listing Exchanged.

**Ngoại lệ:** chỉ một bên gửi thì giữ toàn bộ hold, mở dispute, tổ chức hoàn; một bên nhận trước không làm hết quyền của bên nhận sau; không auto-release từ ngày gửi. **Hậu điều kiện:** Completed chỉ sau hai chiều và tiền đều hợp lệ. **Liên kết:** FR-X08–X10, AC-24–AC-26.

### UC-09 Hủy và xử lý quá hạn

**Actor:** Participant, System. **Tiền điều kiện:** giao dịch ở trạng thái cho phép hủy hoặc đã đến deadline.

1. Hệ thống đọc trạng thái, revision, event carrier và số tiền đang giữ.
2. Nếu chưa pickup và hủy đủ quyền, tạo settlement hoàn và đánh dấu hủy đang thực thi.
3. Nếu có pickup/bằng chứng xung đột, mở điều tra; không mở listing ngay.
4. Hoàn tiền thành công, chỉ release reservation khi custody cho phép; ghi lý do và vi phạm nếu đủ căn cứ.

**Ngoại lệ:** tác vụ lặp không hoàn thêm; callback pickup muộn sau hủy được mở incident và giữ listing khỏi giao dịch mới nếu còn có thể; không tự thu hồi tiền đã hoàn từ ví khác. **Hậu điều kiện:** sách và tiền không bị “đảo” chỉ bằng đổi nhãn trạng thái. **Liên kết:** FR-G04, BR-08/12/27, AC-27–AC-29.

### UC-10 Mở khiếu nại

**Actor:** Participant hoặc System phát hiện sự cố. **Tiền điều kiện:** giao dịch liên quan và cửa sổ/điều kiện claim phù hợp.

1. Người dùng chọn loại, chiều shipment, mô tả và bằng chứng đang có.
2. Máy chủ kiểm tra thời hạn và quyền; tạo/ghép claim vào dispute chung trong cùng commit với cờ dừng settlement.
3. Hold liên quan tiếp tục giữ; các bên nhận thông báo và Staff được phân công.
4. Hệ thống snapshot dữ liệu giao dịch và chứng cứ gốc; Staff có thể yêu cầu bổ sung.

**Ngoại lệ:** claim không nhận chưa tới điều kiện thì cho gửi yêu cầu hỗ trợ, không tịch thu tiền; claim quá hạn chuyển hỗ trợ đặc biệt có Admin xem nhưng không tự đảo settlement; upload lỗi cho giữ claim hợp lệ ở trạng thái chờ bổ sung nếu mô tả đủ. **Hậu điều kiện:** ticket hợp lệ không bị bỏ qua bởi worker giải ngân đồng thời. **Liên kết:** FR-D01–D04, AC-30–AC-32.

### UC-11 Quyết định và kháng nghị

**Actor:** Staff, Admin, participant. **Tiền điều kiện:** dispute được phân công, không xung đột lợi ích.

1. Staff tổng hợp chứng cứ hai bên và carrier; xác định nguyên nhân, custody và thiệt hại.
2. Lập quyết định dự thảo theo một mẫu settlement được hỗ trợ, ghi khoản tiền, nguồn, đích, return và lý do.
3. Hệ thống kiểm tra hạn mức, cân bằng và không bồi thường trùng; vượt hạn chuyển Admin.
4. Phát DecisionIssued trong hộp thư; mở 48 giờ kháng nghị, tiền vẫn giữ.
5. Nếu có kháng nghị, Admin độc lập rà soát và ra FinalDecisionIssued. Nếu không, quyết định có hiệu lực sau hạn.
6. Thực thi return trước nếu quyết định yêu cầu, sau đó settlement; đóng khi đã đối chiếu.

**Ngoại lệ:** không phản hồi vẫn xét bằng chứng hiện có; không có người độc lập thì chờ phân công; thiếu nguồn chi thì sửa phương án hoặc ghi phần chưa bồi thường có Admin xác nhận, không ghi có giả. **Hậu điều kiện:** quyết định và việc thực thi có dấu vết riêng. **Liên kết:** FR-D05–D08, AC-33–AC-35.

### UC-12 Trả hàng

**Actor:** Người đang giữ sách, người nhận hoàn, Carrier Simulator. **Tiền điều kiện:** quyết định hoàn có hiệu lực.

1. Chốt địa chỉ, người trả phí và hạn pickup return.
2. Người trả lập vận đơn mới, ảnh tình trạng và đóng gói; carrier pickup.
3. Người nhận hoàn hoặc carrier xác nhận nhận; người nhận có 48 giờ kiểm tra tình trạng hoàn.
4. Không có phản đối hợp lệ thì xác nhận nghĩa vụ hàng; chạy phân bổ tiền theo quyết định.
5. Listing chỉ trở lại giao dịch sau xác minh custody và duyệt lại nếu tình trạng thay đổi.

**Ngoại lệ:** người nhận hoàn im lặng nhưng carrier có giao hợp lệ thì hết 48 giờ coi là nhận hoàn; phản đối sai sách/hư hỏng, lost hoặc không pickup mở phần xử lý thực thi của dispute, không tạo vòng kháng nghị vô hạn. **Hậu điều kiện:** không dùng một lời khai “đã trả” để release tiền. **Liên kết:** FR-S06, BR-08/34, AC-36–AC-37.

### UC-13 Nạp ví và rút tiền

**Actor:** Member, Admin, Payment Simulator. **Tiền điều kiện:** tài khoản đủ quyền.

1. Nạp: tạo intent → simulator phát kết quả → xác thực và ghi có một lần.
2. Rút: nhập số tiền và thông tin nhận mô phỏng → hệ thống kiểm tra và chuyển available sang withdrawal hold.
3. Admin độc lập kiểm tra, duyệt hoặc từ chối; từ chối hoàn hold.
4. Được duyệt thì gửi lệnh simulator và chuyển Processing.
5. Thành công ghi payout; thất bại chắc chắn hoàn; chưa rõ thì đối soát cùng tham chiếu.

**Ngoại lệ:** hai lệnh rút đồng thời không làm âm ví; webhook sai tiền/chữ ký vào ReviewRequired; Admin click hoàn thành không thay được chứng từ simulator. **Hậu điều kiện:** tổng nguồn/đích cân bằng. **Liên kết:** FR-W01–W08, AC-38–AC-41.

### UC-14 Đánh giá giao dịch

**Actor:** Participant. **Tiền điều kiện:** Completed, trong 168 giờ và chưa có review.

1. Chọn điểm phù hợp vai và nội dung; hệ thống gắn transaction, reviewer và đối tác.
2. Lưu bản chưa công bố; chỉ công bố khi cả hai đã gửi và hết quyền sửa/xóa, hoặc đã hết hạn gửi và mọi review hiện có đều hết quyền sửa/xóa. Review tạo sát cuối hạn gửi có thể được công bố tối đa 48 giờ sau hạn gửi.
3. Tác giả sửa/xóa công khai trong 48 giờ từ lúc tạo, nếu không bị giữ làm bằng chứng.
4. Staff ẩn vi phạm; hệ thống tính lại điểm từ bản công khai hiện hành.

**Ngoại lệ:** đơn hủy không đánh giá; xóa không tạo quyền gửi lại; ảnh chứng cứ không tự công khai trong review. **Hậu điều kiện:** không cộng hai lần và không lộ đánh giá bên kia quá sớm. **Liên kết:** FR-R01–R05, AC-42–AC-43.

### UC-15 Tương tác cộng đồng

**Actor:** Guest, Member, Staff. **Tiền điều kiện:** thao tác viết yêu cầu Member đủ quyền.

1. Member tạo topic, gắn listing của mình và/hoặc wanted_book.
2. Hệ thống kiểm tra nội dung, chống spam; card phản ánh trạng thái live, chưa duyệt thì placeholder.
3. Người đọc mở mua/đổi từ card đi qua UC-03 hoặc UC-06; không giao dịch trực tiếp trong text.
4. Wishlist/wanted khớp listing mới thì gửi một thông báo theo sự kiện.
5. Chat và báo cáo nội dung đi qua kiểm tra participant, rate limit và kiểm duyệt.

**Ngoại lệ:** gắn listing người khác bị chặn; listing Removed giữ topic nhưng không lộ nội dung bị gỡ; chặn chat không chặn kênh giao dịch đang có nghĩa vụ. **Hậu điều kiện:** tương tác không vượt rào nghiệp vụ. **Liên kết:** FR-F01–F06, FR-M01–M03, FR-N01–N04, AC-44–AC-46.

### UC-16 Quản trị và đối soát

**Actor:** Admin, System. **Tiền điều kiện:** xác thực quyền vận hành.

1. Admin xem tổng hợp theo thời gian và drill-down giao dịch nguồn.
2. Thay chính sách tạo phiên bản mới, kiểm tra miền giá trị và thời điểm hiệu lực.
3. Worker đối soát sổ cái, hold và giao dịch; mở cảnh báo khi lệch.
4. Người xử lý giải quyết bằng nghiệp vụ điều chỉnh có đối ứng và phê duyệt, không sửa/xóa entry cũ.
5. Nhật ký lưu đầy đủ người, trước/sau, lý do và liên kết incident.

**Ngoại lệ:** cấu hình âm hoặc làm vi phạm bất biến bị chặn; mất dịch vụ thông báo không mất sự kiện; worker retry không làm lặp settlement. **Hậu điều kiện:** số liệu có thể kiểm chứng từ sổ cái. **Liên kết:** FR-G01–G06, AC-47–AC-50.

## 9 Mô hình tiền và các phương án quyết toán

### 9.1 Tài khoản sổ cái và nguyên tắc cân bằng

Sổ cái có các tài khoản logic UserAvailable, OrderHold, ExchangeDepositHold, ExchangeDifferenceHold, WithdrawalHold, PlatformCommission và SimulatorClearing. Mỗi journal có ít nhất hai entry cùng tiền tệ với tổng debit bằng tổng credit. Chiều debit/credit theo thiết kế kế toán nhất quán; các mũi tên sau mô tả chuyển giá trị, không quy định hệ thống phải dùng số dư tài sản hay công nợ làm dấu dương.

- Nạp thành công: SimulatorClearing → UserAvailable.
- Thanh toán/cọc: UserAvailable → hold đúng mục đích và transaction.
- Hoàn: hold → UserAvailable của chủ nguồn, hoặc người thụ hưởng bồi thường theo quyết định.
- Rút yêu cầu: UserAvailable → WithdrawalHold; payout thành công: WithdrawalHold → SimulatorClearing.
- Phí nền tảng: hold → PlatformCommission; chỉ phí đã quyết toán được báo là doanh thu.

Số dư cache nếu có phải đối chiếu với sổ cái. Mỗi hold lưu original_amount, remaining_amount và các settlement entry; không âm. Điều chỉnh sai sót dùng journal đảo/bù được phê duyệt, không sửa entry đã posted.

### 9.2 Order DirectDelivery bình thường và hoàn một phần

Công thức dưới đây chỉ áp dụng Order DirectDelivery. ViaPoint/Auction dùng FR-H02 của phụ lục: P ở Order, phí từng chặng riêng; không cộng ship vào Seller payout hai lần.

Gọi P là tiền sách, S là phí ship và c là tỷ lệ commission snapshot. Buyer trả T = P + S. Khi hoàn tất bình thường: C = round(P × c); Seller nhận P − C + S; nền tảng nhận C. Seller đã ứng chi phí ship, nên S là hoàn ứng, không phải phí nền tảng.

Nếu quyết định cho Buyer giữ sách và được hoàn R đồng tiền sách cùng Q đồng ship: 0 ≤ R ≤ P; 0 ≤ Q ≤ S. Khi đó C = round((P − R) × c); Buyer nhận R + Q; Seller nhận P − R − C + S − Q. Tổng phân bổ bằng P + S. Hoàn toàn bộ tiền sách làm commission bằng 0. Không tự thêm khoản ship hoàn về ngoài nguồn đã nêu.

**Ví dụ:** P = 200.000, S = 30.000, c = 5%. Bình thường Seller nhận 220.000, nền tảng 10.000. Nếu hoàn R = 50.000 và Q = 0, Buyer nhận 50.000, Seller nhận 172.500, nền tảng 7.500; tổng vẫn 230.000.

### 9.3 Order ngoại lệ

| Tình huống | Hàng | Tiền và điều kiện |
|---|---|---|
| Hủy/từ chối trước pickup | Vẫn ở Seller đã xác minh | Hoàn P + S; commission 0 |
| Seller khai mã nhưng chưa rõ pickup | Chưa xác định | Giữ hold, xác minh; không mặc định hoàn hay tịch thu |
| Không giao được, sách đã hoàn về | Seller nhận hoàn | Hoàn P; S hoàn hay trả Seller tùy lỗi và phí đã phát sinh, ghi Q cụ thể |
| Sai mô tả, Buyer giữ và nhận hoàn một phần | Buyer giữ | Công thức mục 9.2, cần quyết định có hiệu lực |
| Sai mô tả, Buyer trả về | Return đã nhận/kiểm tra | Hoàn P và Q theo kết luận; commission 0; chi phí return xử lý riêng |
| Carrier mất trước khi Buyer nhận | Lost | Mặc định hoàn P + S cho Buyer; Seller tự xử lý giá trị hiện vật và chi phí với carrier mô phỏng, không ghi thu nhập Seller từ Order chưa giao |
| Buyer từ chối nhận không lý do đã xác minh | Đang hoàn | Không tự kết luận gian lận; hoàn P sau nhận hoàn, phân S và return theo chi phí có chứng cứ |

Phí return do bên gây lỗi chịu; carrier mất/hư hỏng chưa đủ quy lỗi cho Member thì Admin xác định trách nhiệm theo bằng chứng. Nếu nguồn hold không đủ cho khoản phí bên có lỗi phải trả, hệ thống có thể yêu cầu khoản bổ sung riêng được user xác nhận. User không nộp thì ghi nghĩa vụ chưa thanh toán và giới hạn tài khoản có quyết định; **không tự trừ ví khả dụng ngoài ủy quyền và không tạo số dư âm**. Phạm vi M không bao gồm thu hồi nợ hoặc ứng tiền để trả thay nghĩa vụ Member/carrier. Ngoại lệ riêng: quỹ mô phỏng POL-42 trả lỗi custody của chính điểm theo FR-T04, có nguồn hữu hạn và quyết định độc lập. UI phải ghi đúng số đã hoàn và phần chưa thực hiện.

### 9.4 Exchange bình thường

V_A và V_B là giá trị đã chốt. Δ = |V_A − V_B|. Payer là bên có sách thấp giá; payee là bên có sách cao giá. D_A = r × V_B, D_B = r × V_A, với r = 100% trong cấu hình đề xuất. Tổng hold H = D_A + D_B + Δ. Hoàn tất bình thường hoàn D_A cho A, D_B cho B và chuyển Δ cho payee; exchange fee = 0. Ship tách khỏi H: DirectDelivery mỗi bên trả chiều mình gửi; ViaPoint mỗi bên trả inbound cuốn mình và outbound cuốn nhận nếu chọn carrier. Xem FR-H01–03.

**Ví dụ:** A đưa sách 100.000, B đưa sách 300.000. A cọc 300.000 và bù 200.000; B cọc 100.000. Tổng giữ 600.000. Hoàn tất trả cọc A 300.000, B 100.000, chuyển bù B 200.000. Không gọi toàn bộ 600.000 là doanh thu hoặc giá trị giao dịch đổi.

### 9.5 Exchange ngoại lệ và chống bồi thường trùng

Mặc định nếu trao đổi không thể hoàn thành hai chiều, ưu tiên **đảo giao dịch**: hoàn Δ cho payer, trả cọc chưa sử dụng và đưa mỗi sách về chủ cũ. Nếu không thể thu hồi một sách do bên nhận giữ, dùng deposit của bên giữ để bồi thường giá trị sách đó theo quyết định. Giá trị gốc bị thất lạc trong chiều chủ tự gửi nhưng chưa tới đối phương không tự tạo quyền lấy cọc đối phương; xử lý carrier và các chi phí phát sinh có căn cứ.

| Tình huống | Phương án mặc định | Tiền |
|---|---|---|
| Chưa ai pickup, không đủ funding/hủy hợp lệ | Hủy | Hoàn toàn bộ khoản đã giữ cho đúng người nộp |
| A gửi, B không gửi, sách A thu hồi được | Đảo giao dịch, xác minh nhận hoàn | Hoàn Δ; hoàn cọc còn lại; phí phát sinh do B vi phạm lấy từ D_B trong hạn, phần thiếu ghi rõ |
| A gửi, B không gửi, B giữ không hoàn sách A | Đảo giao dịch, sách A ClosedUnavailable với lý do chuyển giao qua xử lý | Hoàn Δ; bồi thường A tối đa V_A từ D_B; hoàn D_A và phần D_B còn sau nghĩa vụ hợp lệ |
| Hai bên nhận, sai tình trạng một bên nhưng đồng ý giữ | Duy trì trao đổi có điều chỉnh | Chuyển Δ như cam kết, bồi thường R từ deposit bên có lỗi; hoàn deposit còn lại; không bồi thường cùng thiệt hại lần nữa |
| Hai bên nhận, quyết định hoàn cả hai | Đảo giao dịch | Chờ các return; hoàn Δ, phân deposit cho phí/thiệt hại có căn cứ rồi hoàn phần dư |
| Một sách mất trên đường, sách kia thu hồi được | Đảo giao dịch | Hoàn Δ; hoàn cọc sau chi phí hợp lệ; không lấy cọc bên không giữ sách để trả giá trị sách vốn mất từ carrier của chủ |
| Cả hai sách mất, không bên nào đã nhận | Đảo giao dịch, đóng hai listing Lost | Hoàn Δ và cọc; từng chủ xử lý carrier của chiều mình gửi; không tự bồi thường chéo |

Nếu các bên chọn một phương án khác như giữ một cuốn và chuyển thành mua, phiên bản M không tự chuyển loại giao dịch. Admin phải dùng một mẫu quyết định có phân bổ rõ, sự đồng ý được ghi nhận và giới hạn nguồn chi; giao dịch kết thúc ClosedAfterResolution, không giả ghi thành một Order mới đã thanh toán.

**Ví dụ không bồi thường trùng:** A sách 100.000, B sách 300.000; A đã gửi và B giữ sách A nhưng không gửi sách B. Trả lại A khoản Δ 200.000, trả D_A 300.000, chuyển từ D_B 100.000 cho A bù sách A. Tổng chi 600.000 bằng tiền đang giữ. Không cộng thêm 300.000 “giá trị sách B chưa gửi” cho A. Phí return chỉ tính nếu thực tế có, và không chi vượt phần nguồn còn lại.

### 9.6 Mẫu quyết định và điều kiện thực thi

Decision phải chứa: outcome; claim được chấp nhận/bác; lỗi đã xác minh; custody từng sách; từng source_hold; recipient; amount; purpose; return requirement; deadline; người phê duyệt; phiên bản; appeal deadline; bằng chứng; phần nghĩa vụ chưa có nguồn. Engine chỉ thực hiện phiên bản cuối đã có hiệu lực. Mỗi allocation có mã riêng chống lặp.

Trước khi commit, hệ thống kiểm tra tổng allocations bằng số tiền sẽ giải phóng; phần hold còn lại có lý do; cùng tổn thất chưa có allocation bồi thường khác; không có return bắt buộc chưa đạt. Settlement là nguyên tử đối với sổ cái nội bộ. Dịch vụ ngoài mô phỏng có thể bất đồng bộ, nên tiến độ phải hiển thị riêng.

## 10 Danh mục luồng ngoại lệ

| Mã | Trigger | Phản ứng bắt buộc | Yêu cầu liên quan |
|---|---|---|---|
| EF-01 | Listing bị mua/đổi cùng lúc | Chỉ một reservation thắng; rollback đầy đủ bên thua | FR-O02, FR-X04 |
| EF-02 | Checkout hết hạn và thanh toán đồng thời | So deadline máy chủ và commit nguyên tử; không double hold | FR-O03 |
| EF-03 | Chấp nhận counteroffer cũ | Conflict, trả revision mới để xem lại | FR-X03/04 |
| EF-04 | Một bên cọc, bên kia im lặng | Hết funding hạn hoàn đúng người một lần | FR-X06 |
| EF-05 | Hai cọc đủ nhưng thiếu Δ | Không mở Preparing | FR-X05 |
| EF-06 | Seller không nhận đơn | Hủy, hoàn, ghi vi phạm nếu không lỗi hệ thống | FR-O05 |
| EF-07 | Seller nhận nhưng không pickup | Xác minh custody, hủy an toàn hoặc điều tra | FR-O06, FR-S05 |
| EF-08 | Mã vận đơn không hợp lệ/trùng | Chặn gắn trùng, yêu cầu sửa/xác minh; không tự mất cọc | FR-S02 |
| EF-09 | Một chiều Exchange gửi, chiều kia không | Giữ tiền, mở dispute, tổ chức thu hồi hoặc bồi thường | FR-X10 |
| EF-10 | Carrier Delivered nhưng Member phủ nhận | Claim không nhận hợp lệ trong hạn, dừng settlement | FR-D01 |
| EF-11 | Quá hạn vận chuyển chưa có Delivered | Mở điều tra, không tự completed | FR-S05 |
| EF-12 | Sai sách/sai tình trạng | Bằng chứng, quyết định partial/return/reject | FR-D03–D05 |
| EF-13 | Không phản hồi bằng chứng | Quyết định dựa trên dữ liệu, giữ quyền kháng nghị trong hạn | FR-D04/07 |
| EF-14 | Ticket và auto-complete cạnh tranh | Chỉ giải ngân khi không có claim được tiếp nhận hợp lệ trước hạn | FR-D02, FR-O08 |
| EF-15 | Return thất lạc hoặc sai hàng | Mở phần thực thi dispute, chưa đóng settlement | FR-S06 |
| EF-16 | Callback lặp/sai thứ tự/sai số tiền | Dedupe, không lùi trạng thái; dữ liệu sai vào ReviewRequired | FR-W02, FR-S04 |
| EF-17 | Rút tiền chưa rõ kết quả | Giữ Processing, đối soát cùng mã | FR-W07 |
| EF-18 | Hai lệnh rút/chi cùng số dư | Từ chối lệnh thiếu nguồn, không âm available | FR-W05 |
| EF-19 | Listing bị gỡ khi đang giao | Ngừng công khai, tạo xử lý, bảo toàn snapshot | FR-L07 |
| EF-20 | Khóa tài khoản đang có nghĩa vụ | Chặn mới, duy trì kênh nghĩa vụ cũ | FR-A07 |
| EF-21 | Worker/service chết giữa xử lý | Retry cùng event; outbox/sổ cái giữ nhất quán | FR-G04 |
| EF-22 | Email/realtime gửi lỗi | Lưu hộp thư và retry; không rollback nghiệp vụ | FR-N03 |
| EF-23 | Không có Staff/Admin độc lập | Chờ phân công và cảnh báo quá hạn; không tự duyệt | FR-D06/07 |
| EF-24 | Khiếu nại sau khi hết hạn/đã quyết toán | Tiếp nhận hỗ trợ có đánh dấu ngoài quy trình; Admin đánh giá, không tự đảo tiền | FR-D01 |
| EF-25 | Đổi phí/chính sách khi giao dịch đang chạy | Dùng snapshot cũ; không tính lại tiền đã chốt | FR-G02 |
| EF-26 | Bằng chứng upload lỗi sát deadline | Ghi nhận claim đủ mô tả trước hạn, cho bổ sung tệp trong hạn Staff yêu cầu | FR-D01/03 |

## 11 Yêu cầu dữ liệu

### 11.1 Thực thể logic

Bảng nền dưới đây đọc cùng [mô hình bổ sung 1.1](features/LOCAL_TRANSACTION_DESIGN.md). WorkflowContext, commitment và incident bổ sung hỗ trợ intake trước khi có Order; không ép tạo Buyer/giao dịch thanh toán giả để lưu một cuốn tại điểm.

| Thực thể | Thuộc tính chính | Ràng buộc |
|---|---|---|
| User | id, email_normalized, password_hash, status, restriction_until, profile | email duy nhất; không trả hash qua API |
| RoleAssignment | user_id, role, granted_by, effective_at, revoked_at | Có audit; không user tự gán |
| Address | id, owner_id, contact, locality, detail, is_default | Tối đa một default/user |
| Book | id, title, authors, edition, publisher, year, isbn, status | ISBN nếu có chuẩn hóa; bản trùng xử lý có ánh xạ |
| Category | id, name, parent_id, active | Không chu trình phân cấp |
| Listing | id, owner_id, book_id, mode, moderation, visibility, trade, custody, version | Một hiện vật; quyền hiện tại tách snapshot |
| ListingRevision | listing_id, version, prices, condition, description, media, reviewed_by | Phiên bản đã giao kết bất biến |
| CartItem | user_id, listing_id, added_at | Unique cặp; quantity luôn 1 |
| Transaction | id, type, participant_A/B, status, policy_version, created_at | Loại Order/Exchange; ID chung cho hold, review, dispute |
| OrderDetail | transaction_id, listing_id, P, S, buyer_id, seller_id, deadlines, snapshot | Một listing/Order |
| ExchangeDetail | transaction_id, listing_A/B, revision_id, V_A/V_B, deposits, delta, payer, deadlines | Hai listing khác nhau và khác chủ |
| ExchangeProposalRevision | exchange_id, version, proposer, awaiting_user, listing snapshots, expires_at | Một revision hiện hành; lịch sử không ghi đè |
| Reservation / ExclusiveCommitment | listing_id, workflow_context_id, status, version, released_reason | Unique active xuyên Order/Exchange/AuctionIntake; typed FK context; chuyển sang Order nguyên tử |
| Shipment | id, transaction_id, leg, direction, carrier, tracking, status, delivery_at, addresses | Unique carrier + tracking; tối đa một outbound hiện hành mỗi leg |
| ShipmentEvent | id, provider_event_id, shipment_id, event_type, occurred_at, received_at, payload_hash | Provider event duy nhất; lưu cả thời điểm xảy ra/nhận |
| ReturnRequest | id, dispute_id, original_shipment, sender, receiver, fees, deadlines, status | Không ghi đè outbound |
| WalletAccount | id, owner/entity, purpose, currency | Mỗi tài khoản một tiền tệ |
| LedgerJournal | id, business_type, business_ref, idempotency_key, posted_at | Key duy nhất; posted bất biến |
| LedgerEntry | journal_id, account_id, debit, credit | Một chiều mỗi entry, tổng journal cân bằng |
| Hold | id, owner_id, transaction/withdrawal_id, purpose, amount, remaining, status | Số dư không âm; một nguồn nghiệp vụ |
| TopupIntent | id, user_id, amount, provider_ref, state | Sự kiện khớp số tiền/tiền tệ/owner |
| Refund | id, source_hold, amount, recipient, reason, state, journal_id | Tổng refund không vượt source được phân bổ |
| Withdrawal | id, user_id, amount, bank_snapshot, hold_id, state, approver, payout_ref | Tối đa một payout thành công cho request |
| Dispute | id, transaction_id, stage, assignee, authority, deadlines, resume_stage | Tối đa một dispute chưa Closed/transaction |
| DisputeClaim | id, dispute_id, claimant, shipment_leg, type, description, created_at | Hai bên có thể có claim riêng |
| Evidence | id, claim_id, uploader, object_key, checksum, mime, captured_at, uploaded_at, hold_flag | Bản gốc không sửa; quyền riêng tư |
| Decision | id, dispute_id, version, outcome, approver, effective_at, appeal_until, status | Chỉ một final effective version |
| DecisionAllocation | decision_id, source_hold, recipient, amount, purpose, loss_reference | Không bồi thường cùng loss hai lần |
| Violation | id, user_id, source_event, type, verified_at, revoked_at | Unique source + type + user |
| Review | id, transaction_id, reviewer, recipient, book_score?, partner_score, submitted_at, published_at | Unique transaction + reviewer kể cả soft deleted |
| ReviewRevision | review_id, version, content, scores, created_at | Dùng bản hiện hành công khai tính điểm |
| ForumThread/Post | id, author, category, listing_id?, wanted_book_id?, content, status | Chủ listing phải là author khi gắn |
| Conversation/Message | participants, context_id, sender, content, status, sent_at | Kiểm tra participant ở mọi truy vấn |
| Wishlist | user_id, book_id/listing_id, wants_exchange, notifications | Chính xác một target type |
| Notification | user_id, event_id, target, type, payload, read_at | Unique user + event + type |
| PolicyVersion | version, effective_at, values, created_by | Không sửa phiên bản đã dùng |
| AuditEvent/OutboxEvent | actor, entity, before/after, reason, correlation_id, sent_at | Audit append-only, outbox retry an toàn |

### 11.2 Quan hệ và tính toàn vẹn

User có nhiều Listing, Address, WalletAccount và vai trong Transaction. Book có nhiều Listing. Transaction có OrderDetail hoặc ExchangeDetail, không cả hai. Transaction có nhiều Hold, Shipment, Event và tối đa một Dispute đang mở. Dispute có nhiều Claim, Evidence và Decision revision. Journal có nhiều Entry và tham chiếu nghiệp vụ có thể đối soát.

Foreign key hoặc cơ chế tương đương phải ngăn bản ghi mồ côi. Không cascade delete các giao dịch, sổ cái, evidence hoặc audit khi xóa tài khoản/listing. Soft delete không giải phóng unique review hoặc lịch sử thanh toán. Quy trình ẩn danh dữ liệu không xóa số liệu đối soát; phải có chính sách riêng nếu chuyển sang vận hành thật.

Reservation một phần không được commit. Dữ liệu `transaction_type + transaction_id` nếu dùng nhiều bảng phải có kiểm tra tham chiếu; mô hình Transaction chung được khuyến nghị để tránh polymorphic ID không có toàn vẹn.

### 11.3 Kiểm tra đầu vào và tệp

Tên hiển thị 2–80 ký tự; tên sách 1–300; mô tả listing 30–5.000; topic 10–10.000; claim 30–5.000. Chuẩn hóa khoảng trắng đầu/cuối, giữ dấu tiếng Việt. Không tự loại ký tự làm đổi ý nghĩa nội dung. Dữ liệu text được encode khi hiển thị, không thực thi HTML người dùng.

Ảnh listing/đóng gói nhận JPEG, PNG, WebP tối đa 10 MB/tệp; 1–8 ảnh/listing. Evidence nhận ảnh tối đa 10 MB, PDF tối đa 20 MB hoặc MP4 tối đa 100 MB; tối đa 10 tệp/claim. Kiểm tra loại thực tế, kích thước và nội dung nguy hiểm; đổi tên lưu ngẫu nhiên; không chạy macro/script. Mặc định hiển thị ảnh đã bỏ metadata vị trí ở nội dung công khai; evidence gốc giữ riêng có quyền. Video mở hộp là bằng chứng hỗ trợ, không phải điều kiện duy nhất để được khiếu nại.

### 11.4 Lưu giữ và truy cập

Snapshot và sổ cái giữ suốt vòng đời dữ liệu đồ án; evidence tối thiểu POL-25 sau đóng, hồ sơ đang điều tra không xóa tự động. Session/token hết hạn được thu hồi theo chính sách bảo mật. Xuất dữ liệu demo phải loại token, hash mật khẩu, địa chỉ thật và file evidence riêng. Mỗi lần Staff tải evidence có log. Sao lưu phải chứa cả dữ liệu và ánh xạ object tệp để khôi phục không mất chứng cứ.

## 12 Yêu cầu giao diện và hợp đồng tích hợp

### 12.1 Danh mục màn hình

| Nhóm | Màn hình và thông tin bắt buộc |
|---|---|
| Công khai | Trang chủ, tìm kiếm/lọc, book, listing, hồ sơ công khai, forum; chỉ dữ liệu được phép công khai |
| Tài khoản | Đăng ký/xác minh, đăng nhập/quên mật khẩu, hồ sơ, địa chỉ, phiên và trạng thái hạn chế |
| Người đăng | Listing của tôi, soạn/sửa, lịch sử duyệt, lý do bị từ chối, trạng thái giữ/đóng |
| Mua | Giỏ, checkout một cuốn, số tiền và deadline, chi tiết Order, vận chuyển, nhận và khiếu nại |
| Đổi | Tạo đề xuất, danh sách đến/đi, revision, nghĩa vụ tiền từng bên, hai hành trình, deadline từng chiều |
| Ví | Ba nhóm số dư, nạp/rút mô phỏng, lịch sử, chi tiết hold và tiến độ refund/payout |
| Khiếu nại | Form claim, bằng chứng, timeline, quyết định, phân bổ tiền, kháng nghị, hoàn hàng |
| Cộng đồng | Topic/card, chat, wishlist, thông báo, review và phản hồi |
| Staff | Hàng đợi duyệt/ticket, hồ sơ bằng chứng theo phân công, đề xuất quyết định |
| Admin | User/quyền, cấu hình phiên bản, catalog, rút, escalation, đối soát, báo cáo và audit |
| Demo | Bảng phát sự kiện simulator có phân quyền riêng, lịch sử event và kịch bản lỗi |

Mỗi màn hình có loading, empty, lỗi và retry thích hợp. Nút có thể vô hiệu theo trạng thái nhưng máy chủ vẫn kiểm tra. Màn hình giao dịch phải thể hiện “đã nhận” và “đã hoàn tất” khác nhau; “đã duyệt hoàn” và “đã hoàn tiền” khác nhau. Countdown có giờ kết thúc cụ thể để vẫn hiểu khi realtime mất kết nối.

### 12.2 Hợp đồng API tối thiểu

Tên route có thể đổi trong thiết kế chi tiết; hành vi sau là bắt buộc. API ghi trả entity ID, trạng thái, version, server_time và deadline liên quan. Thao tác có tiền dùng Idempotency-Key; cập nhật theo revision dùng expected_version. Một key dùng lại với payload khác phải trả Conflict, không thực thi payload mới.

| Nhóm lệnh | Đầu vào trọng yếu | Phản hồi nghiệp vụ |
|---|---|---|
| Tạo checkout | listing_id, expected_revision, address_id, key | Order và reservation hoặc Unavailable/PriceChanged |
| Pay Order | order_id, expected_version, key | Held hoặc InsufficientFunds/Expired |
| Accept Order | order_id, expected_version | Preparing hoặc InvalidState/Expired |
| Tạo/counter/accept Exchange | listing IDs, proposal_revision, key ở accept | Proposed/AcceptedAwaitingFunding hoặc Conflict |
| Fund Exchange | exchange_id, expected_version, key | Nghĩa vụ bên gửi đã held; tổng trạng thái funding |
| Tạo Shipment | transaction_id, leg, carrier, tracking, media | LabelCreated hoặc DuplicateTracking/InvalidState |
| Nhận hàng | shipment_id, expected_version | Mốc nhận, deadline kiểm tra, không auto settlement |
| Tạo claim | transaction_id, leg, type, description, evidence refs, key | Dispute/claim ID và trạng thái giữ tiền |
| Quyết định | dispute_id, version, allocations, return plan, evidence refs | DecisionIssued hoặc EscalationRequired/Unbalanced |
| Yêu cầu rút | amount, recipient_snapshot, key | WithdrawalRequested + hold hoặc InsufficientFunds |
| Callback adapter | event_id, reference, type, occurred_at, amount/currency nếu tiền, chữ ký | Accepted/Duplicate/ReviewRequired |

Lỗi 401 cho chưa xác thực; 403 cho thiếu quyền; 404 cho đối tượng không tồn tại hoặc cần tránh tiết lộ; 409 cho trạng thái/revision/duplicate khác payload; 422 cho dữ liệu nghiệp vụ sai; 429 cho rate limit. Không trả HTTP thành công rồi âm thầm không làm gì với lệnh tiền; duplicate hợp lệ trả kết quả cũ rõ ràng.

### 12.3 Adapter và sự kiện

Adapter payment/carrier phải tách khỏi logic nghiệp vụ để có thể thay bằng nhà cung cấp thật sau này. Simulator gửi cùng cấu trúc event và qua cùng bộ xử lý xác thực/kiểm tra trạng thái, không update thẳng DB. Có event_id duy nhất, provider, aggregate reference, occurred_at, received_at và payload checksum. Chữ ký hoặc secret test được bảo vệ, không đưa frontend Member.

Các sự kiện chính: ListingApproved, ReservationCreated/Released, PaymentHeld, FundingCompleted, ShipmentPickedUp/Delivered/Failed/Lost, ClaimOpened, DecisionEffective, SettlementPosted, WithdrawalCompleted, ReviewPublished. Outbox lưu cùng commit với thay đổi nghiệp vụ; consumer có inbox/dedupe hoặc cơ chế tương đương. Gửi được ít nhất một lần nhưng tác động nghiệp vụ phải chỉ một lần.

### 12.4 Chính sách sự kiện muộn và mâu thuẫn

Event xảy ra trước deadline nhưng đến sau không tự đảo giao dịch đã hủy/settled. Nếu chưa có quyết toán và bằng chứng xác minh cho thấy pickup đúng hạn, Staff có thể giữ giao dịch và loại strike sai bằng quyết định. Nếu đã hoàn hoặc listing đã có giao dịch mới, mở incident Admin, ngừng giao dịch mới trên listing nếu chưa pickup; không âm thầm lấy tiền/gỡ sách của người thứ ba. Log đầy đủ thời điểm để giải thích sự khác biệt.

## 13 Yêu cầu phi chức năng

Đây là mục tiêu nghiệm thu đề xuất, chưa phải kết quả đo. Môi trường tham chiếu: server ứng dụng 4 vCPU, 8 GB RAM, DB riêng hoặc cùng máy được ghi rõ; dữ liệu 10.000 book, 30.000 listing, 5.000 user, 20.000 giao dịch; mạng thử nghiệm ổn định. Nếu nhóm dùng môi trường khác, ghi cấu hình và điều chỉnh mục tiêu có phê duyệt, không báo số liệu chưa đo.

| Mã | Yêu cầu đo được | Cách xác nhận |
|---|---|---|
| NFR-01 | Tìm kiếm/listing p95 ≤ 2 giây, API ghi nghiệp vụ p95 ≤ 3 giây ở 50 phiên đồng thời, loại thời gian upload và adapter ngoài | Load test ít nhất 10 phút sau warmup, báo p50/p95/error rate |
| NFR-02 | 100 yêu cầu cạnh tranh cùng listing chỉ có 1 reservation Active; 100 callback cùng ID chỉ 1 journal | Test đồng thời và truy vấn invariant |
| NFR-03 | Đối soát tất cả journal posted cân bằng, hold/available không âm; không mất liên kết transaction | Kiểm tra tự động trên toàn bộ dataset nghiệm thu |
| NFR-04 | Worker xử lý deadline trong 60 giây sau hạn ở tải tham chiếu; quyền thao tác vẫn hết đúng deadline dù worker trễ | Test clock điều khiển và restart worker |
| NFR-05 | Thông báo nội bộ xuất hiện p95 ≤ 5 giây sau commit; lỗi email có retry và không mất inbox | Test mất kết nối/kênh email |
| NFR-06 | Mật khẩu hash bằng thuật toán chuyên dụng có salt; token reset/xác minh lưu dạng bảo vệ, không log secret; access token15phút, session tuyệt đối30ngày theo ADR0003, thu hồi khi logout/đổi mật khẩu; reset/change-password vẫn cần triển khai | Kiểm tra cấu hình, log và test thu hồi |
| NFR-07 | Mọi API nhạy cảm kiểm tra vai và object ownership; HTTPS khi triển khai có mạng; bảo vệ CSRF nếu cookie và hạn chế XSS/injection | Test phân quyền phủ cả đọc/ghi và kiểm tra đầu vào |
| NFR-08 | Private file không dùng URL công khai vĩnh viễn; URL ký hạn tối đa 10 phút; kiểm tra quyền trước cấp URL | Test truy cập tệp bằng user không liên quan |
| NFR-09 | Retry sau crash không double debit/release; khôi phục worker không mất event đã commit | Fault injection giữa commit và gửi event |
| NFR-10 | Backup dữ liệu và tệp hằng ngày; mục tiêu RPO 24 giờ, RTO 4 giờ trong môi trường demo | Khôi phục một bản sao thử và đối chiếu dữ liệu |
| NFR-11 | Form có nhãn, lỗi có text, thao tác chính dùng bàn phím, trạng thái không chỉ phân biệt bằng màu | Kiểm tra thủ công desktop/mobile và bàn phím |
| NFR-12 | Hoạt động ở viewport 360 px và 1366 px, không mất nút tiền/claim; Chrome/Edge/Firefox phiên bản nhóm kiểm thử ghi lại | Ma trận trình duyệt và ảnh nghiệm thu |
| NFR-13 | Audit thao tác tiền, quyền, quyết định và evidence có correlation ID; không Member/Staff sửa/xóa audit qua API | Test quyền và truy vết một giao dịch đầu cuối |
| NFR-14 | Mọi yêu cầu M có test hoặc bằng chứng review; module tiền/trạng thái có test lỗi và đồng thời, không chỉ happy path | Ma trận mục 18 và báo cáo chạy |
| NFR-15 | Cấu hình ngoài mã nguồn; thay policy tạo version; thông báo lỗi người dùng không lộ stack trace hoặc secret | Review cấu hình và kiểm thử lỗi |
| NFR-16 | Trạng thái unavailable và sự cố adapter hiển thị rõ; lệnh pending cho xem tiến độ, không khuyến khích bấm lại tạo lệnh mới | Kịch bản mạng ngắt khi thanh toán/rút |

Không cam kết SLA vận hành thương mại cho đồ án. Thời gian giải quyết Staff là mục tiêu vận hành với nhắc hạn/escalation, không tự chuyển thắng/thua cho một bên khi Staff quá hạn.

## 14 Tự động hóa và vận hành

| Tác vụ | Tần suất/điều kiện | Kết quả và kiểm soát |
|---|---|---|
| Quét checkout hết hạn | Mỗi phút | Hủy checkout chưa trả; giải phóng đúng reservation; kiểm tra không có event tiền thắng trước |
| Quét Seller confirm | Mỗi phút | Hủy và hoàn đơn chưa nhận; ghi vi phạm đủ điều kiện |
| Quét proposal/funding | Mỗi phút | Expired proposal; hủy funding thiếu, hoàn các hold |
| Quét pickup/delivery | Mỗi phút | Xác minh hoặc mở case; không tự kết luận custody không có chứng cứ |
| Quét inspection | Mỗi phút | Settlement nếu toàn bộ điều kiện đạt; lock/version chống race với claim |
| Nhắc case/bằng chứng/appeal/return | Mỗi 5 phút | Thông báo, escalation; không tịch thu tự động |
| Công bố review | Mỗi phút và khi bên thứ hai gửi | Kiểm tra hết quyền sửa theo FR-R03, dedupe, không lộ bản bị xóa |
| Matching | Theo ListingApproved/PriceChanged | Chỉ listing hiện còn đủ điều kiện, chống gửi lặp |
| Đối soát | Hằng ngày 02 giờ địa phương và theo yêu cầu | So ledger/hold/payment/withdrawal; discrepancy có owner xử lý |
| Backup | Hằng ngày sau đối soát | Ghi kết quả và kiểm tra khả năng đọc bản sao |

Mỗi job có job_run_id, cursor hoặc batch size, retry tối đa 5 lần với backoff; vượt số lần vào hàng đợi lỗi và báo Admin. Job cần thao tác một entity trong transaction ngắn; không khóa toàn hệ thống trong lúc gửi email hoặc gọi adapter. Thử lại phải dùng cùng business key.

Dashboard chỉ tính Completed/settlement posted theo định nghĩa chỉ tiêu. Giá trị mua là tổng tiền sách được ghi nhận sau điều chỉnh; phí ship tách riêng. Giá trị đổi báo V_A và V_B hoặc tổng đã ghi rõ cách đếm, không cộng cọc như doanh số. Refund đã quyết định nhưng chưa thực thi xuất hiện ở cột riêng.

## 15 Bảo mật và giới hạn xử lý nghiệp vụ

### 15.1 Các hành vi lạm dụng cần kiểm soát

Giữ chỗ hàng loạt được hạn bởi POL-24 và deadline; spam đề xuất bởi POL-23; spam nội dung bởi giới hạn đăng/chat. Vi phạm lặp được đánh giá từ sự kiện đã xác minh. Các giới hạn này không chứng minh người dùng có nhiều tài khoản; hệ thống chỉ kiểm tra cùng account và tín hiệu nội bộ, không tuyên bố giải quyết toàn bộ thông đồng.

Người dùng không được tự gửi số tiền cần trừ/bù/phí rồi để máy chủ tin theo. Máy chủ tính từ snapshot. ID của đối tượng, recipient payout và role trong request đều phải đối chiếu danh tính phiên. Lệnh Admin tiền cần xác thực lại mật khẩu/phiên gần đây trong 15 phút và lưu audit; tích hợp MFA là E.

### 15.2 Khóa và xử lý sự cố

Admin khóa tài khoản phải ghi phạm vi, lý do, điều kiện mở và hồ sơ liên quan. Khóa không xóa ví hoặc snapshot. Freeze available chỉ dùng khi có incident riêng và thẩm quyền Admin; không phát sinh chỉ vì một Member bấm khiếu nại. User được xem số tiền bị hạn chế và kênh hỗ trợ theo phạm vi dữ liệu cho phép.

Nếu sổ cái lệch, dừng settlement/rút liên quan, giữ dữ liệu, mở incident và đối soát. Không sửa trực tiếp số dư để làm mất dấu chênh lệch. Nếu không thể khắc phục trong phiên demo, phải báo chưa hoàn thành, không đổi nhãn trạng thái để qua nghiệm thu.

### 15.3 Bảo vệ chứng cứ và quyền riêng tư

Trang công khai không lộ email đầy đủ, SĐT, địa chỉ, số tài khoản nhận hoặc chat. Staff được truy cập theo nhiệm vụ; Admin truy cập nhạy cảm có log và lý do. Evidence không được tự dùng làm ảnh marketing/review. Chỉnh sửa/xóa nội dung công khai không xóa phiên bản được giữ làm bằng chứng trong hạn lưu giữ.

## 16 Ưu tiên triển khai và phụ thuộc

| Giai đoạn | Kết quả cần có | Phụ thuộc |
|---|---|---|
| G1 | Chốt policy, actor, invariant, dữ liệu logic và adapter contract | Phê duyệt mục 3 |
| G2 | Tài khoản, catalog, listing, kiểm duyệt, reservation | G1 |
| G3 | Ledger, ví, Order, funding Exchange và idempotency | G2 và kiểm thử đồng thời |
| G4 | Shipment simulator, deadline, dispute, return, settlement, withdrawal; sau đó ViaPoint custody/inspection/handover/incident | G3; proof tiền và hiện vật trước point release |
| G4b | Auction tối thiểu dùng intake điểm và Order đã kiểm thử | G4, FR-AU01–10 |
| G5 | Review, forum, chat, wishlist, thông báo, dashboard | Lõi trạng thái và phân quyền ổn định |
| G6 | Kiểm thử end-to-end, khôi phục, hiệu năng, tài liệu và demo phản biện | G2–G5 |

Không triển khai miễn cọc hoặc thanh toán thật. Point release phải dựa trên lõi reservation/ledger/dispute đã qua kiểm thử; auction sau ViaPoint/Order. Có thể làm trước UI fixture và point directory, nhưng không tuyên bố hoàn tất giao dịch. Nếu cần giảm phạm vi, thay đổi danh sách M/E bằng quyết định rõ ràng; không bỏ lỗi tiền/tranh chấp nhưng giữ dashboard để tạo cảm giác đủ tính năng.

## 17 Tiêu chí đầu vào và đầu ra nghiệm thu

**Đầu vào:** policy phiên bản dùng để demo; danh sách tài khoản vai trò; dữ liệu seed không nhạy cảm; simulator phát được event lặp/chậm/lỗi; môi trường và phiên bản ứng dụng; test case có expected result; đồng hồ kiểm thử có thể điều khiển mà không sửa dữ liệu tùy tiện.

**Đầu ra:** tất cả FR mức M có bằng chứng; toàn bộ AC trọng yếu về tiền, giữ sách, quyền, dispute và idempotency đạt; không còn lỗi P0 làm sai tiền/bán trùng/lộ dữ liệu và không còn lỗi P1 làm kẹt luồng bắt buộc; đối soát ledger cân bằng; số dư không âm; policy và state machine đúng phiên bản demo; có báo cáo các giới hạn mô phỏng.

Mức P0 là sai tiền, mất toàn vẹn reservation, vượt quyền dữ liệu riêng hoặc bỏ qua tranh chấp hợp lệ khi giải ngân. P1 là lỗi ngăn hoàn thành nghiệp vụ bắt buộc mà chưa có cách xử lý được đặc tả. P2 là lỗi hiển thị/tiện dụng không làm đổi nghĩa vụ. Việc chấp nhận P2 còn lại phải ghi rõ, không tự coi mọi test chưa chạy là đạt.

## 18 Ma trận truy vết và ca nghiệm thu

### 18.1 Quy ước chạy

Mỗi dòng AC là một nhóm ca; nhóm kiểm thử triển khai đủ điều kiện biên, sai quyền và lặp request liên quan. Đối với test thời gian, đặt mốc T rồi kiểm tra T−1 ms, T và T+1 ms. Đối với test concurrency, xác minh cả phản hồi API lẫn dữ liệu/sổ cái sau commit. Các kết quả dưới đây là **kỳ vọng**, chưa phải test đã chạy trên ứng dụng.

| Mã | Yêu cầu truy vết | Kịch bản và kết quả kỳ vọng |
|---|---|---|
| AC-01 | FR-A01–A04 | Đăng ký, token cũ/lặp/hết hạn, email trùng; chỉ token hiện hành hợp lệ kích hoạt một lần; reset thu hồi phiên |
| AC-02 | FR-A05–A07, NFR-07 | Đổi ID hồ sơ/địa chỉ, cấp quyền trái phép, Staff khóa user; tất cả bị chặn; giao dịch cũ vẫn dùng snapshot |
| AC-03 | FR-A08, FR-D09 | Review và strike độc lập; một claim chưa kết luận không hạ chỉ số vi phạm; đảo kết luận thu hồi đúng strike |
| AC-04 | FR-C01–C04, FR-L01–L03 | Book trùng/không ISBN, listing thiếu ảnh/sai giá; dữ liệu sai không gửi duyệt; tìm/lọc trả đúng tập |
| AC-05 | FR-C05–C07, FR-L03 | Listing Pending/Removed/Hidden/Reserved không lọt tập có thể giao dịch; banner không cho mua listing đã đóng |
| AC-06 | FR-L04–L08 | Sửa giá sau duyệt yêu cầu duyệt lại; đang reserved không sửa/xóa; Staff gỡ vẫn giữ snapshot và tạo xử lý |
| AC-07 | FR-O01–O02 | Giỏ nhiều listing, checkout chọn hơn một bị chặn rõ; một listing quantity chỉ 1; tự mua bị chặn |
| AC-08 | FR-O02, BR-03, NFR-02 | 100 checkout đồng thời cùng listing; đúng một reservation Active và không hold bên thua |
| AC-09 | FR-O02–O03, BR-07/12 | Giá/địa chỉ đổi và checkout hết hạn; yêu cầu xác nhận lại khi giá đổi; tab cũ không thanh toán sau hạn |
| AC-10 | FR-O03–O04, FR-W03 | Pay đủ/thiếu số dư và click lặp; chỉ một debit + hold; thiếu không trừ một phần |
| AC-11 | FR-O04–O05, FR-O09 | Buyer hủy đồng thời Seller nhận; một transition thắng, không vừa hủy vừa Preparing; hủy sau pickup đi return |
| AC-12 | FR-O05, FR-D09 | Seller hết hạn confirm; hoàn P+S một lần, phí 0; strike đúng căn cứ và không đếm lại khi worker lặp |
| AC-13 | FR-O06, FR-S01–S03 | Chỉ nhập tracking chưa có pickup thì chưa InTransit; mã trùng bị chặn; Member không giả phát carrier event |
| AC-14 | FR-O07–O08 | Delivered mở 72 giờ; Buyer bấm nhận không rút ngắn; hết hạn không claim mới settlement |
| AC-15 | FR-O08, FR-W03 | P=200.000, S=30.000, c=5%; Seller 220.000, platform 10.000, ledger tổng 230.000 |
| AC-16 | FR-S04–S05, FR-O10 | Event Delivered rồi event pickup cũ/lặp; không lùi trạng thái; carrier báo mất mở dispute, không Completed |
| AC-17 | FR-X01–X02 | Proposed không giữ; kiểm tra cùng chủ, listing sai chế độ, tính đúng payer khi đảo giá hai bên |
| AC-18 | FR-X03–X04 | Counteroffer revision cũ bị từ chối; revision mới đổi đúng bên chờ; giá không bị thay không qua duyệt |
| AC-19 | FR-X04, BR-05 | Order mua A chạy đồng thời Exchange A↔B; chỉ một thắng, không để B bị giữ một mình |
| AC-20 | FR-X04, BR-04 | Từ chối đề xuất lỗi thời không release reservation của giao dịch thắng khác |
| AC-21 | FR-X05, FR-W03 | Một bên funding x2; chỉ giữ nghĩa vụ một lần và tách deposit/delta |
| AC-22 | FR-X05–X06 | Hai cọc đủ nhưng thiếu delta thì chưa cho gửi; một bên im lặng hết funding thì hoàn đúng người |
| AC-23 | FR-X06/11, BR-27 | Nạp đến sau funding hết hạn; available tăng nhưng Exchange cũ không phục hồi; hủy lặp không refund thêm |
| AC-24 | FR-X07–X10 | A pickup, B không pickup; giữ tiền, tạo dispute; listing A không về Available |
| AC-25 | FR-X08–X09 | A nhận trước B; từng deadline độc lập; cả hai khai gửi qua nhiều ngày nhưng chưa giao thì không release |
| AC-26 | FR-X09, FR-W03 | V_A=100.000, V_B=300.000; tổng hold 600.000; hoàn cọc 300.000/100.000 và Δ 200.000 cho B đúng một lần |
| AC-27 | BR-08, FR-S06 | Hủy sau pickup hoặc return chưa tới; không bán lại hiện vật chưa thu hồi |
| AC-28 | FR-S04–S05, FR-G04 | Event pickup đến muộn sau hủy; mở incident, không lấy tiền người khác hoặc tự phục hồi giao dịch |
| AC-29 | FR-G04, BR-12 | Worker chậm/restart; quyền hết hạn đúng giờ, xử lý sau không nhân đôi hoàn |
| AC-30 | FR-D01–D02 | Claim sai người/sai hạn bị chặn; claim hợp lệ tạo đúng một hồ sơ và chỉ giữ tiền giao dịch |
| AC-31 | FR-D02, FR-O08, BR-18 | Claim trước deadline cạnh tranh auto-settle; claim hợp lệ được commit thì không có journal giải ngân |
| AC-32 | FR-D03–D04, FR-D09 | Bên bị khiếu nại im lặng; không tự mất cọc/strike; Staff phải có căn cứ và vẫn mở hạn appeal |
| AC-33 | FR-D05–D06, BR-35 | Quyết định vượt 300.000 hoặc tự xử hồ sơ bị chặn/escalate; allocations vượt nguồn bị từ chối |
| AC-34 | FR-D07–D08 | Appeal đúng hạn giữ tiền; Admin ban đầu không tự giải appeal; quyết định chưa hiệu lực không thực thi |
| AC-35 | FR-D05, BR-33/34 | B giữ sách A không hoàn trong ví dụ mục 9.5; phân 600.000 đúng nguồn, không cộng bồi thường sách B chưa gửi |
| AC-36 | FR-S06, FR-D08 | Return pickup/delivery/kiểm tra; chỉ sau điều kiện nhận hoàn mới settlement; sai hàng hoàn mở xử lý |
| AC-37 | FR-L04, BR-08 | Sách hoàn hỏng hơn ảnh gốc phải sửa/duyệt lại; ClosedUnavailable không xuất hiện bán lại |
| AC-38 | FR-W01–W04 | Nạp callback lặp/sai amount/currency; lặp ghi có một lần, sai vào ReviewRequired; lịch sử và tổng số dư khớp |
| AC-39 | FR-W05–W06 | Hai rút vượt available và tự duyệt; không âm số dư, không tự duyệt; từ chối trả đúng hold |
| AC-40 | FR-W07, BR-29 | Payout timeout chưa rõ; giữ Processing, không credit available và gửi lệnh mới; đối soát cùng reference |
| AC-41 | FR-W08, NFR-03 | Tạo lệch qua fixture test có kiểm soát; đối soát cảnh báo và chặn phần liên quan; không sửa entry đã posted |
| AC-42 | FR-R01–R03 | Review đơn hủy/sai người bị chặn; Seller không có điểm chất lượng sách Order; chưa hết quyền sửa thì chưa công bố dù hai bên đã gửi; review sát cuối hạn có đủ 48 giờ sửa |
| AC-43 | FR-R04–R05 | Sửa/xóa tại 48 giờ, review evidence, Staff ẩn; không reset hạn hoặc cộng revision hai lần |
| AC-44 | FR-F01–F06 | Gắn listing người khác/spam/nội dung nghi vấn; chặn hoặc kiểm duyệt; pending card không lộ nội dung chưa duyệt |
| AC-45 | FR-M01–M03 | Đổi conversation ID hoặc Staff chưa phân công; không đọc được; chặn user vẫn còn kênh nghĩa vụ cũ |
| AC-46 | FR-N01–N04 | Matching lặp, tắt nhận, email/realtime lỗi; không spam, hộp thư còn và retry không rollback giao dịch |
| AC-47 | FR-G01–G03, BR-39 | Chính sách mới không đổi phí/deadline giao dịch cũ; dashboard không tính cọc/nạp thành doanh thu |
| AC-48 | FR-G04–G06, NFR-09 | Crash giữa commit/outbox, retry job; một tác động nghiệp vụ, có audit và event phục hồi |
| AC-49 | FR-A07, BR-31 | Khóa user có Order/ticket; chặn giao dịch/rút mới theo phạm vi, vẫn nộp bằng chứng và hoàn hàng được |
| AC-50 | FR-G05, NFR-06–NFR-08, NFR-10–NFR-16 | Kiểm tra secret/log, tệp riêng, backup/restore, UI, quyền audit, hiệu năng và coverage; lưu bằng chứng thực đo |

### 18.2 Kịch bản trình diễn tối thiểu

1. Một Order thành công từ duyệt listing tới ledger và review; nêu rõ vì sao Delivered chưa giải ngân.
2. Hai người cùng mua hoặc một mua/một đổi cùng cuốn; chứng minh chỉ một reservation thắng.
3. Exchange có bù; một bên cọc rồi bên kia hết hạn; chứng minh hoàn đúng khoản.
4. Exchange chỉ một chiều gửi; chứng minh sách đang đi không bị mở bán lại và dispute quản lý hai chiều.
5. Khiếu nại sai mô tả, hoàn một phần hoặc return; hiển thị quyết định, appeal, thực thi và tổng tiền cân bằng.
6. Callback lặp và payout chưa rõ; chứng minh không double credit hoặc vừa hoàn vừa chuyển lại.
7. Gỡ listing/khóa user trong lúc giao dịch; chứng minh không mất bằng chứng và không bỏ nghĩa vụ cũ.

## 19 Đối chiếu với hai tài liệu nguồn

| Nội dung nguồn | Quyết định trong SRS | Lý do |
|---|---|---|
| SRC-A mục 2/7 tách catalog, listing, forum | Giữ tại FR-C, FR-L, FR-F và dữ liệu mục 11 | Phân biệt đầu sách và hiện vật; card live không thay snapshot |
| SRC-A mục 3 kiểm duyệt trước Available | Giữ; B trạng thái khởi tạo Available được thay bằng mô hình ba chiều | Không công khai listing chưa được duyệt |
| SRC-B BR-08/15 khóa đồng thời hai listing | Giữ và thêm invariant, AC đồng thời | Chống một cuốn cam kết hai nơi |
| SRC-B Reserved nhận nhiều yêu cầu, Locked mới chốt | Đổi thành Reserved độc quyền; Proposed không giữ | Thống nhất ý nghĩa với luồng checkout |
| SRC-B BR-14 Seller chọn nhiều yêu cầu mua | Không dùng cho Order M; giữ chọn đề xuất cho Exchange | Tránh thu/hoàn tiền của nhiều Buyer cho một cuốn |
| SRC-A cọc biến thiên và miễn uy tín; SRC-B cọc 20–30% | Một tỷ lệ đề xuất 100% giá trị nhận, không miễn | Rõ phạm vi bảo đảm và dễ kiểm thử; vẫn không bảo đảm mọi phí/thiệt hại |
| SRC-B BR-02 khung theo giá bìa/trung bình thể loại | Không dùng như chuẩn tự động; Staff xét và áp trần | Tránh giá tự khai và listing giả làm lệch định giá |
| SRC-B BR-07/EF-06 release từ ngày cả hai khai gửi | Thay bằng hạn sau nhận/giao hợp lệ từng chiều | Không coi khai gửi là đã giao |
| SRC-B BR-12/EF-08 hạn gửi sau Seller nhận | Giữ và yêu cầu pickup xác minh | Chặn Seller nhận rồi không gửi |
| SRC-A gửi hàng mù | Không dùng trong M | Không chứng minh pickup, khó hỗ trợ người dùng |
| SRC-A mất toàn cọc nếu không tracking | Thay bằng xác minh và quyết định | Thiếu tracking chưa đủ kết luận vi phạm |
| SRC-A freeze available hai bên khi mở ticket | Giữ tiền giao dịch; freeze rộng có incident Admin riêng | Tránh lạm dụng ticket để khóa toàn ví |
| SRC-B BR-16/17 vận chuyển thủ công/tùy chọn carrier | Dùng carrier simulator đủ sự kiện trong M | Có mốc pickup/delivered đáng kiểm thử; không bắt tích hợp thật |
| SRC-B BR-18 phí ship | Giữ mỗi bên tự chi chiều Exchange; Order snapshot S và Seller ứng | Làm rõ ai nhận phí và hoàn phí |
| SRC-A Admin duyệt rút; SRC-B Staff/Admin | Admin duyệt, Staff hỗ trợ đối chiếu | Một thẩm quyền thống nhất, chống tự duyệt |
| SRC-A Order review một chiều; SRC-B hai chiều 48 giờ | Hai chiều, thời hạn sửa 48 giờ, công bố có điều kiện | Kế thừa phản hồi hai phía và giảm trả đũa |
| SRC-B EF-05 vắng mặt mất quyền khiếu nại thêm | Ra quyết định theo bằng chứng, một lần appeal có hạn | Giữ quy trình xử lý im lặng nhưng có bước xem xét độc lập |
| SRC-A nhiều tích hợp/hub/uy tín nâng cao | 1.1 đưa hai điểm nội bộ và đấu giá tối thiểu vào M; tích hợp thật/uy tín nâng cao vẫn E | Quyết định chủ dự án; xem phụ lục và ADR0007 |

## 20 Quản lý thay đổi và bàn giao

Mỗi yêu cầu thay đổi cần mã CR, người đề nghị, vấn đề, FR/BR/POL bị ảnh hưởng, dữ liệu cần chuyển đổi, tác động đến giao dịch đang chạy và AC phải sửa. Thay đổi số tiền, cọc, thời hạn, actor hoặc điều kiện kết thúc luôn tăng phiên bản policy/SRS. Không chỉ sửa giao diện rồi để tài liệu và kiểm thử theo luật cũ.

Bộ bàn giao triển khai tối thiểu gồm SRS được rà soát, sơ đồ use case và ERD phù hợp mục 11, bảng chuyển trạng thái, API contract chi tiết, script dữ liệu demo, test report theo AC, báo cáo đối soát và hướng dẫn chạy simulator/khôi phục. SRS này là đặc tả yêu cầu; các tài liệu triển khai và bằng chứng kiểm thử phải được lập trong quá trình phát triển, không được coi là đã có chỉ vì được liệt kê ở đây.

Khi chốt phiên bản, nhóm điền người duyệt, ngày duyệt, các POL đã chọn, các E được đưa vào và các M được loại bằng quyết định thay đổi. Các cam kết đã chốt trong giao dịch tiếp tục dùng snapshot tương ứng, kể cả sau khi phát hành SRS mới.


## 20 Phụ lục quy phạm 1.1 và phạm vi nghiệm thu

- [LOCAL-AUCTION-01](features/LOCAL_HANDOVER_AUCTION.md): DEC-01–09, POL-27–42,
  FR-H01–12, FR-T01–04, FR-AU01–10; phí/cọc/custody/trách nhiệm/tie/Auto/timeouts.
- [Thiết kế logic](features/LOCAL_TRANSACTION_DESIGN.md): module, thực thể/FK,
  state machine, shared commitment, slot, ledger và concurrency.
- [Use case và traceability](features/LOCAL_TRANSACTION_ACCEPTANCE.md): UC-H01–07,
  UC-AU01–05, AC-H01–24, AC-AU01–14, DEMO-01–06. Tất cả ca mới chưa chạy.
- [Bảng thay đổi và tình trạng](SRS_V1_1_CHANGELOG.md): phân biệt chính sách, code
  hiện hữu và ảnh hưởng phải triển khai; snapshot v1.0 giữ nguyên để truy vết.

Các AC-01–50 kế thừa vẫn là kỳ vọng, áp dụng theo phương thức tương ứng; đặc biệt
AC shipment cũ là DirectDelivery. Không dùng số lượng tests nền móng làm bằng chứng
nghiệm thu toàn bộ SRS. API source of truth vẫn là OpenAPI, hiện v0.4.0; phụ lục
chưa bổ sung HTTP routes hoặc database migrations vào phần mềm đang chạy.
