import { Link, useSearchParams } from "react-router-dom";
import { memberJourneys } from "../lib/member-journeys";
import styles from "./MemberWorkspace.module.css";
export function MemberGuidePage() {
  const [params] = useSearchParams();
  const selected =
    memberJourneys.find((j) => j.id === params.get("task")) ??
    memberJourneys[0];
  return (
    <div className={styles.page}>
      <header>
        <h1>Bắt đầu với Lật lại</h1>
        <p>
          Chọn điều bạn muốn làm. Mỗi hướng dẫn dẫn tới màn hình thực hiện và
          nơi theo dõi kết quả.
        </p>
      </header>
      <nav className={styles.actions} aria-label="Bạn muốn làm gì?">
        {memberJourneys.map((j) => (
          <Link
            key={j.id}
            aria-current={j.id === selected.id ? "page" : undefined}
            to={`/guide?task=${j.id}`}
          >
            {j.title}
          </Link>
        ))}
      </nav>
      <section aria-labelledby="journey-title">
        <h2 id="journey-title">{selected.title}</h2>
        <ol className={styles.steps}>
          {selected.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>{selected.note}</p>
        <div className={styles.actions}>
          <Link className={styles.primary} to={selected.to}>
            {selected.action}
          </Link>
          <Link to={selected.manage}>{selected.manageLabel}</Link>
        </div>
      </section>
      <section>
        <h2>Biết mình đang ở bước nào</h2>
        <p>
          Đọc trạng thái, thời hạn và nút được phép trong chi tiết giao dịch.
          Chưa thấy kết quả thanh toán hoặc gửi yêu cầu thì thử lại cùng yêu cầu
          đang chờ; không tạo đơn mới để thay thế.
        </p>
        <p>
          Khi đã hoàn tất và đủ điều kiện, bạn có thể đánh giá từ giao dịch hoặc
          mục Đánh giá của tôi. Ảnh và thông báo không tự chứng minh giao nhận
          đã hoàn tất.
        </p>
        <div className={styles.actions}>
          <Link to="/account/work">Về việc của tôi</Link>
          <Link to="/reviews">Đánh giá của tôi</Link>
        </div>
      </section>
    </div>
  );
}
