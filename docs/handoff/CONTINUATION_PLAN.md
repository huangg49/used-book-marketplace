# Kế hoạch triển khai tiếp cho team

Ngày 28/09/2026. Đây là backlog có thứ tự và điều kiện mở, không là danh sách tính
năng đã triển khai. Chủ dự án đã yêu cầu kế hoạch đủ dài cho người tiếp nhận làm
liên tục, ưu tiên RN và UI có bản sắc. Không có deadline ép bỏ qua chất lượng.
Hiện tại đóng tại F2h/OpenAPI 0.20.0; [READINESS](READINESS.md) là gate trước nghiệp vụ mới.

## 1. Cách chọn việc và chia nhánh

Đọc [SESSION_STATE](SESSION_STATE.md), [START_HERE](START_HERE.md), AGENTS trước.
SRS1.1, phụ lục TP.HCM và ADR là nguồn nghiệp vụ; kế hoạch này không sửa policy.
Đánh dấu mỗi gói `TODO / IN_PROGRESS / BLOCKED / DONE`, kèm evidence và commit.
Ban đầu mọi gói dưới đây là TODO; A00 có blocker runtime đã ghi, chưa có fix.

Mỗi gói là một hoặc vài PR nhỏ, không ghép toàn roadmap vào một lần code/merge.
Dùng nhánh `codex/<task-id>-<topic>` từ nhánh tích hợp mà team đã xác nhận. Khi
chưa merge bàn giao, nhánh nguồn là `codex/handoff-roadmap`, không phải main cũ.
Không cherry-pick riêng commit UI rồi bỏ baseline backend phía dưới.

Một gói kết thúc khi code + dữ liệu/contract cần thiết + kiểm thử + tài liệu +
giới hạn đều có. Khi bị chặn phần runtime, có thể đọc/review/design phần độc lập;
không dùng thời gian chờ để mở workflow còn thiếu gate. Không tự reset DB hay sửa
test để che lỗi. Tự quyết định chi tiết triển khai trong scope, ghi lại tradeoff.

## 2. Thứ tự và các mốc dừng

| Mốc | Gói việc | Kết quả phải nhìn thấy |
|---|---|---|
| M0 — tiếp nhận | A00–A03 | Biết chạy dự án, biết vì sao Android chạy/chưa chạy, review có người phụ trách |
| M1 — app hiện có dùng tốt | U01–U06 + Q01–Q03 | Form mobile tốt, UI thống nhất, native acceptance/evidence và release gates đóng |
| M2 — thiết kế giao dịch tiếp | D01–D03 | Chốt transition/tiền/custody/claim trước implementation |
| M3 — một Order chạy hết | T01–T05 | Nhận sách, inspection, ngoại lệ, return/settlement có invariant và test |
| M4 — Member dùng được | C01–C05, O01–O02, N01 | Ví/checkout/đơn, ops và thông báo có backend thật; demo đầu-cuối |
| M5 — phần mở rộng | E01–E03 → P01–P03 → AU01–AU03 | Đổi, qua điểm rồi đấu giá tối giản trên cùng nền |
| M6 — củng cố | X01–X03 | Onboarding, vận hành/đối soát, thiết bị và tài liệu release |

M0/M1 không cần làm lại các test đã đóng nếu nguồn liên quan không đổi. M2 chỉ
triển khai nghiệp vụ sau khi đóng gate bàn giao; có thể đọc SRS/lập câu hỏi từ sớm.
Các màn C01/C02 có thể làm dưới cờ nội bộ sau M1 với API hiện có. Chưa mở nút mua
cho Member như một luồng hoàn chỉnh trước M3 và các nhánh lỗi bắt buộc.

## 3. M0 — Tiếp nhận và tháo chỗ dở

### A00 — Chẩn đoán Android splash

- Đọc SESSION_STATE và SHELF_DETAIL_REVIEW; tái hiện trên nguồn hiện tại, ghi API
  base URL, reverse, build variant, thiết bị, Metro/bundle và trạng thái tải font.
- Kiểm `src/app/_layout.tsx`, BrandProvider/font và splash lifecycle; phân biệt
  lỗi môi trường/bundle với logic app. Thu log hẹp, không chép token/request body.
