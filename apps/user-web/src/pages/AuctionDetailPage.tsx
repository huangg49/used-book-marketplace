import { formatDuration } from '../components/DurationInput'
import { AuctionFlag } from '../features/support/AuctionFlag'
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, auctionBidHoldNotes, auctionBidHoldText, auctionSellerAmounts, auctionSellerSaleLabels, createServerNow } from '@used-books/session-client'
import { SaleFeeBreakdown } from '../components/SaleFeeBreakdown'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookMarked, CalendarClock, Check, CheckCircle2,
  ChevronDown, ChevronRight, ChevronUp, CircleSlash, Clock, FileText, Flame, Gavel, Images, MapPin, Package,
  ShieldCheck, StickyNote, TrendingUp, Trophy, UserRound, Users, Wallet, Zap,
} from 'lucide-react'
import { useCurrentMemberAvatar } from '../hooks/useCurrentMemberAvatar'
import { AccountBackdrop } from '../components/AccountBackdrop'
import { AuctionActionDialog, type AuctionDialogStep } from '../components/AuctionActionDialog'
import { AutoBidDialog } from '../components/AutoBidDialog'
import { InfoTip } from '../components/InfoTip'
import { formatRemaining, outcomeUnknown, commandOutcomeUnknown, useCountdown, useIntentKey } from '../hooks/useAuctionClock'
import { readAuctionNewest, useAuctionLive } from '../hooks/useAuctionLive'
import { useTransactionLive } from '../hooks/useTransactionLive'
import { useSession } from '../hooks/useSession'
import { formatVnd, ROUTES } from '../lib/routes'
import { getWalletSummary } from '../services/wallet'
import {
  AUCTION_MAX_PRICE, AUCTION_MAX_SCHEDULE_EDITS, AUCTION_PRICE_DIGITS, auctionPhase, bidOptions, buyNow, disableAutoBid, getMyAuctionIntakes, getMyParticipation, instantNeedsRival, registrationBlocks, canWithdrawRegistration, waitingForRegistrants, waitingTime, openRuleText, closeReasonText,
  placeBid, setAutoBid, withdrawIntake, advanceDemoAuction,
  type MyIntake,
  type AuctionParticipation, type AuctionState, type AuctionSummary,
} from '../services/auctions'
import styles from './AuctionDetailPage.module.css'
import { AuctionGallery } from '../components/AuctionGallery'
import { conditions } from '../lib/listing-labels'
import { AuctionPrice } from '../components/AuctionPrice'
import { AuctionReceipt } from '../components/AuctionReceipt'
import { DemoSkipButton } from '../components/DemoSkipButton'
import { useAuctionChangeMotion } from '../hooks/useAuctionMotion'
import { rowFrames, standingFrames } from '../lib/auction-motion'
import { commandError } from '../lib/auction-errors'
import { ScheduleAuctionDialog } from '../components/ScheduleAuctionDialog'
import { DutchPanel, RegistrationPanel, SealedPanel, SecondChancePanel, WaitingSellerControls } from './AuctionFormatPanels'

const HOUR = 3_600_000

const CLOSE_TITLE: Record<NonNullable<AuctionSummary['closeReason']>, string> = {
  NotEnoughBidders: 'Phiên không đủ người tham gia',
  RegistrationExpired: 'Phiên không đủ người đăng ký',
  SellerClosed: 'Người bán đã đóng phiên',
  HoldExpired: 'Phiên đã tự hủy',
  Reported: 'Phiên đã bị quản trị viên đóng',
}

const CLOSED_PRICE: Partial<Record<AuctionState, string>> = {
  BuyNowPending: 'Giá mua ngay',
  AwaitingWinnerPayment: 'Giá chốt',
  Sold: 'Giá chốt',
  PaymentExpired: 'Giá thắng (chưa thanh toán)',
  SecondChanceOffered: 'Giá thắng (chưa thanh toán)',
  OnHold: 'Giá khi tạm dừng',
  Cancelled: 'Giá khi hủy',
}

const TOP_BADGE: Partial<Record<AuctionState, string>> = {
  Active: 'Đang dẫn',
  AwaitingWinnerPayment: 'Giá chốt',
  Sold: 'Giá chốt',
  OnHold: 'Dẫn khi tạm dừng',
  Cancelled: 'Dẫn khi hủy',
  PaymentExpired: 'Giá thắng',
}

const STATE_LABEL: Record<AuctionState, string> = {
  Active: 'Đang nhận giá',
  BuyNowPending: 'Đã có người mua ngay',
  AwaitingWinnerPayment: 'Chờ thanh toán',
  Sold: 'Đã bán',
  Unsold: 'Không có lượt trả giá',
  OnHold: 'Tạm dừng',
  Cancelled: 'Đã hủy',
  PaymentExpired: 'Quá hạn thanh toán',
  SecondChanceOffered: 'Đang mời người thứ hai',
}

type DetailTone = 'pay' | 'lead' | 'outbid' | 'mine' | 'soon' | 'won' | 'done' | 'live'

function detailToneOf(
  auction: AuctionSummary,
  me: AuctionParticipation | null,
  sellerView: boolean,
  open: boolean,
  scheduled: boolean,
): DetailTone {
  if (me?.won && (auction.state === 'AwaitingWinnerPayment' || auction.state === 'BuyNowPending')) return 'pay'
  if (auction.state === 'SecondChanceOffered' && me?.secondChance?.outcome === 'Offered') return 'pay'
  if (me?.won && auction.state === 'Sold') return 'won'
  if (open && me?.leading) return 'lead'
  if (open && me && !me.leading && me.ownLevel !== null) return 'outbid'
  if (sellerView && (open || scheduled)) return 'mine'
  if (scheduled) return 'soon'
  if (!open) return 'done'
  return 'live'
}

function when(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' })
}
function whenMs(iso: string) {
  const d = new Date(iso)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return {
    clock: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    ms: `.${pad(d.getMilliseconds(), 3)}`,
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
  }
}
const plain = (amount: number) => amount.toLocaleString('vi-VN')

/** Giá hợp lệ: giá khởi điểm + n·bước, từ floor trở lên (ADR 0067). */
function amountError(amount: number | null, floor: number, start: number, step: number) {
  if (!amount) return 'Nhập số tiền bạn muốn trả.'
  if (amount < floor) return `Tối thiểu ${formatVnd(floor)}.`
  if (amount > AUCTION_MAX_PRICE) return 'Số tiền vượt mức hệ thống hỗ trợ.'
  if ((amount - start) % step !== 0) {
    const up = start + Math.ceil((amount - start) / step) * step
    return `Giá đi theo bước ${formatVnd(step)}. Thử ${formatVnd(Math.min(up, AUCTION_MAX_PRICE))}.`
  }
  return null
}

type Intent = { kind: 'Manual' | 'Auto' | 'Disable' | 'BuyNow'; amount: number }

