import { listingTitle } from "../lib/book-bundle";
import { useState } from "react";
import { Link, useLocation, useViewTransitionState } from "react-router-dom";
import { BookOpen, ChevronRight, MapPin } from "lucide-react";
import { categoryFor, languageLabel } from "@used-books/api-contract/catalog-taxonomy";
import { WishlistButton } from "./WishlistButton";
import { CardFitText } from "./CardFitText";
import { ROUTES, formatVnd } from "../lib/routes";
import { type PublicListing } from "../services/public-listings";
import styles from "./BookCard.module.css";
import { conditions } from "../lib/listing-labels";
import { usePublicListingPhoto } from "../hooks/usePublicListingPhoto";
import { useNearViewport } from "../hooks/useNearViewport";
import { BookCover } from "./BookCover";
import { prefetchBookDetail } from "../lib/book-detail-prefetch";
import "./BookTransition.css";

/**
 * Members cannot read each other's profile photos (the avatar read is
 * owner/staff only), so the seller avatar is the name's initial on a colour
 * picked from the member id, matching the partner chip in conversations.
 */
export function SellerAvatar({ id, name }: { id: string; name: string }) {
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase("vi-VN") || "?";
  const hue = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5;
  return (
    <span className={styles.sellerAvatar} data-hue={hue} aria-hidden="true">
      {initial}
    </span>
  );
}

export function ListingPhoto({
  book,
  eager = false,
  photoIndex = 0,
  alt,
  fit,
  fallbackCover = false,
}: {
  book: PublicListing;
  eager?: boolean;
  photoIndex?: number;
  alt?: string;
  fit?: "cover" | "contain";
  fallbackCover?: boolean;
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

  if (fallbackCover && (failed || (!photoId && !url))) {
    return (
      <div ref={ref} className={styles.photoFrame} style={{ width: "100%", height: "100%" }}>
        <BookCover
          title={book.bundle?.title || book.book.title}
          index={0}
          className={`${styles.image} ${isContain ? styles.containImage : ""}`}
        />
      </div>
    );
  }

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
  const authors = book.book.authors.filter(Boolean).join(", ");
  // Some listings store the taxonomy id ("history.geography"); show its label.
  const category =
    categoryFor(book.book.categoryId || book.book.category)?.label ||
    book.book.category;
  const detail = [category, languageLabel(book.book.language)]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={[styles.card, compact ? styles.compact : ""].join(" ")}
      data-book-morph-card={isMorphActive ? "true" : undefined}
      onPointerEnter={event => {
        if (event.pointerType === "mouse") prefetchBookDetail();
      }}
      onFocusCapture={event => {
        if (event.target instanceof HTMLAnchorElement &&
          event.target.getAttribute("href") === detailUrl &&
          event.target.matches(":focus-visible")) prefetchBookDetail();
      }}
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
        {/* Title, author and category share one fixed slot: a one-line title
            lets the extra detail line show instead of leaving a blank gap. */}
        <div className={styles.headline}>
          <div className={styles.headlineText}>
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
            </h3>
            {authors && (
              <p className={styles.byline} title={authors}>
                <span className="sr-only">Tác giả: </span>
                {authors}
              </p>
            )}
            {detail && (
              <p className={styles.detailLine} title={detail}>
                {detail}
              </p>
            )}
          </div>
          {title.length > 28 && (
            <span className={styles.titleTooltip} role="tooltip" aria-hidden="true">
              {title}
            </span>
          )}
        </div>
        <div className={styles.information}>
          <p className={styles.seller} title={"Người đăng: " + book.seller.displayName}>
            <SellerAvatar id={book.seller.id} name={book.seller.displayName} />
            <span className="sr-only">Người đăng: </span>
            <span className={`${styles.sellerName} ${styles.ellipsis}`}>
              {book.seller.displayName}
            </span>
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
