import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { AuthPageLink } from '../layouts/AuthPageLink';
import { useAuthPaper } from '../layouts/auth-paper';
import { accountAuth } from '../services/account-auth';
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
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if ((done || newLink) && !heading.current?.closest('[inert]')) heading.current?.focus(); }, [done, newLink]);
  async function forgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email')).trim();
    await state.run(async () => {
      const response = await accountAuth.forgot(email);
      if (state.active.current) { state.setMessage(response.message); state.cooldown(); }
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
      await accountAuth.reset({ token: token!, password });
      if (state.active.current) {
        updateDraft('password', ''); form.reset(); setDone(true);
        state.setMessage('Mật khẩu đã đổi. Các phiên đăng nhập cũ đã được thu hồi.');
      }
    });
  }
  return <section className={styles.panel} aria-labelledby="recovery-title">
    <h1 ref={heading} id="recovery-title" tabIndex={-1}>{done ? 'Mã số thẻ đã đổi.' : token && !newLink ? 'Đặt mật khẩu mới.' : 'Tìm lại mã số thẻ.'}</h1>
    <p className={styles.lede}>{done ? 'Đăng nhập lại bằng mật khẩu mới để đọc tiếp nhé.' : token && !newLink
      ? 'Chọn mật khẩu từ 10 đến 128 ký tự. Bạn sẽ cần đăng nhập lại trên các thiết bị.'
      : 'Để lại email đã xác minh của tài khoản. Liên kết khôi phục có hiệu lực 15 phút.'}</p>
    {done ? <AuthPageLink className={styles.submit} to={'/login' + search}>Đăng nhập <ArrowRight size={18} aria-hidden="true" /></AuthPageLink> : token && !newLink ? <>
      <form onSubmit={(event) => void reset(event)} aria-busy={state.busy} aria-describedby={state.error ? 'recovery-error' : undefined}>
        <fieldset className={styles.formFields} disabled={state.busy}>
          <div className={styles.field}><label htmlFor="reset-password">Mật khẩu mới</label>
            <div className={styles.password}><input id="reset-password" name="password" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} required />
              <button type="button" aria-label={visible ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'} aria-pressed={visible} onClick={() => setVisible(!visible)}>
                {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></div></div>
          <div className={styles.field}><label htmlFor="reset-confirmation">Nhập lại mật khẩu mới</label>
            <input id="reset-confirmation" name="passwordConfirmation" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} required /></div>
          <button className={styles.submit} type="submit">{state.busy ? 'Đang đổi mật khẩu…' : 'Lưu mật khẩu mới'} <ArrowRight size={18} aria-hidden="true" /></button>
        </fieldset>
      </form>
      {state.error && <button className={styles.textAction} type="button" onClick={() => { setNewLink(true); state.setError(''); }}>Yêu cầu liên kết mới</button>}
    </> : <>
      <p className={styles.librarianNote}>Lạc một dòng thôi.<br />Câu chuyện vẫn còn ở đây.</p>
      <form onSubmit={(event) => void forgot(event)} aria-busy={state.busy} aria-describedby={state.error ? 'recovery-error' : undefined}>
        <div className={styles.field}><label htmlFor="recovery-email">Email của tài khoản</label>
          <input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="ban@example.com"
            defaultValue={draft.current.recoveryEmail} onChange={(event) => updateDraft('recoveryEmail', event.target.value)} /></div>
        <button className={styles.submit} type="submit" disabled={state.busy || state.remaining > 0}>
          {state.busy ? 'Đang yêu cầu khôi phục…' : state.remaining > 0 ? 'Gửi lại sau ' + state.remaining + ' giây' : 'Gửi hướng dẫn khôi phục'} <ArrowRight size={18} aria-hidden="true" /></button>
      </form>
      <p className={styles.availability}>Chưa nhận được thư? Kiểm tra thư rác. Tài khoản chưa xác minh cần xác minh email trước.</p>
    </>}
    {state.error && <p id="recovery-error" className={styles.error} role="alert">{state.error}</p>}
    {state.message && <p className={styles.feedback} role="status">{state.message}</p>}
    {!done && <p className={styles.registration}><AuthPageLink className={styles.textAction} to={'/login' + search}>Quay lại đăng nhập</AuthPageLink>
      <AuthPageLink className={styles.textAction} to={'/register' + search}>Đăng ký / xác minh email</AuthPageLink></p>}
  </section>;
}
