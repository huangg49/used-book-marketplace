import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, ArrowUpRight } from "lucide-react";
import { useSession } from "../hooks/useSession";
import {
  getMyPhoto,
  getMyBookIdentity,
  type MyListing,
} from "../services/my-listings";
import { conditions } from "../lib/listing-labels";
import { formatVnd } from "../lib/routes";
import {
  moderationLabels,
  visibilityLabels,
  tradeLabels,
  isPublicOwnerListing,
} from "../lib/owner-listing-labels";
import styles from "../pages/MyBooksPage.module.css";

function OwnerPhoto({ item, title }: { item: MyListing; title: string }) {
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
    <div className={styles.cover}>
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
}: {
  item: MyListing;
  compact?: boolean;
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
  return (
    <li className={`${styles.row} ${compact ? styles.compact : ""}`}>
      <OwnerPhoto item={item} title={title} />
      <div className={styles.bookInfo}>
        <p className={styles.status}>
          <strong>{moderationLabels[item.state.moderation]}</strong>
          <span>
            {item.state.visibility === "Visible" &&
            item.state.moderation !== "Approved"
              ? "Chưa công khai"
              : visibilityLabels[item.state.visibility]}
          </span>
          <span>{tradeLabels[item.state.trade]}</span>
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
          <p>
            <span>Giá bán</span>
            <strong>{formatVnd(content.salePrice)}</strong>
          </p>
        )}
        {content.exchangeValue != null && (
          <p>
            <span>Giá trị đổi</span>
            <strong>{formatVnd(content.exchangeValue)}</strong>
          </p>
        )}
        {publicVisible && (
          <Link
            className={styles.detail}
            to={`/books/${item.id}`}
            aria-label={`Xem bài đăng ${title}`}
          >
            Xem bài đăng <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
    </li>
  );
}
