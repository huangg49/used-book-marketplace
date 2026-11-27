import {
  AlertTriangle,
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  FileText,
  Gift,
  Layers,
  StickyNote,
} from "lucide-react";
import type { ExchangeBookConditionReport } from "../../../lib/mock/exchangeMine";
import styles from "./BookConditionDisclosure.module.css";

interface Props {
  label?: string;
  editionLabel?: string;
  conditionDetails?: string;
  report?: ExchangeBookConditionReport;
  incoming?: boolean;
}

function cleanSentence(text?: string) {
  return text?.trim().replace(/\.{2,}/g, ".") ?? "";
}

export function BookConditionDisclosure({
  label = "Tình trạng sách",
  editionLabel,
  conditionDetails,
  report,
  incoming = false,
}: Props) {
  const rows = report
    ? [
        { key: "description", title: "Tổng quan", value: cleanSentence(report.description), Icon: FileText },
        { key: "pages", title: "Ruột & trang giấy", value: cleanSentence(report.pages), Icon: BookOpen },
        { key: "cover", title: "Bìa & gáy sách", value: cleanSentence(report.coverNote), Icon: Layers },
        { key: "accessories", title: "Phụ kiện kèm theo", value: cleanSentence(report.accessories), Icon: Gift },
        { key: "notes", title: "Ghi chú thêm", value: cleanSentence(report.notes), Icon: StickyNote },
      ].filter((row) => Boolean(row.value))
    : [];

  const hasStructured = Boolean(report && (rows.length > 0 || report.readable != null || report.hasMissingPages != null));
  const fallbackLines = !hasStructured && conditionDetails
    ? conditionDetails
        .replace(/\.{2,}/g, ".")
        .split(/\.\s+/)
        .map((line) => line.trim().replace(/\.$/, ""))
        .filter(Boolean)
    : [];

  if (!hasStructured && !fallbackLines.length && !editionLabel) return null;

  const allGood = report ? !report.hasMissingPages && report.readable !== false : false;

  return (
    <details className={styles.disclosure} data-incoming={incoming || undefined}>
      <summary className={styles.trigger}>
        <span className={styles.triggerLeft}>
          <BookOpenCheck size={15} aria-hidden="true" />
          <span className={styles.triggerLabel}>{label}</span>
          {allGood && (
            <span className={styles.quickOk}>Đủ trang · Đọc tốt</span>
          )}
        </span>
        <ChevronDown size={15} className={styles.chevron} aria-hidden="true" />
      </summary>

      <div className={styles.panel}>
        {editionLabel && (
          <p className={styles.edition}>{editionLabel}</p>
        )}

        {report && (report.hasMissingPages != null || report.readable != null) && (
          <div className={styles.checks}>
            {report.hasMissingPages != null && (
              <span
                className={styles.checkStamp}
                data-status={report.hasMissingPages ? "warn" : "ok"}
              >
                {report.hasMissingPages ? (
                  <AlertTriangle size={13} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={13} aria-hidden="true" />
                )}
                {report.hasMissingPages ? "Có thiếu trang" : "Không thiếu trang"}
              </span>
            )}
            {report.readable != null && (
              <span
                className={styles.checkStamp}
                data-status={report.readable ? "ok" : "warn"}
              >
                {report.readable ? (
                  <CheckCircle2 size={13} aria-hidden="true" />
                ) : (
                  <AlertTriangle size={13} aria-hidden="true" />
                )}
                {report.readable ? "Đọc tốt" : "Không đọc được"}
              </span>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <dl className={styles.rows}>
            {rows.map(({ key, title, value, Icon }) => (
              <div key={key} className={styles.row}>
                <dt>
                  <Icon size={13} aria-hidden="true" />
                  <span>{title}</span>
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {fallbackLines.length > 0 && (
          <ul className={styles.fallbackList}>
            {fallbackLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
