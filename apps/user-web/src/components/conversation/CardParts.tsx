import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Clock3 } from "lucide-react";
import type { Stats } from "./transaction-status";
import card from "./TransactionCard.module.css";

/**
 * A book name on one line with "…". When it is cut off, hovering shows the
 * full name and clicking (or tapping) expands it in place; click again to
 * collapse. The full text stays in the DOM, so screen readers read it all.
 * Opening the card is the card's own link, not the title.
 */
export function BookTitle({ text, morph }: { text: string; /** Conversation view-transition target. */ morph?: boolean }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const measure = () => setCut(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded, cut]);
  const toggle = cut || expanded;
  return (
    <h3 className={card.title} data-conversation-title={morph || undefined} data-expanded={expanded || undefined}>
      {toggle ? (
        <button type="button" className={card.titleButton} aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
          <span ref={textRef} className={card.titleText}>{text}</span>
        </button>
      ) : (
        <span ref={textRef} className={card.titleText}>{text}</span>
      )}
      {cut && !expanded && <span className={card.titleTip} aria-hidden="true">{text}</span>}
    </h3>
  );
}

/** The next step, always shown, so every card answers "what now?". */
export function NextStep({ children }: { children: ReactNode }) {
  return (
    <p className={card.callout}>
      <Clock3 size={15} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** The key figure, large, with at most one small fact on the right. */
export function StatsRow({ stats }: { stats: Stats }) {
  return (
    <dl className={card.stats}>
      <div className={card.statMain}>
        <dt>{stats.main.label}</dt>
        <dd>{stats.main.value}</dd>
      </div>
      {stats.side && (
        <div className={card.statSide}>
          <dt>{stats.side.icon && <stats.side.icon size={13} aria-hidden="true" />}{stats.side.label}</dt>
          <dd><span className={card.stamp}>{stats.side.value}</span></dd>
        </div>
      )}
    </dl>
  );
}