- Không đoán rồi thêm timeout ẩn splash để che lỗi. Không clear app data/đăng xuất
  hoặc rebuild vô cớ. Chỉ restart đúng process khi môi trường cho phép và cần thiết.
- **DONE:** cold start, mở `/`, deep link `/showcase`, Back và reopen lặp lại được;
  ghi nguyên nhân hoặc giới hạn còn lại. Nếu sửa code thì test đường lỗi tương ứng.

### A01 — Nhận môi trường trên máy bạn

- Clone nhánh bàn giao; Node theo `.nvmrc`, pnpm theo `packageManager`; frozen install,
  generate, migrate và seed local theo START_HERE. Không chép DB/.env của máy cũ.
- Chạy API, media/order worker, RN và operations ở process riêng; kiểm readiness.
  Setup Android SDK/AVD hoặc điện thoại; URL localhost/LAN theo hướng dẫn RN.
- **DONE:** người nhận tự mở kệ/account/operations; media live nếu có cấu hình hợp lệ.
  Ghi rõ test giả lập/provider thật. Không bắt chạy lại toàn baseline trên máy cũ.

### A02 — Rà source và review độc lập

- Dùng R01–R09 trong INDEPENDENT_REVIEW, mở rộng diff sau target lịch sử `76230ca`
  đến SHA đang nhận: worker startup, mobile session consumers và presentation.
- Reproduce phát hiện bằng focused test; auth/tiền cần negative và race có barrier.
  Phân công reviewer theo TEAMWORK; AI hỗ trợ đọc nhưng không tự ký thay người.
- **DONE:** findings có invariant, mức độ, fix/evidence; owner và reviewer thứ hai
  cho tiền/quyền/tranh chấp ký phạm vi đã đọc. Ghi phần chưa review riêng.

### A03 — Sổ tiến trình chạy dài

- Sau từng gói cập nhật SESSION_STATE và một báo cáo ngắn, không đổi lịch sử PASS.
- Chốt trạng thái process đang chạy, thay đổi local và commit/branch để phiên sau
  không làm lại. Chỉ ghi metadata cấu hình, không sao chép secret hoặc PII.
- **DONE:** người khác chỉ đọc repo là biết bước tiếp theo, không cần lịch sử chat.

## 4. M1 — Nâng giao diện đã có trước khi thêm màn mới

Nguồn thiết kế: `docs/design/UI_CODING_RULES.md`, `UI_COMPONENTS.md`,
`packages/brand/v1.1/README.md`. Nền giấy/chữ rừng/Lora/Be Vietnam Pro/dấu cam là
ngôn ngữ hiện tại. Bản sắc đến từ sách và việc chuyền tay; không thêm gradient,
card dày đặc, rating/trust badge giả hoặc khẩu hiệu vào mọi vùng tác vụ.

### U01 — Chốt hướng kệ/chi tiết với người dùng

- Dùng `/showcase` xem bìa hợp lệ/tên dài/thiếu ảnh; đối chiếu `/` thật khi có bài
  đã duyệt. Chỉ tinh chỉnh những vấn đề quan sát được; không vẽ một app mẫu riêng.
- Entry: `features/shelf/{shelf-grid,book-presentation,book-gallery,public-photo}.tsx`.
  Ưu tiên vùng nhìn đầu, ảnh/tên/tác giả/giá, nhịp cuộn và khả năng chạm.
- **DONE:** ảnh before/after 320/390, Android chữ thường/130%, missing/error/loading;
  giá bán/đổi rõ, modal Back đúng, không tràn. Có phản hồi thẩm mỹ thực tế của user.

### U02 — Form đăng sách theo từng nhóm tác vụ

- Entry: `features/drafts/draft-editor.tsx`, `catalog-picker.tsx`, `draft-media.tsx`,
  `fulfillment-fields.tsx`, `lifecycle-command.ts`. Đọc RN_LISTING_SUBMISSION_REPORT.
- Tổ chức nhóm: đầu sách → ảnh bản sách → tình trạng → hình thức/giá → nơi gửi →
  xem lại. Chọn section/stepper dựa trên thao tác, không tạo thêm bước chỉ để trang trí.
- Nút lưu/gửi thuận tay và tránh keyboard; lỗi mở đúng nhóm và tới ô đầu tiên.
  Cho xem tổng hợp trước gửi. Hiển thị tiến trình chỉ từ dữ liệu thực sự đã nhập/lưu.
