import { describe, expect, it, vi } from "vitest";
import { installViewTransitionFallback } from "./view-transition-fallback";

describe("native view transition snapshot fallback", () => {
  it.each(["AbortError", "InvalidStateError"])("handles a %s snapshot while preserving the update promises", async (name) => {
    const transition = {
      ready: Promise.reject(new DOMException("Snapshot capture failed", name)),
      updateCallbackDone: Promise.resolve(),
      finished: Promise.resolve(),
      skipTransition: vi.fn(),
    } as unknown as ViewTransition;
    const start = vi.fn(() => transition);
    const target = { startViewTransition: start } as unknown as Pick<Document, "startViewTransition">;
    installViewTransitionFallback(target);
    const update = vi.fn();
    expect(target.startViewTransition(update)).toBe(transition);
    expect(start).toHaveBeenCalledWith(update);
    expect(start.mock.contexts[0]).toBe(target);
    await transition.finished;
    await transition.updateCallbackDone;
    expect(transition.skipTransition).not.toHaveBeenCalled();
  });

  it("leaves unsupported browsers alone", () => {
    const target = { startViewTransition: undefined } as unknown as Pick<Document, "startViewTransition">;
    installViewTransitionFallback(target);
    expect(target.startViewTransition).toBeUndefined();
  });

  it("does not hide unexpected failures or route callback errors", async () => {
    const observe = vi.fn();
    const failure = new Error("Route update failed");
    const transition = {
      ready: { catch: observe },
      updateCallbackDone: Promise.reject(failure),
      finished: Promise.reject(failure),
    } as unknown as ViewTransition;
    const callbackCheck = expect(transition.updateCallbackDone).rejects.toBe(failure);
    const finishedCheck = expect(transition.finished).rejects.toBe(failure);
    const target = { startViewTransition: () => transition } as unknown as Pick<Document, "startViewTransition">;
    installViewTransitionFallback(target);
    expect(target.startViewTransition()).toBe(transition);
    expect(() => observe.mock.calls[0][0](failure)).toThrow(failure);
    await Promise.all([callbackCheck, finishedCheck]);
  });
});
