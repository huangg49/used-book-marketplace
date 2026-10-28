# ADR 0052: Đánh giá hai chiều và hồ sơ uy tín

28/10/2026. Owner duyệt gói thay thế Forum: hoàn thiện review/uy tín theo
SRS FR-R01–R05, FR-A08 và AC-42–AC-43. Không thay quyết định bỏ Forum ở ADR0051,
không mở completion/settlement hoặc thay GHN/carrier/Driver.

## Phạm vi và điều kiện

- Dùng chung review cho `Exchange`, `DirectOrder`, `PointOrder` đã `Completed`
  và có mốc hoàn tất hợp lệ. Review không được tự đưa giao dịch tới Completed.
  DirectDelivery vẫn chịu gate F2h; fixture Completed chỉ là dữ liệu QA để kiểm
  review, không là nghiệm thu luồng giao nhận/giải ngân.
- Mỗi participant một review, kể cả đã xóa. Hạn gửi168h từ completion; hạn sửa/
  xóa48h từ lần tạo đầu, không gia hạn khi sửa. Server quyết định sau khóa; tại
  đúng deadline đã hết quyền. Buyer chấm sách và đối tác; Seller chỉ chấm đối
  tác trong Order; Exchange mỗi bên chấm cả hai. Từ chối điểm không nguyên1–5,
  không làm tròn hoặc kẹp điểm để che dữ liệu sai.
- Chỉ công bố khi hai bên đã gửi và hết cả hai hạn sửa, hoặc hết hạn gửi và
  hết mọi hạn sửa đã phát sinh. Review gửi sát cuối ngày7 vẫn có đủ48h. Tombstone
  xóa vẫn là một lần gửi và vẫn tham gia phép tính deadline.

## Giao thức và dữ liệu

- Contract0.57 thêm API review chung, danh sách giao dịch theo lane, public
  reputation và moderation. Legacy Exchange GET/POST vẫn có, POST nay yêu cầu
  Idempotency-Key giống command mới. Cập nhật client cùng API/contract.
- Command executor hiện tại kiểm user/session/role/owner trước replay; giữ
  key/path/body/version khi mất ACK. Review là target riêng `reviewId` của
  receipt/audit, không giả là listing. Khóa actor/session → transaction → review;
  transaction lock serialize hai lần gửi/worker/các sửa đổi liên quan.
- Migration0040 thêm lifecycle/reply/version và `review_revisions` append-only,
  không sửa migration đã áp dụng. Legacy review giữ nội dung, createdAt,
  publishedAt và dấu `legacyDisclosed`; khóa sửa/xóa nếu đã có khả năng nhìn
  thấy đối phương theo code cũ. Không thể tuyên bố thu hồi thông tin đã lộ.
  Baseline revision được thêm idempotently; không xóa/chỉnh lịch sử khi migrate.
- Public reads/totals tự kiểm điều kiện publication từ transaction và toàn bộ
  review của nó; không tin publishedAt cũ và không phụ thuộc worker chạy kịp.
  Order worker sweep mỗi phút, recheck dưới khóa và ghi dấu publication; retry
  không cộng score hai lần. Điểm được tính trực tiếp từ bản hiện hành hợp lệ,
  không cộng revision và không dựa vào counter/cache tích lũy thiếu đối soát.
- Mongo không hỗ trợ `$unionWith` trong transaction: danh sách giao dịch review
  phân lane với cursor ký, ràng buộc actor/type, có tie-break UUID. Hàng đợi
  trả tối đa20 revision mới nhất mỗi review; lịch sử tiếp theo có endpoint phân
  trang riêng, kiểm lại current role/independence/publication và cursor actor/review.

## Quyền, kiểm duyệt và uy tín

- Read giao dịch chỉ participant; mutation review yêu cầu Member ACTIVE. Đây
  không là nghĩa vụ hoàn hàng/tiền để mở rộng ExistingObligation cho LOCKED.
  Staff/Admin ACTIVE chỉ xử lý review đủ điều kiện công bố, độc lập với cả hai
  participant. Không có hàng đợi đọc review riêng của mọi người trước hạn.
- Ẩn/khôi phục review, giữ/gỡ giữ bằng chứng và duyệt/ẩn phản hồi cần version,
  key và lý do; lưu revision cùng audit nguyên tử. Không khôi phục review đã
  xóa. Evidence-held không được sửa/xóa; lịch sử không bị phá hủy.
- Một phản hồi bởi target sau công bố, chờ duyệt. Pending/Hidden reply chỉ target
  và reviewer độc lập xem; tác giả review/Guest không thấy trước khi duyệt.
  Giữ/gỡ bằng chứng ở gói này là thao tác moderation sau publication, không phải
  hệ thống assignment/claim/appeal mới hoặc quyền đọc trước hạn.
- Hồ sơ public chỉ tên hiển thị, số giao dịch hoàn tất, điểm sách/đối tác từ
  review công khai hợp lệ và số vi phạm từ `member_violations` đã xác minh.
  Không suy vi phạm từ claim đang mở; không tạo badge/trust score tổng hợp.
  Chưa có điểm trả null, hiển thị “Chưa có”, không biến thành0/5.

## Kiểm chứng và giới hạn

Các ca cần có: actor/participant/role/revoke trước replay, sai key/body,
version race, tạo trùng/xóa rồi tạo lại, deadline48h/168h, review cuối hạn, hai
bên gửi vẫn bảo mật, seller không chấm sách, ẩn/xóa loại khỏi aggregate,
reply chờ duyệt không lộ, migration legacy/rerun/checksum, worker retry.
Web/RN/Admin kiểm loading/empty/error/ACK/input retention và màn hẹp/chữ lớn.
Evidence thực chạy ở [báo cáo](../features/TRANSACTION_REVIEWS_REPORT.md) và SESSION_STATE. Browser không là native
PASS; AI không ký thay human review; READINESS không tự thay đổi.
