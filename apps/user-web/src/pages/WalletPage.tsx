import { WalletWithdrawals } from "./WalletWithdrawals";
import { PendingWithdrawalNotice } from "./PendingWithdrawalNotice";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Wallet,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
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
import frame from "./WalletFrame.module.css";
import { paymentChannel } from "../lib/payment-return";
import { invalidateMemberWalletViews } from "../lib/wallet-cache";
import { WalletHistory } from "./WalletHistory";

const labels: Record<string, string> = {
  Pending: "Chờ thanh toán",
  Processing: "Đang xử lý",
  Succeeded: "Đã nạp ví thành công",
  Failed: "Thanh toán không thành công",
  Cancelled: "Đã hết hạn / Đã hủy",
  ReviewRequired: "Cần đối soát",
};

const PRESET_AMOUNTS = [50000, 100000, 200000, 500000, 1000000];
const amountError = "Nhập số tiền hợp lệ từ 5.000đ đến 9.999.999.999đ.";

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
  const [copied, setCopied] = useState(false);
  const paymentWindow = useRef<Window | null>(null);
  const alive = useRef(true);

  const handleCopyCard = () => {
    void navigator.clipboard?.writeText("9704198526191432198");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  // Keep tracking the popup if the wallet URL switches to another intent.
  // When both point to the same intent, the result query does the polling.
  const separateCheckoutId = checkoutId === id ? undefined : checkoutId;
  const checkout = useQuery({
    queryKey: ["topup", ownerId, separateCheckoutId],
    queryFn: () =>
      paymentOpen ? getTopup(separateCheckoutId!) : queryVNPayTopup(separateCheckoutId!),
    enabled: !!ownerId && !!separateCheckoutId,
    refetchInterval: (q) =>
      document.visibilityState === "visible" &&
      ["Pending", "Processing"].includes(q.state.data?.state ?? "")
        ? 3000
        : false,
  });

  const checkoutData = checkoutId === id ? result.data : checkout.data;
  const currentCheckout =
    checkoutData?.id === checkoutId ? checkoutData : undefined;
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
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (!paymentOpen) return;
    const check = window.setInterval(() => {
      if (paymentWindow.current?.closed) {
        paymentWindow.current = null;
        setPaymentOpen(false);
      }
    }, 500);
    return () => window.clearInterval(check);
  }, [paymentOpen]);

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
      // The mode-change effect reconciles after the observer switches to QueryDR.
      // A late return after the popup already closed still needs a fresh check.
      if (!paymentOpen) {
        void client.invalidateQueries({
          queryKey: ["topup", ownerId, trackedId],
          exact: true,
        }, { cancelRefetch: false });
      }
    };
    return () => channel.close();
  }, [ownerId, checkoutId, id, client, paymentOpen]);

  useEffect(() => {
    if (params.has("vnp_TxnRef"))
      navigate(id ? `/wallet?topup=${id}` : "/wallet", { replace: true });
  }, [params, id, navigate]);

  useEffect(() => {
    if (resultState && !["Pending", "Processing"].includes(resultState)) {
      void client.invalidateQueries({ queryKey: ["topups", ownerId] });
    }
    if (credited) {
      invalidateMemberWalletViews(client, ownerId);
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
    paymentWindow.current = null;
    setPaymentOpen(false);
    intent.current = null;
    setHasIntent(false);
    setCheckoutId(undefined);
    if (checkoutId !== id) {
      void client.invalidateQueries({ queryKey: ["topups", ownerId] });
      if (checkoutCredited) {
        invalidateMemberWalletViews(client, ownerId);
      }
    }
  }, [checkoutId, checkoutState, checkoutCredited, client, ownerId, id]);

  useEffect(() => {
    if (
      !separateCheckoutId ||
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
          queryKey: ["topup", ownerId, separateCheckoutId],
        });
      },
      Math.max(0, until) + 100,
    );
    return () => window.clearTimeout(timeout);
  }, [
    separateCheckoutId,
    checkoutState,
    checkoutExpiresAt,
    checkoutServerTime,
    client,
    ownerId,
  ]);

  useEffect(() => {
    if (!awaitingPayment || !expiresAt || !serverTime) return;
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
    if (ownerId && id && !paymentOpen) {
      void client.invalidateQueries({ queryKey: ["topup", ownerId, id] });
    }
  }, [paymentOpen, ownerId, id, client]);

  useEffect(() => {
    if (ownerId && separateCheckoutId && !paymentOpen) {
      void client.invalidateQueries({
        queryKey: ["topup", ownerId, separateCheckoutId],
      });
    }
  }, [paymentOpen, ownerId, separateCheckoutId, client]);

  if (!ownerId) {
    return (
      <section className={frame.page}>
        <div className={styles.emptyCard}>
          <div className={styles.emptyIconWrap}>
            <Wallet size={32} />
          </div>
          <h1 className={styles.emptyTitle}>Ví của tôi</h1>
          <p className={styles.emptySubtitle}>
            Đăng nhập tài khoản bạn đọc để nạp tiền và theo dõi số dư ký quỹ.
          </p>
          <Link
            to={`/login?returnUrl=${encodeURIComponent(id ? `/wallet?topup=${id}` : "/wallet")}`}
            className={styles.btnEmptyTopup}
          >
            Đăng nhập ngay
          </Link>
        </div>
      </section>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || paymentOpen) return;
    const value = Number(amount);
    if (!/^\d+$/.test(amount) || value < 5000 || value > 9_999_999_999) {
      setError(amountError);
      amountInput.current?.focus();
      return;
    }
    const checkoutWindow = window.open("about:blank", "_blank");
    if (!checkoutWindow) {
      setError(
        "Trình duyệt đã chặn mở tab thanh toán. Vui lòng cho phép mở popup và thử lại.",
      );
      return;
    }
    checkoutWindow.opener = null;
    checkoutWindow.document.title = "Đang chuyển hướng sang VNPay";
    checkoutWindow.document.body.textContent =
      "Đang chuẩn bị kết nối tới cổng thanh toán VNPay Sandbox…";
    paymentWindow.current = checkoutWindow;
    setPaymentOpen(true);

    const pinned = intent.current ?? {
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

      const current = await getTopup(response.entityId);
      if (!alive.current) {
        checkoutWindow.close();
        return;
      }
      client.setQueryData(["topup", ownerId, response.entityId], current);
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
      } else if (!checkoutWindow.closed) {
        checkoutWindow.location.replace(url.href);
      } else {
        setPaymentOpen(false);
      }
    } catch (err: unknown) {
      if (alive.current) {
        checkoutWindow.close();
        paymentWindow.current = null;
        setPaymentOpen(false);
        setError(
          err instanceof Error
            ? err.message
            : "Chưa thể kết nối tới cổng thanh toán VNPay lúc này.",
        );
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const trackingState = result.data?.state;
  const isTrackingPending =
    awaitingPayment || (paymentOpen && !result.data?.credited);
  const isTrackingSuccess = trackingState === "Succeeded";
  const isTrackingError =
    trackingState === "Failed" || trackingState === "Cancelled";

  // Financial figures
  const availableVal = summary.data?.available ?? 0;
  const heldVal = summary.data?.transactionHeld ?? 0;
  const withdrawalHeld = summary.data?.withdrawalHeld ?? 0;

  return (
    <section className={frame.page}>
      <header className={styles.pageHeader}>
        <div className={styles.titleCol}>
          <h1 className={styles.pageTitle}>Ví & Ký Quỹ Thư Quán</h1>
          <p className={styles.pageSubtitle}>
            Quản lý số dư, theo dõi tiền cọc giữ sách và nạp tiền an toàn qua VNPay Sandbox.
          </p>
        </div>

        <div className={styles.vnpayHeaderBadge}>
          <img
            src="/brand/vnpay-icon.webp"
            alt="VNPay"
            className={styles.vnpayHeaderIconImg}
          />
          <span className={styles.vnpayLogoMark}>
            <span className={styles.vnRed}>VN</span>
            <span className={styles.payBlue}>PAY</span>
          </span>
          <span className={styles.vnpayBadgeSep}>|</span>
          <span>Sandbox 2.0 Gateway</span>
          <span className={styles.envDot} aria-hidden="true" />
        </div>
      </header>

      <PendingWithdrawalNotice key={ownerId} ownerId={ownerId} />

      {/* =====================================================================
          2-Column Split Layout (Dual-Panel Pass & Digital Receipt)
          ===================================================================== */}
      <div className={styles.splitLayout}>
        {/* ===================================================================
            Left Column: Pocket Pass & Actions & Guarantee
            =================================================================== */}
        <aside className={styles.leftCol}>
          {/* Physical Member Wallet Card (1.586 : 1 Ratio) */}
          <div
            className={styles.passCard}
            role="region"
            aria-label="Thẻ ví thành viên Lật Lại liên kết VNPay"
          >
            {/* Subtle animated sheen reflection */}
            <div className={styles.passCardSheen} aria-hidden="true" />

            {/* Subtle VNPay watermark in the background */}
            <div className={styles.cardWatermark} aria-hidden="true">
              <img
                src="/brand/vnpay-icon.webp"
                alt=""
                className={styles.watermarkImg}
              />
            </div>

            {/* Card Top Row: Chip + NFC & Co-Brand */}
            <div className={styles.cardTopRow}>
              <div className={styles.chipNfcGroup}>
                <div className={styles.chipGraphic} aria-hidden="true">
                  <div className={styles.chipLineH} />
                  <div className={styles.chipLineV} />
                  <div className={styles.chipInnerBox} />
                </div>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  className={styles.nfcGraphic}
                  aria-hidden="true"
                >
                  <path d="M8.5 16.5a5 5 0 0 1 0-9" />
                  <path d="M12 19a8.5 8.5 0 0 1 0-14" />
                  <path d="M15.5 21.5a12 12 0 0 1 0-19" />
                </svg>
              </div>

              <div className={styles.cardBrandBadge}>
                <div className={styles.cardBrandCol}>
                  <span className={styles.cardBrandName}>LẬT LẠI</span>
                  <span className={styles.cardBrandSub}>Ví thành viên</span>
                </div>
                <div className={styles.vnpayCardLogoWrap}>
                  <img
                    src="/brand/vnpay-qr-logo.webp"
                    alt="VNPay"
                    className={styles.vnpayCardLogoImg}
                  />
                </div>
              </div>
            </div>

            {/* Card Middle: Available Balance */}
            <div className={styles.cardMiddleSec}>
              <div className={styles.cardLabelTiny}>
                <span>Số dư khả dụng</span>
                <span className={styles.cardCurrencyTag}>VND</span>
              </div>

              <div className={styles.cardAvailableValue}>
                {summary.isPending
                  ? "Đang tải…"
                  : summary.isError
                    ? "—"
                    : formatVnd(availableVal)}
              </div>
            </div>

            {/* Card Bottom Row: Owner & Escrow */}
            <div className={styles.cardBottomRow}>
              <div className={styles.cardOwnerInfo}>
                <span className={styles.cardOwnerLabel}>Chủ tài khoản</span>
                <span className={styles.cardOwnerName}>
                  {auth.status === "authenticated"
                    ? auth.user.displayName || auth.user.email
                    : "Bạn đọc"}
                </span>
              </div>

              <div className={styles.cardHeldInfo}>
                <span className={styles.cardOwnerLabel}>Đang ký quỹ</span>
                <span className={styles.cardHeldValue}>
                  {summary.isPending
                    ? "Đang tải…"
                    : summary.isError
                      ? "—"
                      : formatVnd(heldVal)}
                  {!summary.isPending && !summary.isError && withdrawalHeld > 0 && <small style={{display:"block"}}>Chờ rút: {formatVnd(withdrawalHeld)}</small>}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Bar under card */}
          {summary.isError && (
            <p id="wallet-summary-error" className={styles.alertBox} role="alert">
              Chưa tải được số dư ví và tiền ký quỹ. Hãy làm mới để thử lại.
            </p>
          )}
          <div className={styles.passActionsBar}>
            <button
              type="button"
              className={styles.btnPrimaryTopup}
              onClick={() => setDialog("topup")}
            >
              <ArrowDownToLine size={18} aria-hidden="true" />
              <span>Nạp tiền VNPay</span>
            </button>

            <button
              type="button"
              className={styles.btnSecondaryWithdraw}
              onClick={() => setDialog("withdrawal")}
            >
              <ArrowUpFromLine size={17} aria-hidden="true" />
              <span>Rút tiền</span>

            </button>

            <button
              type="button"
              className={styles.btnMiniRefresh}
              title="Làm mới số dư ví"
              aria-label="Làm mới số dư ví"
              aria-describedby={summary.isError ? "wallet-summary-error" : undefined}
              disabled={summary.isFetching}
              onClick={() => {
                void summary.refetch();
                void client.invalidateQueries({
                  queryKey: ["wallet-history", ownerId],
                });
              }}
            >
              <RefreshCw
                size={18}
                className={summary.isFetching ? styles.spinIcon : ""}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* VNPay Sandbox Demonstration Testing Card */}
          <div
            className={styles.vnpayTestCard}
            role="region"
            aria-label="Thông tin thẻ ATM kiểm thử VNPay Sandbox"
          >
            <div className={styles.testCardTop}>
              <div className={styles.vnpayBrandGroup}>
                <img
                  src="/brand/vnpay-icon.webp"
                  alt="VNPay"
                  className={styles.testCardIconImg}
                />
                <span className={styles.testCardBrandText}>
                  <strong>VNPAY</strong> SANDBOX 2.0
                </span>
              </div>
              <span className={styles.liveIndicator}>
                <span className={styles.liveDot} aria-hidden="true" />
                <span>Trực tuyến (Live IPN)</span>
              </span>
            </div>

            <div className={styles.testCardNumberRow}>
              <div className={styles.numberCol}>
                <span className={styles.testFieldLabel}>
                  Thẻ ATM test mô phỏng (Ngân hàng NCB)
                </span>
                <code className={styles.testCardNumber}>
                  9704 1985 2619 1432 198
                </code>
              </div>
              <button
                type="button"
                className={styles.btnCopySimple}
                onClick={handleCopyCard}
                title="Sao chép số thẻ để kiểm thử"
              >
                {copied ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
                <span>{copied ? "Đã chép" : "Sao chép"}</span>
              </button>
            </div>

            <div className={styles.testCardMeta}>
              <span>
                Chủ thẻ: <strong>NGUYEN VAN A</strong>
              </span>
              <span>
                Phát hành: <strong>07/15</strong>
              </span>
              <span>
                Mã OTP: <strong>123456</strong>
              </span>
            </div>
          </div>

          {/* Live Payment Tracking Card (when a topup is pending / completed) */}
          {id && result.data && (
            <div
              className={`${styles.trackingCard} ${
                isTrackingPending
                  ? styles.trackingPending
                  : isTrackingSuccess
                    ? styles.trackingSuccess
                    : styles.trackingError
              }`}
              role="status"
              aria-live="polite"
            >
              <div className={styles.trackingCardTop}>
                <h3 className={styles.trackingTitle}>
                  {isTrackingPending && (
                    <Clock
                      size={18}
                      className={styles.trackingIconPending}
                      aria-hidden="true"
                    />
                  )}
                  {isTrackingSuccess && (
                    <CheckCircle2
                      size={18}
                      className={styles.trackingIconSuccess}
                      aria-hidden="true"
                    />
                  )}
                  {isTrackingError && (
                    <AlertCircle
                      size={18}
                      className={styles.trackingIconError}
                      aria-hidden="true"
                    />
                  )}
                  <span>{labels[result.data.state] || result.data.state}</span>
                </h3>

                <span className={styles.trackingAmount}>
                  {formatVnd(result.data.amount)}
                </span>
              </div>

              {awaitingPayment && result.data.expiresAt && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={styles.countdownBadge}>
                    <Clock size={12} aria-hidden="true" />
                    <span>
                      {remaining > 0
                        ? `Còn ${formatRemaining(remaining)}`
                        : "Đang kiểm tra kết quả hết hạn…"}
                    </span>
                  </span>
                  <span className={styles.trackingMessage}>
                    Vui lòng hoàn tất trong tab VNPay đang mở.
                  </span>
                </div>
              )}

              {isTrackingSuccess && (
                <p className={styles.trackingMessage}>
                  Số tiền đã được ghi có vào số dư khả dụng. Bạn có thể sử dụng ngay để mua sách hoặc đặt cọc trao đổi.
                </p>
              )}

              {result.data.state === "Cancelled" && (
                <p className={styles.trackingMessage}>
                  Phiên nạp tiền đã hết hạn (5 phút). Bạn có thể bấm "Nạp tiền vào ví" để thử lại.
                </p>
              )}

              {result.data.state === "ReviewRequired" && (
                <p className={styles.trackingMessage}>
                  Giao dịch cần được nhân viên đối soát. Mã tham chiếu: <strong>{id}</strong>.
                </p>
              )}
            </div>
          )}

          {paymentOpen && !awaitingPayment && (
            <div
              className={`${styles.trackingCard} ${styles.trackingPending}`}
              role="status"
            >
              <div className={styles.trackingCardTop}>
                <h3 className={styles.trackingTitle}>
                  <Clock
                    size={18}
                    className={styles.trackingIconPending}
                    aria-hidden="true"
                  />
                  <span>Đang mở cổng VNPay…</span>
                </h3>
              </div>
              <p className={styles.trackingMessage}>
                Vui lòng hoàn tất trong tab thanh toán vừa mở. Số dư sẽ được cập nhật tự động ngay khi hoàn tất.
              </p>
            </div>
          )}
        </aside>

        {/* ===================================================================
            Right Column: The Continuous Digital Receipt Slip & History
            =================================================================== */}
        <main className={styles.rightCol}>
          <WalletHistory
            ownerId={ownerId}
            onOpenTopup={() => setDialog("topup")}
          />
          <WalletWithdrawals key={ownerId} ownerId={ownerId} available={availableVal} enabled={!!summary.data?.withdrawalsEnabled && !summary.isError} open={dialog === 'withdrawal'} onClose={() => setDialog(null)} onResume={() => setDialog("withdrawal")} />
        </main>
      </div>

      {/* =====================================================================
          Dialog Nạp Tiền (VNPay Sandbox)
          ===================================================================== */}
      <PurchaseDialog
        open={dialog === "topup"}
        onClose={() => setDialog(null)}
        title="Nạp tiền vào ví"
        description="Mô phỏng nạp tiền qua cổng thanh toán VNPay Sandbox an toàn."
        busy={busy}
        className={styles.dialog}
      >
        <form onSubmit={submit} className={styles.dialogForm}>
          {/* Preset Chips */}
          <div className={styles.inputGroup}>
            <span className={styles.inputLabel}>Chọn nhanh số tiền nạp:</span>
            <div
              className={styles.presetsGrid}
              role="group"
              aria-label="Mệnh giá chọn nhanh"
            >
              {PRESET_AMOUNTS.map((val) => {
                const isSelected = amount === String(val);
                return (
                  <button
                    key={val}
                    type="button"
                    className={`${styles.presetChip} ${
                      isSelected ? styles.presetChipActive : ""
                    }`}
                    onClick={() => {
                      setAmount(String(val));
                      setError(undefined);
                    }}
                  >
                    {formatVnd(val)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Input */}
          <div className={styles.inputGroup}>
            <label htmlFor="topup-amount" className={styles.inputLabel}>
              Hoặc nhập số tiền tùy chọn:
            </label>
            <div className={styles.inputContainer}>
              <input
                id="topup-amount"
                ref={amountInput}
                type="text"
                inputMode="numeric"
                value={amount}
                disabled={busy || hasIntent}
                className={styles.customAmountInput}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/\D/g, ""));
                  setError(undefined);
                }}
                aria-describedby="topup-range"
              />
              <span className={styles.currencySuffix} aria-hidden="true">
                ₫
              </span>
            </div>
            <p
              id="topup-range"
              style={{
                fontSize: "0.8125rem",
                color: "var(--shop-muted, #716157)",
                margin: "4px 0 0",
              }}
            >
              Tối thiểu <strong>5.000₫</strong> và tối đa <strong>9.999.999.999₫</strong> cho mỗi lần nạp.
            </p>
          </div>

          {/* VNPay Info & Trust Box */}
          <div className={styles.vnpayTrustBox}>
            <Sparkles
              size={18}
              style={{ flexShrink: 0, marginTop: 2 }}
              aria-hidden="true"
            />
            <div>
              <strong>Cổng VNPay Sandbox Mô Phỏng</strong>
              <div style={{ marginTop: 2 }}>
                Giao dịch được chuyển hướng an toàn sang VNPay. Bạn có 5 phút để thao tác; tiền sẽ lập tức vào ví sau khi cổng thanh toán xác nhận thành công.
              </div>
            </div>
          </div>

          {error && (
            <div className={styles.alertBox} role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className={styles.btnDialogSubmit}
            disabled={
              busy ||
              paymentOpen ||
              !summary.data?.vnpayEnabled ||
              summary.isError
            }
          >
            {busy ? (
              <>
                <RefreshCw size={18} className={styles.spinIcon} />
                <span>Đang kết nối tới VNPay…</span>
              </>
            ) : paymentOpen ? (
              <span>Đang mở tab thanh toán VNPay…</span>
            ) : (
              <>
                <span>Tiếp tục thanh toán</span>
                <ExternalLink size={17} />
              </>
            )}
          </button>
        </form>

        {/* Recent topups */}
        {history.data && history.data.items.length > 0 && (
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px dashed var(--shop-line, #d9cbbd)",
            }}
          >
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: 700,
                color: "var(--shop-ink, #281914)",
              }}
            >
              Các yêu cầu nạp gần đây:
            </span>
            <ul className={styles.recentTopupsList}>
              {history.data.items.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/wallet?topup=${item.id}`}
                    className={styles.recentTopupLink}
                    onClick={() => setDialog(null)}
                  >
                    <span>{formatVnd(item.amount)}</span>
                    <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>
                      {labels[item.state] || item.state}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PurchaseDialog>


    </section>
  );
}
