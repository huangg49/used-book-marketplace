import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SkyMetric } from "./SkyMetric";
import { attachEcosystemPlayback } from "./ecosystem-playback";

describe("sky metric data and independent playback", () => {
  it("keeps a missing result distinct from zero and shows the selected period", () => {
    const missing = renderToStaticMarkup(<SkyMetric value={null} days={7} />);
    const zero = renderToStaticMarkup(<SkyMetric value={0} days={30} />);
    const value = renderToStaticMarkup(<SkyMetric value={254} days={7} />);
    expect(missing).toMatch(/<dd[^>]*>—<\/dd>/); expect(zero).toMatch(/<dd[^>]*>0<\/dd>/);
    expect(zero).toContain("trong 30 ngày"); expect(value).toMatch(/<dd[^>]*>254<\/dd>/);
    expect(value).toContain("Tính cả các lần gửi lại");
    expect(value).toContain("không biểu thị số hồ sơ");
    expect(value).toContain('aria-hidden="true"');
  });
  it("isolates sky and forest controls and cleans both lifecycles", () => {
    const view = new EventTarget(), doc = new EventTarget();
    let focus = true;
    const disconnect = vi.fn();
    const observers: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
    Object.assign(view, { innerWidth: 1000, innerHeight: 800, IntersectionObserver: class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { observers.push(callback); }
      observe() {} disconnect = disconnect;
    } });
    Object.assign(doc, { defaultView: view, hidden: false, hasFocus: () => focus });
    const host = () => ({ dataset: {}, ownerDocument: doc, getBoundingClientRect: () => ({ top: 0, bottom: 280, left: 0, right: 340 }) }) as unknown as HTMLElement;
    const skyHost = host(), forestHost = host();
    const sky = attachEcosystemPlayback(skyHost, "skyPlaying"), forest = attachEcosystemPlayback(forestHost);
    sky.ready(true); forest.ready(true);
    sky.pause(true);
    expect(skyHost.dataset.skyPlaying).toBe("false"); expect(forestHost.dataset.forestPlaying).toBe("true");
    expect(skyHost.dataset.forestPlaying).toBeUndefined();
    view.dispatchEvent(new Event("pagehide")); expect(forestHost.dataset.forestPlaying).toBe("false");
    view.dispatchEvent(new Event("pageshow")); expect(forestHost.dataset.forestPlaying).toBe("true");
    expect(skyHost.dataset.skyPlaying).toBe("false");
    sky.pause(false); observers[0]([{ isIntersecting: false }]);
    expect(skyHost.dataset.skyPlaying).toBe("false"); expect(forestHost.dataset.forestPlaying).toBe("true");
    observers[0]([{ isIntersecting: true }]); expect(skyHost.dataset.skyPlaying).toBe("true");
    focus = false; view.dispatchEvent(new Event("blur")); expect(skyHost.dataset.skyPlaying).toBe("false");
    focus = true; view.dispatchEvent(new Event("focus"));
    sky.dispose(); forest.dispose(); sky.ready(true); sky.pause(false); view.dispatchEvent(new Event("pageshow"));
    expect(skyHost.dataset.skyPlaying).toBe("false"); expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
