import { describe, expect, it } from "vitest";
import { appendBundleRange, type BookBundle } from "./book-bundle";
const bundle = (): BookBundle => ({
  title: "Bộ thiếu tập 2",
  wholeOnly: true,
  exclusiveOwnershipDeclared: true,
  items: [
    { label: " TẬP 1 ", condition: "Fair", notes: "Ghi bút chì" },
    { label: "Ngoại truyện", condition: "Worn", notes: "Mất áo bìa" },
  ],
});
describe("append volumes without losing seller edits", () => {
  it("preserves custom titles, normalization-equivalent labels and per-book condition/notes", () => {
    const source = bundle(),
      next = appendBundleRange(source, "1", "3");
    expect(next.items).toEqual([
      ...source.items,
      { label: "Tập 2", condition: "Good", notes: "" },
      { label: "Tập 3", condition: "Good", notes: "" },
    ]);
    expect(source.items).toHaveLength(2);
  });
  it("keeps unnamed rows with edits, but replaces untouched blank starter rows", () => {
    const source = bundle();
    source.items = [
      { label: "", condition: "Good", notes: "" },
      { label: "", condition: "Fair", notes: "Đang nhập" },
    ];
    expect(appendBundleRange(source, "1", "2").items).toEqual([
      source.items[1],
      { label: "Tập 1", condition: "Good", notes: "" },
      { label: "Tập 2", condition: "Good", notes: "" },
    ]);
  });
  it("rejects overflow without changing the original list", () => {
    const source = bundle(),
      before = JSON.stringify(source);
    expect(() => appendBundleRange(source, "1", "50")).toThrow();
    expect(JSON.stringify(source)).toBe(before);
  });
  it.each([
    ["", "2"],
    ["1e1", "20"],
    ["0", "2"],
    ["2", "2"],
    ["1", "51"],
    ["9999", "10000"],
  ])("rejects invalid range %s..%s", (from, to) => {
    expect(() => appendBundleRange(bundle(), from, to)).toThrow();
  });
});
