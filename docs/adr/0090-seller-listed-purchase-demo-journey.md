# ADR 0090 — Trình diễn mua theo giá niêm yết và giao tận nơi

18/11/2026. Người mua chọn địa chỉ và xác nhận giá niêm yết. Người bán
chọn tạo đơn và cam kết giá. Thanh toán giữ đủ tiền và mở Chuẩn bị sách
trong một giao dịch. Thỏa thuận giá thương lượng vẫn cần xác nhận sau thanh toán.

## Trình diễn Member web

| Vai | Điểm vào và nút | Kết quả |
| --- | --- | --- |
| Người mua | Trang sách → Mua ngay → địa chỉ → Xác nhận giá & đính kèm báo giá | Chờ người bán tạo đơn |
| Người bán | Hội thoại → Tạo đơn cho người mua này → xác nhận | Đơn chờ thanh toán, sách được giữ |
| Người mua | Thanh toán ngay | Toàn bộ số tiền vào hold, đơn mở Chuẩn bị sách |
| Người bán | Xác nhận gửi sách → ảnh kiện → xác nhận | Mã vận đơn đăng ký, chờ lấy kiện |
| Người mua ở demo local | Mở Driver Simulator → Xác nhận lấy kiện → Bắt đầu đi giao → Giao thành công | Các mốc ghi trên cùng vận đơn, trở lại đơn thấy Kiểm tra và thời hạn 72 giờ |
| Người mua | Tôi đã nhận được sách | Ghi xác nhận, giữ hạn gốc và số tiền đang giữ |
| Người mua ở demo local | Tua hạn kiểm tra và giải ngân → Hoàn tất đơn demo | Giải ngân một lần, đóng đơn và giữ nguyên dấu thời gian giao/kiểm tra |
| Người mua khi có vấn đề | Chưa nhận được sách hoặc Sách có vấn đề → Gửi báo cáo | Mở hồ sơ hỗ trợ trong cùng transaction, toàn bộ tiền tiếp tục giữ, không còn nút tua kiểm tra |
| Người mua / Admin phụ trách | Hồ sơ hỗ trợ → Bằng chứng đơn mua / Đối chiếu bằng chứng | Ảnh, video MP4 tối đa 8 MB/tệp. Admin nhận phụ trách rồi ghi lý do để xem ảnh đóng gói và tệp mở kiện. |

## Phạm vi và bảo vệ

- `LOCAL_DIRECT_ORDER_JOURNEY_DEMO_ENABLED=true` chỉ có hiệu lực cho API
  development/test dùng MongoDB loopback và simulator đã cấu hình. Mặc định
  false. Khởi động lại API sau khi đổi. Đây là cờ riêng với nút 5 giây cũ.
- Lệnh Driver và tua hạn chỉ do người mua của đơn đã chọn tạo theo giá
  niêm yết thực hiện trong demo local. Chuỗi lấy kiện/giao/nhận được ghi trước
  khi cho tua kiểm tra. Demo dùng ảnh đóng gói đã sẵn sàng và hold thật của
  ví mô phỏng. Cùng khóa và nội dung trả receipt cũ.
- Giới hạn 5 tệp/hồ sơ. Bản kê Pending khóa hash và loại tệp, tải lên hai
  bước, xác minh bytes thật. Link bằng chứng riêng có thời hạn. Buyer của
  hồ sơ hoặc Admin độc lập đang phụ trách mới có quyền đọc.
- Khai nhận và báo sự cố dùng được ở bước Kiểm tra của các đơn thuộc gói.
  Quy trình phân xử tiền/hàng, hoàn trả và mở giải ngân tự động thông thường
  vẫn theo gate [ADR 0064](0064-direct-delivery-completion-release-gate.md).
  Hành vi demo không mở gate đó và không chạy trên các đơn lịch sử.
- Migration 0083 thêm dấu xác nhận giá, nhật ký mốc và shape của đơn sau
  báo sự cố/tua kiểm tra. Migration 0084 thêm bằng chứng riêng. Migration 0085
  khôi phục validator đơn mua theo 0083 khi một nâng cấp từ nhánh cũ đã ghi đè.
- Với DB đã có, sau `pnpm db:migrate` chạy `pnpm db:bootstrap` để đồng bộ
  quyền role theo [hướng dẫn setup](../handoff/START_HERE.md). API dùng
  `find/insert` cho `direct_order_journey_events` và
  `find/insert/update` cho `direct_order_issue_evidence`.
