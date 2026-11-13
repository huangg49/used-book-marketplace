import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Clock, Copy, ExternalLink, MapPin, Route } from "lucide-react";
import { exchangeHandoverAnchor, type HandoverNavigation } from "../../../lib/exchange-handover";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { CARRIERS, getTrackingUrl } from "../../../services/exchangeShipment";
import { serviceAreasQuery } from "../../../services/service-areas";
import { BookCover } from "../../BookCover";
import styles from "./ShippingTrackingCard.module.css";

type Direction = "outgoing" | "incoming";

interface Props extends Partial<HandoverNavigation> {
  detail: ExchangeDetail;
  sendAction?: ReactNode;
  sendForm?: ReactNode;
  sendDeadline?: ReactNode;
  receiveAction?: ReactNode;
  history?: boolean;
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

function CopyValue({ value, label, showLabel = false }: { value: string; label: string; showLabel?: boolean }) {
  const [feedback, setFeedback] = useState<"copied" | "error">();
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(undefined), 2500);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  return (
    <span className={styles.copy} data-labeled={showLabel || undefined}>
      <button type="button" aria-label={label} title={label} onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setFeedback("copied");
        } catch {
          setFeedback("error");
        }
      }}>
        {feedback === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {showLabel && <span aria-hidden="true">{feedback === "copied" ? "Đã sao chép" : label}</span>}
      </button>
      <span role="status" className={showLabel && feedback !== "error" ? styles.visuallyHidden : undefined}>
        {feedback === "copied" ? "Đã sao chép" : feedback === "error" ? "Sao chép thất bại" : ""}
      </span>
    </span>
  );
}

function DeliveryAddress({ address, outgoing, open }: {
  address: NonNullable<ExchangeDetail["viewerAddress"]>;
  outgoing: boolean;
  open: boolean;
}) {
  const areas = useQuery({ ...serviceAreasQuery, enabled: open && Boolean(address.localityCode), retry: false });
  const locality = areas.data?.localities.find(item => item.code === address.localityCode)?.label;
  const street = address.detail.trim();
  const normalize = (value: string) => value.toLocaleLowerCase("vi").replace(/[.\s]/g, "");
  const addressText = locality && !normalize(street).endsWith(normalize(locality))
    ? [street, locality].filter(Boolean).join(", ")
    : street;
  const value = [address.recipientName, address.phone, addressText].filter(Boolean).join("\n");

  return (
    <div className={styles.address}>
      <div className={styles.addressInfo}>
        <h3>{outgoing ? "Địa chỉ nhận của đối tác" : "Địa chỉ nhận của bạn"}</h3>
        <p className={styles.contact}>
          <strong>{address.recipientName}</strong>
          <span>{address.phone}</span>
        </p>
        <p className={styles.street}>{addressText}</p>
      </div>
      <CopyValue value={value} label="Sao chép địa chỉ" showLabel />
    </div>
  );
}

