import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  Library,
  Bell,
  ArrowLeftRight,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { session } from "../../../lib/session";
import { useSession } from "../../../hooks/useSession";
import styles from "../../../layouts/DashboardLayout.module.css";

export function DashboardSidebar() {
  const auth = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  async function logout() {
    setBusy(true);
    setError(false);
    try {
      await session.logout();
      navigate("/login", { replace: true });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className={styles.sidebar}>
      <button
        className={styles.accountMenu}
        type="button"
        aria-expanded={menuOpen}
        aria-controls="account-navigation"
        onClick={() => setMenuOpen(!menuOpen)}
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
          <Link to="/profile" aria-current="page">
            <Library size={18} aria-hidden="true" />
            Kệ sách của tôi
          </Link>
          <Link to="/exchange/mine">
            <ArrowLeftRight size={18} aria-hidden="true" />
            Đề nghị đổi sách
          </Link>
          <Link to="/notifications">
            <Bell size={18} aria-hidden="true" />
            Thông báo
          </Link>
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
            Chưa đăng xuất được. Thử lại giúp mình.
          </p>
        )}
      </div>
    </aside>
  );
}
