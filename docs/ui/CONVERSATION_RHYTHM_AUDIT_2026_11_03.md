# Rà soát tỷ lệ, nhịp khoảng cách và thứ bậc hội thoại

Phần khảo sát ghi trạng thái trước sửa theo phản hồi owner sau refactor workspace;
kết quả triển khai sau khi được duyệt nằm ở cuối báo cáo.
Source `edc3566b`, Member web React/Vite thật tại localhost5174, API3000 và dữ
liệu demo local hiện có. Không đánh giá Expo web/RN/Flutter trong gói này.
Phần cấu trúc trước đó: [báo cáo refactor](TRANSACTION_WORKSPACE_AUDIT_2026_11_03.md).

## Phương pháp và giới hạn

- Đọc ChatPage, TransactionFrame, OrderDetails/OrderShipping, ExchangeDetailPage,
  ActionCard/ProgressStepper/ReviewEntry, CSS chung và CSS từng component.
- Áp dụng UI/UX Pro Max cho spacing/reflow, Taste app-screen cho tỷ lệ và mật độ,
  Impeccable layout cho nhóm nghĩa, reading order, rhythm và breakpoint.
  Một đánh giá AI của agent hiện tại, không là hai review độc lập hoặc nghiệm thu người thật.
- Browser Chromium headless: 24 lượt = Order Seller Preparing, Order Buyer
  Preparing, Exchange Delivered/inspection × 1920/1536/1440/1280/1100/1000/960/390px.
  Cao900px, riêng390px cao844px; chờ font. Xem ảnh tại1920/1280/1000/390 và Exchange1440.
- Chặn mọi REST mutation trừ login/logout phiên khảo sát; không có command giao
  dịch bị gọi/chặn. Không upload, gửi tin, review, thay thời gian, seed hoặc migrate.
  Phiên khảo sát được logout sau từng persona, không thu hồi phiên người dùng khác.
- Evidence riêng `.tmp/conversation-rhythm-audit/metrics.json` và ảnh đã che địa
  chỉ/mô tả. Không commit ảnh/tài khoản/token/response body. Kích thước là CSSpx,
  không suy mức zoom của ảnh owner từ kích thước PNG.
- Không chạy lại unit/build/API suite vì source sản phẩm không đổi. Chưa kiểm
  trình đọc màn hình, thiết bị native, browser zoom130%, provider/upload thật hoặc
  các trạng thái giao dịch khác trên runtime ở lượt này. Source các nhánh khác
  được đọc, không được tính như đã thực hành đầy đủ.
- Mechanical scan `detect --json --scope layout` trên Frame/ChatPage/OrderDetails/
  OrderShipping và CSS tương ứng: exit0,0 findings. Các lỗi nhịp/khoảng cách dưới
  đây vẫn tồn tại qua đo DOM và xem ảnh; detector không thay đánh giá giao diện.

## Kết luận

Ba vai trò hồ sơ / việc cần làm / chat vẫn phù hợp. Vấn đề chính là các component
đang giữ những hệ spacing/type khác nhau sau khi ghép vào cùng viewport, cùng với
hai tầng breakpoint độc lập. Thêm card hoặc giảm đồng loạt mọi khoảng trống sẽ
không giải quyết được. Cần một quy chuẩn riêng cho workspace đang thao tác.

### 1. Form có gap nhưng không tạo layout — xác nhận, ưu tiên cao

[OrderShipping](../../apps/user-web/src/pages/OrderShipping.tsx) dùng hai form
`styles.form`, label inline và các đoạn p không class. Trong
[DirectOrders CSS](../../apps/user-web/src/pages/DirectOrders.module.css),
`.workspacePage .form` chỉ có `gap:12px`, không có grid/flex. Computed style của
cả hai form là `display:block`, nên gap không tạo khoảng cách giữa children.

Ở1440px: đáy input mã vận đơn và đầu nút Đăng ký đều tại835px, gap thực0px;
nút lưu ảnh kết thúc759.4px, form tiếp theo bắt đầu759.4px. Trái lại,
[global CSS](../../apps/user-web/src/styles/global.css) đặt p margin-bottom16px;
phần hướng dẫn / số ảnh / field vì vậy cách nhau theo một cơ chế khác.

