import { z } from "zod";
import type { components } from "@used-books/api-contract";

export const workItemSchema = z.object({
  id: z.uuid(),
  target: z.enum([
    "DirectOrder",
    "Exchange",
    "Listing",
    "AuctionIntake",
    "Auction",
    "ListingReview",
    "CatalogReview",
  ]),
  targetId: z.uuid(),
  sourceState: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  reason: z.string(),
  attention: z.enum(["Action", "Waiting", "Blocked"]),
  dueAt: z.iso.datetime({ offset: true }).nullable(),
});
export const workItemsPageSchema = z.object({
  items: z.array(workItemSchema).max(50),
  nextCursor: z.string().nullable(),
  serverTime: z.iso.datetime({ offset: true }),
  lane: z.enum([
    "DirectOrders",
    "Exchanges",
    "Listings",
    "AuctionIntakes",
    "AuctionOrders",
    "ListingReview",
    "CatalogReview",
  ]),
}) satisfies z.ZodType<components["schemas"]["WorkItemsPage"]>;
export type WorkItem = z.infer<typeof workItemSchema>;
export type WorkLane = z.infer<typeof workItemsPageSchema>["lane"];
export function uniqueWorkItems(items: WorkItem[]) {
  const byId = new Map<string, WorkItem>();
  for (const item of items)
    if ((byId.get(item.id)?.version ?? 0) <= item.version)
      byId.set(item.id, item);
  return [...byId.values()];
}
export const workAttention = {
  Action: "Cần bạn xem",
  Waiting: "Đang chờ",
  Blocked: "Cần kiểm tra điều kiện",
} as const;
export const memberWorkLanes = [
  ["DirectOrders", "Mua / bán trực tiếp"],
  ["Exchanges", "Trao đổi"],
  ["Listings", "Bài đăng sách"],
  ["AuctionIntakes", "Sách gửi đấu giá"],
  ["AuctionOrders", "Đơn đấu giá"],
] as const;
export function workLanesFor(status: string) {
  return memberWorkLanes.filter(
    ([lane]) =>
      status !== "LOCKED" || (lane !== "Listings" && lane !== "AuctionIntakes"),
  );
}
export function workTarget(
  item: WorkItem,
  platform: "web" | "native" | "operations",
): string | undefined {
  const id = encodeURIComponent(item.targetId);
  if (platform === "operations") {
    if (item.target === "ListingReview") return `/review/listings/${id}`;
    if (item.target === "CatalogReview")
      return `/review/catalog-requests/${id}`;
    return undefined;
  }
  if (platform === "web") {
    switch (item.target) {
      case "DirectOrder":
        return `/orders/${id}`;
      case "Exchange":
        return `/exchange/${id}`;
      case "Listing":
        return `/my-books/${id}/edit`;
      case "AuctionIntake":
        return `/my-auctions?intakeId=${id}`;
      case "Auction":
        return `/auctions/${id}`;
      default:
        return undefined;
    }
  }
  switch (item.target) {
    case "DirectOrder":
      return `/orders?orderId=${id}`;
    case "Exchange":
      return `/exchange?id=${id}`;
    case "Listing":
      return `/drafts?listingId=${id}`;
    case "AuctionIntake":
      return `/send-to-auction?intakeId=${id}`;
    case "Auction":
      return `/auction?id=${id}`;
    default:
      return undefined;
  }
}
