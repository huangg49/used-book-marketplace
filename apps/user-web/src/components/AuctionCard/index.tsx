import { Link } from 'react-router-dom'
import { Gavel, Timer } from 'lucide-react'
import { formatRemaining, useCountdown } from '../../hooks/useAuctionClock'
import { formatVnd, ROUTES } from '../../lib/routes'
import type { AuctionSummary } from '../../services/auctions'
import card from '../BookCard.module.css'
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
    <article className={card.card}>
      <Link to={to} className={card.coverWrapper} aria-label={`Xem phiên đấu giá ${auction.title}`}>
        <span className={styles.plate} aria-hidden="true">
          <span className={`${styles.timer} ${remaining < HOUR ? styles.timerSoon : ''}`}>
            <Timer size={13} aria-hidden="true" />
            {formatRemaining(remaining, true)}
          </span>
          <span className={styles.plateTitle}>{auction.title}</span>
          <span className={styles.plateNote}>Đã kiểm tra tại điểm giao nhận</span>
        </span>
      </Link>
      <div className={card.meta}>
        <div className={styles.eyebrow} title={auction.pointName}>Đấu giá · {auction.pointName}</div>
        <h3 className={card.title} title={auction.title}>
          <Link to={to}>{auction.title}</Link>
        </h3>
        <div className={card.divider} />
        <div className={styles.priceRow}>
          <div>
            <span className={styles.priceLabel}>{hasBids ? 'Giá hiện tại' : 'Giá khởi điểm'}</span>
            <span className={card.price}>{formatVnd(price)}</span>
          </div>
          <span className={styles.bidders}>
            {hasBids ? `${auction.bidderCount} người trả giá` : 'Chưa có lượt trả giá'}
          </span>
        </div>
        <p className={styles.ends}>Kết thúc {endsAt(auction.endAt)}</p>
        {auction.buyNowPrice !== null && (
          <p className={styles.buyNow}>Mua ngay <strong>{formatVnd(auction.buyNowPrice)}</strong></p>
        )}
        <Link
          className={`${card.actionBtn} ${card.actionBtnSolid}`}
          style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40 }}
          to={to}
        >
          <Gavel size={14} aria-hidden="true" /> {hasBids ? 'Vào phiên' : 'Trả giá đầu tiên'}
        </Link>
      </div>
    </article>
  )
}
