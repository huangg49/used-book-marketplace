import { useQuery } from "@tanstack/react-query";
import { session } from "../../core/session";
import { book, catalog, type Listing } from "./contracts";

export function ListingTitle({
  value,
  showAuthor = false,
  canReadPendingCatalog = false,
}: {
  value: Listing;
  showAuthor?: boolean;
  canReadPendingCatalog?: boolean;
}) {
  const isConfirmed = value.catalogStatus === "Confirmed";
  const bookId = value.currentRevision.content.bookId;
  const permitted = isConfirmed || canReadPendingCatalog;
  const result = useQuery({
    queryKey: ["book-title", isConfirmed, bookId, permitted],
    enabled: permitted && !value.currentRevision.content.bundle && !!bookId,
    queryFn: () =>
      isConfirmed
        ? session.request(`/catalog/books/${bookId}`, book)
        : session
            .request(`/operations/catalog-requests/${bookId}`, catalog)
            .then((request) => request.currentRevision.metadata),
    staleTime: Infinity,
  });
  const metadata = permitted ? result.data : undefined;
  return (
    <>
      {value.currentRevision.content.bundle?.title ||
        metadata?.title ||
        (value.catalogStatus === "Confirmed"
          ? "Bài đăng sách"
          : "Sách chờ xác nhận đầu sách")}{" "}
      <span className="short-id">/ {value.id.slice(0, 8)}</span>
      {showAuthor &&
      metadata?.authors?.length &&
      !value.currentRevision.content.bundle ? (
        <span className="listing-authors">
          {metadata.authors.join(" · ")}
        </span>
      ) : null}
    </>
  );
}
