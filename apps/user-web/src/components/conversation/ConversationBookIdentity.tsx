import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { getPublicListing } from "../../services/public-listings";
import { ListingPhoto } from "../BookCard";
import styles from "../../pages/ChatPage.module.css";

export function ConversationBookIdentity({
  listingId,
  status,
  title,
}: {
  listingId?: string;
  status: ReactNode;
  title?: string;
}) {
  const book = useQuery({
    queryKey: ["public-listing", listingId],
    queryFn: () => getPublicListing(listingId!),
    enabled: !!listingId,
  });
  return (
    <>
      <div className={styles.cover} data-conversation-cover>
        {book.data ? (
          <ListingPhoto book={book.data} eager />
        ) : (
          <BookOpen size={32} aria-hidden="true" />
        )}
      </div>
      <div className={styles.bookHeading}>
        <h1 data-conversation-title>
          {listingId ? (
            <Link to={`/books/${listingId}`}>
              {title ?? book.data?.book.title ??
                (book.isLoading
                  ? "Đang tải cuốn sách…"
                  : "Cuộc trao đổi về sách")}
            </Link>
          ) : (
            "Đang mở hội thoại…"
          )}
        </h1>
        <p className={styles.bookAuthor}>
          {book.data
            ? book.data.book.authors.join(", ")
            : book.isError
              ? "Thông tin bài đăng hiện không khả dụng. Bạn vẫn có thể đọc hội thoại."
              : "Đang tải thông tin sách…"}
        </p>
        <p className={styles.roomStatus}>{status}</p>
      </div>
    </>
  );
}
