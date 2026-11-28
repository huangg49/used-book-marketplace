import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Clock3 } from "lucide-react";
import { signedMediaRemainingMs } from "@used-books/session-client";
import type { Fact } from "./transaction-status";
import card from "./TransactionCard.module.css";

export function TransactionBookPhoto({ photo, fallback }: {
  photo?: { url: string; expiresAt?: string };
  fallback: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const url = photo && (!photo.expiresAt || signedMediaRemainingMs(photo.expiresAt)) ? photo.url : undefined;

  return (
    <img
      key={url}
      src={url && url !== failedUrl ? url : fallback}
      alt=""
      width={64}
      height={88}
      loading="lazy"
      decoding="async"
      onError={url && url !== failedUrl ? () => setFailedUrl(url) : undefined}
    />
  );
}

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
  // The tooltip sits beside the heading, not in it, so the heading's text is
  // exactly the book name.
  return (
    <div className={card.titleWrap}>
      <h3 className={card.title} data-conversation-title={morph || undefined} data-expanded={expanded || undefined}>
        {toggle ? (
          <button type="button" className={card.titleButton} aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
            <span ref={textRef} className={card.titleText}>{text}</span>
          </button>
        ) : (
          <span ref={textRef} className={card.titleText}>{text}</span>
        )}
      </h3>
      {cut && !expanded && <span className={card.titleTip} aria-hidden="true">{text}</span>}
    </div>
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

/**
 * The figures under the book: the key amount large with its label, and the
 * one small fact (a time, a deposit, the bidder count) on a quiet line below.
 */
export function Figures({ main, side }: { main?: Fact; side?: Fact }) {
  return (
    <>
      {main && (
        <p className={card.priceLine}>
          <strong>{main.value}</strong>
          <span>{main.label}</span>
        </p>
      )}
      {side && (
        <p className={card.sideLine}>
          {side.icon && <side.icon size={13} aria-hidden="true" />}
          {side.label} <span className={card.stamp}>{side.value}</span>{side.note}
        </p>
      )}
    </>
  );
}
