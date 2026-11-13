import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Clock, Copy, ExternalLink } from "lucide-react";
import { exchangeHandoverAnchor, type HandoverNavigation } from "../../../lib/exchange-handover";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { CARRIERS, getTrackingUrl } from "../../../services/exchangeShipment";
import { BookCover } from "../../BookCover";
import styles from "./ShippingTrackingCard.module.css";

type Direction = "outgoing" | "incoming";

interface Props extends Partial<HandoverNavigation> {
  detail: ExchangeDetail;
  sendAction?: ReactNode;
  receiveAction?: ReactNode;
  canSend?: boolean;
  shippingExpired?: boolean;
}

const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function HandoverTime({ value }: { value: string }) {
  return <time dateTime={value}>{dateFormat.format(new Date(value))}</time>;
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [feedback, setFeedback] = useState<"copied" | "error">();
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(undefined), 2500);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  return (
    <span className={styles.copy}>
      <button type="button" aria-label={label} title={label} onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setFeedback("copied");
        } catch {
          setFeedback("error");
        }
      }}>
        {feedback === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
      <span role="status">{feedback === "copied" ? "Đã sao chép" : feedback === "error" ? "Sao chép thất bại" : ""}</span>
    </span>
  );
}

function ShippingLeg({ detail, direction, action, canSend, shippingExpired, navigationKey, targeted }: {
  detail: ExchangeDetail;
  direction: Direction;
  action: ReactNode;
  canSend?: boolean;
  shippingExpired?: boolean;
  navigationKey?: string;
  targeted: boolean;
}) {
  const row = useRef<HTMLElement>(null);
  const journey = useRef<HTMLDetailsElement>(null);
  const outgoing = direction === "outgoing";
  const id = exchangeHandoverAnchor[direction];

  useEffect(() => {
    if (!targeted) return;
    const frame = requestAnimationFrame(() => {
      if (journey.current) journey.current.open = true;
      row.current?.focus({ preventScroll: true });
      row.current?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [targeted, navigationKey]);

  const { sentAt } = outgoing ? detail.viewerShipping : detail.partnerShipping;
  const { receivedAt } = outgoing ? detail.partnerShipping : detail.viewerShipping;
  const inspectionDeadline = outgoing ? detail.partnerInspectionDeadline : detail.viewerInspectionDeadline;
  const shipment = sentAt ? (outgoing ? detail.viewerShipment : detail.partnerShipment) : undefined;
  const address = outgoing ? detail.partnerAddress : detail.viewerAddress;
  const books = outgoing ? detail.giveBooks : detail.receiveBooks;
  const addressText = address ? [address.detail, address.localityCode].filter(Boolean).join(", ") : "";
  const carrier = CARRIERS.find(item => item.code === shipment?.carrierCode);
  const trackingCode = shipment?.trackingCode;
  const trackingUrl = getTrackingUrl(carrier?.code, trackingCode ?? undefined);
  const hasJourney = Boolean(address || sentAt || receivedAt);
  const expired = outgoing && shippingExpired && !sentAt;
  const inTransit = detail.status === "WAITING_YOU_CONFIRM" || detail.status === "DELIVERING";
  const status = receivedAt ? (outgoing ? "Đối tác đã nhận" : "Bạn đã nhận sách")
    : sentAt ? (shipment?.method === "direct" ? "Đã ghi nhận điểm hẹn"
      : inTransit ? "Đang giao nhận" : trackingCode ? "Đã ghi nhận vận đơn" : "Đã xác nhận gửi")
    : expired ? "Đã hết hạn gửi"
    : outgoing ? (canSend ? "Chờ bạn tạo đơn" : "Chưa gửi sách") : "Chờ đối tác gửi";
  const Icon = outgoing ? ArrowUpRight : ArrowDownLeft;

  return (
    <section ref={row} id={id} className={styles.leg} data-direction={direction}
      tabIndex={-1} aria-labelledby={`${id}-title`}>
      <div className={styles.legMain}>
        <div className={styles.direction}>
          <Icon size={23} aria-hidden="true" />
          <div>
            <h2 id={`${id}-title`}>{outgoing ? "Bạn gửi" : "Bạn nhận"}</h2>
            <p>{books.length ? `${books.length} cuốn` : "Sách trong phiếu"}</p>
          </div>
        </div>
        <div className={styles.books}>
          {books.length ? (
            <ul className={styles.visibleBooks} aria-label={outgoing ? "Sách bạn gửi" : "Sách bạn nhận"}>
              {books.slice(0, 2).map((book, index) => (
                <li className={styles.book} key={book.id}>
                  <div aria-hidden="true"><BookCover title={book.title} index={index} coverUrl={book.coverUrl} className={styles.cover} /></div>
                  <div className={styles.bookText}>
                    <strong dir="auto" title={book.title}>{book.title}</strong>
                    {book.author && <span dir="auto" title={book.author}>{book.author}</span>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className={styles.muted}>Chưa có thông tin sách.</p>}
          {books.length > 2 && (
            <details className={styles.moreBooks}>
              <summary>Xem {books.length - 2} cuốn còn lại <ChevronDown size={15} aria-hidden="true" /></summary>
              <ul>
                {books.slice(2).map(book => <li key={book.id} title={book.title} dir="auto">{book.title}</li>)}
              </ul>
            </details>
          )}
        </div>
        <div className={styles.next}>
          <p className={styles.status} data-state={receivedAt ? "received" : expired ? "expired" : sentAt ? "sent" : "waiting"}>
            {receivedAt ? <Check size={16} aria-hidden="true" /> : <Clock size={15} aria-hidden="true" />}
            {status}
          </p>
          {action}
          {receivedAt && inspectionDeadline && (
            <p className={styles.muted}>{outgoing ? "Hạn kiểm tra của đối tác " : "Hạn kiểm tra "}<HandoverTime value={inspectionDeadline} /></p>
          )}
        </div>
      </div>
      {hasJourney && (
        <details ref={journey} className={styles.journey}>
          <summary>{!sentAt && !receivedAt ? "Xem địa chỉ nhận" : "Xem hành trình"} <ChevronDown size={16} aria-hidden="true" /></summary>
          <div className={styles.journeyBody}>
            {address && (
              <div className={styles.address}>
                <h3>{outgoing ? "Địa chỉ nhận của đối tác" : "Địa chỉ nhận của bạn"}</h3>
                <p>{address.recipientName} · {address.phone}</p>
                <p>{addressText}</p>
                <CopyValue value={`${address.recipientName} · ${address.phone}, ${addressText}`} label="Sao chép địa chỉ" />
              </div>
            )}
            {(sentAt || receivedAt) && (
              <div className={styles.tracking}>
                <h3>{shipment?.method === "direct" ? "Giao trực tiếp" : shipment?.carrierName || carrier?.name || "Thông tin giao nhận"}</h3>
                {shipment?.meetupLocation && <p>{shipment.meetupLocation}</p>}
                {trackingCode && (
                  <div className={styles.trackingCode}>
                    <div><span>Mã vận đơn</span><strong>{trackingCode}</strong></div>
                    <CopyValue value={trackingCode} label="Sao chép mã vận đơn" />
                    {trackingUrl && <a href={trackingUrl} target="_blank" rel="noreferrer">Tra cứu tại hãng <ExternalLink size={14} aria-hidden="true" /></a>}
                  </div>
                )}
                <ol className={styles.timeline}>
                  {sentAt && <li><span>{shipment?.method === "direct" ? "Đã ghi nhận điểm hẹn" : "Đã ghi nhận gửi sách"}</span><HandoverTime value={sentAt} /></li>}
                  {shipment?.lastEvent && <li><span>{shipment.lastEvent}</span>{shipment.lastEventAt && <HandoverTime value={shipment.lastEventAt} />}</li>}
                  {receivedAt && <li><span>{outgoing ? "Đối tác đã nhận sách" : "Bạn đã nhận sách"}</span><HandoverTime value={receivedAt} /></li>}
                </ol>
                {shipment?.notes && <p className={styles.notes}>{shipment.notes}</p>}
                {carrier?.hotline && <p className={styles.muted}>Tổng đài vận chuyển {carrier.hotline}</p>}
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  );
}

export function ShippingTrackingCard({ detail, sendAction, receiveAction, canSend, shippingExpired, target, navigationKey }: Props) {
  const overview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (target !== exchangeHandoverAnchor.overview) return;
    const frame = requestAnimationFrame(() => {
      overview.current?.focus({ preventScroll: true });
      overview.current?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [target, navigationKey]);

  if (["PENDING", "FUNDING", "CANCELLED", "REJECTED", "EXPIRED"].includes(detail.status)) return null;

  return (
    <div ref={overview} id={exchangeHandoverAnchor.overview} className={styles.legs}
      role="region" aria-label="Giao nhận hai chiều" tabIndex={-1}>
      <ShippingLeg detail={detail} direction="outgoing" action={sendAction}
        canSend={canSend} shippingExpired={shippingExpired}
        targeted={target === exchangeHandoverAnchor.outgoing} navigationKey={navigationKey} />
      <ShippingLeg detail={detail} direction="incoming" action={receiveAction}
        targeted={target === exchangeHandoverAnchor.incoming} navigationKey={navigationKey} />
    </div>
  );
}
