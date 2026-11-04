import { useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  accountErrorMessage,
  cartSchema,
  readCart,
  changeCart,
  pendingCartCommand,
} from "@used-books/session-client";
import {
  ArrowRight,
  ShoppingBag,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Store,
  Trash2,
} from "lucide-react";
import { session } from "../lib/session";
import { useSession } from "../hooks/useSession";
import { publicListingSchema } from "../services/public-listings";
import { ListingPhoto } from "../components/BookCard";
import { listingTitle } from "../lib/book-bundle";
import { formatVnd } from "../lib/routes";
import styles from "./CartPage.module.css";

const schema = cartSchema(publicListingSchema);

export function CartPage() {
  const state = useSession();

  if (state.status === "loading") {
    return (
      <div className={styles.loadingState} role="status">
        <RefreshCw size={24} className={styles.spinIcon} aria-hidden="true" />
        <p>Đang khôi phục phiên giỏ sách…</p>
      </div>
    );
  }

  if (state.status !== "authenticated") {
    return <Navigate to="/login?returnUrl=%2Fcart" replace />;
  }

  return <CartContent key={state.user.id} owner={state.user.id} />;
}

function CartContent({ owner }: { owner: string }) {
  const result = useQuery({
    queryKey: ["member-cart", owner],
    queryFn: () => readCart(session, schema),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [needsRead, setNeedsRead] = useState(false);
  const running = useRef(false);

  const pending = pendingCartCommand(session);
  const disabled = busy || pending || needsRead;

  async function refresh() {
    const r = await result.refetch();
    if (r.error) throw r.error;
    setError("");
    setNeedsRead(false);
  }

  async function remove(listingId?: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await changeCart(
        session,
        listingId ? { action: "remove", listingId } : null,
        () => crypto.randomUUID(),
      );
      setNeedsRead(true);
      setMessage("Đã cập nhật giỏ sách.");
      await refresh();
    } catch (e) {
      setError(accountErrorMessage(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  const items = result.data?.items ?? [];
  const count = items.length;

  return (
    <div className={styles.pageRoot}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.pageTitle}>Giỏ sách</h1>
            <p className={styles.pageSubtitle}>
              Mỗi cuốn sách cũ là độc bản từ kệ của người bán. Bạn có thể lưu lại và tiến hành mua trực tiếp từng cuốn.
            </p>
          </div>

          <button
            type="button"
            className={styles.refreshButton}
            disabled={busy || result.isFetching}
            onClick={() =>
              void refresh().catch((e) => setError(accountErrorMessage(e)))
            }
            title="Làm mới giỏ sách"
          >
            <RefreshCw
              size={14}
              className={result.isFetching ? styles.spinIcon : undefined}
              aria-hidden="true"
            />
            <span>Cập nhật giỏ</span>
          </button>
        </div>
      </div>

      {/* Alert Boxes */}
      {result.isPending && (
        <div className={styles.noticeBox} role="status">
          <RefreshCw size={15} className={styles.spinIcon} aria-hidden="true" />
          <span>Đang tải giỏ sách của bạn…</span>
        </div>
      )}

      {result.error && (
        <div className={styles.errorBox} role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>Chưa tải được giỏ. {accountErrorMessage(result.error)}</span>
        </div>
      )}

      {error && (
        <div className={styles.errorBox} role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className={styles.successBox} role="status">
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>{message}</span>
        </div>
      )}

      {needsRead && (
        <div className={styles.noticeBox} role="status">
          <RefreshCw size={15} className={styles.spinIcon} aria-hidden="true" />
          <span>Lệnh đã ghi nhận. Vui lòng bấm Cập nhật giỏ để xem trạng thái mới.</span>
        </div>
      )}

      {pending && (
        <div className={styles.pendingActionBox}>
          <div className={styles.pendingActionHeader}>
            <AlertTriangle size={16} aria-hidden="true" />
            <span>Chưa xác nhận được thao tác giỏ trước. Giữ nguyên yêu cầu khi thử lại.</span>
          </div>
          <button
            type="button"
            className={styles.verifyActionButton}
            disabled={busy}
            onClick={() => void remove()}
          >
            Xác minh thao tác giỏ trước
          </button>
        </div>
      )}

      <div className={styles.cartBody}>
        {/* Count Row */}
        {result.data && (
          <div className={styles.cartCountRow}>
            Hiện có <strong>{count}</strong> / 50 bài đăng trong giỏ
          </div>
        )}

        {/* Empty State */}
        {result.data && count === 0 && !result.error && (
          <div className={styles.emptyCard} aria-label="Giỏ sách đang trống">
            <div className={styles.emptyIconWrap}>
              <ShoppingBag size={36} aria-hidden="true" />
            </div>
            <h2 className={styles.emptyTitle}>Giỏ sách đang trống</h2>
            <p className={styles.emptySubtitle}>
              Bạn chưa thêm cuốn sách nào vào giỏ. Hãy dạo kệ sách Lật Lại để tìm những ấn bản hay và độc đáo.
            </p>
            <Link to="/books" className={styles.primaryButton}>
              <span>Khám phá kệ sách ngay</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        )}

        {/* Item List */}
        {result.data && count > 0 && (
          <ul className={styles.itemList} aria-label="Danh sách sách trong giỏ">
            {result.data.items.map((item) => (
              <li className={styles.itemCard} key={item.listingId}>
                {item.listing ? (
                  <>
                    <Link
                      to={`/books/${item.listingId}`}
                      className={styles.itemPhotoWrap}
                      title={`Xem chi tiết ${listingTitle(item.listing)}`}
                    >
                      <ListingPhoto book={item.listing} />
                    </Link>

                    <div className={styles.itemContent}>
                      <div className={styles.itemTop}>
                        <h2 className={styles.itemTitle}>
                          <Link to={`/books/${item.listingId}`}>
                            {listingTitle(item.listing)}
                          </Link>
                        </h2>
                        <div className={styles.itemMeta}>
                          <Store size={13} aria-hidden="true" />
                          <span>Người bán: {item.listing.seller.displayName}</span>
                          <span className={styles.metaDivider}>•</span>
                          <span>Bản duy nhất</span>
                        </div>
                      </div>

                      <div className={styles.priceRow}>
                        <span className={styles.priceValue}>
                          {item.listing.salePrice !== null
                            ? formatVnd(item.listing.salePrice)
                            : "Không bán"}
                        </span>
                        {item.listing.salePrice !== item.priceAtAdd && (
                          <span className={styles.priceChangeTag}>
                            <AlertTriangle size={12} aria-hidden="true" />
                            Giá khi thêm: {formatVnd(item.priceAtAdd)} (đã đổi)
                          </span>
                        )}
                      </div>

                      {!item.canBuy && (
                        <div className={styles.warningBox}>
                          <AlertCircle size={14} aria-hidden="true" />
                          <span>Hiện chưa thể mua: bài đăng có thể đang được giao dịch hoặc chưa đủ điều kiện.</span>
                        </div>
                      )}

                      <div className={styles.actionRow}>
                        {item.canBuy && !disabled && !result.error ? (
                          <Link
                            className={styles.buyNowButton}
                            to={`/buy-now/${item.listingId}`}
                          >
                            <span>Mua bài đăng này</span>
                            <ArrowRight size={14} aria-hidden="true" />
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className={styles.disabledButton}
                            disabled
                          >
                            Tạm không thể mua
                          </button>
                        )}

                        <button
                          type="button"
                          className={styles.removeButton}
                          disabled={disabled}
                          onClick={() => void remove(item.listingId)}
                          aria-label={`Bỏ ${listingTitle(item.listing)} khỏi giỏ`}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                          <span>Bỏ khỏi giỏ</span>
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={styles.unavailableRow}>
                    <div>
                      <h3 className={styles.itemTitle}>Bài đăng không còn công khai</h3>
                      <p className={styles.unavailableText}>
                        Nội dung này đã được người bán gỡ hoặc không khả dụng.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.removeButton}
                      disabled={disabled}
                      onClick={() => void remove(item.listingId)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      <span>Bỏ khỏi giỏ</span>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
