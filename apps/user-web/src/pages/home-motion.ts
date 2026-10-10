import { useEffect, useRef, type RefObject } from "react";

/** Home decorations run only while their own region is visible. */
export function useHomeAtmosphere(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const page = root.current;
    if (!page || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<HTMLElement>();
    const arrivals = new Set<Animation>();
    const sync = () => {
      page.querySelectorAll<HTMLElement>("[data-home-loop]").forEach((node) => {
        node.dataset.moving = String(visible.has(node) && !document.hidden);
      });
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const node = entry.target as HTMLElement;
        if (entry.isIntersecting) visible.add(node);
        else visible.delete(node);
        if (entry.isIntersecting && node.hasAttribute("data-home-arrival")) {
          // The fox settles once; scrolling back never replays the entrance.
          if (!document.hidden) {
            const animation = node.animate(
              [
                { transform: "translateY(12px) rotate(-2deg)", opacity: 0.8 },
                { transform: "translateY(0) rotate(0deg)", opacity: 1 },
              ],
              { duration: 650, easing: "cubic-bezier(.16,1,.3,1)" },
            );
            arrivals.add(animation);
            void animation.finished.then(() => arrivals.delete(animation), () => {});
          }
          observer.unobserve(node);
          visible.delete(node);
        }
      });
      sync();
    });
    page.querySelectorAll<HTMLElement>("[data-home-loop], [data-home-arrival]")
      .forEach((node) => observer.observe(node));
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      arrivals.forEach((animation) => animation.cancel());
    };
  }, [root]);
}

/** Animate the committed result, never delay or keep stale books on screen. */
export function useShelfTransition(
  root: RefObject<HTMLDivElement | null>,
  selection: string,
  ready: boolean,
) {
  const previous = useRef(selection);
  useEffect(() => {
    if (!ready || previous.current === selection) return;
    previous.current = selection;
    const node = root.current;
    if (!node) return;
    const animation = node.animate([{ opacity: 0.72 }, { opacity: 1 }], {
      duration: 180,
      easing: "ease-out",
    });
    return () => animation.cancel();
  }, [root, selection, ready]);
}
