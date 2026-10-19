import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@used-books/session-client'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpen, Check, Gavel, MapPin, Minus, Plus, Store, Tag } from 'lucide-react'
import { useSession } from '../hooks/useSession'
import { outcomeUnknown, useIntentKey } from '../hooks/useAuctionClock'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { getMyBookIdentity, getMyListings, getMyPhoto, type MyListing } from '../services/my-listings'
import {
  AUCTION_MAX_PRICE, AUCTION_MIN_PRICE, createAuctionIntake, getMyAuctionIntake, intakePriceErrors, listHandoverPoints,
  type CreateIntakeBody, type HandoverPoint, type MyIntake,
} from '../services/auctions'
import { conditions } from '../lib/listing-labels'
import { auctionEligible } from '../lib/owner-listing-labels'
import { formatVnd, ROUTES } from '../lib/routes'
import styles from './CreateAuctionPage.module.css'

type Step = 10000 | 50000
const STEPS: Step[] = [10000, 50000]
const DROPOFF_HOURS = 72

function commandError(error: unknown) {
  if (!(error instanceof ApiError) || error.status === 0)
    return 'Không kết nối được máy chủ nên chưa rõ yêu cầu đã được ghi hay chưa. Hãy thử lại đúng yêu cầu này.'
  if (error.status >= 500) return 'Máy chủ đang gặp sự cố nên chưa rõ kết quả. Hãy thử lại đúng yêu cầu này.'
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  if (error.code === 'IdempotencyConflict') return 'Yêu cầu trước chưa hoàn tất. Tải lại trang để xem trạng thái mới nhất.'
  if (error.status === 409 && error.code !== 'InvalidState') return 'Bài đăng vừa thay đổi. Tải lại danh sách sách rồi chọn lại.'
  return error.message || 'Chưa gửi được yêu cầu đấu giá. Hãy tải lại trang.'
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })

function useListingIdentity(item: MyListing | undefined) {
  const auth = useSession()
  const ownerId = auth.status === 'authenticated' ? auth.user.id : undefined
  const content = item?.currentRevision.content
  const bookId = content?.bookId || item?.currentRevision.bookId
  const identity = useQuery({
    queryKey: ['my-book-identity', ownerId, bookId, item?.catalogStatus],
    queryFn: () => getMyBookIdentity(bookId!, item!.catalogStatus),
    enabled: !!ownerId && !!bookId,
  })
  return {
    title: identity.data?.title || content?.title || (identity.isLoading ? 'Đang tải tên sách…' : 'Chưa có tên sách'),
    author: identity.data?.authors.join(', ') || content?.author || '',
  }
}

function ListingPhoto({ item, title }: { item: MyListing; title: string }) {
  const auth = useSession()
  const ownerId = auth.status === 'authenticated' ? auth.user.id : undefined
  const mediaId = item.currentRevision.content.mediaIds?.[0]
  const [failedUrl, setFailedUrl] = useState<string>()
  const photo = useQuery({
    queryKey: ['my-photo', ownerId, item.id, item.currentRevision.id, mediaId],
    queryFn: () => getMyPhoto(item.id, mediaId!),
    enabled: !!ownerId && !!mediaId,
  })
  const url = photo.data?.url
  if (url && url !== failedUrl) return <img src={url} alt={`Ảnh bản sách ${title}`} loading="lazy" decoding="async" onError={() => setFailedUrl(url)} />
  return <span className={styles.photoState}><BookOpen size={20} aria-hidden="true" />{photo.isError || url ? 'Chưa tải được ảnh' : mediaId ? 'Đang tải…' : 'Chưa có ảnh'}</span>
}

