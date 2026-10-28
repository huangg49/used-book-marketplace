import { useQuery } from "@tanstack/react-query";
import { session } from "../../core/session";
import { book, catalog, type Listing } from "./contracts";

export function ListingTitle({ value }: { value: Listing }) {
  const isConfirmed = value.catalogStatus === "Confirmed";
  const bookId = value.currentRevision.content.bookId;
  const result = useQuery({
    queryKey: ["book-title", isConfirmed, bookId],
    enabled:
      !value.currentRevision.content.bundle &&
      !!bookId,
    queryFn: () =>
      isConfirmed
        ? session.request(`/catalog/books/${bookId}`, book)
        : session
            .request(`/operations/catalog-requests/${bookId}`, catalog)
            .then((request) => ({ title: request.currentRevision.metadata.title })),
    staleTime: Infinity,
  });
  return (
    <>
      {value.currentRevision.content.bundle?.title ||
        result.data?.title ||
        (value.catalogStatus === "Confirmed"
          ? "Bài đăng sách"
          : "Sách chờ xác nhận đầu sách")}{" "}
      <span className="short-id">/ {value.id.slice(0, 8)}</span>
    </>
  );
}
