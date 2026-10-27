import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAquarium, type AquariumRenderer } from "./aquarium-runtime";

function fixture() {
  const win = new EventTarget(), doc = new EventTarget();
  Object.assign(win, { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 3 });
  Object.assign(doc, { hidden: false, hasFocus: () => true });
  vi.stubGlobal("window", win); vi.stubGlobal("document", doc);
  vi.stubGlobal("requestAnimationFrame", vi.fn()); vi.stubGlobal("cancelAnimationFrame", vi.fn());
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe() {} disconnect = disconnect;
  });
  vi.stubGlobal("ResizeObserver", undefined);
  const stage = { dataset: {}, getBoundingClientRect: () => ({ width: 400, height: 280, top: 20, left: 20, bottom: 300, right: 420 }) } as unknown as HTMLElement;
  const canvas = { getContext: () => ({ setTransform: vi.fn() }), width: 0, height: 0 } as unknown as HTMLCanvasElement;
  const loop = { start: vi.fn(), pause: vi.fn(), dispose: vi.fn() };
  const renderer: AquariumRenderer = { createFrameLoop: () => loop, renderAquarium: vi.fn() };
  const ready = vi.fn(), load = vi.fn(async () => ({ renderer, images: {} }));
  return { win, doc, stage, canvas, loop, renderer, ready, load, disconnect, offscreen: () => intersect([{ isIntersecting: false }]), onscreen: () => intersect([{ isIntersecting: true }]) };
}
afterEach(() => vi.unstubAllGlobals());
describe("Dashboard aquarium lifecycle", () => {
  it("gates playback and preserves manual pause across pagehide/pageshow", async () => {
    const f = fixture(), scene = mountAquarium(f.stage, f.canvas, f.ready, f.load);
    await vi.waitFor(() => expect(f.ready).toHaveBeenCalledWith(true));
    expect(f.canvas.width).toBe(800); // DPR cap, rather than device DPR 3
    scene.pause(true); expect(f.loop.pause).toHaveBeenCalled();
    const starts = f.loop.start.mock.calls.length;
    f.win.dispatchEvent(new Event("pagehide")); f.win.dispatchEvent(new Event("pageshow"));
    expect(f.loop.start).toHaveBeenCalledTimes(starts);
    scene.pause(false); expect(f.loop.start.mock.calls.length).toBeGreaterThan(starts);
    f.offscreen(); expect(f.loop.pause).toHaveBeenCalled();
    f.win.dispatchEvent(new Event("blur")); const beforeFocus = f.loop.start.mock.calls.length;
    f.onscreen(); expect(f.loop.start).toHaveBeenCalledTimes(beforeFocus);
    f.win.dispatchEvent(new Event("focus")); expect(f.loop.start.mock.calls.length).toBeGreaterThan(beforeFocus);
    scene.dispose(); expect(f.loop.dispose).toHaveBeenCalledOnce(); expect(f.disconnect).toHaveBeenCalledOnce();
    const after = f.loop.start.mock.calls.length;
    f.win.dispatchEvent(new Event("focus")); expect(f.loop.start).toHaveBeenCalledTimes(after);
    expect(f.stage.dataset.aquariumReady).toBeUndefined();
  });
  it("does not revive a scene after unmount during asynchronous loading", async () => {
    const f = fixture();
    let resolve!: (value: Awaited<ReturnType<typeof f.load>>) => void;
    const load = () => new Promise<Awaited<ReturnType<typeof f.load>>>(done => { resolve = done; });
    const scene = mountAquarium(f.stage, f.canvas, f.ready, load);
    scene.dispose(); resolve({ renderer: f.renderer, images: {} });
    await Promise.resolve(); await Promise.resolve();
    expect(f.ready).not.toHaveBeenCalled(); expect(f.loop.start).not.toHaveBeenCalled();
  });
  it("retains the static fallback after an asset failure or renderer failure", async () => {
    const f = fixture();
    const scene = mountAquarium(f.stage, f.canvas, f.ready, async () => { throw new Error("asset missing"); });
    await vi.waitFor(() => expect(f.ready).toHaveBeenCalledWith(false));
    expect(f.stage.dataset.aquariumReady).toBeUndefined(); scene.dispose();
    f.renderer.renderAquarium = () => { throw new Error("canvas unavailable"); };
    const failed = mountAquarium(f.stage, f.canvas, f.ready, f.load);
    await vi.waitFor(() => expect(f.loop.dispose).toHaveBeenCalled());
    expect(f.ready).not.toHaveBeenCalledWith(true); expect(f.stage.dataset.aquariumReady).toBeUndefined(); failed.dispose();
  });
});
