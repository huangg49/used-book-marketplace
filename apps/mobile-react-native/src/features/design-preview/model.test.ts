import { describe, expect, it } from "vitest";
import {
  emptyDraft,
  filterBooks,
  sampleDraft,
  validPrice,
  validateStep,
} from "./model";

describe("design study interactions", () => {
  it("finds Vietnamese titles without accents and includes Both in each trade filter", () => {
    expect(filterBooks("nhung ngay di bo", "all").map((b) => b.id)).toEqual([
      "long",
    ]);
    expect(filterBooks("Jane", "sale").map((b) => b.id)).toEqual(["pride"]);
    expect(filterBooks("Jane", "exchange").map((b) => b.id)).toEqual(["pride"]);
    expect(filterBooks("Alice", "exchange")).toEqual([]);
  });
  it("keeps an empty saved shelf empty and intersects saved IDs with search", () => {
    expect(filterBooks("", "all", [])).toEqual([]);
    expect(filterBooks("Jane", "all", ["alice"])).toEqual([]);
    expect(filterBooks("Jane", "all", ["pride"])).toHaveLength(1);
  });
  it("accepts the policy boundaries and rejects decimals, exponent notation and separators", () => {
    expect(validPrice("10000")).toBe(true);
    expect(validPrice("1000000")).toBe(true);
    for (const value of [
      "9999",
      "1000001",
      "1e5",
      "125.000",
      "125000.5",
      "-10000",
      "",
    ]) {
      expect(validPrice(value)).toBe(false);
    }
  });
  it("requires the matching price for Sale, Exchange and Both, regardless of hidden values", () => {
    const d = sampleDraft();
    d.price = "";
    d.mode = "exchange";
    expect(validateStep(d, 2)).toEqual([]);
    d.mode = "both";
    expect(validateStep(d, 2)).not.toEqual([]);
    d.mode = "sale";
    d.price = "125000";
    d.exchangeValue = "";
    expect(validateStep(d, 2)).toEqual([]);
    d.mode = "both";
    expect(validateStep(d, 2)).not.toEqual([]);
  });
  it("rechecks earlier steps at review instead of trusting that the wizard was visited", () => {
    const d = sampleDraft();
    expect(validateStep(d, 3)).toEqual([]);
    d.bookId = "deleted";
    d.photos = [];
    d.ownsBook = false;
    expect(validateStep(d, 3)).toHaveLength(3);
    expect(validateStep(emptyDraft(), 3).length).toBeGreaterThan(3);
  });
  it("blocks missing critical pages and excessive photo counts", () => {
    const d = sampleDraft();
    d.missingPages = true;
    expect(validateStep(d, 1)).not.toEqual([]);
    d.missingPages = false;
    d.photos = Array.from({ length: 9 }, (_, i) => ({
      id: String(i),
      uri: "local-fixture",
    }));
    expect(validateStep(d, 1)).not.toEqual([]);
  });
});
