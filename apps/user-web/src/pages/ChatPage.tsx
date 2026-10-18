import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { ApiError } from "@used-books/session-client";
import { z } from "zod";
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
import { getOrderForPayment, payOrder, orderStates } from "../services/orders";
import { purchaseChatGuidance } from "../lib/purchase-chat-guidance";
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
const serviceAreasSchema = z.object({
  localities: z.array(z.object({ code: z.string(), label: z.string() })),
});
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
  const areas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => session.request("/service-areas", serviceAreasSchema),
    enabled: orderDialogOpen && !!room.quotePreview,
    retry: false,
  });
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
  const [clock, setClock] = useState(Date.now);
  const now = Math.max(clock, Date.now());
  const active = room.status === "Active" && (!room.expiresAt || now < Date.parse(room.expiresAt));
  const expired = !active;
  const isBuyer = room.buyer.id === userId;
  const guidance = purchaseChatGuidance(room, userId, book.data ? Boolean(book.data.fulfillment) : undefined, now);
  useEffect(() => {
    const upcoming = [room.expiresAt, room.quotePreview?.expiresAt]
      .filter((value): value is string => Boolean(value))
      .map(Date.parse)
      .filter((value) => value > Date.now());
    if (!upcoming.length) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(2147483647, Math.max(0, Math.min(...upcoming) - Date.now())));
    return () => window.clearTimeout(timer);
  }, [room.expiresAt, room.quotePreview?.expiresAt, clock]);
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
        <div className={styles.person}>
          <span className={styles.avatar} aria-hidden="true">{other.displayName.slice(0, 1).toUpperCase()}</span>
          <div><h2>{other.displayName}</h2><p>{isBuyer ? "Người bán · Bạn đang hỏi mua" : "Người mua · Bạn đang bán sách"}</p></div>
        </div>
        <p>
          {statusLabels[room.status]}
          {room.expiresAt && (
            <>
              {" "}
              · Hạn hội thoại:{" "}
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
              {book.data.salePrice != null && <p>Giá niêm yết: <strong>{formatVnd(book.data.salePrice)}</strong></p>}
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
      <ol className={styles.progress} aria-label="Tiến trình mua bán">
        {["Trao đổi", "Thông tin nhận sách", "Đơn hàng"].map((label, index) => (
          <li key={label} aria-current={guidance.phase === index ? "step" : undefined} data-complete={guidance.phase != null && guidance.phase > index || undefined}>
            <span aria-hidden="true">{index + 1}</span>{label}
          </li>
        ))}
      </ol>
      {!(room.orderId && isBuyer) && (
        <aside className={styles.nextStep} aria-label="Bước tiếp theo">
          <div><h3>{guidance.title}</h3><p>{guidance.description}</p>
            {!expired && <p className={styles.reservationNote}>Chat chưa giữ chỗ cho cuốn sách.</p>}
          </div>
          {guidance.action === "address" && <Link className={styles.nextAction} to={`/checkout/${room.listingId}?conversationId=${room.id}`}>{guidance.actionLabel}</Link>}
          {guidance.action === "create-order" && <button className={styles.nextAction} type="button" onClick={() => setOrderDialogOpen(true)}>{guidance.actionLabel}</button>}
          {active && !isBuyer && orderAttempt.current && guidance.action !== "create-order" && <button className={styles.nextAction} type="button" onClick={() => setOrderDialogOpen(true)}>Tiếp tục yêu cầu tạo đơn</button>}
          {guidance.action === "order" && <Link className={styles.nextAction} to={`/orders/${room.orderId}`}>Xem đơn hàng</Link>}
        </aside>
      )}
      {active && room.seller.id === userId && (room.hasQuote || orderAttempt.current) && (
        <>
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
                    {areas.data?.localities.find(
                      (area) =>
                        area.code === room.quotePreview?.destination.localityCode,
                    )?.label ??
                      (areas.isPending
                        ? "Đang tải khu vực…"
                        : "Chưa xác định khu vực")}
                  </p>
                  {areas.isError && (
                    <p role="alert">
                      Chưa tải được tên khu vực.{" "}
                      <button
                        type="button"
                        className={flow.textButton}
                        disabled={areas.isFetching}
                        onClick={() => void areas.refetch()}
                      >
                        Thử lại
                      </button>
                    </p>
                  )}
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
                disabled={orderBusy || (!orderAttempt.current && (!room.hasQuote || !room.quotePreview))}
              >
                {orderBusy ? "Đang tạo đơn…" : "Tạo đơn cho người mua này"}
              </button>
            </form>
          </PurchaseDialog>
        </>
      )}
      {room.orderId && room.buyer.id === userId && (
        <aside className={styles.nextStep} aria-label="Bước tiếp theo">
          {order.isLoading ? (
            <p>Đang tải đơn hàng…</p>
          ) : order.data ? (
            <>
              <h3>{order.data.state === "AwaitingPayment" ? "Đơn đang chờ bạn thanh toán" : (orderStates[order.data.state] ?? "Đã cập nhật đơn hàng")}</h3>
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
                <p>Theo dõi bước giao nhận tiếp theo trong đơn hàng.</p>
              )}
              <Link className={styles.orderLink} to={`/orders/${room.orderId}`}>Xem chi tiết đơn hàng</Link>
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
      {!expired && connection !== "online" && (
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
        {!history.isError && history.data && messages.length === 0 && (
          <div className={styles.emptyRoom}>
            <MessageCircle size={28} aria-hidden="true" />
            <h3>{expired ? "Chưa có tin nhắn trong cuộc trao đổi này" : `Bắt đầu trao đổi với ${other.displayName}`}</h3>
            <p>
              {expired ? "Lịch sử hội thoại được giữ lại tại đây." : "Bạn có thể hỏi về tình trạng sách hoặc giá trước khi gửi thông tin nhận sách."}
            </p>
            {!expired && !body && <button className={styles.suggestion} type="button" disabled={!!attempt} onClick={() => { setBody(isBuyer ? "Chào bạn, sách còn không và tình trạng hiện tại thế nào?" : "Chào bạn, bạn muốn hỏi thêm điều gì về cuốn sách này?"); document.getElementById("chat-message")?.focus(); }}>Soạn lời chào</button>}
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
        {!expired && <label htmlFor="chat-message">Nhắn cho {other.displayName}</label>}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {expired ? (
          <p className={styles.closed}>
            {room.orderId ? "Cuộc trao đổi đã chuyển sang đơn hàng. Bạn vẫn có thể đọc tin nhắn cũ; các bước tiếp theo nằm trong đơn hàng." : "Cuộc trò chuyện đã đóng. Bạn vẫn có thể đọc tin nhắn cũ."}
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
              placeholder={isBuyer ? "Hỏi về cuốn sách hoặc trao đổi giá…" : "Trả lời người mua về cuốn sách…"}
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

function ConversationLink({ room, userId, selected }: { room: PurchaseConversation; userId: string; selected: boolean }) {
  const book = useQuery({ queryKey: ["public-listing", room.listingId], queryFn: () => getPublicListing(room.listingId), staleTime: 60_000, retry: false });
  const buyer = room.buyer.id === userId;
  return <Link to={`/chat/${room.id}`} aria-current={selected ? "page" : undefined}>
    <strong>{buyer ? room.seller.displayName : room.buyer.displayName}</strong>
    <span className={styles.inboxBook}>{book.data?.book.title ?? (book.isPending ? "Đang tải tên sách…" : "Bài đăng hiện không khả dụng")}</span>
    <span>{buyer ? "Bạn hỏi mua" : "Bạn bán"} · {statusLabels[room.status]}</span>
  </Link>;
}

export function ChatPage() {
  const { roomId } = useParams<{ roomId?: string }>();
  const auth = useSession();
  const [visibleRooms, setVisibleRooms] = useState(10);
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
        <h1>Tin nhắn mua bán</h1>
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
  const shownRooms = rooms.data?.slice(0, visibleRooms) ?? [];
  if (room && !shownRooms.some((item) => item.id === room.id)) shownRooms.push(room);
  return (
    <div className={styles.root} data-room-selected={!!roomId}>
      <header className={styles.pageHeading}>
        <h1>Tin nhắn mua bán</h1>
        <p>Chọn hội thoại để xem cuốn sách, người trao đổi và bước tiếp theo.</p>
      </header>
      <div className={styles.workspace} data-selected={!!roomId}>
        <aside className={styles.inbox} aria-label="Danh sách hội thoại">
          <h2>Mua và bán sách</h2>
          <p className={styles.inboxHelp}>Chat về một cuốn sách với người mua hoặc người bán.</p>
          <Link className={styles.exchangeLink} to="/exchange/mine">Tìm tin nhắn Đổi sách</Link>
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
                Chưa có cuộc trò chuyện mua bán. Mở một cuốn sách và chọn “Chat với người bán” để bắt đầu.
              </p>
              <Link to="/books">Tìm một cuốn sách</Link>
            </div>
          )}
          <nav aria-label="Chọn hội thoại">
            {shownRooms.map((r) => (
              <ConversationLink key={r.id} room={r} userId={auth.user.id} selected={r.id === roomId} />
            ))}
          </nav>
          {rooms.data && visibleRooms < rooms.data.length && <button className={styles.moreRooms} type="button" onClick={() => setVisibleRooms((value) => value + 10)}>Xem thêm hội thoại</button>}
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
