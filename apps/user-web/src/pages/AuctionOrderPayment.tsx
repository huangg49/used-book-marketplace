import { useRef, useState } from 'react'
import { auctionCheckoutBalance, auctionOrderHoldNotes, auctionOrderHoldText, buyerSaleFeeText, formatSaleFeeRate } from '@used-books/session-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, MapPin, Truck } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TransactionAmount, TransactionNotes } from '../components/TransactionReview'
import { PurchaseAddressFields, type PurchaseAddressForm } from '../components/PurchaseAddressFields'
import { commandOutcomeUnknown, useCountdown, useIntentKey } from '../hooks/useAuctionClock'
import { commandError } from '../lib/auction-errors'
import { formatVnd } from '../lib/routes'
import { invalidateMemberWalletViews } from '../lib/wallet-cache'
import {
  getMyAddresses, getPointOrderDeliveryQuote, payPointOrder, saveMyAddress,
  type DeliveryChoice, type NewAddressBody, type PointOrder,
} from '../services/auctions'
import { serviceAreasQuery } from '../services/service-areas'
import { getWalletSummary } from '../services/wallet'
import styles from './AuctionDetailPage.module.css'
import orderStyles from './AuctionWinnerOrderPage.module.css'

const DELIVERY_SERVICE_AREA = 'HCM-DEMO-v1'

