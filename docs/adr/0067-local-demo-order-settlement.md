# ADR0067: Hoàn tất và giải ngân đơn demo local sau 5 giây

03/11/2026. Owner yêu cầu nút trong đơn thực sự kết thúc giữ tiền và chuyển tiền
cho người bán để trình diễn, thay bản xem thử giao diện. Đây là ngoại lệ demo
có phạm vi, không mở gate release của ADR0064 hoặc xác nhận carrier giao hàng thật.

## Phạm vi được cấp

- Tắt mặc định. Chỉ development/test, MongoDB localhost, simulator đã cấu hình,
  và đúng UUID trong `LOCAL_DEMO_DIRECT_ORDER_IDS` của BE local. Không wildcard,
  không bật qua request. Production/remote không có quyền này.
- Nút chỉ hiện trên Member web dev khi URL có `demoCompletion=1` và BE cho phép
  đúng đơn. Mặc định ẩn và không có trong production UI; URL không cấp quyền BE.
  Recovery của intent mất ACK vẫn được giữ cho đến khi xác nhận được kết quả.
- Seller hiện tại phải là ACTIVE MEMBER có phiên hợp lệ; đơn Preparing/version3
  đã thanh toán đầy đủ, commitment còn Active, có vận đơn LatLaiSimulator và
  ảnh đóng gói đã ghim, không có review/report tranh chấp. Buyer/người ngoài bị từ chối.
- Đây là lựa chọn kết thúc đơn có hiệu lực, không có nút hủy bản xem thử. Không
  tự chạy chỉ vì tải trang, đăng ký vận đơn hoặc khởi động worker.

## Command và tiền

`POST /orders/{orderId}/demo-completion` nhận expectedVersion và Idempotency-Key.
Kiểm quyền hiện tại trước replay; mất ACK giữ nguyên key/body/version. Command
ghi job bền vững theo orderId, receipt/audit/outbox riêng và chuyển InTransit/v4.
`dueAt = server createdAt + 5000ms`; rời trang không hủy công việc đã chấp nhận.

Worker chỉ khởi động ở API và order-worker, không ở context CLI read-only.
Quét mỗi250ms, kiểm lại phạm vi cấu hình, khóa hai user và aggregate Order,
chỉ xử lý job đến hạn và chưa hoàn tất. Nhiều API/worker có thể cùng quét; một
system receipt `OrderDemoCompletion/completeLocalDemoOrder` và một journal
`OrderSettlement` được commit. Job và Order Completed/v5, tiền giữ về0, seller
nhận proceeds theo agreement, platform nhận commission theo agreement; listing
Sold, commitment Released, context Closed trong cùng transaction. Không sửa
balance, không nạp tiền thay thế và không bịa event carrier/Buyer receipt.

Migration0054 thêm job, principal hệ thống và shape terminal có policy riêng.
Commit-time checks buộc marker, job, mốc5giây, nguồn vận đơn và chuỗi command/
receipt/audit/outbox/ledger khớp. Dữ liệu/validator/migration lịch sử không bị sửa.
Đường confirm-receipt, Delivered và settlement thường vẫn bị ADR0064 chặn.
Inspection lịch sử không được áp dụng ngoại lệ này. Chạy5giây không là kiểm chứng
custody, đồng kiểm72giờ, khiếu nại hoặc giải ngân production.

## Hành trình

| Vai trò | Entry và điều kiện | Command | Kết quả và bước tiếp |
| --- | --- | --- | --- |
| Seller | Khung thủ tục đúng đơn được cấu hình, đã đăng ký vận đơn | Hoàn tất và giải ngân sau5giây | InTransit; lỗi/mất ACK thử lại đúng intent; tải lại đọc job |
| Buyer/Seller | Đơn đang có job, tiền đang giữ | Chờ BE xử lý | Cùng đọc Completed và moneyHeld0; ví/lịch sử ghi số tiền thật trong ledger mô phỏng |
| Worker | Job đến hạn và còn được cấp phạm vi | completeLocalDemoOrder | Commit một lần; lỗi giữ tiền/job để xử lý lại, không ép UI thành công |

Kiểm chứng và giới hạn theo SESSION_STATE; native, human review và release gate
không được suy ra từ demo local hoặc test tự động.
