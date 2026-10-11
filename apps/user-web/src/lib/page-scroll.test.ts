import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lockPageScroll } from "./page-scroll";

function style() {
  const values = new Map<string, [string, string]>();
  return {
    getPropertyValue: (key: string) => values.get(key)?.[0] ?? "",
    getPropertyPriority: (key: string) => values.get(key)?.[1] ?? "",
    setProperty: (key: string, value: string, priority = "") => values.set(key, [value, priority]),
    removeProperty: (key: string) => values.delete(key),
  };
}

describe("page scroll locks", () => {
  let root: ReturnType<typeof style>, body: ReturnType<typeof style>;
  let location: { pathname: string; search: string };
  let scrollTo: ReturnType<typeof vi.fn>;
  const releases: (() => void)[] = [];
  function lock() {
    const release = lockPageScroll();
    releases.push(release);
    return release;
  }
  beforeEach(() => {
    root = style(); body = style();
    location = { pathname: "/books", search: "?data=preview" };
    scrollTo = vi.fn();
    vi.stubGlobal("CSS", { supports: () => true });
    vi.stubGlobal("document", { documentElement: { style: root }, body: { style: body } });
    vi.stubGlobal("window", { scrollX: 0, scrollY: 420, location, scrollTo });
  });
  afterEach(() => {
    releases.splice(0).forEach((release) => release());
    vi.unstubAllGlobals();
  });
  it("keeps the stable root gutter without adding a second body compensation", () => {
    body.setProperty("padding-right", "12px");
    const release = lock();
    expect(root.getPropertyValue("overflow-y")).toBe("hidden");
    expect(body.getPropertyValue("padding-right")).toBe("12px");
    expect(body.getPropertyValue("overflow")).toBe("");
    release();
    expect(root.getPropertyValue("overflow-y")).toBe("");
    expect(scrollTo).not.toHaveBeenCalled();
  });
  it("unlocks only after every overlapping overlay closes, including repeated cleanup", () => {
    root.setProperty("overflow-y", "auto", "important");
    const first = lock(), second = lock();
    first(); first();
    expect(root.getPropertyValue("overflow-y")).toBe("hidden");
    second(); second();
    expect(root.getPropertyValue("overflow-y")).toBe("auto");
    expect(root.getPropertyPriority("overflow-y")).toBe("important");
  });
  it("freezes the fallback body while keeping the root scrollbar and restoring scroll position", () => {
    vi.stubGlobal("CSS", { supports: () => false });
    root.setProperty("overflow-y", "scroll");
    body.setProperty("position", "relative", "important");
    const release = lock();
    expect(root.getPropertyValue("overflow-y")).toBe("scroll");
    expect(body.getPropertyValue("position")).toBe("fixed");
    expect(body.getPropertyValue("top")).toBe("-420px");
    release();
    expect(body.getPropertyValue("position")).toBe("relative");
    expect(body.getPropertyPriority("position")).toBe("important");
    expect(body.getPropertyValue("top")).toBe("");
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 0, top: 420, behavior: "instant" });
  });
  it("does not restore the old page position after navigation during an overlay", () => {
    vi.stubGlobal("CSS", undefined);
    const release = lock();
    location.pathname = "/"; location.search = "";
    release();
    expect(body.getPropertyValue("position")).toBe("");
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
