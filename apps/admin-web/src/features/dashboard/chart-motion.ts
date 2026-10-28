import { motionVisible, watchMotionBoundary } from "../../core/motion-boundary";

export type ChartPoint = readonly [number, number];
export type ChartShape = {
  dates: string[];
  width: number;
  top: number;
  submitted: ChartPoint[];
  processed: ChartPoint[];
};
export const chartPoints = (points: readonly ChartPoint[]) =>
  points.map(([x, y]) => `${x},${y}`).join(" ");

export function chartTransition(previous: ChartShape | null, next: ChartShape) {
  if (!previous) return "reveal";
  // Never interpolate unrelated dates or two coordinate/scale systems. A new
  // domain appears with its own true axes, rather than stretching seven days.
  if (previous.width !== next.width) return "none";
  if (previous.top !== next.top || previous.dates.join() !== next.dates.join()) return "reveal";
  return chartPoints(previous.submitted) === chartPoints(next.submitted) &&
    chartPoints(previous.processed) === chartPoints(next.processed) ? "none" : "morph";
}

export function playChartTransition(
  group: SVGGElement,
  submitted: SVGPolylineElement,
  processed: SVGPolylineElement,
  previous: ChartShape | null,
  next: ChartShape,
) {
  const view = group.ownerDocument.defaultView;
  const kind = chartTransition(previous, next);
  const final = () => {
    submitted.setAttribute("points", chartPoints(next.submitted));
    processed.setAttribute("points", chartPoints(next.processed));
  };
  final();
  if (!view || !motionVisible(group) || kind === "none") return () => {};
  let frame = 0;
  let animation: Animation | undefined;
  let stopped = false;
  let unwatch = () => {};
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frame) view.cancelAnimationFrame(frame);
    animation?.cancel();
    final();
    delete group.dataset.chartMotion;
    unwatch();
  };
  if (kind === "morph" && previous && typeof view.requestAnimationFrame === "function") {
    const start = view.performance.now();
    const draw = (progress: number) => {
      const mix = (from: ChartPoint[], to: ChartPoint[]) => to.map(([x, y], i) =>
        [x, from[i][1] + (y - from[i][1]) * progress] as ChartPoint);
      submitted.setAttribute("points", chartPoints(mix(previous.submitted, next.submitted)));
      processed.setAttribute("points", chartPoints(mix(previous.processed, next.processed)));
    };
    draw(0);
    const tick = (time: number) => {
      const progress = Math.min(1, Math.max(0, (time - start) / 380));
      draw(1 - Math.pow(1 - progress, 4));
      if (progress === 1) stop();
      else frame = view.requestAnimationFrame(tick);
    };
    frame = view.requestAnimationFrame(tick);
  } else {
    if (typeof group.animate !== "function") return stop;
    try {
      animation = group.animate([{ opacity: .2 }, { opacity: 1 }], {
        duration: 320, easing: "cubic-bezier(.16,1,.3,1)",
      });
    } catch { return stop; }
    void animation.finished.then(stop, stop);
  }
  group.dataset.chartMotion = kind;
  unwatch = watchMotionBoundary(group, stop);
  return stop;
}
