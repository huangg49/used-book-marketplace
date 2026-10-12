import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { AuthPageLink } from '../layouts/AuthPageLink';
import { useAuthPaper } from '../layouts/auth-paper';
import { accountAuth } from '../services/account-auth';
import { EmailOtpField } from './EmailOtpField';
import { useOtpChallenge } from './useOtpChallenge';
import { useAccountForm } from './useAccountForm';
import { useAuthLink } from './useAuthLink';
import styles from './LoginPage.module.css';
import { AuthForm, AuthInput, AuthFieldFeedback } from './AuthForm';

export function RegisterPage() {
  const { search } = useLocation();
  const { draft, updateDraft } = useAuthPaper();
  const state = useAccountForm();
  const [verified, setVerified] = useState(false);
  const token = useAuthLink('verify', verified);
  const [challenge, setChallenge] = useOtpChallenge('verify-otp', verified);
  const [sent, setSent] = useState(!!challenge);
  const [code, setCode] = useState('');
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState(draft.current.registerEmail);
  const heading = useRef<HTMLHeadingElement>(null);
  const otpError = state.errorField === 'code' ? state.error : undefined;
  useEffect(() => { if ((sent || verified) && !heading.current?.closest('[inert]')) heading.current?.focus(); }, [sent, verified, challenge]);
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password'));
    if (data.get('acceptedRules') !== 'on') { state.setError('Bạn cần xác nhận quy tắc mô phỏng trước khi tạo tài khoản.'); return; }
    if (password !== data.get('passwordConfirmation')) {
      state.setError('Hai mật khẩu chưa giống nhau. Nhập lại mật khẩu cho khớp nhé.');
      form.querySelector<HTMLInputElement>('#register-confirmation')?.focus(); return;
    }
    await state.run(async () => {
      const result = await accountAuth.register({ displayName: String(data.get('displayName')).trim(),
        email: email.trim(), password, acceptedRules: true });
      if (!state.active.current) return;
      updateDraft('registerPassword', ''); updateDraft('registerConfirmation', ''); updateDraft('email', email.trim());
      setChallenge(result.challengeId); setSent(true); state.setMessage(''); state.cooldown();
    });
  }
  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await state.run(async () => {
      const result = await accountAuth.requestOtp(email.trim(), 'VerifyEmail');
      if (state.active.current) { setChallenge(result.challengeId); setSent(true); setCode(''); state.setMessage(''); state.cooldown(); }
    });
  }
  return <section className={styles.panel + ' ' + styles.registerPanel} aria-labelledby="register-title">
    <h1 ref={heading} id="register-title" tabIndex={-1}>{verified ? 'Thẻ đã sẵn sàng.' : token && !sent ? 'Xác minh email của bạn.' : sent ? 'Xác minh email của bạn.' : 'Một người đọc mới.'}</h1>
    <p className={styles.lede}>{verified ? 'Email đã được xác minh. Đăng nhập để bắt đầu câu chuyện tiếp theo.' : token && !sent
      ? 'Bấm xác minh để kích hoạt tài khoản. Liên kết chỉ dùng được một lần.' : sent
        ? 'Một bước nữa để thẻ sẵn sàng. Nếu email phù hợp, mã xác nhận sẽ được gửi tới hộp thư của bạn.'
        : 'Làm thẻ của bạn. Để những câu chuyện tìm được nhau.'}</p>
    {verified ? <AuthPageLink className={styles.submit} to={'/login' + search}>Đăng nhập <ArrowRight size={18} aria-hidden="true" /></AuthPageLink> : token && !sent ? <>
      <button className={styles.submit} disabled={state.busy} onClick={() => void state.run(async () => {
        await accountAuth.verify(token);
        if (state.active.current) { setVerified(true); state.setMessage('Email đã được xác minh.'); }
      })}>{state.busy ? 'Đang xác minh…' : 'Xác minh email'}</button>
      {state.error && <AuthForm onSubmit={(event) => void resend(event)} aria-busy={state.busy}>
        <div className={styles.field}><label htmlFor="verify-resend-email">Email đã đăng ký</label>
          <AuthInput id="verify-resend-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        <button className={styles.textAction} type="submit" disabled={state.busy || state.remaining > 0}>
          {state.remaining > 0 ? 'Gửi lại sau ' + state.remaining + ' giây' : 'Gửi mã xác minh'}</button>
      </AuthForm>}
    </> : sent && challenge ? <>
      <p className={styles.otpRecipient}>{email.trim() ? <>Email: <strong>{email.trim()}</strong></> : 'Dùng mã đã nhận trong hộp thư của bạn.'}</p>
      <AuthForm onChange={() => state.setError('')} aria-busy={state.busy} aria-describedby={state.error && !otpError ? 'register-error' : undefined} onSubmit={(event) => {
        event.preventDefault(); void state.run(async () => {
          await accountAuth.verifyOtp({ challengeId: challenge, code });
          if (state.active.current) { setVerified(true); setCode(''); state.setMessage(''); }
        });
      }}>
        <fieldset className={styles.formFields} disabled={state.busy}>
          <EmailOtpField id="register-otp" code={code} onChange={setCode} error={otpError} />
          <button className={styles.submit} type="submit">{state.busy ? 'Đang xác minh…' : 'Xác minh email'} <ArrowRight size={18} aria-hidden="true" /></button>
        </fieldset>
      </AuthForm>
      <div className={styles.otpActions}>
        <button className={styles.textAction} type="button" disabled={state.busy || state.remaining > 0 || !email.trim()} onClick={() => void state.run(async () => {
          const result = await accountAuth.requestOtp(email.trim(), 'VerifyEmail');
          if (state.active.current) { setChallenge(result.challengeId); setCode(''); state.cooldown(); }
        })}>{state.remaining > 0 ? 'Gửi lại sau ' + state.remaining + ' giây' : 'Gửi lại mã'}</button>
        <button className={styles.textAction} type="button" disabled={state.busy} onClick={() => { setChallenge(null); setCode(''); setSent(!email.trim()); state.setError(''); }}>{email.trim() ? 'Sửa email đăng ký' : 'Nhập email để gửi lại'}</button>
      </div>
      <p className={styles.availability}>Chưa thấy thư? Kiểm tra thư rác. Mỗi mã mới thay thế mã cũ.</p>
    </> : sent ? <AuthForm onChange={() => state.setError('')} onSubmit={(event) => void resend(event)} aria-busy={state.busy}>
      <div className={styles.field}><label htmlFor="resend-email">Email đã đăng ký</label>
        <AuthInput id="resend-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      <button className={styles.submit} type="submit" disabled={state.busy || state.remaining > 0}>
        {state.busy ? 'Đang yêu cầu mã…' : state.remaining > 0 ? 'Gửi lại sau ' + state.remaining + ' giây' : 'Gửi mã xác minh'}
      </button>
      <p className={styles.availability}>Tài khoản chưa đăng ký cần tạo tài khoản trước.</p>
    </AuthForm> : <AuthForm onChange={() => state.setError('')} onSubmit={(event) => void register(event)} aria-busy={state.busy} aria-describedby={state.error && !otpError ? 'register-error' : undefined}>
      <fieldset className={styles.formFields} disabled={state.busy}>
        <div className={styles.formGrid}>
          <div className={styles.field}><label htmlFor="register-name">Tên của bạn</label>
            <AuthInput id="register-name" name="displayName" type="text" autoComplete="name" required maxLength={80} placeholder="Tên người đọc"
              defaultValue={draft.current.registerName} onChange={(event) => updateDraft('registerName', event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="register-email">Email</label>
            <AuthInput id="register-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="ban@example.com"
              value={email} onChange={(event) => { setEmail(event.target.value); updateDraft('registerEmail', event.target.value); }} /></div>
        </div>
        <div className={styles.field}><label htmlFor="register-password">Mật khẩu <span>— 10 đến 128 ký tự</span></label>
          <div className={styles.password}><AuthInput id="register-password" name="password" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={10} maxLength={128} placeholder="Tạo mật khẩu của bạn"
            defaultValue={draft.current.registerPassword} onChange={(event) => updateDraft('registerPassword', event.target.value)} />
            <button type="button" aria-label={visible ? 'Ẩn mật khẩu đăng ký' : 'Hiện mật khẩu đăng ký'} aria-pressed={visible} onClick={() => setVisible(!visible)}>
              {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></div></div>
        <div className={styles.field}><label htmlFor="register-confirmation">Nhập lại mật khẩu</label>
          <AuthInput id="register-confirmation" name="passwordConfirmation" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={10} maxLength={128} placeholder="Một lần nữa, cho chắc nhé"
            defaultValue={draft.current.registerConfirmation} onChange={(event) => updateDraft('registerConfirmation', event.target.value)} /></div>
        <label className={styles.rules}><AuthInput id="accepted-rules" name="acceptedRules" type="checkbox" required />
          <span>Tôi hiểu giao dịch, tiền là mô phỏng đồ án; không thanh toán thật.</span></label>
        <AuthFieldFeedback id="accepted-rules" />
        <button className={styles.submit} type="submit">{state.busy ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'} <ArrowRight size={18} aria-hidden="true" /></button>
      </fieldset>
    </AuthForm>}
    {state.error && !otpError && <p id="register-error" className={styles.error} role="alert">{state.error}</p>}
    {state.message && <p className={styles.feedback} role="status">{state.message}</p>}
    {!verified && <p className={styles.registration}>Đã có tài khoản? <AuthPageLink className={styles.textAction} to={'/login' + search}>Đăng nhập</AuthPageLink>
      {!token && !sent && <button className={styles.textAction} type="button" aria-label="Gửi lại email xác minh" onClick={() => setSent(true)}>Gửi lại xác minh</button>}</p>}
  </section>;
}
