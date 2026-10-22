import { ApiError } from "@used-books/session-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { buyNowError } from "../lib/buy-now-error";
import { conditions } from "../lib/listing-labels";
import { formatVnd } from "../lib/routes";
import {
  cancelOrder,
  getOrder,
  orderStates,
  orderTime,
  payOrder,
} from "../services/orders";
import { OrderShipping } from "./OrderShipping";
import styles from "./DirectOrders.module.css";

/** One order controller shared by the standalone page and the conversation sheet. */
export function OrderDetails({
  orderId,
  embedded = false,
}: {
  orderId: string;
  embedded?: boolean;
}) {
  const auth = useSession();
  if (auth.status !== "authenticated")
    return (
      <section className={styles.details} aria-label="Chi tiết đơn hàng">
        <h2>Đơn hàng</h2>
        <p role="status">
          {auth.status === "loading"
            ? "Đang kiểm tra đăng nhập…"
            : "Đăng nhập để xem đơn của bạn."}
        </p>
        {auth.status !== "loading" && (
          <Link to={`/login?returnUrl=${encodeURIComponent(`/orders/${orderId}`)}`}>
            Đăng nhập
          </Link>
        )}
      </section>
    );
  return (
    <AuthenticatedOrderDetails
      key={`${auth.user.id}:${orderId}`}
      orderId={orderId}
      ownerId={auth.user.id}
      embedded={embedded}
    />
  );
}

