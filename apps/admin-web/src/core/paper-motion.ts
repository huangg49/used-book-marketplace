import { useEffect, type RefObject } from "react";

export type PaperMotion = "turn" | "stamp";
const frames: Record<PaperMotion, Keyframe[]> = {
  turn: [
    {
      transform:
        "perspective(1100px) rotateY(-16deg) translateX(10px) rotateZ(-.6deg)",
      transformOrigin: "0 50%",
    },
    {
      transform:
        "perspective(1100px) rotateY(2deg) translateX(0) rotateZ(.15deg)",
      transformOrigin: "0 50%",
      offset: 0.7,
    },
    {
      transform: "perspective(1100px) rotateY(0) translateX(0) rotateZ(0)",
      transformOrigin: "0 50%",
    },
  ],
  stamp: [
    { transform: "scale(1.35) rotate(-13deg)", opacity: 0.35 },
    { transform: "scale(.97) rotate(-6deg)", opacity: 1, offset: 0.65 },
    { transform: "scale(1) rotate(-7deg)", opacity: 1 },
  ],
};

// Semantics are committed before motion. No completion event controls data,
// focus, submission or navigation; cancellation always exposes the final state.
export function playPaperMotion(element: HTMLElement, kind: PaperMotion) {
  const document = element.ownerDocument;
  const viewport = document.defaultView;
  const rect = element.getBoundingClientRect();
  if (
    typeof element.animate !== "function" ||
    document.visibilityState === "hidden" ||
    !element.getClientRects().length ||
    rect.bottom <= 0 ||
    rect.right <= 0 ||
    (viewport &&
      (rect.top >= viewport.innerHeight || rect.left >= viewport.innerWidth))
  )
    return () => {};
  let animation: Animation;
  try {
    animation = element.animate(frames[kind], {
      duration: kind === "turn" ? 380 : 460,
      easing: "cubic-bezier(.16,1,.3,1)",
    });
  } catch {
    return () => {};
  }
  element.dataset.paperMotion = kind;
  let observer: IntersectionObserver | undefined;
  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    animation.cancel();
    if (element.dataset.paperMotion === kind)
      delete element.dataset.paperMotion;
    document.removeEventListener("visibilitychange", visibility);
    observer?.disconnect();
  };
  function visibility() {
    if (document.visibilityState === "hidden") cleanup();
  }
  document.addEventListener("visibilitychange", visibility);
  if (viewport?.IntersectionObserver) {
    observer = new viewport.IntersectionObserver((entries) => {
      if (entries.some((entry) => !entry.isIntersecting)) cleanup();
    });
    observer.observe(element);
  }
  void animation.finished.then(cleanup, cleanup);
  return cleanup;
}

export function usePaperMotion(
  ref: RefObject<HTMLElement | null>,
  trigger: string | number | null,
  kind: PaperMotion,
) {
  useEffect(() => {
    if (trigger === null || !ref.current) return;
    return playPaperMotion(ref.current, kind);
  }, [ref, trigger, kind]);
}