function BookOption({ item, checked, disabled, onSelect }: { item: MyListing; checked: boolean; disabled: boolean; onSelect: () => void }) {
  const { title, author } = useListingIdentity(item)
  const c = item.currentRevision.content
  return (
    <label className={`${styles.bookOption} ${checked ? styles.selected : ''}`}>
      <input type="radio" name="auction-book" checked={checked} disabled={disabled} onChange={onSelect} />
      <span className={styles.bookCover}><ListingPhoto item={item} title={title} /></span>
      <span className={styles.bookText}>
        <strong>{title}</strong>
        {author && <span>{author}</span>}
        <span>{c.condition ? conditions[c.condition] : 'Chưa khai báo tình trạng'}</span>
      </span>
      <span className={styles.bookPrice}>
        <span>Giá trị khai báo</span>
        <strong>{c.salePrice != null ? formatVnd(c.salePrice) : '—'}</strong>
      </span>
      <Check className={styles.tick} size={18} aria-hidden="true" />
    </label>
  )
}

function PriceInput({ id, label, value, step, min, onChange, disabled, error, hint }: {
  id: string; label: string; value: number | null; step: number; min: number; disabled: boolean
  onChange: (v: number | null) => void; error?: string; hint?: string
}) {
  const nudge = (dir: 1 | -1) => {
    const base = value ?? min - (dir > 0 ? step : 0)
    onChange(Math.min(AUCTION_MAX_PRICE, Math.max(min, base + dir * step)))
  }
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={`${styles.money} ${error ? styles.invalid : ''}`}>
        <button type="button" onClick={() => nudge(-1)} disabled={disabled || value === null || value - step < min} aria-label={`Giảm ${label.toLowerCase()} một bước`}><Minus size={16} aria-hidden="true" /></button>
        <input
          id={id} inputMode="numeric" autoComplete="off" disabled={disabled}
          value={value === null ? '' : value.toLocaleString('vi-VN')}
          aria-invalid={!!error} aria-describedby={`${id}-help`}
          onChange={(e) => { const digits = e.target.value.replace(/\D/g, '').slice(0, 7); onChange(digits ? Number(digits) : null) }}
        />
        <span aria-hidden="true">đ</span>
        <button type="button" onClick={() => nudge(1)} disabled={disabled || (value ?? 0) + step > AUCTION_MAX_PRICE} aria-label={`Tăng ${label.toLowerCase()} một bước`}><Plus size={16} aria-hidden="true" /></button>
      </div>
      <p id={`${id}-help`} className={error ? styles.error : styles.hint} role={error ? 'alert' : undefined}>{error ?? hint}</p>
    </div>
  )
}

function Receipt({ intake, point }: { intake: MyIntake; point?: HandoverPoint }) {
  return (
    <section className={styles.receipt} aria-labelledby="intake-done">
      <img src="/illustrations/book-journey/auction.webp" width="900" height="600" alt="" aria-hidden="true" decoding="async" />
      <div>
        <p className={styles.kicker}><Gavel size={15} aria-hidden="true" /> Đã giữ chỗ đấu giá</p>
        <h1 id="intake-done">Mang “{intake.title}” tới điểm nhận sách</h1>
        <p>Sách đấu giá này chuyển sang Đang giữ cho phiên. Phiên chỉ mở sau khi nhân viên nhận và kiểm tra sách.</p>
        <dl className={styles.receiptFacts}>
          <div><dt>Điểm gửi sách</dt><dd>{point ? <>{point.name}<span>{point.displayAddress}</span></> : 'Điểm đã chọn'}</dd></div>
          <div><dt>Hạn gửi sách</dt><dd>{when(intake.dropoffDeadline)}</dd></div>
          <div><dt>Giá khởi điểm · bước</dt><dd>{formatVnd(intake.startPrice)} · {formatVnd(intake.step)}</dd></div>
          <div><dt>Mua ngay</dt><dd>{intake.buyNowPrice === null ? 'Không đặt' : formatVnd(intake.buyNowPrice)}</dd></div>
        </dl>
        <div className={styles.receiptActions}>
          <Link className={styles.primary} to={`${ROUTES.myAuctions}?view=selling`}>Theo dõi trong Đấu giá của tôi <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link className={styles.secondary} to={ROUTES.auctions}>Về sàn đấu giá</Link>
        </div>
      </div>
    </section>
  )
}

