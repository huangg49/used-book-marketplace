# Nhận sách, viết đánh giá và chuẩn bị demo — 03/11/2026

Owner duyệt ba việc theo thứ tự: viết đánh giá ngay khi nhận sách nhưng giữ tiền/
điều kiện công bố; cấp TEST_OPERATOR cho Admin demo local; thêm hai Member demo
trao đổi vào DB local hiện có, giữ dữ liệu cũ. Không suy quyền push/merge từ PR93.
Nhánh `codex/receipt-review-demo-readiness`, base `b447dbab`.

## Hành vi và cửa vào

| Vai trò | Điểm vào → điều kiện | Thao tác/kết quả → bước tiếp |
| --- | --- | --- |
| Buyer trực tiếp | Đơn trực tiếp hoặc đơn trong hội thoại, InTransit, pickup hợp lệ, còn hạn giao, chưa có carrier/delivery review | **Tôi đã nhận được sách** → xác nhận → Inspection72h, giữ tiền → **Viết đánh giá** mở đúng DirectOrder |
| Seller trực tiếp | Cùng đơn Inspection có BuyerReceived | **Viết đánh giá**, chỉ chấm đối tác, không chấm sách Buyer |
| Hai bên Exchange | Chi tiết trao đổi, từng người đã xác nhận sách của mình nhận | **Viết đánh giá** theo quyền server; người chưa nhận chưa được viết |
| Buyer/Seller PointOrder | Đơn thắng đấu giá Inspection có collectedAt hoặc Completed | Nút đánh giá ở thủ tục đơn; danh sách Đánh giá của tôi có cùng giao dịch |
| Tác giả review | Đánh giá của tôi → Giao dịch cần đánh giá → đúng lane/transaction | Lưu bản riêng, sửa/xóa trong48h từ lần đầu; sau đó xem bản mình/chờ công bố |
| Admin demo | Đăng nhập lại sau khi cấp role → Mô phỏng → Nạp tiền mô phỏng | Chọn Member khác, số tiền → kiểm tra/xác nhận → ví và lịch sử nhận bút toán simulator |

Không cần chờ72h để viết. `awaitingCompletion` báo đang chờ hoàn tất;
completedAt=null/reviewableAt thật trên danh sách, không giả Completed. Hạn gửi168h
vẫn từ Completed. Chỉ công bố sau Completed và đủ điều kiện hai phía/hạn sửa;
48h sửa tính từ lần tạo đầu, không reset khi hoàn tất. Tranh chấp/hủy chặn tạo,
sửa và xóa, không xóa revision. Review không chuyển trạng thái đơn, giải ngân,
restock hoặc tăng số giao dịch hoàn tất. [ADR0052](../adr/0052-transaction-reviews-and-reputation.md)
ghi quyết định owner thay FR-R01/UC-14; [ADR0064](../adr/0064-direct-delivery-completion-release-gate.md)
giữ carrier Delivered/settlement/worker đóng. Inspection lịch sử không tự thêm
BuyerReceived hoặc reset hạn. READINESS không được đóng qua gói này.

Mất ACK nhận sách dùng lại shared session-client intent với đúng key/body/version,
kể cả read mới trả Inspection v5. Modal đóng để người dùng nhìn và bấm đúng nút
thử lại; không đổi key hoặc version nhằm ép thành công. Member web và RN dùng
cùng API/permission; Flutter ngoài phạm vi triển khai của gói.

## Dữ liệu trao đổi và giới hạn matching

Kịch bản hai Member mới, mỗi ví1triệu mô phỏng, địa chỉ TP.HCM giả rõ nhãn demo,
chưa có exchange/reservation. Giữ hạn mức5bài hiện hành: người thứ nhất5bài
Approved/Visible/Available và3Draft; người thứ hai3bài sẵn đổi. Có wishlist3đầu
sách+3bài của đối tác mỗi bên và tiêu chí đổi sách được lưu trên revision.

