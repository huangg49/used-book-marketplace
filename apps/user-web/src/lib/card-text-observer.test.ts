import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("shared card text observation", () => {
  let observeCardText: typeof import("./card-text-observer").observeCardText;
  let resize: ResizeObserverCallback;
  let rootChanged: MutationCallback;
  let fontsReady: () => void;
  let frames: Map<number, FrameRequestCallback>;
  let windowEvents: EventTarget;
  let fontEvents: EventTarget;
  let cleanup: (() => void)[];
  const element = () => ({ className: "" }) as HTMLElement;
  const observer = {
    observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
  };
  const rootObserver = { observe: vi.fn(), disconnect: vi.fn() };
  const resizeConstructor = vi.fn(function (callback: ResizeObserverCallback) {
    resize = callback;
    return observer;
  });
  const mutationConstructor = vi.fn(function (callback: MutationCallback) {
    rootChanged = callback;
    return rootObserver;
  });
  function flush() {
    const batch = [...frames.values()];
    frames.clear();
    batch.forEach((callback) => callback(0));
  }
  function resized(...targets: HTMLElement[]) {
    resize(
      targets.map((target) => ({ target })) as unknown as ResizeObserverEntry[],
      observer as unknown as ResizeObserver,
    );
  }
  function subscribe(frame = element(), fit = vi.fn()) {
    const stop = observeCardText(frame, fit);
    cleanup.push(stop);
    return { frame, fit, stop };
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    frames = new Map();
    cleanup = [];
    let nextFrame = 0;
    windowEvents = new EventTarget();
    fontEvents = new EventTarget();
    vi.spyOn(windowEvents, "addEventListener");
    vi.spyOn(windowEvents, "removeEventListener");
    vi.spyOn(fontEvents, "addEventListener");
    vi.spyOn(fontEvents, "removeEventListener");
    Object.assign(fontEvents, { ready: new Promise<void>((resolve) => { fontsReady = resolve; }) });
    vi.stubGlobal("window", windowEvents);
    vi.stubGlobal("document", { documentElement: element(), fonts: fontEvents });
    vi.stubGlobal("ResizeObserver", resizeConstructor);
    vi.stubGlobal("MutationObserver", mutationConstructor);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    ({ observeCardText } = await import("./card-text-observer"));
  });
  afterEach(() => {
    cleanup.forEach((stop) => stop());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shares observers and page listeners across 100 text slots", () => {
    const slots = Array.from({ length: 100 }, () => subscribe());
    expect(resizeConstructor).toHaveBeenCalledTimes(1);
    expect(mutationConstructor).toHaveBeenCalledTimes(1);
    expect(observer.observe).toHaveBeenCalledTimes(100);
    expect(windowEvents.addEventListener).toHaveBeenCalledTimes(1);
    expect(fontEvents.addEventListener).toHaveBeenCalledTimes(1);
    windowEvents.dispatchEvent(new Event("resize"));
    fontEvents.dispatchEvent(new Event("loadingdone"));
    rootChanged([{ attributeName: "style" }] as MutationRecord[], rootObserver as unknown as MutationObserver);
    expect(frames.size).toBe(1);
    flush();
    slots.forEach(({ fit }) => expect(fit).toHaveBeenCalledTimes(1));
  });

  it("refits only resized slots and coalesces repeated signals", () => {
    const first = subscribe();
    const second = subscribe();
    resized(first.frame, first.frame);
    resized(first.frame);
    flush();
    expect(first.fit).toHaveBeenCalledTimes(1);
    expect(second.fit).not.toHaveBeenCalled();
  });

  function classesChanged(before: string, after: string) {
    document.documentElement.className = after;
    rootChanged([{ attributeName: "class", oldValue: before }] as MutationRecord[], rootObserver as unknown as MutationObserver);
  }

  it("ignores Lenis scroll state changes while keeping resize and font signals", () => {
    const slot = subscribe();
    classesChanged("brand lenis", "lenis lenis-scrolling lenis-smooth brand");
    classesChanged("brand lenis lenis-scrolling lenis-smooth", "brand lenis lenis-stopped lenis-locked lenis-autoToggle");
    expect(frames.size).toBe(0);
    resized(slot.frame);
    flush();
    expect(slot.fit).toHaveBeenCalledTimes(1);
    fontEvents.dispatchEvent(new Event("loadingdone"));
    flush();
    expect(slot.fit).toHaveBeenCalledTimes(2);
  });

  it("refits for typography classes, unknown Lenis classes and inline root styles", () => {
    const slot = subscribe();
    classesChanged("lenis", "large-text lenis lenis-scrolling");
    flush();
    expect(slot.fit).toHaveBeenCalledTimes(1);
    classesChanged("large-text lenis", "large-text lenis lenis-new-state");
    flush();
    expect(slot.fit).toHaveBeenCalledTimes(2);
    rootChanged([{ attributeName: "style" }] as MutationRecord[], rootObserver as unknown as MutationObserver);
    flush();
    expect(slot.fit).toHaveBeenCalledTimes(3);
  });

  it("keeps real class changes when batched with scrolling changes", () => {
    const slot = subscribe();
    document.documentElement.className = "large-text lenis lenis-scrolling";
    rootChanged([
      { attributeName: "class", oldValue: "lenis" },
      { attributeName: "class", oldValue: "large-text lenis" },
    ] as MutationRecord[], rootObserver as unknown as MutationObserver);
    expect(frames.size).toBe(1);
    flush();
    expect(slot.fit).toHaveBeenCalledTimes(1);
  });

  it("does not fit a removed slot while other slots remain", () => {
    const first = subscribe();
    const second = subscribe();
    windowEvents.dispatchEvent(new Event("resize"));
    first.stop();
    flush();
    expect(first.fit).not.toHaveBeenCalled();
    expect(second.fit).toHaveBeenCalledTimes(1);
    expect(observer.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects, cancels queued work and ignores stale font readiness", async () => {
    const first = subscribe();
    windowEvents.dispatchEvent(new Event("resize"));
    first.stop();
    first.stop();
    expect(frames.size).toBe(0);
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(rootObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(windowEvents.removeEventListener).toHaveBeenCalledTimes(1);
    expect(fontEvents.removeEventListener).toHaveBeenCalledTimes(1);
    fontsReady();
    await Promise.resolve();
    expect(frames.size).toBe(0);
    expect(first.fit).not.toHaveBeenCalled();
  });

  it("starts a fresh observation cycle after teardown", async () => {
    subscribe().stop();
    const second = subscribe();
    expect(resizeConstructor).toHaveBeenCalledTimes(2);
    fontsReady();
    await Promise.resolve();
    expect(frames.size).toBe(1);
    flush();
    expect(second.fit).toHaveBeenCalledTimes(1);
  });

  it("ignores removed registrations even when removal happens mid-batch", () => {
    let stopSecond = () => {};
    subscribe(element(), vi.fn(() => stopSecond()));
    const second = subscribe();
    stopSecond = second.stop;
    windowEvents.dispatchEvent(new Event("resize"));
    flush();
    expect(second.fit).not.toHaveBeenCalled();
  });
});
