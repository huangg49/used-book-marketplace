import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Menu, MessageCircle, Plus, X } from "lucide-react";
import { ROUTES, searchUrl } from "../lib/routes";
import { observeHeaderScroll } from "../lib/header-scroll";
import { memberNavigationSection } from "../lib/member-navigation";
import { useSession } from "../hooks/useSession";
import { AccountMenu } from "./AccountMenu";
import { accountNavigation } from "../lib/account-navigation";
import { useAccountLogout } from "../hooks/useAccountLogout";
import { NotificationBell } from "./NotificationBell";
import { CategoryNavigation, MobileCategories } from "./CategoryNavigation";
import { getPurchaseConversations } from "../services/purchase-conversations";
import styles from "../layouts/MainLayout.module.css";

const links = [
  { id: "books", label: "Tìm sách", to: ROUTES.search },
  { id: "exchange", label: "Đổi sách", to: searchUrl({ mode: "Exchange" }) },
  { id: "auction", label: "Đấu giá", to: ROUTES.auctions },
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
export function Header({
  freezeScroll = false,
}: {
  forceDark?: boolean;
  forceSolid?: boolean;
  freezeScroll?: boolean;
}) {
  const location = useLocation();
  const headerRef = useRef<HTMLElement>(null);
  const categoryArrival = useRef(false);
  const [floating, setFloating] = useState(() => window.scrollY > 48);
  const [collapsing, setCollapsing] = useState(false);
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === location.key;
  const setMenuOpen = (open: boolean) =>
    setMenuPath(open ? location.key : null);
  const state = useSession();
  const accountLogout = useAccountLogout();

  const conversationsQuery = useQuery({
    queryKey: [
      "purchase-conversations",
      state.status === "authenticated" ? state.user.id : undefined,
    ],
    queryFn: getPurchaseConversations,
    enabled: state.status === "authenticated",
    staleTime: 30_000,
    retry: false,
  });
  const activeRoomsCount =
    conversationsQuery.data?.filter((c) => c.status === "Active").length ?? 0;
  useEffect(() => {
    if (!categoryArrival.current) return;
    categoryArrival.current = false;
    window.scrollTo({ top: 0, behavior: "instant" });
    document.getElementById("search-title")?.focus({ preventScroll: true });
  }, [location.key]);
  const onCategoryNavigate = () => {
    categoryArrival.current = true;
  };
  useLayoutEffect(
    () =>
      observeHeaderScroll((next, animate) => {
        if (freezeScroll) return;
        setFloating(next);
        setCollapsing(animate);
      }),
    [location.pathname, freezeScroll],
  );
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
    const outside = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuPath(null);
    };
    const focusOutside = (event: FocusEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuPath(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focusOutside);
    return () => {
      window.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", focusOutside);
    };
  }, [menuOpen]);
  const currentSection = memberNavigationSection(location.pathname, location.search);
  return (
    <div className={styles.headerSlot} data-member-header-slot>
      <header
        ref={headerRef}
        className={styles.header}
        data-floating={floating}
        data-menu-open={menuOpen}
        data-collapsing={collapsing}
        data-authenticated={state.status === "authenticated"}
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
          <div className={styles.headerBrand}>
            <Logo />
            <CategoryNavigation onNavigate={onCategoryNavigate} />
          </div>
          <nav className={styles.desktopNav} aria-label="Điều hướng chính">
            {links.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={currentSection === item.id ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className={styles.headerActions}>
            {state.status === "authenticated" && (
              <NavLink
                to={ROUTES.chat()}
                className={styles.iconAction}
                aria-label={
                  activeRoomsCount > 0
                    ? `Chat, ${activeRoomsCount} cuộc trò chuyện đang hoạt động`
                    : "Chat, hội thoại của bạn"
                }
                title="Chat"
              >
                <MessageCircle size={20} aria-hidden="true" />
                {activeRoomsCount > 0 && (
                  <span className={styles.chatBadge} aria-hidden="true">
                    {activeRoomsCount > 9 ? "9+" : activeRoomsCount}
                  </span>
                )}
              </NavLink>
            )}
            {state.status === "authenticated" && <NotificationBell />}
            {state.status === "authenticated" ? (
              <AccountMenu displayName={state.user.displayName} />
            ) : (
              <Link className={styles.account} to={ROUTES.login}>
                Đăng nhập
              </Link>
            )}
            <Link
              to={ROUTES.sell}
              className={styles.post}
              aria-label="Đăng sách"
              title="Đăng sách"
            >
              <Plus size={18} aria-hidden="true" />
              <span>Đăng sách</span>
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
              {menuOpen ? (
                <X aria-hidden="true" />
              ) : (
                <Menu aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            id="mobile-nav"
            className={styles.mobileNav}
            aria-label="Điều hướng trên điện thoại"
          >
            <MobileCategories onNavigate={onCategoryNavigate} />
            {links.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={currentSection === item.id ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
            <Link to={ROUTES.sell}>Đăng sách</Link>

            {state.status === "authenticated" ? (
              <>
                <div className={styles.mobileDivider} aria-hidden="true" />

                {/* Hub giao tiếp & Thông báo thông minh */}
                <div className={styles.mobileQuickHub}>
                  <NavLink
                    to={ROUTES.chat()}
                    className={styles.mobileQuickItem}
                    aria-label="Hội thoại Chat"
                  >
                    <div className={styles.mobileQuickIcon}>
                      <MessageCircle size={18} aria-hidden="true" />
                      {activeRoomsCount > 0 && (
                        <span className={styles.mobileQuickDot} aria-hidden="true" />
                      )}
                    </div>
                    <div className={styles.mobileQuickInfo}>
                      <span className={styles.mobileQuickTitle}>Hội thoại Chat</span>
                      <span className={styles.mobileQuickDesc}>
                        {activeRoomsCount > 0
                          ? `${activeRoomsCount} cuộc trò chuyện`
                          : "Thương lượng & trao đổi"}
                      </span>
                    </div>
                  </NavLink>

                  <NavLink
                    to={ROUTES.notifications}
                    className={styles.mobileQuickItem}
                    aria-label="Thông báo tài khoản"
                  >
                    <div className={styles.mobileQuickIcon}>
                      <Bell size={18} aria-hidden="true" />
                    </div>
                    <div className={styles.mobileQuickInfo}>
                      <span className={styles.mobileQuickTitle}>Thông báo</span>
                      <span className={styles.mobileQuickDesc}>Cập nhật tin mới</span>
                    </div>
                  </NavLink>
                </div>

                <div className={styles.mobileDivider} aria-hidden="true" />

                {accountNavigation.map(({ to, label }) => (
                  <NavLink key={to} to={to} end>
                    {label}
                  </NavLink>
                ))}
                <button
                  type="button"
                  disabled={accountLogout.busy}
                  onClick={() => void accountLogout.logout()}
                >
                  {accountLogout.busy ? "Đang đăng xuất…" : "Đăng xuất"}
                </button>
                {accountLogout.error && (
                  <p role="alert">{accountLogout.error}</p>
                )}
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
