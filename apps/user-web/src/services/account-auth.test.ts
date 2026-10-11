import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@used-books/session-client';
const { publicRequest } = vi.hoisted(() => ({ publicRequest: vi.fn() }));
vi.mock('../lib/session', () => ({ session: { publicRequest } }));
import { accountAuth, accountError } from './account-auth';

describe('account commands', () => {
  beforeEach(() => { publicRequest.mockReset().mockResolvedValue(undefined); });
  it('sends registration and single-use commands once through public session transport', async () => {
    const body = { displayName: 'Reader', email: 'reader@example.test', password: 'synthetic-password-only', acceptedRules: true as const };
    await accountAuth.register(body); await accountAuth.verify('test-token');
    await accountAuth.reset({ token: 'test-token', password: 'replacement-test-only' });
    expect(publicRequest).toHaveBeenCalledTimes(3);
    expect(publicRequest.mock.calls.map((call) => call[0])).toEqual(['/auth/otp/register', '/auth/verify-email', '/auth/reset-password']);
    expect(publicRequest.mock.calls[0][2]).toEqual({ method: 'POST', body: JSON.stringify(body) });
    expect(publicRequest.mock.calls[1][1].safeParse(undefined).success).toBe(true);
  });
  it('does not silently retry mail requests or token consumption when delivery fails', async () => {
    const error = new ApiError(503, 'MAIL_UNAVAILABLE', 'Synthetic error');
    publicRequest.mockRejectedValue(error);
    await expect(accountAuth.forgot('reader@example.test')).rejects.toBe(error);
    expect(publicRequest).toHaveBeenCalledOnce();
  });
  it.each([
    [new ApiError(0, 'NETWORK_ERROR', ''), 'Kiểm tra mạng'],
    [new ApiError(400, 'INVALID_AUTH_LINK', ''), 'Xin một liên kết mới'],
    [new ApiError(400, 'OTP_INVALID', ''), '6 số'],
    [new ApiError(400, 'OTP_ATTEMPTS_EXCEEDED', ''), '5 lần'],
    [new ApiError(429, 'RATE_LIMITED', ''), '15 phút'],
    [new ApiError(503, 'MAIL_UNAVAILABLE', ''), 'chưa sẵn sàng'],
    [new Error('Synthetic failure'), 'vẫn còn ở đây'],
  ])('explains the error and next action %#', (error, next) => expect(accountError(error)).toContain(next));
  it('uses purpose-bound OTP commands and preserves leading zeroes', async () => {
    const challengeId = '67d4ad25-a641-4c93-8c71-b788c512efbd';
    await accountAuth.requestOtp('reader@example.test', 'ResetPassword');
    await accountAuth.verifyOtp({ challengeId, code: '012345' });
    await accountAuth.resetOtp({ challengeId, code: '012345', password: 'synthetic-new-password' });
    expect(publicRequest.mock.calls.map((call) => call[0])).toEqual(['/auth/otp/request', '/auth/otp/verify-email', '/auth/otp/reset-password']);
    expect(JSON.parse(publicRequest.mock.calls[1][2].body).code).toBe('012345');
    expect(publicRequest.mock.calls[0][1].safeParse({ message: 'Synthetic', challengeId, expiresIn: 300, resendAfter: 60 }).success).toBe(true);
  });
});
