import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "@used-books/session-client";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { useCountdown, formatRemaining } from "../hooks/useAuctionClock";
import { PurchaseDialog } from "../components/PurchaseDialog";
import {
  createVNPayTopup,
  getTopup,
  queryVNPayTopup,
  getTopups,
  getWalletSummary,
} from "../services/wallet";
import { formatVnd } from "../lib/routes";
import styles from "./WalletPage.module.css";
import { paymentChannel } from "../lib/payment-return";
import { WalletHistory } from "./WalletHistory";

const labels = {
  Pending: "Chờ thanh toán",
  Processing: "Đang xử lý",
  Succeeded: "Đã nạp ví",
  Failed: "Thanh toán không thành công",
  Cancelled: "Đã hủy",
  ReviewRequired: "Cần đối soát",
};
const amountError = "Nhập số tiền từ 5.000đ đến 10.000.000đ.";
export function WalletPage() {
  const auth = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const rawId = params.get("topup") ?? params.get("vnp_TxnRef");
  const id =
    rawId && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(rawId)
      ? rawId
      : undefined;
  const ownerId = auth.status === "authenticated" ? auth.user.id : undefined;
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [checkoutId, setCheckoutId] = useState<string>();
  const [dialog, setDialog] = useState<"topup" | "withdrawal" | null>(null);
  const [withdrawalAmount, setWithdrawalAmount] = useState("50000");
  const paymentWindow = useRef<Window | null>(null);
  const alive = useRef(true);
  const summary = useQuery({
    queryKey: ["wallet-summary", ownerId],
    queryFn: getWalletSummary,
    enabled: !!ownerId,
  });
  const history = useQuery({
    queryKey: ["topups", ownerId],
    queryFn: getTopups,
    enabled: !!ownerId,
  });
  const result = useQuery({
    queryKey: ["topup", ownerId, id],
    queryFn: () => (paymentOpen ? getTopup(id!) : queryVNPayTopup(id!)),
    enabled: !!ownerId && !!id,
    refetchInterval: (q) =>
      document.visibilityState === "visible" &&
      ["Pending", "Processing"].includes(q.state.data?.state ?? "")
        ? 3000
        : false,
  });
  // Viewing an older request must not stop tracking the checkout we opened.
  const checkout = useQuery({
    queryKey: ["wallet-checkout", ownerId, checkoutId],
    queryFn: () =>
      paymentOpen ? getTopup(checkoutId!) : queryVNPayTopup(checkoutId!),
    enabled: !!ownerId && !!checkoutId,
    refetchInterval: (q) =>
      document.visibilityState === "visible" &&
      ["Pending", "Processing"].includes(q.state.data?.state ?? "")
        ? 3000
        : false,
  });
  const currentCheckout =
    checkout.data?.id === checkoutId ? checkout.data : undefined;
  const checkoutState = currentCheckout?.state;
  const checkoutCredited = currentCheckout?.credited;
  const checkoutExpiresAt = currentCheckout?.expiresAt;
  const checkoutServerTime = currentCheckout?.serverTime;
  const resultState = result.data?.state;
  const credited = result.data?.credited;
  const expiresAt = result.data?.expiresAt;
  const serverTime = result.data?.serverTime;
  const awaitingPayment =
    !!resultState && ["Pending", "Processing"].includes(resultState);
  const remaining = useCountdown(
    awaitingPayment ? (expiresAt ?? undefined) : undefined,
    serverTime,
  );
  const [amount, setAmount] = useState("100000");
  const amountInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [hasIntent, setHasIntent] = useState(false);
  const intent = useRef<{ amount: number; key: string; id?: string } | null>(
    null,
  );
  useEffect(() => {
    alive.current = true;
    const check = window.setInterval(() => {
      if (paymentWindow.current?.closed) {
        paymentWindow.current = null;
        setPaymentOpen(false);
      }
    }, 500);
    return () => {
      alive.current = false;
      window.clearInterval(check);
    };
  }, []);
  useEffect(() => {
    const trackedId = checkoutId ?? id;
    if (!ownerId || !trackedId || typeof BroadcastChannel === "undefined")
      return;
    const channel = new BroadcastChannel(paymentChannel(trackedId));
    channel.onmessage = (event: MessageEvent) => {
      if (
        event.data?.type !== "payment-returned" ||
        event.data?.id !== trackedId
      )
        return;
      channel.postMessage({ type: "wallet-ready", id: trackedId });
      setPaymentOpen(false);
      window.focus();
      void client.invalidateQueries({
        queryKey: ["topup", ownerId, trackedId],
      });
      void client.invalidateQueries({
        queryKey: ["wallet-checkout", ownerId, trackedId],
      });
    };
    return () => channel.close();
  }, [ownerId, checkoutId, id, client]);
  useEffect(() => {
    // Provider query is display-only; fetch the owner-checked server state.
    if (params.has("vnp_TxnRef"))
      navigate(id ? `/wallet?topup=${id}` : "/wallet", { replace: true });
  }, [params, id, navigate]);
  useEffect(() => {
    if (resultState && !["Pending", "Processing"].includes(resultState)) {
      void client.invalidateQueries({ queryKey: ["topups", ownerId] });
    }
    if (credited) {
      void client.invalidateQueries({ queryKey: ["wallet-summary", ownerId] });
      void client.invalidateQueries({ queryKey: ["wallet-history", ownerId] });
    }
  }, [resultState, credited, client, ownerId, id]);
  useEffect(() => {
    if (
      !checkoutId ||
      intent.current?.id !== checkoutId ||
      !checkoutState ||
      ["Pending", "Processing"].includes(checkoutState)
    )
      return;
    // VNPay owns its separate tab. Release this confirmed checkout locally;
    // an external tab with no opener cannot reliably be closed by its creator.
    paymentWindow.current = null;
    // oxlint-disable-next-line react/set-state-in-effect -- Sync the owned checkout after server confirmation.
    setPaymentOpen(false);
    intent.current = null;
    setHasIntent(false);
    setCheckoutId(undefined);
    void client.invalidateQueries({ queryKey: ["topups", ownerId] });
    if (checkoutCredited) {
      void client.invalidateQueries({ queryKey: ["wallet-summary", ownerId] });
      void client.invalidateQueries({ queryKey: ["wallet-history", ownerId] });
    }
  }, [checkoutId, checkoutState, checkoutCredited, client, ownerId]);
  useEffect(() => {
    if (
      !checkoutId ||
      !checkoutState ||
      !["Pending", "Processing"].includes(checkoutState) ||
      !checkoutExpiresAt ||
      !checkoutServerTime
    )
      return;
    const until =
      Date.parse(checkoutExpiresAt) - Date.parse(checkoutServerTime);
    const timeout = window.setTimeout(
      () => {
        void client.invalidateQueries({
          queryKey: ["wallet-checkout", ownerId, checkoutId],
        });
      },
      Math.max(0, until) + 100,
    );
    return () => window.clearTimeout(timeout);
  }, [
    checkoutId,
    checkoutState,
    checkoutExpiresAt,
    checkoutServerTime,
    client,
    ownerId,
  ]);
  useEffect(() => {
    if (!awaitingPayment || !expiresAt || !serverTime) return;
    // The server clock owns the deadline. Re-read at expiry even with VNPay
    // still open; only the confirmed response may mark the request cancelled.
    const until = Date.parse(expiresAt) - Date.parse(serverTime);
    const timeout = window.setTimeout(
      () => {
        void client.invalidateQueries({ queryKey: ["topup", ownerId, id] });
      },
      Math.max(0, until) + 100,
    );
    return () => window.clearTimeout(timeout);
  }, [awaitingPayment, expiresAt, serverTime, client, ownerId, id]);
  useEffect(() => {
    if (ownerId && !paymentOpen) {
      if (id)
        void client.invalidateQueries({ queryKey: ["topup", ownerId, id] });
      if (checkoutId)
        void client.invalidateQueries({
          queryKey: ["wallet-checkout", ownerId, checkoutId],
        });
    }
  }, [paymentOpen, ownerId, id, checkoutId, client]);
  if (!ownerId)
    return (
      <section className={styles.page}>
        <h1>Ví của tôi</h1>
        <p>Đăng nhập để nạp và kiểm tra ví.</p>
        <Link
          to={`/login?returnUrl=${encodeURIComponent(id ? `/wallet?topup=${id}` : "/wallet")}`}
        >
          Đăng nhập
        </Link>
      </section>
    );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || paymentOpen) return;
    const value = Number(amount);
    if (!/^\d+$/.test(amount) || value < 5000 || value > 10000000) {
      setError(amountError);
      amountInput.current?.focus();
      return;
    }
    // Reserve the new tab during the click, before the asynchronous API call.
    // The external provider never receives a reference to the wallet tab.
    const checkoutWindow = window.open("about:blank", "_blank");
    if (!checkoutWindow) {
      setError(
        "Trình duyệt đã chặn tab thanh toán. Cho phép mở tab mới rồi thử lại.",
      );
      return;
    }
    checkoutWindow.opener = null;
    checkoutWindow.document.title = "Đang mở VNPay";
    checkoutWindow.document.body.textContent =
      "Đang chuẩn bị thanh toán VNPay…";
    paymentWindow.current = checkoutWindow;
    setPaymentOpen(true);
    const pinned: { amount: number; key: string; id?: string } =
      intent.current ?? {
        amount: value,
        key: crypto.randomUUID(),
      };
    intent.current = pinned;
    setHasIntent(true);
    setBusy(true);
    setError(undefined);
    try {
      const response = await createVNPayTopup(pinned.amount, pinned.key);
      if (!alive.current) {
        checkoutWindow.close();
        return;
      }
      const url = new URL(response.paymentUrl);
      if (
        url.origin !== "https://sandbox.vnpayment.vn" ||
        url.pathname !== "/paymentv2/vpcpay.html"
      )
        throw new Error("Invalid payment destination");
      intent.current = { ...pinned, id: response.entityId };
      // A lost-response retry replays the original receipt and deadline.
      // Check current state before reopening a checkout that may have expired.
      const current = await getTopup(response.entityId);
      if (!alive.current) {
        checkoutWindow.close();
        return;
      }
      client.setQueryData(["topup", ownerId, response.entityId], current);
      client.setQueryData(
        ["wallet-checkout", ownerId, response.entityId],
        current,
      );
      setCheckoutId(response.entityId);
      void client.invalidateQueries({ queryKey: ["topups", ownerId] });
      navigate(`/wallet?topup=${response.entityId}`);
      if (!["Pending", "Processing"].includes(current.state)) {
        checkoutWindow.close();
        paymentWindow.current = null;
        setPaymentOpen(false);
        intent.current = null;
        setHasIntent(false);
        setCheckoutId(undefined);
      } else if (!checkoutWindow.closed)
        checkoutWindow.location.replace(url.href);
      else setPaymentOpen(false);
      setBusy(false);
      setDialog(null);
    } catch (cause) {
      checkoutWindow.close();
      paymentWindow.current = null;
      if (!alive.current) return;
      setPaymentOpen(false);
      if (
        cause instanceof ApiError &&
        [400, 401, 403, 409, 422].includes(cause.status)
      ) {
        intent.current = null;
        setHasIntent(false);
      }
      setError(
        cause instanceof ApiError && cause.status === 403
          ? "Tài khoản hiện chưa được phép nạp ví."
          : cause instanceof ApiError && cause.status === 503
            ? "Nạp ví đang chưa khả dụng. Hãy thử lại sau."
            : "Chưa xác nhận được yêu cầu nạp. Bấm thử lại để tiếp tục cùng yêu cầu.",
      );
      setBusy(false);
    }
  }
  return (
    <section className={styles.page}>
      <h1>Ví của tôi</h1>
      <div className={styles.actions} role="group" aria-label="Thao tác ví">
        <button
          type="button"
          className={styles.primary}
          aria-haspopup="dialog"
          onClick={() => setDialog("topup")}
        >
          <ArrowDownToLine size={20} aria-hidden="true" />
          Nạp tiền
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setDialog("withdrawal")}
        >
          <ArrowUpFromLine size={20} aria-hidden="true" />
          Rút tiền
        </button>
      </div>
      {paymentOpen && !awaitingPayment && (
        <p role="status">
          Hoàn tất thanh toán trong tab VNPay. Tab ví này sẽ cập nhật khi bạn
          quay lại.
        </p>
      )}
      {id && (
        <div className={styles.result} aria-live="polite">
          <h2>Kết quả nạp ví</h2>
          {result.isPending ? (
            <p>Đang kiểm tra kết quả từ máy chủ…</p>
          ) : result.isError ? (
            <p>
              Chưa xác minh được yêu cầu nạp này.{" "}
              <button onClick={() => void result.refetch()}>
                Kiểm tra lại
              </button>
            </p>
          ) : (
            result.data && (
              <>
                <p>
                  {labels[result.data.state]} · {formatVnd(result.data.amount)}
                </p>
                {awaitingPayment && result.data.expiresAt && (
                  <>
                    <p className={styles.countdown}>
                      {remaining > 0 ? (
                        <>
                          Còn{" "}
                          <span
                            role="timer"
                            aria-label="Thời gian thanh toán còn lại"
                          >
                            {formatRemaining(remaining)}
                          </span>{" "}
                          để thanh toán
                        </>
                      ) : (
                        "Đang kiểm tra yêu cầu hết hạn…"
                      )}
                    </p>
                    <p>Yêu cầu tự hủy sau 5 phút nếu chưa thanh toán.</p>
                  </>
                )}
                {!result.data.credited &&
                  ["Pending", "Processing"].includes(result.data.state) && (
                    <p>
                      {paymentOpen
                        ? "Hoàn tất thanh toán trong tab VNPay. Ví sẽ tự cập nhật kết quả."
                        : "Chưa có xác nhận nạp ví. Ví sẽ kiểm tra lại kết quả thanh toán."}
                    </p>
                  )}
                {result.data.state === "Cancelled" && (
                  <p>
                    Đã hết 5 phút thanh toán. Bạn có thể tạo yêu cầu nạp mới.
                  </p>
                )}
                {result.data.state === "ReviewRequired" && (
                  <p>
                    Yêu cầu cần đối soát. Giữ mã yêu cầu {id} để được hỗ trợ.
                  </p>
                )}
              </>
            )
          )}
        </div>
      )}
      <WalletHistory ownerId={ownerId} />
      <PurchaseDialog
        open={dialog === "topup"}
        onClose={() => setDialog(null)}
        title="Nạp tiền"
        description="Nạp ví mô phỏng qua VNPay sandbox."
        busy={busy}
        className={styles.dialog}
      >
        <form onSubmit={submit} className={styles.form}>
          <label htmlFor="topup-amount">Số tiền nạp (đồng)</label>
          <input
            id="topup-amount"
            ref={amountInput}
            type="text"
            inputMode="numeric"
            value={amount}
            disabled={busy || hasIntent}
            onChange={(e) => setAmount(e.target.value)}
            aria-describedby={`topup-range${error ? " topup-error" : ""}`}
            aria-invalid={error === amountError}
          />
          <p id="topup-range">
            Từ <strong>5.000đ</strong> đến <strong>10.000.000đ</strong> mỗi lần
            nạp.
          </p>
          <p>
            VNPay mở trong tab mới. Tiền chỉ vào ví sau khi thanh toán được xác
            nhận. Bạn có 5 phút để thanh toán; hết thời gian, yêu cầu tự hủy.
          </p>
          {summary.isPending && (
            <p role="status">Đang kiểm tra khả năng nạp ví…</p>
          )}
          {summary.isError && (
            <p role="alert">
              Chưa cập nhật được thông tin ví.{" "}
              <button
                type="button"
                disabled={summary.isFetching}
                onClick={() => void summary.refetch()}
              >
                Thử lại
              </button>
            </p>
          )}
          {error && (
            <p id="topup-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className={styles.primary}
            disabled={
              busy ||
              paymentOpen ||
              !summary.data?.vnpayEnabled ||
              summary.isError
            }
          >
            {busy
              ? "Đang mở VNPay…"
              : paymentOpen
                ? "Đang thanh toán ở tab VNPay…"
                : error && hasIntent
                  ? "Thử lại yêu cầu nạp"
                  : hasIntent
                    ? "Tiếp tục thanh toán"
                    : "Tiếp tục thanh toán"}
          </button>
          {summary.data?.vnpayEnabled === false && (
            <p>Nạp VNPay sandbox chưa khả dụng cho tài khoản này.</p>
          )}
        </form>
        <section
          className={styles.recent}
          aria-labelledby="recent-topups-heading"
        >
          <h3 id="recent-topups-heading">Yêu cầu nạp gần đây</h3>
          {history.isPending ? (
            <p>Đang tải…</p>
          ) : history.isError ? (
            <p role="alert">
              Chưa tải được lịch sử.{" "}
              <button onClick={() => void history.refetch()}>Thử lại</button>
            </p>
          ) : !history.data?.items.length ? (
            <p>Chưa có yêu cầu nạp ví.</p>
          ) : (
            <ul className={styles.history}>
              {history.data.items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/wallet?topup=${item.id}`}
                    onClick={() => setDialog(null)}
                  >
                    {formatVnd(item.amount)} · {labels[item.state]}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PurchaseDialog>
      <PurchaseDialog
        open={dialog === "withdrawal"}
        onClose={() => setDialog(null)}
        title="Rút tiền"
        description="Rút tiền từ số dư khả dụng trong ví mô phỏng."
        className={styles.dialog}
      >
        <div className={styles.form}>
          <label htmlFor="withdrawal-amount">Số tiền rút (đồng)</label>
          <input
            id="withdrawal-amount"
            type="text"
            inputMode="numeric"
            value={withdrawalAmount}
            onChange={(event) => setWithdrawalAmount(event.target.value)}
            aria-describedby="withdrawal-range withdrawal-note"
          />
          <p id="withdrawal-range">
            Tối thiểu <strong>50.000đ</strong> mỗi lần rút. Số tiền rút không
            vượt số dư khả dụng.
          </p>
          <p id="withdrawal-note" className={styles.previewNote}>
            Chức năng rút tiền sẽ được bổ sung sau. Hiện bạn chưa thể gửi yêu
            cầu rút tiền.
          </p>
          <button
            type="button"
            className={styles.primary}
            disabled
            aria-describedby="withdrawal-note"
          >
            Gửi yêu cầu rút
          </button>
        </div>
      </PurchaseDialog>
    </section>
  );
}
