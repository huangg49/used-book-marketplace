import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./TransactionFrame.module.css";

/** Layout only. Controllers retain forms, permissions and pending command intents. */
export function TransactionFrame({
  context,
  children,
}: {
  context: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.frame} data-transaction-workspace>
      <div className={styles.columns} tabIndex={0} data-transaction-scroll>
        <section
          className={styles.stage}
          tabIndex={0}
          aria-label="Tiến trình và thao tác"
          data-transaction-panel="stage"
        >
          {children}
        </section>
        <aside
          className={styles.context}
          tabIndex={0}
          aria-label="Sách và thỏa thuận"
          data-transaction-panel="context"
        >
          {context}
        </aside>
      </div>
    </div>
  );
}

export function TransactionDisclosure({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  // Native details keeps forms mounted if users collapse; never reset an upload/retry intent.
  return (
    <details className={styles.disclosure} open={open || undefined}>
      <summary>
        {title}
        <ChevronDown size={15} />
      </summary>
      <div>{children}</div>
    </details>
  );
}
