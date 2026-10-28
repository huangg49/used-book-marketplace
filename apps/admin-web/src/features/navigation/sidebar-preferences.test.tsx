import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarPreferences } from "./SidebarPreferences";
import { createSidebarPreview, readSidebarMode, saveSidebarMode, sidebarStorageKey } from "./sidebar-preferences";

afterEach(() => vi.useRealTimers());

describe("local sidebar preference", () => {
  it.each([null, "broken", "null", '"auto"', '{"version":2,"mode":"auto"}', '{"version":1,"mode":"other"}'])(
    "defaults to a stable expanded layout for invalid storage %s", value => {
      expect(readSidebarMode({ getItem: () => value, setItem: () => {} })).toBe("expanded");
    });
  it.each(["expanded", "collapsed", "auto"] as const)("remembers %s with only version and layout mode", mode => {
    let value = "";
    const storage = { getItem: () => value, setItem: vi.fn((_key: string, next: string) => { value = next; }) };
    expect(saveSidebarMode(mode, storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(sidebarStorageKey, JSON.stringify({ version: 1, mode }));
    expect(readSidebarMode(storage)).toBe(mode);
  });
  it("survives a blocked storage getter/write and reports session-only saving", () => {
    const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    expect(readSidebarMode(blocked)).toBe("expanded");
    expect(saveSidebarMode("auto", blocked)).toBe(false);
  });
  it("offers labelled native radios, explanatory text, and a reachable close action", () => {
    const html = renderToStaticMarkup(<SidebarPreferences mode="collapsed" saved={false} onChange={() => {}} onHold={() => {}} />);
    expect(html).toContain('popover="auto"');
    expect(html).toContain('aria-label="Hiển thị thanh điều hướng"');
    const selected = html.match(/<input\b[^>]*value="collapsed"[^>]*>/)?.[0];
    expect(selected).toContain('checked=""');
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain("Bạn vẫn dùng được trong phiên này.");
    expect(html).toContain('aria-label="Đóng tùy chọn thanh điều hướng"');
  });
});

describe("intentional sidebar preview", () => {
  const setup = () => {
    vi.useFakeTimers();
    const preview = createSidebarPreview();
    preview.configure(true);
    return preview;
  };
  it("ignores quick passes; requires an uninterrupted 400ms dwell", () => {
    const p = setup();
    p.enter(); vi.advanceTimersByTime(399); expect(p.snapshot()).toBe(false);
    p.leave(); vi.advanceTimersByTime(1000); expect(p.snapshot()).toBe(false);
    p.enter(); vi.advanceTimersByTime(400); expect(p.snapshot()).toBe(true);
  });
  it("gives 300ms exit grace and cancels closure on re-entry", () => {
    const p = setup(); p.enter(); vi.advanceTimersByTime(400);
    p.leave(); vi.advanceTimersByTime(299); expect(p.snapshot()).toBe(true);
    p.enter(); vi.advanceTimersByTime(1000); expect(p.snapshot()).toBe(true);
    p.leave(); vi.advanceTimersByTime(300); expect(p.snapshot()).toBe(false);
  });
  it("opens for keyboard immediately and stays while focus remains despite pointer leaving", () => {
    const p = setup(); p.focus(); expect(p.snapshot()).toBe(true);
    p.leave(); vi.advanceTimersByTime(1000); expect(p.snapshot()).toBe(true);
    p.blur(); vi.advanceTimersByTime(300); expect(p.snapshot()).toBe(false);
  });
  it("keeps a child preferences popup open without racing its interaction", () => {
    const p = setup(); p.enter(); vi.advanceTimersByTime(400);
    p.hold(true); p.leave(); p.blur(); vi.advanceTimersByTime(1000); expect(p.snapshot()).toBe(true);
    p.hold(false); vi.advanceTimersByTime(300); expect(p.snapshot()).toBe(false);
  });
  it("Escape closes without reopening under a stationary pointer or retained focus", () => {
    const p = setup(); p.enter(); vi.advanceTimersByTime(400); p.focus();
    p.dismiss(); p.enter(); p.focus(); vi.advanceTimersByTime(2000); expect(p.snapshot()).toBe(false);
    p.leave(); p.enter(); vi.advanceTimersByTime(400); expect(p.snapshot()).toBe(true);
  });
  it("cancels pending work on route/visibility reset and starts a fresh dwell", () => {
    const p = setup(); p.enter(); vi.advanceTimersByTime(250); p.reset();
    vi.advanceTimersByTime(1000); expect(p.snapshot()).toBe(false);
    p.enter(); vi.advanceTimersByTime(399); expect(p.snapshot()).toBe(false);
    vi.advanceTimersByTime(1); expect(p.snapshot()).toBe(true);
    p.leave(); p.reset(); expect(vi.getTimerCount()).toBe(0);
  });
  it("manual/mobile configurations cannot auto-expand and teardown cancels every timer", () => {
    const p = setup(); p.enter(); p.configure(false);
    p.enter(); p.focus(); p.leave(); p.hold(false);
    vi.advanceTimersByTime(1000); expect(p.snapshot()).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
});
