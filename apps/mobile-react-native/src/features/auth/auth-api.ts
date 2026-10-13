import { z } from "zod";
import type { SessionClient } from "../../core/api/session-client";
import { ApiError } from "../../core/api/session-client";

export const otpAck = z.object({
  message: z.string(),
  challengeId: z.string().uuid(),
  expiresIn: z.number(),
  resendAfter: z.number(),
});

export type OtpAck = z.infer<typeof otpAck>;

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  acceptedRules: true;
}

export async function registerWithOtp(
  client: SessionClient,
  body: RegisterInput,
): Promise<OtpAck> {
  return client.publicRequest("/auth/otp/register", otpAck, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function verifyEmailOtp(
  client: SessionClient,
  challengeId: string,
  code: string,
): Promise<void> {
  return client.publicRequest("/auth/otp/verify-email", z.undefined(), {
    method: "POST",
    body: JSON.stringify({ challengeId, code }),
  });
}

export async function requestOtp(
  client: SessionClient,
  email: string,
  purpose: "VerifyEmail" | "ResetPassword" = "VerifyEmail",
): Promise<OtpAck> {
  return client.publicRequest("/auth/otp/request", otpAck, {
    method: "POST",
    body: JSON.stringify({ email, purpose }),
  });
}

export function formatAuthError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0)
      return "Không thể kết nối máy chủ API (pnpm dev:api). Vui lòng kiểm tra lại.";
    if (error.code === "INVALID_CREDENTIALS" || error.status === 401)
      return "Email hoặc mật khẩu không chính xác.";
    if (error.code === "OTP_INVALID")
      return "Mã OTP không đúng hoặc đã hết hạn. Vui lòng kiểm tra email.";
    if (error.code === "OTP_ATTEMPTS_EXCEEDED")
      return "Đã thử sai quá số lần quy định. Vui lòng gửi lại mã mới.";
    if (error.status === 429)
      return "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.";
    if (error.status === 400)
      return "Thông tin chưa hợp lệ. Mật khẩu cần từ 10 đến 128 ký tự.";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Đã có lỗi xảy ra. Vui lòng thử lại.";
}
