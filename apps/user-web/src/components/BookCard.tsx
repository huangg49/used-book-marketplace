import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, ChevronRight, MapPin, Tag, UserRound } from "lucide-react";
import { WishlistButton } from "./WishlistButton";
import { CardFitText } from "./CardFitText";
import { ROUTES, formatVnd } from "../lib/routes";
import { type PublicListing } from "../services/public-listings";
import styles from "./BookCard.module.css";
import { conditions } from "../lib/listing-labels";
import { usePublicListingPhoto } from "../hooks/usePublicListingPhoto";
import { useNearViewport } from "../hooks/useNearViewport";

export function ListingPhoto({
  book,
  eager = false,
  photoIndex = 0,
  alt,
}: {
  book: PublicListing;
  eager?: boolean;
  photoIndex?: number;
  alt?: string;
}) {
  const photoId = book.photos[photoIndex]?.id;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { ref, active } = useNearViewport(eager);
  const photo = usePublicListingPhoto(
    book.id,
    book.revisionId,
    photoId,
    active,
  );
  const url = photo.url;
  const failed = photo.isError || (!!url && failedUrl === url);
  return (
    <div ref={ref} className={styles.photoFrame}>
      {url && !failed ? (
        <img
          src={url}
          alt={alt || "Bìa sách " + book.book.title}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          onError={() => setFailedUrl(url)}
          className={styles.image}
        />
      ) : (
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
      )}
    </div>
  );
}
export interface BookCardProps {
  book: PublicListing;
  index: number;
  compact?: boolean;
}
export function BookCard({ book, compact = false }: BookCardProps) {
  const location = useLocation();
  const returnState =
    location.pathname === ROUTES.search
      ? { catalogReturn: location.pathname + location.search }
      : undefined;
  return (
    <article className={[styles.card, compact ? styles.compact : ""].join(" ")}>
      <div className={styles.cover}>
        <ListingPhoto book={book} />
        <Link
          to={ROUTES.bookDetail(book.id)}
          state={returnState}
          className={styles.coverLink}
          aria-label={"Xem chi tiết " + book.book.title}
        />
        <WishlistButton listingId={book.id} title={book.book.title} />
        <span className={styles.condition}>
          <BookOpen size={15} aria-hidden="true" />
          {conditions[book.condition]} ·{" "}
          {book.mode === "Sale"
            ? "Bán"
            : book.mode === "Exchange"
              ? "Đổi"
              : "Bán hoặc đổi"}
        </span>
        {book.purchaseAvailability.status !== "Available" && (
          <span className={styles.held}>
            {book.purchaseAvailability.status === "AwaitingPayment"
              ? "Chờ thanh toán"
              : book.purchaseAvailability.status === "InTransaction"
                ? "Đang giao dịch"
                : "Đang giữ sách"}
          </span>
        )}
      </div>
      <div className={styles.meta}>
        <h3>
          <Link
            to={ROUTES.bookDetail(book.id)}
            state={returnState}
            title={book.book.title}
          >
            <CardFitText>{book.book.title}</CardFitText>
          </Link>
        </h3>
        <div className={styles.information}>
          <p className={styles.author}>
            <UserRound size={18} aria-hidden="true" />
            <span className="sr-only">Tác giả: </span>
            <CardFitText minimumRem={0.6875}>
              {book.book.authors.join(", ") || "Chưa rõ tác giả"}
            </CardFitText>
          </p>
          <p className={styles.location}>
            <MapPin size={18} aria-hidden="true" />
            <span className="sr-only">Khu vực: </span>
            <strong className={styles.region}>
              <CardFitText minimumRem={0.6875}>
                {book.fulfillment?.locality?.label || "Chưa có khu vực"}
              </CardFitText>
            </strong>
          </p>
        </div>
        <div className={styles.prices}>
          {book.salePrice !== null && (
            <p>
              <Tag size={24} aria-hidden="true" />
              <span>
                <span className={styles.fieldLabel}>Giá bán</span>
                <strong className={styles.amount}>
                  <CardFitText>{formatVnd(book.salePrice)}</CardFitText>
                </strong>
              </span>
            </p>
          )}
          {book.exchangeValue !== null && (
            <p>
              <Tag size={24} aria-hidden="true" />
              <span>
                <span className={styles.fieldLabel}>Giá trị đổi</span>
                <strong className={styles.amount}>
                  <CardFitText>{formatVnd(book.exchangeValue)}</CardFitText>
                </strong>
              </span>
            </p>
          )}
        </div>
        <Link
          className={styles.view}
          to={ROUTES.bookDetail(book.id)}
          state={returnState}
        >
          <BookOpen size={18} aria-hidden="true" /> Xem sách{" "}
          <ChevronRight size={19} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
