import { useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeftRight, ArrowUpRight, HandCoins } from "lucide-react";
import { ApiError } from "@used-books/session-client";
import {
  getPurchaseConversation,
  type PurchaseConversation,
} from "../../services/purchase-conversations";
import {
  useConversationTransition,
  useInboxPosition,
} from "./conversation-navigation";
import { getPublicListing } from "../../services/public-listings";
import type { Exchange } from "../../services/exchange";
import { ListingPhoto } from "../BookCard";
import { useNearViewport } from "../../hooks/useNearViewport";
import card from "./TransactionCard.module.css";
import { PartnerChip } from "./PartnerChip";
import { ExchangeCard } from "./ExchangeCard";
import { BookTitle, Figures, NextStep } from "./CardParts";
import { conversationNext, conversationStats, conversationRoles, conversationStatus, dayMonth, shortDate } from "./transaction-status";

export function ConversationCard({
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
  const roles = conversationRoles(room, userId);
  const partner = roles.partner;
  const status = conversationStatus(room, userId);
  const stats = conversationStats(room, visibleBook?.salePrice);
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
        <span className={card.kind} data-kind={roles.exchange ? "exchange" : "buy"}>
          {roles.exchange ? <ArrowLeftRight size={13} aria-hidden="true" /> : <HandCoins size={13} aria-hidden="true" />}
          {roles.exchange ? "Đổi sách" : "Mua bán"}
        </span>
        <span className={card.status}>{status.label}</span>
      </div>
      <div className={card.main}>
        <div className={card.cover} data-conversation-cover>
          {visibleBook?.photos.length ? (
            <ListingPhoto book={visibleBook} />
          ) : (
            <img src="/illustrations/chat/no-cover.svg" alt="" width={64} height={88} />
          )}
        </div>
        <div>
          <BookTitle
            morph
            text={visibleBook?.bundle?.title ?? visibleBook?.book.title ??
              (book.isPending
                ? "Đang tải tên sách…"
                : unavailable ? "Bài đăng không còn công khai" : "Chưa tải được tên sách")}
          />
          <PartnerChip id={partner.id} name={partner.displayName} role={roles.theirs} />
          {book.isError && (
            <div role="alert" className={card.inlineAlert}>
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
          <Figures main={stats.main} side={stats.side} />
        </div>
      </div>
      <NextStep>{conversationNext(room, userId)}</NextStep>
      <div className={card.foot}>
        <span className={card.footNote}>{roles.mine} · <time dateTime={room.createdAt} title={shortDate(room.createdAt)}>{dayMonth(room.createdAt)}</time></span>
        <Link
          className={card.go}
          data-stretch
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
export function LegacyCard({ exchange, userId, index }: { exchange: Exchange; userId: string; index: number }) {
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
  return (
    <ExchangeCard
      exchange={exchange}
      userId={userId}
      index={index}
      title={title || "Cuộc trao đổi sách"}
      roomId={id}
      morphing={transitioning}
      open={{ to: `/exchange/${id}`, label: "Mở phiếu và hội thoại", state: { chatFromInbox: true }, onClick: remember }}
    />
  );
}
