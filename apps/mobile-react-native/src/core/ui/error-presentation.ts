import { ApiError } from "../api/session-client";

export type ErrorPresentation = {
  message: string;
  recovery: "retry" | "edit" | "sign-in" | "wait" | "none";
  requestId?: string;
};
/** Present allowlisted copy, never raw server/exception text. Recovery is a suggestion, not an automatic mutation retry. */
export function presentError(error: unknown): ErrorPresentation {
  if (!(error instanceof ApiError))
    return {
      message: "Chưa thể hoàn tất thao tác. Hãy thử lại.",
      recovery: "retry",
    };
  const requestId =
    error.requestId && /^[a-zA-Z0-9_-]{1,80}$/.test(error.requestId)
      ? error.requestId
      : undefined;
  const result = (
    message: string,
    recovery: ErrorPresentation["recovery"],
  ): ErrorPresentation => ({ message, recovery, requestId });
  if (error.code === "INVALID_CREDENTIALS")
    return result("Email hoặc mật khẩu chưa đúng.", "edit");
  if (error.status === 0)
    return result(
      "Chưa kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
      "retry",
    );
  if (error.status === 401)
    return result(
      "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.",
      "sign-in",
    );
  if (error.status === 403)
    return result("Tài khoản chưa có quyền thực hiện thao tác này.", "none");
  if (error.status === 404)
    return result("Nội dung này không còn khả dụng.", "none");
  if (error.status === 409)
    return result(
      "Thông tin đã thay đổi. Tải lại để kiểm tra trước khi tiếp tục.",
      "retry",
    );
  if (error.status === 429)
    return result(
      "Bạn đã thử nhiều lần. Vui lòng đợi một lúc rồi thử lại.",
      "wait",
    );
  if (error.status === 400 || error.status === 422)
    return result("Kiểm tra lại thông tin đã nhập rồi thử lại.", "edit");
  return result(
    "Máy chủ chưa xử lý được yêu cầu. Vui lòng thử lại sau.",
    "retry",
  );
}
