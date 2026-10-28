import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { memberWork } from "../lib/member-journeys";
import styles from "./MemberWorkspace.module.css";
import { WorkInbox } from "../components/WorkInbox";
export function AccountOverviewPage() {
  const auth = useSession();
  if (auth.status !== "authenticated") return null;
  const { user } = auth;
  return (
    <div className={styles.page} key={user.id}>
      <header>
        <h1>Việc của tôi</h1>
        <p>
          Chào {user.displayName}. Chọn việc đang làm để tiếp tục từ đúng giao
          dịch.
        </p>
        <Link className={styles.primary} to="/guide">
          Cách mua, bán, đổi và đấu giá
        </Link>
      </header>
      {user.status !== "ACTIVE" && (
        <p role="status">
          Tài khoản đang bị hạn chế hoặc khóa. Bạn vẫn có thể mở các giao dịch
          cũ để xem những nghĩa vụ được phép thực hiện; thao tác mới phụ thuộc
          quyền hiện tại.
        </p>
      )}
      {user.roles.includes("MEMBER") && <WorkInbox key={user.id} ownerId={user.id} status={user.status} />}
      <div className={styles.columns}>
        <section aria-labelledby="work-continue">
          <h2 id="work-continue">Tiếp tục giao dịch</h2>
          <p>Đơn trực tiếp, trao đổi và đơn đấu giá có nơi theo dõi riêng.</p>
          <ul className={styles.links}>
            {memberWork.map((item) => (
              <li key={item.to}>
                <Link to={item.to}>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="work-books">
          <h2 id="work-books">Tìm hoặc đăng sách</h2>
          <ul className={styles.links}>
            <li>
              <Link to="/books">
                <span>
                  <strong>Tìm sách</strong>
                  <small>
                    Xem sách để mua hoặc đổi; mở từng bản sách để chọn thao tác.
                  </small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link to="/my-books">
                <span>
                  <strong>Kệ sách của tôi</strong>
                  <small>
                    Bản nháp, bài chờ duyệt, bài cần sửa và sách đang hiển thị.
                  </small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </li>
            {user.status === "ACTIVE" && user.roles.includes("MEMBER") && (
              <li>
                <Link to="/sell">
                  <span>
                    <strong>Đăng sách mới</strong>
                    <small>
                      Chuẩn bị ảnh thật và mô tả tình trạng trước khi gửi duyệt.
                    </small>
                  </span>
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </li>
            )}
          </ul>
        </section>
      </div>
      <section aria-labelledby="work-account">
        <h2 id="work-account">Thông tin và đánh giá</h2>
        <nav className={styles.actions} aria-label="Thông tin cá nhân">
          <Link to="/wallet">Ví của tôi</Link>
          <Link to="/reviews">Đánh giá của tôi</Link>
          <Link to={`/members/${user.id}`}>Hồ sơ uy tín của tôi</Link>
          <Link to="/profile">Thông tin tài khoản</Link>
          <Link to="/notifications">Thông báo</Link>
        </nav>
        <p>
          Chỉ đánh giá được giao dịch đã hoàn tất và đủ điều kiện. Số dư, trạng
          thái và kết quả nằm trong từng mục tương ứng.
        </p>
      </section>
    </div>
  );
}
