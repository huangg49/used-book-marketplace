import { describe, expect, it } from "vitest";
import { publicListing } from "./contracts";
import {
  FALLBACK_LISTINGS,
  FALLBACK_FLASH_DEALS,
  VOUCHERS_LIST,
  INITIAL_NOTIFICATIONS,
  CATEGORIES,
} from "./home-mock-data";

describe("HomeScreen Stitch Redesign Data & Contracts", () => {
  it("ensures all fallback listings conform strictly to the publicListing Zod contract", () => {
    expect(FALLBACK_LISTINGS.length).toBeGreaterThanOrEqual(4);
    for (const listing of FALLBACK_LISTINGS) {
      const parsed = publicListing.safeParse(listing);
      if (!parsed.success) {
        console.error(JSON.stringify(parsed.error.issues, null, 2));
      }
      expect(parsed.success).toBe(true);
    }
  });

  it("ensures flash deals items have required discount and pricing structure", () => {
    expect(FALLBACK_FLASH_DEALS.length).toBeGreaterThanOrEqual(4);
    for (const deal of FALLBACK_FLASH_DEALS) {
      expect(deal.price).toBeLessThan(deal.originalPrice);
      expect(deal.discountPercent).toBeGreaterThan(0);
      expect(deal.soldCount).toBeLessThanOrEqual(deal.totalStock);
      expect(deal.coverUrl).toContain("https://");
    }
  });

  it("ensures vouchers have valid codes and non-empty titles", () => {
    expect(VOUCHERS_LIST.length).toBeGreaterThan(0);
    for (const voucher of VOUCHERS_LIST) {
      expect(voucher.code.length).toBeGreaterThan(3);
      expect(voucher.title).toBeTruthy();
    }
  });

  it("ensures initial notifications are structured with valid types", () => {
    expect(INITIAL_NOTIFICATIONS.length).toBeGreaterThan(0);
    for (const notif of INITIAL_NOTIFICATIONS) {
      expect(["order", "auction", "voucher", "system"]).toContain(notif.type);
      expect(notif.title).toBeTruthy();
    }
  });

  it("ensures categories list contains Vietnamese literary tags", () => {
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(5);
    const categoryTitles = CATEGORIES.map((c) => c.title);
    expect(categoryTitles).toContain("Gợi ý hôm nay");
    expect(categoryTitles).toContain("Văn học 1930-1945");
  });
});
