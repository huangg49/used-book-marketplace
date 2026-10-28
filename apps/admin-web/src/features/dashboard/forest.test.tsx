import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ForestMetric } from "./ForestMetric";
import { attachForestPlayback } from "./forest-playback";

function fixture() {
  const view = new EventTarget(), doc = new EventTarget();
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const disconnect = vi.fn();
  Object.assign(view, { innerWidth: 1000, innerHeight: 800, IntersectionObserver: class {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe() {} disconnect = disconnect;
  } });
  Object.assign(doc, { defaultView: view, hidden: false, hasFocus: () => true });
  const host = { dataset: {}, ownerDocument: doc, getBoundingClientRect: () => ({ top: 0, bottom: 280, left: 0, right: 340 }) } as unknown as HTMLElement;
  return { host, view, doc, disconnect, intersect: (isIntersecting: boolean) => intersect([{ isIntersecting }]) };
}
describe("forest metric", () => {
  it("keeps null, zero and period-specific totals honest with a decorative scene", () => {
    const missing = renderToStaticMarkup(<ForestMetric value={null} days={7} />);
    const zero = renderToStaticMarkup(<ForestMetric value={0} days={30} />);
    const value = renderToStaticMarkup(<ForestMetric value={125} days={7} />);
    expect(missing).toMatch(/<dd[^>]*>—<\/dd>/); expect(zero).toMatch(/<dd[^>]*>0<\/dd>/);
    expect(zero).toContain("trong 30 ngày"); expect(value).toMatch(/<dd[^>]*>125<\/dd>/);
    expect(value).toContain("Chấp thuận và từ chối");
    expect(value).toContain("không biểu thị số hồ sơ");
    expect(value).toContain('aria-hidden="true"');
  });
  it("waits for assets, pauses offscreen/hidden/blurred and retains manual pause", () => {
    const f = fixture(), scene = attachForestPlayback(f.host);
    expect(f.host.dataset.forestPlaying).toBe("false");
    scene.ready(true); expect(f.host.dataset.forestPlaying).toBe("true");
    f.intersect(false); expect(f.host.dataset.forestPlaying).toBe("false");
    f.intersect(true); expect(f.host.dataset.forestPlaying).toBe("true");
    Object.assign(f.doc, { hidden: true }); f.doc.dispatchEvent(new Event("visibilitychange"));
    expect(f.host.dataset.forestPlaying).toBe("false");
    Object.assign(f.doc, { hidden: false }); f.doc.dispatchEvent(new Event("visibilitychange"));
    f.view.dispatchEvent(new Event("blur")); expect(f.host.dataset.forestPlaying).toBe("false");
    f.view.dispatchEvent(new Event("focus")); expect(f.host.dataset.forestPlaying).toBe("true");
    scene.pause(true); f.view.dispatchEvent(new Event("pagehide")); f.view.dispatchEvent(new Event("pageshow"));
    expect(f.host.dataset.forestPlaying).toBe("false");
    scene.pause(false); expect(f.host.dataset.forestPlaying).toBe("true"); scene.dispose();
  });
  it("disposes observers/listeners and cannot restart from stale asset readiness", () => {
    const f = fixture(), scene = attachForestPlayback(f.host);
    scene.ready(true); scene.dispose(); scene.ready(true); scene.pause(false);
    f.view.dispatchEvent(new Event("focus")); f.intersect(true);
    expect(f.host.dataset.forestPlaying).toBe("false"); expect(f.disconnect).toHaveBeenCalledOnce();
  });
});
