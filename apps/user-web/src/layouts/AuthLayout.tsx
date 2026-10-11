import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { Logo } from "../components/Header";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { PaperContext, type AuthDraft } from "./auth-paper";
import { usePaperJourney } from "../components/auth/paper-journey";
import styles from "./AuthLayout.module.css";

const annotations = [
  ["Đoạn này đọc lúc 2 giờ sáng.", "trang 87, bút chì"],
  ["Tặng Lan, mùa hè 2019.", "nét mực xanh, trang đầu"],
  ["Đừng làm cong gáy nhé!", "ghi ở bìa sau"],
  ["Cuốn này đáng đọc lại.", "ghi chú ở trang cuối"],
  ["Khóc ở chương này.", "vết gạch chân hai lần"],
  ["Để dành cho người đọc tiếp.", "một dòng ở lề sách"],
];
type Turn = { id: number; from: string; target: string };
function kind(path: string) {
  return path === "/register" ? "Làm thẻ mới" : path === "/forgot-password" ? "Cấp lại mã số thẻ" : "Thẻ người đọc";
}
function NextForm({ path }: { path: string }) {
  return path === "/register" ? <RegisterPage /> : path === "/forgot-password" ? <ForgotPasswordPage /> : <LoginPage />;
}
function PaperFrame({ path, children }: { path: string; children: ReactNode }) {
  return <>
    <header className={styles.paperHeader}>
      <div className={styles.brand}><Logo /></div>
      <p className={styles.kind}>{kind(path)}</p>
    </header>
    {children}
    <footer className={styles.paperFooter}>Sách cũ. Người đọc mới.</footer>
  </>;
}

