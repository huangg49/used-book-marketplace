import { useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useLocation } from "react-router-dom";
import { AuthPageLink } from "../layouts/AuthPageLink";
import { useAuthPaper } from "../layouts/auth-paper";
import styles from "./LoginPage.module.css";

export function RegisterPage() {
  const { search } = useLocation();
  const { draft, updateDraft } = useAuthPaper();
  const [visible, setVisible] = useState(false);
  return <section className={styles.panel} aria-labelledby="register-title">
    <h1 id="register-title" tabIndex={-1}>Một người đọc mới.</h1>
    <p className={styles.lede}>Làm thẻ của bạn. Để những câu chuyện tìm được nhau.</p>
    <form onSubmit={(event) => event.preventDefault()} aria-describedby="register-availability">
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="register-name">Tên của bạn</label>
          <input id="register-name" name="displayName" type="text" autoComplete="name" required placeholder="Tên người đọc"
            defaultValue={draft.current.registerName} onChange={(event) => updateDraft("registerName", event.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor="register-email">Email</label>
          <input id="register-email" name="email" type="email" autoComplete="email" required placeholder="ban@example.com"
            defaultValue={draft.current.registerEmail} onChange={(event) => updateDraft("registerEmail", event.target.value)} />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor="register-password">Mật khẩu</label>
        <div className={styles.password}>
          <input id="register-password" name="password" type={visible ? "text" : "password"} autoComplete="new-password" required placeholder="Tạo mật khẩu của bạn"
            defaultValue={draft.current.registerPassword} onChange={(event) => updateDraft("registerPassword", event.target.value)} />
          <button type="button" aria-label={visible ? "Ẩn mật khẩu đăng ký" : "Hiện mật khẩu đăng ký"} aria-pressed={visible} onClick={() => setVisible(!visible)}>
            {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor="register-confirmation">Nhập lại mật khẩu</label>
        <input id="register-confirmation" name="passwordConfirmation" type={visible ? "text" : "password"} autoComplete="new-password" required placeholder="Một lần nữa, cho chắc nhé"
          defaultValue={draft.current.registerConfirmation} onChange={(event) => updateDraft("registerConfirmation", event.target.value)} />
      </div>
      <button className={styles.submit} type="submit" disabled aria-disabled="true" aria-describedby="register-availability">Tạo tài khoản <ArrowRight size={18} aria-hidden="true" /></button>
      <p id="register-availability" className={styles.availability}>Chức năng tạo tài khoản đang được hoàn thiện.</p>
    </form>
    <p className={styles.registration}>Đã có tài khoản? <AuthPageLink className={styles.textAction} to={"/login" + search}>Đăng nhập</AuthPageLink></p>
  </section>;
}
