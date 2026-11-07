# Rà soát trang hội thoại, đơn mua và trao đổi — 03/11/2026

## Phạm vi và kết luận

Owner yêu cầu khảo sát chuyên sâu trước refactor; **chưa sửa source sản phẩm**.
Source khảo sát `3fc1fa9f`, nhánh tài liệu `codex/chat-workspace-audit`.
Đối chiếu source/ADR/contract với Member web đang chạy cùng commit. Bản prototype
`design-previews/transaction-workspace` không được dùng làm baseline hiện hành.
Không đánh giá Admin/RN/Flutter như đã có cùng layout.

Trang hiện có ba vùng về mặt thị giác, nhưng code chỉ có hai vùng cấp cao:
phiếu và chat. Trong phiếu lại mount trang Order hoặc Negotiation hai cột;
Negotiation tiếp tục mount cả ExchangeDetail. Vấn đề chính là tổ chức nội dung
và quyền sở hữu vùng đọc, không chỉ palette, scrollbar hoặc bo góc.

**Cần giữ bố cục ba vai trò**: ngữ cảnh sách/thỏa thuận, công việc giao dịch,
hội thoại. Không lấy bản mock inbox hai cột vừa rồi thay toàn bộ trang thật.
Ở màn hẹp cần chuyển cách trình bày, không ép ba cột hoặc đưa hành động xuống
sau toàn bộ thông tin sách.

Không chính xác nếu kết luận mọi form Order cũ đều tích lại theo tiến độ:
OrderDetails đã render có điều kiện theo state/role. Tuy nhiên nội dung tĩnh dài,
thông tin lặp, cấu trúc lồng và thứ tự mobile vẫn đẩy công việc ra khỏi tầm nhìn.
Exchange có nhiều khối sách/tài chính/giao nhận cùng tồn tại ở trạng thái muộn.

## Bản đồ source và nguồn quy tắc

