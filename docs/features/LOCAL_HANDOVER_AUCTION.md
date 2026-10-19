# TP.HCM, điểm giao nhận và đấu giá

Mã: LOCAL-AUCTION-01 · Phiên bản 1.1 · Ngày 26/09/2026.

Phụ lục quy phạm của [SRS 1.1](../SRS_V1_1.md). Chủ dự án đã duyệt hướng sản phẩm:
TP.HCM, giữ ship, hai điểm mô phỏng do Lật lại vận hành, qua điểm là tùy chọn cho
mua/đổi và bắt buộc trước đấu giá, RN trước, tiền/carrier mô phỏng. Các mức phí,
thời hạn và quy tắc biên dưới đây là baseline triển khai do nhóm cụ thể hóa theo
ủy quyền; không ghi nhận là giảng viên đã phê duyệt. Đây là yêu cầu, chưa phải code.

## 1. Quyết định và phạm vi

| Mã | Quyết định hiện hành |
|---|---|
| DEC-01 | Chỉ tạo giao dịch có địa điểm gửi/nhận và điểm trung gian trong vùng phục vụ TP.HCM. Guest ở ngoài vẫn được xem; không hạn chế theo IP hoặc nơi cư trú tài khoản. |
| DEC-02 | Mua/đổi chọn DirectDelivery hoặc ViaPoint. DirectDelivery dùng carrier mô phỏng; chưa hỗ trợ tự hẹn gặp ngoài điểm trong luồng chính thức. |
| DEC-03 | Hai điểm HCM-DEMO-01 và HCM-DEMO-02 do Admin quản lý; Staff được phân công theo điểm. Không có đối tác, chia doanh thu hoặc chuyển sách giữa hai điểm. |
| DEC-04 | Một giao dịch ViaPoint dùng đúng một điểm chung. SelfDropoff/CarrierInbound và SelfCollect/CarrierOutbound là các lựa chọn độc lập của từng người. |
| DEC-05 | Kiểm tra tình trạng/đối chiếu mô tả có biên bản; không chứng nhận chính hãng, quyền sở hữu hoặc tính hợp pháp của bản in bằng một lần duyệt ảnh. |
| DEC-06 | Đấu giá là chức năng phụ có phạm vi bắt buộc tối thiểu ở bản 1.1: một cuốn/phiên, giá mua ngay trước bid đầu (mở 60 giây cho người khác trả cao hơn, ADR 0042), Auto có trần, hết phiên tạo một Order. |
| DEC-07 | Đấu giá dùng listing riêng kênh Auction do luồng đấu giá tạo (mode Sale, salePrice là giá trị khai báo), không lấy listing của sàn mua/đổi; listing Auction không lên kệ, không mua/đổi/báo giá ([ADR 0041](../adr/0041-auction-only-listings.md), 19/10/2026). Sách phải được điểm nhận và đạt kiểm tra trước khi mở phiên. |
| DEC-08 | Giữ cọc Exchange 100% giá trị sách dự kiến nhận cho cả hai phương thức ở bản đầu. Điểm giữ sách không tự miễn cọc; thay đổi tỷ lệ là policy tương lai. |
| DEC-09 | Không tiền thật/carrier thật. Có thể diễn tập tiếp nhận sách thật tại bàn được phép dùng; tọa độ/địa chỉ mô phỏng không được trình bày như cơ sở đã hoạt động. |

Ranh giới TP.HCM lưu bằng service-area ID/version và bộ mã địa bàn được Admin quản lý;
không kiểm tra bằng chuỗi địa chỉ chứa chữ “HCM”. Bộ dữ liệu demo không phải danh mục
địa giới hành chính chính thức. Khi triển khai thực tế phải thay bằng danh mục đã
xác minh. Không mặc định mọi địa chỉ thuộc TP.HCM đều có cùng khả năng vận chuyển;
simulator v1.1 cố ý dùng một vùng phục vụ và biểu phí cố định.

## 2. Chính sách demo cố định

Các POL-01–26 của SRS giữ nguyên trừ điều chỉnh nêu rõ. Snapshot policy, điểm,
phương thức, payer và phí khi giao kết; cấu hình mới không đổi giao dịch đã chốt.

