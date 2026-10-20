import { useId, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { formatRemaining, outcomeUnknown, useCountdown, useIntentKey } from '../hooks/useAuctionClock'
import { commandError } from '../lib/auction-errors'
import { formatVnd } from '../lib/routes'
import {
  acceptPointOrderReport, claimPointOrder, CLAIM_MIN_LENGTH, rejectPointOrderReport, requestCollectionCode,
  type CodeIssued, type PointOrder,
} from '../services/auctions'
import styles from './AuctionDetailPage.module.css'

// The buyer's steps after paying for an auction book at a point (FR-H09/H11,
// FR-T03): answer the inspection report, request the collection code at the
// desk, then report a problem within the inspection window. The server decides
// every deadline; countdowns here are only a display.

const POINT_HOURS = '09:00–18:00'
function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'
}
const length = (value: string) => [...value.trim()].length

type Step = {
  label: string; signature: string; send: (key: string) => Promise<unknown>
  // Also runs after a retry, so a code issued on the retry is still shown.
  onResult?: (result: unknown) => void
}
// One Idempotency-Key per step. An unknown outcome keeps the same frozen step
// for "Thử lại"; a known one drops it and reloads the order.
function useOrderStep(onSettled: () => Promise<unknown>) {
  const intent = useIntentKey()
  const pending = useRef<Step | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unknown, setUnknown] = useState<string | null>(null)
  async function run(step: Step) {
    const active = pending.current ?? step
    pending.current = active
    setBusy(true); setError(null)
    let open = false
    try {
      const result = await active.send(intent.keyFor(active.signature))
      intent.settle(); pending.current = null
      active.onResult?.(result)
      return result
    } catch (caught) {
      open = outcomeUnknown(caught)
      if (!open) { intent.settle(); pending.current = null }
      setError(commandError(caught))
      return undefined
    } finally {
      setUnknown(open ? active.label : null); setBusy(false)
      if (!open) void onSettled()
    }
  }
  return { run, retry: () => pending.current && run(pending.current), busy, error, unknown }
}

export function PointOrderSteps({ order, onChanged }: { order: PointOrder; onChanged: () => Promise<unknown> }) {
  const step = useOrderStep(onChanged)
  const header = (
    <div className={`${styles.standing} ${styles.standingLead}`}>
      <strong>{order.state === 'Completed' ? 'Đơn nhận sách đã hoàn tất' : `Đã thanh toán ${formatVnd(order.amounts.buyerTotal)}`}</strong>
      <span>{summary(order)}</span>
    </div>
  )
  const recovery = (step.error || step.unknown) && (
    <div className={styles.notice} role="alert">
      {step.error && <p className={styles.fieldError}>{step.error}</p>}
      {step.unknown && (
        <button type="button" className={styles.secondaryBlock} disabled={step.busy} onClick={() => void step.retry()}>
          Thử lại: {step.unknown}
        </button>
      )}
    </div>
  )
  const locked = step.busy || !!step.unknown
  return (
    <div className={styles.bidPanel}>
      {header}
      {order.state === 'Fulfilling' && <ReportDecision order={order} step={step} locked={locked} />}
      {(order.state === 'InTransit' || (order.state === 'ReadyForCollection' && order.fulfillmentMethod === 'CarrierOutbound')) && (
        <DeliveryNote order={order} />
      )}
      {order.state === 'ReadyForCollection' && order.fulfillmentMethod === 'SelfCollect' && (
        <CollectionCode order={order} step={step} locked={locked} />
      )}
      {order.state === 'Inspection' && <InspectionClaim order={order} step={step} locked={locked} />}
      {recovery}
    </div>
  )
}

