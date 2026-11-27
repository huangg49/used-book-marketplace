import { useLayoutEffect, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeftRight, ArrowUpRight, BookOpen, Clock3, HandCoins, MessagesSquare, RefreshCw, UserRound } from "lucide-react";
import { ApiError } from "@used-books/session-client";
import { useTransactionLive } from "../../hooks/useTransactionLive";
import {
  getPurchaseConversation,
  type PurchaseConversation,
} from "../../services/purchase-conversations";
import {
  useConversationTransition,
  useInboxPosition,
  type InboxFilter,
} from "./conversation-navigation";
import { getPublicListing } from "../../services/public-listings";
import { getExchanges, type Exchange } from "../../services/exchange";
import { ListingPhoto } from "../BookCard";
import { formatVnd } from "../../lib/routes";
import { useNearViewport } from "../../hooks/useNearViewport";
import card from "./TransactionCard.module.css";

type Tone = "attention" | "progress" | "complete" | "closed";
/** Where the conversation stands, from the viewer's side. */
function roomStatus(room: PurchaseConversation, userId: string): { label: string; tone: Tone } {
  const pending = room.terms?.pendingProposal;
  if (pending)
    return pending.proposedById === userId
      ? { label: "Chờ đối tác phản hồi", tone: "progress" }
      : { label: "Cần bạn phản hồi", tone: "attention" };
  if (room.status === "OrderCreated") return { label: "Đã tạo đơn", tone: "complete" };
  if (room.status === "Expired") return { label: "Hết hạn", tone: "closed" };
  if (room.status === "Cancelled") return { label: "Đã đóng", tone: "closed" };
  return room.terms?.agreedPrice != null
    ? { label: "Đã thống nhất giá", tone: "progress" }
    : { label: "Đang trao đổi", tone: "progress" };
}
const day = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));

