import { BookOpen, CheckCheck, Clock3, ArrowUpRight, Tags } from "lucide-react";
import { Link } from "react-router-dom";
import { categoryPath, languageLabel, facetDefinitions } from "@used-books/api-contract/catalog-taxonomy";
import type { Metadata } from "./contracts";
import styles from "./BookReference.module.css";

function languageName(code: string) {
  const label = languageLabel(code);
  if (label !== code) return label;
  try {
    const name = new Intl.DisplayNames(["vi"], { type: "language" }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch { return code; }
}

type Field = { label: string; value: string | number | null };
function Fields({ items }: { items: Field[] }) {
  return <dl className={styles.fields}>{items.map(({ label, value }) => (
    <div key={label}><dt>{label}</dt><dd className={value === null || value === "" ? styles.missing : undefined}>{value === null || value === "" ? "Chưa cung cấp" : value}</dd></div>
  ))}</dl>;
}

export function BookReferenceCard({ value, id, confirmed, admin }: {
  value: Metadata; id: string | null; confirmed: boolean; admin: boolean;
}) {
  const classification: Field[] = [
    { label: "Danh mục", value: value.category },
    { label: "Ngôn ngữ", value: languageName(value.language) },
    { label: "ISBN", value: value.isbn },
  ];
  if (value.categoryId) classification.push({ label: "Danh mục chuẩn", value: categoryPath(value.categoryId).map(c => c.label).join(" / ") || value.categoryId });
  if (value.series) classification.push({ label: "Bộ truyện", value: value.series });
  for (const [key, values] of Object.entries(value.attributes ?? {})) {
    const definition = facetDefinitions.find(f => f.id === key);
    classification.push({ label: definition?.label || key, value: values?.map(v => definition?.options.find(o => o.id === v)?.label || v).join(" · ") || null });
  }
  return (
    <section className={styles.card} aria-label="Thông tin đầu sách đối chiếu">
      <header className={styles.heading}>
        <div><h3>{value.title}</h3><p><span>Tác giả</span><strong>{value.authors.join(" · ") || "Chưa cung cấp"}</strong></p></div>
        <span className={styles.status} data-confirmed={confirmed}>
          {confirmed ? <CheckCheck size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />}
          {confirmed ? "Đã xác nhận" : "Chưa xác nhận"}
        </span>
      </header>
      <div className={styles.groups}>
        <div className={styles.group}><h4><BookOpen size={17} aria-hidden="true" />Thông tin xuất bản</h4>
          <Fields items={[
            { label: "Nhà xuất bản", value: value.publisher },
            { label: "Năm xuất bản", value: value.publicationYear },
            { label: "Ấn bản", value: value.edition },
          ]} />
        </div>
        <div className={styles.group}><h4><Tags size={17} aria-hidden="true" />Phân loại & mã sách</h4><Fields items={classification} /></div>
      </div>
      {!confirmed && <footer className={styles.footer}>
        <p><Clock3 size={18} aria-hidden="true" /><span>Cần Admin xác nhận đầu sách trước khi duyệt bài.</span></p>
        {admin && id && <Link to={`/review/catalog-requests/${id}`}>Xem yêu cầu<ArrowUpRight size={17} aria-hidden="true" /></Link>}
      </footer>}
    </section>
  );
}
