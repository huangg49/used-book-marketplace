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
- PASS8ca receipt/release-gate wallet được chọn (hai lượt7+1, các ca ngoài filter
  SKIP): Buyer-only, exact replay, 72h, tiền/commitment/ledger giữ nguyên,
  carrier/settlement bị chặn và overdue race. Không chạy toàn wallet harness.
- PASS browser mua ngay → giao mô phỏng → nhận → review bằng API/Mongo thật;
  mất ACK giữ key/body và đúng một receipt event, tiền giữ nguyên, đối phương chưa
  thấy. Màn1440/390/320 không overflow ngang. Fake storage/funding/carrier.
- PASS API/Member web/RN typecheck, API+Member build, lint scope (cảnh báo cũ);
  contract0.74:246operations/38controllers. Detector hỗ trợ, không thay nhìn UI.
- PASS bộ cấp role/tạo2Member/11listing/địa chỉ/wishlist qua API trên QA:8bài
  Approved/3Draft, media theo owner,2bút toán nạp cân bằng, không tạo exchange.
- Native Android/iOS, human UX/review và CI remote NOT RUN cho gói này.
  Các gate claim/settlement, storage video100MB và AI nghiệm thu giữ nguyên.

Kết quả kích hoạt DB/app local và thử menu/matching được cập nhật khi kết thúc gói.
