import { motionVisible, watchMotionBoundary } from "./motion-boundary";

export function shouldTurnWorkspace(previous: string, pathname: string, action: string) {
  return previous !== pathname && action !== "POP";
}

export function playWorkspaceEdge(element: HTMLElement) {
  if (!motionVisible(element) || typeof element.animate !== "function") return () => {};
  let animation: Animation;
  try {
    animation = element.animate([
      { opacity: 0, transform: "translateX(-8px) scaleX(.4)" },
      { opacity: .8, transform: "translateX(12px) scaleX(1)", offset: .25 },
      { opacity: 0, transform: "translateX(96px) scaleX(.2)" },
    ], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
  } catch { return () => {}; }
  element.dataset.workspaceMotion = "edge";
  let stopped = false;
  let unwatch = () => {};
  const stop = () => {
    if (stopped) return;
    stopped = true;
    animation.cancel();
    delete element.dataset.workspaceMotion;
    unwatch();
  };
  unwatch = watchMotionBoundary(element, stop);
  void animation.finished.then(stop, stop);
  return stop;
}