- Giữ dữ liệu khi lỗi/đổi nhóm, dirty Back, upload status, expectedVersion và retry
  cùng key/body khi mất ack. Chuyển bước không được ngầm publish hoặc mất command.
- **DONE:** tạo nháp → reopen → submit → rejected → sửa/resubmit; approved edit,
  conflict, mất phản hồi và ảnh hỏng; native picker/keyboard/font lớn đều có evidence.

### U03 — Sổ địa chỉ và chọn nơi gửi

- Entry: `features/addresses/{addresses-screen,address-command}.tsx/.ts` và
  fulfillment-fields. Đọc ADDRESS_BOOK_REPORT và LISTING_FULFILLMENT_REPORT.
- Danh sách dễ phân biệt địa chỉ mặc định; thêm/sửa có nhóm người nhận, liên hệ,
  vùng, chi tiết. Sheet chọn địa chỉ không ép kéo dài mới chọn được.
- Giữ quy tắc tối đa/default, snapshot version và dữ liệu khi conflict; không tự
  chuyển mọi địa chỉ sang TP.HCM. Mã vùng mô phỏng không được gọi là điểm giao sách.
- **DONE:** create/edit/delete/default, stale version, mất ack, dirty Back, keyboard
  số/địa chỉ, tên dài và chữ lớn; không lộ contact trên public listing.

### U04 — Sách của tôi và tài khoản

- Entry: drafts-screen, lifecycle-actions, account/auth và member-navigation.
- Tổ chức bài theo trạng thái/hành động kế tiếp: nháp, chờ duyệt, bị từ chối,
  công khai, ẩn/lưu trữ. Giải thích trạng thái bằng dữ liệu thật, không bịa số đếm.
- Account làm rõ profile, sổ địa chỉ, nghĩa vụ còn lại của LOCKED/RESTRICTED;
  không mở chức năng mới bằng client capability. Không thêm nút chết.
- **DONE:** trạng thái rỗng/lỗi/retry, guest/Member/LOCKED/RESTRICTED, session đổi
  người xóa cache, vị trí cuộn giữ hợp lý. Không lặp suite auth nếu không đổi auth.

### U05 — Hoàn thiện bộ điều khiển dùng chung

- Chỉ bổ sung component khi có nhu cầu từ U01–U04: section header, action area,
  field summary hoặc selector. Dùng composition; không viết form engine tổng quát.
- Sửa core/ui thì cập nhật `/ui`, các consumers và tương phản/focus liên quan.
  Đo vùng chạm, loading/disabled, Back/Escape và khôi phục focus thực tế.
- **DONE:** không màu/font tùy tiện, không mất focus/mất dữ liệu khi lỗi; không
  modal hóa mọi lỗi. Component không gọi API/session hoặc chứa fixture.

### U06 — Chốt nội dung, chuyển động và states

- Rà microcopy tiếng Việt, formatting VND, loading/empty/error/offline/ảnh thiếu;
  trạng thái chờ tiền/đối soát cần chính xác hơn câu “thành công”.
- Chỉ thêm chuyển động giúp định hướng, hỗ trợ giảm chuyển động. Không triển khai
  dark mode, icon pack mới hoặc đổi brand lớn khi chưa có nhu cầu đã xác minh.
- **DONE:** walkthrough tất cả màn hiện có; ghi ảnh/lỗi đã sửa; không còn CTA giả,
  thuật ngữ backend trong sản phẩm hoặc màn trắng khi có thể hiển thị lỗi phục hồi.

### Q01–Q03 — Đóng chất lượng và bàn giao

- **Q01 Native:** tiếp tục N01–N21 còn mở: picker hủy/quyền từ chối/file lỗi,
  upload thất bại/mất mạng/retry, background/foreground, expiry session, toàn listing,
  modal focus, TalkBack, font/keyboard. Không dùng web thay native; không đổi PASS cũ.
- **Q02 Build/rebuild:** build Android sau thay đổi native/tài nguyên; smoke trên
  artifact ghi rõ ABI/device. Máy người nhận kiểm setup; iOS/ARM chưa chạy ghi N/A
  có lý do và gate tương ứng, không ghi PASS. Export thường phải chặn preview routes.
