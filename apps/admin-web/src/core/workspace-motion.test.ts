import { describe, expect, it, vi } from "vitest";
import { playWorkspaceEdge, shouldTurnWorkspace } from "./workspace-motion";
import { attachPaperDepth } from "./paper-depth";
import { chartPoints, chartTransition, playChartTransition, type ChartShape } from "../features/dashboard/chart-motion";

function fixture() {
  let clock = 0, frameId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const media = { matches: true };
  const view = Object.assign(new EventTarget(), {
    innerWidth: 1280, innerHeight: 860,
    performance: { now: () => clock },
    requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: vi.fn((id: number) => { frames.delete(id); }),
    matchMedia: () => media,
  });
  const doc = Object.assign(new EventTarget(), { hidden: false, defaultView: view });
  const animation = { cancel: vi.fn(), finished: new Promise<void>(() => {}) };
  const attributes = new Map<string, string>();
  const properties = new Map<string, string>();
  const element = Object.assign(new EventTarget(), {
    ownerDocument: doc, dataset: {} as Record<string, string>,
    getBoundingClientRect: () => ({ top: 20, left: 20, bottom: 420, right: 420, width: 400, height: 400 }),
    getClientRects: () => [1], closest: () => null, contains: () => false,
    animate: vi.fn(() => animation),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    style: { setProperty: (name: string, value: string) => properties.set(name, value) },
  });
  const advance = (time: number) => {
    clock = time;
    const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(time));
  };
  return { element, node: element as unknown as HTMLElement, doc, view, animation, attributes, properties, frames, advance, media };
}
const shape = (value = 0): ChartShape => ({
  dates: ["2026-10-26", "2026-10-27"], top: 4, width: 600,
  submitted: [[38, 170], [568, 170 - value * 35]],
  processed: [[38, 170], [568, 170]],
});
describe("workspace motion boundaries", () => {
  it("decorates only accepted pathname changes; initial/Back and filters stay still", () => {
    expect(shouldTurnWorkspace("/dashboard", "/review/listings", "PUSH")).toBe(true);
    expect(shouldTurnWorkspace("/review/listings", "/review/listings/one", "REPLACE")).toBe(true);
    expect(shouldTurnWorkspace("/dashboard", "/review/listings", "POP")).toBe(false);
    expect(shouldTurnWorkspace("/dashboard", "/dashboard", "PUSH")).toBe(false);
  });
  it("cancels route decoration on blur/unmount, with a safe missing-WAAPI fallback", () => {
    const f = fixture(); const stop = playWorkspaceEdge(f.node);
    expect(f.element.dataset.workspaceMotion).toBe("edge");
    f.view.dispatchEvent(new Event("blur")); stop();
    expect(f.animation.cancel).toHaveBeenCalledTimes(1);
    expect(f.element.dataset.workspaceMotion).toBeUndefined();
    f.element.animate = undefined as never;
    expect(() => playWorkspaceEdge(f.node)()).not.toThrow();
  });
  it("bounds depth on the decorative layer and clears queued frames on pointer cancellation", () => {
    const f = fixture(), layer = fixture();
    const stop = attachPaperDepth(f.node, layer.node);
    f.element.dispatchEvent(Object.assign(new Event("pointermove"), { pointerType: "mouse", buttons: 0, clientX: 1000, clientY: -1000 }));
    f.advance(16);
    expect(layer.properties.get("--paper-rx")).toBe("1.5deg");
    expect(layer.properties.get("--paper-ry")).toBe("2deg");
    expect(layer.properties.get("--paper-lift")).toBe("-4px");
    expect(f.properties.size).toBe(0); // controls' host is never transformed
    f.element.dispatchEvent(Object.assign(new Event("pointermove"), { pointerType: "mouse", buttons: 0, clientX: 100, clientY: 100 }));
    f.element.dispatchEvent(new Event("pointercancel"));
    expect(f.frames.size).toBe(0);
    expect(layer.properties.get("--paper-lift")).toBe("0px");
    stop(); f.element.dispatchEvent(new Event("focusin"));
    expect(layer.properties.get("--paper-lift")).toBe("0px");
  });
  it("does not track touch, dragging, small/coarse viewports or hidden tabs", () => {
    const f = fixture(), layer = fixture();
    const stop = attachPaperDepth(f.node, layer.node);
    for (const fields of [{ pointerType: "touch", buttons: 0 }, { pointerType: "mouse", buttons: 1 }]) {
      f.element.dispatchEvent(Object.assign(new Event("pointermove"), fields));
      expect(f.frames.size).toBe(0);
    }
    f.media.matches = false;
    f.element.dispatchEvent(new Event("focusin"));
    expect(layer.properties.get("--paper-lift")).toBe("0px");
    f.media.matches = true;
    f.element.dispatchEvent(new Event("focusin"));
    expect(layer.properties.get("--paper-lift")).toBe("-2px");
    f.doc.hidden = true; f.doc.dispatchEvent(new Event("visibilitychange"));
    expect(layer.properties.get("--paper-lift")).toBe("0px"); stop();
  });
});
describe("truthful chart continuity", () => {
  it("does not replay unchanged polling, resize or connect different dates/scales", () => {
    const before = shape();
    expect(chartTransition(before, shape())).toBe("none");
    expect(chartTransition(before, { ...shape(1), width: 320 })).toBe("none");
    expect(chartTransition(before, shape(1))).toBe("morph");
    expect(chartTransition(before, { ...shape(1), dates: ["2026-10-25", "2026-10-26"] })).toBe("reveal");
    expect(chartTransition(before, { ...shape(1), top: 8 })).toBe("reveal");
  });
  it("interpolates real geometry, then snaps to the selected true state on interruption", () => {
    const group = fixture(), sent = fixture(), done = fixture();
    const next = shape(2);
    const stop = playChartTransition(group.node as unknown as SVGGElement, sent.node as unknown as SVGPolylineElement, done.node as unknown as SVGPolylineElement, shape(), next);
    group.advance(95);
    expect(sent.attributes.get("points")).not.toBe(chartPoints(shape().submitted));
    expect(sent.attributes.get("points")).not.toBe(chartPoints(next.submitted));
    group.doc.hidden = true; group.doc.dispatchEvent(new Event("visibilitychange"));
    expect(sent.attributes.get("points")).toBe(chartPoints(next.submitted));
    expect(group.frames.size).toBe(0);
    expect(group.element.dataset.chartMotion).toBeUndefined();
    stop();
  });
  it("finishes naturally and never uses animation support as a condition for accurate lines", () => {
    const group = fixture(), sent = fixture(), done = fixture();
    playChartTransition(group.node as unknown as SVGGElement, sent.node as unknown as SVGPolylineElement, done.node as unknown as SVGPolylineElement, shape(), shape(1));
    group.advance(380);
    expect(sent.attributes.get("points")).toBe(chartPoints(shape(1).submitted));
    expect(group.frames.size).toBe(0);
    group.element.animate = undefined as never;
    playChartTransition(group.node as unknown as SVGGElement, sent.node as unknown as SVGPolylineElement, done.node as unknown as SVGPolylineElement, null, shape(3))();
    expect(sent.attributes.get("points")).toBe(chartPoints(shape(3).submitted));
  });
  it("cancels an old scope before the next one and leaves no stale frame or visibility listener", () => {
    const group = fixture(), sent = fixture(), done = fixture();
    const nodes = [group.node, sent.node, done.node] as unknown as [SVGGElement, SVGPolylineElement, SVGPolylineElement];
    const stopFirst = playChartTransition(...nodes, shape(), shape(1));
    group.advance(60);
    stopFirst();
    const stopNext = playChartTransition(...nodes, shape(1), shape(3));
    stopFirst(); // late cleanup of a cancelled effect must not restore scope 1
    group.advance(440);
    expect(sent.attributes.get("points")).toBe(chartPoints(shape(3).submitted));
    expect(group.frames.size).toBe(0);
    group.doc.dispatchEvent(new Event("visibilitychange"));
    expect(sent.attributes.get("points")).toBe(chartPoints(shape(3).submitted));
    stopNext();
  });
});
