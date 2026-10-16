import { ApiError } from "@used-books/session-client";

export function buyNowError(error: unknown) {
  if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500)
    return "Chưa xác nhận được kết quả. Hãy thử lại cùng thao tác; thông tin đã nhập được giữ nguyên.";
  if (error.status === 401)
    return "Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi kiểm tra Đơn hàng của tôi trước khi đặt tiếp.";
  if (error.status === 403)
    return "Tài khoản hiện chưa đủ điều kiện đặt mua hoặc thanh toán.";
  if (error.status === 404)
    return "Không tìm thấy sách hoặc thông tin đặt mua của bạn.";
  if (error.status === 409)
    return "Sách, địa chỉ hoặc báo giá vừa thay đổi. Kiểm tra đơn đã có trước khi lấy báo giá mới.";
  if (error.status === 429)
    return "Bạn đang có nhiều đơn hoặc báo giá chưa hoàn tất. Hãy kiểm tra Đơn hàng của tôi rồi thử lại.";
  if (error.status === 422)
    return "Chưa thể thực hiện. Kiểm tra trạng thái sách và số dư ví; bạn có thể nạp thêm rồi thử lại đơn này.";
  return "Thông tin chưa hợp lệ. Kiểm tra lại các mục đã nhập.";
}
