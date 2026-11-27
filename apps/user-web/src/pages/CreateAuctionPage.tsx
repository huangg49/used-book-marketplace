import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@used-books/session-client'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpen, Check, EyeOff, Gavel, MapPin, Minus, Plus, Search, ShieldCheck, Store, Tag, Users, X } from 'lucide-react'
import { useSession } from '../hooks/useSession'
import { commandOutcomeUnknown, useIntentKey } from '../hooks/useAuctionClock'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { InfoTip } from '../components/InfoTip'
import { getMyBookIdentity, getMyListings, getMyPhoto, type MyListing } from '../services/my-listings'
import { editGroupedAmount, formatGroupedAmount } from '../lib/grouped-amount'
import {
  AUCTION_MAX_PRICE, AUCTION_TYPES, BUY_NOW_MODES, MIN_BIDDER_OPTIONS, AUCTION_MIN_BIDDERS_FLOOR, AUCTION_MIN_BIDDERS_CAP, auctionDepositError, auctionDepositFor, auctionDepositMaxFor, AUCTION_MIN_PRICE, AUCTION_PRICE_DIGITS, AUCTION_STEP_MAX, AUCTION_STEPS, auctionStepError, createAuctionIntake, getMyAuctionIntake, intakePriceErrors, listHandoverPoints,
  type AuctionStep, type AuctionType, type BuyNowMode, type CreateIntakeBody, type HandoverPoint, type MyIntake,
} from '../services/auctions'
import { conditions } from '../lib/listing-labels'
import { auctionEligible } from '../lib/owner-listing-labels'
import { formatVnd, ROUTES } from '../lib/routes'
import styles from './CreateAuctionPage.module.css'

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

// Case- and diacritic-insensitive, so "de men" finds "Dế Mèn".
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().trim()

function BookOption({ item, checked, disabled, query, onSelect }: { item: MyListing; checked: boolean; disabled: boolean; query: string; onSelect: () => void }) {
  const { title, author } = useListingIdentity(item)
  // Filtering here uses the resolved catalog title; the selected book stays visible.
  if (query && !checked && !fold(`${title} ${author}`).includes(query)) return null
  const c = item.currentRevision.content
  const priceDisplay = c.salePrice != null
    ? formatVnd(c.salePrice)
    : c.exchangeValue != null
    ? `${formatVnd(c.exchangeValue)} (trao đổi)`
    : 'Chưa đặt giá'
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
        <span>Giá trên kệ</span>
        <strong>{priceDisplay}</strong>
      </span>
      <Check className={styles.tick} size={18} aria-hidden="true" />
    </label>
  )
}

// ADR 0087: quick picks between the 10% default and half the start price.
function depositChips(startPrice: number) {
  const min = auctionDepositFor(startPrice), max = auctionDepositMaxFor(startPrice)
  const picks = [{ amount: min, label: 'mặc định' }]
  for (const pct of [20, 30, 50]) {
    const amount = Math.min(max, Math.ceil((startPrice * pct) / 100 / 1000) * 1000)
    if (amount > picks[picks.length - 1]!.amount) picks.push({ amount, label: `${pct}% giá khởi điểm` })
  }
  return picks
}

