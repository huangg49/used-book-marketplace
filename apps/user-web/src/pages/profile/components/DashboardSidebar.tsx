import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, ChevronDown, Menu } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { accountNavigation } from "../../../lib/account-navigation";
import { ROUTES } from "../../../lib/routes";
import { useAccountLogout } from "../../../hooks/useAccountLogout";
import { useSession } from "../../../hooks/useSession";
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

  const userInitial =
    auth.status === "authenticated"
      ? Array.from(auth.user.displayName.trim())[0]?.toLocaleUpperCase("vi-VN") || "L"
      : "L";

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
        Không gian cá nhân <ChevronDown size={18} aria-hidden="true" />
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
                    ? auth.user.displayName
                    : "Tài khoản Lật lại"
                }
                aria-hidden="true"
              >
                {userInitial}
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
                      {auth.status === "authenticated" ? auth.user.displayName : ""}
                    </strong>
                    <p>Tài khoản Lật lại</p>
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
          {accountNavigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              title={collapsed ? label : undefined}
            >
              <motion.div
                className={styles.navLinkContent}
                whileHover={{ x: collapsed ? 0 : 4 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 450, damping: 25 }}
              >
                <Icon size={18} aria-hidden="true" className={styles.navIcon} />
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
          ))}
          <NavLink
            to={ROUTES.notifications}
            end
            title={collapsed ? (unreadCount > 0 ? `Thông báo (${unreadCount} mới)` : "Thông báo") : undefined}
          >
            <motion.div
              className={styles.navLinkContent}
              whileHover={{ x: collapsed ? 0 : 4 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 450, damping: 25 }}
            >
              <div className="relative inline-flex items-center justify-center">
                <Bell size={18} aria-hidden="true" className={styles.navIcon} />
                {collapsed && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#5c0202] border border-white" />
                )}
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
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#5c0202] text-white tabular-nums flex-shrink-0">
                        {unreadCount}
                      </span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </NavLink>
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
            whileHover={{ x: collapsed ? 0 : 4 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 450, damping: 25 }}
          >
            <LogOut size={18} aria-hidden="true" className={styles.navIcon} />
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