function summary(o: PointOrder) {
  const delivered = o.fulfillmentMethod === 'CarrierOutbound'
  switch (o.state) {
    case 'Fulfilling':
      return `Sách đã đạt kiểm tra tại ${o.pointName}. Hãy xem biên bản và trả lời trước ${when(o.acceptanceDeadline)}.`
    case 'ReadyForCollection':
      return delivered
        ? `${o.pointName} sẽ giao sách cho hãng vận chuyển trước ${when(o.collectionDeadline)}.`
        : `Sách chờ bạn tại ${o.pointName} đến ${when(o.collectionDeadline)}, trong giờ ${POINT_HOURS}.`
    case 'InTransit':
      return `Sách đang được giao tới địa chỉ của bạn, chậm nhất ${when(o.delivery?.deliveryDeadline ?? null)}.`
    case 'Inspection':
      return delivered
        ? `Sách đã giao tới bạn lúc ${when(o.delivery?.deliveredAt ?? null)}. Nếu sách khác biên bản, hãy báo trước ${when(o.inspectionDeadline)}.`
        : `Bạn đã nhận sách. Nếu sách khác biên bản, hãy báo trước ${when(o.inspectionDeadline)}.`
    case 'ResolutionPending':
      return 'Quản trị viên đang xem xét đơn này. Tiền vẫn được giữ cho đơn cho tới khi có quyết định; theo dõi thông báo.'
    case 'ReturnPending':
      return delivered && !o.delivery?.deliveredAt
        ? `Giao hàng không thành công. Hãng đang trả sách về ${o.pointName}; tiền sách và phí giao được hoàn sau khi nhân viên đối chiếu sách.`
        : `Hãy mang sách trả về ${o.pointName} trước ${when(o.returnDeadline)}, trong giờ ${POINT_HOURS}. Tiền được hoàn sau khi nhân viên đối chiếu sách.`
    case 'Completed':
      return 'Quy trình nhận sách đã hoàn tất. Cảm ơn bạn đã cho cuốn sách một chương mới.'
    default:
      return 'Theo dõi thông báo để biết bước tiếp theo.'
  }
}

type StepProps = { order: PointOrder; step: ReturnType<typeof useOrderStep>; locked: boolean }

function ReportDecision({ order, step, locked }: StepProps) {
  const ids = useId()
  const [confirm, setConfirm] = useState<'accept' | 'reject' | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [invalid, setInvalid] = useState(false)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const remaining = useCountdown(order.acceptanceDeadline ?? undefined, order.serverTime)
  const send = async (kind: 'accept' | 'reject') => {
    const trimmed = reason.trim()
    await step.run(kind === 'accept'
      ? { label: 'đồng ý biên bản', signature: `accept:${order.id}:${order.version}`, send: (key) => acceptPointOrderReport(order.id, order.version, key) }
      : { label: 'từ chối biên bản', signature: `reject:${order.id}:${order.version}:${trimmed}`, send: (key) => rejectPointOrderReport(order.id, order.version, trimmed, key) })
    setConfirm(null)
  }
  return (
    <>
      <section className={styles.notice} aria-labelledby={`${ids}-report`}>
        <strong id={`${ids}-report`}>Biên bản kiểm tra tại điểm</strong>
        <p>Đạt kiểm tra tình trạng lúc {when(order.report.inspectedAt)}. {order.report.scope}</p>
        {order.report.note && <p>Ghi chú của nhân viên: {order.report.note}</p>}
        <p>Còn {formatRemaining(remaining)} để trả lời.</p>
      </section>
      <button type="button" className={styles.continue} disabled={locked || remaining === 0} onClick={() => setConfirm('accept')}>
        Đồng ý biên bản
      </button>
      {!rejecting ? (
        <button type="button" className={styles.secondaryBlock} disabled={locked || remaining === 0} onClick={() => setRejecting(true)}>
          Từ chối biên bản
        </button>
      ) : (
        <div className={styles.field}>
          <label htmlFor={`${ids}-reason`}>Lý do từ chối</label>
          <textarea
            id={`${ids}-reason`} ref={reasonRef} className={styles.textarea} rows={4} maxLength={1000}
            value={reason} disabled={locked} aria-invalid={invalid} aria-describedby={`${ids}-reason-hint`}
            onChange={(event) => { setReason(event.target.value); setInvalid(false) }}
          />
          <p id={`${ids}-reason-hint`} className={invalid ? styles.fieldError : styles.fieldHint}>
            {invalid ? 'Nhập lý do từ 10 đến 1.000 ký tự.' : 'Nói rõ điểm biên bản khác mô tả (10–1.000 ký tự). Quản trị viên đọc lý do này.'}
          </p>
          <button
            type="button" className={styles.secondaryBlock} disabled={locked}
            onClick={() => {
              const n = length(reason)
              if (n < 10 || n > 1000) { setInvalid(true); reasonRef.current?.focus(); return }
              setConfirm('reject')
            }}
          >
            Gửi lý do từ chối
          </button>
        </div>
      )}
      <ConfirmDialog
        isOpen={confirm === 'accept'} onClose={() => !step.busy && setConfirm(null)}
        title="Đồng ý biên bản kiểm tra?"
        description={order.fulfillmentMethod === 'CarrierOutbound'
          ? `Sau khi đồng ý, ${order.pointName} giao sách cho hãng vận chuyển trong 72 giờ. Đồng ý biên bản không làm mất quyền báo vấn đề sau khi nhận sách.`
          : `Sau khi đồng ý, bạn có 72 giờ để lấy mã và nhận sách tại ${order.pointName} trong giờ ${POINT_HOURS}. Đồng ý biên bản không làm mất quyền báo vấn đề sau khi nhận sách.`}
        confirmText="Đồng ý" onConfirm={() => void send('accept')} isBusy={step.busy}
      />
      <ConfirmDialog
        isOpen={confirm === 'reject'} onClose={() => !step.busy && setConfirm(null)}
        title="Từ chối biên bản?"
        description="Sách sẽ không được giao. Quản trị viên xem lý do của bạn rồi quyết định hoàn tiền hoặc mở lại thời hạn nhận sách."
        confirmText="Từ chối biên bản" onConfirm={() => void send('reject')} isBusy={step.busy} isDanger
      >
        <p className={styles.fieldHint}>{reason.trim()}</p>
      </ConfirmDialog>
    </>
  )
}

