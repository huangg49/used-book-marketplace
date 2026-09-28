import { describe, expect, it } from "vitest";
import { filterError, initialFilters, queryString } from "./filters";
describe("public shelf filters", () => {
  it("encodes literal Vietnamese search safely and omits empty filters", () => {
    const query = new URLSearchParams(
      queryString({
        ...initialFilters,
        q: " Đường sách & 100%_ ",
        minSalePrice: "0010000",
      }),
    );
    expect(query.get("q")).toBe("Đường sách & 100%_");
    expect(query.get("minSalePrice")).toBe("10000");
    expect(query.has("mode")).toBe(false);
    expect(query.get("sort")).toBe("newest");
  });
  it.each(["9", "1000001", "1e5", "10.000", "-10000", "10000.5"])(
    "rejects ambiguous or out-of-range price %s",
    (value) =>
      expect(
        filterError({ ...initialFilters, minSalePrice: value }),
      ).toBeTruthy(),
  );
  it("checks both independent price intervals and Unicode search length", () => {
    expect(
      filterError({
        ...initialFilters,
        minSalePrice: "20000",
        maxSalePrice: "10000",
      }),
    ).toBeTruthy();
    expect(
      filterError({
        ...initialFilters,
        minExchangeValue: "20000",
        maxExchangeValue: "10000",
      }),
    ).toBeTruthy();
    expect(
      filterError({ ...initialFilters, q: "📚".repeat(200) }),
    ).toBeUndefined();
    expect(
      filterError({ ...initialFilters, q: "📚".repeat(201) }),
    ).toBeTruthy();
  });
  it("accepts open intervals and zero unused price filters", () =>
    expect(
      filterError({
        ...initialFilters,
        maxSalePrice: "1000000",
        minExchangeValue: "10000",
      }),
    ).toBeUndefined());
});