export function AuctionOrderPayment({
  order: o, ownerId, heldAmount, onChanged, paused,
}: {
  order: PointOrder
  ownerId: string
  heldAmount?: number
  onChanged: () => Promise<unknown>
  paused: boolean
}) {
  const queryClient = useQueryClient()
  const remaining = useCountdown(o.paymentDeadline ?? undefined, o.serverTime)
  const intent = useIntentKey()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unknown, setUnknown] = useState(false)
  const pendingPayment = useRef<{ id: string; version: number; key: string; delivery?: DeliveryChoice } | null>(null)
  // ADR 0044: pickup at the point, or delivery priced by the server.
  const [deliver, setDeliver] = useState(false)
  const [addressId, setAddressId] = useState<string | null>(null)
  // ADR 0044: a saved address, or a new one saved with the same form the
  // exchange and direct-delivery flows use.
  const [newAddress, setNewAddress] = useState(false)
  const [addressForm, setAddressForm] = useState<PurchaseAddressForm>({ recipientName: '', phone: '', localityCode: '', detail: '' })
  const [addressBusy, setAddressBusy] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const addressAttempt = useRef<{ key: string; body: NewAddressBody } | null>(null)
  const addresses = useQuery({ queryKey: ['addresses', ownerId], queryFn: getMyAddresses, enabled: deliver, retry: false })
  const areas = useQuery({ ...serviceAreasQuery, enabled: deliver })
  const wallet = useQuery({ queryKey: ['wallet-summary', ownerId], queryFn: getWalletSummary, enabled: confirming, retry: false, staleTime: 15_000 })
  const usable = (addresses.data?.items ?? []).filter((a) => a.serviceAreaCode === DELIVERY_SERVICE_AREA)
  const chosen = addressId ?? usable.find((a) => a.isDefault)?.id ?? usable[0]?.id ?? null
  const selectedAddress = usable.find((a) => a.id === chosen)
  const localityLabel = selectedAddress?.localityCode
    ? areas.data?.localities.find((item) => item.code === selectedAddress.localityCode)?.label
    : undefined
  const quote = useQuery({
    queryKey: ['point-order-delivery-quote', o.id, ownerId, chosen],
    queryFn: () => getPointOrderDeliveryQuote(o.id!, chosen!),
    enabled: deliver && !!o.id && !!chosen, retry: false, staleTime: 0,
  })
  const delivery: DeliveryChoice | undefined = deliver && quote.data
    ? { addressId: quote.data.addressId, addressVersion: quote.data.addressVersion, fee: quote.data.outboundFee }
    : undefined

  // Prefill only name and phone from the saved address the buyer already has;
  // the area and street are still written for this delivery.
  function openNewAddress() {
    const fallback = selectedAddress ?? usable.find((a) => a.isDefault) ?? usable[0]
    setAddressForm({
      recipientName: fallback?.recipientName ?? '',
      phone: fallback?.phone ?? '',
      localityCode: fallback?.localityCode ?? '',
      detail: '',
    })
    setNewAddress(true)
    setAddressError(null)
  }

  // One Idempotency-Key per address intent: a retry after a lost response
  // replays the same address instead of adding a second one.
  async function saveAddress() {
    if (addressBusy) return
    if (!addresses.data?.version) {
      setAddressError('Chưa tải được sổ địa chỉ. Tải lại địa chỉ rồi thử lại.')
      return
    }
    if (!addressForm.localityCode) {
      setAddressError('Chọn tỉnh/thành phố nhận sách.')
      return
    }
    const attempt = addressAttempt.current ?? {
      key: crypto.randomUUID(),
      body: {
        expectedBookVersion: addresses.data.version,
        address: { ...addressForm, serviceAreaCode: DELIVERY_SERVICE_AREA },
        makeDefault: usable.length === 0,
      },
    }
    addressAttempt.current = attempt
    setAddressBusy(true); setAddressError(null)
    try {
      const saved = await saveMyAddress(attempt.body, attempt.key)
      addressAttempt.current = null
      await addresses.refetch()
      setAddressId(saved.addressId)
      setNewAddress(false)
    } catch (caught) {
      if (!commandOutcomeUnknown(caught)) addressAttempt.current = null
      setAddressError(commandError(caught))
    } finally {
      setAddressBusy(false)
    }
  }

  const pay = async () => {
    const payment = pendingPayment.current ?? {
      id: o.id,
      version: o.version,
      key: intent.keyFor(`pay:${o.id}:${o.version}:${delivery ? `${delivery.addressId}:${delivery.fee}` : 'self'}`),
      delivery,
    }
    pendingPayment.current = payment
    let pending = false
    setBusy(true); setError(null)
    try {
      await payPointOrder(payment.id, payment.version, payment.key, payment.delivery)
      invalidateMemberWalletViews(queryClient, ownerId)
      intent.settle()
      pendingPayment.current = null
      setConfirming(false)
    } catch (caught) {
      pending = commandOutcomeUnknown(caught)
      if (!pending) { intent.settle(); pendingPayment.current = null }
      setError(commandError(caught))
    } finally {
      setUnknown(pending); setBusy(false)
      // Chưa rõ kết quả thì giữ version đang có để lần thử lại gửi đúng khóa và nội dung.
      if (!pending) void onChanged()
    }
  }

  const total = deliver ? quote.data?.buyerTotal : o.amounts.bookPrice
  const balance = total === undefined ? null : auctionCheckoutBalance(total, heldAmount)
  const funds = heldAmount !== undefined && balance ? (
    <>
      <div><dt>Ví đang giữ cho phiên</dt><dd>{formatVnd(heldAmount)}</dd></div>
      <div><dt>{balance.label}</dt><dd>{formatVnd(balance.amount)}</dd></div>
    </>
  ) : null
  const feeText = buyerSaleFeeText(o.amounts.commissionBps)
  const choiceLocked = busy || unknown
  return (
    <div className={styles.bidPanel}>
      <p className={styles.quickLabel}>Nhận sách bằng cách nào?</p>
      <div className={`${styles.quick} ${orderStyles.methodChoices}`} role="group" aria-label="Cách nhận sách">
        <button type="button" aria-pressed={!deliver} disabled={choiceLocked} onClick={() => { setDeliver(false); setNewAddress(false); setAddressError(null) }}><MapPin aria-hidden="true" size={19} /><span>Tự nhận tại điểm</span></button>
        <button type="button" aria-pressed={deliver} disabled={choiceLocked} onClick={() => setDeliver(true)}><Truck aria-hidden="true" size={19} /><span>Giao tận nơi</span></button>
      </div>
      {deliver && (addresses.isPending ? (
        <p className={styles.fieldHint} role="status">Đang tải địa chỉ…</p>
      ) : addresses.isError ? (
        <div role="alert">
          <p className={styles.fieldError}>{commandError(addresses.error)}</p>
          <button type="button" className={styles.secondaryBlock} disabled={addresses.isFetching} onClick={() => void addresses.refetch()}>
            Tải lại địa chỉ
          </button>
        </div>
      ) : newAddress ? (
        <form className={styles.addressForm} onSubmit={(event) => { event.preventDefault(); void saveAddress() }}>
          <PurchaseAddressFields
            addresses={[]}
            selected="new"
            onSelect={() => undefined}
            form={addressForm}
            onChange={setAddressForm}
            localities={areas.data?.localities ?? []}
            note={`Điểm ${o.pointName} giao sách cho hãng vận chuyển mô phỏng tới địa chỉ này.`}
          />
          {areas.isError && (
            <p className={styles.fieldHint} role="status">
              Chưa tải được khu vực giao sách.{' '}
              <button type="button" className={styles.secondaryBlock} disabled={areas.isFetching} onClick={() => void areas.refetch()}>
                Tải lại khu vực
              </button>
            </p>
          )}
          {addressError && <p role="alert" className={styles.fieldError}>{addressError}</p>}
          <button type="submit" className={styles.secondaryBlock} disabled={addressBusy || choiceLocked}>
            {addressBusy ? 'Đang lưu địa chỉ…' : 'Lưu địa chỉ và xem phí giao'}
          </button>
          {usable.length > 0 && (
            <button
              type="button" className={styles.secondaryBlock} disabled={addressBusy || choiceLocked}
              onClick={() => { setNewAddress(false); setAddressError(null) }}
            >
              Dùng địa chỉ đã lưu
            </button>
          )}
        </form>
      ) : usable.length === 0 ? (
        <div className={styles.field}>
          <p className={styles.fieldHint}>
            Bạn chưa có địa chỉ nhận sách. Thêm địa chỉ ngay tại đây để tính phí giao tận nơi theo khu vực.
          </p>
          <button type="button" className={styles.secondaryBlock} disabled={choiceLocked} onClick={openNewAddress}>
            Thêm địa chỉ nhận sách
          </button>
        </div>
      ) : (
        <div className={styles.field}>
          <label htmlFor={`${o.id}-address`}>Giao tới</label>
          <select
            id={`${o.id}-address`} className={styles.select} value={chosen ?? ''} disabled={choiceLocked}
            onChange={(event) => setAddressId(event.target.value)}
          >
            {usable.map((a) => <option key={a.id} value={a.id}>{a.recipientName} · {a.detail}</option>)}
          </select>
          {selectedAddress && (
            <p className={styles.fieldHint}>
              {selectedAddress.recipientName}
              {selectedAddress.phone ? ` · ${selectedAddress.phone}` : ''} · {selectedAddress.detail}
              {localityLabel ? ` · ${localityLabel}` : ''}
            </p>
          )}
          <button type="button" className={styles.secondaryBlock} disabled={choiceLocked} onClick={openNewAddress}>
            Thêm địa chỉ mới
          </button>
          {quote.isError ? (
            <p role="alert" className={styles.fieldError}>{commandError(quote.error)}{' '}<button type="button" className={styles.secondaryBlock} disabled={quote.isFetching} onClick={() => void quote.refetch()}>Tải lại phí giao</button></p>
          ) : quote.data ? (
            <p className={styles.fieldHint}>
              {quote.data.policyCode === 'GHN-LIVE-v2'
                ? 'Phí giao tính trực tiếp từ Giao Hàng Nhanh (GHN) theo khoảng cách và giá trị sách. '
                : quote.data.outboundFee > 0
                  ? 'Phí giao tính theo biểu phí khu vực từ điểm giữ sách tới địa chỉ của bạn. '
                  : ''}
              Sau khi bạn đồng ý biên bản, {o.pointName} bàn giao sách cho đơn vị vận chuyển.
            </p>
          ) : (
            <p className={styles.fieldHint} role="status">Đang tính phí giao tới địa chỉ này…</p>
          )}
        </div>
      ))}
      {error && <p role="alert" className={styles.fieldError}>{error}</p>}
      <dl className={styles.deliveryTotals}>
        <div><dt>Tiền sách</dt><dd>{formatVnd(o.amounts.bookPrice)}</dd></div>
        <div><dt>{deliver ? 'Phí giao tận nơi' : 'Phí nhận tại điểm'}</dt><dd>{
          deliver && (!delivery || quote.isError) ? 'Chưa có báo giá' : delivery?.fee ? formatVnd(delivery.fee) : 'Miễn phí'
        }</dd></div>
        {total !== undefined && (!deliver || !quote.isError) && (
          <><div><dt>Tổng thanh toán</dt><dd>{formatVnd(total)}</dd></div>{funds}</>
        )}
      </dl>
      <p className={styles.fieldHint}>{feeText}</p>
      <p className={styles.fieldHint}>{auctionOrderHoldText}</p>
      <button
        type="button" className={styles.continue}
        disabled={busy || (!unknown && (paused || remaining === 0 || (deliver && (quote.isError || !quote.data))))}
        onClick={() => (unknown ? void pay() : setConfirming(true))}
      >
        {unknown ? 'Thử lại thanh toán' : total === undefined ? 'Thanh toán' : `Thanh toán ${formatVnd(total)}`} <ArrowRight size={16} aria-hidden="true" />
      </button>
      <p className={styles.fieldHint}>Vui lòng thanh toán toàn bộ đơn trong một lần.</p>
      <ConfirmDialog
        isOpen={confirming && !paused}
        onClose={() => !busy && setConfirming(false)}
        title="Thanh toán từ Ví"
        confirmText="Thanh toán"
        onConfirm={() => void pay()}
        isBusy={busy}
        error={error}
        confirmDisabled={deliver && (!delivery || quote.isError)}
        stickyFooter
      >
        <TransactionAmount
          label={balance?.label ?? 'Tổng thanh toán'}
          value={total === undefined || (deliver && quote.isError) ? 'Chưa có báo giá' : formatVnd(balance?.amount ?? total)}
        />
        <dl className={orderStyles.checkoutReviewRows}>
          <div><dt>Tiền sách</dt><dd>{formatVnd(o.amounts.bookPrice)}</dd></div>
          <div><dt>Phí giao nhận</dt><dd>{deliver && (!delivery || quote.isError) ? 'Chưa có báo giá' : formatVnd(delivery?.fee ?? 0)}</dd></div>
          {heldAmount !== undefined && <div><dt>Ví đang giữ cho phiên</dt><dd>{formatVnd(heldAmount)}</dd></div>}
          {balance && total !== undefined && (!deliver || !quote.isError) && (
            <div data-total><dt>Tổng thanh toán</dt><dd>{formatVnd(total)}</dd></div>
          )}
          <div>
            <dt>Số dư Ví khả dụng</dt>
            <dd>{wallet.isPending ? 'Đang tải…' : wallet.data ? formatVnd(wallet.data.available) : '—'}</dd>
          </div>
        </dl>
        <p className={styles.fieldHint}>{o.amounts.commissionBps === 0
          ? 'Đơn này miễn phí dịch vụ.'
          : `Phí dịch vụ${o.amounts.commissionBps === undefined ? '' : ` ${formatSaleFeeRate(o.amounts.commissionBps)}`} do người bán chịu.`}</p>
        <TransactionNotes notes={[
          { label: 'Cách nhận', detail: deliver
            ? `Giao tận nơi · ${selectedAddress?.recipientName ?? 'địa chỉ của bạn'}${selectedAddress?.phone ? ` · ${selectedAddress.phone}` : ''}. Chốt khi thanh toán.`
            : `Tự nhận tại ${o.pointName}. Chốt khi thanh toán.` },
          ...auctionOrderHoldNotes,
        ]} />
      </ConfirmDialog>
    </div>
  )
}
