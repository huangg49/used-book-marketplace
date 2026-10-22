import { useLayoutEffect, useRef } from "react";
import styles from "./BookCard.module.css";

/** Fit actual text to its reserved card slot without changing the card geometry. */
export function CardFitText({
  children,
  className = "",
  minimumRem = 0.75,
}: {
  children: string;
  className?: string;
  minimumRem?: number;
}) {
  const frameRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;
    let disposed = false;
    let animationFrame = 0;

    function fit() {
      if (!frame || !content || !frame.clientWidth || !frame.clientHeight)
        return;
      frame.removeAttribute("data-clipped");
      content.style.removeProperty("font-size");
      const maximum = parseFloat(getComputedStyle(frame).fontSize);
      const rootSize = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      const minimum = Math.min(maximum, minimumRem * rootSize);
      const fits = () =>
        content.scrollWidth <= frame.clientWidth + 1 &&
        content.scrollHeight <= frame.clientHeight + 1;

      if (fits()) return;
      let low = minimum;
      let high = maximum;
      content.style.fontSize = `${minimum}px`;
      if (fits()) {
        // Bounded search preserves the largest readable size that actually fits.
        for (let step = 0; step < 7; step++) {
          const candidate = (low + high) / 2;
          content.style.fontSize = `${candidate}px`;
          if (fits()) low = candidate;
          else high = candidate;
        }
        content.style.fontSize = `${Math.floor(low * 100) / 100}px`;
      } else {
        const lineHeight = parseFloat(getComputedStyle(content).lineHeight);
        const lines = Math.max(1, Math.floor(frame.clientHeight / lineHeight));
        content.style.setProperty("--card-fit-lines", String(lines));
        frame.setAttribute("data-clipped", "true");
      }
    }

    function schedule() {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        if (!disposed) fit();
      });
    }

    fit();
    const observer = new ResizeObserver(schedule);
    observer.observe(frame);
    // Text scaling can change without altering this fixed slot's dimensions.
    const rootObserver = new MutationObserver(schedule);
    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    window.addEventListener("resize", schedule);
    void document.fonts.ready.then(() => {
      if (!disposed) schedule();
    });
    document.fonts.addEventListener("loadingdone", schedule);
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      rootObserver.disconnect();
      window.removeEventListener("resize", schedule);
      document.fonts.removeEventListener("loadingdone", schedule);
    };
  }, [children, minimumRem]);

  return (
    <span
      ref={frameRef}
      className={`${styles.fitFrame} ${className}`}
      title={children}
    >
      <span ref={contentRef} className={styles.fitContent}>
        {children}
      </span>
    </span>
  );
}
