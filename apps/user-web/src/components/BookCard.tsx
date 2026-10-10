import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, ArrowUpRight } from "lucide-react";
import { ROUTES, formatVnd } from "../lib/routes";
import {
  getPublicPhoto,
  type PublicListing,
} from "../services/public-listings";
import styles from "./BookCard.module.css";
import { conditions } from "../lib/listing-labels";

export function ListingPhoto({
  book,
  eager = false,
  photoIndex = 0,
}: {
  book: PublicListing;
  eager?: boolean;
  photoIndex?: number;
}) {
  const photoId = book.photos[photoIndex]?.id;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo = useQuery({
    queryKey: ["public-listing-photo", book.id, book.revisionId, photoId],
    queryFn: () => getPublicPhoto(book.id, photoId!),
    enabled: !!photoId,
    staleTime: 0,
    retry: false,
  });
  const url = photo.data?.url;
  const failed = photo.isError || (!!url && failedUrl === url);
  if (url && !failed)
    return (
      <img
        src={url}
        alt={"Bìa sách " + book.book.title}
        loading={eager ? "eager" : "lazy"}
        onError={() => setFailedUrl(url)}
        className={styles.image}
      />
    );
  return (
    <div className={styles.fallback}>
      <BookOpen size={30} aria-hidden="true" />
      <span>
        {failed
          ? "Chưa tải được ảnh"
          : photoId
            ? "Đang tải ảnh…"
            : "Chưa có ảnh bìa"}
      </span>
      {failed && (
        <button
          type="button"
          disabled={photo.isFetching}
          onClick={() => {
            setFailedUrl(null);
            void photo.refetch();
          }}
          aria-label={"Tải lại ảnh " + book.book.title}
        >
          Tải lại ảnh
        </button>
      )}
    </div>
  );
}
export interface BookCardProps {
  book: PublicListing;
  index: number;
}
export function BookCard({ book, index }: BookCardProps) {
  return (
    <article className={styles.card}>
      <div className={[styles.cover, styles["ground" + (index % 4)]].join(" ")}>
        <ListingPhoto book={book} />
        <Link
          to={ROUTES.bookDetail(book.id)}
          className={styles.coverLink}
          aria-label={"Xem chi tiết " + book.book.title}
        />
        {book.purchaseAvailability.status === "InNegotiation" && (
          <span className={styles.held}>Đang giao dịch</span>
        )}
      </div>
      <div className={styles.meta}>
        <p className={styles.condition}>
          {conditions[book.condition]} ·{" "}
          {book.mode === "Sale"
            ? "Bán"
            : book.mode === "Exchange"
              ? "Đổi"
              : "Bán hoặc đổi"}
        </p>
        <h3>
          <Link to={ROUTES.bookDetail(book.id)}>{book.book.title}</Link>
        </h3>
        <p className={styles.author}>
          {book.book.authors.join(", ") || "Chưa rõ tác giả"}
        </p>
        <div className={styles.prices}>
          {book.salePrice !== null && (
            <p>
              <span>Giá bán</span>
              <strong>{formatVnd(book.salePrice)}</strong>
            </p>
          )}
          {book.exchangeValue !== null && (
            <p>
              <span>Giá trị đổi</span>
              <strong>{formatVnd(book.exchangeValue)}</strong>
            </p>
          )}
        </div>
        <Link className={styles.view} to={ROUTES.bookDetail(book.id)}>
          Xem sách <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
