// ADR 0076: action panels for Dutch and sealed-bid auctions. English auctions
// keep BidPanel. The server stays authoritative for prices, funds and timing.
import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, EyeOff, TrendingDown, Users, Wallet } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { commandOutcomeUnknown, formatRemaining, useCountdown, useIntentKey } from '../hooks/useAuctionClock'
import { commandError } from '../lib/auction-errors'
import { formatVnd, ROUTES } from '../lib/routes'
import { getWalletSummary } from '../services/wallet'
import {
  AUCTION_PRICE_DIGITS, acceptDutch, placeSealedBid, registerForAuction, withdrawAuctionRegistration,
  type AuctionParticipation, type AuctionSummary,
} from '../services/auctions'
import styles from './AuctionDetailPage.module.css'

type PanelProps = {
  auction: AuctionSummary
  me: AuctionParticipation | null
  serverTime: string | undefined
  onChanged: () => Promise<unknown>
}

function useAvailable(me: AuctionParticipation | null) {
  const wallet = useQuery({ queryKey: ['wallet-summary'], queryFn: getWalletSummary, staleTime: 15_000 })
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
export function RegistrationPanel({ auction, me, onChanged }: PanelProps) {
  const deposit = auction.depositAmount ?? 0
  const need = auction.minBidders ?? 2
  const count = auction.registeredCount ?? 0
  const registered = me?.registrationState === 'Registered'
  const available = useAvailable(me)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { busy, error, unknown, run } = useCommand(onChanged)
  const short = !registered && available !== null && deposit > available
  return (
    <div className={styles.bidPanel}>
      <div className={styles.notice}>
        <strong><Users size={16} aria-hidden="true" /> {registered ? 'Bạn đã đăng ký phiên này' : 'Đăng ký để tham gia đấu giá'}</strong>
        <p>
          Phiên mở trả giá khi có ít nhất {need} người đăng ký; hiện có <b>{count}/{need}</b>.
          Phiên chỉ bán khi có ít nhất hai người trả giá.
        </p>
        <progress max={need} value={Math.min(count, need)} aria-label={`${count} trên ${need} người đã đăng ký`} />
        <p>
          {registered
            ? `Ví đang giữ ${formatVnd(me?.deposit ?? deposit)} tiền cọc. Bạn có thể rút đăng ký và nhận lại tiền cọc khi phiên chưa đủ người.`
            : `Tiền cọc ${formatVnd(deposit)} được giữ trong ví, hoàn lại khi bạn không thắng hoặc phiên không đủ người. Nếu thắng, tiền cọc tính vào giá phải trả; thắng mà không thanh toán đúng hạn thì không được hoàn.`}
        </p>
      </div>
      {!registered && <Shortfall available={available} amount={deposit} />}
      {notice && <p className={styles.walletLine} role="status">{notice}</p>}
      {error && <p className={styles.walletShort} role="alert">{error}</p>}
      {unknown ? (
        <button type="button" className={styles.primaryBlock} disabled={busy} onClick={() => void unknown()}>
          {busy ? 'Đang thử lại…' : 'Thử lại đúng lệnh vừa rồi'}
        </button>
      ) : registered ? (
        <button type="button" className={styles.secondaryBlock} disabled={busy}
          onClick={() => void run('withdraw-registration', (key) => withdrawAuctionRegistration(auction.id, key), () => setNotice('Đã rút đăng ký; tiền cọc đã về lại ví.'))}>
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
        title={`Đặt cọc ${formatVnd(deposit)} để đăng ký?`}
        description={`Ví giữ ${formatVnd(deposit)} ngay. Tiền cọc được hoàn khi bạn không thắng, phiên không đủ người hoặc bị hủy, và bạn có thể rút đăng ký trước khi phiên đủ ${need} người. Nếu thắng mà không thanh toán trong 24 giờ, tiền cọc chuyển cho nền tảng.`}
        confirmText="Đặt cọc và đăng ký"
        isBusy={busy}
        onConfirm={() => void run(`register:${deposit}`, (key) => registerForAuction(auction.id, deposit, key), () => {
          setConfirming(false)
          setNotice(count + 1 >= need ? 'Đã đăng ký. Phiên đủ người, bạn có thể trả giá.' : 'Đã đăng ký. Bạn sẽ nhận thông báo khi phiên đủ người.')
        }).finally(() => setConfirming(false))}
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
        title={`Mua với ${formatVnd(price)}?`}
        description={`Nếu giá đã giảm khi lệnh tới máy chủ, bạn trả giá thấp hơn đó. Ví giữ số tiền này ngay; bạn thanh toán từ ví trong 24 giờ và tự nhận sách tại ${auction.pointName}. Không thể rút lại.`}
        confirmText="Chấp nhận giá"
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
        title={`Gửi giá kín ${amount ? formatVnd(amount) : ''}?`}
        description="Giá kín không thể rút hay hạ, chỉ có thể nâng. Ví giữ toàn bộ số tiền này đến khi phiên chốt; nếu thắng, bạn thanh toán từ ví trong 24 giờ."
        confirmText="Gửi giá kín"
        isBusy={busy}
        onConfirm={() => amount !== null && void run(`sealed:${amount}`, (key) => placeSealedBid(auction.id, amount, key), () => {
          setNotice(`Đã ghi nhận giá kín ${formatVnd(amount)}. Kết quả công bố khi phiên kết thúc.`)
        }).finally(() => setConfirming(false))}
      />
    </div>
  )
}
