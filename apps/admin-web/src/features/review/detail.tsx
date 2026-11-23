import { useOutletContext, useParams } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { canReview, canReviewCatalog } from "../../core/session";
import { ListingFocusDetail } from "./ListingFocusDetail";
import { CatalogDrawerDetail } from "./CatalogDrawerDetail";

export function Detail() {
  const { kind, id } = useParams();
  const user = useOutletContext<CurrentUser>();
  if (
    !id ||
    !/^[a-f0-9-]{36}$/.test(id) ||
    (kind !== "listings" && kind !== "catalog-requests") ||
    (kind === "catalog-requests" && !canReviewCatalog(user)) ||
    (kind === "listings" && !canReview(user))
  )
    return <p>Hồ sơ không hợp lệ hoặc bạn không có quyền xem.</p>;
  if (kind === "listings") return <ListingFocusDetail key={id} id={id} user={user} />;
  return <CatalogDrawerDetail key={id} id={id} user={user} />;
}
