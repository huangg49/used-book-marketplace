import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { ROUTES, formatVnd } from "../lib/routes";
import {
  getPublicPhoto,
  type PublicListing,
} from "../services/public-listings";
import styles from "./BookCard.module.css";

export interface BookCardProps {
  book: PublicListing;
  index: number;
}
const conditions = {
  LikeNew: "Gần như mới",
  Good: "Còn tốt",
  Fair: "Đã dùng nhiều",
  Worn: "Cũ nhiều",
};
export function BookCard({ book }: BookCardProps) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const photoId = book.photos[0]?.id;
  const photo = useQuery({
    queryKey: ["public-photo", book.id, book.revisionId, photoId],
    queryFn: () => getPublicPhoto(book.id, photoId!),
    enabled: !!photoId,
    staleTime: 0,
    retry: false,
  });
  const photoUrl = photo.data?.url;
  const imageError = photo.isError || (!!photoUrl && failedUrl === photoUrl);
  return (
    <article className={styles.card}>
      <Link
        to={ROUTES.bookDetail(book.id)}
        className={styles.coverWrapper}
        aria-label={`Xem ${book.book.title}`}
      >
        {photoUrl && !imageError ? (
          <img
            src={photoUrl}
            alt={`Bìa sách ${book.book.title}`}
            className={styles.coverImage}
            loading="lazy"
            onError={() => setFailedUrl(photoUrl)}
          />
        ) : (
          <div
            className={styles.coverFallback}
            style={{ display: "grid", placeItems: "center" }}
          >
            <BookOpen aria-hidden="true" />
            <span>
              {imageError
                ? "Chưa tải được ảnh"
                : photoId
                  ? "Đang tải ảnh…"
                  : "Chưa có ảnh bìa"}
            </span>
          </div>
        )}
        <span className={styles.conditionTagOver}>
          {conditions[book.condition]}
        </span>
      </Link>
      <div className={styles.meta}>
        <div className={styles.categoryText}>{book.book.category}</div>
        <h3 className={styles.title} title={book.book.title}>
          <Link to={ROUTES.bookDetail(book.id)}>{book.book.title}</Link>
        </h3>
        <p className={styles.author} title={book.book.authors.join(", ")}>
          {book.book.authors.join(", ")}
        </p>
        <div className={styles.divider} />
        <div
          className={styles.priceBlock}
          style={{
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "0.25rem",
          }}
        >
          {book.salePrice !== null && (
            <span className={styles.price}>
              Bán {formatVnd(book.salePrice)}
            </span>
          )}
          {book.exchangeValue !== null && (
            <span className={styles.priceExchange}>
              Đổi {formatVnd(book.exchangeValue)}
            </span>
          )}
        </div>
        <Link
          className={`${styles.actionBtn} ${styles.actionBtnSolid}`}
          style={{ marginTop: "0.75rem", textAlign: "center" }}
          to={ROUTES.bookDetail(book.id)}
        >
          Xem sách
        </Link>
      </div>
    </article>
  );
}
