import { Navigate, Outlet } from "react-router-dom";
import { DashboardSidebar } from "../pages/profile/components/DashboardSidebar";
import { Header } from "../components/Header";
import { useSession } from "../hooks/useSession";
import styles from "./DashboardLayout.module.css";

export function DashboardLayout() {
  const auth = useSession();
  if (auth.status === "loading")
    return <main className={styles.loading}>Đang khôi phục phiên…</main>;
  if (auth.status !== "authenticated")
    return <Navigate to="/login?returnUrl=%2Fprofile" replace />;
  return (
    <div className={styles.root}>
      <a className={styles.skip} href="#account-content">
        Bỏ qua điều hướng
      </a>
      <Header />
      <div className={styles.workspace}>
        <DashboardSidebar />
        <main className={styles.main} id="account-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
