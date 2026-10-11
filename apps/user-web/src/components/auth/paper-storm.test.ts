import { describe, expect, it, vi } from "vitest";
import { runPaperStorm, stormFrame, stormTiming, type StormMode } from "./paper-storm";

function fakeClock() {
  let now = 0, id = 0;
  const queue = new Map<number, FrameRequestCallback>();
  return {
    now: () => now,
    request: (callback: FrameRequestCallback) => { queue.set(++id, callback); return id; },
    cancel: (key: number) => { queue.delete(key); },
    step: (time: number) => { now = time; const callbacks = [...queue.values()]; queue.clear(); callbacks.forEach(callback => callback(now)); },
    queued: () => queue.size,
  };
}
describe("successful-login paper handoff", () => {
  it.each(["desktop", "mobile", "reduced"] as StormMode[])("%s navigates only after an opaque paint and holds until destination is ready", async mode => {
    const clock = fakeClock(), timing = stormTiming(mode);
    const frames: number[] = [];
    let ready: () => void = () => {};
    const covered = vi.fn(() => new Promise<void>(resolve => { ready = resolve; }));
    const done = vi.fn();
    runPaperStorm(mode, { draw: time => frames.push(time), covered, done, failed: vi.fn() }, clock);
    clock.step(timing.cover - 1);
    expect(covered).not.toHaveBeenCalled();
    clock.step(timing.cover + 30); // even a dropped frame cannot skip the solid cover
    expect(covered).not.toHaveBeenCalled();
    expect(stormFrame(frames.at(-1)!, mode)).toMatchObject({ cover: 1, release: 0 });
    clock.step(timing.cover + 46); // next paint boundary
    expect(covered).toHaveBeenCalledTimes(1);
    clock.step(timing.end + 500); // destination is deliberately slow
    expect(done).not.toHaveBeenCalled();
    expect(stormFrame(frames.at(-1)!, mode).release).toBe(0);
    ready(); await Promise.resolve(); await Promise.resolve();
    clock.step(timing.end + 516);
    expect(done).not.toHaveBeenCalled();
    clock.step(timing.end + 500 + timing.end - timing.cover + 50);
    expect(done).toHaveBeenCalledTimes(1);
    expect(covered).toHaveBeenCalledTimes(1);
    expect(clock.queued()).toBe(0);
  });
  it("history interruption cancels before navigation", () => {
    const clock = fakeClock(), covered = vi.fn(async () => {}), done = vi.fn();
    const cancel = runPaperStorm("desktop", { draw: vi.fn(), covered, done, failed: vi.fn() }, clock);
    clock.step(800); cancel(); clock.step(2500);
    expect(covered).not.toHaveBeenCalled(); expect(done).not.toHaveBeenCalled(); expect(clock.queued()).toBe(0);
  });
  it("cancellation while awaiting route paint cannot restart the animation", async () => {
    const clock = fakeClock(); let ready: () => void = () => {};
    const done = vi.fn();
    const cancel = runPaperStorm("desktop", { draw: vi.fn(), covered: () => new Promise(resolve => { ready = resolve; }), done, failed: vi.fn() }, clock);
    clock.step(1050); clock.step(1066); cancel(); ready(); await Promise.resolve();
    clock.step(3000); expect(done).not.toHaveBeenCalled(); expect(clock.queued()).toBe(0);
  });
  it("reduced motion keeps the cover handoff without spatial movement", () => {
    expect(stormTiming("reduced").end).toBeLessThan(500);
    expect(stormFrame(200, "reduced")).toMatchObject({ cover: 1, release: 0 });
    expect(stormTiming("desktop").end).toBeLessThanOrEqual(2000);
    expect(stormTiming("mobile").end).toBeGreaterThanOrEqual(1500);
  });
});