- **Q03 Close:** tổng hợp screenshot, findings/review, lệnh test và limitations;
  cập nhật READINESS. Chỉ tag release khi các gate bắt buộc đã đóng. Không dùng
  điểm lưu code/bundle làm release. CI và reviewer theo TEAMWORK trước merge main.

## 5. M2–M3 — Hoàn tất vòng đời mua trực tiếp

Đọc trước: ADR 0013, 0017–0025; COMMITMENT_DESIGN/ACCEPTANCE,
TRANSACTION_FOUNDATION_PLAN và SRS1.1. Chi tiết dưới là thứ tự đề xuất cho phần
chưa triển khai; không ấn định API/state mới trước review thiết kế.

### D01 — Bản thiết kế Delivered/receipt/inspection

- Lập actor × command × state × deadline; phân biệt carrier báo giao, Buyer xác
  nhận nhận và Buyer phủ nhận nhận. Hạn 72h không rút ngắn vì Buyer bấm nhận sớm.
- Xác định nguồn thời gian, evidence bất biến, version/policy pinned, trùng/lệch
  thứ tự event, conflict với review đang mở và quyền LOCKED nghĩa vụ cũ.
- **DONE:** ADR + transition table + wire contract dự kiến + test matrix, chưa
  ghi implemented. Kiểm trace AC-14/AC-16 và FR-D01 cùng phần chuẩn hiện hành.

### D02 — Thiết kế claim, review resolution và custody

- Các PickupReview/CarrierReview/DeliveryReview hiện là intake, không có kết luận.
  Thiết kế assignment, thẩm quyền/độc lập, evidence access, decision có audit,
  tranh chấp/return và đường thiếu tiền/không rõ custody.
- Không biến ảnh hoặc báo chưa nhận thành tự refund/restock. Liệt kê quyết định
  nào cho release tiền/sách và điều kiện nào buộc giữ nguyên.
- **DONE:** decision matrix đầy đủ trường hợp, review quyền/SQL/tiền; yêu cầu
  nào chưa chốt ghi trong decision log, không tự sáng tác workflow ẩn trong UI.

### D03 — Thiết kế settlement và phí ứng ship

- Đối chiếu code thực tế với SRS về Seller ứng S tại pickup, công thức P−C+S,
  carrier nhận S một lần và nền tảng nhận C. Không giả định pickup hiện tại đã
  thực hiện toàn bộ phần tài chính mục tiêu; ghi gap và thứ tự bổ sung rõ ràng.
- Lập bảng nguồn/đích journal, hold/release, pending/failure/retry và chuyển quyền
  sở hữu; tách account balance khỏi nguồn incident POL-42.
- **DONE:** invariant tiền bảo toàn, decision source được phép, migration/upgrade
  strategy cho record cũ và race matrix được reviewer tiền/quyền chấp nhận.

### T01 — Delivery event và inspection có backend thật

- Phụ thuộc D01, các gap bắt buộc D03. Contract-first, migration additive, executor
  hiện có, global dedupe/replay/auth và khóa cùng fulfillment/hold protocol.
- Event muộn/lặp/đảo thứ tự không lùi trạng thái hay tự giải quyết review. Buyer
  receipt không được kết thúc thời gian khiếu nại hoặc chuyển tiền sớm.
- **DONE:** real DB negative/race/rollback/upgrade, boundary deadline, worker restart
  và replay. Cập nhật OpenAPI/generated types/ADR/report; chưa gọi là completed sale.

### T02 — Claim và hồ sơ bằng chứng riêng tư

- Phụ thuộc D02/T01: Member khai báo đúng thời hạn/quyền; giữ nguyên bằng chứng,
  retention/budget/auth sau I/O, private reads đúng người; xử lý denial-of-delivery.
- **DONE:** duplicate/replay/race với timeout/settlement; LOCKED nghĩa vụ cũ;
  evidence không tự thay đổi custody/ledger và không bị listing cleanup xóa.

### T03 — Giải quyết review và return

- Thực thi decision/assignment/độc lập từ D02. Phân biệt lỗi Seller/carrier/điểm/
  Buyer theo bằng chứng; return có xác nhận custody, kiểm tra sách và trạng thái tiếp.
- **DONE:** không tự restock sách đã đổi tình trạng, không dùng pre-acceptance
  refund sau acceptance. Quyết định lặp/đồng thời, thiếu nguồn, khiếu nại còn mở
  đều giữ invariant; audit giải thích ai quyết định và vì sao.

