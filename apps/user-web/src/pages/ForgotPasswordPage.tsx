import { ArrowRight } from "lucide-react";
import { useLocation } from "react-router-dom";
import { AuthPageLink } from "../layouts/AuthPageLink";
import { useAuthPaper } from "../layouts/auth-paper";
import styles from "./LoginPage.module.css";

export function ForgotPasswordPage() {
  const { search } = useLocation();
  const { draft, updateDraft } = useAuthPaper();
  return <section className={styles.panel} aria-labelledby="recovery-title">
    <h1 id="recovery-title" tabIndex={-1}>Tìm lại mã số thẻ.</h1>
    <p className={styles.lede}>Quên mật khẩu rồi? Để lại email gắn với tài khoản của bạn.</p>
    <p className={styles.librarianNote}>Lạc một dòng thôi.<br />Câu chuyện vẫn còn ở đây.</p>
    <form onSubmit={(event) => event.preventDefault()} aria-describedby="recovery-availability">
      <div className={styles.field}>
        <label htmlFor="recovery-email">Email của tài khoản</label>
        <input id="recovery-email" name="email" type="email" autoComplete="email" required placeholder="ban@example.com"
          defaultValue={draft.current.recoveryEmail} onChange={(event) => updateDraft("recoveryEmail", event.target.value)} />
      </div>
      <button className={styles.submit} type="submit" disabled aria-disabled="true" aria-describedby="recovery-availability">Gửi hướng dẫn khôi phục <ArrowRight size={18} aria-hidden="true" /></button>
      <p id="recovery-availability" className={styles.availability}>Chức năng gửi email khôi phục đang được hoàn thiện.</p>
    </form>
    <p className={styles.registration}><AuthPageLink className={styles.textAction} to={"/login" + search}>Quay lại đăng nhập</AuthPageLink></p>
  </section>;
}