| Mã | Chính sách | Giá trị và ý nghĩa |
|---|---|---|
| POL-27 | service_area | TP.HCM, `HCM-DEMO-v1`; kiểm tra cả địa chỉ gửi và nhận trước commit |
| POL-28 | point_capacity | 20 cuốn/điểm; giữ chỗ và sách đang giữ cùng tính vào sức chứa |
| POL-29 | point_hours | 09:00–18:00 hằng ngày, Asia/Ho_Chi_Minh; intake/handover trực tiếp trong giờ, chọn điểm online cả ngày |
| POL-30 | inbound_deadline | 72 giờ từ Seller xác nhận Order, đủ funding Exchange hoặc tạo yêu cầu gửi sách đấu giá; phải đến điểm, không chỉ có pickup |
| POL-31 | point_inspection | 24 giờ từ Staff ghi nhận nhận sách; quá hạn mở tác vụ/escalation, không tự Pass |
| POL-32 | recipient_decision | 72 giờ từ khi hệ thống mở quyền nhận và lưu thông báo bền vững; cả hai bên Exchange phải chấp nhận biên bản trước khi bàn giao bất kỳ cuốn nào |
| POL-33 | collection_and_dispatch | 72 giờ từ RecipientAccepted/ReleaseAuthorized; đến lấy hoặc carrier pickup. Email/push lỗi không đổi mốc trong hộp thư |
| POL-34 | owner_reclaim | 72 giờ từ thông báo cho phép lấy về; quá hạn thành Overdue, sau 14 ngày mở escalation Admin; không tự tịch thu/thanh lý |
| POL-35 | point_service_fee | Kiểm tra và giữ sách: 0đ ở demo. Quá hạn không tự phát sinh phí lưu kho. Chi phí vận hành mô phỏng do nền tảng chịu. |
| POL-36 | per_carrier_leg_fee | 30.000đ/chặng được chọn, self dropoff/collect 0đ. POL-22 vẫn là ship một chiều Order trực tiếp. Đây không phải báo giá thị trường. |
| POL-37 | collection_code | Mã ngẫu nhiên 6 số, hiệu lực 10 phút, gắn người nhận + sách + điểm; 5 lần sai/15 phút/handover, không ghi raw mã vào log |
| POL-38 | auction_duration | 24 giờ từ khi mở; không lên lịch tương lai, không gia hạn phút cuối, giờ server quyết định |
| POL-39 | auction_prices | 10.000–1.000.000đ; bước giá 10.000đ hoặc 50.000đ do Seller chọn trước mở; start, bid, max và buy-now cùng lưới `start + n × step` |
| POL-40 | winner_payment | 24 giờ (cả khi thắng nhờ BuyNow sau cửa sổ 60 giây, ADR 0042); Order BuyNowPending cũ giữ hạn 15 phút POL-01; không tự chuyển người đứng thứ hai |
| POL-41 | auction_limits | Tối đa 2 intake/auction chưa kết thúc của Seller; 5 phiên người dùng đang có cam kết bid chưa giải phóng; 30 lệnh bid/Auto mỗi phút/tài khoản |
| POL-42 | platform_incident_fund | Số dư mở đầu demo 2.000.000đ, có journal nguồn vốn mô phỏng. Không tự nạp thêm khi hết; chỉ chi theo quyết định độc lập và nguồn còn lại. |

Deadline tính giờ liên tục. Giao nhận trực tiếp chỉ được đặt hạn cuối trong giờ điểm
mở: nếu mốc 72 giờ rơi ngoài giờ thì dời tới giờ đóng cửa của ngày mở kế tiếp và
snapshot thời điểm cụ thể. Deadline đấu giá/thanh toán, inspection sau nhận cuối
cùng và hạn khiếu nại không dời theo giờ điểm. Countdown UI không là nguồn thời gian.

## 3. Phí, cọc và luồng tiền

### 3.1 Ai chịu phí

