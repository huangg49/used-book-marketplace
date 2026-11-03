import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Info,
  Landmark,
  LoaderCircle,
  Wallet,
} from "lucide-react";
import {
  ApiError,
  withdrawalLabels,
  withdrawalReasons,
  withdrawalSchema,
  withdrawalReceiptSchema,
  type CreateWithdrawal,
  type Withdrawal,
} from "@used-books/session-client";
import { PurchaseDialog } from "../components/PurchaseDialog";
import { session } from "../lib/session";
import { formatVnd } from "../lib/routes";
import styles from "./WalletWithdrawals.module.css";

const date = (s: string) => new Date(s).toLocaleString("vi-VN");
const finalStates = ["Completed", "Rejected", "Refunded"];
export function WalletWithdrawals({
  ownerId,
  available,
  enabled,
  open,
  onClose,
  onResume,
}: {
  ownerId: string;
  available: number;
  enabled: boolean;
  open: boolean;
  onClose: () => void;
  onResume: () => void;
}) {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<CreateWithdrawal["reason"] | "">("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [bankName, setBank] = useState("");
  const [accountNumber, setAccount] = useState("");
  const [accountHolder, setHolder] = useState("");
  const [review, setReview] = useState(false);
  const [reviewAvailable, setReviewAvailable] = useState(available);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<{ key: string; body: CreateWithdrawal } | null>(null);
  const inFlight = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      (uncertain ||
        busy ||
        !!amount ||
        !!reason ||
        !!bankName ||
        !!accountNumber ||
        !!accountHolder),
  );
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const detailId = params.get("withdrawal");
  const validId =
    detailId && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(detailId)
      ? detailId
      : undefined;
  const detail = useQuery({
    queryKey: ["withdrawal", ownerId, validId],
    staleTime: 0,
    queryFn: () =>
      session.request(`/me/withdrawals/${validId}`, withdrawalSchema),
    enabled: !!validId,
    refetchInterval: (q) =>
      document.visibilityState === "visible" &&
      !finalStates.includes(q.state.data?.state ?? "")
        ? 5000
        : false,
  });
  useEffect(() => {
    void client.invalidateQueries({ queryKey: ["wallet-summary", ownerId] });
    void client.invalidateQueries({ queryKey: ["wallet-history", ownerId] });
  }, [client, ownerId, detail.data?.version]);
  useEffect(() => {
    if (detail.data) {
      void client.invalidateQueries({
        queryKey: ["withdrawals", ownerId, "pending"],
      });
    }
  }, [client, ownerId, detail.data]);
  useEffect(() => {
    if (
      !pending.current &&
      !amount &&
      !reason &&
      !bankName &&
      !accountNumber &&
      !accountHolder
    )
      return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [amount, reason, bankName, accountNumber, accountHolder, uncertain]);
  const select = (id: string) => {
    void client.invalidateQueries({ queryKey: ["withdrawal", ownerId, id] });
    const next = new URLSearchParams(params);
    next.set("withdrawal", id);
    setParams(next, { replace: true });
  };
  const closeDetail = () => {
    const next = new URLSearchParams(params);
    next.delete("withdrawal");
    setParams(next, { replace: true });
  };
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["wallet-summary", ownerId] }),
      client.invalidateQueries({ queryKey: ["wallet-history", ownerId] }),
      client.invalidateQueries({ queryKey: ["withdrawals", ownerId] }),
      client.invalidateQueries({ queryKey: ["notifications", ownerId] }),
    ]);
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const value = Number(amount);
    if (!pending.current && !enabled) {
      setError("Hiện chưa thể tạo yêu cầu rút tiền.");
      return;
    }
    if (!pending.current) {
      if (!Number.isSafeInteger(value) || value < 50000 || value > available) {
        setError("Nhập số tiền từ 50.000đ và không vượt số dư khả dụng.");
        return;
      }
      if (
        !reason ||
        !bankName.trim() ||
        !accountHolder.trim() ||
        !/^[0-9]{6,30}$/.test(accountNumber) ||
        (reason === "Other" && !reasonDetail.trim())
      ) {
        setError(
          "Kiểm tra lý do và thông tin nhận tiền. Số tài khoản cần từ 6 đến 30 chữ số.",
        );
        return;
      }
      if (!review) {
        setReviewAvailable(available);
        setReview(true);
        setError("");
        return;
      }
      pending.current = {
        key: crypto.randomUUID(),
        body: {
          amount: value,
          reason,
          reasonDetail,
          recipient: { bankName, accountNumber, accountHolder },
        },
      };
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    setUncertain(true);
    try {
      const intent = pending.current;
      const result = await session.request(
        "/me/withdrawals",
        withdrawalReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": intent.key },
          body: JSON.stringify(intent.body),
        },
      );
      if (!alive.current) return;
      pending.current = null;
      setUncertain(false);
      setReview(false);
      setAmount("");
      setReason("");
      setReasonDetail("");
      setBank("");
      setAccount("");
      setHolder("");
      onClose();
      select(result.entityId);
      void refresh();
    } catch (cause) {
      if (!alive.current) return;
      if (
        cause instanceof ApiError &&
        [400, 403, 404, 409, 422].includes(cause.status)
      ) {
        pending.current = null;
        setUncertain(false);
        setReview(false);
        setError(cause.message);
        void refresh();
      } else
        setError(
          "Chưa xác định yêu cầu đã được tiếp nhận. Bấm “Kiểm tra lại yêu cầu” để gửi lại cùng mã; thông tin của bạn được giữ nguyên.",
        );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PurchaseDialog
        open={blocker.state === "blocked"}
        onClose={() => {
          if (blocker.state === "blocked") blocker.reset();
        }}
        title={
          uncertain
            ? "Kiểm tra yêu cầu trước khi rời Ví"
            : "Rời bản nháp rút tiền?"
        }
      >
        <p className={styles.hint}>
          {uncertain
            ? "Kết quả gửi chưa được xác định. Quay lại kiểm tra cùng yêu cầu để tránh gửi thêm một đơn mới."
            : "Thông tin đang nhập sẽ bị bỏ khi bạn rời trang."}
        </p>
        <div className={styles.actions}>
          <button
            className={styles.secondary}
            type="button"
            onClick={() => {
              if (blocker.state === "blocked") blocker.reset();
              onResume();
            }}
          >
            Quay lại yêu cầu
          </button>
          {!uncertain && !busy && (
            <button
              className={styles.primary}
              type="button"
              onClick={() => {
                if (blocker.state === "blocked") blocker.proceed();
              }}
            >
              Bỏ bản nháp và rời trang
            </button>
          )}
        </div>
      </PurchaseDialog>
      <PurchaseDialog
        open={open}
        onClose={onClose}
        title={review ? "Xác nhận rút tiền" : "Rút tiền từ ví"}
        description="Phí 0đ · Admin xử lý trong vòng dưới 24 giờ"
        busy={busy}
        className={`${styles.dialog} ${styles.formDialog}`}
      >
        <form
          onSubmit={submit}
          className={styles.form}
          data-step={review ? "review" : "entry"}
        >
          <ol className={styles.steps} aria-label="Các bước rút tiền">
            <li
              aria-current={!review ? "step" : undefined}
              data-complete={review}
            >
              {review && <Check size={16} aria-hidden="true" />}Thông tin rút
              tiền
            </li>
            <li aria-current={review ? "step" : undefined}>Kiểm tra & gửi</li>
          </ol>
          {!review && (
            <div className={styles.balance}>
              <span>
                <Wallet size={17} aria-hidden="true" />
                Số dư khả dụng
              </span>
              <strong>{formatVnd(available)}</strong>
            </div>
          )}
          <fieldset
            className={styles.entryGrid}
            disabled={busy || uncertain || review}
            hidden={review}
          >
            <div className={styles.moneyFields}>
              <label htmlFor="withdraw-amount">Số tiền muốn rút</label>
              <div className={styles.amountInput}>
                <input
                  id="withdraw-amount"
                  inputMode="numeric"
                  type="text"
                  required
                  pattern="[0-9]+"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError("");
                  }}
                  placeholder="0"
                  aria-describedby="withdraw-minimum"
                />
                <span>VND</span>
              </div>
              <small id="withdraw-minimum" className={styles.minimum}>
                Tối thiểu 50.000đ
              </small>
              <div
                className={styles.quickAmounts}
                role="group"
                aria-label="Chọn nhanh số tiền"
              >
                {[50000, 100000, 500000].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={Number(amount) === value}
                    disabled={available < value}
                    onClick={() => {
                      setAmount(String(value));
                      setError("");
                    }}
                  >
                    {value.toLocaleString("vi-VN")}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={Number(amount) === available && !!amount}
                  disabled={available < 50000}
                  onClick={() => {
                    setAmount(String(available));
                    setError("");
                  }}
                >
                  Tối đa
                </button>
              </div>
              <label htmlFor="withdraw-reason">
                Lý do rút tiền <span aria-hidden="true">*</span>
              </label>
              <select
                id="withdraw-reason"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value as typeof reason)}
              >
                <option value="">Chọn lý do</option>
                {Object.entries(withdrawalReasons).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
              {reason === "Other" && (
                <div className={styles.reasonDetail}>
                  <label htmlFor="withdraw-reason-detail">Mô tả lý do</label>
                  <textarea
                    id="withdraw-reason-detail"
                    required
                    maxLength={500}
                    value={reasonDetail}
                    onChange={(e) => setReasonDetail(e.target.value)}
                    rows={3}
                  />
                </div>
              )}
            </div>
            <div className={styles.recipientFields}>
              <h3>
                <Landmark size={19} aria-hidden="true" />
                Thông tin nhận tiền
              </h3>
              <label htmlFor="withdraw-bank">Ngân hàng</label>
              <input
                id="withdraw-bank"
                required
                minLength={2}
                maxLength={100}
                value={bankName}
                onChange={(e) => setBank(e.target.value)}
                autoComplete="off"
                placeholder="Tên ngân hàng"
              />
              <div className={styles.twoCols}>
                <div>
                  <label htmlFor="withdraw-account">Số tài khoản</label>
                  <input
                    id="withdraw-account"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6,30}"
                    value={accountNumber}
                    onChange={(e) => setAccount(e.target.value)}
                    autoComplete="off"
                    placeholder="Nhập số tài khoản"
                  />
                </div>
                <div>
                  <label htmlFor="withdraw-holder">Tên chủ tài khoản</label>
                  <input
                    id="withdraw-holder"
                    required
                    minLength={2}
                    maxLength={120}
                    value={accountHolder}
                    onChange={(e) => setHolder(e.target.value)}
                    autoComplete="off"
                    placeholder="Họ tên chủ tài khoản"
                  />
                </div>
              </div>
            </div>
          </fieldset>
          {review && (
            <div className={styles.review}>
              <section
                className={styles.reviewTotal}
                aria-label="Số tiền và số dư"
              >
                <p>Số tiền rút</p>
                <strong>{formatVnd(Number(amount))}</strong>
                <dl className={styles.reviewFinancial}>
                  <div>
                    <dt>Phí rút tiền</dt>
                    <dd>0đ</dd>
                  </div>
                  <div>
                    <dt>Khả dụng sau khi gửi</dt>
                    <dd>
                      {formatVnd(Math.max(0, reviewAvailable - Number(amount)))}
                    </dd>
                  </div>
                </dl>
              </section>
              <section
                className={styles.reviewRecipient}
                aria-labelledby="review-recipient-title"
              >
                <h3 id="review-recipient-title">
                  <Landmark size={19} aria-hidden="true" />
                  Thông tin nhận tiền
                </h3>
                <dl className={styles.reviewFacts}>
                  <div>
                    <dt>Ngân hàng</dt>
                    <dd>{bankName}</dd>
                  </div>
                  <div>
                    <dt>Chủ tài khoản</dt>
                    <dd>{accountHolder}</dd>
                  </div>
                  <div className={styles.reviewAccount}>
                    <dt>Số tài khoản</dt>
                    <dd>{accountNumber}</dd>
                  </div>
                </dl>
                <div className={styles.reviewReason}>
                  <h3>Lý do rút tiền</h3>
                  <p>{reason && withdrawalReasons[reason]}</p>
                  {reason === "Other" && reasonDetail && (
                    <p className={styles.hint}>{reasonDetail}</p>
                  )}
                </div>
              </section>
              <p className={styles.reviewNotice}>
                <Info size={18} aria-hidden="true" />
                <span>
                  Khoản tiền này được giữ ngay khi gửi. Nếu bị từ chối, tiền sẽ
                  trở lại số dư khả dụng.
                </span>
              </p>
            </div>
          )}
          {!review && (
            <p className={styles.hint}>
              Tiền chờ duyệt được giữ riêng. Thông tin nhận tiền của đơn đã gửi
              sẽ được giữ nguyên.
            </p>
          )}
          {!enabled && (
            <p role="status">
              Hiện chưa thể tạo yêu cầu rút tiền. Bạn vẫn xem được các yêu cầu
              đã gửi.
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            {review && !uncertain && (
              <button
                className={styles.secondary}
                type="button"
                disabled={busy}
                onClick={() => setReview(false)}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Chỉnh sửa
              </button>
            )}
            <button
              className={styles.primary}
              type="submit"
              disabled={busy || (!enabled && !uncertain)}
            >
              {busy && (
                <LoaderCircle
                  size={18}
                  className={styles.sendingIcon}
                  aria-hidden="true"
                />
              )}
              <span>
                {busy
                  ? "Đang kiểm tra…"
                  : uncertain
                    ? "Kiểm tra lại yêu cầu"
                    : review
                      ? "Xác nhận gửi yêu cầu"
                      : "Tiếp tục"}
              </span>
              {!busy && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </div>
        </form>
      </PurchaseDialog>
      <PurchaseDialog
        open={!!detailId && !open}
        onClose={closeDetail}
        title="Chi tiết rút tiền"
        description="Theo dõi tiến độ và phản hồi xử lý"
        className={styles.dialog}
      >
        {detail.isPending && validId && <p role="status">Đang tải yêu cầu…</p>}
        {(!validId || detail.isError) && (
          <div role="alert">
            <p>Chưa mở được yêu cầu rút tiền hoặc bạn không có quyền xem.</p>
            {validId && (
              <button
                className={styles.secondary}
                onClick={() => void detail.refetch()}
              >
                Thử lại
              </button>
            )}
          </div>
        )}
        {detail.data && !detail.isError && (
          <WithdrawalDetail row={detail.data} />
        )}
      </PurchaseDialog>
    </>
  );
}
function WithdrawalDetail({ row }: { row: Withdrawal }) {
  return (
    <div className={styles.detail}>
      <div className={styles.detailAmount}>
        <span>Rút tiền</span>
        <strong>{formatVnd(row.amount)}</strong>
        <span className={styles.status} data-state={row.state}>
          {withdrawalLabels[row.state]}
        </span>
      </div>
      <dl>
        <div>
          <dt>Mã yêu cầu</dt>
          <dd>{row.id}</dd>
        </div>
        <div>
          <dt>Lý do</dt>
          <dd>
            {withdrawalReasons[row.reason]}
            {row.reasonDetail && ` · ${row.reasonDetail}`}
          </dd>
        </div>
        <div>
          <dt>Nơi nhận</dt>
          <dd>
            {row.recipient.bankName} · {row.recipient.accountNumber}
            <br />
            {row.recipient.accountHolder}
          </dd>
        </div>
        <div>
          <dt>Phí</dt>
          <dd>0đ</dd>
        </div>
      </dl>
      <h3>Tiến độ xử lý</h3>
      <ol className={styles.timeline}>
        {row.history.map((h, i) => (
          <li key={i}>
            <strong>{withdrawalLabels[h.state]}</strong>
            <time dateTime={h.at}>{date(h.at)}</time>
            <p>{h.note}</p>
          </li>
        ))}
      </ol>
      {row.state === "Processing" && (
        <p className={styles.hint}>
          Tiền đang được giữ. Nếu kết quả chưa rõ, hệ thống tiếp tục đối soát
          cùng mã chi; bạn không cần gửi thêm đơn.
        </p>
      )}
    </div>
  );
}
