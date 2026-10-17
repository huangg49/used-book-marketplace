import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { ApiError } from "@used-books/session-client";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, MessageCircle, Send } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { session } from "../lib/session";
import {
  getPurchaseConversations,
  getPurchaseMessages,
  purchaseMessageSchema,
  type PurchaseMessage,
  type PurchaseConversation,
} from "../services/purchase-conversations";
import { getPublicListing } from "../services/public-listings";
import { createSellerOrder } from "../services/purchase-conversations";
import { getOrderForPayment, payOrder } from "../services/orders";
import { formatVnd } from "../lib/routes";
import { ListingPhoto } from "../components/BookCard";
import { PurchaseDialog } from "../components/PurchaseDialog";
import flow from "./PurchaseFlow.module.css";
import styles from "./ChatPage.module.css";

const configuredBase =
  import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:3000/api/v1";
const socketUrl = configuredBase.startsWith("/")
  ? window.location.origin
  : configuredBase.replace(/\/api\/v1\/?$/, "");
const statusLabels = {
  Active: "Đang thương lượng",
  Expired: "Đã hết hạn",
  Cancelled: "Đã hủy",
  OrderCreated: "Đã tạo đơn",
};
function dateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ChatRoom({
  room,
  userId,
  refreshRooms,
}: {
  room: PurchaseConversation;
  userId: string;
  refreshRooms: () => void;
}) {
  const other = room.buyer.id === userId ? room.seller : room.buyer;
  const cache = useQueryClient();
  const history = useQuery({
    queryKey: ["purchase-messages", room.id],
    queryFn: () => getPurchaseMessages(room.id),
  });
  const book = useQuery({
    queryKey: ["public-listing", room.listingId],
    queryFn: () => getPublicListing(room.listingId),
  });
  const order = useQuery({
    queryKey: ["purchase-order", room.orderId],
    queryFn: () => getOrderForPayment(room.orderId!),
    enabled: !!room.orderId && room.buyer.id === userId,
    refetchInterval: 3000,
  });
  const [live, setLive] = useState<PurchaseMessage[]>([]);
  const [body, setBody] = useState("");
  const [connection, setConnection] = useState<
    "connecting" | "online" | "offline"
  >("connecting");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [agreedPrice, setAgreedPrice] = useState<string | null>(null);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState<string>();
  const orderAttempt = useRef<
    { key: string; version: number; price: number } | undefined
  >(undefined);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string>();
  const payAttempt = useRef<{ key: string; version: number } | undefined>(
    undefined,
  );
  const [attempt, setAttempt] = useState<{
    messageId: string;
    conversationId: string;
    body: string;
  }>();
  const socketRef = useRef<Socket | null>(null);
  const attemptRef = useRef<typeof attempt>(undefined);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const active =
    room.status === "Active" &&
    (!room.expiresAt || Date.now() < Date.parse(room.expiresAt));
  const [expired, setExpired] = useState(!active);
  useEffect(() => {
    if (!active || !room.expiresAt) return;
    const timer = window.setTimeout(
      () => setExpired(true),
      Math.min(
        2147483647,
        Math.max(0, Date.parse(room.expiresAt!) - Date.now()),
      ),
    );
    return () => window.clearTimeout(timer);
  }, [active, room.expiresAt]);
  useEffect(() => {
    const socket = io(`${socketUrl}/purchase-chat`, {
      auth: (callback) => callback({ token: session.getAccessToken() }),
    });
    socketRef.current = socket;
    let disposed = false;
    const receive = (raw: unknown) => {
      const parsed = purchaseMessageSchema.safeParse(raw);
      if (!parsed.success || parsed.data.conversationId !== room.id || disposed)
        return;
      setLive((current) =>
        current.some((m) => m.id === parsed.data.id)
          ? current
          : [...current, parsed.data],
      );
      if (attemptRef.current?.messageId === parsed.data.id) {
        attemptRef.current = undefined;
        setAttempt(undefined);
        setBody("");
        setSending(false);
        setError(undefined);
      }
    };
    socket.on("connect", () => {
      socket
        .timeout(15000)
        .emit(
          "purchase:join",
          room.id,
          (failure: unknown, reply: { ok?: boolean }) => {
            if (disposed) return;
            if (failure || !reply?.ok) {
              setConnection("offline");
              setError("Chưa mở được cuộc trò chuyện. Thử kết nối lại.");
            } else {
              setConnection("online");
              void history.refetch();
            }
          },
        );
    });
    socket.on("purchase:message", receive);
    socket.on("connect_error", () => {
      if (!disposed) setConnection("offline");
    });
    socket.on("disconnect", () => {
      if (!disposed) setConnection("offline");
    });
    return () => {
      disposed = true;
      socketRef.current = null;
      socket.disconnect();
    };
    // Room component is keyed by id; query refetch remains bound to this room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);
  const messages = [
    ...new Map(
      [...(history.data ?? []), ...live].map((m) => [m.id, m]),
    ).values(),
  ].sort(
    (a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
  );
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({
      block: "nearest",
      behavior: "instant",
    });
  }, [messages.length]);
  function send() {
    const socket = socketRef.current;
    if (sending || expired || !socket || connection !== "online") return;
    const text = body.trim();
    if (!text || text.length > 1000) return;
    const command = attemptRef.current ?? {
      messageId: crypto.randomUUID(),
      conversationId: room.id,
      body: text,
    };
    attemptRef.current = command;
    setAttempt(command);
    setSending(true);
    setError(undefined);
    socket
      .timeout(15000)
      .emit("purchase:send", command, (failure: unknown, reply: unknown) => {
        if (
          socketRef.current !== socket ||
          attemptRef.current?.messageId !== command.messageId
        )
          return;
        setSending(false);
        const parsed = purchaseMessageSchema.safeParse(reply);
        if (
          failure ||
          !parsed.success ||
          parsed.data.id !== command.messageId ||
          parsed.data.conversationId !== room.id
        ) {
          setError(
            "Chưa xác nhận được tin nhắn đã gửi. Thử lại sẽ gửi cùng tin này.",
          );
          return;
        }
        setLive((current) =>
          current.some((m) => m.id === parsed.data.id)
            ? current
            : [...current, parsed.data],
        );
        attemptRef.current = undefined;
        setAttempt(undefined);
        setBody("");
        setError(undefined);
      });
  }
  return (
    <section
      className={styles.room}
      aria-label={`Cuộc trò chuyện với ${other.displayName}`}
    >
      <header className={styles.roomHeader}>
        <Link className={styles.back} to="/chat">
          <ArrowLeft size={18} aria-hidden="true" />
          Hội thoại
        </Link>
        <h2>{other.displayName}</h2>
        <p>
          {statusLabels[room.status]}
          {room.expiresAt && (
            <>
              {" "}
              · Hạn giữ:{" "}
              <time dateTime={room.expiresAt}>{dateTime(room.expiresAt)}</time>
            </>
          )}
        </p>
      </header>
      <div className={styles.context}>
        {book.data ? (
          <>
            <div className={styles.cover}>
              <ListingPhoto book={book.data} />
            </div>
            <div>
              <Link to={`/books/${room.listingId}`}>
                {book.data.book.title}
              </Link>
              <p>{book.data.book.authors.join(", ")}</p>
            </div>
          </>
        ) : (
          <>
            <BookOpen size={24} aria-hidden="true" />
            <p>
              {book.isLoading
                ? "Đang tải thông tin sách…"
                : "Thông tin bài đăng hiện không khả dụng. Bạn vẫn có thể đọc hội thoại."}
            </p>
          </>
        )}
      </div>
      {active && room.buyer.id === userId && book.data?.fulfillment && (
        <aside className={styles.connection} aria-label="Bước tiếp theo">
          <span>
            Gửi địa chỉ và phí giao nhận để người bán xem xét. Sách vẫn được rao
            bán cho đến khi người bán tạo đơn.
          </span>
          <Link to={`/checkout/${room.listingId}?conversationId=${room.id}`}>
            Gửi địa chỉ và báo giá
          </Link>
        </aside>
      )}
      {active &&
        room.buyer.id === userId &&
        book.data &&
        !book.data.fulfillment && (
          <p className={styles.connection} role="status">
            Người bán chưa hoàn thiện nơi gửi cho bài đăng này nên chưa thể tạo
            đơn. Hãy nhắn người bán cập nhật thông tin giao hàng.
          </p>
        )}
      {active && room.seller.id === userId && !room.hasQuote && (
        <p className={styles.connection}>
          Chờ người mua gửi địa chỉ và báo giá giao nhận. Việc chat chưa giữ
          sách.
        </p>
      )}
      {active && room.seller.id === userId && room.hasQuote && (
        <>
          <aside className={styles.connection}>
            <span>
              Người mua đã gửi thông tin giao nhận. Kiểm tra và tạo đơn với giá
              đã thỏa thuận.
            </span>
            <button type="button" onClick={() => setOrderDialogOpen(true)}>
              Tạo đơn hàng
            </button>
          </aside>
          <PurchaseDialog
            open={orderDialogOpen}
            onClose={() => setOrderDialogOpen(false)}
            busy={orderBusy}
            title="Tạo đơn cho người mua"
            description="Kiểm tra địa chỉ, phí giao hàng và giá sách trước khi chốt đơn."
            className={flow.flow}
          >
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (orderBusy) return;
                const submittedPrice = new FormData(event.currentTarget).get(
                  "agreedBookPrice",
                );
                const price =
                  orderAttempt.current?.price ??
                  (typeof submittedPrice === "string"
                    ? Number(submittedPrice)
                    : Number.NaN);
                if (
                  !Number.isInteger(price) ||
                  price < 10000 ||
                  price > 1000000
                ) {
                  setOrderError("Giá sách phải từ 10.000 ₫ đến 1.000.000 ₫.");
                  return;
                }
                const intent = orderAttempt.current ?? {
                  key: crypto.randomUUID(),
                  version: room.version,
                  price,
                };
                orderAttempt.current = intent;
                setOrderBusy(true);
                setOrderError(undefined);
                try {
                  await createSellerOrder(
                    {
                      conversationId: room.id,
                      expectedVersion: intent.version,
                      agreedBookPrice: intent.price,
                    },
                    intent.key,
                  );
                  orderAttempt.current = undefined;
                  setOrderDialogOpen(false);
                  refreshRooms();
                } catch (cause) {
                  let message =
                    "Chưa xác nhận được đơn đã tạo. Thử lại để gửi cùng yêu cầu.";
                  if (
                    cause instanceof ApiError &&
                    [400, 403, 404, 409, 422].includes(cause.status)
                  ) {
                    orderAttempt.current = undefined;
                    refreshRooms();
                    message =
                      "Hội thoại hoặc báo giá vừa thay đổi. Hãy tải lại trước khi tạo đơn.";
                  }
                  setOrderError(message);
                } finally {
                  setOrderBusy(false);
                }
              }}
            >
              <div className={flow.form}>
                <label>
                  Giá sách đã thỏa thuận (₫)
                  <input
                    name="agreedBookPrice"
                    type="number"
                    min={10000}
                    max={1000000}
                    step={1000}
                    required
                    disabled={orderBusy || !!orderAttempt.current}
                    value={agreedPrice ?? book.data?.salePrice ?? ""}
                    onChange={(event) => {
                      setOrderError(undefined);
                      setAgreedPrice(event.target.value);
                    }}
                  />
                </label>
              </div>
              {room.quotePreview ? (
                <div className={flow.delivery}>
                  <p>
                    Địa chỉ nhận: {room.quotePreview.destination.recipientName}{" "}
                    · {room.quotePreview.destination.phone}
                  </p>
                  <p>
                    {room.quotePreview.destination.detail},{" "}
                    {room.quotePreview.destination.localityCode}
                  </p>
                  <p>
                    Phí giao nhận: {formatVnd(room.quotePreview.shippingFee)} ·
                    Báo giá đến {dateTime(room.quotePreview.expiresAt)}
                  </p>
                </div>
              ) : (
                <p>
                  Địa chỉ/báo giá không còn khả dụng. Người mua cần gửi lại
                  thông tin.
                </p>
              )}
              <p>
                Người mua đã gửi địa chỉ và báo giá giao nhận. Tạo đơn sẽ giữ
                sách 15 phút ở trạng thái chờ thanh toán. Sau khi người mua
                thanh toán thành công, sách mới đang giao dịch.
              </p>
              {orderError && (
                <p className={flow.error} role="alert">
                  {orderError}
                </p>
              )}
              <button
                className={flow.primary}
                type="submit"
                disabled={orderBusy || !room.hasQuote || !room.quotePreview}
              >
                {orderBusy ? "Đang tạo đơn…" : "Tạo đơn cho người mua này"}
              </button>
            </form>
          </PurchaseDialog>
        </>
      )}
      {room.orderId && room.buyer.id === userId && (
        <aside className={styles.connection}>
          {order.isLoading ? (
            <p>Đang tải đơn hàng…</p>
          ) : order.data ? (
            <>
              <strong>Người bán đã tạo đơn</strong>
              <p>
                Giá sách: {formatVnd(order.data.amounts.bookPrice)} · Phí giao
                nhận: {formatVnd(order.data.amounts.shippingFee)}
              </p>
              <p>
                <strong>
                  Tổng thanh toán: {formatVnd(order.data.amounts.buyerTotal)}
                </strong>
              </p>
              {order.data.state === "AwaitingPayment" &&
                order.data.paymentEnabled && (
                  <button
                    type="button"
                    disabled={payBusy}
                    onClick={async () => {
                      const intent = payAttempt.current ?? {
                        key: crypto.randomUUID(),
                        version: order.data!.version,
                      };
                      payAttempt.current = intent;
                      setPayBusy(true);
                      setPayError(undefined);
                      try {
                        await payOrder(
                          order.data!.id,
                          intent.version,
                          intent.key,
                        );
                        payAttempt.current = undefined;
                        void order.refetch();
                        for (const key of [
                          "public-listing",
                          "home-shelves",
                          "catalog-search",
                          "exchange-public-listings",
                        ])
                          void cache.invalidateQueries({ queryKey: [key] });
                      } catch (cause) {
                        if (
                          cause instanceof ApiError &&
                          [400, 403, 404, 409, 422].includes(cause.status)
                        ) {
                          payAttempt.current = undefined;
                          void order.refetch();
                          setPayError(
                            cause.code === "InvalidState"
                              ? "Chưa thể thanh toán. Kiểm tra số dư ví và trạng thái đơn rồi thử lại."
                              : "Đơn vừa thay đổi hoặc hết hạn. Đã tải lại trạng thái đơn.",
                          );
                        } else
                          setPayError(
                            "Chưa xác nhận được thanh toán. Thử lại để gửi cùng yêu cầu.",
                          );
                      } finally {
                        setPayBusy(false);
                      }
                    }}
                  >
                    {payBusy ? "Đang thanh toán…" : "Xác nhận và thanh toán"}
                  </button>
                )}
              {order.data.state !== "AwaitingPayment" && (
                <p>Trạng thái đơn: {order.data.state}</p>
              )}
              {payError && <p role="alert">{payError}</p>}
            </>
          ) : (
            <p role="alert">
              Chưa tải được đơn hàng.{" "}
              <button type="button" onClick={() => void order.refetch()}>
                Thử lại
              </button>
            </p>
          )}
        </aside>
      )}
      {connection !== "online" && (
        <div className={styles.connection} role="status">
          <span>
            {connection === "connecting"
              ? "Đang kết nối…"
              : "Kết nối đang gián đoạn. Lịch sử đã tải vẫn ở đây."}
          </span>
          {connection === "offline" && (
            <button
              type="button"
              onClick={() => {
                setConnection("connecting");
                socketRef.current?.disconnect().connect();
              }}
            >
              Kết nối lại
            </button>
          )}
        </div>
      )}
      <div
        className={styles.messages}
        aria-label="Tin nhắn trong hội thoại"
        aria-live="polite"
      >
        {history.isLoading && (
          <p className={styles.state}>Đang tải tin nhắn…</p>
        )}
        {history.isError && (
          <div className={styles.state} role="alert">
            <p>Chưa tải được lịch sử tin nhắn.</p>
            <button
              type="button"
              disabled={history.isFetching}
              onClick={() => void history.refetch()}
            >
              Tải lại tin nhắn
            </button>
          </div>
        )}
        {history.data && messages.length === 0 && (
          <div className={styles.emptyRoom}>
            <MessageCircle size={28} aria-hidden="true" />
            <h3>Bắt đầu câu chuyện</h3>
            <p>
              Hỏi về tình trạng sách hoặc cách nhận sách. Nội dung chat không
              thay điều khoản đã chốt.
            </p>
          </div>
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            className={`${styles.message} ${message.senderId === userId ? styles.own : ""}`}
          >
            <p className={styles.sender}>
              {message.senderId === userId ? "Bạn" : other.displayName}
            </p>
            <p className={styles.body}>{message.body}</p>
            <time dateTime={message.sentAt}>{dateTime(message.sentAt)}</time>
          </article>
        ))}
        <div ref={messagesEnd} />
      </div>
      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label htmlFor="chat-message">Tin nhắn</label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {expired ? (
          <p className={styles.closed}>
            Cuộc trò chuyện đã đóng. Bạn vẫn có thể đọc tin nhắn cũ.
          </p>
        ) : (
          <>
            <textarea
              id="chat-message"
              rows={2}
              maxLength={1000}
              value={body}
              disabled={!!attempt}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Bạn muốn hỏi gì về cuốn sách này?"
            />
            <div className={styles.sendRow}>
              <span>{body.length}/1.000 ký tự</span>
              <button
                type="submit"
                disabled={sending || !body.trim() || connection !== "online"}
              >
                <Send size={16} aria-hidden="true" />
                {sending
                  ? "Đang gửi…"
                  : attempt
                    ? "Thử gửi lại"
                    : "Gửi tin nhắn"}
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  );
}

