// ADR 0076: action panels for Dutch and sealed-bid auctions. English auctions
// keep BidPanel. The server stays authoritative for prices, funds and timing.
import { auctionRegistrationNotes, createServerNow } from '@used-books/session-client'
import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowRight, CalendarClock, CheckCircle2, CircleSlash, Clock, EyeOff,
  MapPin, Minus, TrendingDown, Users, Wallet,
} from 'lucide-react'
import { AuctionActionDialog } from '../components/AuctionActionDialog'
import { InfoTip } from '../components/InfoTip'
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

const lateText = (need: number) => `mở 10 phút sau khi đủ ${need} người đăng ký (khung 23:00–07:00 thì lúc 07:00)`

type PanelProps = {
  auction: AuctionSummary
  me: AuctionParticipation | null
  serverTime: string | undefined
  onChanged: () => Promise<unknown>
}

function useAvailable(me: AuctionParticipation | null) {
  const wallet = useQuery({ queryKey: ['wallet-summary'], queryFn: getWalletSummary, staleTime: 15_000, refetchOnMount: 'always' })
  return wallet.data ? wallet.data.available + (me?.heldAmount ?? 0) : null
}

function Shortfall({ available, amount }: { available: number | null; amount: number | null }) {
  if (available === null || amount === null) return null
  const short = amount - available
  return short > 0 ? (
    <p className={styles.walletShort} role="status">
      <Wallet size={14} aria-hidden="true" />
      <span>Khả dụng <b>{formatVnd(available)}</b> · thiếu <b>{formatVnd(short)}</b>. <Link to={ROUTES.wallet}>Nạp ví</Link></span>
    </p>
  ) : (
    <div className={styles.walletLine}>
      <span className={styles.walletLeft}>
        <Wallet size={14} aria-hidden="true" />
        <span>Ví khả dụng</span>
      </span>
      <b>{formatVnd(available)}</b>
    </div>
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

export function RegistrationPanel({ auction, me, serverTime, onChanged }: PanelProps) {
  const deposit = auction.depositAmount ?? 0
  const need = auction.minBidders ?? 2
  const count = auction.registeredCount ?? 0
  const registered = me?.registrationState === 'Registered'
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
  const regNotes = auctionRegistrationNotes(need)

  return (
    <div className={styles.bidPanel}>
      <div className={styles.regBox}>
        <div className={styles.regHeader}>
          <strong className={styles.regTitle}>
            <Users size={16} aria-hidden="true" />
            <span>{registered ? 'Bạn đã đăng ký phiên này' : 'Đăng ký tham gia'}</span>
            <InfoTip label="Quy định đăng ký và tiền cọc">
              <ul>
                <li>{auction.openMode ? openRuleText(auction, now) : `Mở trả giá khi có ít nhất ${need} người đăng ký.`}</li>
                <li>Phiên chỉ bán khi có ít nhất <strong>2 người trả giá</strong>.</li>
                <li>
                  {registered
                    ? withdrawable
                      ? fullUntil
                        ? <>Rút đăng ký &amp; hoàn cọc tới <strong>{fullUntil}</strong> (72 giờ trước giờ mở).</>
                        : 'Có thể rút đăng ký và nhận lại cọc khi phiên chưa đủ người.'
                      : 'Phiên đã đủ người nên tiền cọc giữ đến khi chốt phiên.'
                    : <>Hoàn lại nếu không thắng hoặc phiên hủy; tính vào giá nếu thắng (<mark>không hoàn nếu quá hạn thanh toán</mark>).</>}
                </li>
              </ul>
            </InfoTip>
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
          <span className={`${styles.regFill} ${metMin ? styles.regFillFull : ''}`} style={{ width: `${pct}%` }} />
        </div>

        <div className={styles.regDeposit}>
          <div className={styles.regDepositRow}>
            <span>{registered ? 'Tiền cọc đang giữ' : 'Tiền cọc tạm giữ'}</span>
            <strong>{formatVnd(registered ? (me?.deposit ?? deposit) : deposit)}</strong>
          </div>
          {registered && withdrawable && fullUntil && (
            <p className={styles.regDepositNote}>Rút cọc miễn phí tới <b>{fullUntil}</b>.</p>
          )}
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
      ) : registered ? (withdrawable && (
        <button type="button" className={styles.secondaryBlock} disabled={busy} onClick={() => setWithdrawing(true)}>
          {busy ? 'Đang rút…' : 'Rút đăng ký và hoàn cọc'}
        </button>
      )) : (
        <button type="button" data-focus-inverse className={styles.continue} disabled={busy || short} onClick={() => setConfirming(true)}>
          <span>Đặt cọc {formatVnd(deposit)} &amp; đăng ký</span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}

      <AuctionActionDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        icon={<Users size={20} />}
        title="Đăng ký đấu giá"
        bookTitle={auction.title}
        amount={{
          label: 'Cọc Ví sẽ giữ ngay',
          value: formatVnd(deposit),
          tipLabel: 'Quy định đăng ký đấu giá',
          tip: (
            <ul>
              {regNotes.map((n) => (
                <li key={n.label}><strong>{n.label}:</strong> {n.detail}</li>
              ))}
            </ul>
          ),
        }}
        extra={available !== null ? <Shortfall available={available} amount={deposit} /> : undefined}
        steps={[
          { icon: <Wallet size={15} />, label: 'Giữ tiền cọc từ Ví', detail: <>Tạm giữ <b>{formatVnd(deposit)}</b> để xác nhận suất tham gia.</> },
          { icon: <Users size={15} />, label: 'Đủ người mở phiên', detail: <>Cần tối thiểu <b>{need} người</b> đăng ký để mở trả giá.</> },
          { icon: <CheckCircle2 size={15} />, label: 'Sau khi kết thúc', detail: <>Tính vào giá nếu thắng; <b>hoàn lại</b> nếu không thắng hoặc phiên hủy.</>, result: true },
        ]}
        confirmText={unknown ? 'Thử lại' : 'Đặt cọc'}
        busyText="Đang xử lý…"
        isBusy={busy}
        confirmDisabled={short}
        error={error}
        onConfirm={() => void (unknown ? unknown() : run(`register:${deposit}`, (key) => registerForAuction(auction.id, deposit, key), () => {
          setConfirming(false)
          setNotice(count + 1 >= need
            ? auction.openMode === 'Scheduled' || (auction.openMode === 'ScheduledGrace' && Date.parse(openTimeOf(auction)) > serverNow())
              ? 'Đã đăng ký. Phiên đủ người và mở theo giờ đã hẹn.'
              : 'Đã đăng ký. Phiên đủ người và mở trả giá sau 10 phút (khung 23:00–07:00 thì lúc 07:00).'
            : 'Đã đăng ký. Bạn sẽ nhận thông báo khi phiên đủ người.')
        }))}
      />

      <AuctionActionDialog
        isOpen={withdrawing}
        onClose={() => !busy && setWithdrawing(false)}
        icon={<CircleSlash size={20} />}
        title="Rút đăng ký tham gia?"
        bookTitle={auction.title}
        danger
        warning={<>Bạn sẽ <b>rời danh sách tham gia</b> phiên này ngay lập tức.</>}
        cancelText="Giữ lại"
        confirmText={unknown ? 'Thử lại' : 'Rút đăng ký'}
        busyText="Đang rút…"
        isBusy={busy}
        error={error}
        steps={[
          { icon: <Users size={15} />, label: 'Rời khỏi phiên', detail: 'Suất đăng ký của bạn sẽ được hủy.' },
          { icon: <Wallet size={15} />, label: 'Hoàn cọc về Ví', detail: <>Nhận lại ngay <b>{formatVnd(me?.deposit ?? deposit)}</b> vào số dư khả dụng.</>, result: true },
        ]}
        onConfirm={() => void (unknown ? unknown() : run('withdraw-registration', (key) => withdrawAuctionRegistration(auction.id, key), () => {
          setWithdrawing(false)
          setNotice('Đã rút đăng ký; tiền cọc đã về lại ví.')
        }))}
      />
    </div>
  )
}

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
        <div className={styles.noticeTitleRow}>
          <strong><Wallet size={16} aria-hidden="true" /> Bạn được mời mua sách này</strong>
          <InfoTip label="Quy định lời mời mua thứ hai">
            <ul>
              <li>Người thắng không thanh toán đúng hạn nên cơ hội chuyển cho bạn theo mức trả cao nhất <strong>{formatVnd(offer.price)}</strong>.</li>
              <li>Khi nhận, Ví giữ số tiền này và bạn thanh toán trong <strong>24 giờ</strong>.</li>
              <li>Nếu không mua, không có khoản nào bị trừ.</li>
            </ul>
          </InfoTip>
        </div>
        <p>
          Giá của bạn: <b>{formatVnd(offer.price)}</b> · hạn nhận <b>{until}</b> (còn <b>{formatRemaining(deadline)}</b>).
        </p>
      </div>
      <Shortfall available={available} amount={offer.price} />
      {error && <p className={styles.walletShort} role="alert">{error}</p>}

      {unknown ? (
        <button type="button" className={styles.primaryBlock} disabled={busy} onClick={() => void unknown()}>
          {busy ? 'Đang thử lại…' : 'Thử lại đúng lệnh vừa rồi'}
        </button>
      ) : (
        <div className={styles.stack}>
          <button type="button" data-focus-inverse className={styles.continue} disabled={busy || short || deadline <= 0} onClick={() => setConfirming('accept')}>
            <span>Mua với giá {formatVnd(offer.price)}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className={styles.secondaryBlock} disabled={busy || deadline <= 0} onClick={() => setConfirming('decline')}>
            Không mua
          </button>
        </div>
      )}

      <AuctionActionDialog
        isOpen={confirming === 'accept'}
        onClose={() => !busy && setConfirming(null)}
        icon={<Wallet size={20} />}
        title="Nhận lời mời mua"
        bookTitle={auction.title}
        amount={{ label: 'Số tiền Ví sẽ giữ ngay', value: formatVnd(offer.price) }}
        steps={[
          { icon: <Wallet size={15} />, label: 'Giữ tiền trong Ví', detail: <>Ví giữ <b>{formatVnd(offer.price)}</b> ngay khi xác nhận.</> },
          { icon: <Clock size={15} />, label: 'Thanh toán trong 24 giờ', detail: 'Quá hạn thanh toán sẽ bị ghi nhận vi phạm.' },
          { icon: <MapPin size={15} />, label: 'Nhận sách tại điểm', detail: <>Nhận sách tại <b>{auction.pointName}</b>.</>, result: true },
        ]}
        confirmText="Mua sách"
        isBusy={busy}
        confirmDisabled={deadline <= 0 || short}
        error={error}
        onConfirm={() => void run(
          `second-chance:accept:${version}`,
          (key) => acceptSecondChance(auction.id, version, key),
          () => setConfirming(null),
        ).finally(() => setConfirming(null))}
      />

      <AuctionActionDialog
        isOpen={confirming === 'decline'}
        onClose={() => !busy && setConfirming(null)}
        icon={<CircleSlash size={20} />}
        title="Từ chối lời mời mua?"
        bookTitle={auction.title}
        danger
        warning={<>Bạn <b>không thể nhận lại</b> lời mời này sau khi từ chối.</>}
        cancelText="Giữ lại"
        confirmText="Không mua"
        isBusy={busy}
        confirmDisabled={deadline <= 0}
        error={error}
        steps={[
          { icon: <CircleSlash size={15} />, label: 'Kết thúc phiên', detail: 'Không có khoản tiền nào bị trừ từ Ví.' },
          { icon: <MapPin size={15} />, label: 'Trả sách người bán', detail: <>Sách được trả lại người bán tại <b>{auction.pointName}</b>.</>, result: true },
        ]}
        onConfirm={() => void run(
          `second-chance:decline:${version}`,
          (key) => declineSecondChance(auction.id, version, key),
          () => setConfirming(null),
        ).finally(() => setConfirming(null))}
      />
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
        <div className={styles.noticeTitleRow}>
          <strong><TrendingDown size={16} aria-hidden="true" /> Đấu giá giảm dần · {formatVnd(price)}</strong>
          <InfoTip label="Quy định đấu giá Hà Lan">
            <ul>
              <li>Giá giảm theo từng mốc xuống tối đa giá sàn <strong>{formatVnd(auction.startPrice)}</strong>.</li>
              <li>Người đầu tiên chấp nhận sẽ <strong>thắng ngay</strong> và phiên kết thúc.</li>
            </ul>
          </InfoTip>
        </div>
        <p>
          {auction.dutchNextDropAt
            ? <>Giảm <b>{formatVnd(auction.step)}</b> sau <b>{formatRemaining(untilDrop)}</b> · sàn <b>{formatVnd(auction.startPrice)}</b>.</>
            : <>Đã chạm giá sàn <b>{formatVnd(auction.startPrice)}</b>.</>}
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
        <button type="button" data-focus-inverse className={styles.continue} disabled={busy || short} onClick={() => setConfirming(true)}>
          <span>Chấp nhận {formatVnd(price)}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}

      <AuctionActionDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        icon={<TrendingDown size={20} />}
        title="Chấp nhận giá đang giảm"
        bookTitle={auction.title}
        amount={{ label: 'Giá tối đa bạn chấp nhận', value: formatVnd(price) }}
        steps={[
          { icon: <Wallet size={15} />, label: 'Giữ giá tại thời điểm lệnh đến', detail: 'Kể cả khi giá vừa giảm. Lượt chấp nhận không thể rút lại.' },
          { icon: <CheckCircle2 size={15} />, label: 'Thắng & nhận sách', detail: <>Thanh toán trong <b>24 giờ</b> · tự nhận tại <b>{auction.pointName}</b>.</>, result: true },
        ]}
        confirmText="Chấp nhận"
        isBusy={busy}
        onConfirm={() => void run(`dutch:${price}`, (key) => acceptDutch(auction.id, price, key), () => {
          setConfirming(false)
          setNotice('Bạn đã thắng phiên. Hệ thống đang chốt đơn để bạn thanh toán từ ví.')
        }).finally(() => setConfirming(false))}
      />
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
    : (amount - auction.startPrice) % auction.step !== 0 ? `Giá theo bước ${formatVnd(auction.step)} từ ${formatVnd(auction.startPrice)}.`
    : null
  const short = available !== null && amount !== null && amount > available
  const delta = own !== null && amount !== null && amount > own ? amount - own : null

  return (
    <div className={styles.bidPanel}>
      <div className={styles.notice}>
        <div className={styles.noticeTitleRow}>
          <strong><EyeOff size={16} aria-hidden="true" /> Đấu giá kín · {second ? 'giá thứ hai' : 'giá thứ nhất'}</strong>
          <InfoTip label="Quy định đấu giá kín">
            <ul>
              <li>Không ai thấy giá của nhau cho tới khi phiên kết thúc.</li>
              <li>
                Người trả cao nhất thắng
                {second ? ' và trả bằng giá cao thứ hai (hoặc giá khởi điểm nếu chỉ có 1 người).' : ' và trả đúng mức đã gửi.'}
              </li>
              <li>Ví giữ toàn bộ giá kín; nếu không thắng, tiền tự hoàn khi phiên chốt.</li>
            </ul>
          </InfoTip>
        </div>
        <p>Chỉ bạn biết mức giá của mình. Giá đã gửi chỉ có thể nâng lên.</p>
      </div>

      {own !== null && (
        <div className={styles.walletLine}>
          <span className={styles.walletLeft}>
            <span>Giá kín hiện tại</span>
            {delta !== null && <span className={styles.deltaChip}>+{formatVnd(delta)}</span>}
          </span>
          <b>{formatVnd(own)}</b>
        </div>
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
            {fieldError ?? <span className={styles.minHint}>Tối thiểu <b>{formatVnd(floor)}</b> · bước <b>+{formatVnd(auction.step)}</b></span>}
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
          <button type="button" data-focus-inverse className={styles.continue} disabled={busy || !!fieldError || short} onClick={() => setConfirming(true)}>
            <span>Gửi giá kín {amount ? formatVnd(amount) : ''}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <AuctionActionDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        icon={<EyeOff size={20} />}
        title="Xác nhận giá kín"
        bookTitle={auction.title}
        amount={amount !== null ? {
          label: 'Giá kín Ví sẽ giữ',
          value: formatVnd(amount),
          delta: delta !== null ? `+${formatVnd(delta)}` : undefined,
        } : undefined}
        steps={[
          { icon: <Wallet size={15} />, label: 'Giữ tiền đến lúc chốt', detail: 'Giá kín chỉ có thể nâng, không rút lại.' },
          { icon: <CheckCircle2 size={15} />, label: 'Nếu thắng phiên', detail: <>Thanh toán từ Ví trong <b>24 giờ</b> sau khi kết thúc.</>, result: true },
        ]}
        confirmText="Gửi giá kín"
        isBusy={busy}
        onConfirm={() => amount !== null && void run(`sealed:${amount}`, (key) => placeSealedBid(auction.id, amount, key), () => {
          setNotice(`Đã ghi nhận giá kín ${formatVnd(amount)}. Kết quả công bố khi phiên kết thúc.`)
        }).finally(() => setConfirming(false))}
      />
    </div>
  )
}

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
  const length = Date.parse(auction.endAt) - Date.parse(auction.startAt)
  const editsLeft = AUCTION_MAX_OPEN_CHANGES - (auction.scheduleRevision ?? 0)
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
  const pct = Math.min(100, Math.round((Math.min(count, need) / Math.max(1, need)) * 100))

  return (
    <div className={styles.bidPanel}>
      <div className={styles.regBox}>
        <div className={styles.regHeader}>
          <strong className={styles.regTitle}>
            <Users size={16} aria-hidden="true" />
            <span>Người đăng ký</span>
            <InfoTip label="Quy định đổi giờ và ngưỡng đăng ký">
              <ul>
                <li>{openRuleText(auction, now)}</li>
                <li>
                  {passed
                    ? `Đã qua giờ mở nên không đổi giờ được nữa. Phiên ${lateText(need)}.`
                    : frozen
                      ? 'Không đổi giờ trong 30 phút cuối trước giờ mở.'
                      : editsLeft <= 0
                        ? 'Đã đổi giờ mở tối đa 2 lần.'
                        : `Còn ${editsLeft} lần đổi giờ mở trong 30 ngày kể từ lúc đăng.${reached ? ' Phiên đã đủ người nên chỉ dời sớm hơn.' : ''}`}
                </li>
                <li>{canRaise ? 'Chưa có ai đăng ký nên còn tăng hoặc giảm ngưỡng.' : reached ? 'Đã đủ người nên giữ nguyên ngưỡng.' : `Tối thiểu ${AUCTION_MIN_BIDDERS_FLOOR} người.`}</li>
              </ul>
            </InfoTip>
          </strong>
          <span className={`${styles.regCount} ${reached ? styles.regCountFull : ''}`}>
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
          <span className={`${styles.regFill} ${reached ? styles.regFillFull : ''}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {notice && <p className={styles.walletLine} role="status">{notice}</p>}
      {error && <p className={styles.walletShort} role="alert">{error}</p>}

      {unknown ? (
        <button type="button" className={styles.primaryBlock} disabled={busy} onClick={() => void unknown()}>
          {busy ? 'Đang thử lại…' : 'Thử lại đúng lệnh vừa rồi'}
        </button>
      ) : (
        <>
          <button type="button" data-focus-inverse className={styles.ownerPrimary} disabled={busy || paused || frozen || editsLeft <= 0} onClick={() => setEditing(true)}>
            <CalendarClock size={17} aria-hidden="true" />Đổi giờ mở {editsLeft > 0 && !frozen && !passed ? `(còn ${editsLeft} lần)` : ''}
          </button>

          {canLower && (
            <div className={styles.lowerRow}>
              <label htmlFor={`${ids}-min`}>{canRaise ? 'Đổi số người tối thiểu' : 'Giảm số người tối thiểu'}</label>
              <input
                id={`${ids}-min`}
                type="number"
                inputMode="numeric"
                min={AUCTION_MIN_BIDDERS_FLOOR}
                max={maxMin}
                value={lower}
                disabled={busy || paused}
                onChange={(e) => setLower(Math.min(maxMin, Math.max(AUCTION_MIN_BIDDERS_FLOOR, Math.trunc(Number(e.target.value) || AUCTION_MIN_BIDDERS_FLOOR))))}
              />
              <button type="button" className={styles.secondary} disabled={busy || paused || lower === need} onClick={() => setConfirmMin(true)}>
                {canRaise ? <Users size={15} aria-hidden="true" /> : <Minus size={15} aria-hidden="true" />}
                <span>{canRaise ? 'Lưu' : 'Giảm'}</span>
              </button>
            </div>
          )}

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
        target={{
          kind: 'reschedule',
          auctionId: auction.id,
          version,
          live: false,
          startAt: openTime,
          endAt: new Date(Date.parse(openTime) + length).toISOString(),
          latestStartAt: reached ? new Date(Date.parse(openTime) - 60_000).toISOString() : auction.latestStartAt ?? null,
        }}
      />

      <AuctionActionDialog
        isOpen={confirmMin && !paused}
        paused={paused}
        onClose={() => !busy && setConfirmMin(false)}
        icon={<Users size={20} />}
        title={lower > need ? `Tăng ngưỡng lên ${lower} người?` : `Giảm ngưỡng còn ${lower} người?`}
        bookTitle={auction.title}
        amount={{
          label: 'Số người tối thiểu mới',
          value: `${lower} người`,
          delta: `Hiện tại: ${need} (${lower > need ? '+' : ''}${lower - need})`,
        }}
        steps={[
          {
            icon: <Users size={15} />,
            label: 'Cập nhật điều kiện mở',
            detail: lower > need
              ? 'Khi đã có người đăng ký, bạn sẽ không thể tăng ngưỡng lại nữa.'
              : 'Sau khi giảm, không thể tăng lại khi đã có người đăng ký.',
          },
          {
            icon: <CheckCircle2 size={15} />,
            label: count >= lower ? 'Đủ người ngay lập tức' : 'Tiếp tục nhận đăng ký',
            detail: count >= lower
              ? <>Hiện có <b>{count} người</b> nên phiên sẽ đủ điều kiện mở ngay.</>
              : <>Cần thêm <b>{lower - count} người</b> nữa để mở phiên.</>,
            result: true,
          },
        ]}
        confirmText="Xác nhận"
        isBusy={busy}
        error={error}
        onConfirm={() => void run(`min:${version}:${lower}`, (key) => setAuctionMinBidders(auction.id, version, lower, key), () => {
          setConfirmMin(false)
          setNotice(lower > need ? `Đã tăng số người tối thiểu lên ${lower}.` : `Đã giảm số người tối thiểu còn ${lower}.`)
        })}
      />

      <AuctionActionDialog
        isOpen={closing && !paused}
        paused={paused}
        onClose={() => !busy && setClosing(false)}
        icon={<CircleSlash size={20} />}
        title="Đóng phiên trước giờ mở?"
        bookTitle={auction.title}
        danger
        warning={<>Phiên bị hủy ngay và <b>không thể khôi phục</b>.</>}
        cancelText="Giữ lại"
        confirmText="Đóng phiên"
        busyText="Đang đóng…"
        isBusy={busy}
        error={error}
        steps={[
          { icon: <Wallet size={15} />, label: 'Hoàn cọc người đăng ký', detail: <><b>{count} người đăng ký</b> được hoàn cọc và nhận thông báo.</> },
          { icon: <MapPin size={15} />, label: 'Nhận lại sách tại điểm', detail: <>Sách được trả lại cho bạn tại <b>{auction.pointName}</b>.</>, result: true },
        ]}
        onConfirm={() => void run(`close:${version}`, (key) => closeAuctionBeforeStart(auction.id, version, key), () => setClosing(false))}
      />
    </div>
  )
}
