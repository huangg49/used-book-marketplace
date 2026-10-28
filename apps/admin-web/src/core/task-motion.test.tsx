import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { listTransition, playTaskMotion, watchTaskSize } from "./task-motion";
import { MotionPanel } from "./MotionPanel";
import { PaperSelect } from "./PaperSelect";

function fixture() {
  const view = Object.assign(new EventTarget(), {
    innerWidth: 1000,
    innerHeight: 900,
  });
  const doc = Object.assign(new EventTarget(), {
    hidden: false,
    defaultView: view,
  });
  let finish!: () => void;
  const animation = {
    cancel: vi.fn(),
    finished: new Promise<void>((resolve) => {
      finish = resolve;
    }),
  };
  const element = {
    ownerDocument: doc,
    getBoundingClientRect: () => ({
      top: 50,
      left: 50,
      bottom: 150,
      right: 150,
    }),
    getClientRects: () => [1],
    animate: vi.fn(() => animation),
  };
  return {
    doc,
    view,
    animation,
    finish,
    element,
    node: element as unknown as HTMLElement,
  };
}
describe("task motion interruption", () => {
  it("cancels once on blur and releases visibility listeners before another task", async () => {
    const f = fixture();
    const remove = vi.spyOn(f.doc, "removeEventListener");
    const stop = playTaskMotion(f.node, [{ opacity: 0.5 }, { opacity: 1 }]);
    f.view.dispatchEvent(new Event("blur"));
    stop();
    f.finish();
    await Promise.resolve();
    expect(f.animation.cancel).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
  });
  it("hidden and offscreen work does not start an animation; missing WAAPI leaves content usable", () => {
    const f = fixture();
    f.doc.hidden = true;
    playTaskMotion(f.node, [])();
    expect(f.element.animate).not.toHaveBeenCalled();
    f.doc.hidden = false;
    f.element.getClientRects = () => [];
    playTaskMotion(f.node, [])();
    expect(f.element.animate).not.toHaveBeenCalled();
    expect(() =>
      playTaskMotion(
        { ...f.node, animate: undefined } as unknown as HTMLElement,
        [],
      )(),
    ).not.toThrow();
  });
  it("an old completion cannot cancel a replacement animation", async () => {
    const f = fixture();
    const stop = playTaskMotion(f.node, []);
    stop();
    const replacement = {
      cancel: vi.fn(),
      finished: new Promise<void>(() => {}),
    };
    f.element.animate.mockReturnValue(replacement);
    const next = playTaskMotion(f.node, []);
    f.finish();
    await Promise.resolve();
    expect(replacement.cancel).not.toHaveBeenCalled();
    next();
    expect(replacement.cancel).toHaveBeenCalledTimes(1);
  });
  it("distinguishes additions, movement, content changes and unchanged polling", () => {
    const row = { top: 40, left: 0, revision: "1" };
    expect(listTransition(undefined, row)).toBe("enter");
    expect(listTransition(row, { ...row })).toBe("none");
    expect(listTransition(row, { ...row, top: 40.5 })).toBe("none");
    expect(listTransition(row, { ...row, top: 0 })).toBe("move");
    expect(listTransition(row, { ...row, revision: "2" })).toBe("update");
  });
});
describe("task surface safety", () => {
  it("coalesces resize writes outside observer delivery and cancels queued work on unmount", () => {
    let notify!: () => void,
      runFrame!: () => void,
      size = 100;
    const disconnect = vi.fn(),
      changed = vi.fn(),
      cancel = vi.fn();
    const view = {
      ResizeObserver: class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
      requestAnimationFrame: vi.fn((callback: () => void) => {
        runFrame = callback;
        return 42;
      }),
      cancelAnimationFrame: cancel,
    };
    const element = {
      ownerDocument: { defaultView: view },
      getBoundingClientRect: () => ({ width: 200, height: size }),
    } as unknown as HTMLElement;
    const stop = watchTaskSize(element, changed);
    notify();
    expect(view.requestAnimationFrame).not.toHaveBeenCalled();
    size = 150;
    notify();
    size = 160;
    notify();
    expect(changed).not.toHaveBeenCalled();
    expect(view.requestAnimationFrame).toHaveBeenCalledTimes(1);
    runFrame();
    expect(changed).toHaveBeenCalledTimes(1);
    size = 170;
    notify();
    stop();
    expect(cancel).toHaveBeenCalledWith(42);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
  it("closed paper never retains a live form or its private draft", () => {
    const html = renderToStaticMarkup(
      <MotionPanel open={false}>
        <form>
          <input defaultValue="private draft" />
        </form>
      </MotionPanel>,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("private draft");
  });
  it("open paper has one live form without hiding it from assistive technology", () => {
    const html = renderToStaticMarkup(
      <MotionPanel open>
        <form>
          <input />
        </form>
      </MotionPanel>,
    );
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html).not.toContain('aria-hidden="true"');
  });
  it("a closed filter popup is inert, labelled and cannot submit its surrounding form", () => {
    const html = renderToStaticMarkup(
      <PaperSelect
        label="Vai trò"
        value="staff"
        choices={[
          ["all", "Tất cả"],
          ["staff", "Nhân viên"],
        ]}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('inert=""');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Nhân viên");
  });
});
