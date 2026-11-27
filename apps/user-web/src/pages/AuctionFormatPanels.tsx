// ADR 0076: action panels for Dutch and sealed-bid auctions. English auctions
// keep BidPanel. The server stays authoritative for prices, funds and timing.
import { auctionRegistrationNotes, createServerNow } from '@used-books/session-client'
import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, CircleSlash, EyeOff, Minus, TrendingDown, Users, Wallet } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TransactionAmount, TransactionNotes } from '../components/TransactionReview'
import { ScheduleAuctionDialog } from '../components/ScheduleAuctionDialog'
import { commandOutcomeUnknown, formatRemaining, useCountdown, useIntentKey } from '../hooks/useAuctionClock'
import { commandError } from '../lib/auction-errors'
import { formatVnd, ROUTES } from '../lib/routes'
import { getWalletSummary } from '../services/wallet'
import {
  AUCTION_MAX_OPEN_CHANGES, AUCTION_MIN_BIDDERS_CAP, AUCTION_MIN_BIDDERS_FLOOR, AUCTION_PRICE_DIGITS, AUCTION_RESCHEDULE_FREEZE_MS, acceptDutch,
  acceptSecondChance, canWithdrawRegistration, closeAuctionBeforeStart, declineSecondChance, openRuleText, openTimeOf, placeSealedBid, registerForAuction, setAuctionMinBidders,
  withdrawAuctionRegistration, type AuctionParticipation, type AuctionSummary,
} from '../services/auctions'
import styles from './AuctionDetailPage.module.css'

// ADR 0085: a minimum reached after the open time opens after a short notice.
const lateText = (need: number) => `mở 10 phút sau khi đủ ${need} người đăng ký (khung 23:00–07:00 thì lúc 07:00)`

type PanelProps = {
  auction: AuctionSummary
  me: AuctionParticipation | null
  serverTime: string | undefined
  onChanged: () => Promise<unknown>
}

function useAvailable(me: AuctionParticipation | null) {
  // Re-read on open: a top-up made on the wallet page (its own cache key) must
  // count at once, not after this copy goes stale.
  const wallet = useQuery({ queryKey: ['wallet-summary'], queryFn: getWalletSummary, staleTime: 15_000, refetchOnMount: 'always' })
  // The amount already held for this auction counts toward a raise.
  return wallet.data ? wallet.data.available + (me?.heldAmount ?? 0) : null
}

function Shortfall({ available, amount }: { available: number | null; amount: number | null }) {
  if (available === null || amount === null) return null
  const short = amount - available
  return short > 0 ? (
    <p className={styles.walletShort} role="status">
      <Wallet size={14} aria-hidden="true" /> Số dư khả dụng {formatVnd(available)}, cần thêm <b>{formatVnd(short)}</b>.{' '}
      <Link to={ROUTES.wallet}>Nạp ví</Link>
    </p>
  ) : (
    <p className={styles.walletLine}><Wallet size={14} aria-hidden="true" /> Số dư khả dụng <b>{formatVnd(available)}</b></p>
  )
}

/** Shared command runner: one key per intent, kept while the outcome is unknown. */
function useCommand(onChanged: () => Promise<unknown>) {
  const intent = useIntentKey()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unknown, setUnknown] = useState<(() => Promise<unknown>) | null>(null)
  const run = async (signature: string, send: (key: string) => Promise<unknown>, done: () => void) => {
    const key = intent.keyFor(signature)
    const attempt = async () => {
      setBusy(true); setError(null)
      try {
        await send(key)
        intent.settle(); setUnknown(null); done()
      } catch (caught) {
        if (commandOutcomeUnknown(caught)) setUnknown(() => attempt)
        else { intent.settle(); setUnknown(null) }
        setError(commandError(caught))
      } finally {
        setBusy(false)
        void onChanged()
      }
    }
    await attempt()
  }
  return { busy, error, unknown, run }
}

