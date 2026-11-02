import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { ROUTES } from "../lib/routes";
import { MemberProfileEditor } from "./profile/MemberProfileEditor";
import styles from "./ProfilePage.module.css";

export function ProfilePage() {
  const auth = useSession();
  const location = useLocation();
  if (auth.status !== "authenticated") return null;
  const params = new URLSearchParams(location.search);
  // Preserve bookmarks to the former combined profile/shelf page.
  if (params.has("moderation") || params.has("cursor"))
    return <Navigate to={ROUTES.myBooks + location.search} replace />;
  const { user } = auth;

  return (
    <div className={styles.pageRoot}>
      <header className={styles.pageHeader}>
        <h1 tabIndex={-1} className={styles.pageTitle}>
          Hồ sơ &amp; Bảo mật
        </h1>
        <p className={styles.pageSubtitle}>
          Quản lý thẻ bạn đọc, thông tin cá nhân và an toàn tài khoản tại hiệu sách Lật Lại.
        </p>
      </header>

      <MemberProfileEditor key={user.id} ownerId={user.id} user={user} />
    </div>
  );
}