Đề xuất: hai nhóm tác vụ có cấu trúc rõ “1. Ảnh đóng gói” và “2. Đăng ký vận
đơn”, group cách24px, field nội bộ8px, field→button12px. Form dùng grid/flex thật,
label block/grid; p được scoped reset rồi đặt gap theo nhóm. Không đổi handler,
file đang chọn, pending intent, version hoặc idempotency key.

### 2. Thứ bậc chữ bị đảo — xác nhận

Order ở1440px: tiêu đề bước18.4px, mô tả bước13px, hướng dẫn đóng gói và label
16px/line26.4px, nút hành động13.6px. Văn bản phụ vì vậy nhìn gần bằng tiêu đề
và lớn hơn nút chính. Exchange lại dùng ActionCard17.6px, ReviewEntry18px và
body16px cạnh nhiều metadata13px, khiến hai loại giao dịch khác nhịp đọc.

Đề xuất vai trò rõ: tiêu đề bước20px; section16px semibold; field/body14px;
metadata/help12–13px; nút14px semibold. Line-height1.45–1.6 theo vai trò.
Đây là proposal, cần nhìn thực tế ở chữ lớn trước chốt; không đổi font thương hiệu.

### 3. Tỷ lệ cột và breakpoint không đồng bộ — xác nhận

[TransactionFrame CSS](../../apps/user-web/src/components/conversation/TransactionFrame.module.css)
chia context/stage0.75fr/1.4fr; [ChatPage CSS](../../apps/user-web/src/pages/ChatPage.module.css)
giữ chat320px. Đo outer pane, không trừ padding/viền:

| Viewport | Hồ sơ | Thao tác | Chat | Dạng hiển thị |
| --- | ---: | ---: | ---: | --- |
|1920/1536|376|702|320|3 cột, max-width1440|
|1440|354|661|320|3 cột|
|1280|298|557|320|3 cột|
|1100|242|453|320|3 cột; thao tác còn khoảng405px sau padding|
|1000|595|595|320|Hồ sơ dưới thao tác, chat bên cạnh|
|960|309|576|ẩn|Hồ sơ quay lại bên trái, chat chuyển tab|
|390|335|335|ẩn|Thao tác rồi hồ sơ, chat chuyển tab|

Nguyên nhân: query680px dựa vào container trái, trong khi chat chuyển tab ở
viewport960px. Container trái mở rộng khi chat biến mất, làm query đảo trạng
thái. Không overflow document trong24 view đã đo, nhưng reading topology thay
đổi không đơn điệu khi thu màn hình; thiếu overflow không đồng nghĩa bố cục tốt.

Đề xuất: desktop hồ sơ khoảng272–304px, chat304–336px, thao tác lấy phần còn lại
và cần tối thiểu khoảng520px. Khi không đủ chỗ, thu hồ sơ thành summary/disclosure
trước; màn hẹp hơn chuyển chat thành tab. Chọn ngưỡng từ tổng chiều rộng thực,
thử dày quanh từng ngưỡng; không chỉ thay số961 thành một số khác.

### 4. Các cột không có cùng trục bắt đầu — xác nhận

Order có SupportLink trong p riêng trước TransactionFrame
([OrderDetails](../../apps/user-web/src/pages/OrderDetails.tsx)); hàng đó cao37.1px,
chỉ nằm trên hai cột trái. Ở1440px chat header bắt đầu128px, hồ sơ/thao tác bắt
đầu165.1px. Padding hồ sơ20px, thao tác22px24px, chat10px14px; các tiêu đề cũng
không có cùng nhịp dọc. Exchange đặt SupportLink bên trong stage header nên
cùng một chức năng nằm ở chỗ khác giữa hai loại giao dịch.

Đề xuất: toolbar chung chứa Back, định danh giao dịch và Hỗ trợ; cả ba pane bắt
đầu cùng hàng. Một inset pane20px trên desktop; compact16px; cho phép điều chỉnh
quang học nhỏ ở avatar nhưng không xê dịch cả tầng header.

### 5. Khoảng cách cộng dồn ở hồ sơ — xác nhận

Hồ sơ Order dùng cardContent gap14px, disclosure margin-top18px và summary
min-height48px; sau bookProfileRow có khoảng32px trước đường phân nhóm. Payment
padding14px và gap card lại cộng tiếp. Một disclosure đóng vẫn trông như một
section rộng, dù chỉ là thông tin phụ. Không nên giảm hit target chỉ để nhỏ gọn.

