import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../components/Header";
import { PaperContext, useAuthPaper } from "./auth-paper";
import styles from "./AuthLayout.module.css";

const annotations = [
  ["Đoạn này đọc lúc 2 giờ sáng.", "trang 87, bút chì"],
  ["Tặng Lan, mùa hè 2019.", "nét mực xanh, trang đầu"],
  ["Đừng làm cong gáy nhé!", "ghi ở bìa sau"],
  ["Cuốn này đáng đọc lại.", "ghi chú ở trang cuối"],
  ["Khóc ở chương này.", "vết gạch chân hai lần"],
  ["Để dành cho người đọc tiếp.", "một dòng ở lề sách"],
];
/** Real links retain browser modifiers; ordinary navigation turns the current sheet. */
export function AuthPageLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const { turnTo } = useAuthPaper();
  return <Link to={to} className={className} onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void turnTo(to);
  }}>{children}</Link>;
}

export function AuthLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const paper = useRef<HTMLDivElement>(null);
  const running = useRef<Animation | null>(null);
  const locked = useRef(false);
  const disposed = useRef(false);
  const previousPage = useRef(location.key);
  const draft = useRef({ email: "", password: "" });
  const [transition, setTransition] = useState<{ key: string; success: boolean } | null>(null);
  const turning = transition?.key === location.key;
  const success = turning && transition.success;
  const [annotation] = useState(() => annotations[Math.floor(Math.random() * annotations.length)]);

  useEffect(() => {
    disposed.current = false;
    return () => { disposed.current = true; running.current?.cancel(); };
  }, []);
  useEffect(() => {
    running.current?.cancel();
    locked.current = false;
    document.title = (location.pathname === "/register" ? "Đăng ký" : location.pathname === "/forgot-password" ? "Quên mật khẩu" : "Đăng nhập") + " · Lật lại";
    if (previousPage.current !== location.key) paper.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    previousPage.current = location.key;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.key, location.pathname]);

  async function leave(target: string, stamped: boolean) {
    if (locked.current || disposed.current) return;
    locked.current = true;
    setTransition({ key: location.key, success: stamped });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sheet = paper.current;
    try {
      if (sheet && typeof sheet.animate === "function" && (!reduced || stamped)) {
        const animation = sheet.animate(reduced
          ? [{ opacity: 1 }, { opacity: 1 }]
          : [{ transform: "rotate(-0.7deg) rotateY(0deg)", opacity: 1 },
            { transform: "rotate(-0.7deg) rotateY(-92deg)", opacity: 0.15 }],
        { duration: reduced ? 500 : stamped ? 420 : 280,
          delay: !reduced && stamped ? 600 : 0,
          easing: "cubic-bezier(0.6, 0.05, 0.3, 1)", fill: "forwards" });
        running.current = animation;
        await animation.finished;
      }
      if (!disposed.current) navigate(target, { replace: stamped });
    } catch { /* Leaving Auth or interrupting the animation cancels the deferred route. */ }
    finally {
      running.current?.cancel();
      running.current = null;
      locked.current = false;
      if (!disposed.current) setTransition(null);
    }
  }

  const kind = location.pathname === "/register" ? "Làm thẻ mới" : location.pathname === "/forgot-password" ? "Cấp lại mã số thẻ" : "Thẻ người đọc";
  return (
    <PaperContext.Provider value={{ turnTo: (target) => leave(target, false), complete: (target) => leave(target, true), draft,
      updateDraft: (field, value) => { draft.current[field] = value; } }}>
      <main className={styles.root}>
        <div className={styles.scene} aria-hidden="true">
          <img src="/photography/bookshop-barcelona.jpg" alt="" width="3000" height="2818" fetchPriority="high" />
        </div>
        <Link to="/" className={styles.back}><ArrowLeft size={17} aria-hidden="true" /> Về trang chủ</Link>
        <div className={styles.stage}>
          <aside className={styles.annotation} aria-hidden="true">
            <p>{annotation[0]}</p><small>{annotation[1]}</small>
            <span className={styles.pencilLine} />
          </aside>
          <div className={styles.stack}>
            <div className={styles.backSheet} aria-hidden="true" />
            <div className={styles.middleSheet} aria-hidden="true" />
            <div key={location.pathname} ref={paper} className={styles.paper} data-auth-paper>
              <div inert={turning}>
                <header className={styles.paperHeader}>
                  <div className={styles.brand}>
                    <svg aria-hidden="true" width="0" height="0" className={styles.filterDefs}><defs>
                      <filter id="auth-logo-ink" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 .360784 0 0 0 0 .007843 0 0 0 0 .007843 1.59375 0 0 0 -.575" /></filter>
                    </defs></svg><Logo />
                  </div>
                  <p className={styles.kind}>{kind}</p>
                </header>
                <Outlet />
                <footer className={styles.paperFooter}>Sách cũ. Người đọc mới.</footer>
              </div>
              {success && <div className={styles.stamp} aria-hidden="true">ĐÃ MƯỢN<span>{new Date().toLocaleDateString("vi-VN")}</span></div>}
            </div>
          </div>
          <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">
            {success ? "Đăng nhập thành công. Đang mở trang tiếp theo…" : turning ? "Đang lật tờ…" : ""}
          </p>
        </div>
        <div className={styles.signature} aria-hidden="true"><p>Chuyện hay<br /><span>còn tiếp.</span></p><small>Một cuốn sách đã đọc.<br />Một câu chuyện để đọc tiếp.</small></div>
        <p className={styles.credit}>Ảnh: <a href="https://unsplash.com/photos/cozy-bookstore-interior-with-bookshelves-and-warm-lighting-mWWD9Up47OM" target="_blank" rel="noreferrer">Davit Margaryan / Unsplash<span className="sr-only"> (mở tab mới)</span></a></p>
      </main>
    </PaperContext.Provider>
  );
}
