import { useEffect, useRef, useState } from "react";
import styles from "./ReadingBackdrop.module.css";

export function ReadingBackdrop() {
  const backdrop = useRef<HTMLDivElement>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const surface = backdrop.current?.parentElement;
    let inView = !surface || typeof IntersectionObserver !== "function";
    const sync = () => setMoving(inView && !document.hidden);
    const observer = !inView && surface
      ? new IntersectionObserver(([entry]) => {
          inView = entry.isIntersecting;
          sync();
        })
      : null;

    if (surface) observer?.observe(surface);
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <div
      ref={backdrop}
      className={styles.backdrop}
      data-moving={moving}
      aria-hidden="true"
    >
      <div className={styles.pattern} />
    </div>
  );
}