export function AuctionDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const location = useLocation()
  const session = useSession()
  const queryClient = useQueryClient()
  const valid = /^[0-9a-f-]{36}$/i.test(id)
  const authed = session.status === 'authenticated'
  // Pushes keep the page live; REST polling is only the fallback when the socket is down.
  const pushing = useAuctionLive(valid ? id : undefined)
  const live = (data?: { auction?: AuctionSummary; state?: AuctionState }) =>
    (data?.auction?.state ?? data?.state) === 'Active' ? (pushing ? 60_000 : 10_000) : false
  const detail = useQuery({
    queryKey: ['auction', id], queryFn: () => readAuctionNewest(queryClient, id), enabled: valid, retry: false, staleTime: 0,
    refetchInterval: (query) => live(query.state.data),
  })
  const participation = useQuery({
    queryKey: ['auction-participation', id, authed ? session.user.id : undefined],
    queryFn: async () => {
      try { return await getMyParticipation(id) } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    enabled: valid && authed, retry: false, staleTime: 0,
    refetchInterval: (query) => {
      const p = query.state.data
      if (p?.won && !p.orderId) return 3_000
      return live(p ?? undefined)
    },
  })
  const intakes = useQuery({
    queryKey: ['my-auction-intakes', authed ? session.user.id : undefined, 'auction', id],
    queryFn: () => getMyAuctionIntakes(id), enabled: valid && authed, retry: false, staleTime: 0,
    refetchInterval: ({ state }) => {
      const status = state.data?.items[0]?.sellerSale?.status
      return status === 'AwaitingPayment' || status === 'PendingSettlement' ? 8_000 : false
    },
  })
  const sellerIntake = intakes.data?.items.find((i) => i.auctionId === id) ?? null
  const sellerView = !!sellerIntake
  const saleState = detail.data?.auction.state
  const { refetch: refreshIntakes } = intakes
  const sellerSale = sellerIntake?.sellerSale
  useTransactionLive('point-order',
    sellerSale?.status === 'AwaitingPayment' || sellerSale?.status === 'PendingSettlement' ? sellerSale.orderId : undefined,
    () => {
      void refreshIntakes()
      void queryClient.invalidateQueries({ queryKey: ['wallet-summary'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  )
  useEffect(() => {
    if (sellerView && (saleState === 'AwaitingWinnerPayment' || saleState === 'BuyNowPending' || saleState === 'Sold')) void refreshIntakes()
  }, [sellerView, saleState, refreshIntakes])
  const remaining = useCountdown(detail.data?.auction.endAt, detail.data?.serverTime)
  const untilStart = useCountdown(detail.data?.auction.startAt, detail.data?.serverTime)
  const scheduled = !!detail.data && auctionPhase(detail.data.auction, detail.data.serverTime) === 'Scheduled' && untilStart > 0
  const waitingAt = detail.data ? waitingTime(detail.data.auction, Date.parse(detail.data.serverTime)) : null
  const untilWaiting = useCountdown(waitingAt?.at, detail.data?.serverTime)
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['my-auction-intakes'] }),
    queryClient.invalidateQueries({ queryKey: ['auction', id] }),
    queryClient.invalidateQueries({ queryKey: ['auction-participation', id] }),
    queryClient.invalidateQueries({ queryKey: ['auctions'] }),
    queryClient.invalidateQueries({ queryKey: ['wallet-summary'] }),
  ])
  const ended = remaining === 0 && detail.data?.auction.state === 'Active'
  const starting = !!detail.data && detail.data.auction.phase === 'Scheduled' && untilStart === 0
  useEffect(() => {
    if (!starting) return
    const timer = window.setTimeout(() => void refresh(), 1000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starting])
  useEffect(() => {
    if (!ended) return
    const timer = window.setTimeout(() => void refresh(), 2000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended, detail.dataUpdatedAt])

  if (!valid || (detail.error instanceof ApiError && detail.error.status === 404)) {
    return (
      <>
        <AccountBackdrop />
        <div className={styles.stateWrap}>
          <div className={styles.stateCard}>
            <h1>Không tìm thấy phiên đấu giá</h1>
            <p className={styles.muted}>Phiên có thể đã bị gỡ hoặc đường dẫn không còn đúng.</p>
            <Link className={styles.primaryInline} to={ROUTES.auctions}>
              <ArrowLeft size={16} aria-hidden="true" /> Về sàn đấu giá
            </Link>
          </div>
        </div>
      </>
    )
  }
  const stale = detail.isError && !!detail.data && outcomeUnknown(detail.error)
  if (detail.isError && !stale) {
    return (
      <>
        <AccountBackdrop />
        <div className={styles.stateWrap}>
          <div className={styles.stateCard} role="alert">
            <h1>Chưa tải được phiên đấu giá</h1>
            <p className={styles.muted}>
              {detail.error instanceof ApiError && [401, 403].includes(detail.error.status)
                ? 'Bạn không có quyền xem phiên này. Kiểm tra phiên đăng nhập hoặc trạng thái tài khoản.'
                : 'Vui lòng kiểm tra kết nối rồi thử lại.'}
            </p>
            <button type="button" className={styles.secondary} onClick={() => void detail.refetch()}>Thử lại</button>
          </div>
        </div>
      </>
    )
  }
  if (!detail.data) {
    return (
      <>
        <AccountBackdrop />
        <div className={styles.stateWrap}>
          <div className={styles.stateCard} role="status">
            <p className={styles.muted}>Đang mở phiên đấu giá…</p>
          </div>
        </div>
      </>
    )
  }

  const { auction, history, leaderAlias } = detail.data
  const serverNow = createServerNow(detail.data.serverTime)()
  const open = auction.state === 'Active' && remaining > 0 && !scheduled && auction.phase !== 'Ended'
  const participationStale = participation.isError && participation.data !== undefined && outcomeUnknown(participation.error)
  const me = participation.isError && !participationStale ? null : participation.data ?? null
  const hasBids = auction.bidderCount > 0
  const priceLabel = open || auction.currentPrice === null
    ? hasBids ? 'Giá hiện tại' : 'Giá khởi điểm'
    : CLOSED_PRICE[auction.state] ?? 'Giá cuối'
  const tone = detailToneOf(auction, me, sellerView, open, scheduled)

  let action
  if (authed && intakes.isPending) action = <p className={styles.muted} role="status">Đang kiểm tra vai trò của bạn trong phiên…</p>
  else if (authed && intakes.isError && !intakes.data) action = null
  else if (sellerIntake) action = <SellerPanel auction={auction} intake={sellerIntake} open={open} scheduled={scheduled} serverTime={detail.data.serverTime} onChanged={refresh} paused={intakes.isError} />
  else if (auction.state === 'SecondChanceOffered' && me?.secondChance?.outcome === 'Offered')
    action = <SecondChancePanel auction={auction} me={me} serverTime={detail.data.serverTime} onChanged={refresh} />
  else if (me?.won) action = (
    <div className={styles.bidPanel}>
      <div className={`${styles.standing} ${styles.standingLead}`}>
        <strong><Trophy size={16} aria-hidden="true" /> {me.boughtNow ? 'Bạn đã mua ngay sách này' : 'Bạn đã thắng phiên'}</strong>
        <span>Mở đơn để xem hạn thanh toán và chọn cách nhận sách.</span>
      </div>
      <Link className={styles.primaryBlock} to={ROUTES.auctionOrder(id)}>
        Mở đơn đấu giá <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  )
  else if (auction.state === 'OnHold')
    action = (
      <div className={`${styles.standing} ${styles.standingOut}`}>
        <div className={styles.standingHead}>
          <strong><AlertTriangle size={16} aria-hidden="true" /> Phiên tạm dừng</strong>
          <InfoTip label="Quy định tạm dừng phiên">
            <ul>
              <li>Quản trị viên đang xem xét phiên. Lượt trả giá, đăng ký và tiền cọc được <strong>giữ nguyên</strong>.</li>
              <li>Nếu phiên tiếp tục, thời gian tạm dừng được cộng lại.</li>
              {auction.holdExpiresAt && (
                <li>Nếu chưa xử lý trước <strong>{when(auction.holdExpiresAt)}</strong>, phiên tự hủy và <mark>mọi khoản giữ được hoàn</mark>.</li>
              )}
            </ul>
          </InfoTip>
        </div>
        <span>
          Đang chờ quản trị viên xem xét.
          {auction.holdExpiresAt ? <> Tự hủy sau <b>{when(auction.holdExpiresAt)}</b> nếu chưa mở lại.</> : ' Không có khoản tiền nào bị trừ.'}
        </span>
      </div>
    )
  else if (authed && (scheduled || open) && !participation.isPending
    && (registrationBlocks(auction, me) || (scheduled && canWithdrawRegistration(auction, me, serverNow))))
    action = <RegistrationPanel auction={auction} me={me} serverTime={detail.data.serverTime} onChanged={refresh} />
  else if (scheduled)
    action = (
      <div className={styles.notice}>
        <div className={styles.noticeTitleRow}>
          <strong><Clock size={16} aria-hidden="true" /> Phiên chưa mở</strong>
          <InfoTip label="Quy định mở phiên">
            <ul>
              <li>{auction.openMode ? openRuleText(auction, serverNow) : `Mở phiên lúc ${when(auction.startAt)}.`}</li>
              <li>Khi phiên mở, bạn có thể trả giá{auction.buyNowPrice !== null ? <> hoặc mua ngay với <strong>{formatVnd(auction.buyNowPrice)}</strong></> : ''}.</li>
            </ul>
          </InfoTip>
        </div>
        <p>
          Mở lúc <b>{when(auction.startAt)}</b>
          {auction.buyNowPrice !== null ? <> · Mua ngay <b>{formatVnd(auction.buyNowPrice)}</b></> : ''}.
        </p>
      </div>
    )
  else if (!open && closeReasonText(auction))
    action = (
      <div className={styles.notice}>
        <strong><CircleSlash size={16} aria-hidden="true" /> {CLOSE_TITLE[auction.closeReason!]}</strong>
        <p>{closeReasonText(auction)}</p>
        <Link className={styles.secondaryBlock} to={ROUTES.auctions}>Xem các phiên khác</Link>
      </div>
    )
  else if (!open)
    action = (
      <div className={styles.notice}>
        <strong>
          {ended
            ? (me?.leading ? (me.boughtNow ? 'Bạn đã mua ngay sách này' : 'Bạn đang dẫn giá khi hết giờ') : 'Phiên vừa hết giờ')
            : 'Phiên đã đóng'}
        </strong>
        <p>
          {ended
            ? me?.leading
              ? 'Hệ thống đang chốt đơn để bạn thanh toán từ ví. Trang sẽ tự cập nhật.'
              : 'Hệ thống đang chốt người thắng. Trang sẽ tự cập nhật.'
            : me ? 'Bạn không thắng phiên này. Tiền cọc và khoản giữ (nếu có) đã về lại ví.' : `${STATE_LABEL[auction.state]}.`}
        </p>
        <Link className={styles.secondaryBlock} to={ROUTES.auctions}>Xem các phiên khác</Link>
      </div>
    )
  else if (session.status === 'loading') action = <p className={styles.muted}>Đang kiểm tra đăng nhập…</p>
  else if (!authed)
    action = (
      <div className={styles.notice}>
        <div className={styles.noticeTitleRow}>
          <strong><Gavel size={16} aria-hidden="true" /> Đăng nhập để trả giá</strong>
          <InfoTip label="Quy định giữ tiền khi trả giá">
            <ul>
              <li>{auctionBidHoldText(auction.depositAmount != null)}</li>
              <li>Nếu thắng, thanh toán từ Ví trong <strong>24 giờ</strong> để nhận sách.</li>
            </ul>
          </InfoTip>
        </div>
        <p>Trả giá trực tiếp hoặc đặt giá tự động bằng số dư Ví.</p>
        <Link className={styles.primaryBlock} to={`${ROUTES.login}?returnUrl=${encodeURIComponent(location.pathname + location.search)}`}>
          Đăng nhập để trả giá <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    )
  else if (participation.isPending) action = <p className={styles.muted}>Đang tải lượt trả giá của bạn…</p>
  else if (participation.isError && !participationStale)
    action = (
      <div className={styles.notice} role="alert">
        <p>Chưa tải được lượt trả giá của bạn.</p>
        <button type="button" className={styles.secondaryBlock} onClick={() => void participation.refetch()}>Thử lại</button>
      </div>
    )
  else if (auction.auctionType === 'Dutch') action = <DutchPanel auction={auction} me={me} serverTime={detail.data.serverTime} onChanged={refresh} />
  else if (auction.auctionType === 'SealedFirst' || auction.auctionType === 'SealedSecond') action = <SealedPanel auction={auction} me={me} serverTime={detail.data.serverTime} onChanged={refresh} />
  else action = <BidPanel auction={auction} me={me} serverTime={detail.data.serverTime} onChanged={refresh} paused={intakes.isError} />

  const statusText = scheduled
    ? 'Sắp mở'
    : ended
      ? 'Đang chốt kết quả'
      : STATE_LABEL[auction.state]

  return (
    <>
      <AccountBackdrop />
      <div className={styles.page}>
        {stale && (
          <div className={styles.staleBanner} role="alert">
            <p>Chưa làm mới được phiên. Giá bên dưới là lần tải gần nhất; máy chủ sẽ kiểm tra lại khi bạn trả giá.</p>
            <button type="button" className={styles.secondary} onClick={() => void detail.refetch()}>Thử cập nhật</button>
          </div>
        )}

        <div className={styles.topBar}>
          <Link to={ROUTES.auctions} className={styles.backButton}>
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Quay lại sàn đấu giá</span>
          </Link>
          <div className={styles.topActions}>
            <AuctionFlag
              auction={auction}
              ownerId={authed ? session.user.id : null}
              participant={authed && Boolean(sellerIntake || me)}
              loginReturnUrl={location.pathname + location.search}
            />
          </div>
        </div>

        <div className={styles.layout}>
          <header className={styles.headCard} data-tone={tone}>
            <div className={styles.headMain}>
              <div className={styles.metaBadges}>
                <span className={styles.statusPill} data-live={open || undefined}>
                  {open ? <span className={styles.liveDot} aria-hidden="true" /> : null}
                  {statusText}
                </span>
                {sellerView && (
                  <span className={styles.rolePill} data-role="Seller">
                    <Gavel size={12} aria-hidden="true" /> Bạn mở phiên
                  </span>
                )}
                {!sellerView && me && (
                  <span className={styles.rolePill} data-role="Bidder">
                    <Users size={12} aria-hidden="true" /> Bạn tham gia
                  </span>
                )}
                {auction.book && (
                  <span className={styles.inspectedPill}>
                    <ShieldCheck size={13} aria-hidden="true" />
                    <span>Đã kiểm tra tại điểm</span>
                    <InfoTip label="Kiểm tra tại điểm giao nhận">
                      Người bán đã gửi bản sách thật tới <strong>{auction.pointName}</strong> và nhân viên đã đối chiếu tình trạng trước khi mở phiên.
                    </InfoTip>
                  </span>
                )}
              </div>

              <h1 className={styles.title}>{auction.title}</h1>

              {(!!auction.book?.authors.length || auction.sellerName) && (
                <div className={styles.metaSub}>
                  {!!auction.book?.authors.length && (
                    <p className={styles.authors}>{auction.book.authors.join(', ')}</p>
                  )}
                  {!!auction.book?.authors.length && auction.sellerName && (
                    <span className={styles.metaDot} aria-hidden="true">·</span>
                  )}
                  {auction.sellerName && (
                    <span className={styles.sellerTag}>
                      <span className={styles.sellerAvatar} aria-hidden="true">
                        {auction.sellerName.trim().slice(0, 1).toLocaleUpperCase('vi-VN') || '?'}
                      </span>
                      <span className="sr-only">Người bán: </span>
                      <b>{auction.sellerName}</b>
                    </span>
                  )}
                </div>
              )}
            </div>

            <img
              src="/illustrations/auction-detail/gavel-crest.svg"
              alt=""
              aria-hidden="true"
              className={styles.headArt}
              width={140}
              height={109}
            />
          </header>

          <div className={styles.media}>
            <AuctionGallery key={auction.id} auction={auction} />
          </div>

          <aside className={styles.side} data-tone={tone} aria-label="Trả giá">
            {scheduled ? (
              <div className={styles.timerCard}>
                <div className={styles.timerScheduled}>
                  <span className={styles.timerClosed}>
                    <Clock size={15} aria-hidden="true" />
                    <span>{waitingAt!.label} <b>{when(waitingAt!.at)}</b></span>
                  </span>
                  <span className={styles.timerRemaining}>
                    Còn <b>{formatRemaining(untilWaiting)}</b>
                  </span>
                </div>
              </div>
            ) : (
              <Countdown ms={remaining} open={open} endAt={auction.endAt} live={pushing} state={auction.state} />
            )}

            <section className={styles.bidCard}>
              <div className={styles.priceHeader}>
                <div className={styles.priceTop}>
                  <div className={styles.priceLabelRow}>
                    <p className={styles.priceLabel}>{priceLabel}</p>
                    <InfoTip label="Cách tính giá và bước giá">
                      <ul>
                        <li>Giá khởi điểm: <strong>{formatVnd(auction.startPrice)}</strong>.</li>
                        <li>Mỗi lượt nâng tối thiểu <strong>+{formatVnd(auction.step)}</strong> theo bước giá của phiên.</li>
                      </ul>
                    </InfoTip>
                  </div>
                  <span className={styles.bidderStat}>
                    <TrendingUp size={14} aria-hidden="true" />
                    <span>{hasBids ? <><b>{auction.bidderCount}</b> người trả giá</> : 'Chưa có lượt trả giá'}</span>
                  </span>
                </div>
                <div className={styles.priceMain}>
                  <p className={styles.price} aria-live="polite" aria-atomic="true">
                    <span className="sr-only">{priceLabel}: </span>
                    <AuctionPrice auctionId={auction.id} amount={auction.currentPrice ?? auction.startPrice} />
                  </p>
                  <span className={styles.stepPill}>
                    Bước giá <b>+{formatVnd(auction.step)}</b>
                  </span>
                </div>
              </div>

              {participationStale && (
                <p className={styles.fieldError} role="alert">
                  Chưa làm mới được lượt trả giá của bạn.{' '}
                  <button type="button" className={styles.linkButton} onClick={() => void participation.refetch()}>Thử lại</button>
                </p>
              )}

              {authed && intakes.isError && (
                <div className={styles.notice} role="alert">
                  <p>Chưa kiểm tra được vai trò của bạn trong phiên. Tải lại trước khi thao tác.</p>
                  <button type="button" className={styles.secondaryBlock} onClick={() => void intakes.refetch()}>Thử lại kiểm tra vai trò</button>
                </div>
              )}

              {/* Preserve an unresolved command's key/body while role recovery hides controls. */}
              <div hidden={authed && intakes.isError}>{action}</div>

              {authed && !intakes.isError && (sellerIntake || me) && auction.version != null && (scheduled || open) && (
                <DemoSkipButton
                  label={scheduled ? 'Mở phiên ngay · Demo' : 'Kết thúc phiên ngay · Demo'}
                  run={(key) => advanceDemoAuction(auction.id, auction.version!, key)}
                  onDone={refresh}
                />
              )}
            </section>
          </aside>

          <div className={styles.body}>
            <BookCondition book={auction.book ?? null} pointName={auction.pointName} />
            <SessionFacts auction={auction} remaining={remaining} open={open} scheduled={scheduled} untilStart={untilWaiting} waiting={waitingAt!} />
            <BidHistory auctionId={auction.id} history={history} leaderAlias={leaderAlias} myAlias={me?.alias ?? null} badge={TOP_BADGE[auction.state] ?? null} startPrice={auction.startPrice} />
          </div>
        </div>
      </div>
    </>
  )
}

const CONDITION_SCALE = ['LikeNew', 'Good', 'Fair', 'Worn'] as const
type AuctionBook = NonNullable<AuctionSummary['book']>

function BookCondition({ book, pointName }: { book: AuctionBook | null; pointName: string }) {
  if (!book) {
    return (
      <section className={styles.bookCard} aria-labelledby="auction-condition-title">
        <div className={styles.cardHead}>
          <h2 id="auction-condition-title">Về bản sách này</h2>
        </div>
        <p className={styles.muted}>Thông tin bản sách hiện chưa hiển thị công khai. Bạn vẫn có thể theo dõi trạng thái phiên và diễn biến giá.</p>
      </section>
    )
  }
  const level = CONDITION_SCALE.indexOf(book.condition)
  const parts = ([
    ['Bìa sách', book.coverNote, BookMarked],
    ['Ruột sách', book.pages, FileText],
    ['Phụ kiện', book.accessories, Package],
    ['Ghi chú', book.notes, StickyNote],
  ] as const).filter(([, value]) => !!value.trim())

  return (
    <section className={styles.bookCard} aria-labelledby="auction-condition-title">
      <div className={styles.cardHead}>
        <h2 id="auction-condition-title">Về bản sách này</h2>
        <InfoTip label="Cách xác minh tình trạng sách">
          Tình trạng do người bán khai báo và đã được nhân viên tại <strong>{pointName}</strong> đối chiếu trực tiếp khi tiếp nhận sách.
        </InfoTip>
      </div>

      <div className={styles.conditionRow}>
        <div className={styles.conditionLead}>
          <span className={styles.smallLabel}>Tình trạng</span>
          <strong>{conditions[book.condition]}</strong>
        </div>
        <ol className={styles.conditionScale} aria-label={`Thang tình trạng: ${conditions[book.condition]}, bậc ${level + 1} trên 4`}>
          {CONDITION_SCALE.map((c, i) => (
            <li key={c} className={i === level ? styles.scaleOn : i < level ? styles.scalePast : undefined} aria-current={i === level ? 'true' : undefined}>
              <span aria-hidden="true" />{conditions[c]}
            </li>
          ))}
        </ol>
      </div>

      <ul className={styles.chips} aria-label="Điểm chính">
        <li className={book.hasMissingPages ? styles.chipWarn : styles.chipOk}>
          {book.hasMissingPages ? <AlertTriangle size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
          {book.hasMissingPages ? 'Có thiếu trang · xem ghi chú' : 'Đủ trang'}
        </li>
        {book.photos.length > 0 && (
          <li><Images size={14} aria-hidden="true" /> <b>{book.photos.length}</b> ảnh thực tế</li>
        )}
      </ul>

      {book.description.trim() && (
        <figure className={styles.sellerNote}>
          <figcaption>Người bán mô tả</figcaption>
          <blockquote>{book.description}</blockquote>
        </figure>
      )}

      {parts.length > 0 && (
        <dl className={styles.partGrid}>
          {parts.map(([label, value, Icon]) => (
            <div key={label}>
              <dt><Icon size={15} aria-hidden="true" />{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })

function SessionFacts({ auction, remaining, open, scheduled, untilStart, waiting }: {
  auction: AuctionSummary; remaining: number; open: boolean; scheduled: boolean; untilStart: number; waiting: ReturnType<typeof waitingTime>
}) {
  const span = Date.parse(auction.endAt) - Date.parse(auction.startAt)
  const endKnown = !scheduled || waiting.endKnown
  const progress = scheduled ? 0 : !open ? 100 : span > 0 ? Math.min(100, Math.max(0, (1 - remaining / span) * 100)) : 0
  return (
    <section className={styles.sessionCard} aria-labelledby="auction-session-title">
      <div className={styles.cardHead}>
        <h2 id="auction-session-title">Thông tin phiên</h2>
      </div>

      <dl className={styles.priceTiles}>
        <div>
          <dt>Giá khởi điểm</dt>
          <dd>{formatVnd(auction.startPrice)}</dd>
        </div>
        <div>
          <dt>Bước giá</dt>
          <dd>+{formatVnd(auction.step)}</dd>
        </div>
        <div className={auction.buyNowPrice !== null ? styles.tileAccent : undefined}>
          <dt className={styles.tileLabelRow}>
            <span>Mua ngay</span>
            {auction.buyNowPrice === null && (auction.bidderCount > 0 || !open) && (
              <InfoTip label="Vì sao không còn Mua ngay">
                Giá hiện tại đã chạm mức mua ngay, đã có người mua ngay hoặc phiên này không áp dụng mức mua ngay.
              </InfoTip>
            )}
          </dt>
          <dd>
            {auction.buyNowPrice !== null ? formatVnd(auction.buyNowPrice) : auction.bidderCount > 0 || !open ? 'Không còn' : 'Không áp dụng'}
          </dd>
        </div>
      </dl>

      <div className={styles.window}>
        <div className={styles.windowEnds}>
          {scheduled ? (
            <p><span>{waiting.label}</span><strong>{clock(waiting.at)}</strong><small>{day(waiting.at)}</small></p>
          ) : (
            <p><span>Mở phiên</span><strong>{clock(auction.startAt)}</strong><small>{day(auction.startAt)}</small></p>
          )}
          {endKnown ? (
            <p><span>Kết thúc</span><strong>{clock(auction.endAt)}</strong><small>{day(auction.endAt)}</small></p>
          ) : (
            <p><span>Thời lượng</span><strong>{formatDuration(Math.round(span / 1000))}</strong><small>sau khi mở</small></p>
          )}
        </div>
        <div
          className={styles.track}
          data-live={open || undefined}
          role="progressbar"
          aria-label="Thời gian phiên đã trôi qua"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.windowNote} role={open && auction.buyNowAt ? 'status' : undefined}>
          {scheduled ? (
            <>{waiting.label === 'Mở lúc' ? 'Mở sau' : 'Hết hạn đăng ký sau'} <b>{formatRemaining(untilStart)}</b> · kéo dài <b>{formatDuration(Math.round(span / 1000))}</b></>
          ) : !open ? (
            'Phiên đã đóng'
          ) : auction.buyNowAt && auction.buyNowMode === 'Instant' ? (
            <>Đã có người mua ngay · <b>phiên đang chốt</b></>
          ) : auction.buyNowAt ? (
            <>Đã có người chọn mua ngay · còn <b>{formatRemaining(remaining)}</b> để trả cao hơn</>
          ) : (
            <>Còn <b>{formatRemaining(remaining)}</b> · kéo dài <b>{formatDuration(Math.round(span / 1000))}</b></>
          )}
        </p>
      </div>

      <div className={styles.pickup}>
        <span className={styles.pickupIcon} aria-hidden="true"><MapPin size={18} /></span>
        <div className={styles.pickupBody}>
          <div className={styles.pickupLabelRow}>
            <span className={styles.smallLabel}>Nhận sách tại</span>
            <InfoTip label="Cách thanh toán và nhận sách">
              <ul>
                <li>Người thắng thanh toán từ Ví trong <strong>24 giờ</strong> rồi chọn tự nhận tại điểm hoặc giao tận nơi.</li>
                <li>Điểm giao nhận và phiên đấu giá đang chạy ở chế độ mô phỏng tại <strong>TP.HCM</strong>.</li>
              </ul>
            </InfoTip>
          </div>
          <strong>{auction.pointName}</strong>
        </div>
      </div>
    </section>
  )
}

function BidHistory({ auctionId, history, leaderAlias, myAlias, badge, startPrice }: {
  auctionId: string
  history: { price: number; bidderAlias: number; at: string }[]
  leaderAlias: number | null
  myAlias: number | null
  badge: string | null
  startPrice: number
}) {
  const latest = useRef<HTMLLIElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const { avatarUrl, initial, onImageError } = useCurrentMemberAvatar()
  const [scrollState, setScrollState] = useState({ scrollable: false, down: false, up: false })
  const event = history[0]
  useAuctionChangeMotion(auctionId, event ? `${event.at}:${event.bidderAlias}:${event.price}` : 'empty', latest, rowFrames)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const sync = () => {
      const scrollable = el.scrollHeight > el.clientHeight + 4
      const down = el.scrollTop + el.clientHeight < el.scrollHeight - 4
      const up = el.scrollTop > 4
      setScrollState((prev) =>
        prev.scrollable === scrollable && prev.down === down && prev.up === up
          ? prev
          : { scrollable, down, up },
      )
    }
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', sync)
      ro?.disconnect()
    }
  }, [history.length])

  const stepScroll = () => {
    const el = listRef.current
    if (!el) return
    if (scrollState.down) {
      el.scrollBy({ top: Math.max(160, Math.round(el.clientHeight * 0.72)), behavior: 'smooth' })
    } else {
      el.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <section className={styles.historyCard} aria-labelledby="history-title">
      <div className={styles.cardHead}>
        <h2 id="history-title">Diễn biến giá</h2>
        {history.length > 0 && <span className={styles.countPill}>{history.length}</span>}
        <InfoTip label="Quy định hiển thị lượt trả giá">
          <ul>
            <li>Người trả giá hiển thị bằng <strong>số thứ tự ẩn danh</strong> (#1, #2…).</li>
            <li>Mức đặt giá tự động tối đa của mỗi người <strong>không bao giờ công khai</strong>.</li>
            <li>Mốc thời gian hiển thị tới <strong>mili giây</strong> để phân biệt thứ tự khi bằng giá.</li>
          </ul>
        </InfoTip>
      </div>

      {history.length === 0 ? (
        <div className={styles.historyEmpty}>
          <img
            src="/illustrations/auction-detail/empty-bids.svg"
            alt=""
            aria-hidden="true"
            width={168}
            height={109}
          />
          <p>Chưa có lượt trả giá nào. Khởi điểm từ <b>{formatVnd(startPrice)}</b>.</p>
        </div>
      ) : (
        <div className={styles.historyScrollWrap} data-more={scrollState.down || undefined}>
          <ol
            ref={listRef}
            data-lenis-prevent="true"
            className={styles.historyList}
            tabIndex={0}
            aria-label="Các lần giá thay đổi, mới nhất trước"
          >
            {history.map((item, index) => {
              const top = index === 0 && item.bidderAlias === leaderAlias
              const mine = myAlias === item.bidderAlias
              const ts = whenMs(item.at)
              return (
                <li key={`${item.at}:${item.bidderAlias}:${item.price}`} ref={index === 0 ? latest : undefined} className={top ? styles.historyTop : undefined}>
                  <span
                    className={`${styles.avatar} ${mine ? styles.avatarMine : ''}`}
                    data-tint={!mine ? item.bidderAlias % 4 : undefined}
                    aria-hidden="true"
                  >
                    {mine ? (
                      avatarUrl ? (
                        <img src={avatarUrl} alt="" className={styles.avatarImg} onError={onImageError} />
                      ) : (
                        initial
                      )
                    ) : (
                      <UserRound size={17} />
                    )}
                  </span>
                  <span className={styles.who}>
                    <span>{mine ? 'Bạn' : `Người trả giá #${item.bidderAlias}`}</span>
                    <small className={styles.timeRow}>
                      <span>{ts.clock}<span className={styles.timeMs}>{ts.ms}</span></span>
                      <span aria-hidden="true">·</span>
                      <span>{ts.date}</span>
                    </small>
                  </span>
                  <span className={styles.amount}>
                    <span>{formatVnd(item.price)}</span>
                    {top && badge && <em>{badge}</em>}
                  </span>
                </li>
              )
            })}
          </ol>
          {scrollState.scrollable && (
            <button type="button" className={styles.historyScrollBtn} onClick={stepScroll}>
              {scrollState.down ? (
                <><span>Cuộn xuống xem thêm</span><ChevronDown size={15} aria-hidden="true" /></>
              ) : (
                <><span>Về lượt mới nhất</span><ChevronUp size={15} aria-hidden="true" /></>
              )}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function Countdown({ ms, open, endAt, live, state }: { ms: number; open: boolean; endAt: string; live: boolean; state: AuctionState }) {
  if (!open) {
    return (
      <div className={styles.timerCard}>
        <span className={styles.timerClosed}>
          <Clock size={15} aria-hidden="true" />
          <span>
            {state === 'OnHold' ? 'Phiên tạm dừng, không nhận giá'
              : state === 'Cancelled' ? 'Phiên đã hủy'
              : state === 'Active' ? 'Đã hết giờ, đang chốt kết quả…'
              : <>Kết thúc lúc <b>{when(endAt)}</b></>}
          </span>
        </span>
      </div>
    )
  }
  const s = Math.floor(ms / 1000)
  const parts: [number, string][] = [
    [Math.floor(s / 86_400), 'ngày'],
    [Math.floor((s % 86_400) / 3600), 'giờ'],
    [Math.floor((s % 3600) / 60), 'phút'],
    [s % 60, 'giây'],
  ]
  const shown = parts[0]![0] > 0 ? parts : parts.slice(1)
  return (
    <div className={`${styles.timerCard} ${ms < HOUR ? styles.timerSoon : ''}`}>
      <div className={styles.timerParts} role="timer" aria-label={`Còn lại ${formatRemaining(ms)}`}>
        {shown.map(([value, unit], index) => (
          <Fragment key={unit}>
            {index > 0 && <span className={styles.timerSep} aria-hidden="true">:</span>}
            <span className={styles.timerBox} aria-hidden="true">
              <strong>{String(value).padStart(2, '0')}</strong>
              <small>{unit}</small>
            </span>
          </Fragment>
        ))}
      </div>
      {live && (
        <span className={`${styles.liveBadge} ${styles.liveOn}`}>
          <span aria-hidden="true" />
          Trực tiếp
        </span>
      )}
    </div>
  )
}

function AmountField({ id, label, value, onChange, disabled, hint, metaRight, error }: {
  id: string; label: string; value: number | null; onChange: (value: number | null) => void; disabled: boolean; hint: ReactNode; metaRight?: ReactNode; error: string | null
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <div data-focus-surface data-focus-invalid={!!error} className={`${styles.inputWrap} ${error ? styles.inputInvalid : ''}`}>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value ? plain(value) : ''}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, AUCTION_PRICE_DIGITS)
            onChange(digits ? Number(digits) : null)
          }}
        />
        <span className={styles.currency} aria-hidden="true">₫</span>
      </div>
      <div className={styles.bidMetaRow}>
        <p id={`${id}-hint`} className={error ? styles.fieldError : styles.fieldHint}>{error ?? hint}</p>
        {metaRight}
      </div>
    </div>
  )
}

function BidPanel({ auction, me, serverTime, onChanged, paused }: {
  auction: AuctionSummary; me: AuctionParticipation | null; serverTime: string; onChanged: () => Promise<unknown>; paused: boolean
}) {
  const leading = me?.leading ?? false
  const step = auction.step
  const minimumBid = auction.minimumBid ?? AUCTION_MAX_PRICE + step
  const autoFloor = me?.ownLevel != null ? Math.max(leading ? 0 : minimumBid, me.ownLevel + step) : minimumBid
  const [manual, setManual] = useState<number | null | undefined>(undefined)
  const manualAmount = manual === undefined ? minimumBid : manual
  const [autoDialog, setAutoDialog] = useState(false)
  const [confirming, setConfirming] = useState<Intent | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticePrice, setNoticePrice] = useState<number | null>(null)
  const [receipt, setReceipt] = useState<{ sequence: number; bid: boolean } | null>(null)
  const receiptSequence = useRef(0)
  const standing = useRef<HTMLDivElement>(null)
  const hasBid = !!me && (leading || me.ownLevel !== null)
  useAuctionChangeMotion(auction.id, hasBid ? leading : undefined, standing, standingFrames, 270)
  const [unknown, setUnknown] = useState<Intent | null>(null)
  const intent = useIntentKey()
  const ids = useId()
  const wallet = useQuery({ queryKey: ['wallet-summary'], queryFn: getWalletSummary, staleTime: 15_000, refetchOnMount: 'always' })
  const heldHere = me?.heldAmount ?? 0
  const queryClient = useQueryClient()
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['wallet-summary'] })
  }, [heldHere, queryClient])
  const available = wallet.data ? wallet.data.available + heldHere : null
  const shortOf = (amount: number | null | undefined) =>
    available !== null && amount != null && amount > available ? amount - available : 0
  const locked = busy || !!unknown
  const currentPrice = auction.currentPrice ?? auction.startPrice
  const tied = !!me && !leading && me.ownLevel !== null && me.ownLevel === auction.currentPrice
  const [wasLeading, setWasLeading] = useState(leading)
  if (wasLeading !== leading) {
    setWasLeading(leading)
    if (wasLeading && !leading && !busy) {
      setReceipt(null); setNoticePrice(null); setNotice(null)
    }
  }
  const staleNotice = noticePrice !== null && noticePrice !== currentPrice
  const manualError = manual === undefined ? null : amountError(manual, minimumBid, auction.startPrice, step)
  const manualCapped = minimumBid > AUCTION_MAX_PRICE
  const autoCapped = autoFloor > AUCTION_MAX_PRICE

  const sending = useRef(false)
  const validateIntent = (next: Intent) => {
    const now = createServerNow(serverTime)()
    if (auction.state !== 'Active' || now < Date.parse(auction.startAt) || now >= Date.parse(auction.endAt))
      return 'Phiên đã đổi trạng thái. Vui lòng cập nhật trước khi tiếp tục.'
    if (next.kind === 'Manual' && leading) return 'Bạn đang dẫn giá; chưa cần trả thêm.'
    const invalid = next.kind === 'Manual' ? amountError(next.amount, minimumBid, auction.startPrice, step)
      : next.kind === 'Auto' ? amountError(next.amount, autoFloor, auction.startPrice, step)
      : next.kind === 'BuyNow' && (next.amount !== auction.buyNowPrice || instantNeedsRival(auction, me))
        ? 'Điều kiện Mua ngay đã thay đổi. Vui lòng cập nhật phiên.'
        : null
    if (invalid) return invalid
    const short = next.kind === 'Disable' ? 0 : shortOf(next.amount)
    return short > 0 ? `Cần thêm ${formatVnd(short)} trong ví.` : null
  }

  const run = async (next: Intent) => {
    if (paused || sending.current) return
    const invalid = next === unknown ? null : validateIntent(next)
    if (invalid) {
      setError(invalid); setConfirming(null)
      return
    }
    sending.current = true
    const key = intent.keyFor(`${next.kind}:${next.amount}`)
    setBusy(true); setError(null); setNotice(null); setReceipt(null)
    try {
      const res =
        next.kind === 'Manual' ? await placeBid(auction.id, next.amount, key)
        : next.kind === 'Auto' ? await setAutoBid(auction.id, next.amount, key)
        : next.kind === 'Disable' ? await disableAutoBid(auction.id, key)
        : await buyNow(auction.id, key)
      intent.settle(); setUnknown(null); setManual(undefined); setAutoDialog(false)
      const price = res.currentPrice !== null ? formatVnd(res.currentPrice) : ''
      setNotice(
        next.kind === 'BuyNow' ? (auction.buyNowMode === 'Instant'
          ? 'Bạn đã mua ngay. Phiên kết thúc; hệ thống đang chốt đơn để bạn thanh toán từ ví.'
          : `Bạn đang dẫn với giá mua ngay. Người khác còn ${buyNowWindow(leading)} để trả cao hơn; nếu không ai vượt, bạn thắng phiên.`)
        : next.kind === 'Disable' ? 'Đã tắt đặt giá tự động.'
        : res.leading ? `Bạn đang dẫn giá ở ${price}.`
        : res.currentPrice === next.amount
          ? `Đã ghi nhận ${price}, nhưng một người khác đã cam kết mức này trước bạn nên vẫn dẫn giá.`
          : `Đã ghi nhận, nhưng một mức tự động khác cao hơn. Giá hiện tại ${price}.`,
      )
      setNoticePrice(next.kind === 'Manual' || next.kind === 'Auto' ? res.currentPrice : null)
      setReceipt({ sequence: ++receiptSequence.current, bid: next.kind === 'Manual' || next.kind === 'Auto' })
    } catch (caught) {
      if (commandOutcomeUnknown(caught)) { setUnknown(next); setAutoDialog(false) }
      else { intent.settle(); setUnknown(null) }
      setError(commandError(caught))
    } finally {
      sending.current = false
      setBusy(false); setConfirming(null)
      void onChanged()
    }
  }

  const dialog = confirming && dialogModel(confirming, auction, leading)
  const confirmProblem = confirming ? validateIntent(confirming) : null

  return (
    <div className={styles.bidPanel}>
      {hasBid && me && (
        <div ref={standing} role="status" className={`${styles.standing} ${leading ? styles.standingLead : styles.standingOut}`}>
          <strong>
            {leading ? <Check size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
            {leading ? 'Bạn đang dẫn giá' : tied ? 'Bằng giá người dẫn' : 'Bạn đã bị vượt giá'}
          </strong>
          <span>
            {tied
              ? <>Đối thủ cam kết <b>{formatVnd(currentPrice)}</b> trước bạn.</>
              : me.mode === 'Auto' && me.ownLevel !== null
                ? <>Tự động tối đa <b>{formatVnd(me.ownLevel)}</b></>
                : me.ownLevel !== null ? <>Lượt của bạn <b>{formatVnd(me.ownLevel)}</b></> : null}
          </span>
        </div>
      )}

      {notice && !staleNotice && (receipt ? <AuctionReceipt key={receipt.sequence} message={notice} bid={receipt.bid} /> : <p role="status" className={styles.fieldError}>{notice}</p>)}
      {error && !autoDialog && <p role="alert" className={styles.fieldError}>{error}</p>}

      {unknown ? (
        <div className={styles.stack}>
          <button type="button" className={styles.primaryBlock} disabled={busy} onClick={() => void run(unknown)}>
            {busy ? 'Đang thử lại…' : 'Thử lại thao tác vừa rồi'}
          </button>
          <button type="button" className={styles.secondaryBlock} disabled={busy} onClick={() => void onChanged()}>
            Cập nhật trạng thái phiên
          </button>
        </div>
      ) : leading ? (
        <p className={styles.leadHint}>Bạn đang giữ vị trí dẫn đầu. Có thể đặt hoặc nâng mức tự động bên dưới.</p>
      ) : manualCapped ? (
        <p className={styles.muted}>Giá đã chạm mức tối đa hệ thống hỗ trợ.</p>
      ) : (
        <>
          <div className={styles.quick} role="group" aria-label="Chọn nhanh mức trả">
            {bidOptions(minimumBid, step).map((value) => (
              <button key={value} type="button" disabled={locked} aria-pressed={manualAmount === value} onClick={() => setManual(value)}>
                {formatVnd(value)}
              </button>
            ))}
          </div>
          <div className={styles.customBid}>
            <AmountField
              id={`${ids}-manual`}
              label="Số tiền trả lượt này"
              value={manualAmount}
              onChange={setManual}
              disabled={locked}
              hint={<span className={styles.minHint}>Tối thiểu <b>{formatVnd(minimumBid)}</b></span>}
              metaRight={available !== null && shortOf(manualAmount) === 0 ? (
                <WalletInline
                  available={available}
                  heldHere={heldHere}
                  hasDeposit={auction.depositAmount != null}
                />
              ) : null}
              error={manualError}
            />
            {available !== null && shortOf(manualAmount) > 0 && (
              <p className={styles.walletShort} role="status">
                <Wallet size={14} aria-hidden="true" />
                <span>Khả dụng <b>{formatVnd(available)}</b> · thiếu <b>{formatVnd(shortOf(manualAmount))}</b>. <Link to={ROUTES.wallet}>Nạp ví</Link></span>
              </p>
            )}
            <button
              type="button"
              data-focus-inverse
              className={styles.continue}
              disabled={locked || !!manualError || shortOf(manualAmount) > 0}
              onClick={() => manualAmount && setConfirming({ kind: 'Manual', amount: manualAmount })}
            >
              <span>{manualAmount ? `Trả giá ${formatVnd(manualAmount)}` : 'Tiếp tục'}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {!unknown && (
        <div className={styles.secondaryZone}>
          <div className={styles.autoBid}>
            <div className={styles.autoBar}>
              <button type="button" className={styles.autoToggle} disabled={locked || autoCapped} onClick={() => { setError(null); setAutoDialog(true) }} aria-haspopup="dialog">
                <span className={styles.autoIcon} aria-hidden="true"><Zap size={15} /></span>
                <span className={styles.autoText}>
                  <strong>{me?.mode === 'Auto' ? 'Nâng mức tự động' : 'Đặt giá tự động'}</strong>
                  {autoCapped && <small>Đã ở mức tối đa</small>}
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
              <span className={styles.autoTipWrap}>
                <InfoTip label="Đặt giá tự động là gì">
                  <ul>
                    <li>Hệ thống tự trả hơn đối thủ <strong>1 bước (+{formatVnd(step)})</strong> đến mức tối đa của bạn.</li>
                    <li>Chỉ bạn thấy mức tối đa; tắt bất cứ lúc nào khi phiên còn mở.</li>
                  </ul>
                </InfoTip>
              </span>
            </div>
            {me?.mode === 'Auto' && (
              <button type="button" className={styles.linkButton} disabled={locked} onClick={() => setConfirming({ kind: 'Disable', amount: 0 })}>
                Tắt đặt giá tự động
              </button>
            )}
          </div>

          {auction.buyNowPrice !== null && (
            <div className={styles.buyNow} data-buy-now={auction.buyNowMode === 'Instant' ? 'Instant' : 'Challenge'}>
              <div className={styles.buyNowInfo}>
                <div className={styles.buyNowTitleRow}>
                  <span className={styles.buyNowTag}>
                    {auction.buyNowMode === 'Instant' ? <Zap size={12} aria-hidden="true" /> : <Flame size={12} aria-hidden="true" />}
                    <span>Mua ngay</span>
                  </span>
                  <span className={styles.buyNowModePill}>
                    {auction.buyNowMode === 'Instant' ? 'Chốt ngay' : 'Chờ thách đấu'}
                  </span>
                  <InfoTip label="Quy định mua ngay">
                    <ul>
                      <li>
                        {auction.buyNowMode === 'Instant'
                          ? <>Bạn <strong>thắng ngay</strong> và phiên kết thúc lập tức (chỉ dùng được khi đã có người khác trả giá).</>
                          : <>Sau khi bấm, người khác còn <strong>{buyNowWindow(leading)}</strong> để trả cao hơn; nếu không ai vượt, bạn thắng phiên.</>}
                      </li>
                      <li>Lượt mua ngay <mark>không thể rút lại</mark>.</li>
                    </ul>
                  </InfoTip>
                </div>
                <strong>{formatVnd(auction.buyNowPrice)}</strong>
              </div>
              <button
                type="button"
                className={styles.buyNowBtn}
                disabled={busy || shortOf(auction.buyNowPrice) > 0 || instantNeedsRival(auction, me)}
                onClick={() => setConfirming({ kind: 'BuyNow', amount: auction.buyNowPrice! })}
              >
                {auction.buyNowMode === 'Instant' ? 'Chốt ngay' : 'Mua ngay'}
              </button>
              {instantNeedsRival(auction, me) && (
                <small className={styles.buyNowHint}>Cần có người khác trả giá trước khi dùng Mua ngay.</small>
              )}
              {shortOf(auction.buyNowPrice) > 0 && (
                <small className={styles.walletShort}>
                  Thiếu <b>{formatVnd(shortOf(auction.buyNowPrice))}</b> để mua ngay. <Link to={ROUTES.wallet}>Nạp ví</Link>
                </small>
              )}
            </div>
          )}
        </div>
      )}

      <AutoBidDialog
        isOpen={autoDialog}
        paused={paused}
        onClose={() => setAutoDialog(false)}
        title={auction.title}
        pointName={auction.pointName}
        currentPrice={auction.currentPrice ?? auction.startPrice}
        startPrice={auction.startPrice}
        step={step}
        floor={autoFloor}
        currentMax={me?.mode === 'Auto' ? me.ownLevel : null}
        busy={busy}
        submissionError={error}
        onConfirm={(maxAmount) => run({ kind: 'Auto', amount: maxAmount })}
      />

      {dialog && (
        <AuctionActionDialog
          isOpen={!paused}
          paused={paused}
          onClose={() => !busy && setConfirming(null)}
          onConfirm={() => void run(confirming)}
          icon={dialog.icon}
          title={dialog.title}
          bookTitle={auction.title}
          amount={dialog.amount}
          steps={dialog.steps}
          problem={confirmProblem}
          danger={dialog.danger}
          warning={dialog.warning}
          cancelText={dialog.danger ? 'Giữ lại' : 'Hủy'}
          confirmText={dialog.confirm}
          busyText="Đang gửi…"
          isBusy={busy}
          confirmDisabled={!!confirmProblem}
        />
      )}
    </div>
  )
}

const buyNowWindow = (leading: boolean) => (leading ? '60 giây' : '5 phút')

function WalletInline({ available, heldHere, hasDeposit }: {
  available: number; heldHere: number; hasDeposit: boolean
}) {
  return (
    <span className={styles.walletInline}>
      <Wallet size={14} aria-hidden="true" />
      <span>Ví</span>
      <b>{formatVnd(available)}</b>
      <InfoTip label="Quy định giữ tiền từ Ví">
        <ul>
          {heldHere > 0 && <li>Ví đang giữ <strong>{formatVnd(heldHere)}</strong> cho phiên này (tính gộp khi nâng giá).</li>}
          <li>{auctionBidHoldText(hasDeposit)}</li>
        </ul>
      </InfoTip>
    </span>
  )
}

function dialogModel(intent: Intent, auction: AuctionSummary, leading: boolean): {
  icon: React.ReactNode
  title: string
  confirm: string
  danger?: boolean
  warning?: React.ReactNode
  amount?: { label: string; value: string; tipLabel?: string; tip?: React.ReactNode }
  steps?: AuctionDialogStep[]
} {
  const holdNotes = auctionBidHoldNotes(auction.depositAmount != null)
  const holdTip = (
    <ul>
      {holdNotes.map((n) => (
        <li key={n.label}><strong>{n.label}:</strong> {n.detail}</li>
      ))}
    </ul>
  )

  switch (intent.kind) {
    case 'Manual':
      return {
        icon: <Gavel size={20} />,
        title: 'Xác nhận trả giá',
        confirm: 'Xác nhận',
        amount: { label: 'Giá bạn trả', value: formatVnd(intent.amount), tipLabel: 'Quy định giữ tiền Ví', tip: holdTip },
        steps: [
          { icon: <Gavel size={15} />, label: 'Ghi nhận lượt trả', detail: <>Cam kết mức <b>{formatVnd(intent.amount)}</b> — không thể rút lại.</> },
          { icon: <Wallet size={15} />, label: 'Tạm giữ trong Ví', detail: <>Chỉ giữ khi dẫn giá; <b>hoàn ngay</b> nếu bị vượt.</> },
          { icon: <CheckCircle2 size={15} />, label: 'Nếu thắng phiên', detail: <>Thanh toán trong <b>24 giờ</b> · nhận tại <b>{auction.pointName}</b> hoặc giao tận nơi.</>, result: true },
        ],
      }
    case 'Auto':
      return {
        icon: <Zap size={20} />,
        title: 'Đặt giá tự động',
        confirm: 'Xác nhận',
        amount: { label: 'Mức tối đa', value: formatVnd(intent.amount), tipLabel: 'Quy định giữ tiền Ví', tip: holdTip },
        steps: [
          { icon: <TrendingUp size={15} />, label: 'Tự trả theo bước', detail: <>Hơn đối thủ <b>+{formatVnd(auction.step)}</b>, không vượt mức tối đa.</> },
          { icon: <Wallet size={15} />, label: 'Giữ & hoàn Ví', detail: <>Chỉ giữ khi dẫn giá; hoàn ngay nếu bị vượt.</> },
          { icon: <CheckCircle2 size={15} />, label: 'Nếu thắng phiên', detail: <>Thanh toán trong <b>24 giờ</b> · nhận tại <b>{auction.pointName}</b> hoặc giao tận nơi.</>, result: true },
        ],
      }
    case 'Disable':
      return {
        icon: <CircleSlash size={20} />,
        title: 'Tắt đặt giá tự động?',
        confirm: 'Tắt tự động',
        danger: true,
        warning: <>Hệ thống <b>ngừng tự động trả giá</b> ngay sau khi xác nhận.</>,
        steps: [
          { icon: <Zap size={15} />, label: 'Ngừng nâng giá tự động', detail: 'Hệ thống sẽ không trả thay bạn khi có người vượt giá.' },
          { icon: <CheckCircle2 size={15} />, label: 'Nếu bạn đang dẫn', detail: 'Bạn vẫn giữ vị trí hiện tại và cam kết mua nếu không ai trả cao hơn.', result: true },
        ],
      }
    case 'BuyNow':
      return {
        icon: <Zap size={20} />,
        title: 'Xác nhận mua ngay',
        confirm: 'Mua ngay',
        amount: { label: 'Giá mua ngay', value: formatVnd(intent.amount), tipLabel: 'Quy định giữ tiền Ví', tip: holdTip },
        steps: [
          {
            icon: <Clock size={15} />,
            label: auction.buyNowMode === 'Instant' ? 'Chốt phiên ngay' : `Mở cửa sổ ${buyNowWindow(leading)}`,
            detail: auction.buyNowMode === 'Instant'
              ? 'Bạn thắng ngay lập tức và phiên kết thúc.'
              : <>Bạn dẫn đầu ở mức mua ngay; thắng nếu không ai vượt trong <b>{buyNowWindow(leading)}</b>.</>,
          },
          { icon: <Wallet size={15} />, label: 'Tạm giữ trong Ví', detail: 'Lượt mua ngay không thể rút lại.' },
          { icon: <CheckCircle2 size={15} />, label: 'Thanh toán & nhận sách', detail: <>Thanh toán trong <b>24 giờ</b> · nhận tại <b>{auction.pointName}</b> hoặc giao tận nơi.</>, result: true },
        ],
      }
  }
}

const SELLER_STATE: Partial<Record<AuctionState, string>> = {
  BuyNowPending: 'Đã có người mua ngay; chờ thanh toán.',
  AwaitingWinnerPayment: 'Phiên kết thúc; chờ người thắng thanh toán.',
  Sold: 'Người thắng đã thanh toán; tiền giữ trong thời gian giao nhận và kiểm tra.',
  Unsold: 'Không có lượt trả giá. Sách trả lại bạn tại điểm.',
  Cancelled: 'Phiên đã hủy. Sách trả lại bạn tại điểm.',
  PaymentExpired: 'Người thắng quá hạn thanh toán. Sách trả lại bạn tại điểm.',
  SecondChanceOffered: 'Đang mời người trả giá cao thứ hai trong 24 giờ.',
  OnHold: 'Phiên tạm dừng để quản trị viên xem xét.',
}

function SellerPanel({ auction, intake, open, scheduled, serverTime, onChanged, paused }: {
  auction: AuctionSummary; intake: MyIntake; open: boolean; scheduled: boolean; serverTime: string; onChanged: () => Promise<unknown>; paused: boolean
}) {
  const sale = intake.sellerSale
  const intent = useIntentKey()
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unknown, setUnknown] = useState(false)
  const waiting = waitingForRegistrants(auction)
  const canWithdraw = (open || scheduled) && auction.bidderCount === 0 && auction.minBidders == null
  const canEdit = canWithdraw && !auction.buyNowAt && auction.version != null
    && (auction.scheduleRevision ?? 0) < AUCTION_MAX_SCHEDULE_EDITS

  const withdraw = async () => {
    const key = intent.keyFor(`withdraw:${intake.id}:${intake.version}`)
    let pending = false
    setBusy(true); setError(null)
    try {
      await withdrawIntake(intake.id, intake.version, key)
      intent.settle()
    } catch (caught) {
      pending = commandOutcomeUnknown(caught)
      if (!pending) intent.settle()
      setError(commandError(caught))
    } finally {
      setUnknown(pending); setBusy(false); setConfirming(false)
      void onChanged()
    }
  }

  return (
    <div className={styles.bidPanel}>
      <div className={`${styles.standing} ${styles.standingMine}`}>
        <div className={styles.standingHead}>
          <strong><UserRound size={15} aria-hidden="true" /> Phiên của bạn</strong>
          <InfoTip label="Quyền người bán trong phiên">
            <ul>
              {waiting ? (
                <>
                  <li>Phiên chỉ mở khi <strong>đủ người đăng ký</strong>, đúng giờ hẹn hoặc 10 phút sau khi đủ (ngoài 23:00–07:00).</li>
                  <li>Bạn có thể đổi giờ mở, đổi số người tối thiểu hoặc đóng phiên trước khi mở.</li>
                </>
              ) : open ? (
                <>
                  <li>Người bán không tham gia trả giá trong phiên của mình.</li>
                  <li>{auction.minBidders != null ? 'Phiên đã mở nên không thể đóng; cần hỗ trợ hãy dùng Báo cáo sự cố.' : 'Chỉ đổi thời lượng hoặc rút phiên trước lượt trả giá đầu tiên.'}</li>
                </>
              ) : (
                <li>Trạng thái quyết toán và tiền bán sách cập nhật trực tiếp tại đây và trong Ví.</li>
              )}
            </ul>
          </InfoTip>
        </div>
        <span>
          {waiting
            ? <>Đang nhận đăng ký · chỉ mở khi <b>đủ người</b>.</>
            : auction.minBidders != null && open
              ? <>Phiên đã mở, <b>không đóng được nữa</b>.</>
              : scheduled
                ? <>Hẹn mở lúc <b>{when(auction.startAt)}</b> · còn đổi lịch/rút được trước lượt đầu.</>
                : open
                  ? auction.bidderCount === 0
                    ? <><b>Chưa có lượt trả giá</b> · còn đổi thời lượng hoặc rút phiên.</>
                    : <>Đã có <b>{auction.bidderCount} người trả giá</b> · phiên đang diễn ra.</>
                  : closeReasonText(auction) ?? SELLER_STATE[auction.state] ?? STATE_LABEL[auction.state]}
        </span>
      </div>

      {!paused && sale && (
        <section aria-label="Tiền bán sách đấu giá" className={styles.saleBox}>
          <strong>{auctionSellerSaleLabels[sale.status]}</strong>
          {sale.status !== 'Closed' && <SaleFeeBreakdown amounts={auctionSellerAmounts(sale)} settled={sale.status === 'Settled'} />}
          {sale.status === 'Settled' && (
            <Link className={styles.saleLink} to={`/wallet?sale=${sale.orderId}#lich-su-giao-dich`}>
              Đối chiếu tiền bán trong ví <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </section>
      )}

      {error && <p role="alert" className={styles.fieldError}>{error}</p>}
      {waiting && <WaitingSellerControls auction={auction} me={null} serverTime={serverTime} onChanged={onChanged} paused={paused} />}
      {canEdit && !unknown && (
        <button type="button" data-focus-inverse className={styles.ownerPrimary} disabled={busy} onClick={() => setEditing(true)}>
          <CalendarClock size={17} aria-hidden="true" />Đổi thời gian phiên
        </button>
      )}
      {(canWithdraw || unknown) && (
        <button type="button" className={styles.ownerDanger} disabled={busy} onClick={() => (unknown ? void withdraw() : setConfirming(true))}>
          <CircleSlash size={17} aria-hidden="true" />{unknown ? 'Thử lại rút phiên' : 'Rút phiên'}
        </button>
      )}
      {canEdit && (
        <ScheduleAuctionDialog
          isOpen={editing}
          paused={paused}
          onClose={() => setEditing(false)}
          onDone={onChanged}
          title={auction.title}
          serverTime={serverTime}
          target={{ kind: 'reschedule', auctionId: auction.id, version: auction.version!, live: !scheduled, startAt: auction.startAt, endAt: auction.endAt }}
        />
      )}
      <AuctionActionDialog
        isOpen={confirming && !paused}
        paused={paused}
        onClose={() => !busy && setConfirming(false)}
        onConfirm={() => void withdraw()}
        icon={<CircleSlash size={20} />}
        title="Rút phiên đấu giá?"
        bookTitle={auction.title}
        danger
        warning={<>Phiên đóng ngay và <b>không thể khôi phục</b> sau khi rút.</>}
        cancelText="Giữ lại"
        confirmText="Rút phiên"
        busyText="Đang rút…"
        isBusy={busy}
        steps={[
          { icon: <CircleSlash size={15} />, label: 'Đóng phiên ngay', detail: 'Chỉ thành công khi chưa có lượt trả giá nào.' },
          { icon: <MapPin size={15} />, label: 'Nhận lại sách tại điểm', detail: <>Sách được trả lại cho bạn tại <b>{auction.pointName}</b>.</>, result: true },
        ]}
      />
    </div>
  )
}