// ADR 0044: the point hands the book to the simulated carrier, which
// delivers to the buyer's address; inspection starts at delivery.
function DeliveryNote({ order }: { order: PointOrder }) {
  const ids = useId()
  const d = order.delivery
  return (
    <section className={styles.notice} aria-labelledby={`${ids}-delivery`}>
      <strong id={`${ids}-delivery`}>Giao tận nơi</strong>
      {d && <p>{d.recipientName} · {d.phone} · {d.detail}</p>}
      <p>
        {d?.trackingCode
          ? `Mã vận đơn ${d.trackingCode} · đã giao cho hãng lúc ${when(d.dispatchedAt)}.`
          : `Nhân viên ${order.pointName} sẽ đóng gói và giao sách cho hãng vận chuyển.`}
      </p>
    </section>
  )
}

function CollectionCode({ order, step, locked }: StepProps) {
  const ids = useId()
  const [confirm, setConfirm] = useState(false)
  // Shown once, kept only in memory; a reload needs a new code.
  const [issued, setIssued] = useState<{ code: string | null; expiresAt: string | null; serverTime: string } | null>(null)
  const remaining = useCountdown(issued?.expiresAt ?? undefined, issued?.serverTime)
  const live = !!issued?.code && remaining > 0
  const request = async () => {
    await step.run({
      label: 'lấy mã nhận sách', signature: `code:${order.id}:${order.version}`,
      send: (key) => requestCollectionCode(order.id, order.version, key),
      onResult: (value) => {
        const result = value as CodeIssued
        setIssued({ code: result.code, expiresAt: result.receipt.codeExpiresAt, serverTime: result.receipt.serverTime })
      },
    })
    setConfirm(false)
  }
  return (
    <>
      {live ? (
        <section className={styles.notice} aria-labelledby={`${ids}-code`} aria-live="polite">
          <strong id={`${ids}-code`}>Mã nhận sách</strong>
          <p className={styles.collectionCode}>{issued!.code}</p>
          <p>Đọc mã này cho nhân viên tại quầy. Mã hết hạn sau {formatRemaining(remaining)}; không gửi mã cho người khác.</p>
        </section>
      ) : issued ? (
        <p className={styles.fieldHint} role="status">
          {issued.code === null
            ? 'Mã đã được tạo nhưng không thể hiển thị lại. Hãy lấy mã mới khi đang ở quầy.'
            : 'Mã đã hết hạn. Hãy lấy mã mới khi đang ở quầy.'}
        </p>
      ) : (
        <p className={styles.fieldHint}>Chỉ lấy mã khi bạn đã ở quầy, trong giờ {POINT_HOURS}. Mã có hiệu lực 10 phút; lấy mã mới sẽ hủy mã cũ.</p>
      )}
      <button type="button" className={live ? styles.secondaryBlock : styles.continue} disabled={locked} onClick={() => setConfirm(true)}>
        {issued ? 'Lấy mã mới' : 'Lấy mã nhận sách'}
      </button>
      <ConfirmDialog
        isOpen={confirm} onClose={() => !step.busy && setConfirm(false)}
        title="Lấy mã nhận sách?"
        description={`Mã có hiệu lực 10 phút và chỉ hiển thị một lần. Hãy lấy mã khi bạn đã ở ${order.pointName}.`}
        confirmText="Lấy mã" onConfirm={() => void request()} isBusy={step.busy}
      />
    </>
  )
}