Đề xuất: hồ sơ sách, thỏa thuận tiền và thông tin giao nhận là ba nhóm; giữa
nhóm24px; dòng cùng nhóm8–12px. Summary giữ hit target44–48px, bỏ margin dư ở
container cha. Dùng một nơi sở hữu khoảng cách, tránh cả parent gap lẫn child margin.

### 6. Ô chat rỗng vẫn có scrollbar — xác nhận

Ở desktop cả ba persona: textarea rỗng, border-box cao57px, clientHeight55px,
scrollHeight57px. Placeholder dài xuống hai dòng. `rows=1`, effect auto-size
trong [ChatPage](../../apps/user-web/src/pages/ChatPage.tsx) gán height bằng
scrollHeight nhưng box-sizing border-box; chênh2px phù hợp phần border chưa
được bù. Effect chỉ phụ thuộc body, không phụ thuộc thay đổi độ rộng.

Đề xuất: placeholder ngắn “Nhắn tin…”, hướng dẫn Enter/Shift+Enter ở help riêng
khi cần; autosize tính border đúng, chỉ cuộn khi đạt max-height, cập nhật lúc
thay container width/tab. Nút gửi và input căn cùng đáy, khoảng8px; kiểm draft
nhiều dòng và không tự gửi trong phép thử.

### 7. Thiếu phân đoạn rõ trong bước gửi sách — xác nhận thiết kế

Stepper → deadline → địa chỉ → đoạn hướng dẫn → số ảnh → field → nút → field →
nút là một chuỗi liên tục. Số ảnh “0” tách rời field, nút disabled chưa nói rõ
dependency ngay bên cạnh. File input hiển thị nhãn browser tiếng Anh giữa UI tiếng
Việt. Dù chức năng có mặt, người dùng chưa nhìn ra hai mốc hoàn thành riêng.

Đề xuất: nhóm upload có nhãn, trạng thái ảnh đã được server xác nhận và nút lưu;
nhóm vận đơn có field, ví dụ định dạng/hint và lý do chưa đăng ký được. Không
tráo chọn ảnh thành đã lưu, đăng ký vận đơn thành đã bàn giao. Giữ mọi cảnh báo
và retry, có thể gom đoạn giải thích dài thành helper của đúng nhóm.

### 8. Exchange lặp trạng thái và deadline — xác nhận runtime/source

[ExchangeDetailPage](../../apps/user-web/src/pages/ExchangeDetailPage.tsx) ghép
stage heading, compact ProgressStepper, ActionCard và ReviewCard.
[ProgressStepper](../../apps/user-web/src/components/exchange/ProgressStepper/index.tsx)
compact vẫn có header “Bước4/5 · Kiểm tra sách”, pill72h và đường tiến trình;
[ActionCard](../../apps/user-web/src/components/exchange/ActionCard/index.tsx)
lại có “Hành động tiếp theo”, role badge, callout và3 dòng hạn kiểm tra. Ở view
inspection đã đo, ý chờ giữ cọc và kiểm tra lặp ở nhiều tầng; review là một card
lớn ngay bên dưới. Tất cả đúng chức năng nhưng tranh nhau vai trò đầu mối.

Đề xuất: một tiêu đề bước + một trạng thái, một summary deadline chung, các mốc
riêng từng bên trong disclosure. Giữ người đang chờ và hạn cá nhân khi khác nhau,
không rút về một timestamp giả. Review vẫn dễ thấy ngay sau receipt và đọc quyền
server; không đợi72h mới hiện. Dùng cùng type/space của Order, không xóa semantics.

### 9. Empty chat chưa bám đúng giai đoạn — xác nhận

Exchange đang kiểm tra sách nhưng empty copy vẫn nói hỏi tình trạng/giá “trước
khi gửi thông tin nhận sách”. Nhánh empty trong ChatPage phân biệt orderId và
non-order, chưa phân biệt Exchange đang thực hiện. Empty block căn giữa cao,
composer ở đáy khiến ý hướng dẫn ban đầu xa nơi gõ; khoảng trắng của chat tự nó
không phải lỗi cần lấp bằng thêm card.

