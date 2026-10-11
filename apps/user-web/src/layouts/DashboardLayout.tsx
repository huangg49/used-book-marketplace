import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { DashboardSidebar } from "../pages/profile/components/DashboardSidebar";
import { Header } from "../components/Header";
import { useSession } from "../hooks/useSession";
import styles from "./DashboardLayout.module.css";

export function DashboardLayout() {
  const auth = useSession();
  const location = useLocation();
  useEffect(() => {
    if (auth.status === "authenticated") {
      const heading = document.querySelector<HTMLElement>(
        "#account-content h1",
      );
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
      if (heading?.textContent)
        document.title = `${heading.textContent.trim()} · Lật lại`;
    }
    return () => {
      document.title = "Lật lại — Mua bán sách cũ";
    };
  }, [location.pathname, auth.status]);
  if (auth.status === "loading")
    return <main className={styles.loading}>Đang khôi phục phiên…</main>;
  if (auth.status !== "authenticated")
    return (
      <Navigate
        to={
          "/login?returnUrl=" +
          encodeURIComponent(location.pathname + location.search)
        }
        replace
      />
    );
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