function PriceInput({ id, label, value, step, min, max = AUCTION_MAX_PRICE, digits = AUCTION_PRICE_DIGITS, onChange, disabled, error, hint }: {
  id: string; label: string; value: number | null; step: number; min: number; max?: number; digits?: number; disabled: boolean
  onChange: (v: number | null) => void; error?: string; hint?: ReactNode
}) {
  const nudge = (dir: 1 | -1) => {
    const base = value ?? min - (dir > 0 ? step : 0)
    onChange(Math.min(max, Math.max(min, base + dir * step)))
  }
  const inputRef = useRef<HTMLInputElement>(null)
  const selectionCollapsed = useRef(false)
  const caretRef = useRef<number | null>(null)
  const isAlreadyFocused = useRef(false)

  const selectAll = (target: HTMLInputElement) => {
    target.select()
    setTimeout(() => {
      if (document.activeElement === target) {
        target.select()
      }
    }, 0)
  }

  const currentDigits = value === null ? '' : String(value)
  const shown = formatGroupedAmount(currentDigits)

  useLayoutEffect(() => {
    if (caretRef.current !== null && inputRef.current && document.activeElement === inputRef.current) {
      inputRef.current.setSelectionRange(caretRef.current, caretRef.current)
      caretRef.current = null
    }
  }, [shown])

  const describedBy = [error ? `${id}-help` : null, hint ? `${id}-tip` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id}>{label}</label>
        {hint && <InfoTip id={`${id}-tip`} label={label}>{hint}</InfoTip>}
      </div>
      <div data-focus-surface data-focus-invalid={!!error} className={`${styles.money} ${error ? styles.invalid : ''}`}>
        {/* The input grows with its digits so "đ" sits right after the amount. */}
        <label htmlFor={id} className={styles.moneyValue}>
          <input
            ref={inputRef}
            id={id} type="text" inputMode="numeric" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} disabled={disabled} placeholder="0"
            // Fallback width: separators are narrower than a digit (1ch).
            style={{ width: `${Math.max(shown.replace(/\D/g, '').length, 1) + (shown.match(/\D/g)?.length ?? 0) * 0.4 + 0.15}ch` }}
            value={shown}
            aria-invalid={!!error} aria-describedby={describedBy}
            onFocus={(e) => {
              if (!isAlreadyFocused.current) {
                isAlreadyFocused.current = true
                selectAll(e.currentTarget)
              }
            }}
            onBlur={() => {
              isAlreadyFocused.current = false
            }}
            onKeyDown={(e) => {
              selectionCollapsed.current = e.currentTarget.selectionStart === e.currentTarget.selectionEnd
            }}
            onBeforeInput={(e) => {
              selectionCollapsed.current = e.currentTarget.selectionStart === e.currentTarget.selectionEnd
            }}
            onChange={(e) => {
              const node = e.currentTarget
              const edit = editGroupedAmount(
                currentDigits,
                node.value,
                node.selectionStart ?? node.value.length,
                (e.nativeEvent as InputEvent).inputType,
                selectionCollapsed.current,
              )
              selectionCollapsed.current = false
              const capped = edit.digits.slice(0, digits)
              const finalFormatted = formatGroupedAmount(capped)
              node.value = finalFormatted
              const nextCaret = Math.min(edit.caret, finalFormatted.length)
              node.setSelectionRange(nextCaret, nextCaret)
              caretRef.current = nextCaret
              onChange(capped ? Number(capped) : null)
            }}
          />
          <span className={styles.unit} aria-hidden="true">đ</span>
        </label>
        <span className={styles.moneySteps}>
          <button type="button" onClick={() => nudge(-1)} disabled={disabled || value === null || value - step < min} aria-label={`Giảm ${label.toLowerCase()} một bước`}><Minus size={16} aria-hidden="true" /></button>
          <button type="button" onClick={() => nudge(1)} disabled={disabled || (value ?? 0) + step > max} aria-label={`Tăng ${label.toLowerCase()} một bước`}><Plus size={16} aria-hidden="true" /></button>
        </span>
      </div>
      {error && <p id={`${id}-help`} className={styles.error} role="alert">{error}</p>}
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
        <p>Sách đã chuyển sang trạng thái Đang giữ cho phiên đấu giá và tạm ngừng hiển thị trên kệ công khai. Phiên chỉ mở sau khi nhân viên nhận và kiểm tra sách.</p>
        <dl className={styles.receiptFacts}>
          <div><dt>Điểm gửi sách</dt><dd>{point ? <>{point.name}<span>{point.displayAddress}</span></> : 'Điểm đã chọn'}</dd></div>
          <div><dt>Hạn gửi sách</dt><dd>{when(intake.dropoffDeadline)}</dd></div>
          <div><dt>Giá khởi điểm · bước</dt><dd>{formatVnd(intake.startPrice)} · {formatVnd(intake.step)}</dd></div>
          <div><dt>Mua ngay</dt><dd>{intake.buyNowPrice === null ? 'Không đặt' : `${formatVnd(intake.buyNowPrice)}${intake.buyNowMode === 'Instant' ? ' · kết thúc ngay' : ''}`}</dd></div>
        </dl>
        <div className={styles.receiptActions}>
          <Link className={styles.primary} to={`${ROUTES.myAuctions}?view=selling`}>Theo dõi trong Đấu giá của tôi <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link className={styles.secondary} to={ROUTES.auctions}>Về sàn đấu giá</Link>
        </div>
      </div>
    </section>
  )
}


// Full-width ledger-paper backdrop behind the centred page column.
function AuctionStage({ children }: { children: ReactNode }) {
  return (
    <div className={styles.stage}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.page}>{children}</div>
    </div>
  )
}

