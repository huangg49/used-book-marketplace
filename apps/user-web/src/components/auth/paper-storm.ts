export type PaperOrigin = { x: number; y: number; width: number; height: number };
export type StormPhase = "stamp" | "tear" | "storm" | "covered" | "reveal";
export type StormMode = "desktop" | "mobile" | "reduced";
export const stormTiming = (mode: StormMode) => mode === "reduced"
  ? { tear: 80, burst: 80, cover: 200, reveal: 200, end: 440 }
  : mode === "mobile"
    ? { tear: 280, burst: 430, cover: 820, reveal: 820, end: 1500 }
    : { tear: 280, burst: 450, cover: 900, reveal: 900, end: 1600 };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => 1 - (1 - clamp(n)) ** 3;
/** Motion time never pauses. Release time is independently gated by destination readiness. */
export function stormFrame(time: number, mode: StormMode, releaseTime = Math.max(0, time - stormTiming(mode).reveal)) {
  const t = stormTiming(mode), release = clamp(releaseTime / (t.end - t.reveal));
  return {
    phase: (time < t.tear ? "stamp" : time < t.burst ? "tear" : time < t.cover ? "storm" : release === 0 ? "covered" : "reveal") as StormPhase,
    tear: ease((time - t.tear) / (t.burst - t.tear)),
    spread: clamp((time - t.burst) / (t.cover - t.burst)),
    cover: mode === "reduced" ? clamp((time - 80) / 120) : clamp((time - (t.burst + 80)) / (t.cover - t.burst - 80)),
    release,
  };
}
/** The curved perimeter stays outside this solid rectangular core at full coverage. */
export function coverSheetBounds(width: number, height: number, time: number, mode: StormMode, releaseTime = 0) {
  const f = stormFrame(time, mode, releaseTime), travel = ease(f.cover);
  const drift = Math.sin((time - stormTiming(mode).cover) / 650) * .035;
  const x = width * (-3 + 2.4 * travel + drift * travel + f.release * 3.2);
  const y = height * (1.6 - 2.2 * travel - drift * travel - f.release * 2.4);
  const w = width * 2.2, h = height * 2.2;
  return { x, y, width: w, height: h,
    covers: x + w * .12 <= 0 && y + h * .12 <= 0 && x + w * .88 >= width && y + h * .88 >= height };
}
export type ComposedScene = { count: number; enter: () => Promise<void>; release: () => Promise<void>; dispose: () => void };
export function paperHold(index: number, elapsed: number, mode: StormMode) {
  const period = index === 0 ? Math.PI * 2 * 650 : Math.PI * 2 / 1.8 * 1000;
  const timing = stormTiming(mode);
  const phase = index === 0 ? 0 : (timing.cover - timing.burst) / 1000 * 1.8 + index - 1;
  const offset = (Math.sin(elapsed / period * Math.PI * 2 + phase) - Math.sin(phase)) * (index === 0 ? .065 : .055);
  return { x: offset, y: -offset, period };
}
export function composedCoverBounds(width: number, height: number, holdTime: number, mode: StormMode) {
  const base = coverSheetBounds(width, height, stormTiming(mode).cover, mode);
  const drift = paperHold(0, holdTime, mode);
  const x = base.x + drift.x * width, y = base.y + drift.y * height;
  return { x, y, covers: x + base.width * .12 <= 0 && y + base.height * .12 <= 0 && x + base.width * .88 >= width && y + base.height * .88 >= height };
}
type Handoff = { covered: () => Promise<void>; done: () => void; failed: () => void };
/** Native animations keep moving while this coordinator waits for route readiness. */
export function runComposedStorm(scene: ComposedScene, driver: Handoff) {
  let cancelled = false;
  void (async () => {
    try {
      await scene.enter();
      if (cancelled) return;
      await driver.covered();
      if (cancelled) return;
      await scene.release();
      if (!cancelled) { cancelled = true; scene.dispose(); driver.done(); }
    } catch {
      if (!cancelled) { cancelled = true; scene.dispose(); driver.failed(); }
    }
  })();
  return () => { if (!cancelled) { cancelled = true; scene.dispose(); } };
}

type Clock = { request: (callback: FrameRequestCallback) => number; cancel: (id: number) => void; now: () => number };
type StormDriver = { draw: (time: number, releaseTime: number) => void; covered: () => Promise<void>; done: () => void; failed: () => void };
/** Navigation readiness gates release, never the animation loop or its motion clock. */
export function runPaperStorm(mode: StormMode, driver: StormDriver, clock: Clock = {
  request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id), now: () => performance.now(),
}) {
  const timing = stormTiming(mode), started = clock.now();
  let frame = 0, cancelled = false, coveragePainted = false, committed = false, releaseAt: number | null = null;
  function tick(now: number) {
    if (cancelled) return;
    const time = now - started;
    if (!coveragePainted && time >= timing.cover) {
      driver.draw(timing.cover, 0); coveragePainted = true;
    } else {
      // This later rAF follows an opaque paint; keep drawing while navigate awaits.
      if (coveragePainted && !committed) {
        committed = true;
        void driver.covered().then(() => {
          if (!cancelled) releaseAt = Math.max(timing.reveal, clock.now() - started);
        }).catch(() => { if (!cancelled) { cancelled = true; clock.cancel(frame); driver.failed(); } });
      }
      const releaseTime = releaseAt === null ? 0 : Math.max(0, time - releaseAt);
      driver.draw(time, releaseTime);
      if (releaseAt !== null && releaseTime >= timing.end - timing.reveal) { cancelled = true; driver.done(); return; }
    }
    frame = clock.request(tick);
  }
  frame = clock.request(tick);
  return () => { cancelled = true; clock.cancel(frame); };
}
