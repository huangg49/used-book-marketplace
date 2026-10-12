import styles from './LoginPage.module.css';
import { AuthInput } from './AuthForm';

export function EmailOtpField({ id, code, onChange, error }: {
  id: string; code: string; onChange: (value: string) => void; error?: string;
}) {
  return <div className={styles.field}>
    <label htmlFor={id}>Mã xác nhận email</label>
    <AuthInput className={styles.otpInput} id={id} name="code" type="text" inputMode="numeric"
      autoComplete="one-time-code" required pattern="[0-9]{6}" minLength={6} maxLength={12}
      placeholder="000000" value={code} spellCheck={false} fieldError={error}
      aria-describedby={id + '-hint'} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))} />
    <p id={id + '-hint'} className={styles.otpHint}>Nhập 6 số trong thư mới nhất. Mã có hiệu lực 5 phút.</p>
  </div>;
}
