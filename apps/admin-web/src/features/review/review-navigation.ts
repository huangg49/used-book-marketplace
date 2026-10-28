import {
  catalog,
  listing,
  pageOf,
  type Catalog,
  type Kind,
  type Listing,
} from "./contracts";
import type { Request } from "../../core/command";

export type ReviewQueuePage = {
  items: (Listing | Catalog)[];
  nextCursor: string | null;
  serverTime: string;
};
export async function loadNextReviewPage(
  kind: Kind,
  request: Request,
): Promise<ReviewQueuePage> {
  return kind === "listings"
    ? request(
        "/operations/listings?moderation=PendingReview&limit=20",
        pageOf(listing),
      )
    : request(
        "/operations/catalog-requests?status=Pending&limit=20",
        pageOf(catalog),
      );
}

export function reviewQueuePath(kind: Kind, status?: string) {
  const allowed =
    kind === "listings"
      ? ["PendingReview", "Approved", "Rejected"]
      : ["Pending", "Confirmed", "Rejected"];
  return `/review/${kind}${status && allowed.includes(status) ? `?status=${status}` : ""}`;
}
export function reviewReturnPath(kind: Kind, state: unknown) {
  if (
    !state ||
    typeof state !== "object" ||
    !("reviewReturnTo" in state) ||
    typeof state.reviewReturnTo !== "string"
  )
    return reviewQueuePath(kind);
  const [path, query = ""] = state.reviewReturnTo.split("?");
  if (path !== `/review/${kind}`) return reviewQueuePath(kind);
  return reviewQueuePath(
    kind,
    new URLSearchParams(query).get("status") ?? undefined,
  );
}
export function pendingReviewPath(kind: Kind) {
  return reviewQueuePath(
    kind,
    kind === "listings" ? "PendingReview" : "Pending",
  );
}
export function selectNextReview(
  items: (Listing | Catalog)[],
  currentId: string,
  reviewerId: string,
) {
  const returned = items.find((item) => item.id === currentId);
  if (returned) return { kind: "returned" as const, item: returned };
  const next = items.find(
    (item) =>
      ("ownerId" in item ? item.ownerId : item.requesterId) !== reviewerId,
  );
  return next
    ? { kind: "next" as const, item: next }
    : { kind: "empty" as const };
}
