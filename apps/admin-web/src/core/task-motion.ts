import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { motionVisible, watchMotionBoundary } from "./motion-boundary";

const ease = "cubic-bezier(.16,1,.3,1)";
// ResizeObserver callbacks only read. Cancel/resize writes run on the next
// frame, outside delivery, to avoid nested paper panels causing resize loops.
export function watchTaskSize(element: HTMLElement, onChange: () => void) {
  const view = element.ownerDocument.defaultView;
  if (!view?.ResizeObserver || !view.requestAnimationFrame) return () => {};
  let previous = element.getBoundingClientRect();
  let frame: number | undefined;
  const observer = new view.ResizeObserver(() => {
    const next = element.getBoundingClientRect();
    if (
      Math.abs(next.width - previous.width) < 0.5 &&
      Math.abs(next.height - previous.height) < 0.5
    )
      return;
    previous = next;
    if (frame !== undefined) return;
    frame = view.requestAnimationFrame(() => {
      frame = undefined;
      onChange();
    });
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
    if (frame !== undefined) view.cancelAnimationFrame(frame);
  };
}
export function useVisibleMotion(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    const element = ref.current;
    if (!element || !active) return;
    const doc = element.ownerDocument,
      view = doc.defaultView;
    const update = () => {
      element.dataset.motionPlaying = String(
        motionVisible(element) && doc.hasFocus(),
      );
    };
    const observer = view?.IntersectionObserver
      ? new view.IntersectionObserver(update)
      : undefined;
    observer?.observe(element);
    doc.addEventListener("visibilitychange", update);
    view?.addEventListener("focus", update);
    view?.addEventListener("blur", update);
    update();
    return () => {
      observer?.disconnect();
      doc.removeEventListener("visibilitychange", update);
      view?.removeEventListener("focus", update);
      view?.removeEventListener("blur", update);
      delete element.dataset.motionPlaying;
    };
  }, [ref, active]);
}
// Decorations never own a command, a focus transfer or the lifetime of a form.
export function playTaskMotion(
  element: HTMLElement,
  frames: Keyframe[],
  duration = 200,
) {
  if (!motionVisible(element) || typeof element.animate !== "function")
    return () => {};
  let animation: Animation;
  try {
    animation = element.animate(frames, { duration, easing: ease });
  } catch {
    return () => {};
  }
  let stopped = false;
  let unwatch = () => {};
  const stop = () => {
    if (stopped) return;
    stopped = true;
    animation.cancel();
    unwatch();
  };
  unwatch = watchMotionBoundary(element, stop);
  void animation.finished.then(stop, stop);
  return stop;
}

export function useTaskArrival(
  ref: RefObject<HTMLElement | null>,
  identity: string | number | null,
) {
  useLayoutEffect(() => {
    if (!ref.current || identity === null) return;
    return playTaskMotion(
      ref.current,
      [
        { opacity: 0.65, transform: "translateY(5px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      180,
    );
  }, [ref, identity]);
}

export type RowPosition = { top: number; left: number; revision: string };
export function listTransition(
  previous: RowPosition | undefined,
  next: RowPosition,
) {
  if (!previous) return "enter";
  if (
    Math.abs(previous.top - next.top) > 1 ||
    Math.abs(previous.left - next.left) > 1
  )
    return "move";
  return previous.revision !== next.revision ? "update" : "none";
}

export function useListMotion(
  ref: RefObject<HTMLElement | null>,
  identity: string,
) {
  const previous = useRef(new Map<string, RowPosition>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const rows = Array.from(
      root.querySelectorAll<HTMLElement>("[data-motion-key]"),
    );
    const bounds = root.getBoundingClientRect();
    const next = new Map<string, RowPosition>();
    const editing =
      root.contains(root.ownerDocument.activeElement) &&
      root.ownerDocument.activeElement?.matches(
        "input, textarea, select, [contenteditable=true]",
      );
    const stops: Array<() => void> = [];
    let entered = 0;
    for (const row of rows) {
      const key = row.dataset.motionKey!;
      const rect = row.getBoundingClientRect();
      const position = {
        top: rect.top - bounds.top,
        left: rect.left - bounds.left,
        revision: row.dataset.motionRevision || "",
      };
      const old = previous.current.get(key);
      next.set(key, position);
      if (editing || !motionVisible(row)) continue;
      const kind = listTransition(old, position);
      if (kind === "enter" && entered++ < 6)
        stops.push(
          playTaskMotion(
            row,
            [
              { opacity: 0.55, transform: "translateY(6px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            180,
          ),
        );
      if (kind === "move" && old && Math.abs(old.top - position.top) < 100)
        stops.push(
          playTaskMotion(
            row,
            [
              {
                transform: `translate(${old.left - position.left}px,${old.top - position.top}px)`,
              },
              { transform: "translate(0,0)" },
            ],
            220,
          ),
        );
      if (kind === "update")
        stops.push(
          playTaskMotion(
            row,
            [
              { backgroundColor: "var(--shop-shelf)" },
              { backgroundColor: "transparent" },
            ],
            320,
          ),
        );
    }
    previous.current = next;
    return () => stops.forEach((stop) => stop());
  }, [ref, identity]);
}
