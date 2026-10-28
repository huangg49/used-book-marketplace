import { useEffect, type RefObject } from "react";
import { motionVisible, watchMotionBoundary } from "./motion-boundary";

export function attachPaperDepth(host: HTMLElement, layer: HTMLElement) {
  const view = host.ownerDocument.defaultView;
  if (!view) return () => {};
  const media = view.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 721px)");
  let frame = 0;
  let bounds: DOMRect | undefined;
  let pointer: { x: number; y: number } | undefined;
  const paint = (x = 0, y = 0, lift = 0) => {
    layer.style.setProperty("--paper-rx", `${x}deg`);
    layer.style.setProperty("--paper-ry", `${y}deg`);
    layer.style.setProperty("--paper-lift", `${lift}px`);
  };
  const reset = () => {
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
    pointer = undefined;
    bounds = undefined;
    paint();
  };
  const move = (event: PointerEvent) => {
    if (!media.matches || event.pointerType !== "mouse" || event.buttons || !motionVisible(host) ||
        host.closest("[data-paper-motion]")) { reset(); return; }
    bounds ??= host.getBoundingClientRect();
    pointer = { x: event.clientX, y: event.clientY };
    if (frame) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      if (!pointer || !bounds) return;
      const clamp = (n: number) => Math.max(-1, Math.min(1, n));
      paint(-clamp((pointer.y - bounds.top) / bounds.height * 2 - 1) * 1.5,
        clamp((pointer.x - bounds.left) / bounds.width * 2 - 1) * 2, -4);
    });
  };
  const focus = () => {
    if (media.matches && motionVisible(host) && !host.closest("[data-paper-motion]")) paint(0, 0, -2);
  };
  const blur = (event: FocusEvent) => {
    if (!host.contains(event.relatedTarget as Node | null)) reset();
  };
  host.addEventListener("pointermove", move);
  host.addEventListener("pointerleave", reset);
  host.addEventListener("pointercancel", reset);
  host.addEventListener("pointerdown", reset);
  host.addEventListener("focusin", focus);
  host.addEventListener("focusout", blur);
  // Cached geometry must not survive scrolling, resizing or a viewport change.
  view.addEventListener("scroll", reset, true);
  view.addEventListener("resize", reset);
  const unwatch = watchMotionBoundary(host, reset);
  return () => {
    reset(); unwatch();
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerleave", reset);
    host.removeEventListener("pointercancel", reset);
    host.removeEventListener("pointerdown", reset);
    host.removeEventListener("focusin", focus);
    host.removeEventListener("focusout", blur);
    view.removeEventListener("scroll", reset, true);
    view.removeEventListener("resize", reset);
  };
}

export function usePaperDepth(host: RefObject<HTMLElement | null>, layer: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (host.current && layer.current) return attachPaperDepth(host.current, layer.current);
  }, [host, layer]);
}