| Lớp | Nhiệm vụ hiện tại | Điểm cần giữ khi refactor |
| --- | --- | --- |
| [ChatPage](../../apps/user-web/src/pages/ChatPage.tsx#L281) | Room đúng đối tác; phiếu/chat; Socket.IO, tin nhắn, sự kiện, composer, xử lý mất ACK | Cùng room/session/messageId, draft và lịch sử; không biến chat thành lệnh giao dịch |
| [NegotiationWorkspace](../../apps/user-web/src/pages/NegotiationWorkspace.tsx#L139) | Sách/giá/mode/địa chỉ/đề nghị; nhúng Exchange đang hoạt động hoặc lịch sử | Không tự chấp nhận thay đối tác, không mất snapshot/revision hoặc pending proposal |
| [OrderDetails](../../apps/user-web/src/pages/OrderDetails.tsx#L109) | Controller chung standalone/embedded, quyền và action Order | Buyer/Seller và quyền server; đơn lịch sử/tiền/phí đã chốt |
| [OrderShipping](../../apps/user-web/src/pages/OrderShipping.tsx#L26) | Tạo/upload ảnh đóng gói, đăng ký vận đơn, đọc pickup | Giữ key/body/file/version khi retry, Ready photo, label không chứng minh pickup |
| [OrderConversationPage](../../apps/user-web/src/pages/OrderConversationPage.tsx#L15) | Đọc Order, mở/tái sử dụng room chính xác rồi redirect | Entry có thể tạo liên kết room; không coi mọi navigation là thuần read |
| [ExchangeDetailPage](../../apps/user-web/src/pages/ExchangeDetailPage.tsx#L319) | Snapshot, stepper, giao nhận, hành động, evidence, review; có nhánh embedded | Giữ projection người xem và đọc lại sau command; không gộp state Order/Exchange |
| [ActionCard](../../apps/user-web/src/components/exchange/ActionCard/index.tsx#L79) | Chọn thao tác theo state/role/deadline/pending | Một việc hiện tại; vẫn giữ hủy đồng thuận, tranh chấp, pending recovery |
| [ReviewEntry](../../apps/user-web/src/features/reviews/ReviewEntry.tsx#L17) | Đọc canReview/myReview từ server; deep link đúng transaction | Receipt cho viết sớm; không tự công bố hoặc giải phóng tiền |

Quy tắc nền: [ADR0041](../adr/0041-unified-conversation-workspace.md),
[ADR0045](../adr/0045-order-conversation-workspace.md),
[DOMAIN_RULES](../architecture/DOMAIN_RULES.md),
[review sau receipt](../adr/0052-transaction-reviews-and-reputation.md),
[gate DirectDelivery](../adr/0064-direct-delivery-completion-release-gate.md).
OpenAPI/projection hiện hành là nguồn dữ liệu/quyền, không lấy tên card hoặc tên
type trong `lib/mock` để kết luận dữ liệu đang fake. ExchangeDetail dùng type
ở thư mục đó nhưng service hiện đọc API và snapshot thật.

## Bằng chứng thực chạy

- Browser khảo sát read-only 24 cấu hình: Order Seller và Buyer trên cùng đơn
  lịch sử, Exchange của participant tại giai đoạn kiểm tra; mỗi ca ở1918/1440/
  1024/1000/961/960/390/320px. Không có pageerror trong các lượt này.
- Chuyển Phiếu/Hội thoại ở390px giữ draft của cùng room. Không gửi tin nhắn,
  upload, đặt cọc, đổi trạng thái, review, hoàn tất hoặc skip thời gian.
- Chặn REST mutation ngoài auth trong context khảo sát; không có command giao
  dịch nào phát ra trong24view. Login tạo session kiểm chứng; đây không phải
  chứng minh toàn bộ DB không có write nền của ứng dụng/worker.
- Probe responsive bổ sung xác nhận overflow do descriptionText chứa URL dài,
  không phải native file input. Session của probe bổ sung đã logout.
- Probe component SSR riêng tái hiện local shipment được render như đã tạo đơn
  dù server chưa có sentAt. Không gọi API/DB/provider. Browser fixture thử cùng
  ý tưởng trước đó timeout khi dựng harness; không tính lượt đó là PASS.
- Detector đọc bốn trang:3advisory về màu ngoài DESIGN trong Negotiation,
  không có sửa tự động. Detector không phát hiện các lỗi thứ tự/nội dung dưới đây.
- Dữ liệu chi tiết, ảnh đã che các vùng contact/description và log nằm trong
  thư mục QA private của máy khảo sát; không commit screenshot chứa thông tin
  tài khoản, API response, token, DB hoặc request body.

Độ dài dưới đây là chiều cao DOM trong vùng phiếu; khoảng cách tính từ đầu
nội dung khi scrollTop=0, không phải thời gian thao tác hoặc số thao tác thực tế.

| Ca | Viewport | Vùng đọc cao | Nội dung cao | Vị trí quan trọng |
| --- | --- | --- | --- | --- |
| Order Seller Preparing | 1440×1000 | 852px | 1083px | Nút đăng ký vận đơn ở730px |
| Cùng Order | 1000×900 | 758px | 1870px | Heading thủ tục1039px; nút đăng ký1696px |
| Cùng Order | 390×844 | 643px | 2338px | Heading thủ tục1295px; nút đăng ký2114px |
| Exchange kiểm tra sách | 1440×1000 | 852px | 4362px | Hành động3537px; card review3900px |
| Cùng Exchange | 1000×900 | 758px | 5432px | Hành động4607px; card review4969px |
| Cùng Exchange | 390×844 | 643px | 7728px | Hành động6527px; card review7081px |

Đăng ký vận đơn đang disabled vì hồ sơ khảo sát chưa có ảnh đóng gói Ready;
vị trí vẫn cho thấy nơi hoàn tất công việc bị đẩy xa. Số đo phụ thuộc dữ liệu
hiện tại, không là giới hạn cứng của mọi giao dịch.

## Phát hiện đã xác nhận

### 1. Việc cần làm không có vị trí ưu tiên ổn định — cao

[ChatPage:323](../../apps/user-web/src/pages/ChatPage.tsx#L323) nhúng trọn trang;
[Negotiation:927](../../apps/user-web/src/pages/NegotiationWorkspace.tsx#L927)
nhúng ExchangeDetail. Trong ExchangeDetail, BookInfoCard và ShippingTrackingCard
đứng trước ActionCard; review đứng sau ActionCard. Lượt đo thật cho thấy người
dùng có quyền đánh giá nhưng phải đi qua hàng nghìn pixel thông tin khác.

Định hướng: một khối trạng thái/đang chờ ai/hạn/thao tác ở đầu vùng giữa.
Thông tin tham chiếu, bước xong và hướng dẫn không đứng trước việc hiện tại.
Review sau nhận sách là thao tác phụ có điều kiện, không cần đợi Completed.

### 2. Responsive thay đổi thứ tự ưu tiên theo hướng bất lợi — cao

[DirectOrders CSS:1584](../../apps/user-web/src/pages/DirectOrders.module.css#L1584)
đổi hai cột thành một ở viewport≤1024. Card sách đứng trước nên phần thủ tục
chuyển xuống sau mọi mô tả/tài chính/địa chỉ. Trong khi đó
[ChatPage CSS:773](../../apps/user-web/src/pages/ChatPage.module.css#L773) vẫn dành
350px cho chat tới breakpoint960. Tại1000px, hồ sơ chỉ còn565px nhưng chat còn
đứng bên cạnh. Đây là cấu trúc responsive, không phải người dùng cuộn sai.

Định hướng: thiết kế theo bề rộng vùng nội dung thực tế, giữ việc hiện tại trước
chi tiết sách ở mobile. Ngưỡng ba/hai/một vùng phải phối hợp ở shell và children.

### 3. Lặp sách/tài chính/giao nhận qua nhiều lớp — cao

Negotiation đã có sách, tình trạng và ExchangeFinanceSummary; ExchangeDetail
nhúng tiếp BookInfoCard với hai sách, cân bằng giá trị, tài chính, địa chỉ;
ShippingTrackingCard lại nhắc sách/địa chỉ và hai mini-stepper. State hiện tại
được trình bày bởi stepper, badge, instruction và progress riêng.

Định hướng: mỗi dữ kiện có một nơi chủ đạo. Bên trái là ngữ cảnh gọn; ở giữa chỉ
tóm tắt khoản cần nộp/đang giữ liên quan thao tác; chi tiết mở có chủ đích.
Không xóa bằng chứng/snapshot để làm ngắn dữ liệu.

### 4. Local shipment có thể bị trình bày như sự kiện đã xảy ra — cao

[ExchangeDetail:176](../../apps/user-web/src/pages/ExchangeDetailPage.tsx#L176)
gọi saveExchangeShipment trước await confirmSent. Hàm lưu tự gán shippedAt;
[ShippingTrackingCard](../../apps/user-web/src/components/exchange/ShippingTrackingCard/index.tsx#L91)
fallback sang localStorage và dùng shippedAt đó để suy isSent.

Probe component SSR: server Preparing, viewerShipping rỗng; chỉ lưu local làm
“Chờ bạn tạo đơn” chuyển thành “Đã tạo đơn · Chờ bưu tá lấy”. Tái hiện được đường
hiển thị; chưa gửi lỗi thật lên primary để thử toàn chuỗi reject/reload.

Định hướng: nháp local chỉ phục hồi form; xác nhận giao nhận phải lấy server
projection/receipt. Mất ACK hiển thị chưa xác nhận và giữ đúng ý định retry,
không nâng thành đã gửi. Đây là rủi ro sự thật dữ liệu cần giải quyết trước khi
đóng gói card mới, không phải đổi chính sách giao nhận.

### 5. URL dài gây overflow bị che ở màn hẹp — trung bình

Đo390px: vùng Order rộng335px nhưng scrollWidth491px; document không overflow
vì ancestor khóa/cắt. Probe chỉ ra descriptionText với URL nguồn dài; CSS tại
[DirectOrders:896](../../apps/user-web/src/pages/DirectOrders.module.css#L896)
có pre-wrap nhưng không xử lý chuỗi không có khoảng trắng. Nội dung có thể
bị cắt hoặc tạo chiều cuộn phụ mà không nhìn thấy rõ.

Định hướng: xử lý URL/word wrapping trong khung chi tiết; mô tả dài mặc định
thu gọn nhưng vẫn truy cập đủ, không cắt mất nội dung gốc.

### 6. Có fallback biến thiếu dữ liệu thành “Tốt” — trung bình

[Negotiation:215](../../apps/user-web/src/pages/NegotiationWorkspace.tsx#L215)
dùng `book?.coverNote || 'Tốt'` và tương tự pages. Source xác nhận thiếu dữ liệu
cũng có thể thành nhận xét tình trạng tích cực. Chưa fault-inject API đọc sách
ở lượt khảo sát này. Order dùng snapshot cho title/condition/description nhưng
ảnh/tác giả dựa public listing, nên sách ẩn/lỗi cần trạng thái fallback trung thực.

Định hướng: không có dữ liệu phải ghi chưa tải/chưa cung cấp, cho thử lại khi lỗi;
phân biệt snapshot của giao dịch với bài đăng hiện tại.

### 7. Từ vựng tiến trình chưa nhất quán — trung bình

[OrderDetails:50](../../apps/user-web/src/pages/OrderDetails.tsx#L50) gộp InTransit,
Inspection và ResolutionPending vào bước4 của OrderProgress tên “Vận chuyển”.
Exchange có bước “Kiểm tra sách” riêng; ActionCard còn thông báo kiểu “Đang tiến
hành” trong khi mô tả đang kiểm tra. Đây là bất nhất cách trình bày; không tự
đổi state backend hoặc giả rằng dispute là một bước tiến triển thành công.

Định hướng: tách phase, trạng thái thực, người đang phải làm, deadline và thao tác.
Tranh chấp là nhánh cần xử lý có tiền đang giữ, không tô thành đã hoàn tất.

### 8. Nhãn tiền phụ thuộc paidAt thay vì tình trạng giữ tiền — trung bình

[OrderDetails:416](../../apps/user-web/src/pages/OrderDetails.tsx#L416) render câu
“Khoản tiền … đang được giữ an toàn” khi có paidAt, bao gồm trường hợp moneyHeld0
ở Completed hoặc sau hoàn. Nhánh Completed riêng không đổi câu ở card trái.
Xác nhận qua source; chưa có lượt primary Completed Order trong khảo sát này.

Định hướng: phân biệt tổng đã thanh toán/đang giữ/đã xử lý theo dữ liệu hiện có;
không suy amount0 là đã hoàn thành và không tự tính lại tiền từ giá listing mới.

## Ma trận nội dung cần thiết theo trạng thái

| Luồng/trạng thái | Việc phải nổi bật | Thu gọn nhưng còn xem được |
| --- | --- | --- |
| Hỏi sách/thương lượng | Chờ ai phản hồi; mode/giá chưa chốt; lối mở đề nghị | Mô tả dài, hướng dẫn, lịch sử giá/mode |
| Có đề nghị giá/mode | Người nào được chấp nhận/từ chối; revision đang chờ | Các lần thay đổi trước; không suy đồng ý từ tin nhắn |
| Order AwaitingPayment | Buyer thanh toán/hủy nếu server cho; Seller đang chờ; tổng và hạn | Sách/tình trạng/địa chỉ chi tiết |
| PendingSellerConfirmation | Seller xác nhận/từ chối; Buyer chờ; hạn phản hồi | Thanh toán đã ghi nhận |
| Preparing chưa label | Seller: ảnh Ready → đăng ký; Buyer: chờ, không thấy form Seller | Snapshot/tổng tiền và hướng dẫn đóng gói |
| Preparing đã label | Chờ pickup; label đã đăng ký không đồng nghĩa đã gửi | Form upload/register đã xong, chi tiết ảnh |
| InTransit | Theo dõi + nhận sách theo canConfirmReceipt; giữ tiền | Chuẩn bị và label ở dạng tóm tắt |
| Inspection | Hạn hiện có, nhận/kiểm tra khác nhau, review theo quyền | Giao nhận và ảnh; không hứa giải ngân gate chưa mở |
| ResolutionPending | Vấn đề đang chờ xử lý, report/evidence theo API, tiền còn giữ | Lịch sử/chi tiết; không cho thao tác thường lấn nhánh sự cố |
| Completed/Cancelled/Expired | Kết quả thật, khoản đã xử lý, review nếu còn quyền | Mốc trước đó; không giữ form thao tác đã hết quyền |
| Exchange Proposed | Sách hai bên/cọc/bù, lastProposedBy và quyền phản hồi | Mode/matching/giá cũ và hướng dẫn chung |
| AcceptedAwaitingFunding | Khoản còn phải nộp, ai đã nộp/chưa, hạn | Đề nghị đã chấp nhận |
| Preparing | Mỗi bên gửi/chưa gửi; điều kiện hủy đồng thuận và hạn | Tiền/sách đã chốt |
| InTransit/Delivered | Trạng thái từng chiều, receipt cá nhân, review nếu có | Đề nghị/cọc/label cũ |
| Kiểm tra Exchange | Hai hạn theo receipt, đã kiểm tra hay chưa; review + sự cố | Hai chiều giao nhận ở dạng tóm tắt |

Những hàng ngoài ba trạng thái/role đã mở trên primary được đối chiếu source/
contract, **chưa phải browser acceptance toàn bộ nhánh**. Type ExchangeDetail
là projection người xem; rawStatus và status trình bày không được đánh đồng.

## Kiến trúc refactor đề xuất

1. **Shell ba vai trò**: trái context gọn (sách/tổng/cọc/đối tác), giữa work area,
   phải chat. Phần trái không đổ cả mô tả và các nhãn bảo chứng. Header giao dịch
   duy nhất xác định mã, Buyer/Seller/participant, state và mốc thời gian.
2. **Work area**: tóm tắt bước hiện tại → một nhóm hành động ưu tiên → các bước
   đã xong dạng disclosure → bước tương lai chỉ nhãn → lịch sử mở khi cần.
   Không nhúng cả trang standalone vào một card của trang cha.
3. **Controllers giữ nguyên nghiệp vụ**: tách presentation khỏi data/command
   của OrderDetails và ExchangeDetail. View model riêng từng miền trả phase,
   whoActs, deadline, primary/secondary actions, blocked reason, pending/uncertain;
   dùng chung shell/summary/disclosure, không tạo state machine backend thứ hai.
4. **Pending state không sống theo accordion**: upload/file, key/body/version,
   proposal hoặc lost ACK phải nằm ở controller hiện có hoặc vùng giữ mounted.
   Thu gọn không được unmount rồi tạo ý định mới. Khóa thao tác ngược khi bất định.
5. **Cuộn**: desktop work area và message list là hai vùng cuộn có ranh giới rõ,
   không có scroll riêng trong từng card. Chat heading/composer không cuộn mất.
   Mobile chuyển Tiến trình/Hội thoại, thông tin sách mở ở trong tiến trình;
   thao tác hiện tại đứng trước mô tả, Back/draft giữ như source đang có.

Không thêm framework hoặc token store, không tạo API chỉ để phục vụ layout.
Không sửa GHN, migration/DB, điều kiện release, phí lịch sử, quỹ hoặc deadline.
Giữ brand/motion theo AGENTS. Tên bước không được hứa xử lý chưa có quyền.

## Trình tự gói thực hiện sau khi owner duyệt

1. Chốt bảng phase/role/action với quyền server, thêm fixture hiện trạng và
   regression cho local-shipment/pending. Giải quyết sự thật dữ liệu trước.
2. Tách controller/view và tổ chức lại cả Order + Exchange trong cùng shell;
   ưu tiên đúng hồ sơ Minh An Seller ở Preparing. Thử input/snapshot dài và
   lịch sử nhiều đề nghị, không chỉ form sạch hoặc trạng thái Completed dựng sẵn.
3. Áp visual hierarchy và responsive, kiểm toàn hành trình đọc/thao tác/ACK/
   bước tiếp/recovery, rồi tích hợp vào checkout đang dùng cùng source.

Tiêu chí kiểm chứng: thao tác hợp lệ/đang chờ/hạn thấy ngay trong viewport đầu;
không nhân bản cùng thông tin tiền/sách; mọi chi tiết cũ vẫn tìm lại được;
không overflow ở1918/1440/1280/1024/1000/961/960/760/390/320 và chữ130%;
wheel/keyboard/focus/Back/composer/draft ổn định; không mất file/intent khi collapse;
wrong owner/state, expired/stale version, retry/lost ACK giữ semantics hiện có;
tranh chấp/receipt/review không bị ẩn vì refactor. API mutation chỉ thử trên QA
replica set `_test`, storage fake/live được ghi riêng; không dùng đơn demo thật.

## Giới hạn và điểm dừng

PASS khảo sát browser nêu trên, probe SSR tái hiện và đối chiếu source/ADR.
NOT RUN: full state/action API E2E, upload/storage/provider thật, TalkBack/native,
human usability acceptance và CI mới. Chưa sửa UI/API/contract/test sản phẩm,
chưa push/PR/merge remote, chưa đóng READINESS. Bước tiếp là owner chốt gói
refactor từ báo cáo này; không coi prototype cũ là thiết kế đã được duyệt áp.


## Thực hiện sau khi owner duyệt — 03/11/2026

Nhánh `codex/transaction-workspace-refactor`, base `af6e6887`; source UI
`65ac1439`, fixture clock `5ab51c41`. Đây là bản tích
hợp vào Member web thật, không phải preview HTML. API/contract/Mongo, mốc giữ tiền
72 giờ và quy tắc công bố đánh giá không đổi.

- [TransactionFrame](../../apps/user-web/src/components/conversation/TransactionFrame.tsx)
  chia context sách/thỏa thuận và vùng thao tác; ChatPage giữ khung chat bên phải.
  Desktop có ranh giới cuộn cho từng cột, không có cuộn trong từng card; khi vùng
  phiếu hẹp hơn 680px, chỉ một vùng cuộn với hành động đứng trước context. Thứ tự
  DOM cũng ưu tiên thao tác để bàn phím/đọc màn hình không đi vào hồ sơ dài trước.
- [OrderDetails](../../apps/user-web/src/pages/OrderDetails.tsx) giữ controller,
  command và pending intents. Header nói rõ bước/ai làm; mô tả dài, địa chỉ riêng
  và hướng dẫn vào disclosure. Số tiền giữ đọc từ `moneyHeld`, không khẳng định
  vẫn giữ tiền khi giá trị đã về 0; bước Inspection mang tên kiểm tra sách.
- [NegotiationWorkspace](../../apps/user-web/src/pages/NegotiationWorkspace.tsx)
  dùng cùng frame. Khi đã có Exchange, chỉ dựng một workspace của Exchange,
  bỏ lớp thẻ sách/tiền/procedure bên ngoài; giữ lịch sử đề nghị và lối quay lại.
  Trường tình trạng trống ghi chưa có dữ liệu, không tự gán “Tốt”.
- [ExchangeDetailPage](../../apps/user-web/src/pages/ExchangeDetailPage.tsx) đưa
  bước hiện tại, ActionCard và ReviewCard lên trước tracking/hướng dẫn. Bằng
  chứng sự cố vẫn có khi ResolutionPending; ở sau hướng dẫn xử lý hiện tại.
  [ExchangeContext](../../apps/user-web/src/components/conversation/ExchangeContext.tsx)
  chỉ đọc projection đã có, hiển thị sách gửi/nhận, cọc/bù và chi tiết nghĩa vụ.
  Không tạo thêm nguồn tiền hoặc giả định thiếu số tiền bằng 0.
- [ShippingTrackingCard](../../apps/user-web/src/components/exchange/ShippingTrackingCard/index.tsx)
  chỉ dùng shipment/sentAt từ server. ConfirmSent không ghi localStorage trước
  ACK nữa; cache cũ không bị xóa nhưng không còn làm bằng chứng đã tạo/gửi đơn.
- Mất ACK khi tạo đơn: có lối tiếp tục ngay cả khi đóng hộp thoại và báo giá
  không còn hợp lệ. Nút chỉ mở lại controller/intent cũ; không tạo key/version mới.
  Dòng thông tin giao nhận không còn khẳng định có thể tạo đơn nếu báo giá cũ.
- URL dài được ngắt trong phiếu; tên đối tác dài được rút gọn trên toolbar,
  vẫn giữ đầy đủ trong heading chat. Header/composer ở trong chiều cao viewport.
  Không đổi token store, session hay motion đã thiết kế.

### Kiểm chứng và giới hạn

Bằng chứng browser là HTTP/Socket.IO fixtures riêng, không ghi/xóa DB hoặc gọi
provider; điều kiện và command thật vẫn do server quyết định. Các script đã đọc
trước khi chạy. Dữ liệu/ảnh chụp fixture có tên QA, không là giao dịch thật.

| Kiểm tra | Trạng thái/phạm vi |
| --- | --- |
| Unit Member | PASS 324 tests/47 files, gồm regression local-only shipment và phase theo vai trò/trạng thái |
| Typecheck/build | PASS; build còn cảnh báo chunk lớn vốn có |
| Lint scope | PASS exit 0; 1 warning effect trong ActionCard hiện hữu, không sửa logic đó trong gói này |
| Order chat browser | PASS: đúng room/snapshot riêng, Buyer/Seller, lost ACK payment/cancel/register/message giữ key/body/version, 403 ẩn dữ liệu cache, upload và mobile tab giữ nháp |
| Chat journey browser | PASS với screenshots tắt: thương lượng/mode/đề nghị, cùng room sau tạo đơn, missing quote + lost ACK giữ intent, Back/draft/history và View Transition vẫn chạy khi reduced-motion |
| Exchange state/role browser | PASS 64 trường hợp: Proposed/Funding/Preparing/InTransit/Delivered/ResolutionPending/Completed/Cancelled × 2 vai trò × 1440/1000/390/320px130%; đúng một workspace, bước hiện tại ở đầu, không overflow trong pane, cuộn/keyboard/draft |
| Exchange review browser | PASS: hai vai trò, receipt của chính mình + quyền server, retry quyền đọc, đúng link/form ở 1440/950/390px; không gửi review |
| Scroll browser | PASS 20 trường hợp, wheel/Control+End/Back/composer/draft; 1440/1000/961/960/950/760/390/320px, màn thấp và chữ130% |
| Detector | PASS 0 findings trên frame/context/ExchangeDetail; không thay việc xem giao diện hoặc acceptance |

Evidence riêng ở `.tmp/unified-chat-qa/`, `.tmp/order-chat-workspace-qa/`;
không commit ảnh/dữ liệu tài khoản local.

Đã fast-forward checkout ứng dụng từ `3fc1fa9f` tới `5ab51c41` sau khi xác nhận
working tree sạch. API3000 và Member5174 đang chạy; không migration hoặc đổi DB.
Browser read-only trên localhost thật PASS 12 views: Order Seller/Buyer và
Exchange Initiator/Recipient ở1440/1000/390px. Bước hiện tại bắt đầu ở179–240px
trong các view Order đã ghi; không overflow trong pane, wheel/draft/tab hoạt
động, 0 pageerror và không có transaction command. Exchange cả hai bên hiện
đúng một link Viết đánh giá; Order đang Preparing không có link đánh giá sớm.
Chỉ tạo/thu hồi phiên đăng nhập kiểm tra; không submit review/ảnh, không nhấn
nhận/gửi/kiểm tra sách, không đổi thời gian hay gọi lệnh tiền. Ảnh chụp đã che
địa chỉ/mô tả, lưu riêng ở `.tmp/transaction-workspace-real/`. Lần probe wheel
đầu chưa chờ giao diện/font ổn định không được tính PASS; lượt đủ chờ đã qua.
Browser không chứng minh mọi ảnh từ storage/provider tải thành công; đó không
là bằng chứng Supabase/live-upload của gói này. Đánh giá UI theo Pro Max + Taste +
Impeccable, xem ảnh desktop/mobile và kiểm actual scroll owner.

NOT RUN: native/RN/Flutter, upload Supabase/provider thật, E2E mutation trên DB
chính, remote CI mới. Human usability acceptance và các gate READINESS vẫn mở.
Không push/PR/merge remote trong gói này.
