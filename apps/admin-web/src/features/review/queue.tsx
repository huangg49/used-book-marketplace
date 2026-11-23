import { useOutletContext, useParams } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { canReview, canReviewCatalog } from "../../core/session";
import { ListingQueueView } from "./ListingQueueView";
import { CatalogQueueView } from "./CatalogQueueView";

export function Queue() {
  const { kind = "listings" } = useParams();
  const user = useOutletContext<CurrentUser>();
  if (
    (kind !== "listings" && kind !== "catalog-requests") ||
    (kind === "catalog-requests" && !canReviewCatalog(user)) ||
    (kind === "listings" && !canReview(user))
  )
    return <p>Không có quyền xem khu vực này.</p>;
  if (kind === "listings") return <ListingQueueView user={user} />;
  return <CatalogQueueView user={user} />;
}
