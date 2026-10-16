import { ApiError } from "@used-books/session-client";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { formatVnd } from "../lib/routes";
import {
  cancelOrder,
  getOrder,
  listOrders,
  orderStates,
  orderTime,
  payOrder,
} from "../services/orders";
import { buyNowError } from "../lib/buy-now-error";
import { OrderShipping } from "./OrderShipping";
import styles from "./DirectOrders.module.css";

export function DirectOrderPage() {
  const { orderId = "" } = useParams<{ orderId: string }>();
  const auth = useSession();
  const cache = useQueryClient();
  const order = useQuery({
    queryKey: ["direct-order", orderId],
    queryFn: () => getOrder(orderId),
    enabled: auth.status === "authenticated",
    retry: false,
    refetchInterval: 5000,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pendingAction, setPendingAction] = useState<"pay" | "cancel">();
  const attempt = useRef<
    { action: "pay" | "cancel"; key: string; version: number } | undefined
  >(undefined);
  async function act(action: "pay" | "cancel") {
    if (busy || !order.data) return;
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
      void cache.invalidateQueries({ queryKey: ["direct-orders"] });
      void cache.invalidateQueries({ queryKey: ["public-listing"] });
      void cache.invalidateQueries({ queryKey: ["wallet"] });
      void cache.invalidateQueries({ queryKey: ["notifications"] });
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [400, 403, 404, 409, 422, 429].includes(cause.status)
      ) {
        attempt.current = undefined;
        setPendingAction(undefined);
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
  if (auth.status !== "authenticated")
    return (
      <section className={styles.page}>
        <h1>Đơn hàng</h1>
        <p>
          {auth.status === "loading"
            ? "Đang kiểm tra đăng nhập…"
            : "Đăng nhập để xem đơn của bạn."}
        </p>
        <Link
          to={`/login?returnUrl=${encodeURIComponent(`/orders/${orderId}`)}`}
        >
          Đăng nhập
        </Link>
      </section>
    );
  if (!order.data)
    return (
      <section className={styles.page}>
        <Link to="/orders">Đơn hàng của tôi</Link>
        <h1>Đơn hàng</h1>
        {order.isPending ? (
          <p role="status">Đang tải đơn…</p>
        ) : (
          <div role="alert">
            <p>
              Chưa tải được đơn. Đơn có thể không thuộc tài khoản này hoặc kết
              nối đang gián đoạn.
            </p>
            <button onClick={() => void order.refetch()}>Thử lại</button>
          </div>
        )}
      </section>
    );
  const o = order.data;
  return (
    <section className={styles.page} aria-labelledby="order-title">
      <Link className={styles.back} to="/orders">
        ← Đơn hàng của tôi
      </Link>
      <h1 id="order-title">
        {o.purchaseMode === "BuyNow" ? "Đơn Mua ngay" : "Đơn mua sách"}
      </h1>
      <p className={styles.status} role="status">
        {orderStates[o.state] ?? "Đang cập nhật trạng thái"}
      </p>
      {order.isError && (
        <p role="alert" className={styles.error}>
          Chưa cập nhật được trạng thái mới.{" "}
          <button onClick={() => void order.refetch()}>Thử lại</button>
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.columns}>
        <div>
          <section className={styles.section}>
            <h2>{o.item.metadata.title}</h2>
            <p>{o.item.coverNote}</p>
            <p>{o.item.pages}</p>
            <p>{o.item.description}</p>
            <Link to={`/books/${o.item.listingId}`}>Xem bài đăng</Link>
          </section>
          <section className={styles.section}>
            <h2>
              {o.role === "Buyer" ? "Địa chỉ nhận sách" : "Nơi gửi của bạn"}
            </h2>
            <p>
              {o.ownAddress.recipientName} · {o.ownAddress.phone}
              <br />
              {o.ownAddress.detail}
            </p>
          </section>
          {o.state === "AwaitingPayment" && (
            <section className={styles.section}>
              <h2>Cuốn sách đang được giữ cho đơn</h2>
              <p>
                Thanh toán trước <strong>{orderTime(o.paymentDeadline)}</strong>
                . Hết hạn, đơn chưa thanh toán sẽ được hủy và cuốn sách được mở
                bán lại.
              </p>
              <p>
                Đồng hồ và trạng thái được kiểm tra tại máy chủ khi bạn thanh
                toán.
              </p>
            </section>
          )}
          {o.preparation && (
            <section className={styles.section}>
              <h2>
                {o.role === "Seller"
                  ? "Chuẩn bị và bàn giao sách"
                  : "Theo dõi gửi sách"}
              </h2>
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
                  Gửi đến: {o.shippingAddress.recipientName} ·{" "}
                  {o.shippingAddress.phone}
                  <br />
                  {o.shippingAddress.detail}
                </p>
              )}
              <OrderShipping
                key={o.id}
                order={o}
                onChange={() => void order.refetch()}
              />
            </section>
          )}
          {o.state === "Preparing" && o.role === "Buyer" && (
            <p>
              Đặt mua thành công. Người bán đang chuẩn bị gửi; bạn không cần xác
              nhận thêm qua chat.
            </p>
          )}
          {o.state === "InTransit" && (
            <p>
              Đơn đang được vận chuyển. Theo dõi thông tin vận đơn bên trên.
            </p>
          )}
        </div>
        <aside className={styles.summary}>
          <h2>Thanh toán</h2>
          <dl>
            <div>
              <dt>Tiền sách</dt>
              <dd>{formatVnd(o.amounts.bookPrice)}</dd>
            </div>
            <div>
              <dt>Phí giao hàng</dt>
              <dd>{formatVnd(o.amounts.shippingFee)}</dd>
            </div>
            <div className={styles.total}>
              <dt>Tổng thanh toán</dt>
              <dd>{formatVnd(o.amounts.buyerTotal)}</dd>
            </div>
          </dl>
          {o.paidAt ? (
            <p>
              Đã thanh toán lúc {orderTime(o.paidAt)}. Khoản đang giữ:{" "}
              <strong>{formatVnd(o.moneyHeld)}</strong>.
            </p>
          ) : (
            <p>Đơn này chưa trừ tiền từ ví.</p>
          )}
          {(o.paymentEnabled || pendingAction === "pay") && (
            <button
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
          {o.canCancel && (
            <button
              className={styles.secondary}
              disabled={busy || pendingAction === "pay"}
              onClick={() => void act("cancel")}
            >
              {pendingAction === "cancel"
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
      </div>
    </section>
  );
}

export function DirectOrderListPage() {
  const auth = useSession();
  const pages = useInfiniteQuery({
    queryKey: ["direct-orders"],
    queryFn: ({ pageParam }) => listOrders(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: auth.status === "authenticated",
    retry: false,
  });
  return (
    <section className={styles.page}>
      <h1>Đơn hàng của tôi</h1>
      <p className={styles.intro}>
        Đơn mua và đơn bán của bạn, gồm Mua ngay và thương lượng.
      </p>
      {auth.status !== "authenticated" ? (
        <Link to="/login?returnUrl=%2Forders">Đăng nhập để xem đơn</Link>
      ) : (
        <>
          {pages.isPending && <p role="status">Đang tải đơn…</p>}
          {pages.isError && (
            <p role="alert" className={styles.error}>
              Chưa tải được danh sách đơn.{" "}
              <button onClick={() => void pages.refetch()}>Thử lại</button>
            </p>
          )}
          {pages.data?.pages[0]?.items.length === 0 && (
            <p>
              Bạn chưa có đơn hàng. <Link to="/books">Tìm sách để mua</Link>.
            </p>
          )}
          {pages.data?.pages
            .flatMap((p) => p.items)
            .map((o) => (
              <article className={styles.row} key={o.id}>
                <div>
                  <p>
                    {o.role === "Buyer" ? "Bạn mua" : "Bạn bán"} ·{" "}
                    {orderTime(o.createdAt)}
                  </p>
                  {o.title && <h2>{o.title}</h2>}
                  <p className={styles.status}>
                    {orderStates[o.state] ?? "Đang cập nhật"}
                  </p>
                </div>
                <Link to={`/orders/${o.id}`}>Xem đơn {o.id.slice(0, 8)}</Link>
              </article>
            ))}
          {pages.hasNextPage && (
            <button
              className={styles.secondary}
              disabled={pages.isFetchingNextPage}
              onClick={() => void pages.fetchNextPage()}
            >
              Xem thêm đơn
            </button>
          )}
        </>
      )}
    </section>
  );
}
