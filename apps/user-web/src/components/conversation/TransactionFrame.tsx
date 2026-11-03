import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./TransactionFrame.module.css";

const wideQuery = "(min-width: 1280px)";
const subscribeWidth = (notify: () => void) => {
  const query = window.matchMedia(wideQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const isWide = () => window.matchMedia(wideQuery).matches;

/** Layout only. Controllers retain forms, permissions and pending command intents. */
export function TransactionFrame({
  context,
  children,
  preview,
}: {
  context: ReactNode;
  children: ReactNode;
  preview?: ReactNode;
}) {
  const wide = useSyncExternalStore(subscribeWidth, isWide, () => false);
  const [contextOpen, setContextOpen] = useState(false);
  return (
    <div className={styles.frame} data-transaction-workspace>
      <div className={styles.columns} tabIndex={wide ? -1 : 0} data-transaction-scroll>
        <section
          className={styles.stage}
          tabIndex={wide ? 0 : -1}
          aria-label="Tiến trình và thao tác"
          data-transaction-panel="stage"
        >
          {children}
        </section>
        <aside
          className={styles.context}
          tabIndex={wide ? 0 : -1}
          aria-label="Sách và thỏa thuận"
          data-transaction-panel="context"
        >
          <button type="button" className={styles.contextToggle}
            aria-label="Sách và thỏa thuận"
            aria-expanded={contextOpen} onClick={() => setContextOpen(!contextOpen)}>
            {!contextOpen && preview && <span className={styles.contextPreview} data-conversation-cover>{preview}</span>}
            Sách và thỏa thuận <ChevronDown size={16} />
          </button>
          <div className={styles.contextContent} data-open={contextOpen}>{context}</div>
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
