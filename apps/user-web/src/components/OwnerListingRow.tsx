import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, ArrowUpRight, Gavel, Edit, Eye, EyeOff, Trash2 } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
import { useSession } from "../hooks/useSession";
import { useActionCooldown } from "../hooks/useActionCooldown";
import {
  getMyPhoto,
  getMyBookIdentity,
  setListingVisibility,
  archiveListing,
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
import {
  canEditApproved,
  shouldExplainEditBlock,
  editApprovedBlock,
  canToggleVisibility,
  canArchiveListing,
} from "../lib/owner-listing-edit";
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

  const queryClient = useQueryClient();
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [confirmHideOpen, setConfirmHideOpen] = useState(false);

  const {
    cooldown: hideCooldown,
    isCoolingDown: isHideCoolingDown,
    startCooldown: startHideCooldown,
  } = useActionCooldown(4);

  const canToggle = canToggleVisibility(item);
  const canArchive = canArchiveListing(item);
  const isHidden = item.state.visibility === "Hidden";

  async function handleToggleVisibility(to: "Visible" | "Hidden") {
    if (isBusy || isHideCoolingDown) return;
    setIsBusy(true);
    setActionError(undefined);
    try {
      await setListingVisibility(item.id, item.version, to);
      setConfirmHideOpen(false);
      startHideCooldown();
      void queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      void queryClient.invalidateQueries({ queryKey: ["my-listing"] });
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
    } catch (error) {
      const status = (error as { status?: number }).status;
      setActionError(
        status === 409
          ? "Bài đăng vừa thay đổi trạng thái. Đang làm mới dữ liệu..."
          : error instanceof Error
            ? error.message
            : "Chưa cập nhật được trạng thái.",
      );
      void queryClient.invalidateQueries({ queryKey: ["my-listings"] });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleArchive() {
    setIsBusy(true);
    setActionError(undefined);
    try {
      await archiveListing(item.id, item.version);
      setConfirmArchiveOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      void queryClient.invalidateQueries({ queryKey: ["my-listing"] });
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
    } catch (error) {
      const status = (error as { status?: number }).status;
      setActionError(
        status === 409
          ? "Bài đăng vừa thay đổi hoặc đang có giao dịch phát sinh."
          : error instanceof Error
            ? error.message
            : "Chưa xóa được bài đăng.",
      );
      void queryClient.invalidateQueries({ queryKey: ["my-listings"] });
    } finally {
      setIsBusy(false);
    }
  }

  const dialogs = (
    <>
      <ConfirmDialog
        isOpen={confirmHideOpen}
        onClose={() => !isBusy && setConfirmHideOpen(false)}
        title="Tạm ẩn bài đăng?"
        description={`Bạn có muốn tạm ẩn cuốn "${title}" khỏi kệ sách công khai? Bạn có thể bấm "Hiện lại" bất cứ lúc nào mà không cần duyệt lại.`}
        confirmText={isBusy ? "Đang xử lý…" : "Tạm ẩn bài"}
        cancelText="Hủy"
        isBusy={isBusy}
        onConfirm={() => void handleToggleVisibility("Hidden")}
      />
      <ConfirmDialog
        isOpen={confirmArchiveOpen}
        onClose={() => !isBusy && setConfirmArchiveOpen(false)}
        title="Gỡ bài đăng khỏi kệ sách?"
        description={`Cuốn "${title}" sẽ bị gỡ vĩnh viễn khỏi kệ sách của bạn và không thể khôi phục. Các báo giá hoặc cuộc trò chuyện đang mở sẽ hết hiệu lực.`}
        confirmText={isBusy ? "Đang xóa…" : "Xóa vĩnh viễn"}
        cancelText="Giữ lại"
        isDanger
        isBusy={isBusy}
        onConfirm={() => void handleArchive()}
      />
    </>
  );

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
            {publicVisible && (
              <Link
                className={styles.detail}
                to={`/books/${item.id}`}
                aria-label={`Xem bài đăng ${title}`}
              >
                Xem bài đăng <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            )}
            {canEditApproved(item) && (
              <Link
                className={styles.gridEditBtn}
                to={ROUTES.myBookEdit(item.id)}
                aria-label={`Sửa bài đăng ${title}`}
              >
                <Edit size={13} style={{ marginRight: 4 }} /> Sửa bài
              </Link>
            )}
            {(canToggle || canArchive) && (
              <div className={styles.actionRowGroup}>
                {canToggle && (
                  <button
                    type="button"
                    className={styles.toggleVisBtn}
                    disabled={isBusy || isHideCoolingDown}
                    onClick={() => {
                      if (isBusy || isHideCoolingDown) return;
                      if (isHidden) void handleToggleVisibility("Visible");
                      else setConfirmHideOpen(true);
                    }}
                    title={
                      isHideCoolingDown
                        ? `Vui lòng chờ ${hideCooldown}s trước khi thao tác tiếp`
                        : isHidden
                          ? "Hiện lại trên kệ công khai"
                          : "Tạm ẩn sách khỏi kệ công khai"
                    }
                  >
                    {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                    <span>
                      {isHidden ? "Hiện lại" : "Tạm ẩn"}
                      {isHideCoolingDown ? ` (${hideCooldown}s)` : ""}
                    </span>
                  </button>
                )}
                {canArchive && (
                  <button
                    type="button"
                    className={styles.archiveBtn}
                    disabled={isBusy}
                    onClick={() => setConfirmArchiveOpen(true)}
                    title="Gỡ vĩnh viễn bài đăng này khỏi kệ sách"
                  >
                    <Trash2 size={13} />
                    <span>Xóa</span>
                  </button>
                )}
              </div>
            )}
            {actionError && <p className={styles.rowActionError}>{actionError}</p>}
            {shouldExplainEditBlock(item) && (
              <span className={styles.blockReasonNote} role="status">
                {editApprovedBlock(item)}
              </span>
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
        {dialogs}
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
        {canEditApproved(item) && (
          <Link
            className={styles.listEditBtn}
            to={ROUTES.myBookEdit(item.id)}
            aria-label={`Sửa bài đăng ${title}`}
          >
            <Edit size={13} style={{ marginRight: 4 }} /> Sửa bài
          </Link>
        )}
        {(canToggle || canArchive) && (
          <div className={styles.actionRowGroup}>
            {canToggle && (
              <button
                type="button"
                className={styles.toggleVisBtn}
                disabled={isBusy || isHideCoolingDown}
                onClick={() => {
                  if (isBusy || isHideCoolingDown) return;
                  if (isHidden) void handleToggleVisibility("Visible");
                  else setConfirmHideOpen(true);
                }}
                title={
                  isHideCoolingDown
                    ? `Vui lòng chờ ${hideCooldown}s trước khi thao tác tiếp`
                    : isHidden
                      ? "Hiện lại trên kệ công khai"
                      : "Tạm ẩn sách khỏi kệ công khai"
                }
              >
                {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                <span>
                  {isHidden ? "Hiện lại" : "Tạm ẩn"}
                  {isHideCoolingDown ? ` (${hideCooldown}s)` : ""}
                </span>
              </button>
            )}
            {canArchive && (
              <button
                type="button"
                className={styles.archiveBtn}
                disabled={isBusy}
                onClick={() => setConfirmArchiveOpen(true)}
                title="Gỡ vĩnh viễn bài đăng này khỏi kệ sách"
              >
                <Trash2 size={13} />
                <span>Xóa</span>
              </button>
            )}
          </div>
        )}
        {actionError && <p className={styles.rowActionError}>{actionError}</p>}
        {shouldExplainEditBlock(item) && (
          <span className={styles.blockReasonNote} role="status">
            {editApprovedBlock(item)}
          </span>
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
      {dialogs}
    </li>
  );
}