export function CreateAuctionPage() {
  const auth = useSession()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const ownerId = auth.status === 'authenticated' ? auth.user.id : undefined

  // Sách được chọn trực tiếp từ kệ của người bán (đã duyệt, chưa bị khoá/bán).
  const listings = useInfiniteQuery({
    queryKey: ['my-listings', ownerId, 'shelf-for-auction', 'cursor'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getMyListings(undefined, pageParam, 50),
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: !!ownerId, retry: false, staleTime: 0,
  })
  const points = useQuery({ queryKey: ['handover-points'], queryFn: listHandoverPoints, enabled: !!ownerId, retry: false, staleTime: 0 })

  const eligible = useMemo(() => (listings.data?.pages.flatMap(page => page.items) ?? []).filter(auctionEligible), [listings.data])
  const [listingId, setListingId] = useState(params.get('listing') ?? '')
  const [bookQuery, setBookQuery] = useState('')
  const [pointChoice, setPointId] = useState('')
  const [presetStep, setPresetStep] = useState<AuctionStep>(10000)
  const [customStepOn, setCustomStepOn] = useState(false)
  const [customStep, setCustomStep] = useState<number | null>(null)
  const stepError = customStepOn ? auctionStepError(customStep) : undefined
  // Prices keep a usable grid while the custom step is still being typed.
  const step = customStepOn && !stepError ? customStep! : presetStep

  // Giá trị khai báo / bảo vệ do người bán nhập trực tiếp hoặc kế thừa từ giá sách trên kệ.
  const [declaredDraft, setDeclaredDraft] = useState<number | null | undefined>(undefined)
  // undefined = not edited yet, so the suggestion applies.
  const [startDraft, setStartPrice] = useState<number | null | undefined>(undefined)
  const [buyNowOn, setBuyNowOn] = useState(false)
  const [buyNowPrice, setBuyNowPrice] = useState<number | null>(null)
  // ADR 0074: Challenge keeps the 60 s / 5 min window, Instant ends the auction.
  const [buyNowMode, setBuyNowMode] = useState<BuyNowMode>('Challenge')
  // ADR 0076: format; Dutch adds an opening price and a drop interval.
  const [auctionType] = useState<AuctionType>('English')
  // ADR 0077: how many registered bidders open the auction.
  const [minBidders, setMinBidders] = useState<number>(AUCTION_MIN_BIDDERS_FLOOR)
  // Digits typed in the "Khác" chip; committed (clamped) on blur so typing "12" is not cut to "4".
  const [minDraft, setMinDraft] = useState<string | null>(null)
  const customMin = !MIN_BIDDER_OPTIONS.some((n) => n === minBidders)
  // ADR 0087: null follows the 10% default of the start price.
  const [depositDraft, setDepositDraft] = useState<number | null>(null)
  const [dutchTop, setDutchTop] = useState<number | null>(null)
  const [dutchEvery, setDutchEvery] = useState<number>(60)
  const english = auctionType === 'English'
  const [touched, setTouched] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<MyIntake | null>(null)
  const [acknowledgedId, setAcknowledgedId] = useState<string | null>(null)
  const running = useRef(false)
  const recoveryHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!acknowledgedId || done) return
    recoveryHeading.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [acknowledgedId, done])
  const intent = useIntentKey()
  // An unknown outcome freezes the exact body and key so a retry replays the same intent.
  const pending = useRef<{ body: CreateIntakeBody; key: string } | null>(null)
  const [unknown, setUnknown] = useState(false)

  const listing = eligible.find((l) => l.id === listingId)
  const preselectedMissing = !!params.get('listing') && listings.isSuccess && !listings.hasNextPage && !listing && listingId === params.get('listing')

  const defaultDeclared = listing
    ? listing.currentRevision.content.salePrice ?? listing.currentRevision.content.exchangeValue ?? 50000
    : null
  const declaredValue = declaredDraft === undefined ? defaultDeclared : declaredDraft

  const identity = useListingIdentity(listing)
  const openPoints = (points.data?.items ?? []).filter((p) => p.status === 'Active')
  const single = openPoints.length === 1 && openPoints[0]!.availableSlots > 0 ? openPoints[0]!.id : ''
  const pointId = pointChoice || single
  const point = points.data?.items.find((p) => p.id === pointId)
  const doneIntakePoint = done ? points.data?.items.find((p) => p.id === done.pointId) : undefined

  // Gợi ý giá khởi điểm theo giá trị khai báo
  const suggested = declaredValue === null ? null
    : Math.min(AUCTION_MAX_PRICE, Math.max(AUCTION_MIN_PRICE, Math.floor((declaredValue * 0.6) / step) * step))
  const startPrice = startDraft === undefined ? suggested : startDraft

  const priceErrors = intakePriceErrors(startPrice, step, english && buyNowOn ? buyNowPrice : null, declaredValue)
  const missingBuyNow = english && buyNowOn && buyNowPrice === null
  const dutchTopError = auctionType !== 'Dutch' ? undefined
    : dutchTop === null ? 'Nhập giá mở đầu.'
    : startPrice !== null && dutchTop <= startPrice ? 'Giá mở đầu phải cao hơn giá sàn.'
    : startPrice !== null && (dutchTop - startPrice) % step !== 0 ? 'Giá mở đầu phải bằng giá sàn cộng một số bước giá.'
    : undefined
  const depositDefault = startPrice !== null ? auctionDepositFor(startPrice) : null
  const deposit = depositDraft ?? depositDefault
  const depositError = depositDraft === null ? undefined : auctionDepositError(startPrice, depositDraft)
  const dutchEveryError = auctionType === 'Dutch' && (dutchEvery < 10 || dutchEvery > 3600) ? 'Từ 10 giây đến 3.600 giây.' : undefined
  const formErrors = {
    listing: !listing ? 'Chọn một cuốn sách trên kệ để đưa lên đấu giá.' : undefined,
    point: !point ? 'Chọn điểm gửi sách.' : point.status !== 'Active' || point.availableSlots < 1 ? 'Điểm này đang hết chỗ, hãy chọn điểm khác.' : undefined,
    declaredValue: priceErrors.declaredValue,
    step: stepError,
    startPrice: priceErrors.startPrice,
    buyNowPrice: missingBuyNow ? 'Nhập giá mua ngay hoặc bỏ chọn mua ngay.' : priceErrors.buyNowPrice,
    dutchTopPrice: dutchTopError,
    dutchIntervalSeconds: dutchEveryError,
    depositAmount: depositError,
  }
  const valid = !Object.values(formErrors).some(Boolean)
  const locked = busy || unknown || !!acknowledgedId

  const buyNowChips = startPrice && !priceErrors.startPrice
    ? [3, 5, 10].map((n) => startPrice + n * step).filter((v) => v <= AUCTION_MAX_PRICE)
    : []

  if (auth.status === 'anonymous') return <Navigate to={`/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (auth.status !== 'authenticated') return <main className={styles.state} role="status">Đang mở bàn đấu giá…</main>
  if (done) return <AuctionStage><Receipt intake={done} point={doneIntakePoint} /></AuctionStage>
  if (acknowledgedId) return (
    <AuctionStage>
      <section className={styles.receipt}>
        <img src="/illustrations/book-journey/auction.webp" width="900" height="600" alt="" aria-hidden="true" decoding="async" />
        <div>
          <p className={styles.kicker}><Gavel size={15} aria-hidden="true" /> Đã giữ chỗ đấu giá</p>
          <h1 ref={recoveryHeading} tabIndex={-1}>Phiếu gửi sách đang chờ tải</h1>
          <p role="status">Yêu cầu giữ chỗ đã được xác nhận. Tải lại phiếu để xem điểm nhận và hạn gửi sách.</p>
          {error && <p className={styles.submitError} role="alert">{error}</p>}
          <div className={styles.receiptActions}>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void retryReceipt(acknowledgedId)}>
              {busy ? 'Đang tải phiếu…' : 'Tải lại phiếu đã giữ chỗ'}
            </button>
            <Link className={styles.secondary} to={`${ROUTES.myAuctions}?view=selling&intakeId=${acknowledgedId}`}>Mở đúng phiếu trong Đấu giá của tôi</Link>
          </div>
        </div>
      </section>
    </AuctionStage>
  )

  async function readReceipt(intakeId: string) {
    const intake = await getMyAuctionIntake(intakeId)
    if (intake.id !== intakeId) throw new Error('Unexpected intake identity')
    return intake
  }

  async function retryReceipt(intakeId: string) {
    if (running.current) return
    running.current = true
    setBusy(true); setError(null)
    try {
      setDone(await readReceipt(intakeId))
      window.scrollTo({ top: 0 })
    } catch {
      setError('Chưa tải được phiếu đã giữ chỗ. Kiểm tra kết nối rồi tải lại, hoặc mở phiếu trong Đấu giá của tôi.')
    } finally {
      running.current = false; setBusy(false)
    }
  }

  const submit = async () => {
    if (running.current || acknowledgedId || (!pending.current && !valid)) return
    const body: CreateIntakeBody = pending.current?.body ?? {
      listingId: listing!.id,
      expectedListingVersion: listing!.version,
      pointId: point!.id,
      startPrice: startPrice!,
      step,
      buyNowPrice: english && buyNowOn ? buyNowPrice : null,
      buyNowMode: english && buyNowOn ? buyNowMode : 'Challenge',
      auctionType,
      minBidders,
      depositAmount: depositDraft ?? undefined,
      dutchTopPrice: auctionType === 'Dutch' ? dutchTop : null,
      dutchIntervalSeconds: auctionType === 'Dutch' ? dutchEvery : null,
      declaredValue: declaredValue ?? undefined,
    }
    const key = pending.current?.key ?? intent.keyFor(JSON.stringify(body))
    pending.current = { body, key }
    running.current = true
    let stillUnknown = false
    setBusy(true); setError(null)
    try {
      const receipt = await createAuctionIntake(body, key)
      if (receipt.entityType !== 'AuctionIntake') throw new Error('Unexpected intake receipt')
      setAcknowledgedId(receipt.entityId)
      intent.settle(); pending.current = null
      const intake = await readReceipt(receipt.entityId).catch(() => null)
      void queryClient.invalidateQueries({ queryKey: ['my-auction-intakes'] })
      void queryClient.invalidateQueries({ queryKey: ['my-listings'] })
      void queryClient.invalidateQueries({ queryKey: ['my-auctions'] })
      if (intake) { setDone(intake); window.scrollTo({ top: 0 }) }
      else setError('Đã giữ chỗ đấu giá nhưng chưa tải được phiếu gửi sách. Xem trong Đấu giá của tôi.')
    } catch (caught) {
      stillUnknown = commandOutcomeUnknown(caught)
      if (!stillUnknown) { intent.settle(); pending.current = null }
      setError(commandError(caught))
      if (!stillUnknown) { void listings.refetch(); void points.refetch() }
    } finally {
      running.current = false; setUnknown(stillUnknown); setBusy(false); setConfirming(false)
    }
  }

  const loadingBooks = listings.isPending
  return (
    <AuctionStage>
      <nav className={styles.crumbs} aria-label="Đường dẫn">
        <Link to={ROUTES.auctions}>Đấu giá</Link><span aria-hidden="true">/</span><span aria-current="page">Mở phiên mới</span>
      </nav>
      <header className={styles.intro}>
        <div>
          <div className={styles.introTitle}>
            <h1>Đưa một cuốn sách trên kệ lên sàn đấu giá</h1>
            <InfoTip label="Cách mở phiên đấu giá">Chọn sách trực tiếp từ kệ của bạn, đặt <strong>giá trị khai báo</strong> và <strong>giá khởi điểm</strong> rồi <strong>mang sách tới điểm nhận</strong>. Khi gửi yêu cầu, sách sẽ <mark>tạm ngừng hiển thị trên kệ mua bán công khai</mark> để chuẩn bị mở phiên.</InfoTip>
          </div>
        </div>
        <img className={styles.art} src="/illustrations/book-journey/auction.webp" width="900" height="600" alt="" aria-hidden="true" decoding="async" />
      </header>

      <section className={styles.compare} aria-label="Khác nhau giữa bài đăng bán và phiên đấu giá">
        <div className={styles.compareListing}>
          <p className={styles.compareTag}><Tag size={15} aria-hidden="true" /> Bài đăng trên kệ</p>
          <ul>
            <li>Giá niêm yết hoặc trao đổi <span className={styles.key}>cố định</span></li>
            <li>Người mua nhắn tin, <span className={styles.key}>hai bên tự hẹn</span> giao sách</li>
            <li><span className={styles.key}>Hiển thị công khai</span> đến khi có người mua hoặc gửi đấu giá</li>
          </ul>
        </div>
        <ArrowRight className={styles.compareArrow} size={20} aria-hidden="true" />
        <div className={styles.compareAuction}>
          <p className={styles.compareTag}><Gavel size={15} aria-hidden="true" /> Phiên đấu giá</p>
          <ul>
            <li>Sách <mark className={styles.flag}>tạm ẩn khỏi chợ công khai</mark> để giữ chỗ</li>
            <li>Sách được <span className={styles.key}>nhân viên kiểm tra tại điểm</span> trước khi mở phiên</li>
            <li>Bạn hẹn giờ mở phiên, thời lượng <span className={styles.key}>1–168 giờ</span></li>
          </ul>
        </div>
      </section>

      <div className={styles.layout}>
        <form className={styles.form} noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (valid && !locked) setConfirming(true) }}>
          <div className={styles.stepCard}>
            <fieldset className={styles.step} disabled={locked} aria-labelledby="auction-step-1">
              <legend>
                <span className={styles.num}>1</span> <span id="auction-step-1">Chọn sách từ kệ của bạn</span>
                <InfoTip label="Chọn sách từ kệ">Chọn một cuốn sách <strong>đã được duyệt</strong> từ kệ của bạn. Sau khi gửi yêu cầu, sách sẽ <mark>tạm ngừng hiển thị trên kệ mua bán công khai</mark> và chuyển sang trạng thái <strong>chờ tiếp nhận tại điểm</strong>.</InfoTip>
              </legend>
              <div className={styles.inlineActions}><Link to={ROUTES.sell}>Đăng sách mới lên kệ</Link></div>
              {loadingBooks && <div className={styles.skeletonList} aria-busy="true" aria-label="Đang tải sách của bạn">{[0, 1].map((i) => <div key={i} />)}</div>}
              {listings.isError && !listings.isFetchNextPageError && <div className={styles.inlineState} role="alert"><p>Chưa tải được sách trên kệ của bạn.</p><button type="button" onClick={() => void listings.refetch()}>Thử lại</button></div>}
              {listings.isSuccess && eligible.length === 0 && (
                <div className={styles.inlineState}>
                  <BookOpen size={28} aria-hidden="true" />
                  <p><strong>Chưa thấy sách đủ điều kiện trong phần kệ đã tải.</strong> Tải tiếp sách cũ hơn nếu còn, hoặc đăng sách mới và chờ duyệt.</p>
                </div>
              )}
              {preselectedMissing && <p className={styles.error} role="alert">Cuốn sách bạn chọn hiện không đưa lên đấu giá được. Hãy chọn một cuốn khác bên dưới.</p>}
              {eligible.length > 3 && (
                <div data-focus-surface className={styles.bookSearch}>
                  <Search size={16} aria-hidden="true" />
                  <input type="search" value={bookQuery} disabled={locked} onChange={(e) => setBookQuery(e.target.value)}
                    placeholder="Tìm theo tên sách hoặc tác giả" aria-label={`Tìm trong ${eligible.length} sách đã tải`} autoComplete="off" />
                  {bookQuery && <button type="button" onClick={() => setBookQuery('')} aria-label="Xóa từ khóa tìm sách"><X size={16} aria-hidden="true" /></button>}
                </div>
              )}
              {eligible.length > 0 && (
                <div className={styles.bookList} role="radiogroup" aria-label="Sách đủ điều kiện đấu giá">
                  {eligible.map((item) => (
                    <BookOption key={item.id} item={item} checked={item.id === listingId} disabled={locked} query={fold(bookQuery)}
                      onSelect={() => {
                        setListingId(item.id)
                        if (item.id !== listingId) {
                          setDeclaredDraft(undefined)
                          setStartPrice(undefined)
                          setBuyNowPrice(null)
                        }
                      }} />
                  ))}
                </div>
              )}
              {eligible.length > 0 && <p className={styles.noMatch} role="status">Không tìm thấy sách khớp “{bookQuery.trim()}” trong sách đã tải. {listings.hasNextPage ? "Bạn có thể tải tiếp sách cũ hơn." : ""}</p>}
              {listings.hasNextPage && <div className={styles.inlineState}>
                <p role={listings.isFetchNextPageError ? 'alert' : 'status'}>{listings.isFetchNextPageError
                  ? 'Chưa tải được sách cũ hơn. Sách đã chọn và giá đang nhập vẫn được giữ.'
                  : `Đã tải ${listings.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? 0} sách từ kệ. Bạn có thể tải tiếp để tìm sách cũ hơn.`}</p>
                <button type="button" disabled={locked || listings.isFetching}
                  onClick={() => void listings.fetchNextPage({ cancelRefetch: false })}>
                  {listings.isFetchingNextPage ? 'Đang tải sách…' : listings.isFetchNextPageError ? 'Thử tải sách cũ hơn' : 'Tải thêm sách từ kệ'}
                </button>
              </div>}
              {touched && formErrors.listing && eligible.length > 0 && <p className={styles.error} role="alert">{formErrors.listing}</p>}
            </fieldset>
          </div>

          <div className={styles.stepCard}>
            <fieldset className={styles.step} disabled={locked} aria-labelledby="auction-step-2">
              <legend>
                <span className={styles.num}>2</span> <span id="auction-step-2">Chọn điểm gửi sách</span>
                <InfoTip label="Điểm gửi sách">Bạn <strong>tự mang sách</strong> tới điểm <mark>trong {DROPOFF_HOURS} giờ</mark> kể từ khi giữ chỗ. Điểm nhận và kiểm tra là <strong>mô phỏng cho đồ án</strong>.</InfoTip>
              </legend>
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
          </div>

          <div className={styles.stepCard}>
            <fieldset className={styles.step} disabled={locked} aria-labelledby="auction-step-3">
              <legend>
                <span className={styles.num}>3</span> <span id="auction-step-3">Đặt giá và giá trị bảo vệ</span>
                <InfoTip label="Đặt giá">Nhập <strong>giá trị khai báo</strong> để bảo vệ sách khi gửi tại điểm. Giá khởi điểm và mua ngay đi theo lưới <strong><em>giá khởi điểm + n × bước giá</em></strong>, <strong>từ 10.000đ</strong> trở lên.</InfoTip>
              </legend>

              {/* Step 3 is split into titled panels so each group of fields reads as one unit. */}
              <section className={styles.panel} aria-labelledby="auction-panel-price">
                <div className={styles.panelHead}>
                  <span className={styles.panelIcon} aria-hidden="true"><Tag size={16} /></span>
                  <h2 id="auction-panel-price">Giá đấu giá</h2>
                </div>
                <div className={styles.pair}>
                  <PriceInput
                    id="auction-declared-value"
                    label="Giá trị khai báo (Giá trị bảo vệ)"
                    value={declaredValue}
                    step={10000}
                    min={AUCTION_MIN_PRICE}
                    disabled={locked}
                    onChange={setDeclaredDraft}
                    error={touched || declaredValue !== null ? formErrors.declaredValue : undefined}
                    hint={<>Dùng để <strong>bảo vệ và bồi thường</strong> sách nếu xảy ra sự cố trong quá trình bàn giao tại điểm.</>}
                  />
                  <PriceInput id="auction-start" label={auctionType === 'Dutch' ? 'Giá sàn (thấp nhất)' : 'Giá khởi điểm'} value={startPrice} step={step} min={AUCTION_MIN_PRICE} disabled={locked}
                    onChange={setStartPrice} error={touched || startPrice !== null ? formErrors.startPrice : undefined}
                    hint={declaredValue !== null
                      ? <>Gợi ý theo giá trị khai báo <strong>{formatVnd(declaredValue)}</strong>. Giá khởi điểm hợp lý <strong>thu hút nhiều người trả giá hơn</strong>.</>
                      : <>Lượt trả giá đầu tiên <strong>bằng đúng giá khởi điểm</strong>.</>} />
                </div>

                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <span className={styles.label} id="step-label">Bước giá</span>
                    <InfoTip id="auction-step-tip" label="Bước giá">Mỗi lượt trả giá tăng <strong>ít nhất bằng bước này</strong>. Nếu tự nhập: <strong>bội số của 1.000đ</strong>, từ <strong>1.000đ</strong> đến <strong>10.000.000đ</strong>.</InfoTip>
                  </div>
                  <div className={styles.segment} role="radiogroup" aria-labelledby="step-label">
                    {AUCTION_STEPS.map((s) => (
                      <label key={s} className={!customStepOn && presetStep === s ? styles.segmentOn : undefined}>
                        <input type="radio" name="auction-step" checked={!customStepOn && presetStep === s} onChange={() => { setPresetStep(s); setCustomStepOn(false) }} />
                        {formatVnd(s)}
                      </label>
                    ))}
                    {customStepOn ? (
                      // The chosen "Tự nhập" chip becomes the step input itself.
                      <span data-focus-surface data-focus-invalid={!!stepError} className={`${styles.segmentOn} ${styles.stepCustom} ${stepError ? styles.stepCustomInvalid : ''}`}>
                        <input
                          // eslint-disable-next-line jsx-a11y/no-autofocus -- focus follows the user's own "Tự nhập" choice
                          autoFocus inputMode="numeric" autoComplete="off" placeholder="0" disabled={locked}
                          value={customStep === null ? '' : customStep.toLocaleString('vi-VN')}
                          aria-label="Bước giá tự nhập" aria-invalid={!!stepError} aria-describedby={stepError ? 'auction-step-help auction-step-tip' : 'auction-step-tip'}
                          onFocus={(e) => {
                            const target = e.currentTarget
                            target.select()
                            setTimeout(() => target.select(), 0)
                          }}
                          onChange={(e) => { const typed = e.target.value.replace(/\D/g, '').slice(0, String(AUCTION_STEP_MAX).length); setCustomStep(typed ? Number(typed) : null) }}
                        />
                        <span aria-hidden="true">đ</span>
                      </span>
                    ) : (
                      <label>
                        <input type="radio" name="auction-step" checked={false} onChange={() => { setCustomStepOn(true); if (customStep === null) setCustomStep(presetStep) }} />
                        Tự nhập
                      </label>
                    )}
                  </div>
                  {customStepOn && stepError && <p id="auction-step-help" className={styles.error} role="alert">{stepError}</p>}
                </div>

                {/* Hình thức đấu giá hidden per owner request */}
                {auctionType === 'Dutch' && <>
                  <PriceInput id="auction-dutch-top" label="Giá mở đầu (cao nhất)" value={dutchTop} step={step} min={(startPrice ?? AUCTION_MIN_PRICE - step) + step} disabled={locked}
                    onChange={setDutchTop} error={touched || dutchTop !== null ? formErrors.dutchTopPrice : undefined} hint="Giá bắt đầu cao, giảm một bước giá mỗi lần tới giá sàn." />
                  <div className={styles.field}>
                    <label htmlFor="auction-dutch-every">Giảm một bước sau mỗi</label>
                    <div data-focus-surface data-focus-invalid={!!dutchEveryError} className={`${styles.money} ${dutchEveryError ? styles.invalid : ''}`}>
                      <label htmlFor="auction-dutch-every" className={styles.moneyValue}>
                        <input id="auction-dutch-every" inputMode="numeric" autoComplete="off" disabled={locked} value={dutchEvery || ''}
                          style={{ width: `${Math.max(String(dutchEvery || '').length, 1) + 0.15}ch` }}
                          aria-invalid={!!dutchEveryError} aria-describedby="auction-dutch-every-help"
                          onChange={(e) => setDutchEvery(Number(e.target.value.replace(/\D/g, '').slice(0, 4)) || 0)} />
                        <span className={styles.unit} aria-hidden="true">giây</span>
                      </label>
                    </div>
                    <p id="auction-dutch-every-help" className={dutchEveryError ? styles.error : styles.hint}>{dutchEveryError ?? 'Từ 10 giây đến 1 giờ.'}</p>
                  </div>
                </>}
              </section>

              <section className={styles.panel} aria-labelledby="auction-panel-bidders">
                <div className={styles.panelHead}>
                  <span className={styles.panelIcon} aria-hidden="true"><Users size={16} /></span>
                  <h2 id="auction-panel-bidders">Người đăng ký &amp; tiền cọc</h2>
                  <InfoTip label="Quy tắc đăng ký và mở phiên">
                    <ul>
                      <li><strong>Đăng ký trước:</strong> người mua đặt cọc <mark>{deposit !== null ? formatVnd(deposit) : '10% giá khởi điểm'}</mark> rồi mới được trả giá.</li>
                      <li><strong>Mở khi đủ người:</strong> phiên mở đúng giờ bạn hẹn khi có đủ <mark>{minBidders} người</mark> (ít nhất {AUCTION_MIN_BIDDERS_FLOOR}); chưa đủ thì chờ thêm <mark>24 giờ</mark>, hết hạn thì hủy và hoàn cọc.</li>
                      <li><strong>Hẹn giờ:</strong> tối đa <mark>30 ngày</mark> sau khi đăng, đổi được <mark>2 lần</mark>.</li>
                      <li><strong>Bán được khi:</strong> có <mark>ít nhất hai người trả giá</mark>. Người thắng không thanh toán thì <mark>mất tiền cọc</mark>; nếu sách không bán được, bạn nhận <mark>một nửa số đó</mark>.</li>
                    </ul>
                  </InfoTip>
                </div>
                <div className={styles.group}>
                  <span className={styles.label} id="auction-min-label">Số người đăng ký tối thiểu</span>
                  <div className={styles.chips} role="group" aria-labelledby="auction-min-label">
                    {MIN_BIDDER_OPTIONS.map((n) => <button type="button" key={n} aria-pressed={minBidders === n} disabled={locked} onClick={() => { setMinDraft(null); setMinBidders(n) }}>{n} người<span>tối thiểu</span></button>)}
                    {/* One chip: the number is typed straight into it, no inner box. */}
                    <label data-focus-surface className={`${styles.minCustom} ${customMin ? styles.minCustomOn : ''}`}>
                      <span>Khác</span>
                      <input type="text" inputMode="numeric" autoComplete="off" aria-label={`Số người đăng ký tối thiểu, từ ${AUCTION_MIN_BIDDERS_FLOOR} đến ${AUCTION_MIN_BIDDERS_CAP}`} placeholder={String(AUCTION_MIN_BIDDERS_FLOOR)}
                        value={minDraft ?? (customMin ? String(minBidders) : '')} disabled={locked}
                        onChange={(e) => {
                          const typed = e.target.value.replace(/\D/g, '').slice(0, String(AUCTION_MIN_BIDDERS_CAP).length)
                          setMinDraft(typed)
                          const n = Number(typed)
                          if (typed && n >= AUCTION_MIN_BIDDERS_FLOOR && n <= AUCTION_MIN_BIDDERS_CAP) setMinBidders(n)
                        }}
                        onBlur={() => {
                          if (minDraft) setMinBidders(Math.min(AUCTION_MIN_BIDDERS_CAP, Math.max(AUCTION_MIN_BIDDERS_FLOOR, Number(minDraft))))
                          setMinDraft(null)
                        }} />
                      <span className={styles.minUnit} aria-hidden="true">người</span>
                    </label>
                  </div>
                </div>
                {startPrice !== null && !formErrors.startPrice ? <>
                  <div className={styles.pair}>
                    <PriceInput id="auction-deposit" label="Tiền cọc đăng ký" value={deposit} step={1000} min={depositDefault!} max={auctionDepositMaxFor(startPrice)} disabled={locked}
                      onChange={(v) => setDepositDraft(v === depositDefault ? null : v)} error={depositError}
                      hint={<>Mặc định <strong>{formatVnd(depositDefault!)}</strong> (10% giá khởi điểm). Bạn có thể tăng tới <strong>{formatVnd(auctionDepositMaxFor(startPrice))}</strong> (một nửa giá khởi điểm) để người đăng ký cân nhắc hơn; <mark>cọc cao có thể làm ít người đăng ký hơn</mark>. Người không thắng <strong>được hoàn cọc</strong>.</>} />
                  </div>
                  <div className={styles.chips} role="group" aria-label="Gợi ý tiền cọc">
                    {depositChips(startPrice).map((c) => <button type="button" key={c.amount} aria-pressed={deposit === c.amount} disabled={locked}
                      onClick={() => setDepositDraft(c.amount === depositDefault ? null : c.amount)}>{formatVnd(c.amount)}<span>{c.label}</span></button>)}
                  </div>
                </> : <p className={styles.panelNote}>Nhập giá khởi điểm hợp lệ để đặt tiền cọc đăng ký.</p>}
              </section>

              {english && <section className={`${styles.panel} ${buyNowOn ? '' : styles.panelCollapsed}`} aria-labelledby="auction-panel-buy-now">
                <div className={styles.panelHead}>
                  <label className={styles.toggle}>
                    <input type="checkbox" checked={buyNowOn} disabled={locked} aria-describedby="auction-buy-now-tip" onChange={() => { setBuyNowOn(!buyNowOn); if (!buyNowOn && buyNowPrice === null && buyNowChips[1]) setBuyNowPrice(buyNowChips[1]) }} />
                    <span><strong id="auction-panel-buy-now">Cho phép mua ngay</strong></span>
                  </label>
                  <InfoTip id="auction-buy-now-tip" label="Mua ngay">Còn dùng được sau lượt trả giá nếu giá hiện tại <strong>thấp hơn giá mua ngay</strong>. Lượt trả giá chạm giá mua ngay <mark>cũng tính như mua ngay</mark>.</InfoTip>
                </div>
                {buyNowOn && <>
                  <div className={styles.pair}>
                    <PriceInput id="auction-buy-now" label="Giá mua ngay" value={buyNowPrice} step={step} min={(startPrice ?? AUCTION_MIN_PRICE - step) + step} disabled={locked}
                      onChange={setBuyNowPrice} error={touched || buyNowPrice !== null ? formErrors.buyNowPrice : undefined} hint={<>Phải <strong>cao hơn giá khởi điểm</strong> và <strong>nằm trên lưới giá</strong>.</>} />
                  </div>
                  {buyNowChips.length > 0 && (
                    <div className={styles.chips} aria-label="Gợi ý giá mua ngay">
                      {buyNowChips.map((v, i) => <button type="button" key={v} aria-pressed={buyNowPrice === v} disabled={locked} onClick={() => setBuyNowPrice(v)}>{formatVnd(v)}<span>+{[3, 5, 10][i]} bước</span></button>)}
                    </div>
                  )}
                  <div className={styles.group}>
                    <div className={styles.labelRow}>
                      <span className={styles.label} id="auction-buy-now-mode-label">Khi có người mua ngay</span>
                      <InfoTip label="Khi có người mua ngay">{BUY_NOW_MODES.find((m) => m.value === buyNowMode)!.hint}</InfoTip>
                    </div>
                    <div className={styles.chips} role="group" aria-labelledby="auction-buy-now-mode-label">
                      {BUY_NOW_MODES.map((m) => <button type="button" key={m.value} aria-pressed={buyNowMode === m.value} disabled={locked} onClick={() => setBuyNowMode(m.value)}>{m.label}<span>{m.short}</span></button>)}
                    </div>
                  </div>
                </>}
              </section>}
            </fieldset>
          </div>

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
              <div><dt>Mua ngay</dt><dd>{buyNowOn && buyNowPrice && !formErrors.buyNowPrice ? `${formatVnd(buyNowPrice)} · ${buyNowMode === 'Instant' ? 'kết thúc ngay' : 'chờ thách đấu'}` : 'Không đặt'}</dd></div>
              <div><dt className={styles.ticketTerm}>Giá trị bảo vệ <InfoTip label="Giá trị bảo vệ">Giá trị bảo vệ <strong>bồi thường khi sách mất hoặc hỏng</strong> lúc điểm đang giữ. Khi giữ chỗ, sách sẽ <mark>ngừng hiển thị trên kệ mua bán công khai</mark>.</InfoTip></dt><dd>{declaredValue !== null && !priceErrors.declaredValue ? formatVnd(declaredValue) : '—'}</dd></div>
              <div><dt>Tiền cọc đăng ký</dt><dd>{deposit !== null ? formatVnd(deposit) : '—'}</dd></div>
              <div><dt>Hình thức</dt><dd>{AUCTION_TYPES.find((t) => t.value === auctionType)!.label}</dd></div>
              <div><dt>Mở khi đủ</dt><dd>{minBidders} người</dd></div>
            </dl>
            <ol className={styles.timeline}>
              <li className={styles.timelineNow}><Store size={15} aria-hidden="true" /><span><strong>Gửi sách trong {DROPOFF_HOURS} giờ</strong>{point ? point.name : 'Tại điểm bạn chọn'}</span></li>
              <li><Check size={15} aria-hidden="true" /><span><strong>Nhân viên kiểm tra</strong><span>Sách <span className={styles.key}>khớp mô tả</span> mới được mở phiên</span></span></li>
              <li><Gavel size={15} aria-hidden="true" /><span><strong>Bạn hẹn giờ mở phiên</strong><span>Sau khi sách đạt kiểm tra; phiên mở khi <span className={styles.key}>đủ người đăng ký</span>, thời lượng <span className={styles.key}>1–168 giờ</span></span></span></li>
              <li><ArrowRight size={15} aria-hidden="true" /><span><strong>Người thắng thanh toán</strong><span><span className={styles.key}>Trong 24 giờ</span>, rồi nhận sách tại điểm</span></span></li>
            </ol>
          </div>
          <p className={styles.demo}>Mỗi người bán có <span className={styles.key}>tối đa hai phiên</span> chưa kết thúc. Điểm giao nhận và tiền trong ví được <span className={styles.key}>mô phỏng cho đồ án</span>.</p>
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
        <div className={styles.confirm}>
          <p className={styles.confirmBook}><BookOpen size={16} aria-hidden="true" /><strong>{identity.title}</strong></p>
          <dl className={styles.confirmPrices}>
            <div><dt>Khởi điểm</dt><dd>{startPrice ? formatVnd(startPrice) : '—'}</dd></div>
            <div><dt>Bước giá</dt><dd>+{formatVnd(step)}</dd></div>
            <div><dt>Tiền cọc</dt><dd>{deposit !== null ? formatVnd(deposit) : '—'}</dd></div>
            <div><dt>Mua ngay</dt><dd>{buyNowOn && buyNowPrice ? `${formatVnd(buyNowPrice)} · ${buyNowMode === 'Instant' ? 'kết thúc ngay' : 'chờ thách đấu'}` : 'Không đặt'}</dd></div>
            <div><dt>Giá trị bảo vệ</dt><dd>{declaredValue ? formatVnd(declaredValue) : '—'}</dd></div>
          </dl>
          <p className={styles.confirmLabel}>Sau khi giữ chỗ</p>
          <ol className={styles.confirmSteps}>
            <li><EyeOff size={16} aria-hidden="true" /><span>Sách tạm ẩn khỏi kệ mua bán công khai.</span></li>
            <li><MapPin size={16} aria-hidden="true" /><span>Mang sách tới <strong>{point?.name ?? 'điểm đã chọn'}</strong> trong <strong>{DROPOFF_HOURS} giờ</strong>.</span></li>
            <li><ShieldCheck size={16} aria-hidden="true" /><span>Phiên chỉ mở sau khi nhân viên kiểm tra sách.</span></li>
          </ol>
        </div>
      </ConfirmDialog>
    </AuctionStage>
  )
}