| Phương thức | Chặng | Người chịu phí thông thường |
|---|---|---|
| Order DirectDelivery | Seller → Buyer | Buyer chịu S; Seller ứng S cho carrier, được hoàn ứng từ Order khi quyết toán theo SRS §9.2 |
| Exchange DirectDelivery | A → B; B → A | A trả chiều mình gửi; B trả chiều mình gửi; không gộp phí vào Δ/cọc |
| Order ViaPoint, kể cả thắng đấu giá | Seller → điểm | Seller trả nếu chọn carrier; tự mang 0đ |
| Order ViaPoint, kể cả thắng đấu giá | Điểm → Buyer | Buyer trả nếu chọn carrier; tự lấy 0đ |
| Exchange ViaPoint | A/B → điểm | Mỗi người trả chặng gửi sách mình sở hữu |
| Exchange ViaPoint | Điểm → A/B | Mỗi người trả chặng nhận cuốn sách mình đổi về |
| Return | Chặng trả về/thu hồi | Phân bổ theo lỗi đã xác minh; không luôn dùng payer chặng outbound |

Ví dụ đổi qua điểm: A tự mang, chọn ship sách nhận về; B ship tới, tự lấy về.
A chịu 30.000đ, B chịu 30.000đ, phí dịch vụ điểm 0đ. Nếu cả hai chọn ship cả đi/về,
mỗi người chịu 60.000đ. Không quảng cáo qua điểm rẻ hơn giao trực tiếp.

FR-H01: trước chốt phải hiển thị từng chặng, phương thức, payer, phí, tổng trả và
khoản nào là cọc hoàn lại. Tách “ship” khỏi “dịch vụ điểm”; “phí đổi 0đ” không có nghĩa
ship miễn phí. Đổi địa chỉ/điểm/phương thức làm thay giá thì hủy an toàn và tạo lại
trước bàn giao cho carrier/điểm; không âm thầm sửa snapshot.

### 3.2 Thu và giải phóng tiền

FR-H02: mọi phí carrier trong demo có journal và tham chiếu chặng, không chỉ con số
trên màn hình. ViaPoint và Exchange DirectDelivery dùng ShipmentFeeHold của payer;
khóa phí trước đặt chặng, chuyển sang tài khoản carrier mô phỏng một lần khi pickup
hợp lệ. Chưa pickup và hủy được: hoàn phí. Đã pickup: không hoàn mặc định dù giao
dịch bị hủy; refund/reallocation cần quyết định và nguồn, không thu lần nữa ở đầu nhận.

Order DirectDelivery giữ nguyên BuyerHold=P+S, Seller ứng S từ available lúc pickup.
Seller phải đủ nguồn ứng ship trước pickup. Khi thành công Seller nhận P−C+S;
carrier đã nhận S từ Seller, nền tảng nhận C=round(P×5%). Không áp dụng đồng thời
ShipmentFeeHold của Buyer cho cùng chặng để tránh thu hai lần.

Order ViaPoint giữ P trong Order, phí chặng ở hold riêng; Seller nhận P−C, không
nhận khoản ship đã chuyển carrier từ hold. Ví dụ P=200.000đ, cả hai chọn ship:
Seller trả 30.000đ inbound, Buyer trả 230.000đ gồm P+outbound; cuối cùng Seller
nhận 190.000đ, nền tảng 10.000đ, carrier tổng 60.000đ. Tổng nguồn 260.000đ bằng
tổng đích; tiền Seller thực còn sau ship là 160.000đ.

Buyer funding P và outbound đã chọn ở checkout; Seller giữ inbound đã chọn khi
xác nhận Order. Chưa đủ hai nghĩa vụ thì không cho inbound/dropoff. Seller không
xác nhận/không đủ phí trong POL-02 thì hủy an toàn và hoàn hold chưa phát sinh.
Hoàn một phần tiền sách R cho Order ViaPoint: Buyer nhận R, Seller nhận P−R−C,
C=round((P−R)×5%); ship xử lý riêng theo chặng/lỗi, không cộng lại vào công thức.

Exchange tiếp tục D_A=V_B, D_B=V_A, Δ=|V_A−V_B|; bên sách thấp trả Δ, phí đổi 0đ.
Funding giao dịch gồm cọc/Δ và mọi chặng được chọn của mỗi bên, với mục đích hold
riêng. Chỉ cho pickup/dropoff sau khi cả hai đủ funding. Khi hoàn tất trả hai cọc,
chuyển Δ, carrier fees đã phát sinh không bị ghi lại thành doanh thu/tiền bù.

