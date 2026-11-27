import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, BookOpen, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { BundleManifest } from "../components/BookBundle";
import { InfoTip } from "../components/InfoTip";
import { ListingGallery } from "../components/ListingGallery";
import { SupportLink } from "../features/support/SupportLink";
import { useSession } from "../hooks/useSession";
import { listingTitle } from "../lib/book-bundle";
import { conditions, listingModes } from "../lib/listing-labels";
import { formatVnd, ROUTES } from "../lib/routes";
import { getPublicListing, type PublicListing } from "../services/public-listings";
import { getPurchaseConversations } from "../services/purchase-conversations";
import { BookFactsSection } from "./book-detail/BookFactsSection";
import { BookParcelArt } from "./book-detail/BookDetailArt";
import { ConditionSection } from "./book-detail/ConditionSection";
import { PurchasePanel } from "./book-detail/PurchasePanel";
import { listingPurchaseState } from "./book-detail/listing-purchase-state";
import styles from "./BookDetailPage.module.css";
import "../components/BookTransition.css";

const listingIdPattern = /^[0-9a-f-]{36}$/i;

/** Only return to the catalog, keeping its filters; anything else falls back to /books. */
function catalogReturnPath(state: unknown) {
  const value = (state as { catalogReturn?: unknown } | null)?.catalogReturn;
  return typeof value === "string" &&
    (value === ROUTES.search || value.startsWith(ROUTES.search + "?"))
    ? value
    : ROUTES.search;
}

