import { describe, expect, it, vi } from "vitest";
import { playPaperMotion } from "./paper-motion";

function fixture() {
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
    defaultView: { innerWidth: 1000, innerHeight: 900 },
  });
  let finish!: () => void;
  const animation = {
    cancel: vi.fn(),
    finished: new Promise<void>((resolve) => {
      finish = resolve;
    }),
  };
  const element = {
    ownerDocument: document,
    getBoundingClientRect: () => ({
      top: 50,
      left: 50,
      bottom: 200,
      right: 200,
    }),
    getClientRects: () => [1],
    animate: vi.fn(() => animation),
    dataset: {} as Record<string, string>,
  };
  return {
    document,
    animation,
    element,
    finish,
    node: element as unknown as HTMLElement,
  };
}
describe("paper motion lifecycle", () => {
  it("cancels cleanly on interruption, completion and tab visibility without relying on animation events for content", async () => {
    const f = fixture();
    const stop = playPaperMotion(f.node, "turn");
    expect(f.element.dataset.paperMotion).toBe("turn");
    stop();
    expect(f.animation.cancel).toHaveBeenCalled();
    expect(f.element.dataset.paperMotion).toBeUndefined();
    playPaperMotion(f.node, "stamp");
    f.document.visibilityState = "hidden";
    f.document.dispatchEvent(new Event("visibilitychange"));
    expect(f.element.dataset.paperMotion).toBeUndefined();
    f.finish();
    await Promise.resolve();
    expect(f.element.dataset.paperMotion).toBeUndefined();
  });
  it("renders static fallback for missing WAAPI, offscreen elements and hidden tabs", () => {
    const f = fixture();
    f.document.visibilityState = "hidden";
    playPaperMotion(f.node, "stamp")();
    expect(f.element.animate).not.toHaveBeenCalled();
    f.document.visibilityState = "visible";
    f.element.getClientRects = () => [];
    playPaperMotion(f.node, "turn")();
    expect(f.element.animate).not.toHaveBeenCalled();
    expect(() =>
      playPaperMotion(
        { ...f.node, animate: undefined } as unknown as HTMLElement,
        "turn",
      )(),
    ).not.toThrow();
  });
  it("an old completion cannot clean up a newer turn on the same sheet", async () => {
    const f = fixture();
    const stop = playPaperMotion(f.node, "turn");
    stop();
    const next = { cancel: vi.fn(), finished: new Promise<void>(() => {}) };
    f.element.animate.mockReturnValue(next);
    const stopNext = playPaperMotion(f.node, "turn");
    f.finish();
    await Promise.resolve();
    expect(f.element.dataset.paperMotion).toBe("turn");
    expect(next.cancel).not.toHaveBeenCalled();
    stopNext();
  });
});
