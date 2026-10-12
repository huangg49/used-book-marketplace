import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeHeaderScroll } from "./header-scroll";

describe("header scroll synchronization", () => {
  let scrollY: number;
  let frame: (() => void) | undefined;
  let listeners: Set<() => void>;
  let cancel: ReturnType<typeof vi.fn>;
  const releases: (() => void)[] = [];
  const observe = (change: (floating: boolean, collapsing: boolean) => void) => {
    const release = observeHeaderScroll(change);
    releases.push(release);
    return release;
  };
  const scroll = (y: number) => {
    scrollY = y;
    listeners.forEach((listener) => listener());
  };

  beforeEach(() => {
    scrollY = 0;
    listeners = new Set();
    frame = undefined;
    cancel = vi.fn(() => {
      frame = undefined;
    });
    vi.stubGlobal("window", {
      get scrollY() {
        return scrollY;
      },
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
      requestAnimationFrame: (callback: () => void) => {
        frame = callback;
        return 1;
      },
      cancelAnimationFrame: cancel,
    });
  });
  afterEach(() => {
    releases.splice(0).forEach((release) => release());
    vi.unstubAllGlobals();
  });

  it("publishes the actual mount position without a collapse flash", () => {
    const change = vi.fn();
    observe(change);
    expect(change).toHaveBeenCalledExactlyOnceWith(false, false);
  });

  it("expands after a route resets scroll without dispatching a scroll event", () => {
    scrollY = 600;
    const change = vi.fn();
    observe(change);
    expect(change).toHaveBeenLastCalledWith(true, false);
    scrollY = 0;
    frame?.();
    expect(change).toHaveBeenLastCalledWith(false, false);
  });

  it("retains scroll hysteresis and flashes only when collapsing", () => {
    const change = vi.fn();
    observe(change);
    scroll(48);
    expect(change).toHaveBeenCalledTimes(1);
    scroll(49);
    expect(change).toHaveBeenLastCalledWith(true, true);
    scroll(30);
    expect(change).toHaveBeenCalledTimes(2);
    scroll(16);
    expect(change).toHaveBeenLastCalledWith(false, false);
    scroll(49);
    expect(change).toHaveBeenLastCalledWith(true, true);
  });

  it("cleans up the old route listener and pending frame before resubscribing", () => {
    const oldChange = vi.fn();
    scrollY = 600;
    const release = observe(oldChange);
    release();
    expect(cancel).toHaveBeenCalledWith(1);
    expect(frame).toBeUndefined();
    expect(listeners.size).toBe(0);
    scrollY = 0;
    const newChange = vi.fn();
    observe(newChange);
    expect(newChange).toHaveBeenLastCalledWith(false, false);
    scroll(600);
    expect(oldChange).toHaveBeenCalledTimes(1);
    expect(newChange).toHaveBeenLastCalledWith(true, true);
  });
});
