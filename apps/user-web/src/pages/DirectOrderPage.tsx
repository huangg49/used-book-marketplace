import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { listOrders, orderStates, orderTime } from "../services/orders";
import { OrderDetails } from "./OrderDetails";
import styles from "./DirectOrders.module.css";

export function DirectOrderPage() {
  const { orderId = "" } = useParams<{ orderId: string }>();
  return (
    <section className={styles.page} aria-labelledby="order-title">
      <Link className={styles.back} to="/orders">
        ← Đơn hàng của tôi
      </Link>
      <h1 id="order-title">Đơn hàng</h1>
      <OrderDetails orderId={orderId} />
    </section>
  );
}

export function DirectOrderListPage() {
  const auth = useSession();
  const pages = useInfiniteQuery({
    queryKey: ["direct-orders", auth.status === "authenticated" ? auth.user.id : undefined],
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
                <Link to={`/chat/orders/${o.id}`}>Xem đơn {o.id.slice(0, 8)}</Link>
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
