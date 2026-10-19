import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, BookOpen, MessageCircle } from "lucide-react";
import type { PurchaseConversation } from "../../services/purchase-conversations";
import { getPublicListing } from "../../services/public-listings";
import { getExchanges } from "../../services/exchange";
import { getExchangeDetail } from "../../services/exchangeDetail";
import { ListingPhoto } from "../BookCard";
import { formatVnd } from "../../lib/routes";
import styles from "./Conversation.module.css";

const states = {
  Active: "Đang trao đổi",
  OrderCreated: "Đã tạo đơn",
  Expired: "Hết hạn",
  Cancelled: "Đã đóng",
};
function ConversationCard({
  room,
  userId,
}: {
  room: PurchaseConversation;
  userId: string;
}) {
  const book = useQuery({
    queryKey: ["public-listing", room.listingId],
    queryFn: () => getPublicListing(room.listingId),
    retry: false,
    staleTime: 60000,
  });
  const buyer = room.buyer.id === userId,
    partner = buyer ? room.seller : room.buyer;
  const hint = room.terms?.pendingProposal
    ? room.terms.pendingProposal.proposedById === userId
      ? "Chờ đối tác phản hồi đề nghị của bạn"
      : "Có đề nghị đang chờ bạn phản hồi"
    : room.terms?.agreedPrice != null
      ? `Đã thống nhất ${formatVnd(room.terms.agreedPrice)}`
      : null;
  return (
    <article className={styles.inboxCard}>
      <div className={styles.cardIdentity}>
        <div className={styles.cardCover}>
          {book.data ? (
            <ListingPhoto book={book.data} />
          ) : (
            <BookOpen size={28} aria-hidden="true" />
          )}
        </div>
        <div className={styles.cardBody}>
          <h2>
            <Link to={`/chat/${room.id}`}>
              {book.data?.book.title ??
                (book.isPending
                  ? "Đang tải tên sách…"
                  : "Bài đăng không còn công khai")}
            </Link>
          </h2>
          <p className={styles.cardPartner}>
            {buyer ? "Người bán" : "Người mua"} ·{" "}
            <span>{partner.displayName}</span>
          </p>
          <p className={styles.cardMode}>
            {room.terms?.mode === "Exchange" ? "Đổi sách" : "Mua bán"}
          </p>
        </div>
      </div>
      {hint && <p className={styles.cardHint}>{hint}</p>}
      <div className={styles.cardFooter}>
        <p className={styles.cardStatus}>{states[room.status]}</p>
        <Link className={styles.cardLink} to={`/chat/${room.id}`}>
          Mở cuộc trao đổi <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
function LegacyCard({ id }: { id: string }) {
  const detail = useQuery({
    queryKey: ["exchangeDetail", id],
    queryFn: () => getExchangeDetail(id),
    retry: false,
    staleTime: 30000,
  });
  return (
    <article className={styles.legacyCard}>
      <div className={styles.cardIdentity}>
        <div className={styles.cardCover}>
          <BookOpen size={24} aria-hidden="true" />
        </div>
        <div className={styles.cardBody}>
          <h2>
            <Link to={`/exchange/${id}`}>
              {detail.data?.receiveBooks.map((b) => b.title).join(", ") ||
                "Cuộc trao đổi sách"}
            </Link>
          </h2>
          <p className={styles.cardPartner}>
            {detail.data
              ? `Với ${detail.data.partner.username}`
              : detail.isError
                ? "Chưa tải được tên đối tác; mở để thử lại."
                : "Đang tải thông tin…"}
          </p>
          <p className={styles.cardMode}>Đổi sách</p>
        </div>
      </div>
      <div className={styles.cardFooter}>
        <p className={styles.cardStatus}>Lịch sử hiện có</p>
        <Link className={styles.cardLink} to={`/exchange/${id}`}>
          Mở phiếu và hội thoại <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
export function ConversationInbox({
  rooms,
  loading,
  error,
  retry,
  userId,
}: {
  rooms: PurchaseConversation[];
  loading: boolean;
  error: boolean;
  retry: () => void;
  userId: string;
}) {
  const exchanges = useQuery({
    queryKey: ["conversation-exchanges", userId],
    queryFn: getExchanges,
    retry: false,
    refetchInterval: 5000,
  });
  const [filter, setFilter] = useState<"all" | "buyer" | "seller">("all"),
    [visible, setVisible] = useState(12);
  const linked = new Set(rooms.flatMap((r) => r.terms?.exchangeIds ?? []));
  const legacy =
    exchanges.data?.items.filter(
      (x) =>
        !linked.has(x.id) &&
        (filter === "all" ||
          (filter === "buyer"
            ? x.initiatorId === userId
            : x.recipientId === userId)),
    ) ?? [];
  const filtered = rooms.filter(
    (r) =>
      filter === "all" ||
      (filter === "buyer" ? r.buyer.id === userId : r.seller.id === userId),
  );
  return (
    <section className={styles.inboxContent} aria-label="Danh sách hội thoại">
      <nav className={styles.filters} aria-label="Lọc hội thoại">
        {(
          [
            ["all", "Tất cả"],
            ["buyer", "Bạn hỏi mua / đổi"],
            ["seller", "Sách của bạn"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setVisible(12);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {loading && <p role="status">Đang tải hội thoại…</p>}
      {error && (
        <p role="alert">
          Chưa tải được hội thoại mua bán.{" "}
          <button type="button" onClick={retry}>
            Thử lại
          </button>
        </p>
      )}
      {exchanges.isError && (
        <p role="alert">
          Chưa tải được danh sách đổi sách.{" "}
          <button type="button" onClick={() => void exchanges.refetch()}>
            Thử lại
          </button>
        </p>
      )}
      {!loading &&
        !error &&
        !filtered.length &&
        !legacy.length &&
        !exchanges.isPending &&
        !exchanges.isError && (
          <div className={styles.empty}>
            <MessageCircle size={34} aria-hidden="true" />
            <h2>Chưa có cuộc trao đổi ở đây</h2>
            <p>
              Mở một cuốn sách để hỏi mua hoặc gửi ý định đổi. Cuộc trao đổi sẽ
              được lưu lại tại đây.
            </p>
            <Link to="/books?data=live">Tìm một cuốn sách</Link>
          </div>
        )}
      <div className={styles.inboxGrid}>
        {filtered.slice(0, visible).map((room) => (
          <ConversationCard key={room.id} room={room} userId={userId} />
        ))}
        {legacy.slice(0, Math.max(0, visible - filtered.length)).map((ex) => (
          <LegacyCard key={ex.id} id={ex.id} />
        ))}
      </div>
      {filtered.length + legacy.length > visible && (
        <button
          type="button"
          className={styles.loadMore}
          onClick={() => setVisible((n) => n + 12)}
        >
          Xem thêm cuộc trao đổi
        </button>
      )}
    </section>
  );
}
