import { describe, expect, it } from "vitest";
import { formatVnd } from "./format";
describe("formatVnd", () => {
  it("groups Vietnamese thousands and uses the dong sign", () => {
    expect(formatVnd(85000)).toBe("85.000 ₫");
    expect(formatVnd(1000000)).toBe("1.000.000 ₫");
  });
  it("never shows a price for invalid amounts", () => {
    for (const bad of [-1, 1.5, Number.NaN, 2 ** 60])
      expect(formatVnd(bad)).toBe("Chưa có giá");
  });
});