function InspectionClaim({ order, step, locked }: StepProps) {
  const ids = useId()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [description, setDescription] = useState('')
  const [invalid, setInvalid] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const remaining = useCountdown(order.inspectionDeadline ?? undefined, order.serverTime)
  const send = async () => {
    const trimmed = description.trim()
    await step.run({
      label: 'gửi báo cáo vấn đề', signature: `claim:${order.id}:${order.version}:${trimmed}`,
      send: (key) => claimPointOrder(order.id, order.version, trimmed, key),
    })
    setConfirm(false)
  }
  if (remaining === 0) return <p className={styles.fieldHint}>Đã hết thời hạn kiểm tra sách.</p>
  return (
    <>
      <p className={styles.fieldHint}>Còn {formatRemaining(remaining)} để kiểm tra. Không có vấn đề thì bạn không cần làm gì thêm.</p>
      {!open ? (
        <button type="button" className={styles.secondaryBlock} disabled={locked} onClick={() => setOpen(true)}>
          Báo sách khác biên bản
        </button>
      ) : (
        <div className={styles.field}>
          <label htmlFor={`${ids}-claim`}>Sách khác biên bản ở điểm nào?</label>
          <textarea
            id={`${ids}-claim`} ref={input} className={styles.textarea} rows={5} maxLength={5000}
            value={description} disabled={locked} aria-invalid={invalid} aria-describedby={`${ids}-claim-hint`}
            onChange={(event) => { setDescription(event.target.value); setInvalid(false) }}
          />
          <p id={`${ids}-claim-hint`} className={invalid ? styles.fieldError : styles.fieldHint}>
            {invalid
              ? `Mô tả vấn đề từ ${CLAIM_MIN_LENGTH} đến 5.000 ký tự.`
              : `Ít nhất ${CLAIM_MIN_LENGTH} ký tự: trang, vết hỏng hoặc điểm khác so với biên bản. Giữ nguyên sách để đối chiếu.`}
          </p>
          <button
            type="button" className={styles.secondaryBlock} disabled={locked}
            onClick={() => {
              const n = length(description)
              if (n < CLAIM_MIN_LENGTH || n > 5000) { setInvalid(true); input.current?.focus(); return }
              setConfirm(true)
            }}
          >
            Gửi báo cáo vấn đề
          </button>
        </div>
      )}
      <ConfirmDialog
        isOpen={confirm} onClose={() => !step.busy && setConfirm(false)}
        title="Gửi báo cáo vấn đề?"
        description="Quản trị viên sẽ xem xét và có thể yêu cầu bạn mang sách trả về điểm để đối chiếu. Tiền vẫn được giữ cho đơn trong thời gian xem xét."
        confirmText="Gửi báo cáo" onConfirm={() => void send()} isBusy={step.busy}
      >
        <p className={styles.fieldHint}>{description.trim()}</p>
      </ConfirmDialog>
    </>
  )
}
