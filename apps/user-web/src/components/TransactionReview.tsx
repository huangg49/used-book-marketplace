import type { TransactionNote } from "@used-books/session-client";
import styles from "./TransactionReview.module.css";

export function TransactionAmount({ label, value }: { label: string; value: string }) {
  return <dl className={styles.amount}><div><dt>{label}</dt><dd>{value}</dd></div></dl>;
}

export function TransactionNotes({ notes }: { notes: readonly TransactionNote[] }) {
  return (
    <dl className={styles.notes}>
      {notes.map(({ label, detail }) => <div key={label}><dt>{label}</dt><dd>{detail}</dd></div>)}
    </dl>
  );
}
