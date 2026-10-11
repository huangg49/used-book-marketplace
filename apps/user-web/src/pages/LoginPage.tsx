import { type FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { ApiError } from "@used-books/session-client";
import { session } from "../lib/session";
import { AuthPageLink } from "../layouts/AuthLayout";
import { useAuthPaper } from "../layouts/auth-paper";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const [params] = useSearchParams();
  const { complete, draft, updateDraft } = useAuthPaper();
  const submitting = useRef(false);
  const active = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await session.login({
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
      });
      if (!active.current) return;
      const target = params.get("returnUrl") || "/";
      const safe = target.startsWith("/") && !target.startsWith("//") &&
        new URL(target, window.location.origin).origin === window.location.origin;
      await complete(safe ? target : "/");
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 0
        ? "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."
        : "Chưa đăng nhập được. Kiểm tra email và mật khẩu rồi thử lại.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const returnQuery = params.toString() ? "?" + params.toString() : "";
  return <section className={styles.panel} aria-labelledby="login-title">
    <h1 id="login-title" tabIndex={-1}>Lại gặp nhau rồi.</h1>
    <p className={styles.lede}>Đăng nhập để đăng sách và trò chuyện với người bán.</p>
    <form onSubmit={(event) => void handleSubmit(event)} aria-busy={busy} aria-describedby={error ? "login-error" : undefined}>
      <div className={styles.field}>
        <label htmlFor="email">Email <span>— tên người đọc</span></label>
        <input id="email" name="email" type="email" autoComplete="email" required placeholder="ban@example.com"
          defaultValue={draft.current.email} onChange={(event) => updateDraft("email", event.target.value)} />
      </div>
      <div className={styles.field}>
        <div className={styles.passwordLabel}>
          <label htmlFor="password">Mật khẩu <span>— mã số thẻ</span></label>
          <AuthPageLink to={"/forgot-password" + returnQuery} className={styles.textAction}>Quên mật khẩu?</AuthPageLink>
        </div>
        <div className={styles.password}>
          <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required
            defaultValue={draft.current.password} onChange={(event) => updateDraft("password", event.target.value)} />
          <button type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {error && <p id="login-error" className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} type="submit" disabled={busy}>
        {busy ? "Đang đăng nhập…" : "Đăng nhập"}<ArrowRight size={18} aria-hidden="true" />
      </button>
    </form>
    <p className={styles.registration}>Chưa có tài khoản? <AuthPageLink to={"/register" + returnQuery} className={styles.textAction}>Đăng ký</AuthPageLink></p>
  </section>;
}
