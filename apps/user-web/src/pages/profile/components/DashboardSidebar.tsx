import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { Bell, LogOut, ChevronDown } from "lucide-react";
import { accountNavigation } from "../../../lib/account-navigation";
import { ROUTES } from "../../../lib/routes";
import { useAccountLogout } from "../../../hooks/useAccountLogout";
import { useSession } from "../../../hooks/useSession";
import styles from "../../../layouts/DashboardLayout.module.css";

export function DashboardSidebar() {
  const auth = useSession();
  const location = useLocation();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === location.key;
  const { busy, error, logout } = useAccountLogout();
  return (
    <aside className={styles.sidebar}>
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
          <strong>
            {auth.status === "authenticated" ? auth.user.displayName : ""}
          </strong>
          <p>Tài khoản Lật lại</p>
        </div>
        <nav className={styles.navigation} aria-label="Không gian cá nhân">
          {accountNavigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end>
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
          <NavLink to={ROUTES.notifications} end>
            <Bell size={18} aria-hidden="true" />
            Thông báo
          </NavLink>
        </nav>
        <button
          className={styles.logout}
          onClick={() => void logout()}
          disabled={busy}
          type="button"
        >
          <LogOut size={18} aria-hidden="true" />
          {busy ? "Đang đăng xuất…" : "Đăng xuất"}
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