// ADR 0077: register with a refundable deposit; bidding opens at minBidders.
export function RegistrationPanel({ auction, me, serverTime, onChanged }: PanelProps) {
  const deposit = auction.depositAmount ?? 0
  const need = auction.minBidders ?? 2
  const count = auction.registeredCount ?? 0
  const registered = me?.registrationState === 'Registered'
  // ADR 0085: below the minimum, or a full auction until 72 h before it opens.
  const serverNow = createServerNow(serverTime)
  const now = serverNow()
  const withdrawable = canWithdrawRegistration(auction, me, now)
  const fullUntil = count >= need && auction.fullWithdrawUntil
    ? new Date(auction.fullWithdrawUntil).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : null
  const available = useAvailable(me)
  const [confirming, setConfirming] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { busy, error, unknown, run } = useCommand(onChanged)
  const short = !registered && available !== null && deposit > available
  const pct = Math.min(100, Math.round((Math.min(count, need) / Math.max(1, need)) * 100))
  const metMin = count >= need
  return (
    <div className={styles.bidPanel}>
      <div className={styles.regBox}>
        <div className={styles.regHeader}>
          <strong className={styles.regTitle}>
            <Users size={16} aria-hidden="true" />
            <span>{registered ? 'Bạn đã đăng ký phiên này' : 'Đăng ký tham gia đấu giá'}</span>
          </strong>
          <span className={`${styles.regCount} ${metMin ? styles.regCountFull : ''}`}>
            {count}/{need} người
          </span>
        </div>
        <div
          className={styles.regTrack}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={need}
          aria-valuenow={Math.min(count, need)}
          aria-label={`${count} trên ${need} người đã đăng ký`}
        >
          <span
            className={`${styles.regFill} ${metMin ? styles.regFillFull : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className={styles.regRule}>
          {auction.openMode ? openRuleText(auction, now) : `Phiên mở trả giá khi có ít nhất ${need} người đăng ký.`}{' '}
          Phiên chỉ bán khi có ít nhất hai người trả giá.
        </p>
        <div className={styles.regDeposit}>
          <div className={styles.regDepositRow}>
            <span>{registered ? 'Tiền cọc đang giữ' : 'Tiền cọc tạm giữ'}</span>
            <strong>{formatVnd(registered ? (me?.deposit ?? deposit) : deposit)}</strong>
          </div>
          <p className={styles.regDepositNote}>
            {registered
              ? withdrawable
                ? fullUntil
                  ? `Bạn vẫn có thể rút đăng ký và nhận lại cọc tới ${fullUntil} (72 giờ trước giờ mở).`
                  : 'Bạn có thể rút đăng ký và nhận lại cọc khi phiên chưa đủ người.'
                : 'Phiên đã đủ người nên tiền cọc được giữ đến khi phiên kết thúc.'
              : 'Hoàn lại khi bạn không thắng hoặc phiên hủy; tính vào giá nếu thắng (không hoàn nếu quá hạn thanh toán).'}
          </p>
        </div>
      </div>
      {!registered && <Shortfall available={available} amount={deposit} />}
      {notice && <p className={styles.walletLine} role="status">{notice}</p>}
      {error && <p className={styles.walletShort} role="alert">{error}</p>}
      {unknown ? (
        !confirming && !withdrawing && (
          <button type="button" className={styles.primaryBlock} disabled={busy} onClick={() => void unknown()}>
            {busy ? 'Đang thử lại…' : 'Thử lại đúng lệnh vừa rồi'}
          </button>
        )
      ) : registered ? (withdrawable &&
        <button type="button" className={styles.secondaryBlock} disabled={busy}
          onClick={() => setWithdrawing(true)}>
          {busy ? 'Đang rút…' : 'Rút đăng ký và nhận lại tiền cọc'}
        </button>
      ) : (
        <button type="button" className={styles.continue} disabled={busy || short} onClick={() => setConfirming(true)}>
          Đặt cọc {formatVnd(deposit)} và đăng ký <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Đăng ký đấu giá"
        confirmText={unknown ? 'Thử lại đúng lệnh vừa rồi' : 'Đặt cọc và đăng ký'}
        isBusy={busy}
        error={error}
        onConfirm={() => void (unknown ? unknown() : run(`register:${deposit}`, (key) => registerForAuction(auction.id, deposit, key), () => {
          setConfirming(false)
          setNotice(count + 1 >= need
            ? auction.openMode === 'Scheduled' || (auction.openMode === 'ScheduledGrace' && Date.parse(openTimeOf(auction)) > serverNow())
              ? 'Đã đăng ký. Phiên đủ người và mở theo giờ đã hẹn.'
              : 'Đã đăng ký. Phiên đủ người và mở trả giá sau 10 phút (khung 23:00–07:00 thì lúc 07:00).'
            : 'Đã đăng ký. Bạn sẽ nhận thông báo khi phiên đủ người.')
        }))}
        stickyFooter
      >
        <TransactionAmount label="Cọc Ví sẽ giữ ngay" value={formatVnd(deposit)} />
        {available !== undefined && <Shortfall available={available} amount={deposit} />}
        <TransactionNotes notes={auctionRegistrationNotes(need)} />
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={withdrawing}
        onClose={() => !busy && setWithdrawing(false)}
        title="Rút đăng ký tham gia đấu giá?"
        description={`Bạn sẽ rời khỏi danh sách tham gia phiên này và nhận lại ngay ${formatVnd(me?.deposit ?? deposit)} tiền cọc về số dư khả dụng của Ví.`}
        confirmText={unknown ? 'Thử lại đúng lệnh vừa rồi' : 'Rút đăng ký và nhận lại cọc'}
        isDanger
        isBusy={busy}
        error={error}
        onConfirm={() => void (unknown ? unknown() : run('withdraw-registration', (key) => withdrawAuctionRegistration(auction.id, key), () => {
          setWithdrawing(false)
          setNotice('Đã rút đăng ký; tiền cọc đã về lại ví.')
        }))}
      />
    </div>
  )
}

/**
 * ADR 0086: the runner-up's one offer after the winner did not pay. They buy
 * at their own highest bid (the wallet holds it, 24 h to pay) or decline; the
 * server checks the deadline, the version and the wallet.
 */
export function SecondChancePanel({ auction, me, serverTime, onChanged }: PanelProps) {
  const offer = me?.secondChance
  const deadline = useCountdown(offer?.deadline, serverTime)
  const available = useAvailable(me)
  const [confirming, setConfirming] = useState<'accept' | 'decline' | null>(null)
  const { busy, error, unknown, run } = useCommand(onChanged)
  if (!offer) return null
  const version = auction.version ?? 0
  const short = available !== null && offer.price > available
  const until = new Date(offer.deadline).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  return (
    <div className={styles.bidPanel}>
      <div className={styles.notice}>
        <strong><Wallet size={16} aria-hidden="true" /> Bạn được mời mua sách này</strong>
        <p>
          Người thắng không thanh toán đúng hạn. Bạn có thể mua với giá trả cao nhất của bạn, <b>{formatVnd(offer.price)}</b>,
          nếu nhận trước <b>{until}</b> (còn {formatRemaining(deadline)}). Khi nhận, ví giữ số tiền này và bạn thanh toán trong 24 giờ.
          Không nhận thì không có khoản nào bị trừ.
        </p>
      </div>
      <Shortfall available={available} amount={offer.price} />
      {error && <p className={styles.walletShort} role="alert">{error}</p>}
      {unknown ? (
        <button type="button" className={styles.primaryBlock} disabled={busy} onClick={() => void unknown()}>
          {busy ? 'Đang thử lại…' : 'Thử lại đúng lệnh vừa rồi'}
        </button>
      ) : (
        <>
          <button type="button" className={styles.continue} disabled={busy || short || deadline <= 0} onClick={() => setConfirming('accept')}>
            Mua với giá {formatVnd(offer.price)} <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className={styles.secondaryBlock} disabled={busy || deadline <= 0} onClick={() => setConfirming('decline')}>
            Không mua
          </button>
        </>
      )}
      <ConfirmDialog
        isOpen={confirming !== null}
        onClose={() => !busy && setConfirming(null)}
        title={confirming === 'accept' ? 'Nhận lời mời mua' : 'Từ chối lời mời mua?'}
        description={confirming === 'accept'
          ? undefined
          : 'Phiên kết thúc và sách được trả lại người bán. Bạn không thể nhận lại lời mời này.'}
        confirmText={confirming === 'accept' ? 'Mua sách' : 'Không mua'}
        isBusy={busy}
        confirmDisabled={deadline <= 0 || (confirming === 'accept' && short)}
        isDanger={confirming === 'decline'}
        onConfirm={() => void run(
          `second-chance:${confirming}:${version}`,
          (key) => confirming === 'accept' ? acceptSecondChance(auction.id, version, key) : declineSecondChance(auction.id, version, key),
          () => setConfirming(null),
        ).finally(() => setConfirming(null))}
        stickyFooter
      >
        {confirming === 'accept' && <>
          <TransactionAmount label="Số tiền Ví sẽ giữ ngay" value={formatVnd(offer.price)} />
          <TransactionNotes notes={[
            { label: 'Hạn thanh toán', detail: '24 giờ từ lúc nhận lời mời. Quá hạn sẽ bị ghi nhận vi phạm.' },
            { label: 'Cách nhận', detail: `Nhận sách tại ${auction.pointName}.` },
          ]} />
        </>}
      </ConfirmDialog>
    </div>
  )
}

export function DutchPanel({ auction, me, serverTime, onChanged }: PanelProps) {
  const price = auction.dutchPrice ?? null
  const untilDrop = useCountdown(auction.dutchNextDropAt ?? undefined, serverTime)
  const available = useAvailable(me)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { busy, error, unknown, run } = useCommand(onChanged)
  // When the price drops, read the new one from the server.
  const refreshed = useRef<string | null>(null)
  useEffect(() => {
    if (auction.dutchNextDropAt && untilDrop === 0 && refreshed.current !== auction.dutchNextDropAt) {
      refreshed.current = auction.dutchNextDropAt
      void onChanged()
    }
  }, [auction.dutchNextDropAt, untilDrop, onChanged])
  if (price === null) return <p className={styles.muted}>Giá kiểu Hà Lan hiện khi phiên mở.</p>
  const short = available !== null && price > available
  return (
    <div className={styles.bidPanel}>
      <div className={styles.notice}>
        <strong><TrendingDown size={16} aria-hidden="true" /> Giá hiện tại {formatVnd(price)}</strong>
        <p>
          {auction.dutchNextDropAt
            ? `Giảm ${formatVnd(auction.step)} sau ${formatRemaining(untilDrop)}, xuống tối đa giá sàn ${formatVnd(auction.startPrice)}.`
            : `Đã ở giá sàn ${formatVnd(auction.startPrice)}.`}{' '}
          Người đầu tiên chấp nhận sẽ thắng ngay và phiên kết thúc.
        </p>
      </div>
      <Shortfall available={available} amount={price} />
      {notice && <p className={styles.walletLine} role="status">{notice}</p>}
      {error && <p className={styles.walletShort} role="alert">{error}</p>}
      {unknown ? (
        <button type="button" className={styles.primaryBlock} disabled={busy} onClick={() => void unknown()}>
          {busy ? 'Đang thử lại…' : 'Thử lại đúng lệnh vừa rồi'}
        </button>
      ) : (
        <button type="button" className={styles.continue} disabled={busy || short} onClick={() => setConfirming(true)}>
          Chấp nhận {formatVnd(price)} <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Chấp nhận giá đang giảm"
        confirmText="Chấp nhận giá"
        isBusy={busy}
        onConfirm={() => void run(`dutch:${price}`, (key) => acceptDutch(auction.id, price, key), () => {
          setConfirming(false)
          setNotice('Bạn đã thắng phiên. Hệ thống đang chốt đơn để bạn thanh toán từ ví.')
        }).finally(() => setConfirming(false))}
        stickyFooter
      >
        <TransactionAmount label="Giá tối đa bạn chấp nhận" value={formatVnd(price)} />
        <TransactionNotes notes={[
          { label: 'Khi xác nhận', detail: 'Ví giữ giá tại thời điểm lệnh đến, kể cả khi giá vừa giảm. Lượt chấp nhận không thể rút lại.' },
          { label: 'Thanh toán và nhận sách', detail: `Thanh toán trong 24 giờ và tự nhận tại ${auction.pointName}.` },
        ]} />
      </ConfirmDialog>
    </div>
  )
}

export function SealedPanel({ auction, me, onChanged }: PanelProps) {
  const ids = useId()
  const second = auction.auctionType === 'SealedSecond'
  const own = me?.ownLevel ?? null
  const floor = own !== null ? own + auction.step : auction.startPrice
  const [amount, setAmount] = useState<number | null>(floor)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const available = useAvailable(me)
  const { busy, error, unknown, run } = useCommand(onChanged)
  const fieldError =
    amount === null ? 'Nhập số tiền.'
    : amount < floor ? `Tối thiểu ${formatVnd(floor)}.`
    : (amount - auction.startPrice) % auction.step !== 0 ? `Giá phải bằng ${formatVnd(auction.startPrice)} cộng một số bước ${formatVnd(auction.step)}.`
    : null
  const short = available !== null && amount !== null && amount > available
  return (
    <div className={styles.bidPanel}>
      <div className={styles.notice}>
        <strong><EyeOff size={16} aria-hidden="true" /> Đấu giá kín · {second ? 'giá thứ hai' : 'giá thứ nhất'}</strong>
        <p>
          Không ai thấy giá của người khác cho tới khi phiên kết thúc. Giá cao nhất thắng
          {second ? ' nhưng chỉ trả bằng giá cao thứ hai (hoặc giá khởi điểm nếu chỉ có một người).' : ' và trả đúng giá mình gửi.'}
          {' '}Ví giữ toàn bộ giá kín của bạn; nếu không thắng, tiền về lại ví khi phiên chốt.
        </p>
      </div>
      {own !== null && (
        <p className={styles.walletLine}>
          Giá kín của bạn: <b>{formatVnd(own)}</b>{me?.heldAmount ? ` · ví đang giữ ${formatVnd(me.heldAmount)}` : ''}. Bạn chỉ có thể nâng giá.
        </p>
      )}
      <div className={styles.customBid}>
        <div className={styles.field}>
          <label htmlFor={`${ids}-sealed`}>{own === null ? 'Giá kín của bạn' : 'Nâng giá kín lên'}</label>
          <div data-focus-surface data-focus-invalid={!!fieldError} className={`${styles.inputWrap} ${fieldError ? styles.inputInvalid : ''}`}>
            <input
              id={`${ids}-sealed`} inputMode="numeric" autoComplete="off" disabled={busy || !!unknown}
              value={amount ? amount.toLocaleString('vi-VN') : ''} aria-invalid={!!fieldError} aria-describedby={`${ids}-sealed-hint`}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, AUCTION_PRICE_DIGITS)
                setAmount(digits ? Number(digits) : null)
              }}
            />
            <span className={styles.currency} aria-hidden="true">₫</span>
          </div>
          <p id={`${ids}-sealed-hint`} className={fieldError ? styles.fieldError : styles.fieldHint}>
            {fieldError ?? `Tối thiểu ${formatVnd(floor)}, bước ${formatVnd(auction.step)}.`}
          </p>
        </div>
        <Shortfall available={available} amount={amount} />
        {notice && <p className={styles.walletLine} role="status">{notice}</p>}
        {error && <p className={styles.walletShort} role="alert">{error}</p>}
        {unknown ? (
          <button type="button" className={styles.primaryBlock} disabled={busy} onClick={() => void unknown()}>
            {busy ? 'Đang thử lại…' : 'Thử lại đúng lệnh vừa rồi'}
          </button>
        ) : (
          <button type="button" className={styles.continue} disabled={busy || !!fieldError || short} onClick={() => setConfirming(true)}>
            Gửi giá kín {amount ? formatVnd(amount) : ''} <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Xác nhận giá kín"
        confirmText="Gửi giá kín"
        isBusy={busy}
        onConfirm={() => amount !== null && void run(`sealed:${amount}`, (key) => placeSealedBid(auction.id, amount, key), () => {
          setNotice(`Đã ghi nhận giá kín ${formatVnd(amount)}. Kết quả công bố khi phiên kết thúc.`)
        }).finally(() => setConfirming(false))}
        stickyFooter
      >
        {amount !== null && <TransactionAmount label="Giá kín Ví sẽ giữ" value={formatVnd(amount)} />}
        <TransactionNotes notes={[
          { label: 'Khi gửi giá', detail: 'Ví giữ toàn bộ giá kín đến lúc chốt phiên. Giá kín chỉ có thể nâng.' },
          { label: 'Nếu thắng', detail: 'Thanh toán từ Ví trong 24 giờ sau khi phiên kết thúc.' },
        ]} />
      </ConfirmDialog>
    </div>
  )
}

/**
 * ADR 0079/0081/0082: the seller's controls while the auction waits for
 * registrants: move the open time (2 changes, before it and never in its last
 * 30 minutes, within publish + 30 days), lower the minimum (never below 4,
 * locked once reached) and close before the start. There is no "open now":
 * the auction opens at its time once enough registered.
 */
export function WaitingSellerControls({ auction, serverTime, onChanged, paused }: PanelProps & { paused: boolean }) {
  const need = auction.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR
  const count = auction.registeredCount ?? 0
  const reached = count >= need
  const version = auction.version ?? 0
  const openTime = openTimeOf(auction)
  const now = createServerNow(serverTime)()
  const untilOpen = Date.parse(openTime) - now
  const passed = untilOpen <= 0
  const frozen = untilOpen <= AUCTION_RESCHEDULE_FREEZE_MS
  // The dialog edits the open time and keeps the chosen length.
  const length = Date.parse(auction.endAt) - Date.parse(auction.startAt)
  const editsLeft = AUCTION_MAX_OPEN_CHANGES - (auction.scheduleRevision ?? 0)
  // ADR 0085 (L5): raise only while nobody is registered; otherwise lower.
  const canRaise = count === 0
  const maxMin = canRaise ? AUCTION_MIN_BIDDERS_CAP : need - 1
  const [lower, setLower] = useState(canRaise ? need : Math.max(AUCTION_MIN_BIDDERS_FLOOR, need - 1))
  const [editing, setEditing] = useState(false)
  const [closing, setClosing] = useState(false)
  const [confirmMin, setConfirmMin] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const ids = useId()
  const { busy, error, unknown, run } = useCommand(onChanged)
  const canLower = !reached && (canRaise || need > AUCTION_MIN_BIDDERS_FLOOR)
  return (
    <div className={styles.bidPanel}>
      <div className={styles.notice}>
        <strong><Users size={16} aria-hidden="true" /> Đang chờ người đăng ký: {count}/{need}</strong>
        <p>{openRuleText(auction, now)}</p>
        <progress max={need} value={Math.min(count, need)} aria-label={`${count} trên ${need} người đã đăng ký`} />
      </div>
      {notice && <p className={styles.walletLine} role="status">{notice}</p>}
      {error && <p className={styles.walletShort} role="alert">{error}</p>}
      {unknown ? (
        <button type="button" className={styles.primaryBlock} disabled={busy} onClick={() => void unknown()}>
          {busy ? 'Đang thử lại…' : 'Thử lại đúng lệnh vừa rồi'}
        </button>
      ) : (
        <>
          <button type="button" className={styles.ownerPrimary} disabled={busy || paused || frozen || editsLeft <= 0} onClick={() => setEditing(true)}>
            <CalendarClock size={17} aria-hidden="true" />Đổi giờ mở
          </button>
          <p className={styles.muted}>
            {passed
              ? `Đã qua giờ mở nên không đổi giờ được nữa. Phiên ${lateText(need)}.`
              : frozen ? 'Không đổi giờ trong 30 phút cuối trước giờ mở.' : editsLeft <= 0 ? 'Đã đổi giờ mở tối đa 2 lần.'
                : `Còn ${editsLeft} lần đổi giờ mở, trong 30 ngày kể từ lúc đăng.${reached ? ' Phiên đã đủ người nên chỉ dời giờ mở sớm hơn.' : ''}`}
          </p>
          {canLower && (
            <div className={styles.lowerRow}>
              <label htmlFor={`${ids}-min`}>{canRaise ? 'Đổi số người tối thiểu thành' : 'Giảm số người tối thiểu còn'}</label>
              <input id={`${ids}-min`} type="number" inputMode="numeric" min={AUCTION_MIN_BIDDERS_FLOOR} max={maxMin} value={lower} disabled={busy || paused}
                onChange={(e) => setLower(Math.min(maxMin, Math.max(AUCTION_MIN_BIDDERS_FLOOR, Math.trunc(Number(e.target.value) || AUCTION_MIN_BIDDERS_FLOOR))))} />
              <button type="button" className={styles.secondary} disabled={busy || paused || lower === need}
                onClick={() => setConfirmMin(true)}>
                {canRaise ? <Users size={15} aria-hidden="true" /> : <Minus size={15} aria-hidden="true" />}{canRaise ? 'Đổi' : 'Giảm'}
              </button>
            </div>
          )}
          {canRaise && <p className={styles.muted}>Chưa có ai đăng ký nên bạn còn tăng được số người tối thiểu; khi đã có người đăng ký thì chỉ giảm được.</p>}
          {!canLower && !reached && <p className={styles.muted}>Số người tối thiểu không thấp hơn {AUCTION_MIN_BIDDERS_FLOOR}.</p>}
          {reached && <p className={styles.muted}>Đã đủ người nên số người tối thiểu được giữ nguyên.</p>}
          <button type="button" className={styles.ownerDanger} disabled={busy || paused} onClick={() => setClosing(true)}>
            <CircleSlash size={17} aria-hidden="true" />Đóng phiên
          </button>
        </>
      )}
      <ScheduleAuctionDialog
        isOpen={editing}
        paused={paused}
        onClose={() => setEditing(false)}
        onDone={onChanged}
        title={auction.title}
        serverTime={serverTime}
        // ADR 0085 (H4): a full auction only moves earlier than its open time.
        target={{ kind: 'reschedule', auctionId: auction.id, version, live: false, startAt: openTime, endAt: new Date(Date.parse(openTime) + length).toISOString(),
          latestStartAt: reached ? new Date(Date.parse(openTime) - 60_000).toISOString() : auction.latestStartAt ?? null }}
      />
      <ConfirmDialog
        isOpen={confirmMin && !paused}
        onClose={() => !busy && setConfirmMin(false)}
        title={lower > need ? `Tăng số người tối thiểu lên ${lower}?` : `Giảm số người tối thiểu còn ${lower}?`}
        description={
          lower > need
            ? `Ngưỡng mở phiên sẽ tăng từ ${need} lên ${lower} người đăng ký. Khi đã có người đăng ký, bạn sẽ không thể tăng lại nữa.`
            : count >= lower
              ? `Hiện đã có ${count} người đăng ký. Giảm ngưỡng từ ${need} xuống ${lower} sẽ làm phiên đủ người ngay và không thể hoàn tác.`
              : `Ngưỡng mở phiên sẽ giảm từ ${need} xuống ${lower} người đăng ký. Thao tác giảm không thể tăng lại sau khi đã có người đăng ký.`
        }
        confirmText={lower > need ? `Tăng lên ${lower} người` : `Giảm còn ${lower} người`}
        isBusy={busy}
        error={error}
        onConfirm={() => void run(`min:${version}:${lower}`, (key) => setAuctionMinBidders(auction.id, version, lower, key), () => {
          setConfirmMin(false)
          setNotice(lower > need ? `Đã tăng số người tối thiểu lên ${lower}.` : `Đã giảm số người tối thiểu còn ${lower}.`)
        })}
      />
      <ConfirmDialog
        isOpen={closing && !paused}
        onClose={() => !busy && setClosing(false)}
        title="Đóng phiên trước giờ mở?"
        description={`Phiên bị hủy ngay, ${count} người đăng ký được hoàn cọc và nhận thông báo, sách được trả lại cho bạn tại ${auction.pointName}. Sau khi phiên mở, bạn không đóng được nữa.`}
        confirmText="Đóng phiên"
        isBusy={busy}
        isDanger
        error={error}
        onConfirm={() => void run(`close:${version}`, (key) => closeAuctionBeforeStart(auction.id, version, key), () => setClosing(false))}
      />
    </div>
  )
}
