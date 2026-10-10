import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { ApiError } from "@used-books/session-client";
import { session } from "../lib/session";
import { AuthLayout } from "../layouts/AuthLayout";
import styles from "./LoginPage.module.css";
export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      await session.login({
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
      });
      const target = params.get("returnUrl") || "/";
      const safe =
        target.startsWith("/") &&
        !target.startsWith("//") &&
        new URL(target, window.location.origin).origin ===
          window.location.origin;
      navigate(safe ? target : "/", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 0
          ? "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."
          : "Chưa đăng nhập được. Kiểm tra email và mật khẩu rồi thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <section className={styles.panel}>
        <h1>
          CHÀO BẠN,
          <br />
          <span>LẠI GẶP NHAU RỒI.</span>
        </h1>
        <p>Đăng nhập để đăng sách và trò chuyện với người bán.</p>
        <form onSubmit={(event) => void handleSubmit(event)} aria-busy={busy}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="ban@example.com"
          />
          <label htmlFor="password">Mật khẩu</label>
          <div className={styles.password}>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff size={20} aria-hidden="true" />
              ) : (
                <Eye size={20} aria-hidden="true" />
              )}
            </button>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "Đang đăng nhập…" : "Đăng nhập"}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>
        <Link to="/" className={styles.back}>
          Về trang chủ
        </Link>
      </section>
    </AuthLayout>
  );
}
