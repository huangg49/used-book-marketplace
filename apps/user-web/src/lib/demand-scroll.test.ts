import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lenis", () => ({
  default: class {
    time = 0;
    isScrolling: false | "smooth" = false;
    onFrame: (() => void) | undefined;
    scrollTo(target: number, options?: { immediate?: boolean }) {
      this.isScrolling = target && !options?.immediate ? "smooth" : false;
    }
    raf = vi.fn(() => this.onFrame?.());
    destroy() {}
  },
}));
import { DemandScroll } from "./demand-scroll";

describe("demand-driven Lenis frames", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextId: number;
  let clock: number;
  const step = () => {
    clock += 16;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(clock));
  };
  beforeEach(() => {
    frames = new Map();
    nextId = 0;
    clock = 100;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("sleeps at creation and after immediate/no-op commands", () => {
    const scroll = new DemandScroll();
    expect(frames.size).toBe(0);
    scroll.scrollTo(100, { immediate: true });
    scroll.scrollTo(0);
    expect(frames.size).toBe(0);
  });

  it("keeps one frame for repeated inputs and stops at completion", () => {
    const scroll = new DemandScroll();
    scroll.scrollTo(100);
    scroll.scrollTo(200);
    expect(frames.size).toBe(1);
    step();
    expect(scroll.raf).toHaveBeenCalledOnce();
    expect(frames.size).toBe(1);
    // Model Lenis completing or an external stop before the next frame.
    Object.assign(scroll, { isScrolling: false });
    step();
    expect(frames.size).toBe(0);
    clock = 9000;
    scroll.scrollTo(300);
    expect(scroll.time).toBe(9000);
    expect(frames.size).toBe(1);
  });

  it("does not schedule twice when completion starts a new command", () => {
    const scroll = new DemandScroll();
    Object.assign(scroll, { onFrame: () => {
      Object.assign(scroll, { isScrolling: false });
      scroll.scrollTo(200);
    } });
    scroll.scrollTo(100);
    step();
    expect(frames.size).toBe(1);
  });

  it("cancels even frame ID zero and ignores a stale callback after destroy", () => {
    const scroll = new DemandScroll();
    scroll.scrollTo(100);
    const stale = [...frames.values()][0]!;
    scroll.destroy();
    expect(frames.size).toBe(0);
    stale(1000);
    expect(scroll.raf).not.toHaveBeenCalled();
    scroll.scrollTo(200);
    expect(frames.size).toBe(0);
  });

  it("can be destroyed inside an update without leaving a successor frame", () => {
    const scroll = new DemandScroll();
    Object.assign(scroll, { onFrame: () => scroll.destroy() });
    scroll.scrollTo(100);
    step();
    expect(frames.size).toBe(0);
  });
});