export function ChatPage() {
  const { roomId } = useParams<{ roomId?: string }>();
  const auth = useSession();
  const rooms = useQuery({
    queryKey: [
      "purchase-conversations",
      auth.status === "authenticated" ? auth.user.id : undefined,
    ],
    queryFn: getPurchaseConversations,
    refetchInterval: 3000,
    enabled: auth.status === "authenticated",
  });
  if (auth.status !== "authenticated")
    return (
      <section className={styles.guest}>
        <h1>Nhắn tin</h1>
        <p>
          {auth.status === "loading"
            ? "Đang kiểm tra đăng nhập…"
            : "Đăng nhập để xem những cuộc trò chuyện của bạn."}
        </p>
        {auth.status !== "loading" && (
          <Link
            to={`/login?returnUrl=${encodeURIComponent(roomId ? `/chat/${roomId}` : "/chat")}`}
          >
            Đăng nhập
          </Link>
        )}
      </section>
    );
  const room = rooms.data?.find((r) => r.id === roomId);
  return (
    <div className={styles.root}>
      <header className={styles.pageHeading}>
        <h1>Nhắn tin</h1>
        <p>Trao đổi về bản sách bạn đang quan tâm.</p>
      </header>
      <div className={styles.workspace} data-selected={!!roomId}>
        <aside className={styles.inbox} aria-label="Danh sách hội thoại">
          <h2>Hội thoại của bạn</h2>
          {rooms.isLoading && (
            <p className={styles.state} role="status">
              Đang tải hội thoại…
            </p>
          )}
          {rooms.isError && (
            <div className={styles.state} role="alert">
              <p>Chưa tải được hội thoại.</p>
              <button
                type="button"
                disabled={rooms.isFetching}
                onClick={() => void rooms.refetch()}
              >
                Thử lại
              </button>
            </div>
          )}
          {rooms.data?.length === 0 && (
            <div className={styles.state}>
              <MessageCircle size={28} aria-hidden="true" />
              <p>
                Chưa có hội thoại. Khi nhắn người bán về một bản sách, cuộc trò
                chuyện sẽ xuất hiện ở đây; listing vẫn mở cho đến khi người bán
                tạo đơn.
              </p>
              <Link to="/books">Tìm một cuốn sách</Link>
            </div>
          )}
          <nav aria-label="Chọn hội thoại">
            {rooms.data?.map((r) => (
              <Link
                to={`/chat/${r.id}`}
                key={r.id}
                aria-current={r.id === roomId ? "page" : undefined}
              >
                <strong>
                  {r.buyer.id === auth.user.id
                    ? r.seller.displayName
                    : r.buyer.displayName}
                </strong>
                <span>{statusLabels[r.status]}</span>
                <small>{dateTime(r.createdAt)}</small>
              </Link>
            ))}
          </nav>
        </aside>
        {room ? (
          <ChatRoom
            key={room.id}
            room={room}
            userId={auth.user.id}
            refreshRooms={() => void rooms.refetch()}
          />
        ) : (
          <section className={styles.selectRoom}>
            {roomId && (
              <Link className={styles.back} to="/chat">
                <ArrowLeft size={18} aria-hidden="true" />
                Hội thoại
              </Link>
            )}
            <MessageCircle size={36} aria-hidden="true" />
            <h2>
              {rooms.isLoading
                ? "Đang mở hội thoại…"
                : roomId
                  ? "Chưa mở được hội thoại này"
                  : "Chọn một cuộc trò chuyện"}
            </h2>
            <p>
              {roomId
                ? "Kiểm tra danh sách hoặc tải lại hội thoại của bạn."
                : "Tin nhắn và thông tin bản sách sẽ hiện ở đây."}
            </p>
            {rooms.isError && (
              <button type="button" onClick={() => void rooms.refetch()}>
                Thử lại
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
