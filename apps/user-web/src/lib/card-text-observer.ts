type Subscription = { frame: HTMLElement; fit: () => void };

const subscriptions = new Map<Element, Subscription>();
const pending = new Set<Subscription>();
let resizeObserver: ResizeObserver | undefined;
let rootObserver: MutationObserver | undefined;
let animationFrame = 0;

function queue(subscription: Subscription) {
  pending.add(subscription);
  if (animationFrame) return;
  animationFrame = requestAnimationFrame(() => {
    animationFrame = 0;
    const batch = [...pending];
    pending.clear();
    for (const subscription of batch) {
      if (subscriptions.get(subscription.frame) === subscription)
        subscription.fit();
    }
  });
}

function queueAll() {
  for (const subscription of subscriptions.values()) queue(subscription);
}

/** Share page-wide signals and one frame queue across every card text slot. */
export function observeCardText(frame: HTMLElement, fit: () => void) {
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const subscription = subscriptions.get(entry.target);
        if (subscription) queue(subscription);
      }
    });
    rootObserver = new MutationObserver(queueAll);
    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    window.addEventListener("resize", queueAll);
    document.fonts.addEventListener("loadingdone", queueAll);
    const currentObserver = resizeObserver;
    void document.fonts.ready.then(() => {
      // An earlier mount must not schedule work for a later page.
      if (resizeObserver === currentObserver) queueAll();
    });
  }

  const subscription = { frame, fit };
  subscriptions.set(frame, subscription);
  resizeObserver.observe(frame);

  return () => {
    if (subscriptions.get(frame) !== subscription) return;
    subscriptions.delete(frame);
    pending.delete(subscription);
    resizeObserver?.unobserve(frame);
    if (subscriptions.size) return;
    resizeObserver?.disconnect();
    rootObserver?.disconnect();
    resizeObserver = undefined;
    rootObserver = undefined;
    window.removeEventListener("resize", queueAll);
    document.fonts.removeEventListener("loadingdone", queueAll);
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    pending.clear();
  };
}
