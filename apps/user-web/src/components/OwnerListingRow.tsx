import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, ArrowUpRight, Gavel, Edit } from "lucide-react";
import { useSession } from "../hooks/useSession";
import {
  getMyPhoto,
  getMyBookIdentity,
  type MyListing,
} from "../services/my-listings";
import { conditions } from "../lib/listing-labels";
import { formatVnd, ROUTES } from "../lib/routes";
import {
  moderationLabels,
  visibilityLabels,
  tradeLabels,
  isPublicOwnerListing,
  auctionEligible,
} from "../lib/owner-listing-labels";
import styles from "../pages/MyBooksPage.module.css";

function OwnerPhoto({
  item,
  title,
  fill = false,
}: {
  item: MyListing;
  title: string;
  fill?: boolean;
}) {
  const auth = useSession();
  const ownerId = auth.status === "authenticated" ? auth.user.id : undefined;
  const mediaId = item.currentRevision.content.mediaIds?.[0];
  const [failedUrl, setFailedUrl] = useState<string>();
  const query = useQuery({
    queryKey: ["my-photo", ownerId, item.id, item.currentRevision.id, mediaId],
    queryFn: () => getMyPhoto(item.id, mediaId!),
    enabled: !!ownerId && !!mediaId,
  });
  const url = query.data?.url;
  const failed = query.isError || (!!url && url === failedUrl);
  return (
    <div className={fill ? styles.fillCover : styles.cover}>
      {url && !failed ? (
        <img
          src={url}
          alt={`Ảnh bản sách ${title}`}
          loading="lazy"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <div className={styles.photoState}>
          <BookOpen size={24} aria-hidden="true" />
          <span>
            {failed
              ? "Chưa tải được ảnh"
              : mediaId
                ? "Đang tải ảnh…"
                : "Chưa có ảnh"}
          </span>
          {failed && (
            <button
              type="button"
              disabled={query.isFetching}
              onClick={() => {
                setFailedUrl(undefined);
                void query.refetch();
              }}
            >
              Tải lại ảnh
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function OwnerListingRow({
  item,
  compact = false,
  layout = "list",
}: {
  item: MyListing;
  compact?: boolean;
  layout?: "list" | "grid";
}) {
  const auth = useSession();
  const ownerId = auth.status === "authenticated" ? auth.user.id : undefined;
  const content = item.currentRevision.content;
  const bookId = content.bookId || item.currentRevision.bookId;
  const identity = useQuery({
    queryKey: ["my-book-identity", ownerId, bookId, item.catalogStatus],
    queryFn: () => getMyBookIdentity(bookId!, item.catalogStatus),
    enabled: !!ownerId && !!bookId,
  });
  const title =
    identity.data?.title ||
    content.title ||
    (identity.isLoading ? "Đang tải tên sách…" : "Chưa có thông tin tên sách");
  const author = identity.data?.authors.join(", ") || content.author;
  const publicVisible = isPublicOwnerListing(item);
  const updated =
    item.updatedAt && !Number.isNaN(Date.parse(item.updatedAt))
      ? new Intl.DateTimeFormat("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(new Date(item.updatedAt))
      : undefined;

  // Grid layout rendering
  if (layout === "grid") {
    return (
      <li className={styles.gridCard}>
        <div className={styles.gridCoverWrap}>
          <OwnerPhoto item={item} title={title} fill />
          <span className={styles.gridModBadge}>
            {moderationLabels[item.state.moderation]}
          </span>
          {content.condition && (
            <span className={styles.gridConditionBadge}>
              {conditions[content.condition] || content.condition}
            </span>
          )}
        </div>

        <div className={styles.gridBody}>
          <div>
            {author && <p className={styles.gridAuthor}>{author}</p>}
            <h3 className={styles.gridTitle}>
              {publicVisible ? (
                <Link to={`/books/${item.id}`}>{title}</Link>
              ) : (
                title
              )}
            </h3>
          </div>

          <div className={styles.gridPricesContainer}>
            {content.salePrice != null ? (
              <div className={styles.gridSaleCard}>
                <span className={styles.gridPriceLabel}>Giá bán</span>
                <strong className={styles.gridSaleVal}>
                  {formatVnd(content.salePrice)}
                </strong>
              </div>
            ) : content.mode === "Sale" || content.mode === "Both" ? (
              <div className={styles.gridSaleCard}>
                <span className={styles.gridPriceLabel}>Giá bán</span>
                <strong className={styles.gridSaleVal}>Thỏa thuận</strong>
              </div>
            ) : null}

            {content.exchangeValue != null ? (
              <div className={styles.gridExchangeCard}>
                <span className={styles.gridExchangeLabel}>Giá trị đổi</span>
                <strong className={styles.gridExchangeVal}>
                  {formatVnd(content.exchangeValue)}
                </strong>
              </div>
            ) : content.mode === "Exchange" ? (
              <div className={styles.gridExchangeCard}>
                <span className={styles.gridExchangeLabel}>Giá trị đổi</span>
                <strong className={styles.gridExchangeVal}>Giao lưu</strong>
              </div>
            ) : null}
          </div>

          <div className={styles.gridActions}>
            {publicVisible ? (
              <Link
                className={styles.detail}
                to={`/books/${item.id}`}
                aria-label={`Xem bài đăng ${title}`}
              >
                Xem bài đăng <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            ) : (
              <Link
                className={styles.gridEditBtn}
                to={`${ROUTES.myBooks}?edit=${item.id}`}
              >
                <Edit size={13} style={{ marginRight: 4 }} /> Chỉnh sửa
              </Link>
            )}
            {auctionEligible(item) && (
              <Link
                className={styles.auction}
                to={ROUTES.auctionCreate(item.id)}
                aria-label={`Đưa ${title} lên đấu giá`}
              >
                <Gavel size={14} aria-hidden="true" /> Đưa lên đấu giá
              </Link>
            )}
          </div>
        </div>
      </li>
    );
  }

  // Redesigned horizontal list row layout
  return (
    <li className={`${styles.row} ${compact ? styles.compact : ""}`}>
      <OwnerPhoto item={item} title={title} />
      <div className={styles.bookInfo}>
        <p className={styles.status}>
          <strong className={styles.modBadge}>
            {moderationLabels[item.state.moderation]}
          </strong>
          <span className={styles.visBadge}>
            {item.state.visibility === "Visible" &&
            item.state.moderation !== "Approved"
              ? "Chưa công khai"
              : visibilityLabels[item.state.visibility]}
          </span>
          <span className={styles.tradeBadge}>
            {tradeLabels[item.state.trade]}
          </span>
        </p>
        <h3>
          {publicVisible ? (
            <Link to={`/books/${item.id}`}>{title}</Link>
          ) : (
            title
          )}
        </h3>
        {author && <p className={styles.author}>{author}</p>}
        {identity.isError && (
          <p className={styles.identityError}>
            Chưa tải được thông tin sách.{" "}
            <button
              type="button"
              disabled={identity.isFetching}
              onClick={() => void identity.refetch()}
            >
              Thử lại
            </button>
          </p>
        )}
        {!compact && (
          <p className={styles.condition}>
            {content.condition
              ? conditions[content.condition]
              : "Chưa khai báo tình trạng"}{" "}
            ·{" "}
            {content.mode === "Sale"
              ? "Bán"
              : content.mode === "Exchange"
                ? "Đổi"
                : content.mode === "Both"
                  ? "Bán hoặc đổi"
                  : "Chưa chọn hình thức"}
          </p>
        )}
        {item.state.moderation === "Rejected" &&
          item.latestDecision?.reason && (
            <p className={styles.reason}>
              Lý do từ chối: {item.latestDecision.reason}
            </p>
          )}
        {item.state.visibility === "Removed" && item.removalReason && (
          <p className={styles.reason}>Lý do gỡ: {item.removalReason}</p>
        )}
        {!compact && item.state.moderation === "PendingReview" && (
          <p className={styles.note}>
            Bài đang chờ duyệt, chưa hiển thị công khai.
          </p>
        )}
        {!compact && updated && (
          <p className={styles.updated}>Cập nhật {updated}</p>
        )}
      </div>

      <div className={styles.prices}>
        {content.salePrice != null && (
          <div className={styles.priceSaleBlock}>
            <span className={styles.priceLabel}>Giá bán</span>
            <strong className={styles.priceMain}>
              {formatVnd(content.salePrice)}
            </strong>
          </div>
        )}
        {content.exchangeValue != null && (
          <div className={styles.exchangeVal}>
            <span>Đổi:</span>
            <strong>{formatVnd(content.exchangeValue)}</strong>
          </div>
        )}
        {publicVisible && (
          <Link
            className={styles.detail}
            to={`/books/${item.id}`}
            aria-label={`Xem bài đăng ${title}`}
          >
            Xem bài đăng <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        )}
        {!compact && auctionEligible(item) && (
          <Link
            className={styles.auction}
            to={ROUTES.auctionCreate(item.id)}
            aria-label={`Đưa ${title} lên đấu giá`}
          >
            <Gavel size={14} aria-hidden="true" /> Đưa lên đấu giá
          </Link>
        )}
      </div>
    </li>
  );
}
