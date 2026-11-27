import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, ArrowUpRight } from "lucide-react";
import type { Exchange } from "../../services/exchange";
import { PartnerChip } from "./PartnerChip";
import { BookTitle, Figures, NextStep } from "./CardParts";
import { exchangeNext, exchangeStats, exchangePartner, exchangeStatus, dayMonth, shortDate } from "./transaction-status";
import card from "./TransactionCard.module.css";

/**
 * One exchange on the /chat hub: used by the Đổi sách tab and, for exchanges
 * with no conversation of their own, by the conversation list.
 */
export function ExchangeCard({ exchange, userId, index, title, open, conversationHref, roomId, morphing }: {
  exchange: Exchange;
  userId: string;
  index: number;
  title: string;
  /** The main link: the exchange page. */
  open: { to: string; label: string; state?: unknown; onClick?: () => void };
  /** The conversation this exchange came from, when there is one. */
  conversationHref?: string;
  /** Set when listed among conversations (keeps inbox position and transitions). */
  roomId?: string;
  morphing?: boolean;
}) {
  const status = exchangeStatus(exchange, userId);
  const partner = exchangePartner(exchange, userId);
  const partnerId = exchange.agreement ? (exchange.initiatorId === userId ? exchange.recipientId : exchange.initiatorId) : undefined;
  const mine = exchange.initiatorId === userId;
  const stats = exchangeStats(exchange, userId);
  return (
    <article
      className={card.card}
      data-tone={status.tone}
      data-room-id={roomId}
      data-chat-morph-card={morphing || undefined}
      style={{ "--i": index } as CSSProperties}
    >
      <div className={card.top}>
        <span className={card.kind} data-kind="exchange">
          <ArrowLeftRight size={13} aria-hidden="true" /> Đổi sách
        </span>
        <span className={card.status}>{status.label}</span>
      </div>
      <div className={card.main}>
        <span className={card.cover} aria-hidden="true">
          <img src="/illustrations/chat/swap-cover.svg" alt="" width={64} height={88} />
        </span>
        <div>
          <BookTitle text={title} />
          <PartnerChip id={partnerId} name={partner} role={mine ? "Chủ sách" : "Người đề nghị đổi"} />
          <Figures main={stats.main} side={stats.side} />
        </div>
      </div>
      <NextStep>{exchangeNext(exchange)}</NextStep>
      <div className={card.foot}>
        <span className={card.footNote}>{mine ? "Bạn đề nghị" : "Bạn nhận đề nghị"} · <time dateTime={exchange.createdAt} title={shortDate(exchange.createdAt)}>{dayMonth(exchange.createdAt)}</time></span>
        <span className={card.actions}>
          {conversationHref && (
            <Link className={card.ghost} to={conversationHref} viewTransition>Hội thoại</Link>
          )}
          <Link className={card.go} data-stretch to={open.to} viewTransition state={open.state} onClick={open.onClick}>
            {open.label} <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </span>
      </div>
    </article>
  );
}