Đề xuất: empty message ngắn theo loại và giai đoạn, gợi ý trao đổi về nhận/kiểm
tra khi đang inspection. Giữ canvas hội thoại trống cho tin thật. Không thêm
quick action trùng command giao dịch vào chat; gợi ý chỉ điền draft, không tự gửi.

### 10. Focus và nền trang — xác nhận source, ưu tiên sau cấu trúc

TransactionFrame luôn cho tabIndex0 ở columns, stage và context. Desktop columns
không cuộn nhưng vẫn là tab stop. Viền đỏ ôm hai pane trong ảnh owner phù hợp
focus ring của vùng này; ảnh khảo sát không focus thì không có viền đỏ thường trực.
Không đủ cơ sở gọi đó là lỗi border luôn hiển thị.

Đề xuất: chỉ scroll owner thực mới nhận tab stop/focus phù hợp; vẫn giữ focus-visible
rõ. Đồng thời nền mùa thu/animation đang nhìn thấy trong vùng tác vụ và ảnh chụp.
Nếu tinh chỉnh, dùng bề mặt đọc kín hơn và phân lớp, giữ authored motion theo AGENTS;
không đổi OS preference, không tự bỏ animation để làm trang yên hơn.

## Hướng sửa thành một gói

Mục tiêu đọc: **đây là giao dịch nào → đến bước nào/ai cần làm → làm ngay ở đâu →
kết quả đã được xác nhận chưa → bước tiếp → thông tin/chat khi cần**.

| Vùng | Nội dung chính | Thu gọn / thứ yếu |
| --- | --- | --- |
| Toolbar | Back, loại/mã giao dịch, Hỗ trợ | Không lặp mã ở mọi card |
| Hồ sơ | Sách và người trao đổi, tiền theo thỏa thuận | Ghi chú dài, địa chỉ, lịch sử |
| Thao tác | Bước hiện tại, người cần hành động, deadline, form/CTA | Bước đã qua, mốc chi tiết, hướng dẫn dài |
| Chat | Đối tác, tin nhắn thật, ô soạn và gửi | Empty ngắn đúng giai đoạn; không dựng thêm dashboard |

Spacing đề xuất dùng vai trò: label→input6–8px; trong nhóm12px; giữa nhóm24px;
pane inset20px, compact16px. Không ép mọi gap bằng nhau. Thứ bậc hành động:
CTA đang khả dụng đứng đầu, pending/retry giữ ngay tại thao tác, việc phá hủy
hoặc báo sự cố có cấp riêng, không lấn át nhiệm vụ khi không cần.

Ưu tiên triển khai: (1) form/group/type + composer; (2) tỷ lệ/breakpoint/toolbar
và trục căn; (3) thống nhất Order/Exchange state summary và empty copy. Đây là
các phần trong một gói UI, không thêm feature/API/state mới.

## Tiêu chí kiểm chứng gói sau khi được duyệt

- Đo spacing thực: input→nút không0px; nhóm1/nhóm2 rõ; không cộng dồn gap/margin.
- Màn desktop thấy được đầu nhóm thao tác chính trong viewport đầu; mobile thấy
  đầu hành động trước hồ sơ phụ. Không cắt label vì ép chiều cao hoặc giấu retry.
- 1440/1280/1100/1000/960/390/320px, màn thấp và chữ130%; kiểm sát hai bên mỗi
  breakpoint, bố cục không đảo lại vì container rộng lên sau khi ẩn chat.
- Ô chat rỗng/một dòng không scrollbar; nhiều dòng chỉ cuộn khi đạt cap; draft
  giữ khi resize, chuyển tab, lỗi gửi và Back. Không gửi tin thật khi chỉ đo UI.
- Đối chiếu fixture Proposed/Funding/Preparing/InTransit/Inspection/Resolution/
  Completed/Cancelled của hai vai trò, dữ liệu dài/loading/error/mất ACK. Mọi
  quyền/money/version/key/body/hold72h/publication review giữ nguyên.
- Scroll owner đúng trên wheel/keyboard; focus không bị header/composer che;
  motion còn chạy theo chính sách. Ảnh before/after cùng viewport/state/data.
- Human acceptance vẫn cần owner thử; test xanh hoặc detector0 không tự chứng
  minh người dùng đọc hiểu được. READINESS giữ nguyên.

