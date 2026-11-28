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
import { orderBookPhotoOptions, orderDetailsOptions } from "../../services/orders";
import type { Exchange } from "../../services/exchange";
import { ListingPhoto } from "../BookCard";
import { useNearViewport } from "../../hooks/useNearViewport";
import card from "./TransactionCard.module.css";
import { PartnerChip } from "./PartnerChip";
import { ExchangeCard } from "./ExchangeCard";
import { BookTitle, Figures, NextStep, TransactionBookPhoto } from "./CardParts";
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
    enabled: !room.orderId && (active || engaged),
    retry: false,
    staleTime: 60000,
  });
  const order = useQuery({
    ...orderDetailsOptions(userId, room.orderId),
    enabled: Boolean(room.orderId && (active || engaged)),
  });
  const read = room.orderId ? order : book;
  const unavailable = read.error instanceof ApiError && [403, 404].includes(read.error.status);
  const visibleBook = room.orderId || unavailable ? undefined : book.data;
  const item = room.orderId && !unavailable ? order.data?.item : undefined;
  const title = item?.bundle?.title ?? item?.metadata.title ?? visibleBook?.bundle?.title ?? visibleBook?.book.title;
  const unavailableTitle = room.orderId ? "Không xem được thông tin đơn hàng" : "Bài đăng không còn công khai";
  const unavailableMessage = room.orderId
    ? "Thông tin đơn hàng không còn truy cập được. Bạn vẫn mở được hội thoại."
    : "Bài đăng không còn truy cập được. Bạn vẫn mở được hội thoại.";
  const photoOptions = orderBookPhotoOptions(userId, room.orderId, item?.mediaIds?.[0]);
  const photo = useQuery({ ...photoOptions, enabled: active && photoOptions.enabled });
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
            <TransactionBookPhoto
              photo={photo.isError || unavailable ? undefined : photo.data}
              fallback="/illustrations/chat/no-cover.svg"
            />
          )}
        </div>
        <div>
          <BookTitle
            morph
            text={title ??
              (read.isPending
                ? "Đang tải tên sách…"
                : unavailable ? unavailableTitle : "Chưa tải được tên sách")}
          />
          <PartnerChip id={partner.id} name={partner.displayName} role={roles.theirs} />
          {read.isError && (
            <div role="alert" className={card.inlineAlert}>
              <span>{unavailable
                ? unavailableMessage
                : title
                  ? "Chưa cập nhật được thông tin sách; đang hiện lần tải trước."
                  : "Chưa tải được thông tin sách; hội thoại vẫn mở được."}</span>
              <button type="button" disabled={read.isFetching} onClick={() => void read.refetch()}>
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