Nhãn khớp có thật trong phiếu đề nghị ở hội thoại: so tác giả/thể loại/từ khóa
với tiêu chí đổi của người đăng, xếp sách khớp trước. Đây là heuristic client,
không phải AI hoặc engine ghép tự động từ wishlist. Trang Đổi sách hiện vẫn ghi
“Gợi ý khớp tự động chưa khả dụng”; không tuyên bố đã hoàn thiện phần này.
Sửa projection bản nháp để trả lại exchangePreferences đã lưu, tránh mất tiêu chí
khi mở/sửa bài; không migration hoặc sửa catalog cũ.

Ảnh bìa/metadata tái sử dụng nguồn [400cuốn](BACKGROUND_CATALOG_DEMO_2026_11_03.md),
upload dưới media ID/key mới của từng bài. Không chia sẻ key có thể bị cleanup
của bài cũ xóa. Giá/tình trạng/sở hữu/approval là fixture demo được owner yêu cầu,
không human review, ảnh điện thoại, hàng thật hay nguồn giá AI. Không dùng bộ này
để chứng minh AI thẩm định hiện vật. Hướng dẫn tài khoản/URL cụ thể chỉ lưu private
trên máy owner, không đưa credential hoặc bản sao DB vào Git.

## Bằng chứng và giới hạn

Source base b447dbab cùng diff nhánh trên; Windows/Node24, pnpm11. QA replica
rs-test/57017, database *_test tách DB ứng dụng; storage/payment/carrier fake trừ
lượt kích hoạt/data local được ghi riêng. Không gọi provider AI/email/VNPay/GHN.

- PASS review-policy6ca; session-client151ca; Member web315ca.
- PASS transaction-reviews14ca trên Mongo/HTTP, gồm Exchange own receipt,
  peer/outsider bị từ chối, private list, dispute khóa sửa/xóa, PointOrder viết sớm
  dù cả hai hết48h vẫn không công bố khi chưa Completed; lifecycle/race hiện có.
- PASS8ca receipt/release-gate wallet được chọn (lượt chốt8PASS/40ngoài filter
  SKIP): Buyer-only, exact replay, 72h, tiền/commitment/ledger giữ nguyên,
  carrier/settlement bị chặn và overdue race. Không chạy toàn wallet harness.
- PASS browser mua ngay → giao mô phỏng → nhận → review bằng API/Mongo thật;
  mất ACK giữ key/body và đúng một receipt event, tiền giữ nguyên, đối phương chưa
  thấy. Màn1440/390/320 không overflow ngang. Fake storage/funding/carrier.
- PASS API/Member web/RN typecheck, API+Member build, lint scope (cảnh báo cũ);
  contract0.74:246operations/38controllers. Detector hỗ trợ, không thay nhìn UI.
- PASS bộ cấp role/tạo2Member/11listing/địa chỉ/wishlist qua API trên QA:8bài
  Approved/3Draft, media theo owner,2bút toán nạp cân bằng, không tạo exchange.
- PASS20catalog/draft E2E; ca lưu/mở lại sau restart giữ đúng exchangePreferences
  đã gửi. Draft không có tiêu chí giữ response cũ, không thêm field null bắt buộc.
- Native Android/iOS, human UX/review và CI remote NOT RUN cho gói này.
  Các gate claim/settlement, storage video100MB và AI nghiệm thu giữ nguyên.

## Kích hoạt trên app local chính

- Đã kích hoạt code từ d03bd5ce trên checkout ứng dụng, nhánh
  `codex/demo-receipt-local-20261103`; API/worker3000, Admin5173, Member5174.
  Commit bàn giao cùng gói giữ optional field tiêu chí và bổ sung regression/
  bằng chứng; API/worker được khởi động lại cùng source. Fetch origin/main vẫn
  b447dbab. Không push/PR/merge mới.
- PASS browser QA: User mở bài đối tác → gửi đề nghị đổi sách → kệ của mình có
  nhãn khớp tác giả/thể loại và sách khớp trước → chọn cặp cùng giá trị. Chưa gửi
  proposal để không tiêu thụ dữ liệu demo. Admin có role bổ sung mở nhóm Mô phỏng,
  đi từ menu tới form nạp và tìm người nhận. API/Mongo thật, storage QA fake.
