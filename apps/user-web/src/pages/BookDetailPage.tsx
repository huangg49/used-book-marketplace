import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowUpRight, MapPin, MessageCircle } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ListingPhoto } from "../components/BookCard";
import { conditions } from "../lib/listing-labels";
import { useSession } from "../hooks/useSession";
import { formatVnd, ROUTES } from "../lib/routes";
import {
  getPurchaseConversations,
  startPurchaseConversation,
} from "../services/purchase-conversations";
import { getPublicListing } from "../services/public-listings";
import styles from "./BookDetailPage.module.css";

function purchaseError(error: unknown) {
  if (!(error instanceof ApiError))
    return "Chưa thể mở chat. Vui lòng thử lại sau.";
  if (error.status === 401)
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.code === "CONFLICT")
    return "Thông tin sách vừa thay đổi. Hãy tải lại trang để xem trạng thái mới nhất.";
  if (error.code === "INVALID_STATE")
    return "Sách này hiện chưa thể giữ để mua. Hãy tải lại trang.";
  if (error.status === 0)
    return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  return "Máy chủ chưa thể mở chat. Vui lòng thử lại sau.";
}
export function BookDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const state = useSession();
  const valid = /^[0-9a-f-]{36}$/i.test(id);
  const detail = useQuery({
    queryKey: ["public-listing", id],
    queryFn: () => getPublicListing(id),
    enabled: valid,
    retry: false,
  });
  const conversations = useQuery({
    queryKey: ["purchase-conversations"],
    queryFn: getPurchaseConversations,
    enabled: state.status === "authenticated",
    retry: false,
  });
  const [photoIndex, setPhotoIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const purchaseIntent = useRef<{
    listingId: string;
    version: number;
    key: ReturnType<typeof crypto.randomUUID>;
  } | null>(null);
  const back = (
    <Link className={styles.back} to={ROUTES.search}>
      ← Về kệ sách
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
  const held = book.purchaseAvailability.status === "InNegotiation";
  const isOwner =
    state.status === "authenticated" && state.user.id === book.seller.id;
  const activeConversation = conversations.data?.find(
    (conversation) =>
      conversation.listingId === book.id && conversation.status === "Active",
  );
  function requestPurchase() {
    if (state.status !== "authenticated") {
      navigate(
        ROUTES.login +
          "?returnUrl=" +
          encodeURIComponent(ROUTES.bookDetail(book.id)),
      );
      return;
    }
    if (isOwner) return;
    if (purchaseIntent.current?.listingId !== book.id) {
      purchaseIntent.current = {
        listingId: book.id,
        version: book.version,
        key: crypto.randomUUID(),
      };
    }
    setError(null);
    setConfirming(true);
  }
  async function confirmPurchase() {
    setBusy(true);
    setError(null);
    try {
      const intent = purchaseIntent.current!;
      const receipt = await startPurchaseConversation(
        intent.listingId,
        intent.version,
        intent.key,
      );
      navigate(ROUTES.chat(receipt.entityId));
    } catch (caught) {
      setError(purchaseError(caught));
    } finally {
      setBusy(false);
    }
  }
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
        <section aria-label="Ảnh bản sách" className={styles.gallery}>
          <div className={styles.coverPanel}>
            <ListingPhoto
              key={book.id + ":" + photoIndex}
              book={book}
              photoIndex={photoIndex}
              eager
            />
          </div>
          {book.photos.length > 1 && (
            <div className={styles.photoChoices}>
              {book.photos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setPhotoIndex(index)}
                  aria-pressed={photoIndex === index}
                  aria-label={"Xem ảnh " + (index + 1)}
                >
                  Ảnh {index + 1}
                </button>
              ))}
            </div>
          )}
          <p>Ảnh do người đăng cung cấp.</p>
        </section>
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
            {held && <span>Đang giao dịch</span>}
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
                {isOwner
                  ? "Đây là bài đăng của bạn"
                  : held
                    ? "Sách đang được giữ"
                    : "Muốn đọc cuốn này?"}
              </h2>
              <p>
                {isOwner
                  ? "Bạn có thể theo dõi cuộc trò chuyện khi có người giữ sách."
                  : held
                    ? "Một cuộc trao đổi đang diễn ra" +
                      (book.purchaseAvailability.expiresAt
                        ? " đến " +
                          new Date(
                            book.purchaseAvailability.expiresAt,
                          ).toLocaleString("vi-VN")
                        : "") +
                      "."
                    : "Giữ sách trong 24 giờ để chat với người bán và thống nhất việc mua. Bước này chưa thanh toán."}
              </p>
              {activeConversation ? (
                <Link
                  className={styles.primary}
                  to={ROUTES.chat(activeConversation.id)}
                >
                  <MessageCircle size={18} aria-hidden="true" />
                  {isOwner ? "Mở chat với người mua" : "Mở chat với người bán"}
                </Link>
              ) : (
                !isOwner && (
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={
                      held ||
                      detail.isFetching ||
                      detail.isError ||
                      state.status === "loading"
                    }
                    onClick={requestPurchase}
                  >
                    {held ? "Đang giao dịch" : "Giữ sách và mở chat"}
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </button>
                )
              )}
            </section>
          )}
          {book.mode === "Exchange" && (
            <p className={styles.exchangeNote}>
              Bạn đang xem sách để đổi. Luồng gửi đề nghị đổi trên web chưa kết
              nối API.
            </p>
          )}
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
          <section className={styles.details}>
            <h2>Thông tin sách</h2>
            <dl>
              <div>
                <dt>Thể loại</dt>
                <dd>{book.book.category || "Chưa ghi rõ"}</dd>
              </div>
              <div>
                <dt>Ngôn ngữ</dt>
                <dd>{book.book.language}</dd>
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
                ? "Giao hàng mô phỏng trong TP.HCM."
                : "Bài đăng chưa cấu hình giao nhận."}
            </p>
            <p className={styles.note}>
              Ảnh và tình trạng do người đăng cung cấp; kiểm duyệt bài đăng
              không xác nhận tình trạng vật lý.
            </p>
          </section>
        </article>
      </div>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Giữ sách và mở chat?"
        description="Sách sẽ được giữ trong 24 giờ. Chỉ bạn và người bán tham gia chat này. Bước này chưa phát sinh thanh toán."
        confirmText="Giữ sách và mở chat"
        onConfirm={() => void confirmPurchase()}
        isBusy={busy}
      >
        {error && <p role="alert">{error}</p>}
      </ConfirmDialog>
    </div>
  );
}