Auction intake: Seller trả/giữ phí inbound ngay khi chọn ship. Không có Buyer trước
khi thắng/mua ngay nên không thu P/outbound trước đó. Người đấu chọn self-collect
hoặc địa chỉ ship trong vùng khi bid đầu; phương thức/quote khóa cho tới kết quả.
Max bid chỉ là trần tiền sách, UI luôn hiển thị thêm ship. Không giữ tiền mọi bidder;
khi thắng mới cần đủ available để thanh toán P+phí outbound. Rủi ro người thắng
không trả được xử lý bằng PaymentExpired, không tuyên bố tiền đã được bảo đảm.

FR-H03: hủy do sai mô tả trả P/Δ và phần cọc chưa phân bổ; phí đã phát sinh và phí
return phân bổ theo quyết định. Thiếu nguồn thì yêu cầu người có lỗi xác nhận nộp
thêm; không trừ available ngoài ủy quyền, không âm ví. Khoản đã hoàn và khoản mới
được duyệt phải hiển thị riêng. Chưa rõ pickup/custody thì giữ điều tra trước release.

## 4. Điểm, sức chứa và quyền

FR-H04: Admin tạo/sửa điểm, lịch mở cửa, sức chứa và phân công Staff có audit.
Điểm có Active/Paused/Closed. Paused chặn booking mới nhưng vẫn nhận sách của booking
đã có, kiểm tra và trả/bàn giao sách; Closed chỉ khi không còn booking/custody/nghĩa vụ.
Không giảm capacity thấp hơn số đang giữ/đã cam kết. Đóng khẩn cấp mở incident,
thông báo người liên quan và trả/giữ điều tra; chưa tự chuyển sang điểm khác.

FR-H05: slot là một cuốn, giữ trước khi xác nhận giao dịch ViaPoint: Order 1,
Exchange 2, auction intake 1. AvailableSlots = capacity − slots chưa release;
booking hết hạn không tự release nếu sách đang vận chuyển hoặc đã ở điểm. Việc
kiểm tra và trừ slot phải nguyên tử để hai request không cùng lấy chỗ cuối.
Sách đấu giá chuyển sang Order dùng lại slot, không đặt thêm slot cho cùng cuốn.

FR-H06: Seller khai các điểm Active có thể gửi tới trong listing; Buyer chọn một.
Exchange chọn một điểm thuộc giao của hai danh sách và Recipient chấp nhận đúng
revision. Auction chọn một điểm từ intake; người bid không đổi điểm đó. API kiểm tra
vùng/điểm/slot/phiên bản lại khi commit. Danh sách gợi ý không có quyền quyết định.

Staff phải có assignment hiện hành cho đúng điểm và không là chủ, Buyer, bidder
hay participant của hồ sơ. Không tự phân công hoặc tự xử lý incident mình gây ra.
Admin không tự bỏ qua kiểm tra: muốn intake phải có STAFF + assignment; quyền xử lý
incident/escalation độc lập vẫn thuộc ADMIN. TEST_OPERATOR chỉ phát simulator events,
không giả làm Staff kiểm tra hoặc phát mã nhận hộ người dùng.

Hai record demo: HCM-DEMO-01 “Lật lại — Điểm demo A”, HCM-DEMO-02 “Lật lại — Điểm
demo B”; địa chỉ hiển thị “Bàn tiếp nhận A/B — không phải địa điểm giao dịch thực tế,
TP.HCM”; serviceAreaId bắt buộc, tọa độ để null. Đây là ngoại lệ dữ liệu simulator,
không phải địa chỉ dùng đặt carrier thật. Không mạo nhận nhà sách/quán đã hợp tác.
Khi diễn tập ở phòng được phép dùng, người vận hành bổ sung chỉ dẫn riêng cho người
tham gia; không công khai vị trí cá nhân hoặc dựng tọa độ ngẫu nhiên trên bản đồ.

## 5. Kiểm tra, custody và bàn giao

FR-H07: tiếp nhận gắn booking, listing revision và người giao; lưu thời gian server,
ảnh lúc nhận, vị trí kệ, tình trạng kiện/niêm phong và người xử lý. Carrier Delivered
tới điểm chỉ tạo ArrivalReported; Staff xác nhận mới thành ReceivedAtPoint. Hai
sự kiện bất đồng không tự tạo receipt nhận; mở incident để đối chiếu. Không nhận
booking hết hạn thành thành công tự động; xử lý LateArrival, bảo toàn sách/slot.

