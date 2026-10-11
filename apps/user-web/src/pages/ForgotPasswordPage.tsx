import { ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { AuthPageLink } from "../layouts/AuthLayout";
import styles from "./LoginPage.module.css";

export function ForgotPasswordPage() {
  const { search } = useLocation();
  return <section className={styles.panel} aria-labelledby="recovery-title">
    <h1 id="recovery-title" tabIndex={-1}>Tìm lại mã số thẻ.</h1>
    <p className={styles.lede}>Quên mật khẩu rồi? Không sao, câu chuyện vẫn còn ở đây.</p>
    <div className={styles.unavailable}>
      <h2>Khôi phục mật khẩu chưa được hỗ trợ</h2>
      <p>Hiện Lật lại chưa thể gửi email đặt lại mật khẩu. Bạn có thể quay lại đăng nhập để thử lại, hoặc tiếp tục xem sách.</p>
      <p className={styles.librarianNote}>Chưa vào được thì ghé kệ sách một chút nhé.</p>
    </div>
    <AuthPageLink className={styles.submit} to={"/login" + search}>Quay lại đăng nhập <ArrowRight size={18} aria-hidden="true" /></AuthPageLink>
    <p className={styles.registration}><Link className={styles.textAction} to="/books">Tiếp tục xem sách</Link></p>
  </section>;
}
