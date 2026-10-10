import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft, ArrowRight } from "lucide-react";
import { ApiError } from "@used-books/session-client";
import { session } from "../lib/session";
import { Logo } from "../components/Header";
import styles from "./LoginPage.module.css";
export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  const [help, setHelp] = useState<"password" | "register">();
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
    <main className={styles.root}>
      <aside
        className={styles.bookshop}
        aria-label="Lật lại · Chuyện hay còn tiếp"
      >
        <div className={styles.scene}>
          <img
            className={styles.photo}
            src="/photography/bookshop-barcelona.jpg"
            alt=""
            width="3000"
            height="2818"
            fetchPriority="high"
          />
          <div className={styles.tint} aria-hidden="true" />
          <div className={styles.brand}>
            <svg
              className={styles.filterDefs}
              aria-hidden="true"
              width="0"
              height="0"
            >
              <defs>
                <filter id="login-logo-ink" colorInterpolationFilters="sRGB">
                  {/* Key the original flat wine ground to alpha; keep the owner's contours. */}
                  <feColorMatrix
                    type="matrix"
                    values="0 0 0 0 .988235 0 0 0 0 .972549 0 0 0 0 .858824 1.59375 0 0 0 -.575"
                  />
                </filter>
              </defs>
            </svg>
            <Logo />
          </div>
          <div className={styles.story}>
            <p className={styles.storyTitle}>
              Chuyện hay
              <br />
              <span>còn tiếp.</span>
            </p>
            <p className={styles.storyCopy}>
              Một cuốn sách đã đọc.
              <br />
              Một câu chuyện để đọc tiếp.
            </p>
          </div>
          <p className={styles.credit}>
            Ảnh:{" "}
            <a
              href="https://unsplash.com/photos/cozy-bookstore-interior-with-bookshelves-and-warm-lighting-mWWD9Up47OM"
              target="_blank"
              rel="noreferrer"
            >
              Davit Margaryan / Unsplash
              <span className="sr-only"> (mở tab mới)</span>
            </a>
          </p>
        </div>
      </aside>
      <div className={styles.formColumn}>
        <header className={styles.utility}>
          <Link to="/" className={styles.back}>
            <ArrowLeft size={18} aria-hidden="true" /> Về trang chủ
          </Link>
        </header>
        <div className={styles.formArea}>
          <section className={styles.panel} aria-labelledby="login-title">
            <h1 id="login-title">
              Lại gặp <span>nhau rồi.</span>
            </h1>
            <p>Đăng nhập để đăng sách và trò chuyện với người bán.</p>
            <form
              onSubmit={(event) => void handleSubmit(event)}
              aria-busy={busy}
            >
              <div className={styles.field}>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="ban@example.com"
                />
              </div>
              <div className={styles.field}>
                <div className={styles.passwordLabel}>
                  <label htmlFor="password">Mật khẩu</label>
                  <button
                    type="button"
                    className={styles.textAction}
                    aria-expanded={help === "password"}
                    aria-controls="password-help"
                    onClick={() =>
                      setHelp(help === "password" ? undefined : "password")
                    }
                  >
                    Quên mật khẩu?
                  </button>
                </div>
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
                <p
                  id="password-help"
                  className={styles.help}
                  role="status"
                  hidden={help !== "password"}
                >
                  Khôi phục mật khẩu chưa được hỗ trợ. Bạn vẫn có thể tìm và xem
                  sách mà không cần đăng nhập.
                </p>
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
            <div className={styles.registration}>
              <p>Chưa có tài khoản?</p>
              <button
                type="button"
                className={styles.textAction}
                aria-expanded={help === "register"}
                aria-controls="register-help"
                onClick={() =>
                  setHelp(help === "register" ? undefined : "register")
                }
              >
                Đăng ký
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
            <p
              id="register-help"
              className={styles.help}
              role="status"
              hidden={help !== "register"}
            >
              Đăng ký tài khoản chưa được hỗ trợ. Bạn có thể về trang chủ để tìm
              và xem sách trước.
            </p>
          </section>
        </div>
        <p className={styles.note}>Lật lại · Sách cũ. Người đọc mới.</p>
      </div>
    </main>
  );
}