Khuyến nghị làm gói chuẩn hóa form + hệ khoảng cách và chữ trước: đây là nguyên
nhân trực tiếp của phản hồi “chỗ sát, chỗ thừa” và là nền cho việc chỉnh tỷ lệ.

## Triển khai sau khi owner duyệt — 03/11/2026

Nhánh `codex/conversation-rhythm-refinement`, code `b75dda85` trên base5384daeb.
Giữ phần khảo sát phía trên như bằng chứng before, không diễn giải số đo cũ thành
source hiện tại. Chỉ sửa Member web, không API/contract/migration/nghiệp vụ tiền.

- Context desktop288px, stage lấy phần còn lại, chat320px. Dưới1280px hồ sơ được
  thu vào nút mở/đóng, nội dung vẫn mounted; dưới961px chat chuyển tab và thao tác
  đứng trước hồ sơ. Không còn re-enter grid khi thu viewport từ1000 xuống960.
- Scroll owner nhận tab stop theo layout; preview bìa ở hồ sơ thu gọn giữ một
  identity chuyển cảnh. Hỗ trợ Order/Exchange lên toolbar, chọn đúng active hoặc
  history transaction. UI giai đoạn dùng role/type/spacing nhất quán hơn.
- Hai form đóng gói/vận đơn dùng grid thật, label gap8, nội bộ12, giữa nhóm24px;
  có tên nhóm, hint định dạng gắn aria-describedby và file picker tiếng Việt.
  Input file thật vẫn focus/click được; handler/pending/key/body/version không đổi.
- Composer placeholder ngắn, help riêng; height bù border và ResizeObserver chỉ
  phản ứng width/visibility, có RAF cleanup. Lượt đầu phát hiện observer loop đã
  sửa, browser cuối không còn lỗi. Empty Exchange khớp bối cảnh giao nhận/kiểm tra.
- Compact Exchange bỏ header trạng thái trùng, giữ stepper và current heading;
  hạn từng bên ở disclosure, hạn chung luôn thấy, không xóa khác biệt timestamp.
  Review giữ server eligibility và rule72h/48h. Motion preference policy giữ nguyên.

| Kiểm tra | Evidence cuối |
| --- | --- |
| Member build/typecheck | PASS; cảnh báo chunk500k cũ |
| Unit | PASS324/47files |
| Scoped lint | Exit0;1warning effect có sẵn trong ActionCard |
| Order/chat browser | PASS quyền, snapshot, upload giả, mất ACK/retry, draft; thêm kiểm khoảng cách form, composer rỗng và breakpoint1440/1280/1279/1100/1000/961/960 |
| Full chat browser | PASS lost ACK, same-room order, lịch sử, draft/error, View Transition420/340 và reduced-motion420; test mở hồ sơ thu gọn trước đọc thông tin |
| Exchange workspace | PASS64 state/role/size cases |
| Scroll | PASS20 ca wheel/keyboard/Back/short viewport/chữ130% |
| Review entry | PASS hai vai trò, receipt/server permission, retry và exact deep link; không submit review |
| Layout detector | Exit0,0 findings; không thay kiểm ảnh |
| Runtime read-only |24views,0pageerror,0transaction command,0document horizontal overflow |

Runtime after ở1440px: context288/stage727/chat320 so với354/661/320 trước;
stage bắt đầu128px cùng mép chat thay vì165.1px. Form display:grid/gap12, hai
group cách24px. Composer rỗng border-box40px/client38/scroll38, không scrollbar.
Đã xem ảnh sau ở1920/1000/390 và Exchange1440; evidence riêng
`.tmp/conversation-rhythm-after/`, fixture evidence ở các folder QA đã dẫn.
Ảnh bìa provider chưa là bằng chứng mọi ảnh đều tải; không kiểm upload/storage thật.

Đã fast-forward checkout Documents lên code khi giữ nguyên4file local chưa commit
về uy tín/reviews/support; các file đó không nằm trong commit gói. Có lưu patch
riêng trước tích hợp, không stash/reset/clean. Không restart API/DB hoặc ghi dữ
liệu giao dịch. Native, live provider, CI mới và human acceptance NOT RUN; chưa
push/PR/merge remote, READINESS giữ nguyên. Owner có thể xem trực tiếp `/chat`.