FR-T01: ảnh listing gồm bìa, gáy/trang xuất bản, trang trong và hư hỏng (1–8 ảnh theo
contract, một ảnh có thể bao quát nhiều góc); yêu cầu bổ sung nếu thiếu thông tin.
Staff tại điểm ghi checklist: đúng đầu sách/ấn bản; đối chiếu dấu riêng trong ảnh;
bìa/trang/ghi chú/phụ kiện; lỗi khai báo và lỗi quan sát được; dấu hiệu nghi bản sao.
Kết luận Pass/Fail/NeedsEvidence, ảnh và lý do bất biến theo report revision. Pass
chỉ có nghĩa phù hợp checklist tình trạng, không khẳng định đã kiểm mọi trang.

FR-T02: Approved listing chỉ có nhãn “Đã duyệt thông tin đăng”. Pass tại điểm có
nhãn “Đã kiểm tra tình trạng tại điểm”, kèm thời điểm, phạm vi và report công khai
đã loại tên/địa chỉ/mã kệ riêng. Không dùng “chính hãng”, “bảo đảm thật”, điểm uy tín
tự bịa. Nghi giả → NeedsEvidence, chặn bàn giao/mở auction; người bán được nộp chứng
cứ, Staff độc lập xử lý trong 48 giờ POL-09. Không đủ cơ sở → từ chối giao dịch,
không mặc nhiên kết luận vi phạm hàng giả chỉ vì không có hóa đơn sách cũ.

FR-H08: nếu Fail/sai mô tả, chặn release và mở hồ sơ xử lý; không cho tự sửa listing
đã giao kết để biến Fail thành Pass. Lỗi làm thay điều kiện mua/đổi cần hủy/hoàn theo
quyết định, trả về rồi sửa/duyệt revision mới. NeedsEvidence không tự Pass khi quá hạn.

FR-H09: Pass + đủ funding + không incident/dispute cho phép Recipient xem report,
đến kiểm tra tại điểm hoặc chọn xác nhận trên app để nhận qua ship. Xem/thử sách tại
quầy vẫn dưới custody điểm, không coi là đã nhận; mang ra khỏi điểm cần handover.
Không phản hồi trong POL-32 thì xử lý hủy an toàn/return, không auto-accept.
Từ chối vì khác mô tả mở claim; đổi ý không có lỗi sau Seller xác nhận áp dụng quy
trình xin hủy của SRS, không tự hoàn ngay hoặc ép quyết toán khi chưa giao.

Với Exchange, chỉ mở POL-32 và gửi yêu cầu acceptance khi cả hai cuốn đã Pass và
đủ funding; không tính hạn phản hồi của bên có sách đến sớm từ lúc một cuốn Pass.

FR-H10: Exchange ViaPoint có barrier: cả hai sách Pass, cả hai RecipientAccepted,
đủ funding, không cờ giữ trước khi cấp ReleaseAuthorized cho bất kỳ cuốn nào.
Sau barrier, mỗi bàn giao vẫn kiểm tra điều kiện hiện hành. Một chiều đã đi thì
không giả rollback hiện vật; chiều còn lại lỗi mở dispute/return và giữ tiền.
Không đòi hai người nhận cùng lúc, nhưng không giải phóng cọc khi chỉ một người nhận.

FR-H11: SelfCollect dùng mã POL-37 do người nhận đăng nhập chủ động yêu cầu khi sẵn
sàng nhận. Staff nhập mã, server kiểm tra point/item/recipient/report/version và
ghi handover/custody/audit atomically. Mã hết hạn/sai/đã dùng/wrong point không giao.
Mất mạng không được coi màn hình client là bằng chứng; retry cùng key và đọc receipt.
Mã không chứng minh danh tính pháp lý; v1.1 chỉ giao cho tài khoản recipient, chưa
có ủy quyền người khác lấy. CarrierOutbound dùng carrier pickup/event, không dùng
mã nhận của Buyer để giao cho shipper.

