# ADR0069: Thời lượng phiên đấu giá tính bằng giây

03/11/2026. Accepted theo yêu cầu của thành viên nhóm trong phiên làm việc. Sửa đơn vị
thời lượng của [ADR0047](0047-seller-scheduled-auctions.md); không đổi giới hạn. Không đổi
READINESS.

## Vấn đề

ADR0047 cho Seller chọn thời lượng phiên `durationHours` là số nguyên 1–168. Seller muốn
nhập thời lượng theo giờ, phút và giây (ví dụ 1 giờ 30 phút), nhưng contract, server và
client chỉ nhận số giờ nguyên.

## Quyết định

1. `PublishAuction` và `RescheduleAuction` thay `durationHours` bằng `durationSeconds`:
   số nguyên giây trong khoảng 3.600–604.800 (1 giờ đến 7 ngày). Request còn
   `durationHours` hoặc ngoài khoảng bị từ chối khi kiểm contract/server.
2. Giới hạn giữ nguyên theo ADR0047: tối thiểu 1 giờ, tối đa 168 giờ; phiên đang mở sau
   khi đổi vẫn phải còn ít nhất 1 giờ; hẹn giờ mở 5 phút–7 ngày. Validator Mongo của
   migration 0037 (`plannedEndAt` trong `startAt + 1h … startAt + 168h`) đã kiểm theo
   khoảng thời gian nên chấp nhận độ chính xác đến giây; không cần migration mới và không
   sửa checksum 0037.
3. Phiên đã có không đổi; dữ liệu lưu `startAt`/`plannedEndAt`, không lưu số giờ.

## Hệ quả

- Web: hộp thoại đăng/đổi giờ phiên nhập Giờ/Phút/Giây kèm các mức chọn nhanh. RN gửi
  `durationSeconds` và giữ nguyên thời lượng lẻ phút/giây khi Seller đổi giờ mở; giao
  diện RN vẫn là các mức chọn nhanh.
- Client cũ còn gửi `durationHours` sẽ nhận lỗi kiểm tra đầu vào cho tới khi cập nhật.
- Flutter chưa có màn hình lên lịch phiên nên không phải đổi.
