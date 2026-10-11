import { describe, expect, it, vi } from "vitest";
import { runPaperStorm, stormFrame, stormTiming, coverSheetBounds, type StormMode } from "./paper-storm";
function fakeClock() {
  let now = 0, id = 0; const queue = new Map<number, FrameRequestCallback>();
  return { now: () => now, request: (cb: FrameRequestCallback) => { queue.set(++id, cb); return id; }, cancel: (key: number) => { queue.delete(key); },
    step: (t: number) => { now = t; const jobs = [...queue.values()]; queue.clear(); jobs.forEach(cb => cb(now)); }, queued: () => queue.size };
}
describe("continuous successful-login paper handoff", () => {
  it.each(["desktop", "mobile", "reduced"] as StormMode[])("%s paints opaque cover before navigation, keeps drawing during a slow destination", async mode => {
    const clock = fakeClock(), t = stormTiming(mode), frames: { time: number; release: number }[] = [];
    let ready: () => void = () => {};
    const covered = vi.fn(() => new Promise<void>(r => { ready = r; })), done = vi.fn();
    runPaperStorm(mode, { draw: (time, release) => frames.push({ time, release }), covered, done, failed: vi.fn() }, clock);
    clock.step(t.cover - 1); expect(covered).not.toHaveBeenCalled();
    clock.step(t.cover + 30); expect(covered).not.toHaveBeenCalled();
    expect(stormFrame(frames.at(-1)!.time, mode, frames.at(-1)!.release)).toMatchObject({ cover: 1, release: 0 });
    clock.step(t.cover + 46); expect(covered).toHaveBeenCalledTimes(1);
    clock.step(t.cover + 300); clock.step(t.cover + 600);
    expect(frames.at(-2)!.time).toBe(t.cover + 300); expect(frames.at(-1)!.time).toBe(t.cover + 600);
    expect(frames.at(-1)!.release).toBe(0); expect(clock.queued()).toBe(1); expect(done).not.toHaveBeenCalled();
    ready(); await Promise.resolve(); await Promise.resolve();
    clock.step(t.cover + 616); expect(frames.at(-1)!.release).toBe(16); expect(done).not.toHaveBeenCalled();
    clock.step(t.cover + 600 + t.end - t.reveal); expect(done).toHaveBeenCalledTimes(1); expect(clock.queued()).toBe(0);
  });
  it.each([[1366,768],[390,844],[768,390],[2560,1440],[320,1100]])("solid curved sheet covers %sx%s throughout an arbitrarily slow commit", (w,h) => {
    for (const mode of ["desktop", "mobile"] as StormMode[]) {
      for (let time = stormTiming(mode).cover; time < 10000; time += 37) expect(coverSheetBounds(w,h,time,mode).covers).toBe(true);
      const a=coverSheetBounds(w,h,stormTiming(mode).cover+100,mode), b=coverSheetBounds(w,h,stormTiming(mode).cover+200,mode);
      expect(a.x).not.toBe(b.x); // occlusion never requires a motion freeze
      expect(coverSheetBounds(w,h,10000,mode,700).covers).toBe(false);
    }
  });
  it("Back before cover cancels delayed navigation", () => {
    const clock=fakeClock(), covered=vi.fn(async()=>{}), done=vi.fn();
    const cancel=runPaperStorm("desktop",{draw:vi.fn(),covered,done,failed:vi.fn()},clock);
    clock.step(700);cancel();clock.step(2500);expect(covered).not.toHaveBeenCalled();expect(done).not.toHaveBeenCalled();expect(clock.queued()).toBe(0);
  });
  it("Back while awaiting destination cannot restart the loop",async()=>{
    const clock=fakeClock();let ready:()=>void=()=>{};const done=vi.fn();
    const cancel=runPaperStorm("desktop",{draw:vi.fn(),covered:()=>new Promise(r=>{ready=r;}),done,failed:vi.fn()},clock);
    clock.step(900);clock.step(916);cancel();ready();await Promise.resolve();clock.step(3000);expect(done).not.toHaveBeenCalled();expect(clock.queued()).toBe(0);
  });
  it("navigation rejection stops the loop and delegates recovery once",async()=>{
    const clock=fakeClock(),failed=vi.fn();runPaperStorm("desktop",{draw:vi.fn(),covered:async()=>{throw Error('QA failure');},done:vi.fn(),failed},clock);
    clock.step(900);clock.step(916);await Promise.resolve();await Promise.resolve();clock.step(932);expect(failed).toHaveBeenCalledTimes(1);expect(clock.queued()).toBe(0);
  });
});