function ConversationCard({
  room,
  userId,
  index,
}: {
  room: PurchaseConversation;
  userId: string;
  /** Position in the list, for the staggered entrance. */
  index: number;
}) {
  const href = `/chat/${room.id}`;
  const transitioning = useConversationTransition(href);
  const position = useInboxPosition();
  const cache = useQueryClient();
  const { ref, active } = useNearViewport<HTMLElement>(false, { once: true });
  const [engaged, setEngaged] = useState(false);
  const prepare = () => {
    setEngaged(true);
    void cache.prefetchQuery({
      queryKey: ["purchase-conversation", room.id, userId],
      queryFn: () => getPurchaseConversation(room.id),
      staleTime: 15000,
    });
  };
  const remember = () => {
    position.save({ scrollY: window.scrollY, selectedId: room.id });
  };
  const book = useQuery({
    queryKey: ["public-listing", room.listingId],
    queryFn: () => getPublicListing(room.listingId),
    enabled: active || engaged,
    retry: false,
    staleTime: 60000,
  });
  const unavailable = book.error instanceof ApiError && [403, 404].includes(book.error.status);
  const visibleBook = unavailable ? undefined : book.data;
  const buyer = room.buyer.id === userId,
    partner = buyer ? room.seller : room.buyer;
  const status = roomStatus(room, userId);
  const pending = room.terms?.pendingProposal;
  const exchangeMode = room.terms?.mode === "Exchange";
  const hint = pending
    ? pending.proposedById === userId
      ? <>Bạn đã gửi đề nghị{pending.amount != null && <> <b>{formatVnd(pending.amount)}</b></>}; chờ đối tác phản hồi.</>
      : <><b>Đối tác gửi đề nghị</b>{pending.amount != null && <> giá <b>{formatVnd(pending.amount)}</b></>}; đang chờ bạn.</>
    : room.terms?.agreedPrice != null
      ? <>Đã thống nhất <b>{formatVnd(room.terms.agreedPrice)}</b>.</>
      : null;
  return (
    <article
      ref={ref}
      className={card.card}
      data-tone={status.tone}
      data-room-id={room.id}
      data-chat-morph-card={transitioning || undefined}
      style={{ "--i": index } as CSSProperties}
      onPointerEnter={prepare}
      onFocus={prepare}
    >
      <div className={card.top}>
        <span className={card.kind} data-kind={exchangeMode ? "exchange" : "buy"}>
          {exchangeMode ? <ArrowLeftRight size={13} aria-hidden="true" /> : <HandCoins size={13} aria-hidden="true" />}
          {exchangeMode ? "Đổi sách" : "Mua bán"} · {buyer ? "Bạn mua" : "Bạn bán"}
        </span>
        <span className={card.status}>{status.label}</span>
      </div>
      <div className={card.main}>
        <div className={card.cover} data-conversation-cover>
          {visibleBook ? (
            <ListingPhoto book={visibleBook} />
          ) : (
            <BookOpen size={26} aria-hidden="true" />
          )}
        </div>
        <div>
          <h3 className={card.title} data-conversation-title>
            <Link
              to={href}
              viewTransition
              state={{ chatFromInbox: true }}
              onClick={remember}
            >
              {visibleBook?.bundle?.title ?? visibleBook?.book.title ??
                (book.isPending
                  ? "Đang tải tên sách…"
                  : unavailable ? "Bài đăng không còn công khai" : "Chưa tải được tên sách")}
            </Link>
          </h3>
          <p className={card.who}>
            <UserRound size={14} aria-hidden="true" />
            {buyer ? "Người bán" : "Người mua"} · <b>{partner.displayName}</b>
          </p>
        </div>
      </div>
      {book.isError && (
        <div role="alert" className={card.callout}>
          <span>{unavailable
            ? "Bài đăng không còn truy cập được. Bạn vẫn mở được hội thoại."
            : visibleBook
              ? "Chưa cập nhật được thông tin sách; đang hiện lần tải trước."
              : "Chưa tải được thông tin sách; hội thoại vẫn mở được."}</span>
          <button type="button" disabled={book.isFetching} onClick={() => void book.refetch()}>
            Tải lại thông tin sách
          </button>
        </div>
      )}
      {hint && <p className={card.callout}><Clock3 size={15} aria-hidden="true" /><span>{hint}</span></p>}
      <div className={card.foot}>
        <span className={card.footNote}>Từ <time dateTime={room.createdAt}>{day(room.createdAt)}</time></span>
        <Link
          className={card.go}
          to={href}
          viewTransition
          state={{ chatFromInbox: true }}
          onClick={remember}
        >
          Mở cuộc trao đổi <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
function LegacyCard({ exchange, userId, index }: { exchange: Exchange; userId: string; index: number }) {
  const id = exchange.id;
  const transitioning = useConversationTransition(`/exchange/${id}`);
  const position = useInboxPosition();
  const remember = () => {
    position.save({ scrollY: window.scrollY, selectedId: id });
  };
  const initiator = exchange.initiatorId === userId;
  const initiatorIds = exchange.initiatorListingIds?.length
    ? exchange.initiatorListingIds
    : [exchange.initiatorListingId];
  const receivedIds = initiator
    ? [exchange.recipientListingId]
    : initiatorIds;
  const snapshots = exchange.agreement
    ? [...exchange.agreement.initiatorBooks, exchange.agreement.recipientBook]
    : [];
  const title = receivedIds.map(listingId => {
    const book = snapshots.find(snapshot => snapshot.listingId === listingId);
    return book?.book.title ?? "Hồ sơ cũ — thiếu bản chụp sách";
  }).join(", ");
  const partnerName = initiator
    ? exchange.agreement?.recipientBook.ownerDisplayName
    : exchange.agreement?.initiatorBooks[0]?.ownerDisplayName;
  const partner = partnerName ?? "Đối tác trao đổi";
  return (
    <article
      className={card.card}
      data-tone="closed"
      data-room-id={id}
      data-chat-morph-card={transitioning || undefined}
      style={{ "--i": index } as CSSProperties}
    >
      <div className={card.top}>
        <span className={card.kind} data-kind="exchange">
          <ArrowLeftRight size={13} aria-hidden="true" /> Đổi sách
        </span>
        <span className={card.status}>Lịch sử hiện có</span>
      </div>
      <div className={card.main}>
        <div className={card.cover} data-swap>
          <ArrowLeftRight size={24} aria-hidden="true" />
        </div>
        <div>
          <h3 className={card.title}>
            <Link
              to={`/exchange/${id}`}
              viewTransition
              state={{ chatFromInbox: true }}
              onClick={remember}
            >
              {title || "Cuộc trao đổi sách"}
            </Link>
          </h3>
          <p className={card.who}>
            <UserRound size={14} aria-hidden="true" /> Với <b>{partner}</b>
          </p>
        </div>
      </div>
      <div className={card.foot}>
        <span className={card.footNote}>Từ <time dateTime={exchange.createdAt}>{day(exchange.createdAt)}</time></span>
        <Link
          className={card.go}
          to={`/exchange/${id}`}
          viewTransition
          state={{ chatFromInbox: true }}
          onClick={remember}
        >
          Mở phiếu và hội thoại <ArrowUpRight size={15} aria-hidden="true" />
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
  showExchanges = true,
}: {
  rooms: PurchaseConversation[];
  loading: boolean;
  error: boolean;
  retry: () => void;
  userId: string;
  /** False when the exchange transactions are listed in their own category. */
  showExchanges?: boolean;
}) {
  const position = useInboxPosition();
  // The chat page invalidates this list on inbox pushes; poll only as a backstop.
  const live = useTransactionLive("inbox", userId, () => {});
  const exchanges = useQuery({
    queryKey: ["conversation-exchanges", userId],
    queryFn: getExchanges,
    retry: false,
    refetchInterval: live ? 30_000 : 5_000,
    enabled: showExchanges,
  });
  const [filter] = useState<InboxFilter>(position.read().filter),
    [visible, setVisible] = useState(position.read().visible);
  useLayoutEffect(() => {
    const rememberScroll = () => {
      if (window.location.pathname === "/chat")
        position.save({ scrollY: window.scrollY });
    };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => window.removeEventListener("scroll", rememberScroll);
  }, [position]);
  const linked = new Set(rooms.flatMap((r) => r.terms?.exchangeIds ?? []));
  const legacy = !showExchanges
    ? []
    : (exchanges.data?.items.filter(
      (x) =>
        !linked.has(x.id) &&
        (filter === "all" ||
          (filter === "buyer"
            ? x.initiatorId === userId
            : x.recipientId === userId)),
    ) ?? []);
  const filtered = rooms.filter(
    (r) =>
      filter === "all" ||
      (filter === "buyer" ? r.buyer.id === userId : r.seller.id === userId),
  );
  return (
    <section className={card.inbox} aria-label="Danh sách hội thoại">
      {loading && <p className={card.state} role="status">Đang tải hội thoại…</p>}
      {error && (
        <p className={card.state} role="alert">
          Chưa tải được hội thoại mua bán.
          <button type="button" onClick={retry}><RefreshCw size={14} aria-hidden="true" /> Thử lại</button>
        </p>
      )}
      {showExchanges && exchanges.isError && (
        <p className={card.state} role="alert">
          Chưa tải được danh sách đổi sách.
          <button type="button" onClick={() => void exchanges.refetch()}><RefreshCw size={14} aria-hidden="true" /> Thử lại</button>
        </p>
      )}
      {!loading &&
        !error &&
        !filtered.length &&
        !legacy.length &&
        (!showExchanges || (!exchanges.isPending && !exchanges.isError)) && (
          <div className={card.empty}>
            <img src="/illustrations/chat/empty-inbox.svg" alt="" width={160} height={120} />
            <h3>Chưa có cuộc trao đổi nào</h3>
            <p>Mở một cuốn sách để <b>hỏi mua</b> hoặc <b>gửi ý định đổi</b>; cuộc trao đổi được lưu tại đây.</p>
            <Link className={card.go} to="/books?data=live">
              <MessagesSquare size={15} aria-hidden="true" /> Tìm một cuốn sách
            </Link>
          </div>
        )}
      <div className={card.grid}>
        {filtered.slice(0, visible).map((room, index) => (
          <ConversationCard key={room.id} room={room} userId={userId} index={index} />
        ))}
        {legacy.slice(0, Math.max(0, visible - filtered.length)).map((ex, index) => (
          <LegacyCard key={ex.id} exchange={ex} userId={userId} index={filtered.length + index} />
        ))}
      </div>
      {filtered.length + legacy.length > visible && (
        <button
          type="button"
          className={card.more}
          onClick={() => {
            const next = visible + 12;
            position.save({ visible: next });
            setVisible(next);
          }}
        >
          Xem thêm cuộc trao đổi
        </button>
      )}
    </section>
  );
}
