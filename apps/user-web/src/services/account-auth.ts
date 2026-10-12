import { z } from 'zod';
import { ApiError } from '@used-books/session-client';
import type { components } from '@used-books/api-contract';
import { session } from '../lib/session';

const ack = z.object({ message: z.string() });
const otpAck = ack.extend({ challengeId: z.string().uuid(), expiresIn: z.literal(300), resendAfter: z.literal(60) });
export type AccountOtpAcknowledgement = z.infer<typeof otpAck>;
const post = <T>(path: string, schema: z.ZodType<T>, body: unknown) => session.publicRequest(`/auth/${path}`, schema,
  { method: 'POST', body: JSON.stringify(body) });
export const accountAuth = {
  register: (body: components['schemas']['RegisterRequest']) => post('otp/register', otpAck, body),
  requestOtp: (email: string, purpose: components['schemas']['AccountOtpRequest']['purpose']) => post('otp/request', otpAck, { email, purpose }),
  verifyOtp: (body: components['schemas']['AccountOtpCodeRequest']) => post('otp/verify-email', z.undefined(), body),
  resetOtp: (body: components['schemas']['AccountOtpResetRequest']) => post('otp/reset-password', z.undefined(), body),
  resend: (email: string) => post('verification/resend', ack, { email }),
  verify: (token: string) => post('verify-email', z.undefined(), { token }),
  forgot: (email: string) => post('forgot-password', ack, { email }),
  reset: (body: components['schemas']['ResetPasswordRequest']) => post('reset-password', z.undefined(), body),
};
export function accountError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại nhé.';
    if (error.code === 'INVALID_AUTH_LINK') return 'Liên kết đã hết hạn hoặc đã được dùng. Xin một liên kết mới bên dưới nhé.';
    if (error.code === 'OTP_INVALID') return 'Mã chưa đúng, đã hết hạn hoặc đã dùng. Nhập đủ 6 số trong thư mới nhất; nếu quá 5 phút, gửi lại mã nhé.';
    if (error.code === 'OTP_ATTEMPTS_EXCEEDED') return 'Mã đã bị khóa sau 5 lần thử sai. Gửi lại để nhận mã mới nhé.';
    if (error.status === 429) return 'Bạn đã gửi nhiều yêu cầu. Đợi 15 phút rồi thử lại nhé.';
    if (error.code === 'MAIL_UNAVAILABLE') return 'Dịch vụ email chưa sẵn sàng. Vui lòng thử lại sau.';
    if (error.status === 400) return 'Thông tin chưa hợp lệ. Kiểm tra email, tên và mật khẩu từ 10 đến 128 ký tự nhé.';
  }
  return 'Chưa hoàn tất được yêu cầu. Thử lại nhé; những gì bạn đã nhập vẫn còn ở đây.';
}

/** Only OTP-specific failures belong to the code field; transport errors do not. */
export function accountErrorField(error: unknown): 'code' | undefined {
  return error instanceof ApiError && ['OTP_INVALID', 'OTP_ATTEMPTS_EXCEEDED'].includes(error.code)
    ? 'code' : undefined;
}
