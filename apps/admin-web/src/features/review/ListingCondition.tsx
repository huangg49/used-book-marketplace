import { BookOpen, FileWarning, NotebookPen } from "lucide-react";
import { labels, type Revision } from "./contracts";
import styles from "./ReviewContent.module.css";

const answer = (value: boolean | null) => value === null ? "Chưa khai báo" : value ? "Có" : "Không";

/** Seller declarations remain declarations, never inspection results. */
export function ListingCondition({ content: c }: { content: Revision["content"] }) {
  const facts = [
    { label: "Còn đọc được", value: c.readable, concern: c.readable === false, icon: BookOpen },
    { label: "Thiếu trang", value: c.hasMissingPages, concern: c.hasMissingPages === true, icon: FileWarning },
    { label: "Thiếu nội dung trọng yếu", value: c.missingEssentialContent, concern: c.missingEssentialContent === true, icon: NotebookPen },
  ];
  return (
    <>
      <section className={`section ${styles.condition}`}>
        <div className={styles.conditionHeading}>
          <div><h3>Tình trạng bản sách</h3><p>Thông tin người đăng khai báo. Đối chiếu với ảnh trước khi duyệt.</p></div>
          <div className={styles.conditionClaim}><span>Người đăng đánh giá</span><strong>{labels[c.condition || ""] || "Chưa khai báo"}</strong></div>
        </div>
        <dl className={styles.declarations}>
          {facts.map(({ label, value, concern, icon: Icon }) => (
            <div key={label} data-attention={concern || undefined}>
              <dt><Icon size={17} aria-hidden="true" />{label}</dt><dd>{answer(value)}</dd>
            </div>
          ))}
        </dl>
        <dl className={styles.conditionNotes}>
          <div><dt>Ruột sách</dt><dd>{c.pages || "Chưa mô tả"}</dd></div>
          <div><dt>Bìa và gáy</dt><dd>{c.coverNote || "Chưa mô tả"}</dd></div>
          <div><dt>Ghi chú / đánh dấu</dt><dd>{c.notes || "Chưa mô tả"}</dd></div>
          <div><dt>Phụ kiện</dt><dd>{c.accessories || "Chưa mô tả"}</dd></div>
        </dl>
      </section>
      <section className={`section ${styles.description}`}>
        <h3>Mô tả người đăng</h3>
        <p className="prose">{c.description}</p>
      </section>
    </>
  );
}
