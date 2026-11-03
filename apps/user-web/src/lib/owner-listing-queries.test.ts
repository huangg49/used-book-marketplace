import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
vi.mock("../services/my-listings", () => ({ getMyListings: vi.fn(), getMyPhoto: vi.fn() }));
import { getMyPhoto } from "../services/my-listings";
import { myListingsQuery, myListingPhotoQuery } from "./owner-listing-queries";
import {
  isPublicOwnerListing,
  tradeLabels,
  moderationLabels,
} from "./owner-listing-labels";
import type { MyListing } from "../services/my-listings";

describe("account overview and full shelf isolation", () => {
  afterEach(() => vi.resetAllMocks());
  it("reuses owner photos across preview/shelf while isolating actor and revision", async () => {
    const cache = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000 } } });
    vi.mocked(getMyPhoto).mockResolvedValue({ id: 'photo', url: 'https://example.test/cover', width: 1, height: 1, expiresAt: '2026-11-03T18:00:00Z' });
    try {
      await Promise.all([
        cache.fetchQuery(myListingPhotoQuery('owner-a', 'listing', 'revision-a', 'photo')),
        cache.fetchQuery(myListingPhotoQuery('owner-a', 'listing', 'revision-a', 'photo')),
      ]);
      expect(getMyPhoto).toHaveBeenCalledOnce();
      await cache.fetchQuery(myListingPhotoQuery('owner-a', 'listing', 'revision-b', 'photo'));
      await cache.fetchQuery(myListingPhotoQuery('owner-b', 'listing', 'revision-a', 'photo'));
      expect(getMyPhoto).toHaveBeenCalledTimes(3);
      expect(myListingPhotoQuery(undefined, 'listing', 'revision-a', 'photo').enabled).toBe(false);
      expect(myListingPhotoQuery('owner-a', 'listing', 'revision-a', undefined).enabled).toBe(false);
    } finally { cache.clear(); }
  });
  it("separates owners, page sizes, filters and opaque cursors", () => {
    const key = myListingsQuery("owner-a", "", undefined, 4).queryKey;
    expect(key).not.toEqual(
      myListingsQuery("owner-b", "", undefined, 4).queryKey,
    );
    expect(key).not.toEqual(myListingsQuery("owner-a").queryKey);
    expect(key).not.toEqual(
      myListingsQuery("owner-a", "Draft", undefined, 4).queryKey,
    );
    expect(key).not.toEqual(
      myListingsQuery("owner-a", "", "opaque", 4).queryKey,
    );
    expect(myListingsQuery(undefined).enabled).toBe(false);
  });
  it.each(["Draft", "PendingReview", "Rejected"] as const)(
    "never links %s to a public detail",
    (moderation) => {
      expect(
        isPublicOwnerListing({
          state: { moderation, visibility: "Visible", trade: "Available" },
        } as MyListing),
      ).toBe(false);
    },
  );
  it.each(["Hidden", "Removed"] as const)(
    "never links an approved %s listing to public detail",
    (visibility) => {
      expect(
        isPublicOwnerListing({
          state: { moderation: "Approved", visibility, trade: "Sold" },
        } as MyListing),
      ).toBe(false);
    },
  );
  it("preserves independent trade and moderation labels", () => {
    expect(new Set(Object.values(tradeLabels)).size).toBe(4);
    expect(moderationLabels.Draft).not.toBe(moderationLabels.PendingReview);
    expect(
      isPublicOwnerListing({
        state: {
          moderation: "Approved",
          visibility: "Visible",
          trade: "Reserved",
        },
      } as MyListing),
    ).toBe(true);
  });
});
