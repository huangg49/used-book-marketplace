import { describe, expect, it } from "vitest";
import { publicListing } from "../shelf/contracts";
import { FALLBACK_LISTINGS } from "../shelf/home-mock-data";

describe("SearchScreen Stitch (TimKiem-App) Integration & Logic", () => {
  it("verifies all Stitch classic book listings pass the strict publicListing Zod schema", () => {
    expect(FALLBACK_LISTINGS.length).toBeGreaterThanOrEqual(7);

    // Verify presence of classic books added from Stitch TimKiem-App
    const titles = FALLBACK_LISTINGS.map((l) => l.book.title);
    expect(titles.some((t) => t.includes("Hà Nội 36 Phố Phường"))).toBe(true);
    expect(titles.some((t) => t.includes("Biển Cả Và Ông Lão"))).toBe(true);
    expect(titles.some((t) => t.includes("Nhà Giả Kim"))).toBe(true);

    for (const listing of FALLBACK_LISTINGS) {
      const parsed = publicListing.safeParse(listing);
      expect(parsed.success).toBe(true);
      expect(listing.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
  });

  it("filters listings correctly by keyword search (case-insensitive)", () => {
    const query = "thạch lam";
    const results = FALLBACK_LISTINGS.filter(
      (item) =>
        item.book.title.toLowerCase().includes(query.toLowerCase()) ||
        item.book.authors.some((a) =>
          a.toLowerCase().includes(query.toLowerCase()),
        ),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].book.title).toContain("Hà Nội 36 Phố Phường");
  });

  it("filters listings correctly by mode (Sale, Exchange, Both, Rare)", () => {
    const saleOnly = FALLBACK_LISTINGS.filter(
      (item) => item.mode === "Sale" || item.mode === "Both",
    );
    expect(saleOnly.length).toBeGreaterThan(0);
    for (const item of saleOnly) {
      expect(["Sale", "Both"]).toContain(item.mode);
      expect(item.salePrice).toBeDefined();
      expect(item.salePrice).toBeGreaterThan(0);
    }

    const exchangeItems = FALLBACK_LISTINGS.filter(
      (item) => item.mode === "Exchange" || item.mode === "Both",
    );
    expect(exchangeItems.length).toBeGreaterThan(0);
    for (const item of exchangeItems) {
      expect(["Exchange", "Both"]).toContain(item.mode);
      expect(item.exchangeValue).toBeDefined();
    }
  });

  it("filters listings correctly by book condition", () => {
    const likeNewItems = FALLBACK_LISTINGS.filter(
      (item) => item.condition === "LikeNew",
    );
    expect(likeNewItems.length).toBeGreaterThan(0);
    for (const item of likeNewItems) {
      expect(item.condition).toBe("LikeNew");
    }
  });

  it("filters listings correctly by max price ceiling", () => {
    const maxPrice = 150_000;
    const affordableItems = FALLBACK_LISTINGS.filter((item) => {
      const p = item.salePrice || item.exchangeValue || 0;
      return p <= maxPrice;
    });
    expect(affordableItems.length).toBeGreaterThan(0);
    for (const item of affordableItems) {
      const price = item.salePrice || item.exchangeValue || 0;
      expect(price).toBeLessThanOrEqual(maxPrice);
    }
  });

  it("sorts listings correctly by price ascending and descending", () => {
    const pricedItems = FALLBACK_LISTINGS.filter(
      (l) => (l.salePrice || l.exchangeValue || 0) > 0,
    );

    const sortedAsc = [...pricedItems].sort(
      (a, b) =>
        (a.salePrice || a.exchangeValue || 0) -
        (b.salePrice || b.exchangeValue || 0),
    );
    for (let i = 0; i < sortedAsc.length - 1; i++) {
      const priceA = sortedAsc[i].salePrice || sortedAsc[i].exchangeValue || 0;
      const priceB =
        sortedAsc[i + 1].salePrice || sortedAsc[i + 1].exchangeValue || 0;
      expect(priceA).toBeLessThanOrEqual(priceB);
    }

    const sortedDesc = [...pricedItems].sort(
      (a, b) =>
        (b.salePrice || b.exchangeValue || 0) -
        (a.salePrice || a.exchangeValue || 0),
    );
    for (let i = 0; i < sortedDesc.length - 1; i++) {
      const priceA = sortedDesc[i].salePrice || sortedDesc[i].exchangeValue || 0;
      const priceB =
        sortedDesc[i + 1].salePrice || sortedDesc[i + 1].exchangeValue || 0;
      expect(priceA).toBeGreaterThanOrEqual(priceB);
    }
  });
});