function BookList({ books, start = 0, label }: {
  books: ExchangeDetail["giveBooks"];
  start?: number;
  label?: string;
}) {
  return (
    <ul className={styles.visibleBooks} aria-label={label}>
      {books.map((book, index) => (
        <li className={styles.book} key={book.id}>
          <div aria-hidden="true"><BookCover title={book.title} index={start + index} coverUrl={book.coverUrl} className={styles.cover} /></div>
          <div className={styles.bookText}>
            <strong dir="auto" title={book.title}>{book.title}</strong>
            {book.author && <span dir="auto" title={book.author}>{book.author}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ShippingLeg({ detail, direction, action, form, deadline, canSend, shippingExpired, navigationKey, targeted }: {
  detail: ExchangeDetail;
  direction: Direction;
  action: ReactNode;
  form?: ReactNode;
  deadline?: ReactNode;
  canSend?: boolean;
  shippingExpired?: boolean;
  navigationKey?: string;
  targeted: boolean;
}) {
  const row = useRef<HTMLElement>(null);
  const journey = useRef<HTMLDetailsElement>(null);
  const [journeyOpen, setJourneyOpen] = useState(false);
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
  const shipment = outgoing ? detail.viewerShipment : detail.partnerShipment;
  const registered = shipment?.method === "carrier" && Boolean(shipment.trackingCode);
  const otherShipment = outgoing ? detail.partnerShipment : detail.viewerShipment;
  const bothRegistered = registered && otherShipment?.method === "carrier" && Boolean(otherShipment.trackingCode);
  const closed = detail.status === "CANCELLED" || detail.status === "EXPIRED" || detail.status === "REJECTED";
  const address = closed ? undefined : outgoing ? detail.partnerAddress : detail.viewerAddress;
  const books = outgoing ? detail.giveBooks : detail.receiveBooks;
  const carrier = CARRIERS.find(item => item.code === shipment?.carrierCode);
  const trackingCode = shipment?.trackingCode;
  const trackingUrl = getTrackingUrl(carrier?.code, trackingCode ?? undefined);
  const hasJourney = Boolean(address || registered || sentAt || receivedAt);
  const expired = shippingExpired && !sentAt;
  const inTransit = detail.status === "WAITING_YOU_CONFIRM" || detail.status === "DELIVERING";
  const status = receivedAt ? (outgoing ? "Đối tác đã nhận" : "Bạn đã nhận sách")
    : sentAt ? (!outgoing && action ? "Chờ bạn xác nhận đã nhận"
      : shipment?.method === "direct" ? "Đã ghi nhận điểm hẹn"
      : inTransit ? "Đang giao nhận" : trackingCode ? "Shipper đã lấy sách" : "Đã xác nhận gửi")
    : expired ? (registered ? "Chưa được lấy đúng hạn" : outgoing ? "Đã hết hạn gửi" : "Đối tác chưa gửi đúng hạn")
    : registered ? (bothRegistered ? "Chờ shipper lấy sách" : "Đã tạo đơn · Chờ đủ hai đơn")
    : outgoing ? (canSend ? "Chờ bạn tạo đơn" : "Chưa gửi sách") : "Chờ đối tác gửi";
  const Icon = outgoing ? ArrowUpRight : ArrowDownLeft;
  const hasTracking = Boolean(registered || sentAt || receivedAt);
  const DetailIcon = hasTracking ? Route : MapPin;

  return (
    <section ref={row} id={id} className={styles.leg} data-direction={direction}
      data-actionable={Boolean(action) || undefined}
      tabIndex={-1} aria-labelledby={`${id}-title`}>
      <header className={styles.direction}>
        <h2 id={`${id}-title`}><Icon size={21} aria-hidden="true" />{outgoing ? "Bạn gửi" : "Bạn nhận"}</h2>
        {books.length > 0 && <span className={styles.count}>{books.length} cuốn</span>}
      </header>
        <div className={styles.books}>
          {books.length ? (
            <BookList books={books.slice(0, 2)} label={outgoing ? "Sách bạn gửi" : "Sách bạn nhận"} />
          ) : <p className={styles.muted}>Chưa có thông tin sách.</p>}
          {books.length > 2 && (
            <details className={styles.moreBooks}>
              <summary>Xem {books.length - 2} cuốn còn lại <ChevronDown size={15} aria-hidden="true" /></summary>
              <BookList books={books.slice(2)} start={2} />
            </details>
          )}
        </div>
        <div className={styles.next}>
          <div className={styles.nextFacts}>
            <p className={styles.status} data-state={receivedAt ? "received" : expired ? "expired" : sentAt ? "sent" : "waiting"}>
              {receivedAt ? <Check size={16} aria-hidden="true" /> : <Clock size={15} aria-hidden="true" />}
              {status}
            </p>
            {!sentAt && deadline}
            {trackingCode && <p className={styles.trackingPreview} title={trackingCode}>{trackingCode}</p>}
            {receivedAt && inspectionDeadline && (
              <p className={styles.muted}>{outgoing ? "Hạn kiểm tra của đối tác " : "Hạn kiểm tra "}<HandoverTime value={inspectionDeadline} /></p>
            )}
          </div>
          {action}
        </div>
      {form}
      {hasJourney && (
        <details ref={journey} className={styles.journey} onToggle={event => setJourneyOpen(event.currentTarget.open)}>
          <summary>
            <span><DetailIcon size={16} aria-hidden="true" />{hasTracking ? "Xem hành trình" : "Xem địa chỉ nhận"}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className={styles.journeyBody}>
            {address && <DeliveryAddress address={address} outgoing={outgoing} open={journeyOpen} />}
            {hasTracking && (
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
                  {shipment?.registeredAt && <li><span>Đã tạo đơn</span><HandoverTime value={shipment.registeredAt} /></li>}
                  {sentAt && <li><span>{shipment?.method === "direct" ? "Đã ghi nhận điểm hẹn" : shipment?.registeredAt ? "Shipper đã lấy sách" : "Đã ghi nhận gửi sách"}</span><HandoverTime value={sentAt} /></li>}
                  {shipment?.lastEvent && shipment.lastEventAt !== sentAt && <li><span>{shipment.lastEvent}</span>{shipment.lastEventAt && <HandoverTime value={shipment.lastEventAt} />}</li>}
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

export function ShippingTrackingCard({ detail, sendAction, sendForm, sendDeadline, receiveAction, history, canSend, shippingExpired, target, navigationKey }: Props) {
  const overview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (target !== exchangeHandoverAnchor.overview) return;
    const frame = requestAnimationFrame(() => {
      overview.current?.focus({ preventScroll: true });
      overview.current?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [target, navigationKey]);

  if (!history && ["PENDING", "FUNDING", "CANCELLED", "REJECTED", "EXPIRED"].includes(detail.status)) return null;

  return (
    <div ref={overview} id={exchangeHandoverAnchor.overview} className={styles.legs}
      role="region" aria-label="Giao nhận hai chiều" tabIndex={-1}>
      <ShippingLeg detail={detail} direction="outgoing" action={sendAction} form={sendForm} deadline={sendDeadline}
        canSend={canSend} shippingExpired={shippingExpired}
        targeted={target === exchangeHandoverAnchor.outgoing} navigationKey={navigationKey} />
      <ShippingLeg detail={detail} direction="incoming" action={receiveAction}
        deadline={detail.viewerShipping.sentAt || detail.viewerShipment?.registeredAt ? sendDeadline : undefined}
        shippingExpired={shippingExpired}
        targeted={target === exchangeHandoverAnchor.incoming} navigationKey={navigationKey} />
    </div>
  );
}
