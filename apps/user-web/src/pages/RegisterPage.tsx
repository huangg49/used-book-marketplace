import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Logo } from "../components/Header";
import styles from "./LoginPage.module.css";

export function RegisterPage() {
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
            <ArrowLeft size={18} aria-hidden="true" />
            Về trang chủ
          </Link>
        </header>
        <div className={styles.formArea}>
          <section className={styles.panel} aria-labelledby="register-title">
            <h1 id="register-title">
              Hẹn bạn ở <span>Lật lại.</span>
            </h1>
            <p>
              Đăng ký tài khoản hiện chưa mở. Bạn vẫn có thể khám phá những cuốn
              sách đang được đăng.
            </p>
            <Link className={styles.submit} to="/books">
              Khám phá sách <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <div className={styles.registration}>
              <p>Đã có tài khoản?</p>
              <Link className={styles.back} to="/login">
                Đăng nhập
              </Link>
            </div>
          </section>
        </div>
        <p className={styles.note}>Lật lại · Sách cũ. Người đọc mới.</p>
      </div>
    </main>
  );
}
