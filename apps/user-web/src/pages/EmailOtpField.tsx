import styles from './LoginPage.module.css';

export function EmailOtpField({ id, code, onChange, invalid = false }: {
  id: string; code: string; onChange: (value: string) => void; invalid?: boolean;
}) {
  return <div className={styles.field}>
    <label htmlFor={id}>Mã xác nhận email</label>
    <input className={styles.otpInput} id={id} name="code" type="text" inputMode="numeric"
      autoComplete="one-time-code" required pattern="[0-9]{6}" minLength={6} maxLength={12}
      placeholder="000000" value={code} spellCheck={false} aria-invalid={invalid || undefined}
      aria-describedby={id + '-hint'} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))} />
    <p id={id + '-hint'} className={styles.otpHint}>Nhập 6 số trong thư mới nhất. Mã có hiệu lực 5 phút.</p>
  </div>;
}
