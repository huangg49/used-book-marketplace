import { ApiError } from "@used-books/session-client";
export function errorText(error: unknown): string {
  if (!(error instanceof ApiError))
    return "Phản hồi chưa hợp lệ. Vui lòng tải lại; liên hệ người quản trị nếu lỗi tiếp diễn.";
  if (error.code === "INVALID_CREDENTIALS")
    return "Email hoặc mật khẩu chưa đúng, hoặc tài khoản chưa đủ điều kiện đăng nhập.";
  if (error.status === 0)
    return "Chưa kết nối được máy chủ. Kiểm tra mạng và thử lại.";
  if (error.status === 401)
    return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
  if (error.status === 403)
    return "Tài khoản không được phép thực hiện thao tác này. Quyền hoặc trạng thái tài khoản có thể đã thay đổi.";
  if (error.status === 404)
    return "Hồ sơ không còn có thể xem. Người đăng có thể đang sửa bản bị từ chối.";
  if (error.status === 409)
    return "Hồ sơ đã thay đổi hoặc không còn đủ điều kiện. Tải lại và kiểm tra nội dung trước khi quyết định.";
  if (error.status === 422 || error.status === 400)
    return "Thông tin hoặc điều kiện duyệt chưa hợp lệ. Kiểm tra lại hồ sơ và nội dung quyết định.";
  if (error.status === 429)
    return "Đã có quá nhiều yêu cầu. Vui lòng chờ một lúc rồi thử lại.";
  return "Máy chủ chưa hoàn tất yêu cầu. Vui lòng thử lại.";
}
// Point and auction commands carry a specific Vietnamese reason from the API
// (not assigned here, deadline passed, state changed); show it as given.
export function operationErrorText(error: unknown): string {
  if (
    error instanceof ApiError &&
    error.status >= 403 &&
    error.status < 500 &&
    error.message
  )
    return error.message;
  return errorText(error);
}
