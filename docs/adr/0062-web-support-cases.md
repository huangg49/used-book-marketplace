# ADR 0062: Hồ sơ phản ánh riêng giữa Member và Admin trên web

02/11/2026. Owner yêu cầu triển khai chức năng sau khi chọn Member web/Admin web
và nhận [đặc tả](../features/WEB_FEEDBACK_COMPLAINTS_SPEC.md). Quyết định này mô
tả lát cắt tiếp nhận và phản hồi; không thay SRS FR-D hoặc mở gate phân xử tiền.

## Quyết định

- Thêm SupportCase cho Góp ý, Báo lỗi, Báo cáo vi phạm và Phản ánh giao dịch.
  Mỗi hồ sơ có một Member gửi và một Admin độc lập nhận phụ trách. Đây là hồ sơ
  hỗ trợ riêng; không phải dispute chung hai bên, không tự giữ/hoàn tiền hay đóng
  giao dịch. Các claim hiện hành giữ command, permission và hạn riêng.
- Liên kết DirectOrder, Exchange, PointOrder phải là giao dịch của người gửi.
  Báo cáo review chỉ nhận review đủ điều kiện công khai theo ADR0052; không dùng
  publishedAt cũ thay predicate publication. Listing/Auction/Member có kiểm
  khả năng truy cập; không dùng một ID tùy ý để đọc đối tượng riêng của người khác.
- Admin có role/ACTIVE và độc lập với người gửi cùng các participant được liên
  kết. Staff không có quyền vào SupportCase mới; quyền Staff của các bàn cũ giữ
  nguyên. Không tự cho Admin quyền xác nhận custody ở điểm.
- State hỗ trợ: Open → InReview ↔ AwaitingMember → Answered → Closed. Member bổ
  sung sau Answered/AwaitingMember đưa hồ sơ về InReview (hoặc Open khi chưa có
  người phụ trách). Admin phải gửi kết quả trước đóng; đang ResolutionPending
  thì chưa đóng được. Admin phụ trách có thể mở lại SupportCase đã đóng; đây
  không phải mở lại nghĩa vụ tiền hoặc tạo vòng kháng nghị thứ hai.
- Tin nhắn gốc append-only; ghi chú nội bộ được server lọc khỏi Member read.
  Không tự chia sẻ ticket của người báo cáo cho người bị báo cáo. Admin phản hồi
  và chuyển trạng thái công khai tạo thông báo Member trong cùng transaction.
- Tối đa20 hồ sơ chưa đóng mỗi người và200 mục lịch sử mỗi hồ sơ. Hai vị trí
  cuối dành cho gửi kết quả/đóng để không mắc kẹt khi hết dung lượng. Giới hạn là
  bảo vệ tài nguyên, không là SLA hoặc thời hạn quyền khiếu nại giao dịch.
- Gói này nhận mô tả/chứng cứ văn bản và dữ liệu liên kết. Chưa có upload file
  riêng; không mượn URL public hoặc vòng đời ảnh listing làm kho chứng cứ.

## Contract và persistence

Bản tích hợp vào main `d44b813b` dùng contract0.70,224operations/36controllers.
Các mốc0.68/0.69 dưới đây mô tả source ban đầu trước tích hợp.

Contract0.68 thêm9 operation (8 support +1 resolve notification review), tổng
222 operations/35controllers. Client types sinh từ YAML. Dùng chung SessionClient;
không thêm kho token. Intent, draft chỉ ở memory theo account. Back/remount sau
mất ACK khôi phục bản gửi gốc; giữ key/body/version qua401/403/408/429/5xx hoặc
response sai schema cho đến khi đối soát. Không đổi nội dung để ép thành công.

Migration0050 tạo `support_cases` mutable, `support_messages` append-only, thêm
target `supportCaseId` cho receipt/audit và mở enum thông báo. Giữ checksum mọi
migration cũ. App role không được sửa/xóa support_messages; migrator/bootstrap
thêm quyền theo registry hiện hành. Chỉ áp dụng trên QA trong gói phát triển.

