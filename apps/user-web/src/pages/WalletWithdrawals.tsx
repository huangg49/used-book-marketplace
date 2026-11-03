import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useBlocker, useSearchParams } from "react-router-dom";
import {
  ArrowUpFromLine,
  CheckCircle2,
  ChevronRight,
  Clock3,
} from "lucide-react";
import {
  ApiError,
  withdrawalLabels,
  withdrawalReasons,
  withdrawalSchema,
  withdrawalPageSchema,
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
  const list = useInfiniteQuery({
    queryKey: ["withdrawals", ownerId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      session.request(
        `/me/withdrawals?limit=10${pageParam ? `&cursor=${pageParam}` : ""}`,
        withdrawalPageSchema,
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    refetchInterval: document.visibilityState === "visible" ? 15000 : false,
  });
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
  }, [client, ownerId, list.dataUpdatedAt, detail.data?.version]);
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
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const select = (id: string) => {
    void client.invalidateQueries({queryKey:["withdrawal",ownerId,id]});
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
      <section className={styles.section} aria-labelledby="withdrawals-title">
        <header className={styles.sectionHead}>
          <div>
            <h2 id="withdrawals-title">Yêu cầu rút tiền</h2>
            <p>Từ lúc gửi đơn đến khi tiền được xử lý.</p>
          </div>
          <ArrowUpFromLine size={22} aria-hidden="true" />
        </header>
        {list.isPending && <p role="status">Đang tải yêu cầu rút…</p>}
        {list.isError && (
          <div role="alert">
            <p>Chưa tải được yêu cầu rút tiền.</p>
            <button
              className={styles.secondary}
              disabled={list.isFetching}
              onClick={() => void list.refetch()}
            >
              Thử lại
            </button>
          </div>
        )}
        {!list.isPending && !list.isError && !rows.length && (
          <p className={styles.empty}>
            Chưa có yêu cầu rút tiền. Khi cần, chọn “Rút tiền” ở thẻ Ví.
          </p>
        )}
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id}>
              <button className={styles.row} onClick={() => select(row.id)}>
                <span className={styles.rowIcon}>
                  {row.state === "Completed" ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <Clock3 size={20} />
                  )}
                </span>
                <span className={styles.rowText}>
                  <strong>Rút tiền · {formatVnd(row.amount)}</strong>
                  <small>{date(row.createdAt)}</small>
                </span>
                <span className={styles.status} data-state={row.state}>
                  {withdrawalLabels[row.state]}
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {list.hasNextPage && (
          <button
            className={styles.secondary}
            disabled={list.isFetching}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchNextPageError ? "Thử tải thêm" : "Xem thêm yêu cầu"}
          </button>
        )}
      </section>
      <PurchaseDialog
        open={open}
        onClose={onClose}
        title={review ? "Xác nhận rút tiền" : "Rút tiền từ ví"}
        description="Phí 0đ · Admin duyệt từng yêu cầu"
        busy={busy}
        className={styles.dialog}
      >
        <form onSubmit={submit} className={styles.form}>
          <div className={styles.balance}>
            <span>Số dư khả dụng</span>
            <strong>{formatVnd(available)}</strong>
          </div>
          <fieldset disabled={busy || uncertain || review}>
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
                placeholder="Tối thiểu 50.000"
              />
              <span>VND</span>
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
              <>
                <label htmlFor="withdraw-reason-detail">Mô tả lý do</label>
                <textarea
                  id="withdraw-reason-detail"
                  required
                  maxLength={500}
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  rows={3}
                />
              </>
            )}
            <h3>Thông tin nhận tiền</h3>
            <label htmlFor="withdraw-bank">Ngân hàng</label>
            <input
              id="withdraw-bank"
              required
              minLength={2}
              maxLength={100}
              value={bankName}
              onChange={(e) => setBank(e.target.value)}
              autoComplete="off"
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
                />
              </div>
            </div>
          </fieldset>
          {review && (
            <div className={styles.review}>
              <div>
                <span>Số tiền nhận</span>
                <strong>{formatVnd(Number(amount))}</strong>
              </div>
              <div>
                <span>Khả dụng sau khi gửi</span>
                <strong>
                  {formatVnd(Math.max(0, available - Number(amount)))}
                </strong>
              </div>
              <p>
                Khoản tiền này được giữ ngay khi gửi. Nếu bị từ chối, tiền sẽ
                trở lại số dư khả dụng.
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
                Chỉnh sửa
              </button>
            )}
            <button
              className={styles.primary}
              type="submit"
              disabled={busy || (!enabled && !uncertain)}
            >
              {busy
                ? "Đang kiểm tra…"
                : uncertain
                  ? "Kiểm tra lại yêu cầu"
                  : review
                    ? "Xác nhận gửi yêu cầu"
                    : "Tiếp tục"}
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
