import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUpRight, Clock3 } from 'lucide-react'
import { AuctionPhoto } from './AuctionGallery'
import { AuctionPrice } from './AuctionPrice'
import { formatRemaining, useCountdown } from '../hooks/useAuctionClock'
import { selectHeroAuctions } from '../lib/auction-hero'
import { formatVnd, ROUTES } from '../lib/routes'
import type { AuctionSummary } from '../services/auctions'
import styles from './AuctionHero.module.css'

type Props = {
  auctions: readonly AuctionSummary[]
  serverTime?: string
  pending: boolean
  stale: boolean
  failed: boolean
}

export function AuctionHero({ auctions, serverTime, pending, stale, failed }: Props) {
  const [retainedId, setRetainedId] = useState<string | null>(null)
  const { primary, companions } = selectHeroAuctions(auctions, retainedId)
  const primaryId = primary?.id ?? null
  // Remember only identity, while prices and photos always come from fresh data.
  if (retainedId !== primaryId) setRetainedId(primaryId)
  const remaining = useCountdown(primary?.endAt, serverTime)

  const showShelf = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    const heading = document.getElementById('auction-list-title')
    heading?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    heading?.focus({ preventScroll: true })
  }

  return <section className={styles.hero} aria-labelledby="auction-hero-title">
    <div className={styles.inner}>
      <div className={styles.copy} data-stage-reveal>
        <h1 id="auction-hero-title">ĐẤU GIÁ SÁCH.<span>CHUYỆN HAY CÒN TIẾP.</span></h1>
        <p>Sách được kiểm tra trước khi mở phiên.<br />Nhận sách tại điểm giao nhận ở TP.HCM.</p>
        <a className={styles.shelfLink} href="#auction-list-title" onClick={showShelf}>
          Xem các phiên đang mở <ArrowDown size={17} aria-hidden="true" />
        </a>
      </div>
      <div className={styles.stage} data-empty={!primary || undefined} aria-busy={pending}>
        {primary ? <>
          <div className={styles.books}>
            {companions.map((auction, index) => <div key={auction.id} className={styles.companion} data-position={index} data-stage-reveal aria-hidden="true">
              <div className={styles.bookFace}><AuctionPhoto auction={auction} interactive={false} eager /></div>
              <div className={styles.podium} />
            </div>)}
            <div className={styles.focal} data-stage-reveal>
              <div className={styles.bookFace}><AuctionPhoto auction={primary} eager /></div>
              <div className={styles.podium} aria-hidden="true" />
            </div>
            <img className={styles.mascot} src="/illustrations/penguins/auction.png" alt="" aria-hidden="true" width="231" height="256" decoding="async" />
          </div>
          <div className={styles.ticket} data-stage-reveal>
            <h2>{primary.title}</h2>
            <p className={styles.priceLabel}>{primary.bidderCount > 0 ? 'Giá hiện tại' : 'Giá khởi điểm'}</p>
            <div className={styles.price}><AuctionPrice auctionId={primary.id} amount={primary.currentPrice ?? primary.startPrice} /></div>
            <p className={styles.remaining}><Clock3 size={15} aria-hidden="true" /><span>{stale ? 'Thời gian theo lần tải gần nhất' : remaining > 0 ? `Còn ${formatRemaining(remaining)}` : 'Đang cập nhật trạng thái phiên'}</span></p>
            {primary.buyNowPrice !== null && <p className={styles.buyNow}>Mua ngay <strong>{formatVnd(primary.buyNowPrice)}</strong></p>}
            {stale && <p className={styles.warning}>Giá chưa được cập nhật. Kiểm tra lại khi mở phiên.</p>}
            <Link className={styles.sessionLink} to={ROUTES.auctionDetail(primary.id)} aria-label={`Xem phiên ${primary.title}`}>
              Xem phiên <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </> : <div className={styles.fallback}>
          <img src="/illustrations/book-journey/auction.webp" alt="" aria-hidden="true" width="900" height="600" decoding="async" />
          <p role={pending ? 'status' : undefined}>{pending ? 'Đang tìm sách trên kệ đấu giá…' : failed ? 'Chưa tải được các phiên. Bạn có thể thử lại ở kệ bên dưới.' : 'Những câu chuyện mới sẽ lên phiên sau khi sách được kiểm tra.'}</p>
          {!pending && !failed && <Link to={ROUTES.search}>Ghé kệ sách đang bán <ArrowUpRight size={16} aria-hidden="true" /></Link>}
        </div>}
      </div>
    </div>
  </section>
}