Command executor có target SupportCase riêng, current auth/ownership/independence
trước replay, actor/session → case lock và server decision clock. Nhận việc
đồng thời dùng version/lockSeq; message, state, receipt, audit và notification
commit cùng nhau. Không ghi nội dung hội thoại vào audit hoặc log request body.
Danh sách dùng cursor ký, ràng buộc actor/phạm vi lọc, không lấy lỗi thành empty.

### Chọn nội dung để phản ánh — bổ sung02/11/2026

Owner yêu cầu bỏ ô nhập mã đối tượng vì người dùng không nhớ ID. Member chọn
DirectOrder/Exchange/PointOrder từ danh sách giao dịch mình tham gia, có tên sách
(snapshot nếu có), tên đối tác, ngày và trạng thái; tìm theo đối tác, thêm tên
sách cho đơn mua bán/đơn thắng đấu giá. Cursor ký theo actor/type/từ khóa, tải
tiếp được các trang sau. Exchange dùng tên đối tác/ngày, không bịa snapshot sách.

Contract0.69 thêm `GET /me/support-targets` và
`GET /me/support-targets/{type}/{id}`, tổng224operations/36controllers. Hai route
chỉ dành cho ACTIVE MEMBER; resolver dùng cùng policy truy cập với create, đọc
không ghi lock target. Không thêm migration hoặc quyền nghiệp vụ. Response chỉ
chứa nhãn nhận biết, không có địa chỉ/email/thông tin thanh toán.

Listing/Auction/Review/Member được gắn từ nút Báo cáo nội dung tại trang liên
quan; form hiện nhãn đọc được để xác nhận, không yêu cầu nhập UUID. Không mở
directory thành viên mới. Form giữ tiêu đề/nội dung trong memory khi đi tìm nội
dung và quay lại qua entry mới; scope theo account, logout xóa. Pending create
vẫn ưu tiên bản gửi gốc, không dùng resolver lỗi để đổi body/key hoặc chặn replay.

## Đánh giá và thông báo

### Tích hợp với AI tự duyệt trên main —02/11/2026

Main có `0050-listing-auto-review` độc lập với `0050-support-cases`. Giữ nguyên
cả hai ID/definition/checksum đã áp dụng, không đổi số để vượt kiểm checksum.
Thêm `0051-support-auto-review-union` sau cả hai để hợp nhất validator receipt/
audit: chấp nhận đúng principal auto review và target SupportCase, vẫn giữ
exactly-one-target. Các schema hiện hành gồm cả notification SupportCase.
Kiểm nâng cấp từ AI-first, support-first và cả hai theo thứ tự ngược; không sửa
dữ liệu/ledger/inbox cũ. Registry65migration,97collection, không suy số từ prefix.

ADR hỗ trợ dùng0062 vì0061 đã được main dành cho AI tự duyệt; đây là đổi định
danh tài liệu, không đổi nghiệp vụ. Cờ AI vẫn mặc định tắt, quyền bật theo ADR0061
và SRS giữ nguyên. Nhận source cần migrate rồi bootstrap role theo START_HERE.

Giữ lifecycle hai chiều, deadline, điểm và revision ADR0052. Báo cáo review mở
được nội dung đủ publication cho Admin độc lập; nút kiểm duyệt dùng service
hiện có. Moderation không tự đóng SupportCase: Admin gửi kết quả hồ sơ sau khi
đối soát command kiểm duyệt. Lý do moderation được báo cho hai bên của review,
ghi chú điều tra riêng chỉ nằm ở nội bộ SupportCase.

Hộp thư lưu bền có SupportCase/TransactionReview target. Review notification
được resolve theo ID và quyền hiện tại tới đúng transaction, kể cả ngoài trang
đầu. Target không khớp không rơi vào route đấu giá. RN chỉ cập nhật schema nhận
enum để không lỗi cả inbox; không thêm màn hỗ trợ native hoặc nhận là parity.

## Giới hạn

Không mở DirectDelivery hậu F2h, route resolve Exchange bị chặn theo ADR0057,
settlement/refund/return mới, appeal moderation riêng hoặc ảnh chứng cứ. Không
đổi READINESS, carrier/GHN, seed/env/DB/bucket chính. Có CI harness không có
nghĩa remote CI hoặc human review đã PASS. [Báo cáo](../features/WEB_SUPPORT_CENTER_REPORT.md)
ghi evidence và bước nhận source.
