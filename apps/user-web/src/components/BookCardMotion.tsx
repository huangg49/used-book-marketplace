import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import styles from "./BookCard.module.css";

/** A stationary hit area keeps the pointer stable while the book and its facts tilt. */
export function BookCardMotion({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const bounds = useRef<DOMRect | null>(null);
  const pending = useRef<number | null>(null);
  const point = useRef({ x: 0, y: 0 });
  const activeListeners = useRef<AbortController | null>(null);

  function reset() {
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    pending.current = null;
    bounds.current = null;
    activeListeners.current?.abort();
    activeListeners.current = null;
    frame.current?.removeAttribute("data-tilt");
    frame.current?.style.setProperty("--book-rotate-x", "0");
    frame.current?.style.setProperty("--book-rotate-y", "0");
  }

  useEffect(() => () => {
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    activeListeners.current?.abort();
  }, []);

  function move(event: PointerEvent<HTMLDivElement>) {
    const rect = bounds.current;
    if (!rect) return;
    point.current = {
      x: Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5)),
      y: Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5)),
    };
    if (pending.current !== null) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = null;
      frame.current?.style.setProperty("--book-rotate-x", String(-point.current.y));
      frame.current?.style.setProperty("--book-rotate-y", String(point.current.x));
    });
  }

  return (
    <div ref={frame} className={styles.motionFrame}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" ||
          !window.matchMedia("(min-width: 601px) and (hover: hover) and (pointer: fine)").matches) return;
        bounds.current = event.currentTarget.getBoundingClientRect();
        event.currentTarget.setAttribute("data-tilt", "");
        const listeners = new AbortController();
        activeListeners.current?.abort();
        activeListeners.current = listeners;
        window.addEventListener("blur", reset, { signal: listeners.signal });
        window.addEventListener("scroll", reset, { signal: listeners.signal, capture: true });
        window.addEventListener("resize", reset, { signal: listeners.signal });
        document.addEventListener("visibilitychange", reset, { signal: listeners.signal });
        move(event);
      }}
      onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset}>
      {children}
    </div>
  );
}
