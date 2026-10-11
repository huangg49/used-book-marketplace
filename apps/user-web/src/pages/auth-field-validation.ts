export type AuthFieldSnapshot = {
  name: string;
  value: string;
  minLength: number;
  maxLength: number;
  validity: Pick<ValidityState, 'valueMissing' | 'typeMismatch' | 'tooShort' | 'tooLong' | 'patternMismatch' | 'valid'>;
  password?: string;
};

/** Present the existing native constraints and password-confirmation rule. */
export function authFieldError(field: AuthFieldSnapshot): string | undefined {
  if (field.validity.valueMissing) {
    switch (field.name) {
      case 'email': return 'Bạn chưa nhập email.';
      case 'displayName': return 'Bạn chưa nhập tên.';
      case 'password': return 'Bạn chưa nhập mật khẩu.';
      case 'passwordConfirmation': return 'Nhập lại mật khẩu để xác nhận.';
      case 'code': return 'Nhập mã 6 số trong email mới nhất.';
      case 'acceptedRules': return 'Bạn cần xác nhận quy tắc mô phỏng trước khi tạo tài khoản.';
      default: return 'Vui lòng điền mục này.';
    }
  }
  if (field.name === 'email' && field.validity.typeMismatch)
    return 'Email chưa đúng định dạng. Ví dụ: ban@example.com.';
  if (field.validity.tooShort)
    return `Nhập ít nhất ${field.minLength} ký tự.`;
  if (field.validity.tooLong)
    return `Chỉ nhập tối đa ${field.maxLength} ký tự.`;
  if (field.name === 'code' && field.validity.patternMismatch)
    return 'Mã cần đủ 6 số. Kiểm tra thư mới nhất nhé.';
  if (!field.validity.valid) return 'Thông tin chưa hợp lệ. Kiểm tra lại mục này nhé.';
  if (field.name === 'passwordConfirmation' && field.value !== field.password)
    return 'Hai mật khẩu chưa khớp. Nhập đúng mật khẩu ở trên.';
  return undefined;
}

export function authFieldSuccess(field: AuthFieldSnapshot): string | undefined {
  if (!field.value || authFieldError(field)) return undefined;
  if (field.name === 'password' && field.minLength > 0)
    return 'Độ dài mật khẩu phù hợp.';
  if (field.name === 'passwordConfirmation') return 'Hai mật khẩu đã khớp.';
  return undefined;
}
