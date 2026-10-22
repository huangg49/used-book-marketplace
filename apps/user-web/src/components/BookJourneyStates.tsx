import { Link } from "react-router-dom";
import { ArrowUpRight, BookOpen } from "lucide-react";
import styles from "./BookJourneyStates.module.css";

export function ListingSubmissionConfirmation({ title, onPostAnother, auction = false }: {
  title: string;
  onPostAnother: () => void;
  auction?: boolean;
}) {
  if (auction)
    return (
      <section className={styles.submitted} aria-live="polite">
        <img className={styles.pendingArt} src="/illustrations/book-journey/pending.webp"
          width="800" height="600" alt="" aria-hidden="true" decoding="async" />
        <div className={styles.message}>
          <h2>Đã gửi duyệt</h2>
          <p>Sách đấu giá <strong>{title}</strong> đã được gửi. Sau khi được duyệt, bạn chọn
            sách ở trang gửi đấu giá để mang tới điểm giao nhận. Sách này không hiển thị trên kệ mua/đổi.</p>
          <div className={styles.actions}>
            <Link to="/auctions/new">Về gửi đấu giá <ArrowUpRight size={18} aria-hidden="true" /></Link>
            <button type="button" onClick={onPostAnother}>Tạo sách đấu giá khác</button>
          </div>
        </div>
      </section>
    );
  return (
    <section className={styles.submitted} aria-live="polite">
      <img className={styles.pendingArt} src="/illustrations/book-journey/pending.webp"
        width="800" height="600" alt="" aria-hidden="true" decoding="async" />
      <div className={styles.message}>
        <h2>Đã gửi duyệt</h2>
        <p>Bài đăng <strong>{title}</strong> đã được gửi. Thông tin sách và bài đăng
          cần được kiểm duyệt trước khi hiển thị công khai.</p>
        <div className={styles.actions}>
          <button type="button" onClick={onPostAnother}>Đăng cuốn khác
            <ArrowUpRight size={18} aria-hidden="true" /></button>
          <Link to="/">Về trang chủ</Link>
        </div>
      </div>
    </section>
  );
}

export function EmptyOwnerShelf({ cursor, filter, onClear }: {
  cursor: string | undefined;
  filter: string;
  onClear: () => void;
}) {
  const firstShelf = !cursor && !filter;
  return (
    <div className={firstShelf ? styles.emptyShelf : styles.filteredEmpty}>
      <div className={styles.emptyMessage}>
        {!firstShelf && <BookOpen size={32} aria-hidden="true" />}
        <h2>{cursor ? "Trang này chưa có bài đăng" : filter
          ? "Chưa có bài trong mục này" : "Kệ sách đang trống"}</h2>
        <p>{filter ? "Chọn mục khác để xem các bài đăng của bạn."
          : "Đăng cuốn sách đã đọc xong để tìm người đọc tiếp theo."}</p>
        {filter ? <button type="button" onClick={onClear}>Xem tất cả</button>
          : <Link to="/sell">Đăng cuốn đầu tiên <ArrowUpRight size={16} aria-hidden="true" /></Link>}
      </div>
      {firstShelf && <img className={styles.emptyArt} src="/illustrations/book-journey/empty.webp"
        width="800" height="600" alt="" aria-hidden="true" decoding="async" />}
    </div>
  );
}
