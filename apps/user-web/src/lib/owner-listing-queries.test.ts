import { describe, expect, it } from "vitest";
import { myListingsQuery } from "./owner-listing-queries";
import {
  isPublicOwnerListing,
  tradeLabels,
  moderationLabels,
} from "./owner-listing-labels";
import type { MyListing } from "../services/my-listings";

describe("account overview and full shelf isolation", () => {
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
