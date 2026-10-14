import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "@used-books/session-client";
import { useSession } from "../hooks/useSession";
import {
  createVNPayTopup,
  queryVNPayTopup,
  getTopups,
  getWalletSummary,
} from "../services/wallet";
import { formatVnd } from "../lib/routes";
import styles from "./WalletPage.module.css";
import { paymentChannel } from "../lib/payment-return";

const labels = {
  Pending: "Chờ thanh toán",
  Processing: "Đang xử lý",
  Succeeded: "Đã nạp ví",
  Failed: "Thanh toán không thành công",
  ReviewRequired: "Cần đối soát",
};
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
    queryFn: () => queryVNPayTopup(id!),
    enabled: !!ownerId && !!id && !paymentOpen,
    refetchInterval: (q) =>
      document.visibilityState === "visible" &&
      ["Pending", "Processing"].includes(q.state.data?.state ?? "")
        ? 3000
        : false,
  });
  const [amount, setAmount] = useState("100000");
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
    if (!ownerId || !id || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(paymentChannel(id));
    channel.onmessage = (event: MessageEvent) => {
      if (event.data?.type !== "payment-returned" || event.data?.id !== id)
        return;
      channel.postMessage({ type: "wallet-ready", id });
      setPaymentOpen(false);
      window.focus();
      void client.invalidateQueries({ queryKey: ["topup", ownerId, id] });
    };
    return () => channel.close();
  }, [ownerId, id, client]);
  useEffect(() => {
    // Provider query is display-only; fetch the owner-checked server state.
    if (params.has("vnp_TxnRef"))
      navigate(id ? `/wallet?topup=${id}` : "/wallet", { replace: true });
  }, [params, id, navigate]);
  useEffect(() => {
    if (result.data?.credited) {
      void client.invalidateQueries({ queryKey: ["wallet-summary", ownerId] });
      void client.invalidateQueries({ queryKey: ["topups", ownerId] });
      if (intent.current?.id === id) {
        intent.current = null;
        setHasIntent(false);
      }
    }
  }, [result.data?.credited, client, ownerId, id]);
  if (!ownerId)
    return (
      <section className={styles.page}>
        <h1>Ví của bạn</h1>
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
      setError("Nhập số tiền từ 5.000đ đến 10.000.000đ.");
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
      navigate(`/wallet?topup=${response.entityId}`);
      if (!checkoutWindow.closed) checkoutWindow.location.replace(url.href);
      else setPaymentOpen(false);
      setBusy(false);
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
      <Link to="/account">← Về tài khoản</Link>
      <h1>Ví của bạn</h1>
      <p>Ví mô phỏng đồ án · Thanh toán thử qua VNPay sandbox.</p>
      {paymentOpen && (
        <p role="status">
          Hoàn tất thanh toán trong tab VNPay. Tab ví này sẽ cập nhật khi bạn
          quay lại.
        </p>
      )}
      {summary.isPending ? (
        <p role="status">Đang tải số dư…</p>
      ) : summary.data ? (
        <dl className={styles.balances}>
          <div>
            <dt>Số dư khả dụng</dt>
            <dd>{formatVnd(summary.data.available)}</dd>
          </div>
          <div>
            <dt>Đang giữ cho đơn và bài chờ duyệt</dt>
            <dd>{formatVnd(summary.data.transactionHeld)}</dd>
          </div>
        </dl>
      ) : (
        <p role="alert">
          Chưa tải được số dư.{" "}
          <button onClick={() => void summary.refetch()}>Thử lại</button>
        </p>
      )}
      {summary.isError && summary.data && (
        <p role="alert">
          Số dư chưa cập nhật.{" "}
          <button onClick={() => void summary.refetch()}>Tải lại</button>
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
                {!result.data.credited &&
                  ["Pending", "Processing"].includes(result.data.state) && (
                    <p>
                      Chưa có xác nhận nạp ví. Máy chủ sẽ kiểm tra lại kết quả
                      với VNPay; bạn không cần tạo yêu cầu nạp mới.
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
      <form onSubmit={submit} className={styles.form}>
        <h2>Nạp ví qua VNPay sandbox</h2>
        <label htmlFor="topup-amount">Số tiền nạp (đồng)</label>
        <input
          id="topup-amount"
          type="text"
          inputMode="numeric"
          value={amount}
          disabled={busy || hasIntent}
          onChange={(e) => setAmount(e.target.value)}
          aria-describedby="topup-range"
        />
        <p id="topup-range">
          Từ 5.000đ đến 10.000.000đ. Tiền chỉ vào ví sau khi thanh toán được xác
          nhận.
        </p>
        <p>
          VNPay mở trong tab mới. Giữ tab ví này để xem số dư sau thanh toán.
          Yêu cầu nạp được lưu trong lịch sử ví.
        </p>
        {error && <p role="alert">{error}</p>}
        <button
          type="submit"
          disabled={busy || paymentOpen || !summary.data?.vnpayEnabled}
        >
          {busy
            ? "Đang mở VNPay…"
            : paymentOpen
              ? "Đang thanh toán ở tab VNPay…"
              : error && hasIntent
                ? "Thử lại yêu cầu nạp"
                : hasIntent
                  ? "Tiếp tục thanh toán"
                  : "Nạp qua VNPay sandbox"}
        </button>
        {summary.data?.vnpayEnabled === false && (
          <p>Nạp VNPay sandbox chưa khả dụng cho tài khoản này.</p>
        )}
      </form>
      <h2>Yêu cầu nạp gần đây</h2>
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
              <Link to={`/wallet?topup=${item.id}`}>
                {formatVnd(item.amount)} · {labels[item.state]}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
