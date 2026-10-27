import { useQuery } from "@tanstack/react-query";
import { session } from "../../core/session";
import { book, type Listing } from "./contracts";

export function ListingTitle({ value }: { value: Listing }) {
  const result = useQuery({
    queryKey: ["book-title", value.currentRevision.content.bookId],
    enabled:
      !value.currentRevision.content.bundle &&
      value.catalogStatus === "Confirmed" &&
      !!value.currentRevision.content.bookId,
    queryFn: () =>
      session.request(
        `/catalog/books/${value.currentRevision.content.bookId}`,
        book,
      ),
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
