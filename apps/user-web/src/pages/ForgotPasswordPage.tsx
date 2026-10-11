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

export function ForgotPasswordPage() {
  const { search } = useLocation();
  const { draft, updateDraft } = useAuthPaper();
  const state = useAccountForm();
  const [done, setDone] = useState(false);
  const token = useAuthLink('reset', done);
  const [visible, setVisible] = useState(false);
  const [newLink, setNewLink] = useState(false);
  const [challenge, setChallenge] = useOtpChallenge('reset-otp', done);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState(draft.current.recoveryEmail);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if ((done || newLink || challenge) && !heading.current?.closest('[inert]')) heading.current?.focus(); }, [done, newLink, challenge]);
  async function forgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await state.run(async () => {
      const response = await accountAuth.requestOtp(email.trim(), 'ResetPassword');
      if (state.active.current) { setChallenge(response.challengeId); setCode(''); state.setMessage(''); state.cooldown(); }
    });
  }
  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password'));
    if (password !== data.get('passwordConfirmation')) {
      state.setError('Hai mật khẩu chưa giống nhau. Nhập lại mật khẩu cho khớp nhé.');
      form.querySelector<HTMLInputElement>('#reset-confirmation')?.focus(); return;
    }
    await state.run(async () => {
      if (challenge) await accountAuth.resetOtp({ challengeId: challenge, code, password });
      else await accountAuth.reset({ token: token!, password });
      if (state.active.current) {
        updateDraft('password', ''); updateDraft('email', email.trim()); form.reset(); setCode(''); setDone(true);
        state.setMessage('Mật khẩu đã đổi. Các phiên đăng nhập cũ đã được thu hồi.');
      }
    });
  }
  return <section className={styles.panel + ' ' + styles.recoveryPanel} aria-labelledby="recovery-title">
    <h1 ref={heading} id="recovery-title" tabIndex={-1}>{done ? 'Mã số thẻ đã đổi.' : challenge || token && !newLink ? 'Đặt mật khẩu mới.' : 'Tìm lại mã số thẻ.'}</h1>
    <p className={styles.lede}>{done ? 'Đăng nhập lại bằng mật khẩu mới để đọc tiếp nhé.' : challenge
      ? 'Nhập mã trong thư và chọn mật khẩu mới để lấy lại thẻ.' : token && !newLink
      ? 'Chọn mật khẩu từ 10 đến 128 ký tự. Bạn sẽ cần đăng nhập lại trên các thiết bị.'
      : 'Để lại email đã xác minh của tài khoản. Tớ sẽ gửi mã 6 số để bạn lấy lại thẻ.'}</p>
    {done ? <AuthPageLink className={styles.submit} to={'/login' + search}>Đăng nhập <ArrowRight size={18} aria-hidden="true" /></AuthPageLink> : challenge || token && !newLink ? <>
      {challenge && <p className={styles.otpRecipient}>{email.trim() ? <>Email: <strong>{email.trim()}</strong></> : 'Dùng mã đã nhận trong hộp thư của bạn.'}</p>}
      <form onSubmit={(event) => void reset(event)} aria-busy={state.busy} aria-describedby={state.error ? 'recovery-error' : undefined}>
        <fieldset className={styles.formFields} disabled={state.busy}>
          {challenge && <EmailOtpField id="recovery-otp" code={code} onChange={setCode} invalid={!!state.error} />}
          <div className={styles.formGrid}>
          <div className={styles.field}><label htmlFor="reset-password">Mật khẩu mới</label>
            <div className={styles.password}><input id="reset-password" name="password" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} required />
              <button type="button" aria-label={visible ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'} aria-pressed={visible} onClick={() => setVisible(!visible)}>
                {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></div></div>
          <div className={styles.field}><label htmlFor="reset-confirmation">Nhập lại mật khẩu</label>
            <input id="reset-confirmation" name="passwordConfirmation" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} required /></div>
          </div>
          <p className={styles.otpHint}>Mật khẩu từ 10 đến 128 ký tự.</p>
          <button className={styles.submit} type="submit">{state.busy ? 'Đang đổi mật khẩu…' : 'Lưu mật khẩu mới'} <ArrowRight size={18} aria-hidden="true" /></button>
        </fieldset>
      </form>
      {challenge ? <div className={styles.otpActions}>
        <button className={styles.textAction} type="button" disabled={state.busy || state.remaining > 0 || !email.trim()} onClick={() => void state.run(async () => {
          const response = await accountAuth.requestOtp(email.trim(), 'ResetPassword');
          if (state.active.current) { setChallenge(response.challengeId); setCode(''); state.cooldown(); }
        })}>{state.remaining > 0 ? 'Gửi lại sau ' + state.remaining + ' giây' : 'Gửi lại mã'}</button>
        <button className={styles.textAction} type="button" disabled={state.busy} onClick={() => { setChallenge(null); setNewLink(true); setCode(''); state.setError(''); }}>{email.trim() ? 'Dùng email khác' : 'Nhập email để gửi lại'}</button>
      </div> : state.error && <button className={styles.textAction} type="button" onClick={() => { setNewLink(true); state.setError(''); }}>Yêu cầu mã mới</button>}
    </> : <>
      <p className={styles.librarianNote}>Lạc một dòng thôi.<br />Câu chuyện vẫn còn ở đây.</p>
      <form onSubmit={(event) => void forgot(event)} aria-busy={state.busy} aria-describedby={state.error ? 'recovery-error' : undefined}>
        <div className={styles.field}><label htmlFor="recovery-email">Email của tài khoản</label>
          <input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="ban@example.com"
            value={email} onChange={(event) => { setEmail(event.target.value); updateDraft('recoveryEmail', event.target.value); }} /></div>
        <button className={styles.submit} type="submit" disabled={state.busy || state.remaining > 0}>
          {state.busy ? 'Đang yêu cầu mã…' : state.remaining > 0 ? 'Gửi lại sau ' + state.remaining + ' giây' : 'Gửi mã khôi phục'} <ArrowRight size={18} aria-hidden="true" /></button>
      </form>
      <p className={styles.availability}>Chưa nhận được thư? Kiểm tra thư rác. Tài khoản chưa xác minh cần xác minh email trước.</p>
    </>}
    {state.error && <p id="recovery-error" className={styles.error} role="alert">{state.error}</p>}
    {state.message && <p className={styles.feedback} role="status">{state.message}</p>}
    {!done && <p className={styles.registration}><AuthPageLink className={styles.textAction} to={'/login' + search}>Quay lại đăng nhập</AuthPageLink>
      <AuthPageLink className={styles.textAction} to={'/register' + search}>Đăng ký / xác minh email</AuthPageLink></p>}
  </section>;
}
