import { describe, expect, it } from "vitest";
import {
  uniqueWorkItems,
  workItemsPageSchema,
  workLanesFor,
  workTarget,
  type WorkItem,
} from "./work-inbox";
const id = "1101d28c-80c3-4223-b289-e9446ba940be";
const targetId = "2201d28c-80c3-4223-b289-e9446ba940be";
const item: WorkItem = {
  id,
  targetId,
  target: "DirectOrder",
  title: "Đơn QA",
  reason: "Cần xem",
  dueAt: null,
  attention: "Action",
  sourceState: "AwaitingPayment",
  version: 1,
};
describe("shared work contract and destinations", () => {
  it.each([
    ["DirectOrder", `/orders/${targetId}`, `/orders?orderId=${targetId}`],
    ["Exchange", `/exchange/${targetId}`, `/exchange?id=${targetId}`],
    ["Listing", `/my-books/${targetId}/edit`, `/drafts?listingId=${targetId}`],
    [
      "AuctionIntake",
      `/my-auctions?intakeId=${targetId}`,
      `/send-to-auction?intakeId=${targetId}`,
    ],
    ["Auction", `/auctions/${targetId}`, `/auction?id=${targetId}`],
  ] as const)(
    "opens the exact %s record on each Member client",
    (target, web, native) => {
      expect(workTarget({ ...item, target }, "web")).toBe(web);
      expect(workTarget({ ...item, target }, "native")).toBe(native);
      expect(workTarget({ ...item, target }, "operations")).toBeUndefined();
    },
  );
  it("operations routes stay separate from Member records", () => {
    expect(workTarget({ ...item, target: "ListingReview" }, "operations")).toBe(
      `/review/listings/${targetId}`,
    );
    expect(workTarget({ ...item, target: "CatalogReview" }, "operations")).toBe(
      `/review/catalog-requests/${targetId}`,
    );
    expect(
      workTarget({ ...item, target: "ListingReview" }, "native"),
    ).toBeUndefined();
  });
  it("LOCKED keeps existing obligations but omits ordinary listing and intake reads", () => {
    expect(workLanesFor("LOCKED").map(([lane]) => lane)).toEqual([
      "DirectOrders",
      "Exchanges",
      "AuctionOrders",
    ]);
    expect(workLanesFor("ACTIVE")).toHaveLength(5);
    expect(workLanesFor("RESTRICTED")).toHaveLength(5);
  });
  it("rejects unknown/incomplete data instead of substituting empty or made-up tasks", () => {
    const page = {
      items: [item],
      lane: "DirectOrders",
      nextCursor: null,
      serverTime: "2026-10-28T01:00:00Z",
    };
    expect(workItemsPageSchema.safeParse(page).success).toBe(true);
    expect(
      workItemsPageSchema.safeParse({
        ...page,
        items: [{ ...item, attention: "Success" }],
      }).success,
    ).toBe(false);
    expect(workItemsPageSchema.safeParse({ items: [] }).success).toBe(false);
  });
  it("keeps the latest revision of a live-paged record without duplicate actions", () => {
    expect(uniqueWorkItems([{ ...item, version: 2 }, item])).toEqual([
      { ...item, version: 2 },
    ]);
  });
});