export function AuthLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const paperJourney = usePaperJourney();
  const leaf = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  const locked = useRef(false);
  const disposed = useRef(false);
  const sequence = useRef(0);
  const request = useRef<{ id: number; resolve: () => void } | null>(null);
  const previousPage = useRef(location.key);
  const draft = useRef<AuthDraft>({ email: "", password: "", registerName: "", registerEmail: "", registerPassword: "", registerConfirmation: "", recoveryEmail: "" });
  const [transition, setTransition] = useState<Turn | null>(null);
  const [departing, setDeparting] = useState(false);
  const turning = transition?.from === location.key;
  const success = departing;
  const [annotation] = useState(() => annotations[Math.floor(Math.random() * annotations.length)]);

  function settle(id?: number) {
    if (request.current && (id === undefined || request.current.id === id)) {
      request.current.resolve();
      request.current = null;
      locked.current = false;
    }
  }
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      animations.current.forEach((animation) => animation.cancel());
      settle();
    };
  }, []);
  useLayoutEffect(() => {
    document.title = (location.pathname === "/register" ? "Đăng ký" : location.pathname === "/forgot-password" ? "Quên mật khẩu" : "Đăng nhập") + " · Lật lại";
    if (previousPage.current !== location.key) {
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
      settle();
      setTransition(null);
      leaf.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    previousPage.current = location.key;
  }, [location.key, location.pathname]);

  useLayoutEffect(() => {
    if (!transition || transition.from !== location.key || !leaf.current) return;
    const sheet = leaf.current;
    const options: KeyframeAnimationOptions = { duration: 850, fill: "both" };
    let cancelled = false;
    const play = (element: Element | null, frames: Keyframe[]) => {
      if (!element || typeof element.animate !== "function") return null;
      const animation = element.animate(frames, options);
      animations.current.push(animation);
      return animation;
    };
    // Clear the stack before changing depth, then tuck the same opaque sheet
    // beneath it. All sheets share one perspective context; only light fades.
    // This finite signature motion intentionally also runs under OS reduction,
    // as explicitly requested for Auth. No autoplay or global override.
    const ease = "cubic-bezier(.4, 0, .2, 1)";
    const turn = play(sheet, [
      { transform: "translate3d(0, 0, 0) rotateZ(0deg) rotateX(0deg)", easing: ease },
      { transform: "translate3d(calc(100% + 32px), -24px, 64px) rotateZ(5deg) rotateX(4deg)", offset: .42, easing: "ease-in-out" },
      { transform: "translate3d(calc(100% + 32px), 8px, -24px) rotateZ(2.2deg) rotateX(0deg)", offset: .58, easing: "cubic-bezier(.16, 1, .3, 1)" },
      { transform: "translate3d(3px, 7px, -24px) rotateZ(2.2deg) rotateX(0deg)" },
    ]);
    play(sheet.querySelector("[data-front-light]"), [
      { opacity: 0 }, { opacity: .08, offset: .42 }, { opacity: .13, offset: .58 }, { opacity: .13 },
    ]);
    play(sheet.querySelector("[data-auth-paper]"), [
      { boxShadow: "0 2px 4px #21000040, 0 24px 60px #21000066", easing: ease },
      { boxShadow: "-12px 30px 54px #21000066, 0 8px 14px #21000026", offset: .42 },
      { boxShadow: "0 3px 8px #21000026", offset: .58 },
      { boxShadow: "0 3px 8px #21000026" },
    ]);
    play(sheet.parentElement?.querySelector("[data-next-paper]") ?? null, [
      { transform: "translate3d(2px, 3px, 0) rotateZ(.9deg)", easing: ease },
      { transform: "translate3d(2px, 3px, 0) rotateZ(.9deg)", offset: .42, easing: "cubic-bezier(.16, 1, .3, 1)" },
      { transform: "translate3d(0, 0, 0) rotateZ(0deg)" },
    ]);
    play(sheet.parentElement?.querySelector("[data-under-shadow]") ?? null, [
      { opacity: .18 }, { opacity: 0, offset: .42 }, { opacity: 0 },
    ]);
    const done = turn ? turn.finished : Promise.resolve();
    void done.then(() => {
      if (!cancelled && !disposed.current) navigate(transition.target);
    }).catch(() => {}).finally(() => settle(transition.id));
    return () => {
      cancelled = true;
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
      settle(transition.id);
    };
  }, [transition, location.key, navigate]);

  function turnTo(target: string): Promise<void> {
    if (locked.current || disposed.current || target === location.pathname + location.search) return Promise.resolve();
    locked.current = true;
    const id = ++sequence.current;
    const done = new Promise<void>((resolve) => { request.current = { id, resolve }; });
    setTransition({ id, from: location.key, target });
    return done;
  }
  async function complete(target: string) {
    if (locked.current || disposed.current) return;
    locked.current = true; setDeparting(true);
    await paperJourney(target, leaf.current?.querySelector<HTMLElement>("[data-auth-paper]") ?? null);
    locked.current = false;
    if (!disposed.current) setDeparting(false);
  }
  const targetPath = transition?.target.split("?")[0] ?? "/login";
  return <PaperContext.Provider value={{ turnTo, complete, draft,
    updateDraft: (field, value) => { draft.current[field] = value; } }}>
    <main className={styles.root}>
      <div className={styles.scene} aria-hidden="true"><img src="/photography/bookshop-barcelona.jpg" alt="" width="3000" height="2818" fetchPriority="high" /></div>
      <svg aria-hidden="true" width="0" height="0" className={styles.filterDefs}><defs>
        <filter id="auth-logo-ink" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 .360784 0 0 0 0 .007843 0 0 0 0 .007843 1.59375 0 0 0 -.575" /></filter>
      </defs></svg>
      <Link to="/" className={styles.back}><ArrowLeft size={17} aria-hidden="true" /> Về trang chủ</Link>
      <div className={styles.stage}>
        <aside className={styles.annotation} aria-hidden="true"><p>{annotation[0]}</p><small>{annotation[1]}</small><span className={styles.pencilLine} /></aside>
        <div className={styles.stack}>
          <div className={styles.pages} data-auth-book data-shuffling={turning ? "true" : undefined}>
            <div className={styles.backSheet} aria-hidden="true" /><div className={styles.middleSheet} aria-hidden="true" />
            {turning && <div className={`${styles.face} ${styles.under}`} aria-hidden="true" inert data-next-paper>
              <PaperFrame path={targetPath}><NextForm path={targetPath} /></PaperFrame>
              <div className={styles.underShadow} data-under-shadow />
            </div>}
            <div key={location.key} ref={leaf} className={styles.leaf} data-auth-leaf data-turning={turning ? "true" : undefined}>
              <div className={`${styles.face} ${styles.front}`} data-auth-paper aria-hidden={turning || success || undefined} inert={turning || success}>
                <PaperFrame path={location.pathname}>{outlet}</PaperFrame>
                {success && <div className={styles.stamp} aria-hidden="true">ĐÃ MƯỢN<span>{new Date().toLocaleDateString("vi-VN")}</span></div>}
                <div className={styles.faceLight} data-front-light />
              </div>
              <div className={`${styles.face} ${styles.reverse}`} aria-hidden="true" inert>
                <div className={styles.reverseInk}><span>LẬT LẠI</span><p>Để dành cho<br />người đọc tiếp.</p><small>Sách cũ. Người đọc mới.</small></div>
              </div>
            </div>
          </div>
        </div>
        <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">{success ? "Đăng nhập thành công. Đang mở trang tiếp theo…" : turning ? "Đang đổi thẻ…" : ""}</p>
      </div>
      <div className={styles.signature} aria-hidden="true"><p>Chuyện hay<br /><span>còn tiếp.</span></p><small>Một cuốn sách đã đọc.<br />Một câu chuyện để đọc tiếp.</small></div>
    </main>
  </PaperContext.Provider>;
}
