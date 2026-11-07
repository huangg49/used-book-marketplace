import { useEffect, useRef, useState } from "react";

type ViewportSubscription = {
  observedAt: number;
  update: (near: boolean) => void;
};

const subscriptions = new Map<Element, ViewportSubscription>();
let viewportObserver: IntersectionObserver | undefined;

function observeNearViewport(target: Element, update: ViewportSubscription["update"]) {
  if (!viewportObserver) {
    const observer = new IntersectionObserver(entries => {
      if (viewportObserver !== observer) return;
      for (const entry of entries) {
        const subscription = subscriptions.get(entry.target);
        // Entries queued for an earlier subscription must not affect a reused node.
        if (subscription && entry.time >= subscription.observedAt)
          subscription.update(entry.isIntersecting);
      }
    }, { rootMargin: "200px" });
    viewportObserver = observer;
  }

  const observer = viewportObserver;
  const subscription = { observedAt: performance.now(), update };
  subscriptions.set(target, subscription);
  observer.observe(target);

  return () => {
    if (subscriptions.get(target) !== subscription) return;
    subscriptions.delete(target);
    observer.unobserve(target);
    if (subscriptions.size === 0) {
      observer.disconnect();
      viewportObserver = undefined;
    }
  };
}

// Delay signing offscreen covers as well as downloading their pixels.
// `once` keeps seen owner covers enabled, preserving their existing refetch policy.
export function useNearViewport<T extends HTMLElement = HTMLDivElement>(eager = false, { once = false }: { once?: boolean } = {}) {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (eager || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") return;
    return observeNearViewport(ref.current, value => {
      setNear(previous => once ? previous || value : value);
    });
  }, [eager, once]);
  return {
    ref,
    active: eager || near || typeof IntersectionObserver === "undefined",
  };
}