### T04 — Settlement worker và chuyển quyền sở hữu

- Phụ thuộc T01–T03/D03: chỉ settle khi deadline/quyết định cho phép; posting,
  release/transfer và receipt atomic. Worker bounded retry, không mất hold khi lỗi.
- **DONE:** race claim–settlement/return–settlement, replay worker, DB failpoint,
  balanced journal và nguồn hữu hạn. Không Admin UPDATE balance hay âm available.

### T05 — Diễn tập một đơn thật và ngoại lệ

- QA backend có dữ liệu fixture riêng: approved listing → quote → Order → funding
  → Seller accept → packaging/label → independent pickup → delivery → inspection
  → settlement; thêm denial, quá hạn, claim/return và lỗi posting.
- **DONE:** trace từ SRS đến API/test, read-only reconciliation khớp, review độc lập;
  chỉ sau đó mới mở luồng Member mua direct. Simulator luôn có nhãn mô phỏng.

## 6. Những tính năng nên khởi động sớm sau M1

Đề xuất ưu tiên **đọc nghĩa vụ/ví trước, checkout sau** để tận dụng backend đã có.
Không cần đợi Exchange/auction mới cho team thấy sản phẩm tiến bộ. UI cho tính năng
chưa có API chỉ được là fixture có nhãn, không tính là hoàn thành.

### C01 — Ví và lịch sử chỉ đọc

- Dùng API 0.13+ hiện có, TanStack Query/session owner chung. Số available/held và
  lịch sử theo projection server; không tự cộng từ array đang phân trang.
- **DONE:** lịch sử/pagination, lỗi/retry, LOCKED được xem đúng quyền; không có nút
  rút/điều chỉnh giả, không gọi nguồn mô phỏng là tiền thật hay quỹ sự cố.

### C02 — Danh sách/chi tiết Order và việc cần làm

- Phụ thuộc M1: render snapshot trạng thái/backend thật, deadline theo server,
  receipt khác projection mới nhất, pinned private images/contact đúng người.
- Có thể bắt đầu read-only trước M3; mutation chỉ mở khi có contract/handler/test
  và path xử lý lỗi đầy đủ. Không có nút “hoàn tất review” khi API chưa hỗ trợ.
- **DONE:** Buyer/Seller/ngoài cuộc, LOCKED/RESTRICTED, stale data/mất mạng/session
  expiry, empty/history; không suy quyền bằng vai trò client hoặc giấu nút đơn thuần.

### C03 — Nạp mô phỏng có operator độc lập

- Member tạo intent/theo dõi lịch sử theo API. Operator UI/CLI riêng gọi adapter
  đã ký, không đưa signing secret xuống frontend. Member không tự credit tài khoản.
- **DONE:** pending/success/ReviewRequired/duplicate/out-of-order, nguồn demo cạn;
  không refill SQL. Ghi đúng mô phỏng và tách quyền TEST_OPERATOR khỏi participant.

### C04 — Quote/checkout/funding/hủy

- Mở sau T05/C01/C02/C03. Chọn địa chỉ, server quote, tách P/S/tổng, xem lại thay
  đổi/expiry; create Order không đồng nghĩa đã thanh toán hoặc Seller đã chấp nhận.
- Retry mất ack giữ key/body/version; timeout không tự tạo Order/payment mới.
  Hủy/hoàn phân biệt requested/pending/posted; không thông báo nhận lại tiền sớm.
- **DONE:** hết hạn quote/order, hai Buyer tranh sách, insufficient funds, account
  đổi quyền, paid cancel và accepted cancellation đúng policy; Android E2E có lỗi.

### C05 — Seller fulfillment và Buyer nhận/báo sự cố

- Accept paid obligations, ảnh đóng gói private, register/read label, read carrier
  status. Buyer overdue non-receipt theo API hiện có; receipt/claim chỉ khi T01/T02 có.
- **DONE:** không edit/replace tracking đã seal, không dùng label chứng minh pickup;
  upload lỗi, late event, review blocked, LOCKED nghĩa vụ cũ và Back đều đúng.

### O01–O02 — Operations hỗ trợ giao dịch

