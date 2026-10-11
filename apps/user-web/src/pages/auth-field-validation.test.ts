import { describe, expect, it } from 'vitest';
import { authFieldError, authFieldSuccess, type AuthFieldSnapshot } from './auth-field-validation';

const valid: AuthFieldSnapshot['validity'] = {
  valueMissing: false, typeMismatch: false, tooShort: false,
  tooLong: false, patternMismatch: false, valid: true,
};
function field(overrides: Partial<AuthFieldSnapshot> = {}): AuthFieldSnapshot {
  return { name: 'email', value: 'reader@example.test', minLength: -1, maxLength: 254, validity: valid, ...overrides };
}

describe('Auth inline feedback preserves the existing rules', () => {
  it('distinguishes missing email from an invalid email format', () => {
    expect(authFieldError(field({ value: '', validity: { ...valid, valueMissing: true, valid: false } }))).toBe('Bạn chưa nhập email.');
    expect(authFieldError(field({ value: 'reader', validity: { ...valid, typeMismatch: true, valid: false } }))).toContain('ban@example.com');
  });
  it('reports the actual native length constraints', () => {
    expect(authFieldError(field({ name: 'password', minLength: 10, validity: { ...valid, tooShort: true, valid: false } }))).toContain('10 ký tự');
    expect(authFieldError(field({ name: 'displayName', maxLength: 80, validity: { ...valid, tooLong: true, valid: false } }))).toContain('80 ký tự');
  });
  it('does not impose registration password constraints on login', () => {
    const login = field({ name: 'password', value: 'short', minLength: -1 });
    expect(authFieldError(login)).toBeUndefined();
    expect(authFieldSuccess(login)).toBeUndefined();
  });
  it('compares passwords exactly, including significant spaces', () => {
    const confirmation = field({ name: 'passwordConfirmation', value: 'sample password ', password: 'sample password' });
    expect(authFieldError(confirmation)).toContain('chưa khớp');
    expect(authFieldSuccess(confirmation)).toBeUndefined();
    expect(authFieldSuccess({ ...confirmation, password: confirmation.value })).toBe('Hai mật khẩu đã khớp.');
  });
  it('does not treat two empty passwords as a successful match', () => {
    expect(authFieldSuccess(field({ name: 'passwordConfirmation', value: '', password: '' }))).toBeUndefined();
  });
  it('never claims password security from length alone', () => {
    expect(authFieldSuccess(field({ name: 'password', value: 'aaaaaaaaaa', minLength: 10, maxLength: 128 }))).toBe('Độ dài mật khẩu phù hợp.');
  });
  it('keeps six-digit OTP feedback separate from account existence', () => {
    expect(authFieldError(field({ name: 'code', value: '123', validity: { ...valid, patternMismatch: true, valid: false } }))).toContain('6 số');
    expect(authFieldError(field({ name: 'code', value: '012345' }))).toBeUndefined();
  });
  it('requires the existing simulation acknowledgement', () => {
    expect(authFieldError(field({ name: 'acceptedRules', validity: { ...valid, valueMissing: true, valid: false } }))).toContain('quy tắc mô phỏng');
  });
});