FR-T03: thời hạn kiểm tra POL-08=72 giờ bắt đầu khi Buyer/người đổi nhận cuối cùng
(SelfCollect handover hoặc carrier Delivered hợp lệ), không bắt đầu khi sách đến
điểm hoặc được Pass. Bấm đồng ý report/mã nhận không từ bỏ quyền khiếu nại. Giữ
snapshot/bằng chứng và bảo vệ claim cạnh tranh settlement như SRS cũ.

FR-H12: Custody phân biệt OwnerConfirmed, CarrierInbound, AtPoint, CarrierOutbound,
RecipientConfirmed, Returning, Lost, Unknown. Giữ slot cả khi outbound/inspection
để có chỗ cho return, chỉ release sau Completed hoặc OwnerConfirmed và đóng mọi
nghĩa vụ về sách; Lost cần quyết định incident có hiệu lực. Không đặt slot thứ hai
cho return về cùng điểm. Trade không tự về Available khi tiền đã hoàn: sách có thể
vẫn ở điểm/carrier. Sách AtPoint chờ chủ lấy về không nhận giao dịch mới.

### Trách nhiệm mất/hỏng

FR-T04: incident phải tồn tại ngay cả khi chưa có Order (auction intake). Chủ sách
thấy receipt và kênh yêu cầu xử lý. Mất/hỏng được xác minh trong custody AtPoint do
nền tảng chịu theo giá trị bảo vệ snapshot: Sale dùng salePrice đã duyệt lúc intake,
Exchange dùng exchangeValue. Với đấu giá đã bán, dùng giá Order; trước đó dùng
salePrice snapshot, không dùng max bid bí mật hay giá mua ngay để tự nâng bồi thường.
Giá bảo vệ công khai cho người gửi trước intake; không là cam kết giá thị trường.

Nguồn bồi thường là quỹ mô phỏng POL-42; Buyer nhận lại P/ship chưa phát sinh từ
hold của mình, Seller nhận bồi thường mất sách từ quỹ — không lấy cọc người vô lỗi.
Trần bồi thường hiện vật bằng giá trị bảo vệ (hư hỏng chỉ phần thiệt hại được xác
minh), tối đa POL-16. Phí vận chuyển có chứng từ do lỗi điểm được quyết định riêng
trong nguồn quỹ còn lại. Không vừa trả giá trị sách cho chủ cũ vừa settlement tiền
bán cùng tổn thất. Admin độc lập phê duyệt, không tự xử lý điểm/hồ sơ của mình.
Quỹ thiếu: ghi phần chưa trả, không tự tạo tiền/đóng incident; Paused intake mới
tại điểm liên quan, giữ hỗ trợ nghĩa vụ cũ. Đây là thay đổi có giới hạn so với SRS
1.0 “không ứng tiền nền tảng”, chỉ cho lỗi custody điểm trong demo.

Nếu carrier giữ sách khi mất/hỏng: mở incident theo chặng, payer, pickup và report;
carrier simulator có thể phát bồi thường với ID/nguồn mô phỏng riêng. Không tự quy
lỗi Staff/Member. Bồi thường muộn phải đối soát lossReference để không chi trùng.
Quá hạn không đến lấy không đồng nghĩa bỏ quyền sở hữu; không tự thanh lý/đấu giá sách.

## 6. Đấu giá và Auto

FR-AU01: Seller tạo AuctionIntake trên listing kênh Auction của mình (ADR 0041) đã
Approved/Visible/Available; listing kênh Marketplace bị từ chối,
snapshot revision/start/step/buyNow/point/policy; start và buyNow nằm POL-16, buyNow
nếu có lớn hơn start. Trong cùng transaction, giữ độc quyền listing và slot. Không
mở mua/đổi thường trong intake hoặc auction; có phiên cũ PaymentExpired/Unsold muốn
đăng lại phải return về OwnerConfirmed rồi tạo yêu cầu mới ở bản đầu.

FR-AU02: sách ReceivedAtPoint + inspection Pass đúng revision + Seller ACTIVE,
Staff độc lập mới mở phiên; startAt=serverNow, endAt=startAt+24 giờ. Hết intake/
inspection chưa Pass: không tự mở, chuyển xử lý trả sách. Seller có thể hủy trước
mở và chưa có bid; sau mở nhưng chưa bid cũng được đóng Cancelled rồi trả sách.
Sau bid đầu Seller không tự rút/đổi giá/kéo dài phiên. Admin độc lập hủy có lý do
khi incident/gian lận, thông báo bidder và không tự chọn người thắng.