- **O01:** queue/detail review/claim/assignment theo D02/T03; cần thêm read API thì
  contract-first, không truy cập database trực tiếp từ web. Preview chứng cứ có
  quyền, actions có reason/expectedVersion/retry/conflict và audit.
- **O02:** simulator tooling cho TEST_OPERATOR độc lập và read-only reconciliation
  report; không dùng nút “duyệt” để giả carrier event hoặc sửa số dư.
- **DONE:** mỗi actor thấy đúng quyền/phạm vi, mất quyền trước replay vẫn bị chặn;
  keyboard/focus và 320/desktop. Human review theo TEAMWORK trước merge.

### N01 — Hộp thư thông báo bền vững

- Khởi động thiết kế sớm cùng D01/D02 vì deadline ViaPoint dựa trên notification
  lưu bền vững. Outbox cùng transaction; inbox/dedupe, read/unread, deep link có
  quyền; push/email chỉ là kênh bổ sung và không là nguồn deadline.
- **DONE:** retry/restart không tạo tác động hai lần; xem thông báo không leak PII;
  notification gửi ngoài lỗi không đổi mốc nghiệp vụ. Không cần mua dịch vụ push
  để hoàn tất hộp thư trong app; chọn provider sau nếu có nhu cầu được chốt.

## 7. M5 — Đổi sách, điểm giao và đấu giá

### E01–E03 — Exchange

- **E01 Proposal:** sau M3, đọc F3/COMMITMENT và SRS AC-17–23. Proposal/revision,
  counter, quota và unique unordered pair. Không khóa sách vĩnh viễn từ lời đề nghị.
- **E02 Accept/funding:** giữ hai sách atomic qua reservation chung; cọc mỗi bên
  bằng giá trị sách sẽ nhận, Δ đúng phía. Direct Exchange mỗi bên trả chiều mình
  gửi, tách phí khỏi cọc/Δ. Test A–B/B–C và A–B/B–A dưới user/holding locks.
- **E03 Fulfillment/client:** hai chiều pickup/delivery/inspection/claim/return,
  release cọc và Δ theo quyết định. Một bên lỗi không làm bên kia mất tiền/sách.
- **DONE:** thành công + một bên không funding/không gửi/mô tả sai + race/return;
  RN và ops có states thật. Accept proposal chưa phải Exchange hoàn chỉnh.

### P01–P03 — Hai điểm mô phỏng tại TP.HCM

- **P01 Directory/assignment/capacity:** sau M3; đúng HCM-DEMO-01/02, nhãn mô phỏng,
  20 sách/điểm theo policy, giờ có timezone/version, Active/Paused/Closed có audit.
  Không chọn địa chỉ thật ngẫu nhiên hoặc coi DEMO-A/B là điểm. Slots chống overbook.
- **P02 Intake/inspection/custody:** Staff được phân công, không tự duyệt lợi ích;
  biên bản kiểm trạng thái thực tế, không cấp chứng nhận chính hãng. Tách carrier
  Delivered và Staff nhận vật; deadline/notification/overdue không tự Pass.
- **P03 Receive/reclaim/return:** acceptance barrier hai bên Exchange, code nhận
  rate-limit/expiry không log raw; chặng tự mang/ship và payer snapshot độc lập.
  Quỹ incident riêng hữu hạn có journal/decision, không lấy nguồn topup100M thay.
- **DONE:** AC-H và FR-T tương ứng, race slot/đóng điểm, code lặp/sai/hết hạn,
  thiếu nguồn/không nhận lại. Qua điểm là tùy chọn mua/đổi; direct shipping vẫn còn.

### AU01–AU03 — Đấu giá phụ, tối giản đúng nghiệp vụ

- Chỉ sau Order/ViaPoint đủ nền; đọc FR-AU/AC-AU và policy của phụ lục hiện hành.
  Một cuốn Sale/phiên, intake Pass trước mở. Không thêm chat đấu giá, gia hạn phút
  cuối, runner-up tự động, relist tự động hay thuật toán gợi ý không nằm trong scope.
- **AU01 Intake/open:** eligibility, quotas, 24h server time, start/step/buy-now
  hợp lưới. Giữ cam kết/sức chứa/inspection history qua workflow; không duplicate.
- **AU02 Manual/Auto/BuyNow:** Auto có giá trần riêng; không phải tăng 50k vô hạn.
  Bước 10k/50k do Seller chọn trước mở. Giữ private max, tie/replay/independent
  actor và thứ tự server theo SRS; BuyNow chỉ trước bid đầu. Test cùng thời điểm.
