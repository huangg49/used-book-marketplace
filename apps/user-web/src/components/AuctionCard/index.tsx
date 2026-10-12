import { Link } from 'react-router-dom'
import { ArrowUpRight, Timer } from 'lucide-react'
import { AuctionPhoto } from '../AuctionGallery'
import { formatRemaining, useCountdown } from '../../hooks/useAuctionClock'
import { formatVnd, ROUTES } from '../../lib/routes'
import type { AuctionSummary } from '../../services/auctions'
import styles from './AuctionCard.module.css'

const HOUR = 3_600_000
const endsAt = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })

export function AuctionCard({ auction, serverTime }: { auction: AuctionSummary; serverTime: string }) {
  const remaining = useCountdown(auction.endAt, serverTime)
  const hasBids = auction.bidderCount > 0
  const price = auction.currentPrice ?? auction.startPrice
  const to = ROUTES.auctionDetail(auction.id)
  return (
    <article className={styles.card}>
      <Link to={to} className={styles.cover} aria-label={`Xem phiên đấu giá ${auction.title}`}>
        <AuctionPhoto auction={auction} interactive={false} />
          <span className={`${styles.timer} ${remaining < HOUR ? styles.timerSoon : ''}`}>
            <Timer size={13} aria-hidden="true" />
            {formatRemaining(remaining, true)}
          </span>
      </Link>
      <div className={styles.meta}>
        <h3 className={styles.title} title={auction.title}>
          <Link to={to}>{auction.title}</Link>
        </h3>
        {auction.book?.authors.length ? <p className={styles.author}>{auction.book.authors.join(', ')}</p> : null}
        <div className={styles.priceRow}>
          <div>
            <span className={styles.priceLabel}>{hasBids ? 'Giá hiện tại' : 'Giá khởi điểm'}</span>
            <span className={styles.price}>{formatVnd(price)}</span>
          </div>
          <span className={styles.bidders}>
            {hasBids ? `${auction.bidderCount} người trả giá` : 'Chưa có lượt trả giá'}
          </span>
        </div>
        <p className={styles.ends}>Kết thúc {endsAt(auction.endAt)}</p>
        <p className={styles.point}>{auction.pointName}</p>
        {auction.buyNowPrice !== null && (
          <p className={styles.buyNow}>Mua ngay <strong>{formatVnd(auction.buyNowPrice)}</strong></p>
        )}
        <Link
          className={styles.action}
          to={to}
        >
          Xem phiên <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}
