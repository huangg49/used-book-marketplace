import { memo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight, CircleSlash, Flag, Flame, MapPin, Play, Timer, Users, Zap } from 'lucide-react'
import { AuctionPrice } from '../AuctionPrice'
import { AuctionPhoto } from '../AuctionGallery'
import { InfoTip } from '../InfoTip'
import { formatRemaining, useCountdown } from '../../hooks/useAuctionClock'
import { conditions as conditionLabels } from '../../lib/listing-labels'
import { formatVnd, ROUTES } from '../../lib/routes'
import { auctionPhase, waitingTime, type AuctionSummary } from '../../services/auctions'
import styles from './AuctionCard.module.css'
import { useNearViewport } from '../../hooks/useNearViewport'

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

// Isolated cover + optional multi-image carousel so flipping photos does not
// rebuild date facts or nest interactive controls inside the cover <Link>.
function AuctionCardCover({
  auction,
  to,
  condition,
  countdownEndAt,
  serverTime,
  scheduled,
}: {
  auction: AuctionSummary
  to: string
  condition: string | null
  countdownEndAt: string
  serverTime: string
  scheduled: boolean
}) {
  const { ref: coverRef, active: coverActive } = useNearViewport<HTMLAnchorElement>()
  const photos = auction.book?.photos ?? []
  const count = photos.length
  const hasMany = count > 1
  const [index, setIndex] = useState(0)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const slide = Math.min(index, Math.max(0, count - 1))

  const prev = () => setIndex((slide - 1 + count) % count)
  const next = () => setIndex((slide + 1) % count)

  return (
    <div
      className={styles.coverStage}
      onPointerDown={(e) => {
        if (!hasMany || e.button > 0) return
        swipeStart.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={(e) => {
        const start = swipeStart.current
        swipeStart.current = null
        if (!start || !hasMany) return
        const dx = e.clientX - start.x
        const dy = e.clientY - start.y
        if (Math.abs(dx) >= 32 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) next()
          else prev()
        }
      }}
      onPointerCancel={() => { swipeStart.current = null }}
    >
      <Link ref={coverRef} to={to} className={styles.cover} aria-label={`Xem phiên đấu giá ${auction.title}`}>
        {hasMany ? (
          <div className={styles.carouselTrack} style={{ transform: `translate3d(-${slide * 100}%, 0, 0)` }}>
            {photos.map((photo, i) => (
              <div key={photo.id} className={styles.carouselSlide} aria-hidden={i !== slide || undefined}>
                <AuctionPhoto
                  auction={auction}
                  index={i}
                  interactive={false}
                  active={coverActive && (i === slide || Math.abs(i - slide) <= 1)}
                />
              </div>
            ))}
          </div>
        ) : (
          <AuctionPhoto auction={auction} interactive={false} active={coverActive} />
        )}
      </Link>

      {condition && (
        <span className={styles.conditionBadge}>{condition}</span>
      )}

      {hasMany && (
        <>
          <button
            type="button"
            className={`${styles.navBtn} ${styles.navPrev}`}
            aria-label={`Ảnh trước của ${auction.title}`}
            onClick={prev}
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.navBtn} ${styles.navNext}`}
            aria-label={`Ảnh tiếp theo của ${auction.title}`}
            onClick={next}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
          <div className={styles.dots} role="group" aria-label={`Ảnh bản sách (${slide + 1}/${count})`}>
            {photos.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                aria-label={`Xem ảnh ${i + 1} của ${auction.title}`}
                aria-pressed={i === slide}
                className={i === slide ? styles.dotActive : styles.dot}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        </>
      )}

      <AuctionCountdown endAt={countdownEndAt} serverTime={serverTime} scheduled={scheduled} />
    </div>
  )
}

// Default prop comparison keeps typing/filter UI from rebuilding unchanged cards.
// New auction data/server time and the card's own state still update normally.
export const AuctionCard = memo(function AuctionCard({ auction, serverTime }: { auction: AuctionSummary; serverTime: string }) {
  // ADR 0047: a scheduled card counts down to the start, not the end.
  const scheduled = auctionPhase(auction, serverTime) === 'Scheduled'
  const waiting = waitingTime(auction, Date.parse(serverTime))
  const hasBids = auction.bidderCount > 0
  const price = auction.currentPrice ?? auction.startPrice
  const to = ROUTES.auctionDetail(auction.id)
  const condition = auction.book?.condition ? conditionLabels[auction.book.condition] : null
  const registered = auction.registeredCount ?? 0
  const needed = auction.minBidders ?? 0
  const regPct = needed > 0 ? Math.min(100, Math.round((registered / needed) * 100)) : 0
  const tone = scheduled ? 'scheduled' : 'live'
  const buyNowInstant = auction.buyNowMode === 'Instant'

  return (
    <article className={styles.card} data-auction-id={auction.id} data-tone={tone}>
      <AuctionCardCover
        auction={auction}
        to={to}
        condition={condition}
        countdownEndAt={scheduled ? waiting.at : auction.endAt}
        serverTime={serverTime}
        scheduled={scheduled}
      />
      <div className={styles.meta}>
        <h3 className={styles.title} title={auction.title}>
          <Link to={to}>{auction.title}</Link>
        </h3>
        {auction.book?.authors.length ? <p className={styles.author}>{auction.book.authors.join(', ')}</p> : null}

        <div className={styles.priceBox}>
          <div className={styles.priceTop}>
            <span className={styles.priceLabel}>{hasBids ? 'Giá hiện tại' : 'Giá khởi điểm'}</span>
            <span className={styles.stepText}>Bước +{formatVnd(auction.step)}</span>
          </div>
          <div className={styles.priceMain}>
            <span className={styles.price}><AuctionPrice auctionId={auction.id} amount={price} /></span>
            <span
              className={styles.bidders}
              data-active={hasBids || undefined}
              title={hasBids ? undefined : 'Chưa có lượt trả giá'}
              aria-label={hasBids ? undefined : 'Chưa có lượt trả giá'}
            >
              <Users size={13} aria-hidden="true" />
              {hasBids ? `${auction.bidderCount} người trả giá` : 'Chưa có lượt'}
            </span>
          </div>
        </div>

        <ul className={styles.facts}>
          {scheduled && auction.openMode != null && (
            <li className={styles.regRow}>
              <div className={styles.regHead}>
                <Users size={14} aria-hidden="true" />
                <span>Đăng ký</span>
                <b>{registered}/{auction.minBidders} người</b>
              </div>
              <span className={styles.regMeter} aria-hidden="true">
                <span style={{ width: `${regPct}%` }} />
              </span>
            </li>
          )}
          {scheduled && (
            // ADR 0079/0081: until enough register, the open time or (once it
            // passed) the registration deadline; the end is not known yet.
            <li><Play size={14} aria-hidden="true" /><span>{waiting.label}</span><b>{endsAt(waiting.at)}</b></li>
          )}
          {!(scheduled && !waiting.endKnown) && (
            <li><Flag size={14} aria-hidden="true" /><span>Kết thúc</span><b>{endsAt(auction.endAt)}</b></li>
          )}
          <li className={styles.pointRow}>
            <MapPin size={14} aria-hidden="true" />
            <span className="sr-only">Điểm giữ: </span>
            <span className={styles.pointName} title={auction.pointName}>{auction.pointName}</span>
          </li>
          {auction.buyNowPrice !== null ? (
            <li className={styles.buyNow} data-buy-now={buyNowInstant ? 'Instant' : 'Challenge'}>
              <div className={styles.buyNowLeft}>
                <div className={styles.buyNowTitle}>
                  <span className={styles.buyNowLabel}>
                    {buyNowInstant ? <Zap size={13} aria-hidden="true" /> : <Flame size={13} aria-hidden="true" />}
                    <span>Mua ngay</span>
                  </span>
                  <InfoTip label={buyNowInstant ? 'Mua ngay chốt liền' : 'Mua ngay chờ thách đấu'}>
                    {buyNowInstant
                      ? <><b>Kết thúc ngay:</b> người mua ngay thắng luôn và phiên khép lại lập tức, không ai trả cao hơn được.</>
                      : <><b>Chờ thách đấu:</b> sau khi mua ngay, người khác còn <b>5 phút</b> để trả cao hơn (<b>60 giây</b> nếu người bấm đang dẫn).</>}
                  </InfoTip>
                </div>
                <span className={styles.buyNowModeLabel}>
                  {buyNowInstant ? 'Chốt phiên ngay' : 'Chờ thách đấu 5p'}
                </span>
              </div>
              <b className={styles.buyNowPrice}>{formatVnd(auction.buyNowPrice)}</b>
            </li>
          ) : (
            <li className={styles.buyNow} data-buy-now="None">
              <div className={styles.buyNowLeft}>
                <span className={styles.buyNowNoneTitle}>
                  <CircleSlash size={13} aria-hidden="true" />
                  <span>Không có mua ngay</span>
                </span>
                <span className={styles.buyNowNoneHint}>Chỉ trả giá theo bước</span>
              </div>
            </li>
          )}
        </ul>

        <Link className={styles.action} to={to}>
          <span>Xem phiên</span>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
})
