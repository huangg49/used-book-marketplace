import { ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { AuthPageLink } from "../layouts/AuthLayout";
import styles from "./LoginPage.module.css";

export function RegisterPage() {
  const { search } = useLocation();
  return <section className={styles.panel} aria-labelledby="register-title">
    <h1 id="register-title" tabIndex={-1}>Một người đọc mới.</h1>
    <p className={styles.lede}>Mỗi cuốn sách chờ một người đọc tiếp. Rất vui vì có bạn.</p>
    <div className={styles.unavailable}>
      <h2>Đăng ký tài khoản chưa mở</h2>
      <p>Hiện bạn chưa thể tạo tài khoản mới. Bạn vẫn có thể tìm và xem sách mà không cần đăng nhập.</p>
      <p className={styles.librarianNote}>Cứ xem sách trước nhé. Thẻ mới xin hẹn bạn sau.</p>
    </div>
    <Link className={styles.submit} to="/books">Khám phá sách <ArrowRight size={18} aria-hidden="true" /></Link>
    <p className={styles.registration}>Đã có tài khoản? <AuthPageLink className={styles.textAction} to={"/login" + search}>Đăng nhập</AuthPageLink></p>
  </section>;
}
