import { listingTitle } from "../lib/book-bundle";
import { useState } from "react";
import { Link, useLocation, useViewTransitionState } from "react-router-dom";
import { BookOpen, ChevronRight, MapPin, UserRound } from "lucide-react";
import { WishlistButton } from "./WishlistButton";
import { CardFitText } from "./CardFitText";
import { ROUTES, formatVnd } from "../lib/routes";
import { type PublicListing } from "../services/public-listings";
import styles from "./BookCard.module.css";
import { conditions } from "../lib/listing-labels";
import { usePublicListingPhoto } from "../hooks/usePublicListingPhoto";
import { useNearViewport } from "../hooks/useNearViewport";
import "./BookTransition.css";

export function ListingPhoto({
  book,
  eager = false,
  photoIndex = 0,
  alt,
  fit,
}: {
  book: PublicListing;
  eager?: boolean;
  photoIndex?: number;
  alt?: string;
  fit?: "cover" | "contain";
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
  const isContain = fit === "contain" || (fit === undefined && photoIndex > 0);
  return (
    <div ref={ref} className={styles.photoFrame}>
      {url && !failed ? (
        <img
          src={url}
          alt={alt || "Bìa sách " + listingTitle(book)}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          onError={() => setFailedUrl(url)}
          className={`${styles.image} ${isContain ? styles.containImage : ""}`}
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
              aria-label={"Tải lại ảnh " + listingTitle(book)}
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
  const detailUrl = ROUTES.bookDetail(book.id);
  const isTransitioningTo = useViewTransitionState(detailUrl);
  const isReturningTo = location.state?.morphBookId === book.id;
  const isMorphActive = isTransitioningTo || isReturningTo;

  const returnState =
    location.pathname === ROUTES.search
      ? { catalogReturn: location.pathname + location.search, listing: book, morphBookId: book.id }
      : { listing: book, morphBookId: book.id };
  const title = listingTitle(book);
  const locationLabel = book.fulfillment?.locality?.label || book.fulfillment?.name || "Toàn quốc";
  const isSaleAndExchange = book.salePrice !== null && book.exchangeValue !== null;
  const isSaleOnly = book.salePrice !== null && book.exchangeValue === null;
  const isExchangeOnly = book.salePrice === null && book.exchangeValue !== null;

  return (
    <article
      className={[styles.card, compact ? styles.compact : ""].join(" ")}
      data-book-morph-card={isMorphActive ? "true" : undefined}
    >
      <div className={styles.cover} data-book-cover="true">
        <ListingPhoto book={book} />
        <Link
          to={detailUrl}
          viewTransition
          state={returnState}
          className={styles.coverLink}
          aria-label={"Xem chi tiết " + title}
        />
        <WishlistButton listingId={book.id} title={title} />
        <span className={styles.condition}>
          <BookOpen size={15} aria-hidden="true" />
          {book.bundle ? `Bộ ${book.bundle.items.length} cuốn` : conditions[book.condition]} ·{" "}
          {book.mode === "Sale"
            ? book.bundle ? "Bán nguyên bộ" : "Bán"
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
        <h3 className={styles.titleWrap}>
          <Link
            to={detailUrl}
            viewTransition
            state={returnState}
            title={title}
            className={styles.titleLink}
          >
            {title}
          </Link>
          {title.length > 28 && (
            <span className={styles.titleTooltip} role="tooltip" aria-hidden="true">
              {title}
            </span>
          )}
        </h3>
        <div className={styles.information}>
          <p className={styles.seller} title={"Người đăng: " + book.seller.displayName}>
            <UserRound size={13} aria-hidden="true" />
            <span className="sr-only">Người đăng: </span>
            <span className={styles.ellipsis}>{book.seller.displayName}</span>
          </p>
          <p className={styles.location} title={"Khu vực: " + locationLabel}>
            <MapPin size={13} aria-hidden="true" />
            <span className="sr-only">Khu vực: </span>
            <strong className={`${styles.region} ${styles.ellipsis}`}>
              {locationLabel}
            </strong>
          </p>
        </div>
        <div className={styles.footerRow}>
          <div className={styles.prices}>
            <div className={styles.primaryRow}>
              <span className={styles.priceLabel}>
                {book.salePrice !== null
                  ? book.bundle
                    ? "Giá cả bộ"
                    : "Giá bán"
                  : "Giá trị đổi"}
              </span>
              <strong className={styles.amount}>
                <CardFitText>
                  {book.salePrice !== null
                    ? formatVnd(book.salePrice)
                    : book.exchangeValue !== null
                      ? formatVnd(book.exchangeValue)
                      : "Thỏa thuận"}
                </CardFitText>
              </strong>
            </div>
            <div className={styles.secondaryRow}>
              {isSaleAndExchange ? (
                <span
                  className={styles.exchangeNote}
                  title={`Có thể trao đổi sách giá trị tương đương ${formatVnd(book.exchangeValue!)}`}
                >
                  Hoặc đổi ~{formatVnd(book.exchangeValue!)}
                </span>
              ) : isSaleOnly ? (
                <span className={styles.modeNote}>
                  {book.bundle ? "Bán nguyên bộ" : "Chỉ bán trực tiếp"}
                </span>
              ) : isExchangeOnly ? (
                <span className={styles.modeNote}>Chỉ nhận trao đổi</span>
              ) : (
                <span className={styles.modeNote}>Thỏa thuận trực tiếp</span>
              )}
            </div>
          </div>
          <Link
            className={styles.view}
            to={ROUTES.bookDetail(book.id)}
            state={returnState}
            aria-label={"Xem chi tiết " + title}
          >
            <span>Xem sách</span>
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
