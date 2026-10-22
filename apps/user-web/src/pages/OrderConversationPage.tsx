import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { getOrder, openOrderConversation } from "../services/orders";
import { OrderDetails } from "./OrderDetails";
import styles from "./ChatPage.module.css";

export function OrderConversationPage() {
  const { orderId = "" } = useParams<{ orderId: string }>();
  const auth = useSession();
  if (auth.status !== "authenticated")
    return (
      <section className={styles.guest}>
        <h1>Đơn hàng và hội thoại</h1>
        <p>{auth.status === "loading" ? "Đang kiểm tra đăng nhập…" : "Đăng nhập để xem đơn và trò chuyện với đối tác."}</p>
        {auth.status !== "loading" && (
          <Link to={`/login?returnUrl=${encodeURIComponent(`/chat/orders/${orderId}`)}`}>
            Đăng nhập
          </Link>
        )}
      </section>
    );
  return <OpenOrderRoom key={`${auth.user.id}:${orderId}`} orderId={orderId} ownerId={auth.user.id} active={auth.user.status === "ACTIVE"} />;
}

function OpenOrderRoom({ orderId, ownerId, active }: { orderId: string; ownerId: string; active: boolean }) {
  const cache = useQueryClient();
  const order = useQuery({
    queryKey: ["direct-order", ownerId, orderId],
    queryFn: () => getOrder(orderId),
    retry: false,
  });
  const attempt = useRef<string | undefined>(undefined);
  const started = useRef(false);
  const opening = useMutation({
    mutationFn: () => {
      attempt.current ??= crypto.randomUUID();
      return openOrderConversation(orderId, attempt.current);
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["direct-order", ownerId, orderId] });
      void cache.invalidateQueries({ queryKey: ["purchase-conversations", ownerId] });
    },
    retry: false,
  });
  const { mutate: open } = opening;
  const shouldOpen = active && order.isSuccess && !order.data.conversationId;
  useEffect(() => {
    if (!shouldOpen || started.current) return;
    started.current = true;
    open();
  }, [shouldOpen, open]);
  const roomId = order.data?.conversationId ?? opening.data?.entityId;
  if (active && roomId && !order.isError)
    return <Navigate replace to={`/chat/${roomId}`} state={{ chatFromOrders: true }} />;
  return (
    <section className={styles.root} data-room-selected="true">
      <Link className={styles.back} to="/orders">Đơn hàng của tôi</Link>
      <h1>Đơn hàng và hội thoại</h1>
      {!active ? (
        <p role="status">Tài khoản hiện chưa thể mở hội thoại. Bạn vẫn có thể xem và xử lý đơn theo quyền hiện có.</p>
      ) : order.isError || opening.isError ? (
        <div className={styles.pendingRoom} role="alert">
          <p>Chưa mở được hội thoại của đơn này. Kiểm tra kết nối rồi thử lại.</p>
          <button type="button" disabled={order.isFetching || opening.isPending} onClick={() => {
            if (order.isError) void order.refetch();
            else open();
          }}>
            {order.isFetching || opening.isPending ? "Đang thử lại…" : "Thử mở hội thoại"}
          </button>
        </div>
      ) : (
        <p role="status">Đang mở thông tin đơn và hội thoại…</p>
      )}
      {!active && <OrderDetails orderId={orderId} embedded />}
    </section>
  );
}
