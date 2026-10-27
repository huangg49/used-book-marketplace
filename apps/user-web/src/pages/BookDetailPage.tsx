import { BundleManifest } from "../components/BookBundle";
import { listingTitle } from "../lib/book-bundle";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, MapPin, MessageCircle, BookOpen, ClipboardCheck, Languages, CalendarDays, Building2, Hash, Layers3 } from "lucide-react";
import { motion } from "framer-motion";
import { ListingGallery } from "../components/ListingGallery";
import { conditions } from "../lib/listing-labels";
import { useSession } from "../hooks/useSession";
import { formatVnd, ROUTES } from "../lib/routes";
import {
  getPurchaseConversations,
} from "../services/purchase-conversations";
import { getPublicListing, type PublicListing } from "../services/public-listings";
import styles from "./BookDetailPage.module.css";
import "../components/BookTransition.css";
import {
  categoryFor,
  categoryPath,
  classificationLabels,
  languageLabel,
} from "@used-books/api-contract/catalog-taxonomy";
import { searchUrl } from "../lib/routes";

export function BookDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = useSession();
  const valid = /^[0-9a-f-]{36}$/i.test(id);
  const detail = useQuery({
    queryKey: ["public-listing", id],
    queryFn: () => getPublicListing(id),
    initialData: () => (location.state?.listing?.id === id ? (location.state.listing as PublicListing) : undefined),
    enabled: valid,
    refetchOnMount: "always",
    retry: false,
  });
  const conversations = useQuery({
    queryKey: ["purchase-conversations", state.status === "authenticated" ? state.user.id : undefined],
    queryFn: getPurchaseConversations,
    enabled: state.status === "authenticated",
    refetchOnMount: "always",
    retry: false,
  });
  const catalogReturn = location.state?.catalogReturn;
  const returnTo =
    typeof catalogReturn === "string" &&
    (catalogReturn === ROUTES.search ||
      catalogReturn.startsWith(ROUTES.search + "?"))
      ? catalogReturn
      : ROUTES.search;
  const back = (
    <Link
      className={styles.back}
      to={returnTo}
      viewTransition
      state={{ morphBookId: id }}
    >
      <ArrowLeft size={17} aria-hidden="true" /> Về kệ sách
    </Link>
  );
  if (
    !valid ||
    (detail.error instanceof ApiError && detail.error.status === 404)
  )
    return (
      <section className={styles.state}>
        {back}
        <h1>Không tìm thấy bài đăng này</h1>
        <p>Sách có thể đã được gỡ. Hãy tìm một cuốn khác trên kệ.</p>
      </section>
    );
  if (detail.isError && !detail.data)
    return (
      <section className={styles.state}>
        {back}
        <div role="alert">
          <h1>Chưa tải được thông tin sách</h1>
          <p>Kiểm tra kết nối rồi thử lại.</p>
          <button
            type="button"
            onClick={() => void detail.refetch()}
            disabled={detail.isFetching}
          >
            Thử lại
          </button>
        </div>
      </section>
    );
  if (!detail.data)
    return (
      <section className={styles.state} role="status">
        {back}
        <p>Đang mở thông tin sách…</p>
      </section>
    );
  const book = detail.data;
  const held = book.purchaseAvailability.status !== "Available";
  const heldLabel = book.purchaseAvailability.status === "AwaitingPayment"
    ? "Chờ thanh toán"
    : book.purchaseAvailability.status === "InTransaction"
      ? "Đang giao dịch"
      : "Đang giữ sách";
  const currentUserId =
    state.status === "authenticated" ? state.user.id : undefined;
  const isOwner =
    currentUserId === book.seller.id;
  const orderConversation = held
    ? conversations.data?.find(
        (conversation) =>
          conversation.listingId === book.id &&
          conversation.status === "OrderCreated" &&
          (conversation.buyer.id === currentUserId ||
            conversation.seller.id === currentUserId),
      )
    : undefined;
  const buyerOrderConversation =
    orderConversation?.buyer.id === currentUserId
      ? orderConversation
      : undefined;
  const sellerOrderConversation =
    orderConversation?.seller.id === currentUserId
      ? orderConversation
      : undefined;
  const activeConversation = conversations.data?.find(
    (conversation) =>
      conversation.listingId === book.id && conversation.status === "Active",
  );
  const conversationToOpen =
    buyerOrderConversation ?? sellerOrderConversation ?? activeConversation;
  function requestPurchase() { navigate(`/chat/start/${book.id}?intent=Negotiation`); }
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
          <h1>{listingTitle(book)}</h1>
          <BundleManifest bundle={book.bundle} />
          <p className={styles.author}>
            Tác giả: {book.book.authors.join(", ") || "Chưa rõ tác giả"}
          </p>

          <div className={styles.labels}>
            <span>{conditions[book.condition]}</span>
            <span>
              {book.mode === "Sale"
                ? "Đăng bán"
                : book.mode === "Exchange"
                  ? "Trao đổi"
                  : "Bán hoặc đổi"}
            </span>
            {held && (
              <span>
                {buyerOrderConversation && book.purchaseAvailability.status === "InTransaction"
                  ? "Đang giao dịch với bạn"
                  : heldLabel}
              </span>
            )}
          </div>
          <div className={styles.prices}>
            {book.salePrice !== null && (
              <div className={styles.priceCard}>
                <span className={styles.priceLabel}>{book.bundle ? "GIÁ CẢ BỘ" : "GIÁ BÁN"}</span>
                <strong>{formatVnd(book.salePrice)}</strong>
                <span className={styles.priceHint}>Thanh toán bằng tiền</span>
              </div>
            )}
            {book.exchangeValue !== null && (
              <div className={styles.exchangePriceCard}>
                <span className={styles.priceLabel}>GIÁ TRỊ ĐỔI</span>
                <strong>{formatVnd(book.exchangeValue)}</strong>
                <span className={styles.priceHint}>Dùng để tính tiền bù</span>
              </div>
            )}
          </div>
          {book.salePrice !== null && (
            <section className={styles.purchase}>
              <h2>
                {buyerOrderConversation
                  ? "Người bán đã tạo đơn cho bạn"
                  : sellerOrderConversation
                    ? "Bạn đã tạo đơn cho người mua"
                    : isOwner
                  ? "Đây là bài đăng của bạn"
                  : held
                    ? heldLabel
                    : book.bundle ? "Muốn đọc bộ này?" : "Muốn đọc cuốn này?"}
              </h2>
              <p>
                {buyerOrderConversation
                  ? "Đơn hàng này dành cho bạn. Mở đơn để xem giá đã thỏa thuận và xác nhận thanh toán."
                  : sellerOrderConversation
                    ? "Bạn đã tạo đơn cho người mua này. Mở hội thoại để xem thông tin đơn hàng."
                    : isOwner
                  ? "Người mua có thể mua ngay theo giá niêm yết hoặc nhắn bạn để thương lượng. Đơn Mua ngay đã thanh toán sẽ chuyển thẳng sang chuẩn bị gửi."
                  : held
                    ? "Bản sách này đã có đơn giữ chỗ. Bạn vẫn có thể xem bài đăng nhưng chưa thể đặt mua."
                    : "Mua ngay theo giá niêm yết, không cần trao đổi. Bạn cũng có thể nhắn người bán nếu muốn thương lượng; chat chưa giữ sách."}
              </p>
              <div className={styles.actionRow}>
                {!isOwner && !held && (
                  <Link className={styles.primary} to={`/buy-now/${book.id}`}>{book.bundle ? "Mua cả bộ" : "Mua ngay"} <ArrowUpRight size={18} aria-hidden="true" /></Link>
                )}
                {["Exchange", "Both"].includes(book.mode) && !isOwner && !held && (
                  <Link className={styles.primary} to={`/chat/start/${book.id}?intent=Exchange`}>
                    Gửi đề nghị đổi sách <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                )}
              </div>
              {held && !orderConversation && state.status === 'authenticated' && (
                <Link className={styles.secondary} to="/orders">Xem đơn hàng của tôi</Link>
              )}
              {conversationToOpen ? (
                <Link
                  className={styles.secondary}
                  to={ROUTES.chat(conversationToOpen.id)}
                >
                  <MessageCircle size={18} aria-hidden="true" />
                  {buyerOrderConversation
                    ? "Xem đơn hàng của bạn"
                    : sellerOrderConversation
                      ? "Mở hội thoại giao dịch"
                      : isOwner
                        ? "Mở chat với người mua"
                        : "Mở chat với người bán"}
                </Link>
              ) : (
                !isOwner && (
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={
                      held ||
                      detail.isFetching ||
                      detail.isError ||
                      state.status === "loading"
                    }
                    onClick={requestPurchase}
                  >
                    {held ? heldLabel : "Chat với người bán"}
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </button>
                )
              )}
            </section>
          )}
          {["Exchange", "Both"].includes(book.mode) && (
            <section className={styles.purchase}>
              <p className={styles.exchangeNote}>
                {isOwner
                  ? "Đây là bản sách của bạn. Theo dõi đề nghị trong Trao đổi của tôi."
                  : held
                    ? "Bản sách đang được giữ cho giao dịch hiện tại."
                    : "Chọn một bản sách trong kệ của bạn để đề nghị đổi. Máy chủ tính tiền bù theo giá trị đổi."}
              </p>
              {isOwner ? (
                <Link className={styles.primary} to={ROUTES.exchangeMine}>
                  Trao đổi của tôi
                </Link>
              ) : book.salePrice === null && !held ? (
                <Link
                  className={styles.primary}
                  to={`/chat/start/${book.id}?intent=Exchange`}
                >
                  Gửi đề nghị đổi sách <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
              ) : null}
            </section>
          )}
        </motion.article>
      </div>
      <div className={styles.sellerRow}>
        <section className={styles.sellerCard} aria-label="Thông tin người đăng">
          <div className={styles.sellerAvatar} aria-hidden="true">
            {book.seller.displayName.trim().slice(0, 1).toLocaleUpperCase("vi-VN") || "?"}
          </div>
          <div className={styles.sellerCardInfo}>
            <span className={styles.sellerCardEyebrow}>Người đăng sách</span>
            <strong>{book.seller.displayName}</strong>
            <span className={styles.sellerCardMeta}>
              {isOwner ? "Đây là bài đăng của bạn" : "Thông tin người bán"}
            </span>
          </div>
          {isOwner && <span className={styles.ownerLabel}>Bạn</span>}
        </section>
      </div>
      <div className={styles.detailsGrid}>
        <section className={styles.details}>
          <div className={styles.detailsHeading}>
            <span className={styles.detailsIcon}><ClipboardCheck size={19} aria-hidden="true" /></span>
            <div>
              <h2>Tình trạng sách</h2>
              <p>Chi tiết thực tế của bản sách này</p>
            </div>
          </div>
          <p className={styles.description}>
            {book.description || "Người đăng chưa có mô tả thêm."}
          </p>
          <div className={styles.conditionGrid}>
            <div className={styles.conditionItem}>
              <span className={styles.conditionMark}><BookOpen size={16} aria-hidden="true" /></span>
              <div><span>Ruột sách</span><strong>{book.pages || "Chưa ghi rõ"}</strong></div>
            </div>
            <div className={styles.conditionItem}>
              <span className={styles.conditionMark}><ClipboardCheck size={16} aria-hidden="true" /></span>
              <div><span>Trang thiếu</span><strong className={book.hasMissingPages ? styles.conditionWarning : styles.conditionGood}>{book.hasMissingPages ? "Có trang thiếu" : "Không có trang thiếu"}</strong></div>
            </div>
            <div className={styles.conditionItem}>
              <span className={styles.conditionMark}><Layers3 size={16} aria-hidden="true" /></span>
              <div><span>Bìa và gáy</span><strong>{book.coverNote || "Chưa ghi rõ"}</strong></div>
            </div>
            <div className={styles.conditionItem}>
              <span className={styles.conditionMark}><BookOpen size={16} aria-hidden="true" /></span>
              <div><span>Ghi chú, đánh dấu</span><strong>{book.notes || "Chưa ghi rõ"}</strong></div>
            </div>
            <div className={styles.conditionItem}>
              <span className={styles.conditionMark}><ClipboardCheck size={16} aria-hidden="true" /></span>
              <div><span>Phụ kiện</span><strong>{book.accessories || "Chưa ghi rõ"}</strong></div>
            </div>
          </div>
        </section>
        <div>
          <section className={styles.details}>
            <div className={styles.detailsHeading}>
              <span className={styles.detailsIcon}><BookOpen size={19} aria-hidden="true" /></span>
              <div>
                <h2>{book.bundle ? "Đầu sách đại diện" : "Thông tin sách"}</h2>
                <p>{book.bundle ? "Phân loại theo đầu sách đại diện. Các cuốn thực tế được ghi trong danh sách bộ sách ở trên." : "Thông tin xuất bản và phân loại"}</p>
              </div>
            </div>
            <dl>
              <div>
                <dt>Danh mục</dt>
                <dd>
                  {categoryFor(book.book.categoryId || book.book.category)
                    ? categoryPath(
                        book.book.categoryId || book.book.category,
                      ).map((c, index) => (
                        <span key={c.id}>
                          {index > 0 && " / "}
                          <Link
                            to={searchUrl({ data: "live", categoryId: c.id })}
                          >
                            {c.label}
                          </Link>
                        </span>
                      ))
                    : book.book.category || "Chưa ghi rõ"}
                </dd>
              </div>
              {book.book.series && (
                <div>
                  <dt>Bộ truyện</dt>
                  <dd>
                    <Link
                      to={searchUrl({
                        data: "live",
                        categoryId:
                          book.book.categoryId ||
                          categoryFor(book.book.category)?.id ||
                          "",
                        series: book.book.series,
                      })}
                    >
                      {book.book.series}
                    </Link>
                  </dd>
                </div>
              )}
              {classificationLabels(book.book).map((f) => (
                <div key={f.id}>
                  <dt>{f.label}</dt>
                  <dd>
                    {f.values.map((o, index) => (
                      <span key={o.id}>
                        {index > 0 && " · "}
                        <Link
                          to={searchUrl({
                            data: "live",
                            categoryId:
                              book.book.categoryId ||
                              categoryFor(book.book.category)?.id ||
                              "",
                            facets: JSON.stringify({
                              [f.id]: [o.id],
                              ...(f.id === "level" &&
                              book.book.attributes?.purpose?.includes("exam")
                                ? { purpose: ["exam"] }
                                : {}),
                              ...(f.id === "grade" &&
                              book.book.attributes?.schoolStage
                                ? {
                                    schoolStage:
                                      book.book.attributes.schoolStage,
                                  }
                                : {}),
                            }),
                          })}
                        >
                          {o.label}
                        </Link>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
              <div>
                <dt><Languages size={14} aria-hidden="true" /> Ngôn ngữ</dt>
                <dd>{languageLabel(book.book.language)}</dd>
              </div>
              {book.book.publisher && (
                <div>
                  <dt><Building2 size={14} aria-hidden="true" /> Nhà xuất bản</dt>
                  <dd>{book.book.publisher}</dd>
                </div>
              )}
              {book.book.publicationYear && (
                <div>
                  <dt><CalendarDays size={14} aria-hidden="true" /> Năm xuất bản</dt>
                  <dd>{book.book.publicationYear}</dd>
                </div>
              )}
              {book.book.edition && (
                <div>
                  <dt><Layers3 size={14} aria-hidden="true" /> Ấn bản</dt>
                  <dd>{book.book.edition}</dd>
                </div>
              )}
              {book.book.isbn && (
                <div>
                  <dt><Hash size={14} aria-hidden="true" /> ISBN</dt>
                  <dd>{book.book.isbn}</dd>
                </div>
              )}
            </dl>
          </section>
          <section className={styles.seller}>
            <h2>Giao nhận và lưu ý</h2>
            <p>
              <MapPin size={16} aria-hidden="true" />
              {book.fulfillment
                ? "Giao hàng mô phỏng giữa TP.HCM, Bình Dương và Vũng Tàu."
                : "Bài đăng chưa cấu hình giao nhận."}
            </p>
            <p className={styles.note}>
              Ảnh và tình trạng do người đăng cung cấp; kiểm duyệt bài đăng
              không xác nhận tình trạng vật lý.
            </p>
          </section>
        </div>
      </div>

    </div>
  );
}