const unfinishedStatus: Record<string, string> = {
  Draft: 'bản nháp',
  PendingReview: 'đang chờ duyệt',
  Rejected: 'cần chỉnh sửa theo góp ý',
}
function UnfinishedAuctionBook({ item }: { item: MyListing }) {
  const { title } = useListingIdentity(item)
  return <li>{title || 'Sách đấu giá chưa có tên'}: {unfinishedStatus[item.state.moderation] ?? item.state.moderation}</li>
}

export function CreateAuctionPage() {
  const auth = useSession()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const ownerId = auth.status === 'authenticated' ? auth.user.id : undefined
  // ADR 0041: auctions use the seller's own Auction listings, never marketplace ones.
  const listings = useQuery({
    queryKey: ['my-listings', ownerId, 'auction'],
    queryFn: () => getMyListings(undefined, undefined, 50, 'Auction'),
    enabled: !!ownerId, retry: false, staleTime: 0,
  })
  const points = useQuery({ queryKey: ['handover-points'], queryFn: listHandoverPoints, enabled: !!ownerId, retry: false, staleTime: 0 })

  const eligible = useMemo(() => (listings.data?.items ?? []).filter(auctionEligible), [listings.data])
  const unfinished = useMemo(() => (listings.data?.items ?? []).filter((l) =>
    l.state.moderation !== 'Approved' && l.state.visibility !== 'Removed'), [listings.data])
  const [listingId, setListingId] = useState(params.get('listing') ?? '')
  const [pointChoice, setPointId] = useState('')
  const [step, setStep] = useState<Step>(10000)
  // undefined = not edited yet, so the suggestion below applies.
  const [startDraft, setStartPrice] = useState<number | null | undefined>(undefined)
  const [buyNowOn, setBuyNowOn] = useState(false)
  const [buyNowPrice, setBuyNowPrice] = useState<number | null>(null)
  const [touched, setTouched] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<MyIntake | null>(null)
  const intent = useIntentKey()
  // An unknown outcome freezes the exact body and key so a retry replays the same intent.
  const pending = useRef<{ body: CreateIntakeBody; key: string } | null>(null)
  const [unknown, setUnknown] = useState(false)

  const listing = eligible.find((l) => l.id === listingId)
  const preselectedMissing = !!params.get('listing') && listings.isSuccess && !listing && listingId === params.get('listing')
  const salePrice = listing?.currentRevision.content.salePrice ?? null
  const identity = useListingIdentity(listing)
  const openPoints = (points.data?.items ?? []).filter((p) => p.status === 'Active')
  const single = openPoints.length === 1 && openPoints[0]!.availableSlots > 0 ? openPoints[0]!.id : ''
  const pointId = pointChoice || single
  const point = points.data?.items.find((p) => p.id === pointId)
  const doneIntakePoint = done ? points.data?.items.find((p) => p.id === done.pointId) : undefined
  // Suggest a start price below the declared value; the seller can change it.
  const suggested = salePrice === null ? null
    : Math.min(AUCTION_MAX_PRICE, Math.max(AUCTION_MIN_PRICE, Math.floor((salePrice * 0.6) / 10000) * 10000))
  const startPrice = startDraft === undefined ? suggested : startDraft

  const priceErrors = intakePriceErrors(startPrice, step, buyNowOn ? buyNowPrice : null)
  const missingBuyNow = buyNowOn && buyNowPrice === null
  const formErrors = {
    listing: !listing ? 'Chọn một cuốn sách để đưa lên đấu giá.' : undefined,
    point: !point ? 'Chọn điểm gửi sách.' : point.status !== 'Active' || point.availableSlots < 1 ? 'Điểm này đang hết chỗ, hãy chọn điểm khác.' : undefined,
    startPrice: priceErrors.startPrice,
    buyNowPrice: missingBuyNow ? 'Nhập giá mua ngay hoặc bỏ chọn mua ngay.' : priceErrors.buyNowPrice,
  }
  const valid = !Object.values(formErrors).some(Boolean)
  const locked = busy || unknown

  const buyNowChips = startPrice && !priceErrors.startPrice
    ? [3, 5, 10].map((n) => startPrice + n * step).filter((v) => v <= AUCTION_MAX_PRICE)
    : []

  if (auth.status === 'anonymous') return <Navigate to={`/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (auth.status !== 'authenticated') return <main className={styles.state} role="status">Đang mở bàn đấu giá…</main>
  if (done) return <div className={styles.page}><Receipt intake={done} point={doneIntakePoint} /></div>

  const submit = async () => {
    const body: CreateIntakeBody = pending.current?.body ?? {
      listingId: listing!.id, expectedListingVersion: listing!.version, pointId: point!.id,
      startPrice: startPrice!, step, buyNowPrice: buyNowOn ? buyNowPrice : null,
    }
    const key = pending.current?.key ?? intent.keyFor(JSON.stringify(body))
    pending.current = { body, key }
    let stillUnknown = false
    setBusy(true); setError(null)
    try {
      const receipt = await createAuctionIntake(body, key)
      intent.settle(); pending.current = null
      const intake = await getMyAuctionIntake(receipt.entityId).catch(() => null)
      void queryClient.invalidateQueries({ queryKey: ['my-auction-intakes'] })
      void queryClient.invalidateQueries({ queryKey: ['my-listings'] })
      void queryClient.invalidateQueries({ queryKey: ['my-auctions'] })
      if (intake) { setDone(intake); window.scrollTo({ top: 0 }) }
      else setError('Đã giữ chỗ đấu giá nhưng chưa tải được phiếu gửi sách. Xem trong Đấu giá của tôi.')
    } catch (caught) {
      stillUnknown = outcomeUnknown(caught)
      if (!stillUnknown) { intent.settle(); pending.current = null }
      setError(commandError(caught))
      if (!stillUnknown) { void listings.refetch(); void points.refetch() }
    } finally {
      setUnknown(stillUnknown); setBusy(false); setConfirming(false)
    }
  }

  const loadingBooks = listings.isPending
  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label="Đường dẫn">
        <Link to={ROUTES.auctions}>Đấu giá</Link><span aria-hidden="true">/</span><span aria-current="page">Mở phiên mới</span>
      </nav>
      <header className={styles.intro}>
        <div>
          <h1>Đưa một cuốn sách lên sàn đấu giá</h1>
          <p>Tạo sách đấu giá riêng, chờ duyệt rồi đặt giá khởi điểm và mang sách tới điểm nhận. Sách đấu giá không hiển thị trên kệ mua/đổi. Người đọc trả giá trong 24 giờ, giá cao nhất sẽ thắng.</p>
        </div>
        <img className={styles.art} src="/illustrations/book-journey/auction.webp" width="900" height="600" alt="" aria-hidden="true" decoding="async" />
      </header>

      <section className={styles.compare} aria-label="Khác nhau giữa bài đăng bán và phiên đấu giá">
        <div className={styles.compareListing}>
          <p className={styles.compareTag}><Tag size={15} aria-hidden="true" /> Bài đăng bán</p>
          <ul>
            <li>Một giá cố định do bạn đặt</li>
            <li>Người mua nhắn tin, hai bên tự hẹn giao sách</li>
            <li>Hiển thị đến khi có người mua</li>
          </ul>
        </div>
        <ArrowRight className={styles.compareArrow} size={20} aria-hidden="true" />
        <div className={styles.compareAuction}>
          <p className={styles.compareTag}><Gavel size={15} aria-hidden="true" /> Phiên đấu giá</p>
          <ul>
            <li>Giá khởi điểm, người đọc trả giá theo bước</li>
            <li>Sách được nhân viên kiểm tra tại điểm trước khi mở phiên</li>
            <li>Phiên 24 giờ, người thắng nhận sách tại điểm</li>
          </ul>
        </div>
      </section>

      <div className={styles.layout}>
        <form className={styles.form} noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (valid && !locked) setConfirming(true) }}>
          <fieldset className={styles.step} disabled={locked}>
            <legend><span className={styles.num}>1</span> Chọn sách đấu giá của bạn</legend>
            <p className={styles.stepHint}>Sách đấu giá là bài đăng riêng, không lấy từ kệ mua/đổi. Chỉ sách đấu giá đã duyệt, đang hiển thị và chưa có người giữ mới gửi tới điểm được.</p>
            <div className={styles.inlineActions}><Link to={`${ROUTES.sell}?channel=Auction`}>Tạo sách đấu giá mới</Link></div>
            {loadingBooks && <div className={styles.skeletonList} aria-busy="true" aria-label="Đang tải sách của bạn">{[0, 1].map((i) => <div key={i} />)}</div>}
            {listings.isError && <div className={styles.inlineState} role="alert"><p>Chưa tải được sách đấu giá của bạn.</p><button type="button" onClick={() => void listings.refetch()}>Thử lại</button></div>}
            {listings.isSuccess && eligible.length === 0 && (
              <div className={styles.inlineState}>
                <BookOpen size={28} aria-hidden="true" />
                <p><strong>Chưa có sách đấu giá đã duyệt.</strong> {unfinished.length > 0
                  ? 'Sách bên dưới sẽ chọn được tại đây sau khi được duyệt.'
                  : 'Tạo sách đấu giá mới và chờ duyệt, rồi quay lại đây.'}</p>
              </div>
            )}
            {preselectedMissing && <p className={styles.error} role="alert">Cuốn sách bạn chọn hiện không đưa lên đấu giá được. Hãy chọn một cuốn khác bên dưới.</p>}
            {eligible.length > 0 && (
              <div className={styles.bookList} role="radiogroup" aria-label="Sách đủ điều kiện đấu giá">
                {eligible.map((item) => (
                  <BookOption key={item.id} item={item} checked={item.id === listingId} disabled={locked}
                    onSelect={() => { setListingId(item.id); if (item.id !== listingId) { setStartPrice(undefined); setBuyNowPrice(null) } }} />
                ))}
              </div>
            )}
            {unfinished.length > 0 && (
              <ul className={styles.stepHint} aria-label="Sách đấu giá chưa được duyệt">
                {unfinished.map((item) => <UnfinishedAuctionBook key={item.id} item={item} />)}
              </ul>
            )}
            {listings.data?.nextCursor && <p className={styles.stepHint}>Đang hiển thị 50 sách đấu giá mới nhất.</p>}
            {touched && formErrors.listing && eligible.length > 0 && <p className={styles.error} role="alert">{formErrors.listing}</p>}
          </fieldset>

          <fieldset className={styles.step} disabled={locked}>
            <legend><span className={styles.num}>2</span> Chọn điểm gửi sách</legend>
            <p className={styles.stepHint}>Bạn tự mang sách tới điểm trong {DROPOFF_HOURS} giờ kể từ khi giữ chỗ. Điểm nhận và kiểm tra là mô phỏng cho đồ án.</p>
            {points.isPending && <div className={styles.skeletonList} aria-busy="true" aria-label="Đang tải điểm nhận"><div /></div>}
            {points.isError && <div className={styles.inlineState} role="alert"><p>Chưa tải được điểm nhận sách.</p><button type="button" onClick={() => void points.refetch()}>Thử lại</button></div>}
            {points.isSuccess && (
              <div className={styles.points} role="radiogroup" aria-label="Điểm gửi sách">
                {points.data.items.map((p) => {
                  const full = p.status !== 'Active' || p.availableSlots < 1
                  return (
                    <label key={p.id} className={`${styles.pointOption} ${p.id === pointId ? styles.selected : ''} ${full ? styles.full : ''}`}>
                      <input type="radio" name="auction-point" checked={p.id === pointId} disabled={locked || full} onChange={() => setPointId(p.id)} />
                      <MapPin size={18} aria-hidden="true" />
                      <span><strong>{p.name}</strong><span>{p.displayAddress}</span></span>
                      <span className={styles.slots}>{p.status === 'Paused' ? 'Tạm ngưng nhận' : p.status === 'Closed' ? 'Đã đóng' : p.availableSlots > 0 ? `Còn ${p.availableSlots} chỗ` : 'Hết chỗ'}</span>
                    </label>
                  )
                })}
                {!points.data.items.length && <p className={styles.stepHint}>Chưa có điểm nhận sách nào hoạt động.</p>}
              </div>
            )}
            {touched && formErrors.point && points.isSuccess && <p className={styles.error} role="alert">{formErrors.point}</p>}
          </fieldset>

          <fieldset className={styles.step} disabled={locked}>
            <legend><span className={styles.num}>3</span> Đặt giá cho phiên</legend>
            <p className={styles.stepHint}>Mọi mức giá đi theo lưới <em>giá khởi điểm + n × bước giá</em>, từ 10.000đ đến 1.000.000đ. Bạn không sửa được lưới giá sau khi giữ chỗ.</p>
            <div className={styles.field}>
              <span className={styles.label} id="step-label">Bước giá</span>
              <div className={styles.segment} role="radiogroup" aria-labelledby="step-label">
                {STEPS.map((s) => (
                  <label key={s} className={step === s ? styles.segmentOn : undefined}>
                    <input type="radio" name="auction-step" checked={step === s} onChange={() => setStep(s)} />
                    {formatVnd(s)}
                  </label>
                ))}
              </div>
            </div>
            <PriceInput id="auction-start" label="Giá khởi điểm" value={startPrice} step={step} min={AUCTION_MIN_PRICE} disabled={locked}
              onChange={setStartPrice} error={touched || startPrice !== null ? formErrors.startPrice : undefined}
              hint={salePrice !== null ? `Giá trị khai báo ${formatVnd(salePrice)}. Giá khởi điểm thấp hơn thường thu hút nhiều người trả giá hơn.` : 'Lượt trả giá đầu tiên bằng đúng giá khởi điểm.'} />
            <label className={styles.toggle}>
              <input type="checkbox" checked={buyNowOn} disabled={locked} onChange={() => { setBuyNowOn(!buyNowOn); if (!buyNowOn && buyNowPrice === null && buyNowChips[1]) setBuyNowPrice(buyNowChips[1]) }} />
              <span><strong>Cho phép mua ngay</strong><span>Người đọc có thể chốt sách ngay bằng giá này trước lượt trả giá đầu tiên.</span></span>
            </label>
            {buyNowOn && <>
              <PriceInput id="auction-buy-now" label="Giá mua ngay" value={buyNowPrice} step={step} min={(startPrice ?? AUCTION_MIN_PRICE - step) + step} disabled={locked}
                onChange={setBuyNowPrice} error={touched || buyNowPrice !== null ? formErrors.buyNowPrice : undefined} hint="Phải cao hơn giá khởi điểm và nằm trên lưới giá." />
              {buyNowChips.length > 0 && (
                <div className={styles.chips} aria-label="Gợi ý giá mua ngay">
                  {buyNowChips.map((v, i) => <button type="button" key={v} aria-pressed={buyNowPrice === v} disabled={locked} onClick={() => setBuyNowPrice(v)}>{formatVnd(v)}<span>+{[3, 5, 10][i]} bước</span></button>)}
                </div>
              )}
            </>}
          </fieldset>

          {error && <p className={styles.submitError} role="alert">{error}</p>}
          <div className={styles.submitRow}>
            {unknown
              ? <button type="button" className={styles.primary} disabled={busy} onClick={() => void submit()}>{busy ? 'Đang gửi lại…' : 'Thử lại đúng yêu cầu này'} <ArrowRight size={16} aria-hidden="true" /></button>
              : <button type="submit" className={styles.primary} disabled={locked}>Giữ chỗ đấu giá <ArrowRight size={16} aria-hidden="true" /></button>}
            <Link className={styles.secondary} to={ROUTES.myBooks}>Để sau</Link>
          </div>
          {unknown && <p className={styles.stepHint}>Lựa chọn đang được khóa để lần gửi lại khớp với yêu cầu trước. Bạn có thể kiểm tra trong <Link to={`${ROUTES.myAuctions}?view=selling`}>Đấu giá của tôi</Link>.</p>}
        </form>

        <aside className={styles.preview} aria-label="Xem trước phiếu đấu giá">
          <div className={styles.ticket}>
            <p className={styles.kicker}><Gavel size={15} aria-hidden="true" /> Phiếu đấu giá · xem trước</p>
            <div className={styles.ticketBook}>
              <span className={styles.ticketCover}>{listing ? <ListingPhoto item={listing} title={identity.title} /> : <span className={styles.photoState}><BookOpen size={22} aria-hidden="true" />Chọn sách</span>}</span>
              <div>
                <strong>{listing ? identity.title : 'Chưa chọn sách'}</strong>
                {listing && identity.author && <span>{identity.author}</span>}
                {listing?.currentRevision.content.condition && <span>{conditions[listing.currentRevision.content.condition]} · chờ kiểm tra tại điểm</span>}
              </div>
            </div>
            <dl className={styles.ticketPrices}>
              <div className={styles.ticketMain}><dt>Giá khởi điểm</dt><dd>{startPrice && !priceErrors.startPrice ? formatVnd(startPrice) : '—'}</dd></div>
              <div><dt>Bước giá</dt><dd>+{formatVnd(step)}</dd></div>
              <div><dt>Mua ngay</dt><dd>{buyNowOn && buyNowPrice && !formErrors.buyNowPrice ? formatVnd(buyNowPrice) : 'Không đặt'}</dd></div>
              <div><dt>Giá trị bảo vệ</dt><dd>{salePrice !== null ? formatVnd(salePrice) : '—'}</dd></div>
            </dl>
            <p className={styles.protect}>Giá trị bảo vệ bằng giá trị khai báo đã duyệt của sách đấu giá, dùng khi sách mất hoặc hỏng lúc điểm đang giữ. Đây không phải giá bán.</p>
            <ol className={styles.timeline}>
              <li className={styles.timelineNow}><Store size={15} aria-hidden="true" /><span><strong>Gửi sách trong {DROPOFF_HOURS} giờ</strong>{point ? point.name : 'Tại điểm bạn chọn'}</span></li>
              <li><Check size={15} aria-hidden="true" /><span><strong>Nhân viên kiểm tra</strong>Sách khớp mô tả mới được mở phiên</span></li>
              <li><Gavel size={15} aria-hidden="true" /><span><strong>Phiên mở 24 giờ</strong>Bạn rút được phiên trước lượt trả giá đầu</span></li>
              <li><ArrowRight size={15} aria-hidden="true" /><span><strong>Người thắng thanh toán</strong>Trong 24 giờ, rồi nhận sách tại điểm</span></li>
            </ol>
          </div>
          <p className={styles.demo}>Mỗi người bán có tối đa hai phiên chưa kết thúc. Điểm giao nhận và tiền trong ví được mô phỏng cho đồ án.</p>
        </aside>
      </div>

      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Giữ chỗ đấu giá cho cuốn sách này?"
        confirmText="Giữ chỗ"
        onConfirm={() => void submit()}
        isBusy={busy}
      >
        <ul className={styles.confirmList}>
          <li><strong>{identity.title}</strong> · khởi điểm {startPrice ? formatVnd(startPrice) : '—'}, bước {formatVnd(step)}{buyNowOn && buyNowPrice ? `, mua ngay ${formatVnd(buyNowPrice)}` : ''}.</li>
          <li>Sách đấu giá chuyển sang Đang giữ cho phiên này.</li>
          <li>Mang sách tới {point?.name ?? 'điểm đã chọn'} trong {DROPOFF_HOURS} giờ. Phiên chỉ mở sau khi sách qua kiểm tra.</li>
        </ul>
      </ConfirmDialog>
    </div>
  )
}
