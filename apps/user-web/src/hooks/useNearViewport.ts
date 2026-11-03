import { useEffect, useRef, useState } from "react";

// Delay signing offscreen covers as well as downloading their pixels.
export function useNearViewport<T extends HTMLElement = HTMLDivElement>(eager = false) {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (eager || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNear(!!entry?.isIntersecting);
      },
      { rootMargin: "200px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [eager]);
  return {
    ref,
    active: eager || near || typeof IntersectionObserver === "undefined",
  };
}