FR-AU03: manual bid là mức trả có cam kết ngay, phải >= currentPrice+step, hoặc
>=start nếu chưa bid. Auto là cam kết cho phép hệ thống trả tối đa maxAmount bí mật.
Cả hai cùng lưới POL-39, giới hạn maxAmount 1.000.000đ; lần Auto đầu phải có thể tham
gia ở mức bid tối thiểu. Auto không nâng giá khi không có đối thủ; hệ thống không
ghi hàng nghìn bid giả khi hai Auto cạnh tranh mà tính một kết quả xác định.

FR-AU04: mỗi bidder có một mức cam kết hiệu lực: manual=amount, Auto=maxAmount.
Sắp theo mức cao nhất, hòa thì người đạt mức đó sớm hơn thắng (server sequence,
không chỉ timestamp). Với top H, mức cao thứ hai L và bước d, giá cạnh tranh bằng
start khi chỉ có một bidder, hoặc min(H,L+d) khi có >=2 bidder. Giá mới là max(giá
hiện hành, giá cạnh tranh, amount của manual bid mới nếu có), không vượt H. Manual
bid có thể nhảy nhiều bước; Auto chỉ tăng tới mức cần thiết. Đối thủ cùng một bidder
không được tự đấu với chính mình. Sequence cấp khi mức cam kết tăng, không giữ lợi
thế timestamp của một mức thấp đã gửi trước.

Ví dụ start=200k, step=50k: A Auto max400k → giá200k; B manual250k → A dẫn300k;
B manual350k → A dẫn400k; B manual450k → B dẫn450k. Nếu A/B đều Auto max400k,
người đạt trần400k trước dẫn ở400k. Nếu chỉ A manual300k, giá là300k. Giá trần không
có trong public API, SSE, audit dành cho Seller hoặc report analytics công khai.

FR-AU05: người dẫn chỉ được tăng max Auto (không tự tăng giá đang dẫn); người đã
có cam kết không được hạ/rút trong phiên. Tắt Auto nghĩa là ngừng cho phép tăng
thêm: nếu đang dẫn, giữ cam kết bằng giá hiện hành và sequence của giá đã thắng;
nếu đã bị vượt, đánh dấu inactive. Bật lại là cam kết mới ở mức tối thiểu hiện hành.
Hành động tắt không làm giảm giá, không hồi sinh bidder đã bị vượt. UI phải giải
thích tắt Auto không hủy nghĩa vụ đang dẫn. Retry cùng key không đổi thứ tự ưu tiên.

FR-AU06: BuyNow chỉ trước bid hợp lệ đầu tiên. Request BuyNow và bid cùng đến được
phân xử atomically; đúng một bên thắng. Từ 19/10/2026 ([ADR 0042](../adr/0042-buy-now-challenge-window.md)):
BuyNow là cam kết trả đúng giá buyNow, người bấm dẫn đầu, tắt BuyNow và phiên kết
thúc tại min(endAt gốc, lúc BuyNow + 60 giây). Trong 60 giây người khác vẫn trả giá
từ buyNow + bước (cả Auto); không gia hạn thêm. Hết giờ đóng phiên như FR-AU07:
người dẫn thắng theo currentPrice, Order hạn 24 giờ. Phiên BuyNowPending cũ giữ Order
15 phút. Seller đã cam kết khi mở auction nên không xác nhận lại Order.

FR-AU07: khi serverNow>=endAt từ chối bid dù worker chưa chạy. Close idempotent:
không bid → Unsold; có bidder hợp lệ → AwaitingWinnerPayment và một Order với P
bằng currentPrice (không phải maxAmount). Hạn24 giờ tính từ endAt, không từ lúc
worker chạy. Worker trễ vượt hạn ghi PaymentExpired, không kéo dài hoặc giao sách.
Lệnh thanh toán kiểm tra quyền, deadline, tình trạng và chuyển tiền/Order nguyên tử.

