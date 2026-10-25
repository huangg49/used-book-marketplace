import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { Bell, LogOut, ChevronDown, Menu } from "lucide-react";
import { accountNavigation } from "../../../lib/account-navigation";
import { ROUTES } from "../../../lib/routes";
import { useAccountLogout } from "../../../hooks/useAccountLogout";
import { useSession } from "../../../hooks/useSession";
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

  const userInitial =
    auth.status === "authenticated"
      ? Array.from(auth.user.displayName.trim())[0]?.toLocaleUpperCase("vi-VN") || "L"
      : "L";

  return (
    <aside className={styles.sidebar} data-collapsed={collapsed}>
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
            {!collapsed ? (
              <div className={styles.identityInfo}>
                <span className={styles.avatarBadge} aria-hidden="true">
                  {userInitial}
                </span>
                <div className={styles.identityMeta}>
                  <strong className="truncate">
                    {auth.status === "authenticated" ? auth.user.displayName : ""}
                  </strong>
                  <p>Tài khoản Lật lại</p>
                </div>
              </div>
            ) : (
              <span
                className={styles.avatarBadge}
                title={
                  auth.status === "authenticated"
                    ? auth.user.displayName
                    : "Tài khoản Lật lại"
                }
                aria-hidden="true"
              >
                {userInitial}
              </span>
            )}
            {onToggleCollapse && (
              <button
                type="button"
                className={styles.collapseBtn}
                onClick={onToggleCollapse}
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
              </button>
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
              <Icon size={18} aria-hidden="true" className={styles.navIcon} />
              <span className={styles.navLabel}>{label}</span>
            </NavLink>
          ))}
          <NavLink
            to={ROUTES.notifications}
            end
            title={collapsed ? "Thông báo" : undefined}
          >
            <Bell size={18} aria-hidden="true" className={styles.navIcon} />
            <span className={styles.navLabel}>Thông báo</span>
          </NavLink>
        </nav>
        <button
          className={styles.logout}
          onClick={() => void logout()}
          disabled={busy}
          type="button"
          title={collapsed ? "Đăng xuất" : undefined}
        >
          <LogOut size={18} aria-hidden="true" className={styles.navIcon} />
          <span className={styles.navLabel}>
            {busy ? "Đang đăng xuất…" : "Đăng xuất"}
          </span>
        </button>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
