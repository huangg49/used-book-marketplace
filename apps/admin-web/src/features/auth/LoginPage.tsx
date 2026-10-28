import { useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { session } from "../../core/session";
import { Button, ErrorNotice } from "../../core/ui";
import { BrandMark } from "../../core/brand-mark";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const submitting = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await session.login({
        email: String(data.get("email") || email).trim(),
        password: String(data.get("password") || password),
      });
      // Keep protected deep links; the root entry opens the existing dashboard.
      if (location.pathname === "/") navigate("/dashboard", { replace: true });
    } catch (cause) {
      setError(cause);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <main className={styles.root} aria-labelledby="admin-login-title">
    <img className={styles.background} src="/login-art/admin-meadow-v3.png" alt="" fetchPriority="high" />
    <section className={styles.story} aria-label="Không gian sách Lật Lại">
      <Link className={styles.brand} to="/" aria-label="Lật Lại — trang đăng nhập">
        <BrandMark className={styles.logo} wordmark />
      </Link>
      <div className={styles.copy}>
        <p className={styles.copyTitle}>Trang sách cũ.<br />Hành trình mới.</p>
        <p>Chăm chút từng cuốn sách, tiếp nối từng câu chuyện.</p>
      </div>
    </section>
    <img className={styles.books} src="/login-art/admin-books-v3.png" width="1254" height="1254" alt="" fetchPriority="high" />
    <div className={styles.badge} aria-hidden="true">
      <div className={styles.badgeFace}><div className={styles.badgeRecess}>
        <BrandMark className={styles.badgeMark} />
        <span className={styles.badgeGlint} />
      </div></div>
    </div>
    <section className={styles.formSide} aria-label="Đăng nhập quản trị">
      <div className={styles.stack}>
        <div className={styles.backSheet} aria-hidden="true" />
        <div className={styles.middleSheet} aria-hidden="true" />
        <section className={styles.paper} aria-labelledby="admin-login-title">
          <header className={styles.paperHeader}>
            <Link className={styles.paperBrand} to="/" aria-label="Lật Lại — trang đăng nhập">
              <BrandMark className={styles.logo} wordmark />
            </Link>
            <p className={styles.kind}>Thẻ vận hành</p>
          </header>
          <h1 id="admin-login-title">Lại gặp nhau rồi.</h1>
          <p className={styles.lede}>Đăng nhập để tiếp tục kiểm duyệt và vận hành.</p>
          <form onSubmit={(event) => void submit(event)} aria-busy={busy} aria-describedby={error !== undefined ? "admin-login-error" : undefined}>
            <div className={styles.field}>
              <label htmlFor="admin-email">Email <span aria-hidden="true">— tài khoản được cấp</span></label>
              <input id="admin-email" name="email" type="email" autoComplete="username" required disabled={busy}
                placeholder="Nhập email được cấp" value={email}
                onChange={(event) => { setEmail(event.target.value); setError(undefined); }} />
            </div>
            <div className={styles.field}>
              <label htmlFor="admin-password">Mật khẩu <span aria-hidden="true">— mã số thẻ</span></label>
              <div className={styles.password}>
                <input id="admin-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                  required disabled={busy} value={password}
                  onChange={(event) => { setPassword(event.target.value); setError(undefined); }} />
                <button className={styles.reveal} type="button" disabled={busy} onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                </button>
              </div>
            </div>
            {error !== undefined && <div id="admin-login-error" className={styles.error}><ErrorNotice error={error} /></div>}
            <Button variant="primary" className={styles.submit} type="submit" busy={busy}>
              {busy ? "Đang đăng nhập…" : <>Đăng nhập<ArrowRight size={18} aria-hidden="true" /></>}
            </Button>
          </form>
          <p className={styles.accessNote}><Lock size={14} aria-hidden="true" />Dành cho tài khoản được cấp quyền.</p>
        </section>
      </div>
    </section>
  </main>;
}