- **AU03 Close→Order:** một outcome/Order, transfer commitment atomic, deadline
  thanh toán đúng loại kết quả, không tự đẩy cho runner-up. UI hiển thị giá sách
  và ship riêng; thắng không có nghĩa đã có đủ tiền. Reuse fulfillment/settlement.
- **DONE:** AC-AU01–14, race bid–close/buy-now–bid, worker restart/replay, max private,
  payment expired. Ưu tiên đúng các ca này hơn hiệu ứng giá nhảy theo thời gian thực.

## 8. M6 — Những việc cần lên backlog, không chen ngang nền giao dịch

- **X01 Onboarding:** đăng ký/verify email/recovery, privacy và session management.
  Trước mở người dùng ngoài team phải thiết kế token expiry/replay/rate limit,
  chống account enumeration và email provider phù hợp; không tự tạo đường reset
  bỏ xác minh. Gói riêng, không trộn vào polish login hiện tại.
- **X02 Reliability:** scheduled read-only reconciliation, worker backlog/dead-letter
  visibility, backup/restore diễn tập trên DB riêng, storage budget/cleanup và
  retention. Không tự chữa ledger sai bằng UPDATE SQL; đưa sai lệch vào xử lý có audit.
- **X03 Release:** đo thời gian mở app/cuộn/tải ảnh với dataset có kiểm soát; chỉ
  tối ưu sau đo. ARM/iOS khi có môi trường, accessibility, tài liệu demo/limitations,
  quyền secrets CI. Không triển khai cloud/tăng phí khi chưa được chủ dự án duyệt.

Chat, đề xuất sách/AI, real carrier, tiền thật, rating/review đầy đủ và withdrawal
để backlog sau luồng chính. Nếu SRS yêu cầu trong bản nộp thì triển khai từng lát
cắt có trace; không xóa yêu cầu để gọi MVP đã hoàn tất.

## 9. Kiểm thử bắt buộc theo loại thay đổi

| Thay đổi | Kiểm tra |
|---|---|
| UI RN | contract check; RN lint/typecheck/unit liên quan; export; browser regression khi đổi hành vi dùng chung; Android thao tác thật; ảnh 320/390/long/large/errors |
| API/contract | YAML trước → contract generate/check/routes; lint/types/build; focused unit/E2E; schema migration upgrade nếu đổi dữ liệu |
| Auth/tiền/transaction | Negative quyền + race có barrier + replay/mất ack + rollback/worker restart; ledger/hold/final state, không chỉ HTTP status; reviewer độc lập |
| Core UI | `/ui` cập nhật, consumers, font/focus/keyboard/contrast; không viết snapshot test chỉ lặp JSX |
| Tài liệu/đóng gói | Local links, diff, secret/path scan trong phạm vi outgoing history, verify remote SHA; không chạy lại full API chỉ vì sửa docs |

Lệnh/môi trường trong START_HERE là chuẩn; DB E2E phải hậu tố `_test` và chuyên
dụng. Chạy API và worker cùng version sau build/migration. Report test fake storage
khác live Supabase, web export khác native build, AI review khác human sign-off.

## 10. Nhịp làm dài mà vẫn có thể tiếp quản

Mỗi phiên chọn một gói hoặc một phần rõ ràng, bắt đầu bằng kiểm tra dependency.
Trước code ghi 3–5 dòng về vấn đề, invariant cần giữ và cách chứng minh. Làm xong
chạy focused checks rồi gate liên quan; commit nhỏ. Không lặp test đã qua khi chưa
đổi nguồn. Nếu task lớn, tách design/API/migration/worker/client có thứ tự.

Cuối phiên cập nhật mẫu trong NEXT_SESSION_PROMPT. Khi môi trường/credential,
human review hoặc nghiệp vụ chưa rõ chặn task, ghi điểm chặn cụ thể, chuyển sang
task độc lập được mở. Không tự thông báo đã hoàn thành để agent chạy tiếp thuận tiện.
Mốc bàn giao có thể push để lưu nguồn khi gate còn mở, nhưng release/main vẫn
theo quy trình reviewer/CI. Thời lượng chạy dài không thay các bằng chứng này.