- PASS trên ứng dụng chính: cả5Member demo đăng nhập, ví hai người mới1triệu/
  held0, không exchange; User1/User3 vẫn1triệu/held0, User2available850k/held150k,
  đơn cũ Preparing giữ nguyên. Public409bài (401cũ+8mới), không trùng ID;3nháp.
  Mỗi Member mới1địa chỉ hợp lệ,6wishlist;2bút toán simulator mới cân bằng.
- PASS browser localhost5174/5173/API3000: Member mở bài đối tác thấy ảnh thật từ
  private storage/tiêu chí đổi/nút gửi đề nghị; Admin hiện quyền TEST_OPERATOR,
  mở đúng form và tìm/chọn Member. Không gửi proposal, chat hoặc nạp thêm ngoài
  2khoản được duyệt. Đăng xuất/đăng nhập lại nếu menu trong phiên cũ chưa cập nhật.
- Backup DB trước thêm dữ liệu và trước hiệu chỉnh quota được giữ private. Đối
  chiếu3308bản ghi cũ: nội dung nghiệp vụ giữ nguyên, chỉ có role Admin+updatedAt
  đã duyệt và metadata giữ chỗ400ảnh như phần dưới. Kiểm chính xác password/roles
  cũ của Admin giữ nguyên;5file cấu hình không đổi. Không model/provider AI call
  cho11bài mới; không đổi cấu hình tự duyệt có sẵn của owner.
- Hướng dẫn tài khoản, bài đích và thứ tự thao tác lưu private trên Desktop của
  owner, cùng bản trong `.tmp/receipt-review-demo/` của checkout ứng dụng.
  User đầu tiên đủ5slot nên dùng Member trống đã chuẩn bị trước khi demo đăng mới.

## Chặn quota phát hiện khi thêm ảnh và hiệu chỉnh có bằng chứng

API thật trả429 MediaQuotaExceeded dù ảnh mới hợp lệ: lần nhập400bìa giữ mỗi ảnh
Ready thêm2MB thay vì dung lượng WebP thực, tổng giữ821.590.869byte vượt quota
800.000.000byte hiện hành. Đây là lỗi dữ liệu import, không lỗi Supabase hoặc
thiếu tài khoản. Không tăng quota, đổi gói, xóa ảnh hay sửa migration để né lỗi.

Đã đọc lại400original+400WebP đang dùng từ private storage, kiểm kích thước và
checksum khớp manifest. Thử trên bản sao QA với validator/index runtime, sau đó
hiệu chỉnh atomic đúng400ID Ready/import/không processing job: reservedBytes bằng
inputBytes+derivativeBytes như worker thành công lần đầu, tăng version/updatedAt
và lưu audit. Tổng400ảnh còn34.514.743byte, giải phóng787.076.126byte giữ thừa.
Không đổi object/key/hash/ảnh/nội dung bài, budget cấu hình hoặc ledger. Kiểm QA
và primary ledger trước/sau giống hệt, balanced. Sau đó11media mới upload/Ready,
ảnh public đọc lại thành công. Bản sao, checksum, plan và audit proof ở thư mục
private của gói; không commit DB/key/ảnh hoặc công cụ dành riêng máy owner.

Không coi toàn bộ storage project đã được đối soát từ việc sửa400ảnh; packaging,
video100MB và các gate khác giữ nguyên. Không mở readiness qua việc demo chạy.

Quan sát cấu hình local có sẵn: worker báo LISTING_AUTO_REVIEW_ENABLED bật và
policyApproved=true, trong khi READINESS vẫn NOT MET/cờ tắt cho release. Gói này
không tự bật/tắt hoặc coi local setting là quyền đóng gate;5file env giữ nguyên.
Các bài demo mới không gọi model (precheck ảnh/nguồn/tuổi tài khoản và quyết định
demo qua Admin). Việc dùng AI tự duyệt khi phát hành vẫn cần evidence/gate riêng.