export function BookDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const currentUserId = session.status === "authenticated" ? session.user.id : undefined;
  const valid = listingIdPattern.test(id);

  const detail = useQuery({
    queryKey: ["public-listing", id],
    queryFn: () => getPublicListing(id),
    initialData: () =>
      location.state?.listing?.id === id ? (location.state.listing as PublicListing) : undefined,
    enabled: valid,
    refetchOnMount: "always",
    retry: false,
  });
  const conversations = useQuery({
    queryKey: ["purchase-conversations", currentUserId],
    queryFn: getPurchaseConversations,
    enabled: session.status === "authenticated",
    refetchOnMount: "always",
    retry: false,
  });

  const back = (
    <Link
      className={styles.back}
      to={catalogReturnPath(location.state)}
      viewTransition
      state={{ morphBookId: id }}
    >
      <ArrowLeft size={17} aria-hidden="true" /> Về kệ sách
    </Link>
  );
  const notice = (children: ReactNode, role?: "status") => (
    <section className={styles.state} role={role}>
      {back}
      {children}
    </section>
  );

  if (!valid || (detail.error instanceof ApiError && detail.error.status === 404))
    return notice(
      <>
        <h1>Không tìm thấy bài đăng này</h1>
        <p>Sách có thể đã được gỡ. Hãy tìm một cuốn khác trên kệ.</p>
      </>,
    );
  if (detail.isError && !detail.data)
    return notice(
      <div role="alert">
        <h1>Chưa tải được thông tin sách</h1>
        <p>Kiểm tra kết nối rồi thử lại.</p>
        <button type="button" onClick={() => void detail.refetch()} disabled={detail.isFetching}>
          Thử lại
        </button>
      </div>,
    );
  if (!detail.data) return notice(<p>Đang mở thông tin sách…</p>, "status");

  const book = detail.data;
  const purchase = listingPurchaseState(book, conversations.data, currentUserId);

  return (
    <div className={styles.page} data-book-detail="true">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {back}
      </motion.div>
      {detail.isError && (
        <div role="alert" className={styles.refreshError}>
          Chưa cập nhật được thông tin mới nhất.{" "}
          <button type="button" onClick={() => void detail.refetch()}>
            Thử lại
          </button>
        </div>
      )}
      <div className={styles.grid}>
        <ListingGallery key={book.id + book.revisionId} book={book} />
        <motion.article
          className={styles.content}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.bookCard} data-tone={purchase.tone}>
            {purchase.statusTag && <p className={styles.statusTag}>{purchase.statusTag}</p>}
            <h1>{listingTitle(book)}</h1>
            <BundleManifest bundle={book.bundle} />
            <p className={styles.author}>
              Tác giả: {book.book.authors.join(", ") || "Chưa rõ tác giả"}
            </p>

            <ul className={styles.quickFacts}>
              <li>
                <span>Người bán mô tả</span>
                <strong>{conditions[book.condition]}</strong>
              </li>
              <li>
                <span>Số trang</span>
                <strong className={book.hasMissingPages ? styles.factWarning : undefined}>
                  {book.hasMissingPages ? "Có trang thiếu" : "Không thiếu trang"}
                </strong>
              </li>
              <li>
                <span>Hình thức</span>
                <strong>{listingModes[book.mode]}</strong>
              </li>
            </ul>
            <a className={styles.conditionLink} href="#book-condition">
              <BookOpen size={16} aria-hidden="true" />
              {book.hasMissingPages
                ? "Có trang thiếu — xem mô tả và ảnh trước khi mua"
                : "Xem chi tiết tình trạng"}
            </a>

            <div className={styles.buyPanel}>
              <div className={styles.prices}>
                {book.salePrice !== null && (
                  <div className={styles.priceCard}>
                    <span className={styles.priceLabel}>{book.bundle ? "Giá cả bộ" : "Giá bán"}</span>
                    <strong>{formatVnd(book.salePrice)}</strong>
                  </div>
                )}
                {book.exchangeValue !== null && (
                  <div className={styles.exchangePriceCard}>
                    <span className={styles.priceLabel}>
                      Giá trị đổi
                      <InfoTip label="Giá trị đổi">
                        Dùng để <strong>tính tiền bù</strong> khi hai cuốn sách trong đề nghị đổi
                        có giá trị khác nhau.
                      </InfoTip>
                    </span>
                    <strong>{formatVnd(book.exchangeValue)}</strong>
                  </div>
                )}
              </div>
              <PurchasePanel
                book={book}
                purchase={purchase}
                signedIn={session.status === "authenticated"}
                chatBlocked={detail.isFetching || detail.isError || session.status === "loading"}
                onRequestPurchase={() =>
                  navigate(`/chat/start/${book.id}?intent=Negotiation&openChat=1`)
                }
              />
            </div>

            <section className={styles.sellerCard} aria-label="Thông tin người đăng">
              <div className={styles.sellerAvatar} aria-hidden="true">
                {book.seller.displayName.trim().slice(0, 1).toLocaleUpperCase("vi-VN") || "?"}
              </div>
              <div className={styles.sellerCardInfo}>
                <span className={styles.sellerCardMeta}>Người đăng sách</span>
                <strong>{book.seller.displayName}</strong>
              </div>
              {purchase.isOwner ? (
                <span className={styles.ownerPill}>Bài của bạn</span>
              ) : (
                <Link className={styles.sellerProfile} to={`/members/${book.seller.id}`}>
                  Xem hồ sơ <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              )}
            </section>
          </div>
          <div className={styles.report}>
            <SupportLink type="Listing" id={book.id} report />
          </div>
        </motion.article>
      </div>

      <div className={styles.detailsGrid}>
        <ConditionSection book={book} />
        <div>
          <BookFactsSection book={book} />
          <section className={styles.seller}>
            <div className={styles.headingRow}>
              <h2>Giao nhận</h2>
              <InfoTip label="Giao nhận">
                Ảnh và tình trạng do người đăng cung cấp; kiểm duyệt bài đăng
                <strong> không xác nhận tình trạng vật lý</strong>.
              </InfoTip>
            </div>
            <BookParcelArt className={styles.parcelArt} />
            <p>
              <MapPin size={16} aria-hidden="true" />
              {book.fulfillment ? (
                <span>
                  Giao hàng mô phỏng giữa <strong>TP.HCM, Bình Dương và Vũng Tàu</strong>.
                </span>
              ) : (
                "Bài đăng chưa cấu hình giao nhận."
              )}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
