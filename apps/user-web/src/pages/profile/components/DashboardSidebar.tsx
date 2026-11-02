import { NavLink, useLocation } from "react-router-dom";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, ChevronDown, Menu } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { accountNavigation } from "../../../lib/account-navigation";
import { ROUTES } from "../../../lib/routes";
import { useAccountLogout } from "../../../hooks/useAccountLogout";
import { useSession } from "../../../hooks/useSession";
import { useCurrentMemberAvatar } from "../../../hooks/useCurrentMemberAvatar";
import { listNotifications } from "../../../services/notifications";
import styles from "../../../layouts/DashboardLayout.module.css";

interface DashboardSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function DashboardSidebar({
  collapsed = false,
  onToggleCollapse,
}: DashboardSidebarProps) {
  const auth = useSession();
  const {
    avatarUrl,
    initial: userInitial,
    displayName,
    onImageError,
  } = useCurrentMemberAvatar();
  const location = useLocation();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === location.key;
  const { busy, error, logout } = useAccountLogout();

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "page"],
    queryFn: () => listNotifications(undefined, 1),
    enabled: auth.status === "authenticated",
    staleTime: 30_000,
  });
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const currentNav = accountNavigation.find(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  );
  const currentTitle = currentNav?.label ?? "Không gian cá nhân";

  return (
    <motion.aside
      className={styles.sidebar}
      data-collapsed={collapsed}
      initial={false}
      animate={{ width: collapsed ? 68 : 240 }}
      transition={{ type: "spring", stiffness: 350, damping: 30 }}
    >
      <button
        className={styles.accountMenu}
        type="button"
        aria-expanded={menuOpen}
        aria-controls="account-navigation"
        onClick={() => setMenuPath(menuOpen ? null : location.key)}
      >
        <span>
          <strong>Menu:</strong> {currentTitle}
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          style={{
            transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>
      <div
        id="account-navigation"
        className={styles.menuContents}
        data-open={menuOpen}
      >
        <div className={styles.identity}>
          <div className={styles.identityRow}>
            <div className={styles.identityInfo}>
              <motion.span
                className={styles.avatarBadge}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                title={
                  auth.status === "authenticated"
                    ? displayName || auth.user.displayName
                    : "Tài khoản Lật lại"
                }
                aria-hidden="true"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className={styles.sidebarAvatarImg}
                    onError={onImageError}
                  />
                ) : (
                  userInitial
                )}
              </motion.span>
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.div
                    key="identityMeta"
                    initial={{ opacity: 0, width: 0, x: -10 }}
                    animate={{ opacity: 1, width: "auto", x: 0 }}
                    exit={{ opacity: 0, width: 0, x: -10 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className={styles.identityMeta}
                  >
                    <strong className="truncate">
                      {displayName || (auth.status === "authenticated" ? auth.user.displayName : "")}
                    </strong>
                    <p className={styles.identitySubtitle}>Thành viên Bạn đọc</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {onToggleCollapse && (
              <motion.button
                type="button"
                className={styles.collapseBtn}
                onClick={onToggleCollapse}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.88 }}
                animate={{ rotate: collapsed ? 90 : 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                aria-label={
                  collapsed
                    ? "Mở rộng thanh điều hướng"
                    : "Thu gọn thanh điều hướng"
                }
                title={
                  collapsed
                    ? "Mở rộng thanh điều hướng"
                    : "Thu gọn thanh điều hướng"
                }
              >
                <Menu size={18} aria-hidden="true" />
              </motion.button>
            )}
          </div>
        </div>
        <nav className={styles.navigation} aria-label="Không gian cá nhân">
          {accountNavigation.map(({ to, label, icon: Icon, section }, index) => {
            const prevItem = accountNavigation[index - 1];
            const isNewSection = prevItem && prevItem.section !== section;
            return (
              <Fragment key={to}>
                {isNewSection && (
                  <div className={styles.navDivider} aria-hidden="true" />
                )}
                <NavLink
                  to={to}
                  end
                  title={collapsed ? label : undefined}
                >
                  <motion.div
                    className={styles.navLinkContent}
                    whileHover={{ x: collapsed ? 0 : 3 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 450, damping: 25 }}
                  >
                    <div className={styles.navIconBox}>
                      <Icon size={17} aria-hidden="true" className={styles.navIcon} />
                    </div>
                    <AnimatePresence initial={false}>
                      {!collapsed && (
                        <motion.span
                          key={to}
                          initial={{ opacity: 0, width: 0, x: -8 }}
                          animate={{ opacity: 1, width: "auto", x: 0 }}
                          exit={{ opacity: 0, width: 0, x: -8 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className={styles.navLabel}
                        >
                          {label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </NavLink>

                {to === "/reviews" && (
                  <NavLink
                    to={ROUTES.notifications}
                    end
                    title={
                      collapsed
                        ? unreadCount > 0
                          ? `Thông báo (${unreadCount} mới)`
                          : "Thông báo"
                        : undefined
                    }
                  >
                    <motion.div
                      className={styles.navLinkContent}
                      whileHover={{ x: collapsed ? 0 : 3 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: "spring", stiffness: 450, damping: 25 }}
                    >
                      <div className={styles.navIconBox}>
                        <div className="relative inline-flex items-center justify-center">
                          <Bell size={17} aria-hidden="true" className={styles.navIcon} />
                          {collapsed && unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#5c0202] border border-white" />
                          )}
                        </div>
                      </div>
                      <AnimatePresence initial={false}>
                        {!collapsed && (
                          <motion.div
                            key="notifications"
                            initial={{ opacity: 0, width: 0, x: -8 }}
                            animate={{ opacity: 1, width: "auto", x: 0 }}
                            exit={{ opacity: 0, width: 0, x: -8 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="flex items-center justify-between flex-1 gap-2 min-w-0"
                          >
                            <span className={styles.navLabel}>Thông báo</span>
                            {unreadCount > 0 && (
                              <span className={styles.navBadge}>
                                {unreadCount}
                              </span>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </NavLink>
                )}
              </Fragment>
            );
          })}
        </nav>
        <button
          className={styles.logout}
          onClick={() => void logout()}
          disabled={busy}
          type="button"
          title={collapsed ? "Đăng xuất" : undefined}
        >
          <motion.div
            className={styles.navLinkContent}
            whileHover={{ x: collapsed ? 0 : 3 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 450, damping: 25 }}
          >
            <div className={styles.navIconBox}>
              <LogOut size={17} aria-hidden="true" className={styles.navIcon} />
            </div>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  key="logout"
                  initial={{ opacity: 0, width: 0, x: -8 }}
                  animate={{ opacity: 1, width: "auto", x: 0 }}
                  exit={{ opacity: 0, width: 0, x: -8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={styles.navLabel}
                >
                  {busy ? "Đang đăng xuất…" : "Đăng xuất"}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        </button>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </motion.aside>
  );
}
