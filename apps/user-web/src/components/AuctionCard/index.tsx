import { Link } from 'react-router-dom'
import { ArrowRight, Flag, MapPin, Play, Timer, Users, Zap } from 'lucide-react'
import { AuctionPrice } from '../AuctionPrice'
import { AuctionPhoto } from '../AuctionGallery'
import { formatRemaining, useCountdown } from '../../hooks/useAuctionClock'
import { formatVnd, ROUTES } from '../../lib/routes'
import { auctionPhase, type AuctionSummary } from '../../services/auctions'
import styles from './AuctionCard.module.css'

const HOUR = 3_600_000
const endsAt = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })

// Only the badge changes each second; price/photo feedback follows server data.
function AuctionCountdown({ endAt, serverTime, scheduled }: {
  endAt: string; serverTime: string; scheduled: boolean
}) {
  const remaining = useCountdown(endAt, serverTime)
  return (
    <span className={`${styles.timer} ${!scheduled && remaining < HOUR ? styles.timerSoon : ''}`}>
      <Timer size={13} aria-hidden="true" />
      {scheduled ? `Mở sau ${formatRemaining(remaining, true)}` : formatRemaining(remaining, true)}
    </span>
  )
}

export function AuctionCard({ auction, serverTime }: { auction: AuctionSummary; serverTime: string }) {
  // ADR 0047: a scheduled card counts down to the start, not the end.
  const scheduled = auctionPhase(auction, serverTime) === 'Scheduled'
  const hasBids = auction.bidderCount > 0
  const price = auction.currentPrice ?? auction.startPrice
  const to = ROUTES.auctionDetail(auction.id)
  return (
    <article className={styles.card} data-auction-id={auction.id}>
      <Link to={to} className={styles.cover} aria-label={`Xem phiên đấu giá ${auction.title}`}>
        <AuctionPhoto auction={auction} interactive={false} />
        <AuctionCountdown endAt={scheduled ? auction.startAt : auction.endAt} serverTime={serverTime} scheduled={scheduled} />
      </Link>
      <div className={styles.meta}>
        <h3 className={styles.title} title={auction.title}>
          <Link to={to}>{auction.title}</Link>
        </h3>
        {auction.book?.authors.length ? <p className={styles.author}>{auction.book.authors.join(', ')}</p> : null}
        <div className={styles.priceBox}>
          <div>
            <span className={styles.priceLabel}>{hasBids ? 'Giá hiện tại' : 'Giá khởi điểm'}</span>
            <span className={styles.price}><AuctionPrice auctionId={auction.id} amount={price} /></span>
          </div>
          <span className={styles.bidders} data-active={hasBids || undefined}>
            <Users size={13} aria-hidden="true" />
            {hasBids ? `${auction.bidderCount} người trả giá` : 'Chưa có lượt trả giá'}
          </span>
        </div>
        <ul className={styles.facts}>
          {scheduled && (
            <li><Play size={14} aria-hidden="true" /><span>Mở lúc</span><b>{endsAt(auction.startAt)}</b></li>
          )}
          <li><Flag size={14} aria-hidden="true" /><span>Kết thúc</span><b>{endsAt(auction.endAt)}</b></li>
          <li><MapPin size={14} aria-hidden="true" /><span>Điểm giữ</span><b title={auction.pointName}>{auction.pointName}</b></li>
          {auction.buyNowPrice !== null && (
            <li className={styles.buyNow}><Zap size={14} aria-hidden="true" /><span>Mua ngay</span><b>{formatVnd(auction.buyNowPrice)}</b></li>
          )}
        </ul>
        <Link className={styles.action} to={to}>
          Xem phiên <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}
