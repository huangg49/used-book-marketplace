import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, MapPin, MessageCircle } from "lucide-react";
import { ListingGallery } from "../components/ListingGallery";
import { conditions } from "../lib/listing-labels";
import { useSession } from "../hooks/useSession";
import { formatVnd, ROUTES } from "../lib/routes";
import {
  getPurchaseConversations,
} from "../services/purchase-conversations";
import { getPublicListing } from "../services/public-listings";
import styles from "./BookDetailPage.module.css";
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
    <Link className={styles.back} to={returnTo}>
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
    <div className={styles.page}>
      {back}
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
        <article className={styles.content}>
          <h1>{book.book.title}</h1>
          <p className={styles.author}>
            {book.book.authors.join(", ") || "Chưa rõ tác giả"}
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
                    : "Muốn đọc cuốn này?"}
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
              {!isOwner && !held && (
                <Link className={styles.primary} to={`/buy-now/${book.id}`}>Mua ngay <ArrowUpRight size={18} aria-hidden="true" /></Link>
              )}
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
              ) : (
                !held && (
                  <Link
                    className={styles.primary}
                    to={
                      state.status === "authenticated"
                        ? `/chat/start/${book.id}?intent=Exchange`
                        : `/chat/start/${book.id}?intent=Exchange`
                    }
                  >
                    Gửi đề nghị đổi sách{" "}
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                )
              )}
            </section>
          )}
        </article>
      </div>
      <div className={styles.detailsGrid}>
        <section className={styles.details}>
          <h2>Tình trạng bản sách</h2>
          <p className={styles.description}>
            {book.description || "Người đăng chưa có mô tả thêm."}
          </p>
          <dl>
            <div>
              <dt>Ruột sách</dt>
              <dd>{book.pages || "Chưa ghi rõ"}</dd>
            </div>
            <div>
              <dt>Trang thiếu</dt>
              <dd>
                {book.hasMissingPages
                  ? "Có trang thiếu — xem mô tả ruột sách."
                  : "Không có trang thiếu theo người đăng."}
              </dd>
            </div>
            <div>
              <dt>Bìa và gáy</dt>
              <dd>{book.coverNote || "Chưa ghi rõ"}</dd>
            </div>
            <div>
              <dt>Ghi chú, đánh dấu</dt>
              <dd>{book.notes || "Chưa ghi rõ"}</dd>
            </div>
            <div>
              <dt>Phụ kiện</dt>
              <dd>{book.accessories || "Chưa ghi rõ"}</dd>
            </div>
          </dl>
        </section>
        <div>
          <section className={styles.details}>
            <h2>Thông tin sách</h2>
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
                <dt>Ngôn ngữ</dt>
                <dd>{languageLabel(book.book.language)}</dd>
              </div>
              {book.book.publisher && (
                <div>
                  <dt>Nhà xuất bản</dt>
                  <dd>{book.book.publisher}</dd>
                </div>
              )}
              {book.book.publicationYear && (
                <div>
                  <dt>Năm xuất bản</dt>
                  <dd>{book.book.publicationYear}</dd>
                </div>
              )}
              {book.book.edition && (
                <div>
                  <dt>Ấn bản</dt>
                  <dd>{book.book.edition}</dd>
                </div>
              )}
              {book.book.isbn && (
                <div>
                  <dt>ISBN</dt>
                  <dd>{book.book.isbn}</dd>
                </div>
              )}
            </dl>
          </section>
          <section className={styles.seller}>
            <h2>Người đăng: {book.seller.displayName}</h2>
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
