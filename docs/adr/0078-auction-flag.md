# ADR0078: Nút báo cáo sự cố phiên đấu giá cho người bán và người tham gia

08/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc: người tạo phiên và
người trả giá cần một nút để báo sự cố của phiên cho Admin. Dùng lại hồ sơ hỗ trợ
(`support_cases`, migration 0050) vốn đã nhận đối tượng `Auction`; không thêm collection
hay migration. Bổ sung [ADR0077](0077-auction-registration-deposit.md). Không đổi READINESS.

## Quyết định

- Báo cáo sự cố là một hồ sơ hỗ trợ `POST /me/support-cases` có `target = {type: Auction}`.
  Nó vào hàng xử lý hỗ trợ của Admin (`/operations/support-cases`); không tự tạm dừng phiên,
  không giữ hay hoàn tiền. Admin dùng công cụ phiên đã có (tạm dừng/hủy) nếu cần.
- Nút "Báo cáo sự cố cho Admin" hiện cho người bán và thành viên đã đăng ký hoặc trả giá
  (có participation). Người khác vẫn thấy liên kết "Báo cáo nội dung" (Violation) như cũ.
- Năm loại sự cố, chung ở `packages/session-client` cho web và RN:
  - nghi ngờ trả giá gian lận → `Violation`;
  - sách hoặc mô tả không đúng → `Violation`;
  - tiền cọc, khoản giữ hoặc thanh toán → `TransactionIssue`;
  - lỗi khi trả giá hoặc hiển thị → `Bug`;
  - vấn đề khác → `Feedback`.
  Tiêu đề = tên loại + tên phiên (tối đa 160 ký tự); mô tả ít nhất 10 ký tự.
- Server:
  - `TransactionIssue` nhận thêm đối tượng `Auction`, nhưng chỉ cho người bán và người đã
    đăng ký (bất kỳ trạng thái) hoặc trả giá trong phiên; người ngoài nhận 422.
  - Mỗi thành viên chỉ có một hồ sơ chưa đóng cho mỗi phiên; hồ sơ thứ hai nhận 409 kèm mã
    hồ sơ đang mở. Khóa actor của lệnh tạo hồ sơ tuần tự hóa kiểm tra này (race hai key cùng
    lúc chỉ tạo một). Hồ sơ đã đóng thì báo cáo mới được.
  - `involvedUserIds` của hồ sơ về phiên gồm người báo, người bán, mọi người đăng ký và mọi
    người trả giá, nên Admin có liên quan không thấy hồ sơ trong hàng.
  - Admin đăng ký hoặc trả giá **sau** khi hồ sơ được tạo cũng bị chặn đọc/nhận/xử lý (403
    `SelfReviewForbidden`) nhờ kiểm tra lúc đọc và lúc ghi.
  - Chi tiết hồ sơ trả `relatedState` = trạng thái phiên và `relatedAuctionId`.
  - `GET /me/support-cases` nhận `targetType`/`targetId` để client tìm hồ sơ đang mở của
    mình về phiên; có hồ sơ mở thì nút đổi thành liên kết "Xem hồ sơ".
- Idempotency theo `sendSupportIntent` sẵn có: mất phản hồi thì giữ nguyên body và key, thử
  lại không tạo hồ sơ trùng; trường nhập bị khóa khi kết quả chưa rõ.

## Giới hạn

- Hàng hỗ trợ chỉ dành cho Admin (như ADR hỗ trợ hiện có); Staff điểm giao nhận không nhận
  báo cáo phiên. Mở cho Staff là đổi quyền, cần quyết định riêng.
- Danh sách hàng của Admin lọc theo `involvedUserIds` lúc tạo; Admin tham gia phiên sau đó
  vẫn có thể thấy dòng tóm tắt trong hàng nhưng không mở hay xử lý được.
- RN chưa có màn hình hồ sơ hỗ trợ: sau khi gửi, RN hiện mã hồ sơ và hướng dẫn xem phản hồi
  qua thông báo và mục Yêu cầu hỗ trợ trên web. Flutter chưa có (scaffold).
- Chưa kiểm chứng trình duyệt thật hay thiết bị native; web có test render tĩnh, API có E2E.
- Không có thông báo đẩy cho Admin khi có hồ sơ mới; Admin xem hàng hỗ trợ như trước.
