import { Link, Navigate, useLocation } from "react-router-dom";
import { ArrowRight, Library, KeyRound, ArrowLeftRight, Bell } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { ROUTES } from "../lib/routes";
import styles from "./ProfilePage.module.css";

const statusLabels = {
  ACTIVE: "Đang hoạt động",
  RESTRICTED: "Đang hạn chế giao dịch mới",
  LOCKED: "Đang khóa giao dịch mới",
};

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
    <div className={styles.root}>
      <header className={styles.heading}>
        <h1 tabIndex={-1}>Hồ sơ của tôi</h1>
        <p>Thông tin tài khoản của bạn tại Lật Lại.</p>
      </header>
      <section className={styles.paper} aria-labelledby="profile-name">
        <div className={styles.identity}>
          <span className={styles.initial} aria-hidden="true">
            {Array.from(user.displayName.trim())[0]?.toLocaleUpperCase(
              "vi-VN",
            ) || "L"}
          </span>
          <div>
            <h2 id="profile-name">{user.displayName}</h2>
            <p>{statusLabels[user.status]}</p>
          </div>
        </div>
        <dl className={styles.facts}>
          <div>
            <dt>Tên hiển thị</dt>
            <dd>{user.displayName}</dd>
          </div>
          <div>
            <dt>Email đăng ký</dt>
            <dd>{user.email}</dd>
          </div>
        </dl>
        <div className={styles.security}>
          <div>
            <h2>Đăng nhập &amp; bảo mật</h2>
            <p>Đặt lại mật khẩu qua mã xác nhận gửi đến email của bạn.</p>
          </div>
          <Link to="/forgot-password">
            <KeyRound size={18} aria-hidden="true" />
            Đặt lại mật khẩu
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <Link className={styles.shelfLink} to={ROUTES.myBooks}>
        <Library size={20} aria-hidden="true" />
        <span>
          Quản lý sách đã đăng trong <strong>Kệ sách của tôi</strong>
        </span>
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
      <Link className={styles.shelfLink} to={ROUTES.exchangeMine}>
        <ArrowLeftRight size={20} aria-hidden="true" />
        <span>
          Theo dõi các lời đề nghị trong <strong>Trao đổi của tôi</strong>
        </span>
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
      <Link className={styles.shelfLink} to={ROUTES.notifications}>
        <Bell size={20} aria-hidden="true" />
        <span>
          Xem thông báo và cập nhật mới trong <strong>Thông báo của tôi</strong>
        </span>
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </div>
  );
}