function AuthenticatedOrderDetails({
  orderId,
  ownerId,
  embedded,
}: {
  orderId: string;
  ownerId: string;
  embedded: boolean;
}) {
  const cache = useQueryClient();
  const order = useQuery({
    queryKey: ["direct-order", ownerId, orderId],
    queryFn: () => getOrder(orderId),
    retry: false,
    refetchInterval: 5000,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pendingAction, setPendingAction] = useState<"pay" | "cancel">();
  const attempt = useRef<
    { action: "pay" | "cancel"; key: string; version: number } | undefined
  >(undefined);
  const inaccessible =
    order.error instanceof ApiError &&
    [401, 403, 404].includes(order.error.status);

  async function act(action: "pay" | "cancel") {
    if (busy || !order.data || inaccessible) return;
    const intent = attempt.current ?? {
      action,
      key: crypto.randomUUID(),
      version: order.data.version,
    };
    if (intent.action !== action) return;
    attempt.current = intent;
    setPendingAction(action);
    setBusy(true);
    setError(undefined);
    try {
      await (action === "pay" ? payOrder : cancelOrder)(
        orderId,
        intent.version,
        intent.key,
      );
      attempt.current = undefined;
      setPendingAction(undefined);
      await order.refetch();
      for (const key of [
        "direct-orders",
        "public-listing",
        "home-shelves",
        "catalog-search",
        "exchange-public-listings",
        "wallet",
        "wallet-summary",
        "wallet-history",
        "notifications",
        "purchase-conversation",
        "purchase-conversations",
      ])
        void cache.invalidateQueries({ queryKey: [key] });
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [400, 403, 404, 409, 422, 429].includes(cause.status)
      ) {
        attempt.current = undefined;
        setPendingAction(undefined);
        void order.refetch();
      }
      setError(
        action === "pay" && cause instanceof ApiError && cause.status === 409
          ? "Chưa thể thanh toán. Kiểm tra số dư ví và trạng thái đơn rồi thử lại."
          : buyNowError(cause),
      );
    } finally {
      setBusy(false);
    }
  }

  const className = `${styles.details} ${embedded ? styles.embedded : ""}`;
  if (!order.data || inaccessible)
    return (
      <section className={className} aria-label="Chi tiết đơn hàng">
        <h2>Đơn hàng</h2>
        {order.isPending ? (
          <p role="status">Đang tải đơn…</p>
        ) : (
          <div role="alert" className={styles.error}>
            <p>
              Chưa tải được đơn. Đơn có thể không thuộc tài khoản này hoặc kết
              nối đang gián đoạn.
            </p>
            <button
              type="button"
              disabled={order.isFetching}
              onClick={() => void order.refetch()}
            >
              Thử lại
            </button>
          </div>
        )}
      </section>
    );
  const o = order.data;
  const condition = conditions[o.item.condition as keyof typeof conditions];
  const paymentSummary = (
    <aside className={styles.summary} aria-label="Thanh toán đơn hàng">
      <h3>Thanh toán</h3>
      <dl>
        <div><dt>Tiền sách</dt><dd>{formatVnd(o.amounts.bookPrice)}</dd></div>
        <div><dt>Phí giao hàng</dt><dd>{formatVnd(o.amounts.shippingFee)}</dd></div>
        <div className={styles.total}>
          <dt>Tổng thanh toán</dt><dd>{formatVnd(o.amounts.buyerTotal)}</dd>
        </div>
      </dl>
      {o.paidAt ? (
        <p>
          Đã thanh toán lúc {orderTime(o.paidAt)}. Khoản đang giữ:{" "}
          <strong>{formatVnd(o.moneyHeld)}</strong>.
        </p>
      ) : <p>Đơn này chưa trừ tiền từ ví.</p>}
      {(o.paymentEnabled || pendingAction === "pay") && (
        <button
          type="button"
          className={styles.primary}
          disabled={busy || pendingAction === "cancel"}
          onClick={() => void act("pay")}
        >
          {busy
            ? "Đang xác nhận…"
            : pendingAction === "pay"
              ? "Thử lại cùng thanh toán"
              : `Thanh toán ${formatVnd(o.amounts.buyerTotal)}`}
        </button>
      )}
      {(o.canCancel || pendingAction === "cancel") && (
        <button
          type="button"
          className={styles.secondary}
          disabled={busy || pendingAction === "pay"}
          onClick={() => void act("cancel")}
        >
          {busy && pendingAction === "cancel"
            ? "Đang hủy đơn…"
            : pendingAction === "cancel"
              ? "Thử lại hủy đơn"
              : "Hủy đơn chưa thanh toán"}
        </button>
      )}
      {o.role === "Buyer" && !o.paidAt && (
        <p>
          <Link to="/wallet">Mở ví để kiểm tra số dư / nạp tiền</Link>. Sau
          đó quay lại đơn này để thanh toán trong thời hạn.
        </p>
      )}
      <p className={styles.note}>
        Tiền và vận chuyển đang mô phỏng. Tiền được giữ cho đơn; đăng ký vận
        đơn chưa xác nhận đã bàn giao sách.
      </p>
    </aside>
  );
  return (
    <section className={className} aria-label="Chi tiết đơn hàng">
      <header className={styles.detailsHeading}>
        <h2>{o.purchaseMode === "BuyNow" ? "Đơn Mua ngay" : "Đơn mua sách"}</h2>
        <p className={styles.status} role="status">
          {orderStates[o.state] ?? "Đang cập nhật trạng thái"}
        </p>
        <p className={styles.orderMeta}>
          Mã đơn: <span>{o.id}</span>
          <br />
          Đặt lúc {orderTime(o.createdAt)} · {o.role === "Buyer" ? "Bạn mua" : "Bạn bán"}
        </p>
      </header>
      {order.isError && (
        <p role="alert" className={styles.error}>
          Chưa cập nhật được trạng thái mới.{" "}
          <button
            type="button"
            disabled={order.isFetching}
            onClick={() => void order.refetch()}
          >
            Thử lại
          </button>
        </p>
      )}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.columns}>
        {embedded && paymentSummary}
        <div>
          <section className={styles.section}>
            <h3>{o.item.metadata.title}</h3>
            {condition && <p>Tình trạng: {condition}</p>}
            <p>{o.item.coverNote}</p>
            <p>{o.item.pages}</p>
            <p>{o.item.description}</p>
            <Link to={`/books/${o.item.listingId}`}>Xem bài đăng</Link>
          </section>
          <section className={styles.section}>
            <h3>{o.role === "Buyer" ? "Địa chỉ nhận sách" : "Nơi gửi của bạn"}</h3>
            <p>
              {o.ownAddress.recipientName} · {o.ownAddress.phone}
              <br />
              {o.ownAddress.detail}
            </p>
          </section>
          {o.state === "AwaitingPayment" && (
            <section className={styles.section}>
              <h3>Cuốn sách đang được giữ cho đơn</h3>
              <p>
                Thanh toán trước <strong>{orderTime(o.paymentDeadline)}</strong>.
                Hết hạn, đơn chưa thanh toán sẽ được hủy và cuốn sách được mở bán lại.
              </p>
              <p>Đồng hồ và trạng thái được kiểm tra tại máy chủ khi bạn thanh toán.</p>
            </section>
          )}
          {o.preparation && (
            <section className={styles.section}>
              <h3>{o.role === "Seller" ? "Chuẩn bị và bàn giao sách" : "Theo dõi gửi sách"}</h3>
              <p>
                Hạn bàn giao vận chuyển:{" "}
                <strong>{orderTime(o.preparation.pickupDeadline)}</strong>.
              </p>
              <p>
                Quá hạn sẽ chuyển sang xác minh; tiền và sách tiếp tục được giữ
                trong lúc xử lý.
              </p>
              {o.shippingAddress && (
                <p>
                  Gửi đến: {o.shippingAddress.recipientName} · {o.shippingAddress.phone}
                  <br />
                  {o.shippingAddress.detail}
                </p>
              )}
              <OrderShipping key={o.id} order={o} onChange={() => void order.refetch()} />
            </section>
          )}
          {o.state === "Preparing" && o.role === "Buyer" && (
            <p>
              Đặt mua thành công. Người bán đang chuẩn bị gửi; bạn không cần xác
              nhận thêm qua chat.
            </p>
          )}
          {o.state === "InTransit" && (
            <p>Đơn đang được vận chuyển. Theo dõi thông tin vận đơn bên trên.</p>
          )}
        </div>
        {!embedded && paymentSummary}
      </div>
    </section>
  );
}