FR-AU08: người thắng không trả/không đủ tiền đúng hạn → PaymentExpired, không tự
charge, không tự bán cho người thứ hai. Ghi vi phạm sau xác minh đúng actor/hạn,
không tính lỗi hạ tầng là lỗi người dùng; policy hạn chế lặp theo POL-17. Không bid
bond, không phạt tiền tự động, không tái đấu tự động. Sách chưa về chủ vẫn bị giữ
khỏi kệ mua/đổi, dù Order đã hủy.

FR-AU09: yêu cầu bidder MEMBER ACTIVE verified, không là Seller/Staff đang xử lý
cuốn sách, trong vùng và có phương thức nhận hợp lệ. Tài khoản bị khóa/hạn chế trước
close hoặc Seller mất eligibility → auction OnHold, không âm thầm xóa bid/nâng
runner-up. Admin độc lập xem và Cancelled, giải phóng cam kết người mua, trả sách
hoặc giữ incident; v1.1 không resume phiên OnHold. Sau thanh toán dùng dispute/return
Order, không sửa lịch sử thắng. Không tuyên bố chống được thông đồng nhiều account.

FR-AU10: close/bid/BuyNow/disable Auto/withdraw listing, role/status change và claim
phải kiểm tra phiên/version dưới khóa. Outbox/SSE chỉ là kênh thông báo; mất kết nối
không dừng Auto server hoặc thay người thắng. Public thấy giá, thời điểm, số bidder
ẩn danh; participant thấy cam kết của mình; chỉ bộ phận điều tra độc lập được đọc
max bí mật theo quyền có audit. Tài khoản người bán không được xem trần của đối thủ.

## 7. Ngoại lệ và điều kiện kết thúc

| Tình huống | Hành vi bắt buộc |
|---|---|
| Điểm đầy giữa lúc chọn và xác nhận | Chốt thất bại rõ, không trừ tiền/giữ một nửa Exchange; chọn điểm khác |
| Chỉ một cuốn đổi đến điểm | Không mở nhận; quá hạn mở xử lý trả sách/tiền theo lỗi, không đưa cuốn đã tới cho bên kia |
| Carrier báo đến nhưng điểm chưa nhận | ArrivalReported, giữ điều tra; không bắt đầu hạn kiểm tra của Buyer |
| Buyer từ chối báo cáo trước release | Claim/cancel workflow; không giao, không quyết toán tự động |
| Không đến lấy | Overdue, nhắc hạn rồi xử lý return; đã release chiều còn lại thì dispute thay vì hủy trắng |
| Điểm mất sách trước mở auction | Incident có owner/evidence/giá bảo vệ; chưa có Buyer hoặc Order vẫn xử lý được |
| Tắt điểm sau nhận sách | Chặn mới; tiếp tục nghĩa vụ cũ, không xóa assignment duy nhất khi chưa có người thay |
| Mã nhận đúng nhưng có claim vừa mở | Kiểm tra cờ giữ lại trong transaction; không bàn giao nếu claim thắng trước |
| Trả tiền xong nhưng sách chưa thu hồi | Không đặt Available; custody và obligation còn mở |
| Mất/hỏng trên đường return | Incident tiếp tục, không giả Received/Closed; nguồn bồi thường truy vết riêng |
| Handover timeout sau commit | Retry key trả cùng receipt, một lần chuyển custody; không phát mã thứ hai để giao lặp |
| Inspection report sửa sau Pass | Tạo revision report, vô hiệu release chưa thực hiện, thông báo recipient; nếu đã giao thì incident |

Không thay đổi toàn bộ nghĩa vụ chỉ bằng một nhãn Completed. Điều kiện hoàn tất
vẫn cần đúng custody hai chiều (Exchange), hết từng inspection window, không hold,
return/dispute và journal quyết toán thành công.

## 8. Thứ tự triển khai

Đồng bộ đặc tả → contract/migration theo lát cắt → upload và moderation → nền
reservation/ledger/simulator → Order DirectDelivery và Exchange → ViaPoint
intake/inspection/handover/incident → auction dùng lại Order → RN/operations tích hợp
và nghiệm thu. Có thể xây UI theo fixture có nhãn nhưng không tính là nghiệp vụ chạy.

Đầu vào thiết kế: [mô hình và trạng thái](LOCAL_TRANSACTION_DESIGN.md).
Nghiệm thu: [use case, traceability và demo](LOCAL_TRANSACTION_ACCEPTANCE.md).
