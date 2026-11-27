import { InfoTip } from "../../components/InfoTip";
import type { PublicListing } from "../../services/public-listings";
import { BookCheckArt } from "./BookDetailArt";
import styles from "../BookDetailPage.module.css";

const unknown = "Chưa ghi rõ";

export function ConditionSection({ book }: { book: PublicListing }) {
  const rows: { label: string; value: string; tone?: string }[] = [
    { label: "Ruột sách", value: book.pages || unknown },
    book.hasMissingPages
      ? { label: "Trang thiếu", value: "Có trang thiếu", tone: styles.conditionWarning }
      : { label: "Trang thiếu", value: "Không có trang thiếu", tone: styles.conditionGood },
    { label: "Bìa và gáy", value: book.coverNote || unknown },
    { label: "Ghi chú, đánh dấu", value: book.notes || unknown },
    { label: "Phụ kiện", value: book.accessories || unknown },
  ];

  return (
    <section className={styles.details} id="book-condition" tabIndex={-1}>
      <div className={styles.detailsHeading}>
        <div className={styles.headingRow}>
          <h2>Tình trạng sách</h2>
          <InfoTip label="Tình trạng sách">
            Thông tin do <strong>người đăng tự mô tả</strong>. Đối chiếu cùng ảnh bản sách;
            kiểm duyệt bài đăng không xác nhận tình trạng vật lý.
          </InfoTip>
        </div>
        <BookCheckArt className={styles.sectionArt} />
      </div>
      <figure className={styles.description}>
        <figcaption>Mô tả của người đăng</figcaption>
        <p>{book.description || "Người đăng chưa có mô tả thêm."}</p>
      </figure>
      <dl>
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.tone}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
