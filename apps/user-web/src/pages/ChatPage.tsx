import { AgreementTerms } from "../components/conversation/AgreementTerms";
import { ExchangeOffer } from "../components/conversation/ExchangeOffer";
import { ConversationInbox } from "../components/conversation/ConversationInbox";
import { ExchangeDetailPage } from "./ExchangeDetailPage";
import sheet from "../components/conversation/Conversation.module.css";
import {
  getPurchaseConversation,
  getConversationEvents,
  type ConversationEvent,
} from "../services/purchase-conversations";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { ApiError } from "@used-books/session-client";
import { z } from "zod";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Send,
} from "lucide-react";
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
  const [panel, setPanel] = useState<"sheet" | "chat">("sheet");
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const guidanceScrollIntent = useRef(false);
  const [historyExchange, setHistoryExchange] = useState<string | null>(null);
  const cache = useQueryClient();
  const history = useQuery({
    queryKey: ["purchase-messages", room.id],
    queryFn: () => getPurchaseMessages(room.id),
    refetchInterval: room.terms?.exchangeIds.length ? 3000 : false,
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
  const active =
    room.status === "Active" &&
    (!room.expiresAt || now < Date.parse(room.expiresAt));
  const expired = !active && room.status !== "OrderCreated";
  const isExchange = room.terms?.mode === "Exchange";
  const canCreate =
    room.terms?.agreedPrice != null &&
    room.terms.agreedListingRevisionId === book.data?.revisionId &&
    !room.terms.pendingProposal &&
    !room.terms.locked;
  const events = useQuery({
    queryKey: ["conversation-events", room.id],
    queryFn: () => getConversationEvents(room.id),
    refetchInterval: 3000,
  });
  const isBuyer = room.buyer.id === userId;
  const guidance = purchaseChatGuidance(
    room,
    userId,
    book.data ? Boolean(book.data.fulfillment) : undefined,
    now,
  );
  useEffect(() => {
    const upcoming = [room.expiresAt, room.quotePreview?.expiresAt]
      .filter((value): value is string => Boolean(value))
      .map(Date.parse)
      .filter((value) => value > Date.now());
    if (!upcoming.length) return;
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.min(2147483647, Math.max(0, Math.min(...upcoming) - Date.now())),
    );
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
  const [expandedEvents, setExpandedEvents] = useState(false);
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
  const bookIdentity = (
    <>
      <div className={styles.cover}>
        {book.data ? (
          <ListingPhoto book={book.data} eager />
        ) : (
          <BookOpen size={32} aria-hidden="true" />
        )}
      </div>
      <div className={styles.bookHeading}>
        <h1>
          <Link to={`/books/${room.listingId}`}>
            {book.data?.book.title ??
              (book.isLoading
                ? "Đang tải cuốn sách…"
                : "Cuộc trao đổi về sách")}
          </Link>
        </h1>
        {book.data ? (
          <p className={styles.bookAuthor}>
            {book.data.book.authors.join(", ")}
          </p>
        ) : (
          <p className={styles.bookAuthor}>
            Thông tin bài đăng hiện không khả dụng. Bạn vẫn có thể đọc hội
            thoại.
          </p>
        )}
        <p className={styles.roomStatus}>
          {isExchange && room.status === "Active"
            ? "Đang trao đổi sách"
            : statusLabels[room.status]}
          {room.expiresAt && (
            <>
              {" "}
              · Hạn hội thoại:{" "}
              <time dateTime={room.expiresAt}>
                {dateTime(room.expiresAt)}
              </time>
            </>
          )}
        </p>
      </div>
    </>
  );
  return (
    <section
      className={styles.room}
      aria-label={`Cuộc trò chuyện với ${other.displayName}`}
    >
      <header className={styles.roomHeader}>
        <Link
          className={styles.back}
          to="/chat"
          aria-label="Về danh sách hội thoại"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Hội thoại của bạn
        </Link>
      </header>
      <div className={styles.mobileBookHeader}>{bookIdentity}</div>
      <nav
        className={`${sheet.mobileTabs} ${sheet.bookTabs}`}
        aria-label="Nội dung cuộc trao đổi"
      >
        <button
          type="button"
          aria-pressed={panel === "sheet"}
          onClick={() => setPanel("sheet")}
        >
          Phiếu thỏa thuận
        </button>
        <button
          type="button"
          aria-pressed={panel === "chat"}
          onClick={() => setPanel("chat")}
        >
          Hội thoại
        </button>
      </nav>
      <div
        className={`${sheet.workspace} ${sheet.openBook} ${styles.paperSpread} ${styles.dossierSpread}`}
        data-panel={panel}
      >
        <aside className={sheet.sheet} aria-label="Phiếu thỏa thuận">
          <header className={`${sheet.sheetHeading} ${styles.dossierHeader}`}>
            {bookIdentity}
          </header>
          <h2 className={styles.srOnly}>Phiếu thỏa thuận</h2>
          <div
            className={`${sheet.sheetBody} ${styles.dossierBody}`}
            ref={sheetBodyRef}
            role="region"
            aria-label="Nội dung phiếu thỏa thuận"
            tabIndex={0}
          >
            {room.terms?.locked &&
              !room.orderId &&
              !room.terms.activeExchangeId && (
                <p className={sheet.error}>
                  Sách hiện chưa thể chốt giao dịch. Bạn vẫn có thể tiếp tục
                  nhắn tin.
                </p>
              )}
            <AgreementTerms
              room={room}
              userId={userId}
              book={book.data}
              refresh={refreshRooms}
              frozen={!!orderAttempt.current || payBusy}
            />
            {!!room.terms?.exchangeIds.length && (
              <details className={sheet.exchangeHistory}>
                <summary>Các đề nghị đổi sách trong cuộc trao đổi</summary>
                {room.terms.exchangeIds.map((id, i) => (
                  <button
                    type="button"
                    key={id}
                    className={sheet.textButton}
                    onClick={() => setHistoryExchange(id)}
                  >
                    Xem đề nghị lần {i + 1}
                    {id === room.terms?.activeExchangeId ? " — hiện tại" : ""}
                  </button>
                ))}
              </details>
            )}
            {historyExchange ? (
              <>
                <div className={sheet.proposal}>
                  <p>Đang xem đề nghị đổi sách trước.</p>
                  <button
                    type="button"
                    className={sheet.textButton}
                    onClick={() => setHistoryExchange(null)}
                  >
                    Về phiếu hiện tại
                  </button>
                </div>
                <ExchangeDetailPage
                  key={historyExchange}
                  exchangeId={historyExchange}
                  embedded
                />
              </>
            ) : (
              isExchange &&
              (room.terms?.activeExchangeId ? (
                <ExchangeDetailPage
                  key={room.terms.activeExchangeId}
                  exchangeId={room.terms.activeExchangeId}
                  embedded
                />
              ) : book.data &&
                !room.terms?.pendingProposal &&
                !room.terms?.locked ? (
                <ExchangeOffer
                  room={room}
                  userId={userId}
                  book={book.data}
                  refresh={refreshRooms}
                />
              ) : null)
            )}
            {!isExchange && !(room.orderId && isBuyer) && (
              <details
                className={styles.guidanceDetails}
                onToggle={(event) => {
                  if (!guidanceScrollIntent.current) return;
                  guidanceScrollIntent.current = false;
                  const body = sheetBodyRef.current;
                  if (!body) return;
                  const details = event.currentTarget;
                  if (getComputedStyle(body).overflowY === "visible") {
                    (details.open ? details : body).scrollIntoView({
                      block: "start",
                      behavior: "smooth",
                    });
                  } else {
                    body.scrollTo({
                      top: details.open ? body.scrollHeight : 0,
                      behavior: "smooth",
                    });
                  }
                }}
                open={
                  expired ||
                  (book.data != null && !book.data.fulfillment) ||
                  (room.hasQuote &&
                    (!room.quotePreview ||
                      Date.parse(room.quotePreview.expiresAt) <= now))
                }
              >
                <summary
                  onClick={() => {
                    guidanceScrollIntent.current = true;
                  }}
                >
                  Cách giao dịch
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <ol className={styles.progress} aria-label="Tiến trình mua bán">
                  {["Trao đổi", "Thông tin nhận sách", "Đơn hàng"].map(
                    (label, index) => (
                      <li
                        key={label}
                        aria-current={guidance.phase === index ? "step" : undefined}
                      >
                        {label}
                      </li>
                    ),
                  )}
                </ol>
                <p>{guidance.description}</p>
                {!expired && <p>Chat chưa giữ chỗ cho cuốn sách.</p>}
                <p>
                  Người bán đề xuất hình thức, người mua xác nhận. Đề nghị giá
                  cần đối tác chấp nhận trước khi dùng để tạo đơn.
                </p>
              </details>
            )}
          </div>
          {!isExchange && (
            <>
              {!(room.orderId && isBuyer) && (
                <aside
                  className={styles.nextStep}
                  aria-label="Bước tiếp theo"
                  data-primary={canCreate || !!room.orderId}
                >
                  <div>
                    <h3>{guidance.title}</h3>
                  </div>
                  {guidance.action === "address" && !room.terms?.locked && (
                    <Link
                      className={styles.nextAction}
                      to={`/checkout/${room.listingId}?conversationId=${room.id}`}
                    >
                      {guidance.actionLabel}
                    </Link>
                  )}
                  {guidance.action === "create-order" && (
                    <button
                      className={styles.nextAction}
                      type="button"
                      disabled={!canCreate}
                      onClick={() => setOrderDialogOpen(true)}
                    >
                      {canCreate
                        ? guidance.actionLabel
                        : room.terms?.locked
                          ? "Sách hiện chưa thể chốt"
                          : "Cần thống nhất giá trước"}
                    </button>
                  )}
                  {active &&
                    !isBuyer &&
                    orderAttempt.current &&
                    guidance.action !== "create-order" && (
                      <button
                        className={styles.nextAction}
                        type="button"
                        onClick={() => setOrderDialogOpen(true)}
                      >
                        Tiếp tục yêu cầu tạo đơn
                      </button>
                    )}
                  {guidance.action === "order" && (
                    <Link
                      className={styles.nextAction}
                      to={`/orders/${room.orderId}`}
                    >
                      Xem đơn hàng
                    </Link>
                  )}
                </aside>
              )}
              {active &&
                room.seller.id === userId &&
                (room.hasQuote || orderAttempt.current) && (
                  <>
                    <PurchaseDialog
                      open={orderDialogOpen}
                      onClose={() => setOrderDialogOpen(false)}
                      busy={orderBusy}
                      title="Tạo đơn cho người mua"
                      description="Giá đã được hai bên thống nhất. Kiểm tra thông tin nhận và tổng trước khi tạo đơn."
                      className={flow.flow}
                    >
                      <form
                        onSubmit={async (event) => {
                          event.preventDefault();
                          if (orderBusy) return;
                          const submittedPrice = new FormData(
                            event.currentTarget,
                          ).get("agreedBookPrice");
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
                            setOrderError(
                              "Giá sách phải từ 10.000 ₫ đến 1.000.000 ₫.",
                            );
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
                              value={
                                orderAttempt.current?.price ??
                                room.terms?.agreedPrice ??
                                ""
                              }
                              readOnly
                            />
                          </label>
                        </div>
                        {room.quotePreview ? (
                          <div className={flow.delivery}>
                            <p>
                              Địa chỉ nhận:{" "}
                              {room.quotePreview.destination.recipientName} ·{" "}
                              {room.quotePreview.destination.phone}
                            </p>
                            <p>
                              {room.quotePreview.destination.detail},{" "}
                              {areas.data?.localities.find(
                                (area) =>
                                  area.code ===
                                  room.quotePreview?.destination.localityCode,
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
                              Phí giao nhận:{" "}
                              {formatVnd(room.quotePreview.shippingFee)} · Báo
                              giá đến {dateTime(room.quotePreview.expiresAt)}
                            </p>
                          </div>
                        ) : (
                          <p>
                            Địa chỉ/báo giá không còn khả dụng. Người mua cần
                            gửi lại thông tin.
                          </p>
                        )}
                        <p>
                          Người mua đã gửi địa chỉ và báo giá giao nhận. Tạo đơn
                          sẽ giữ sách 15 phút ở trạng thái chờ thanh toán. Sau
                          khi người mua thanh toán thành công, sách mới đang
                          giao dịch.
                        </p>
                        {orderError && (
                          <p className={flow.error} role="alert">
                            {orderError}
                          </p>
                        )}
                        <button
                          className={flow.primary}
                          type="submit"
                          disabled={
                            orderBusy ||
                            (!orderAttempt.current &&
                              (!canCreate ||
                                !room.hasQuote ||
                                !room.quotePreview ||
                                Date.parse(room.quotePreview.expiresAt) <= now))
                          }
                        >
                          {orderBusy
                            ? "Đang tạo đơn…"
                            : "Tạo đơn cho người mua này"}
                        </button>
                      </form>
                    </PurchaseDialog>
                  </>
                )}
              {room.orderId && room.buyer.id === userId && (
                <aside
                  className={styles.nextStep}
                  aria-label="Bước tiếp theo"
                  data-primary="true"
                >
                  {order.isLoading ? (
                    <p>Đang tải đơn hàng…</p>
                  ) : order.data ? (
                    <>
                      <h3>
                        {order.data.state === "AwaitingPayment"
                          ? "Đơn đang chờ bạn thanh toán"
                          : (orderStates[order.data.state] ??
                            "Đã cập nhật đơn hàng")}
                      </h3>
                      <p>
                        Giá sách: {formatVnd(order.data.amounts.bookPrice)} ·
                        Phí giao nhận:{" "}
                        {formatVnd(order.data.amounts.shippingFee)}
                      </p>
                      <p>
                        <strong>
                          Tổng thanh toán:{" "}
                          {formatVnd(order.data.amounts.buyerTotal)}
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
                                  void cache.invalidateQueries({
                                    queryKey: [key],
                                  });
                              } catch (cause) {
                                if (
                                  cause instanceof ApiError &&
                                  [400, 403, 404, 409, 422].includes(
                                    cause.status,
                                  )
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
                            {payBusy
                              ? "Đang thanh toán…"
                              : "Xác nhận và thanh toán"}
                          </button>
                        )}
                      {order.data.state !== "AwaitingPayment" && (
                        <p>Theo dõi bước giao nhận tiếp theo trong đơn hàng.</p>
                      )}
                      <Link
                        className={styles.orderLink}
                        to={`/orders/${room.orderId}`}
                      >
                        Xem chi tiết đơn hàng
                      </Link>
                      {payError && <p role="alert">{payError}</p>}
                    </>
                  ) : (
                    <p role="alert">
                      Chưa tải được đơn hàng.{" "}
                      <button
                        type="button"
                        onClick={() => void order.refetch()}
                      >
                        Thử lại
                      </button>
                    </p>
                  )}
                </aside>
              )}
            </>
          )}
        </aside>
        <section
          className={`${sheet.chat} ${styles.dossierChat}`}
          aria-label="Hội thoại"
        >
          <div className={`${sheet.chatHeading} ${styles.dossierChatHeading}`}>
            <span className={styles.avatar} aria-hidden="true">
              {other.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h2>{other.displayName}</h2>
              <p>
                {isExchange
                  ? "Đối tác trao đổi sách"
                  : isBuyer
                    ? "Người bán · Bạn đang hỏi mua"
                    : "Người mua · Bạn đang bán sách"}
              </p>
            </div>
          </div>
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
                {!expired && (
                  <img
                    className={styles.emptyMascot}
                    src="/illustrations/penguins/exchange.png"
                    alt=""
                    aria-hidden="true"
                    width={64}
                    height={64}
                    draggable={false}
                  />
                )}
                <h3>
                  {expired
                    ? "Chưa có tin nhắn trong cuộc trao đổi này"
                    : "Bắt đầu cuộc trò chuyện"}
                </h3>
                <p>
                  {expired
                    ? "Lịch sử hội thoại được giữ lại tại đây."
                    : "Bạn có thể hỏi về tình trạng sách hoặc giá trước khi gửi thông tin nhận sách."}
                </p>
                {!expired && !body && (
                  <button
                    className={styles.suggestion}
                    type="button"
                    disabled={!!attempt}
                    onClick={() => {
                      setBody(
                        isBuyer
                          ? "Chào bạn, sách còn không và tình trạng hiện tại thế nào?"
                          : "Chào bạn, bạn muốn hỏi thêm điều gì về cuốn sách này?",
                      );
                      document.getElementById("chat-message")?.focus();
                    }}
                  >
                    Soạn lời chào
                  </button>
                )}
              </div>
            )}
            {events.isError && (
              <p role="alert">
                Chưa tải được lịch sử thỏa thuận.{" "}
                <button type="button" onClick={() => void events.refetch()}>
                  Thử lại
                </button>
              </p>
            )}
            {events.data?.length ? (
              <section
                className={sheet.eventHistory}
                aria-label="Lịch sử thỏa thuận"
              >
                <div className={sheet.historyHeading}>
                  <h3>Lịch sử thỏa thuận</h3>
                  {events.data.length > 1 && (
                    <button
                      type="button"
                      aria-expanded={expandedEvents}
                      aria-controls={`agreement-events-${room.id}`}
                      onClick={() => setExpandedEvents((value) => !value)}
                    >
                      {expandedEvents
                        ? "Thu gọn lịch sử"
                        : "Xem tất cả thay đổi"}
                    </button>
                  )}
                </div>
                <div
                  id={`agreement-events-${room.id}`}
                  className={sheet.eventEntries}
                >
                  {(expandedEvents ? events.data : events.data.slice(-1)).map(
                    (event) => (
                      <p key={event.id}>
                        <strong>
                          {event.actorId === userId ? "Bạn" : other.displayName}
                        </strong>{" "}
                        {eventText(event)}
                        <time dateTime={event.createdAt}>
                          {dateTime(event.createdAt)}
                        </time>
                      </p>
                    ),
                  )}
                </div>
              </section>
            ) : null}
            {messages.map((message) => (
              <article
                key={message.id}
                className={`${styles.message} ${message.senderId === userId ? styles.own : ""}`}
              >
                <p className={styles.sender}>
                  {message.senderId === userId ? "Bạn" : other.displayName}
                </p>
                <p className={styles.body}>{message.body}</p>
                <time dateTime={message.sentAt}>
                  {dateTime(message.sentAt)}
                </time>
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
            {!expired && (
              <label className={styles.composerLabel} htmlFor="chat-message">
                Nhắn cho {other.displayName}
              </label>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {expired ? (
              <p className={styles.closed}>
                {room.orderId
                  ? "Đơn hàng đã được tạo. Theo dõi tình trạng ở phiếu thỏa thuận."
                  : "Cuộc trò chuyện đã đóng. Bạn vẫn có thể đọc tin nhắn cũ."}
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
                  placeholder={
                    isExchange
                      ? "Trao đổi về sách, tiền bù hoặc giao nhận…"
                      : isBuyer
                        ? "Hỏi về cuốn sách hoặc trao đổi giá…"
                        : "Trả lời người mua về cuốn sách…"
                  }
                />
                <div className={styles.sendRow}>
                  <span>{body.length}/1.000 ký tự</span>
                  <button
                    type="submit"
                    disabled={
                      sending || !body.trim() || connection !== "online"
                    }
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
      </div>
    </section>
  );
}

function eventText(event: ConversationEvent) {
  if (event.kind === "PriceProposed")
    return `đề nghị giá ${formatVnd(event.amount!)}.`;
  if (event.kind === "PriceAccepted")
    return `chấp nhận giá ${formatVnd(event.amount!)}.`;
  if (event.kind === "ModeProposed")
    return `đề nghị chuyển sang ${event.mode === "Exchange" ? "đổi sách" : "thương lượng mua"}.`;
  if (event.kind === "ModeAccepted")
    return `chấp nhận ${event.mode === "Exchange" ? "đổi sách" : "thương lượng mua"}.`;
  if (event.kind === "ProposalDeclined") return "không tiếp tục đề nghị trước.";
  return "gửi đề nghị đổi sách; chi tiết hiện trên phiếu bên trái.";
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
    enabled: auth.status === "authenticated",
    refetchInterval: 3000,
  });
  const room = useQuery({
    queryKey: [
      "purchase-conversation",
      roomId,
      auth.status === "authenticated" ? auth.user.id : undefined,
    ],
    queryFn: () => getPurchaseConversation(roomId!),
    enabled: !!roomId && auth.status === "authenticated",
    refetchInterval: 3000,
  });
  const cache = useQueryClient();
  const refresh = () => {
    void rooms.refetch();
    void room.refetch();
    void cache.invalidateQueries({ queryKey: ["conversation-events", roomId] });
    void cache.invalidateQueries({ queryKey: ["exchangeDetail"] });
    void cache.invalidateQueries({ queryKey: ["exchangeTransactions"] });
    if (room.data)
      void cache.invalidateQueries({
        queryKey: ["public-listing", room.data.listingId],
      });
  };
  if (auth.status !== "authenticated")
    return (
      <section className={styles.guest}>
        <h1>Hội thoại của bạn</h1>
        <p>
          {auth.status === "loading"
            ? "Đang kiểm tra đăng nhập…"
            : "Đăng nhập để tiếp tục những cuộc trao đổi về sách."}
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
  return (
    <div className={styles.root} data-room-selected={!!roomId}>
      {!roomId ? (
        <>
          <header className={styles.pageHeading}>
            <div>
              <h1>Hội thoại của bạn</h1>
              <p>
                Mỗi cuốn sách, mỗi người trao đổi — một phiếu thỏa thuận riêng.
              </p>
            </div>
            <Link className={styles.browseLink} to="/books?data=live">
              Tìm sách <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </header>
          <ConversationInbox
            rooms={rooms.data ?? []}
            loading={rooms.isPending}
            error={rooms.isError}
            retry={() => void rooms.refetch()}
            userId={auth.user.id}
          />
        </>
      ) : (
        <>
          {room.isError && (
            <div role="alert" className={sheet.error}>
              Chưa cập nhật được hội thoại. Dữ liệu đã tải vẫn được giữ.{" "}
              <button type="button" onClick={() => void room.refetch()}>
                Thử lại
              </button>
            </div>
          )}
          {room.data ? (
            <ChatRoom
              key={room.data.id}
              room={room.data}
              userId={auth.user.id}
              refreshRooms={refresh}
            />
          ) : (
            <section className={styles.selectRoom}>
              <Link to="/chat">Về danh sách hội thoại</Link>
              <h1>
                {room.isPending
                  ? "Đang mở hội thoại…"
                  : "Chưa mở được hội thoại"}
              </h1>
              <p>
                {room.isPending
                  ? "Đang tải phiếu thỏa thuận và tin nhắn."
                  : "Hội thoại không tồn tại hoặc bạn không có quyền truy cập."}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
