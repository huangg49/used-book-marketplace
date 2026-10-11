import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Plus, X } from "lucide-react";
import { ROUTES, searchUrl } from "../lib/routes";
import { useSession } from "../hooks/useSession";
import { session } from "../lib/session";
import { NotificationBell } from "./NotificationBell";
import styles from "../layouts/MainLayout.module.css";

const links = [
  { label: "Tìm sách", to: ROUTES.search },
  { label: "Sách để đổi", to: searchUrl({ mode: "Exchange" }) },
  { label: "Đấu giá", to: ROUTES.auctions },
];
export function Logo() {
  return (
    <Link
      to={ROUTES.home}
      className={styles.logo}
      aria-label="Trang chủ Lật lại"
    >
      <span className={styles.logoOwl}>
        <img src="/brand/logo-original.png" alt="" />
      </span>
      <span className={styles.logoWord}>
        <img src="/brand/logo-original.png" alt="" />
      </span>
    </Link>
  );
}
export function Header(_props: { forceDark?: boolean; forceSolid?: boolean }) {
  const location = useLocation();
  const [floating, setFloating] = useState(() => window.scrollY > 48);
  const [collapsing, setCollapsing] = useState(false);
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === location.key;
  const setMenuOpen = (open: boolean) =>
    setMenuPath(open ? location.key : null);
  const state = useSession();
  useEffect(() => {
    let compact = window.scrollY > 48;
    const update = () => {
      // Separate thresholds prevent flicker when scrolling near the top.
      const next = compact ? window.scrollY > 16 : window.scrollY > 48;
      if (next !== compact) {
        compact = next;
        setCollapsing(next);
        setFloating(next);
      }
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1001px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuPath(null);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuPath(null);
        document.getElementById("member-menu-toggle")?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);
  const active = (to: string) => location.pathname + location.search === to;
  return (
    <div className={styles.headerSlot}>
      <header
        className={styles.header}
        data-floating={floating}
        data-menu-open={menuOpen}
        data-collapsing={collapsing}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setCollapsing(false);
        }}
      >
        <svg className={styles.navEdge} aria-hidden="true" focusable="false">
          <rect
            x="1.25"
            y="1.25"
            width="calc(100% - 2.5px)"
            height="calc(100% - 2.5px)"
            pathLength="100"
          />
        </svg>
        <div className={styles.headerInner}>
          <Logo />
          <nav className={styles.desktopNav} aria-label="Điều hướng chính">
            {links.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active(item.to) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className={styles.headerActions}>
            {state.status === "authenticated" && <NotificationBell />}
            <Link
              className={styles.account}
              to={state.status === "authenticated" ? "/profile" : ROUTES.login}
            >
              {state.status === "authenticated" ? "Tài khoản" : "Đăng nhập"}
            </Link>
            <Link to={ROUTES.sell} className={styles.post}>
              <Plus size={18} aria-hidden="true" />
              Đăng sách
            </Link>
            <button
              id="member-menu-toggle"
              type="button"
              className={styles.menuButton}
              aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            id="mobile-nav"
            className={styles.mobileNav}
            aria-label="Điều hướng trên điện thoại"
          >
            {links.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active(item.to) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
            <Link to={ROUTES.sell}>Đăng sách</Link>
            {state.status === "authenticated" ? (
              <>
                <Link to={ROUTES.notifications}>Thông báo</Link>
                <Link to="/profile">Hồ sơ ({state.user.displayName})</Link>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void session.logout();
                  }}
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <Link to={ROUTES.login}>Đăng nhập</Link>
            )}
          </nav>
        )}
      </header>
    </div>
  );
}
