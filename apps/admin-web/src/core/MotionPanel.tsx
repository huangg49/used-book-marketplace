import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { motionVisible, watchMotionBoundary } from "./motion-boundary";
import { watchTaskSize } from "./task-motion";
import styles from "./task-motion.module.css";

// Only the empty paper shell survives a close. The old live form is removed
// immediately, so an exit never duplicates blockers, inputs or private values.
export function MotionPanel({
  open,
  children,
  className = "",
  id,
  motionKey = "",
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
  motionKey?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const lastHeight = useRef(0);
  const running = useRef<{ stop: () => void } | null>(null);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const from = running.current
      ? element.getBoundingClientRect().height
      : lastHeight.current;
    running.current?.stop();
    const target = open ? element.scrollHeight : 0;
    lastHeight.current = target;
    element.dataset.panelMotion = open ? "opening" : "closing";
    if (
      from === target ||
      !motionVisible(element) ||
      typeof element.animate !== "function" ||
      (element.contains(element.ownerDocument.activeElement) &&
        element.ownerDocument.activeElement?.matches("input,textarea,select"))
    ) {
      delete element.dataset.panelMotion;
      return;
    }
    let animation: Animation;
    try {
      animation = element.animate(
        [
          { height: `${from}px`, opacity: open ? 0.7 : 1 },
          { height: `${target}px`, opacity: open ? 1 : 0 },
        ],
        { duration: open ? 220 : 140, easing: "cubic-bezier(.16,1,.3,1)" },
      );
    } catch {
      delete element.dataset.panelMotion;
      return;
    }
    element.dataset.panelMotion = open ? "opening" : "closing";
    let stopped = false;
    let unwatch = () => {};
    const active = {
      stop: () => {
        if (stopped) return;
        stopped = true;
        animation.cancel();
        unwatch();
        if (running.current === active) {
          delete element.dataset.panelMotion;
          running.current = null;
        }
      },
    };
    running.current = active;
    unwatch = watchMotionBoundary(element, active.stop);
    void animation.finished.then(active.stop, active.stop);
  }, [open, motionKey]);
  useEffect(() => {
    const element = inner.current;
    if (!element || !open) return;
    return watchTaskSize(element, () => {
      // Intrinsic content/viewport changed, not the animated outer shell.
      running.current?.stop();
      lastHeight.current = host.current?.scrollHeight ?? 0;
    });
  }, [open]);
  useEffect(() => () => running.current?.stop(), []);
  return (
    <div
      ref={host}
      id={id}
      className={`${styles.panel} ${className}`}
      data-open={open}
      aria-hidden={!open || undefined}
      onFocusCapture={() => running.current?.stop()}
    >
      <div ref={inner}>{open ? children : null}</div>
    </div>
  );
}
