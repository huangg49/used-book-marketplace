import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUpRight, Clock3, Flame, Gavel, MapPin, ShieldCheck, Sparkles } from 'lucide-react'
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

  return (
    <section className={styles.hero} aria-labelledby="auction-hero-title">
      <div className={styles.ambientGlow} aria-hidden="true" />
      <div className={styles.inner}>
        {/* Left Column: Headline, narrative & primary actions */}
        <div className={styles.copy}>
          <div className={styles.badge}>
            <span className={styles.badgePulse} aria-hidden="true" />
            <Gavel size={14} className={styles.badgeIcon} aria-hidden="true" />
            <span>Sàn đấu giá sách Lật Lại</span>
          </div>

          <h1 id="auction-hero-title" className={styles.title}>
            ĐẤU GIÁ SÁCH CŨ.
            <span className={styles.titleSub}>Chuyện hay tiếp nối qua từng phiên</span>
          </h1>

          <p className={styles.description}>
            Mỗi bản sách đều được thẩm định tình trạng trực tiếp tại điểm giao nhận TP.HCM trước khi mở phiên.
            Người đọc tự do trả giá, đấu giá minh bạch, nhận sách an tâm.
          </p>

          <div className={styles.actions}>
            <Link className={styles.createBtn} to={ROUTES.auctionCreate()}>
              <Gavel size={16} aria-hidden="true" />
              <span>Đấu giá sách của bạn</span>
            </Link>
            <a className={styles.shelfBtn} href="#auction-list-title" onClick={showShelf}>
              <span>Khám phá các phiên</span>
              <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>

          <div className={styles.pillars} role="list" aria-label="Điểm bảo chứng sàn đấu giá">
            <div className={styles.pillarItem} role="listitem">
              <ShieldCheck size={16} className={styles.pillarIcon} aria-hidden="true" />
              <div>
                <strong>Kiểm định tại điểm</strong>
                <span>Thẩm định tình trạng trước khi lên sàn</span>
              </div>
            </div>
            <div className={styles.pillarItem} role="listitem">
              <Clock3 size={16} className={styles.pillarIcon} aria-hidden="true" />
              <div>
                <strong>Phiên mở 24 giờ</strong>
                <span>Trả giá công khai, bước giá rõ ràng</span>
              </div>
            </div>
            <div className={styles.pillarItem} role="listitem">
              <MapPin size={16} className={styles.pillarIcon} aria-hidden="true" />
              <div>
                <strong>Giao nhận an tâm</strong>
                <span>Nhận tại điểm, bảo hiểm bồi thường</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Featured Live Auction Showcase or Refined Fallback Card */}
        <div className={styles.stage} data-empty={!primary || undefined} aria-busy={pending}>
          {primary ? (
            <div className={styles.spotlightCard}>
              <div className={styles.cardHeader}>
                <span className={styles.liveTag}>
                  <Flame size={14} className={styles.flameIcon} aria-hidden="true" />
                  <span>Phiên nổi bật đang mở</span>
                </span>
                <span className={styles.pointTag}>
                  <MapPin size={12} aria-hidden="true" />
                  <span>{primary.pointName}</span>
                </span>
              </div>

              <div className={styles.bookPresentation}>
                <div className={styles.bookShowcase}>
                  {companions[0] && (
                    <div className={styles.sideBook} aria-hidden="true">
                      <AuctionPhoto auction={companions[0]} interactive={false} eager />
                    </div>
                  )}
                  <div className={styles.mainBook}>
                    <AuctionPhoto auction={primary} eager />
                  </div>
                </div>

                <div className={styles.bookMeta}>
                  <h2 className={styles.bookTitle}>{primary.title}</h2>
                  {primary.book?.condition && (
                    <span className={styles.conditionPill}>
                      Đã kiểm định: {primary.book.condition === 'LikeNew' ? 'Như mới' : primary.book.condition === 'Good' ? 'Rất tốt' : primary.book.condition === 'Fair' ? 'Khá' : 'Đã sờn'}
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.priceRow}>
                <div className={styles.priceBox}>
                  <span className={styles.priceCaption}>
                    {primary.bidderCount > 0 ? `Giá hiện tại (${primary.bidderCount} lượt)` : 'Giá khởi điểm'}
                  </span>
                  <div className={styles.priceValue}>
                    <AuctionPrice auctionId={primary.id} amount={primary.currentPrice ?? primary.startPrice} />
                  </div>
                </div>
                {primary.buyNowPrice !== null && (
                  <div className={styles.buyNowBox}>
                    <span className={styles.buyNowCaption}>Mua ngay</span>
                    <span className={styles.buyNowValue}>{formatVnd(primary.buyNowPrice)}</span>
                  </div>
                )}
              </div>

              <div className={styles.timerBar}>
                <Clock3 size={15} aria-hidden="true" />
                <span>
                  {stale ? 'Thời gian theo lần tải gần nhất' : remaining > 0 ? `Còn ${formatRemaining(remaining)}` : 'Đang cập nhật trạng thái phiên'}
                </span>
              </div>

              {stale && <p className={styles.staleNotice}>Giá chưa được làm mới. Vui lòng kiểm tra lại khi mở phiên.</p>}

              <Link className={styles.cardAction} to={ROUTES.auctionDetail(primary.id)} aria-label={`Xem chi tiết phiên ${primary.title}`}>
                <span>Vào trả giá phiên này</span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className={styles.fallbackCard}>
              <div className={styles.fallbackArt}>
                <img
                  src="/illustrations/book-journey/auction.webp"
                  alt=""
                  aria-hidden="true"
                  width="480"
                  height="320"
                  decoding="async"
                />
              </div>
              <div className={styles.fallbackContent}>
                <div className={styles.fallbackBadge}>
                  <Sparkles size={14} aria-hidden="true" />
                  <span>Sắp lên sàn</span>
                </div>
                <h3>Những bản sách quý đang chờ bạn</h3>
                <p>
                  {pending
                    ? 'Đang kiểm tra và tải các phiên đấu giá mới nhất…'
                    : failed
                    ? 'Chưa kết nối được danh sách phiên. Vui lòng thử lại bên dưới.'
                    : 'Các cuốn sách gửi tới điểm đang được nhân viên thẩm định tình trạng thực tế để sẵn sàng mở phiên.'}
                </p>
                <div className={styles.fallbackActions}>
                  <Link className={styles.createBtnSecondary} to={ROUTES.auctionCreate()}>
                    <Gavel size={15} aria-hidden="true" />
                    <span>Mở phiên đấu giá mới</span>
                  </Link>
                  <Link className={styles.searchLink} to={ROUTES.search}>
                    <span>Ghé kệ sách đang bán</span>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
