import { NegotiationWorkspace } from "./NegotiationWorkspace";
import { ConversationInbox } from "../components/conversation/ConversationInbox";
import { ConversationBackLink } from "../components/conversation/ConversationBackLink";
import {
  useConversationTransition,
  useInboxPosition,
} from "../components/conversation/conversation-navigation";
import sheet from "../components/conversation/Conversation.module.css";
import {
  getPurchaseConversation,
  getConversationEvents,
  type ConversationEvent,
} from "../services/purchase-conversations";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTransactionLive } from "../hooks/useTransactionLive";
import { io, type Socket } from "socket.io-client";
import { ApiError, CHAT_MESSAGE_LIMIT, CHAT_RATE_LIMIT_TEXT, DEFAULT_SALE_COMMISSION_BPS, chatSendWasRateLimited, clipChatMessage, directOrderCommission, formatSaleFeeRate } from "@used-books/session-client";
import { z } from "zod";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeftRight, ArrowUp, ArrowUpRight, Clock3, Gavel, RefreshCw, Send } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { session } from "../lib/session";
import {
  getPurchaseConversations,
  getPurchaseMessageHistory,
  purchaseMessageSchema,
  type PurchaseMessage,
  type PurchaseConversation,
} from "../services/purchase-conversations";
import { getPublicListing } from "../services/public-listings";
import { createSellerOrder } from "../services/purchase-conversations";

import { purchaseChatGuidance } from "../lib/purchase-chat-guidance";
import { ROUTES, formatVnd } from "../lib/routes";
import { PurchaseDialog } from "../components/PurchaseDialog";
import { ExchangeChatDrawer } from "../components/exchange/ExchangeChatDrawer";
import flow from "./PurchaseFlow.module.css";
import styles from "./ChatPage.module.css";
import exchangeStyles from "./ExchangeDetailPage.module.css";
import { getExchanges, type Exchange } from "../services/exchange";
import { auctionPhase, listMyAuctions, type MyAuctionItem } from "../services/auctions";
import { AuctionPhoto } from "../components/AuctionGallery";

const configuredBase =
  import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:3000/api/v1";
const socketUrl = configuredBase.startsWith("/")
  ? window.location.origin
  : configuredBase.replace(/\/api\/v1\/?$/, "");
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

// Draft changes do not alter existing messages. Keep normal prop comparison so
// new message content, timestamps, participant names or ownership still render.
const ChatMessage = memo(function ChatMessage({ message, sender, own }: {
  message: PurchaseMessage;
  sender: string;
  own: boolean;
}) {
  return (
    <article data-chat-message className={`${styles.message} ${own ? styles.own : ""}`}>
      <p className={styles.sender}>{sender}</p>
      <p className={styles.body}>{message.body}</p>
      <time dateTime={message.sentAt}>{dateTime(message.sentAt)}</time>
    </article>
  );
});

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
  const [searchParams] = useSearchParams();
  const shouldOpenChat =
    searchParams.get("openChat") === "1" ||
    searchParams.get("openChat") === "true";
  const [panel, setPanel] = useState<"sheet" | "chat">("sheet");
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const [historyExchange, setHistoryExchange] = useState<string | null>(null);
  const history = useInfiniteQuery({
    queryKey: ["purchase-message-history", userId, room.id],
    queryFn: ({ pageParam }) => getPurchaseMessageHistory(room.id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page, _pages, _param, params) =>
      page.olderCursor && !params.includes(page.olderCursor) ? page.olderCursor : undefined,
    retry: false,
    refetchInterval: room.terms?.exchangeIds.length ? 3000 : false,
  });
  const book = useQuery({
    queryKey: ["public-listing", room.listingId],
    queryFn: () => getPublicListing(room.listingId),
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
  const [acceptedCommission, setAcceptedCommission] = useState<string>();
  const orderAttempt = useRef<
    { key: string; version: number; price: number } | undefined
  >(undefined);
  const [attempt, setAttempt] = useState<{
    messageId: string;
    conversationId: string;
    body: string;
  }>();
  const socketRef = useRef<Socket | null>(null);
  const attemptRef = useRef<typeof attempt>(undefined);
  const messageList = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const olderAnchor = useRef<{ node: HTMLElement; top: number; pages: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [clock, setClock] = useState(Date.now);
  const now = Math.max(clock, Date.now());
  const active =
    room.status === "Active" &&
    (!room.expiresAt || now < Date.parse(room.expiresAt));
  const expired = !active && room.status !== "OrderCreated";
  const isExchange = room.terms?.mode === "Exchange";
  const agreedBookPrice = room.terms?.agreedPrice;
  const canCreate =
    agreedBookPrice != null &&
    room.terms?.agreedListingRevisionId === book.data?.revisionId &&
    !room.terms?.pendingProposal &&
    !room.terms?.locked;
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
              void history.refetch({ cancelRefetch: false });
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
  }, [room.id, userId]);
  const historyDenied = history.error instanceof ApiError && [401, 403, 404].includes(history.error.status);
  const messages = historyDenied ? [] : [
    ...new Map(
      [...(history.data?.pages.flatMap(page => page.items) ?? []), ...live].map((m) => [m.id, m]),
    ).values(),
  ].sort(
    (a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt) || a.id.localeCompare(b.id),
  );
  const [expandedEvents, setExpandedEvents] = useState(false);
  const loadedPages = history.data?.pages.length ?? 0;
  const latestMessage = messages.at(-1)?.id;
  function loadOlder() {
    const list = messageList.current;
    if (!list || history.isFetching || !history.hasNextPage) return;
    const top = list.getBoundingClientRect().top;
    const node = Array.from(list.querySelectorAll<HTMLElement>('[data-chat-message]'))
      .find(message => message.getBoundingClientRect().bottom > top);
    olderAnchor.current = node ? { node, top: node.getBoundingClientRect().top, pages: loadedPages } : null;
    void history.fetchNextPage({ cancelRefetch: false });
  }
  useLayoutEffect(() => {
    const list = messageList.current;
    if (!list?.clientHeight) return;
    const anchor = olderAnchor.current;
    if (anchor && loadedPages > anchor.pages) {
      olderAnchor.current = null;
      if (list.contains(anchor.node)) list.scrollTop += anchor.node.getBoundingClientRect().top - anchor.top;
      return;
    }
    if (history.isFetchNextPageError) olderAnchor.current = null;
    if (followLatest.current && !olderAnchor.current) list.scrollTop = list.scrollHeight;
  }, [latestMessage, loadedPages, panel, history.isFetchNextPageError]);
  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    const resize = () => {
      if (!field.clientWidth) return;
      field.style.height = "auto";
      const style = getComputedStyle(field);
      const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const height = Math.min(field.scrollHeight + border, 96);
      field.style.height = `${height}px`;
      field.style.overflowY = field.scrollHeight > field.clientHeight ? "auto" : "hidden";
    };
    resize();
    // Width and visibility change when the chat switches between pane and tab.
    let width = field.parentElement!.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });
    observer.observe(field.parentElement!);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [body]);
  function send() {
    const socket = socketRef.current;
    if (sending || expired || !socket || connection !== "online") return;
    const text = body.trim();
    if (!text || [...text].length > CHAT_MESSAGE_LIMIT) return;
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
        if (!failure && chatSendWasRateLimited(reply)) {
          attemptRef.current = undefined;
          setAttempt(undefined);
          setError(CHAT_RATE_LIMIT_TEXT);
          return;
        }
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
  const headerTitle = room.orderId
    ? "Đơn mua sách"
    : room.terms?.pendingProposal
      ? room.terms.pendingProposal.proposedById === userId
        ? "Đã gửi đề nghị"
        : "Đề nghị giá mua"
      : room.terms?.agreedPrice != null
        ? "Đã thống nhất giá"
        : isExchange
          ? "Đề nghị đổi sách"
          : "Thương lượng mua sách";
  const orderBookPrice = orderAttempt.current?.price ?? agreedBookPrice;
  const commissionBps = room.quotePreview?.commissionBps ?? DEFAULT_SALE_COMMISSION_BPS;
  const commissionRate = formatSaleFeeRate(commissionBps);
  const commissionTerms = `${room.version}:${orderBookPrice}:${commissionBps}`;
  const commissionAccepted = acceptedCommission === commissionTerms;
  const orderCommission =
    orderBookPrice == null ? null : directOrderCommission(orderBookPrice, commissionBps);

  const chatPanelContent = (
    <section
      className={`${sheet.chat} ${styles.dossierChat}`}
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      aria-label="Hội thoại"
    >
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
        ref={messageList}
        className={styles.messages}
        aria-label="Tin nhắn trong hội thoại"
        tabIndex={0}
        aria-live="polite"
        data-lenis-prevent="true"
        onScroll={(event) => {
          const list = event.currentTarget;
          followLatest.current =
            list.scrollHeight - list.scrollTop - list.clientHeight < 64;
          const anchor = olderAnchor.current;
          if (anchor && list.contains(anchor.node))
            anchor.top = anchor.node.getBoundingClientRect().top;
        }}
      >
        {history.isLoading && (
          <p className={styles.state}>Đang tải tin nhắn…</p>
        )}
        {history.isError &&
          (!history.isFetchNextPageError || historyDenied) && (
            <div className={styles.state} role="alert">
              <p>Chưa tải được lịch sử tin nhắn.</p>
              <button
                type="button"
                disabled={history.isFetching}
                onClick={() => void history.refetch({ cancelRefetch: false })}
              >
                Tải lại tin nhắn
              </button>
            </div>
          )}
        {!historyDenied && history.hasNextPage && (
          <div className={styles.olderMessages}>
            {history.isFetchNextPageError && (
              <p role="alert">
                Chưa tải được tin cũ. Tin nhắn đang xem vẫn được giữ.
              </p>
            )}
            <button
              type="button"
              disabled={history.isFetching}
              aria-busy={history.isFetchingNextPage}
              onClick={loadOlder}
            >
              <ArrowUp size={15} aria-hidden="true" />
              {history.isFetchingNextPage
                ? "Đang tải tin cũ…"
                : history.isFetchNextPageError
                  ? "Thử tải lại tin cũ"
                  : "Tải tin nhắn cũ hơn"}
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
                : room.orderId
                  ? "Trao đổi với đối tác về việc chuẩn bị và giao nhận cuốn sách trong đơn này."
                  : room.terms?.exchangeIds.length
                    ? "Trao đổi về việc giao nhận và kiểm tra sách của hai bên."
                    : "Bạn có thể hỏi về tình trạng sách hoặc giá trước khi gửi thông tin nhận sách."}
            </p>
            {!expired && !body && (
              <button
                className={styles.suggestion}
                type="button"
                disabled={!!attempt}
                onClick={() => {
                  setBody(
                    room.orderId
                      ? "Chào bạn, mình trao đổi thêm về việc giao nhận đơn sách này nhé."
                      : isBuyer
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
          <ChatMessage
            key={message.id}
            message={message}
            own={message.senderId === userId}
            sender={message.senderId === userId ? "Bạn" : other.displayName}
          />
        ))}
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
          <div className={styles.composerBar}>
            <textarea
              ref={textareaRef}
              id="chat-message"
              rows={1}
              value={body}
              disabled={!!attempt}
              onChange={(event) =>
                setBody(clipChatMessage(event.target.value))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="Nhắn tin…"
              aria-describedby="chat-compose-help"
            />
            <button
              type="submit"
              className={styles.sendButton}
              title={
                sending
                  ? "Đang gửi…"
                  : attempt
                    ? "Thử gửi lại tin nhắn"
                    : "Gửi tin nhắn (Enter)"
              }
              aria-label={
                sending
                  ? "Đang gửi…"
                  : attempt
                    ? "Thử gửi lại tin nhắn"
                    : "Gửi tin nhắn"
              }
              disabled={sending || !body.trim() || connection !== "online"}
            >
              <Send size={16} aria-hidden="true" />
            </button>
            {body.length > 800 && (
              <span className={styles.charCount}>{body.length}/1.000</span>
            )}
          </div>
        )}
        {!expired && (
          <p id="chat-compose-help" className={styles.composeHelp}>
            Enter để gửi · Shift+Enter xuống dòng
          </p>
        )}
      </form>
    </section>
  );

  return (
    <section
      className={exchangeStyles.exchangeSheet}
      aria-label={`Cuộc trò chuyện với ${other.displayName}`}
    >
      <nav
        className={exchangeStyles.handoverNav}
        aria-label="Điều hướng phiếu giao dịch"
      >
        <ConversationBackLink className={exchangeStyles.proposalBack} />
        <span className={exchangeStyles.proposalCode}>
          {room.orderId
            ? `Đơn #${room.orderId.slice(0, 8).toUpperCase()}`
            : `Phiếu #${room.id.slice(0, 8).toUpperCase()}`}
        </span>
      </nav>

      <header className={exchangeStyles.handoverHeader}>
        <div>
          <h1>{headerTitle}</h1>
          <p>
            {isBuyer ? "Mua sách từ" : "Giao dịch với"}{" "}
            <strong dir="auto" title={other.displayName}>
              {other.displayName}
            </strong>
          </p>
        </div>
        <ExchangeChatDrawer
          viewerId={userId}
          exchangeId={room.id}
          transactionCode={(room.orderId ?? room.id).slice(0, 8).toUpperCase()}
          partnerName={other.displayName}
          defaultOpen={shouldOpenChat}
          latest={messages.map((m) => ({
            id: m.id,
            senderRole: m.senderId === userId ? "viewer" : "partner",
            text: m.body,
            sentAt: m.sentAt,
          }))}
        >
          {() => chatPanelContent}
        </ExchangeChatDrawer>
      </header>

      <nav
        className={`${sheet.mobileTabs} ${sheet.bookTabs}`}
        aria-label="Nội dung cuộc trao đổi"
        hidden
      >
        <button
          type="button"
          aria-pressed={panel === "sheet"}
          onClick={() => setPanel("sheet")}
        >
          {room.orderId ? "Đơn hàng" : "Phiếu thỏa thuận"}
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
        ref={sheetBodyRef}
        role="region"
        aria-label={
          room.orderId ? "Nội dung đơn hàng" : "Nội dung phiếu thỏa thuận"
        }
        tabIndex={0}
      >
        <NegotiationWorkspace
          room={room}
          userId={userId}
          buyNowEntry={searchParams.get("buyNow") === "1"}
          book={book.data}
          refresh={refreshRooms}
          frozen={!!orderAttempt.current}
          guidance={guidance}
          canCreateOrder={canCreate}
          onOpenOrderDialog={() => setOrderDialogOpen(true)}
          historyExchange={historyExchange}
          setHistoryExchange={setHistoryExchange}
          now={now}
          expired={expired}
        />
      </div>

      {active &&
        room.seller.id === userId &&
        ((canCreate && room.hasQuote) || orderAttempt.current) && (
          <PurchaseDialog
            open={orderDialogOpen}
            onClose={() => {
              setAcceptedCommission(undefined);
              setOrderDialogOpen(false);
            }}
            busy={orderBusy}
            title="Tạo đơn cho người mua"
            description="Kiểm tra thông tin nhận và giá sách trước khi tạo đơn."
            className={flow.flow}
          >
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (orderBusy) return;
                if (!commissionAccepted) return;
                if (!orderAttempt.current && !canCreate) return;
                const price = orderAttempt.current?.price ?? agreedBookPrice;
                if (
                  price == null ||
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
                  setAcceptedCommission(undefined);
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
                <div className={flow.agreedPrice}>
                  <span className={flow.agreedPriceLabel}>
                    Giá sách đã thỏa thuận (₫)
                  </span>
                  <p className={flow.agreedPriceValue}>
                    {orderBookPrice == null
                      ? "Chưa chốt giá"
                      : formatVnd(orderBookPrice)}
                  </p>
                  <span className={flow.agreedPriceHelp}>
                    Giá được chốt từ đề nghị đã được đối tác chấp nhận.
                  </span>
                </div>
              </div>
              {orderBookPrice != null && orderCommission != null && (
                <section
                  className={flow.commissionSummary}
                  aria-label="Giá sách và phí hoa hồng"
                >
                  <h3>Giá sách và phí hoa hồng</h3>
                  <dl>
                    {book.data?.salePrice != null ? (
                      <div>
                        <dt>Giá bài đăng</dt>
                        <dd>{formatVnd(book.data.salePrice)}</dd>
                      </div>
                    ) : (
                      <div>
                        <dt>Giá sách áp dụng cho đơn</dt>
                        <dd>{formatVnd(orderBookPrice)}</dd>
                      </div>
                    )}
                    {book.data?.salePrice != null &&
                      book.data.salePrice !== orderBookPrice && (
                        <div>
                          <dt>Giá sách đã thống nhất cho đơn</dt>
                          <dd>{formatVnd(orderBookPrice)}</dd>
                        </div>
                      )}
                    <div>
                      <dt>Phí hoa hồng ({commissionRate} giá sách)</dt>
                      <dd>−{formatVnd(orderCommission)}</dd>
                    </div>
                    <div className={flow.commissionNet}>
                      <dt>Dự kiến tiền sách còn lại sau hoa hồng</dt>
                      <dd>{formatVnd(orderBookPrice - orderCommission)}</dd>
                    </div>
                  </dl>
                  <p>
                    Phí này được trừ vào tiền sách khi quyết toán. Phí giao nhận tính riêng.
                  </p>
                </section>
              )}
              <label className={flow.commissionConsent}>
                <input
                  type="checkbox"
                  required
                  checked={commissionAccepted}
                  disabled={orderBusy}
                  onChange={(event) => setAcceptedCommission(event.target.checked ? commissionTerms : undefined)}
                />
                <span>
                  Tôi đã đọc và đồng ý để Lật lại thu phí hoa hồng {commissionRate} trên giá
                  sách khi giao dịch hoàn tất.
                </span>
              </label>
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
                    {room.quotePreview.shippingFee > 0 &&
                      `Phí giao nhận: ${formatVnd(room.quotePreview.shippingFee)} · `}
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
                disabled={
                  orderBusy ||
                  !commissionAccepted ||
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
        )}
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

// ─── Exchange status helpers ──────────────────────────────────────────────────

// ─── Trạng thái giao dịch ─────────────────────────────────────────────────────

type StatusTone = "attention" | "progress" | "complete" | "closed";
type StatusInfo = { label: string; tone: StatusTone };

function shortDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

/** Buy Now conversations: negotiation, agreed price and the created order. */
function buyNowStatus(room: PurchaseConversation, userId: string): StatusInfo {
  if (room.terms?.pendingProposal)
    return room.terms.pendingProposal.proposedById === userId
      ? { label: "Chờ đối tác phản hồi", tone: "progress" }
      : { label: "Cần bạn phản hồi", tone: "attention" };
  if (room.status === "OrderCreated")
    return { label: "Đã tạo đơn", tone: "complete" };
  if (room.status === "Expired") return { label: "Hết hạn", tone: "closed" };
  if (room.status === "Cancelled") return { label: "Đã đóng", tone: "closed" };
  return room.terms?.agreedPrice != null
    ? { label: "Đã thống nhất giá", tone: "progress" }
    : { label: "Đang thương lượng", tone: "progress" };
}

/** Book Exchange: proposal, funding, two-way delivery and inspection. */
function exchangeStatus(exchange: Exchange, userId: string): StatusInfo {
  switch (exchange.status) {
    case "Proposed": {
      if (
        exchange.proposalExpiresAt &&
        Date.parse(exchange.proposalExpiresAt) <= Date.now()
      )
        return { label: "Đề nghị đã hết hạn", tone: "closed" };
      return (exchange.lastProposedById ?? exchange.initiatorId) !== userId
        ? { label: "Cần bạn phản hồi", tone: "attention" }
        : { label: "Chờ đối tác phản hồi", tone: "progress" };
    }
    case "AcceptedAwaitingFunding":
      return { label: "Chờ đặt cọc", tone: "attention" };
    case "Preparing":
      return { label: "Chuẩn bị gửi sách", tone: "progress" };
    case "InTransit":
      return { label: "Đang giao nhận", tone: "progress" };
    case "Delivered":
      return exchange.initiatorReceivedAt && exchange.recipientReceivedAt
        ? { label: "Đang kiểm tra sách", tone: "progress" }
        : { label: "Chờ xác nhận đã nhận", tone: "progress" };
    case "Completed":
      return { label: "Hoàn tất", tone: "complete" };
    case "ResolutionPending":
      return { label: "Đang giải quyết sự cố", tone: "attention" };
    case "Cancelled":
      if (exchange.cancelReason === "CancelledByUser" && exchange.rejectionReason)
        return { label: "Đề nghị bị từ chối", tone: "closed" };
      return exchange.cancelReason === "FundingExpired" ||
        exchange.cancelReason === "ProposalExpired" ||
        exchange.cancelReason === "ShippingExpired"
        ? { label: "Hết hạn xử lý", tone: "closed" }
        : { label: "Đã hủy", tone: "closed" };
  }
}

const AUCTION_STATE_LABEL: Record<string, string> = {
  BuyNowPending: "Chờ thanh toán mua ngay",
  AwaitingWinnerPayment: "Chờ người thắng thanh toán",
  Sold: "Đã bán",
  Unsold: "Kết thúc, chưa có người trả giá",
  OnHold: "Phiên tạm dừng",
  Cancelled: "Phiên đã hủy",
  PaymentExpired: "Đã quá hạn thanh toán",
  SecondChanceOffered: "Đang mời người trả giá cao thứ hai",
};

/** Auctions the member sells or bids on, with the phase from the server clock. */
function auctionStatus(item: MyAuctionItem, serverTime: string): StatusInfo {
  const auction = item.auction;
  if (item.needsPayment) return { label: "Cần thanh toán", tone: "attention" };
  const phase = auctionPhase(auction, serverTime);
  if (phase === "Scheduled")
    return auction.openMode != null && auction.state === "Active"
      ? { label: "Chờ đủ người đăng ký", tone: "progress" }
      : { label: "Hẹn mở", tone: "progress" };
  if (phase === "Live") {
    if (item.role === "Seller")
      return { label: "Phiên của bạn đang mở", tone: "progress" };
    if (item.leading) return { label: "Bạn đang dẫn giá", tone: "progress" };
    return auction.bidderCount > 0
      ? { label: "Bạn đã bị vượt giá", tone: "attention" }
      : { label: "Chưa có người trả giá", tone: "progress" };
  }
  if (item.won && auction.state === "Sold")
    return { label: "Bạn đã thắng phiên", tone: "complete" };
  if (item.role === "Seller" && auction.state === "Sold")
    return { label: "Đã bán", tone: "complete" };
  return {
    label: AUCTION_STATE_LABEL[auction.state] ?? "Đã kết thúc",
    tone:
      auction.state === "Unsold" || auction.state === "Cancelled"
        ? "closed"
        : "complete",
  };
}

function exchangeBookTitle(exchange: Exchange, userId: string) {
  const received =
    exchange.initiatorId === userId
      ? [exchange.agreement?.recipientBook]
      : (exchange.agreement?.initiatorBooks ?? []);
  const titles = received
    .map((book) => book?.book.title)
    .filter((title): title is string => Boolean(title));
  return titles.length ? titles.join(", ") : "Cuộc trao đổi sách";
}

function exchangePartner(exchange: Exchange, userId: string) {
  return (
    (exchange.initiatorId === userId
      ? exchange.agreement?.recipientBook.ownerDisplayName
      : exchange.agreement?.initiatorBooks[0]?.ownerDisplayName) ??
    "Đối tác trao đổi"
  );
}

/** The deadline that matters next for this exchange, if there is one. */
function exchangeDeadline(exchange: Exchange) {
  if (exchange.status === "Proposed" && exchange.proposalExpiresAt)
    return `Hạn phản hồi ${dateTime(exchange.proposalExpiresAt)}`;
  if (exchange.status === "AcceptedAwaitingFunding" && exchange.fundingDeadline)
    return `Hạn đặt cọc ${dateTime(exchange.fundingDeadline)}`;
  if (exchange.status === "Preparing" && exchange.shippingDeadline)
    return `Hạn gửi sách ${dateTime(exchange.shippingDeadline)}`;
  if (exchange.status === "Delivered" && exchange.inspectionDeadline)
    return `Hạn kiểm tra ${dateTime(exchange.inspectionDeadline)}`;
  return undefined;
}

// ─── Giao dịch đổi sách ───────────────────────────────────────────────────────

function ExchangeCard({
  exchange,
  userId,
  room,
}: {
  exchange: Exchange;
  userId: string;
  room?: PurchaseConversation;
}) {
  const status = exchangeStatus(exchange, userId);
  const deadline = exchangeDeadline(exchange);
  return (
    <article className={styles.txnCard}>
      <div className={styles.txnCardHead}>
        <span className={styles.typeBadge}>Đổi sách</span>
        <span className={styles.statusBadge} data-tone={status.tone}>
          {status.label}
        </span>
      </div>
      <div className={styles.txnCardIdentity}>
        <span className={styles.txnCardIcon} aria-hidden="true">
          <ArrowLeftRight size={22} />
        </span>
        <div>
          <h3 className={styles.txnCardTitle}>
            <Link to={ROUTES.exchangeDetail(exchange.id)} viewTransition>
              {exchangeBookTitle(exchange, userId)}
            </Link>
          </h3>
          <p className={styles.txnCardMeta}>
            Với {exchangePartner(exchange, userId)}
          </p>
          <p className={styles.txnCardMeta}>
            {exchange.initiatorId === userId ? "Bạn đề xuất" : "Bạn nhận đề nghị"}{" "}
            ·{" "}
            <time dateTime={exchange.createdAt}>
              {shortDate(exchange.createdAt)}
            </time>
          </p>
        </div>
      </div>
      {deadline && <p className={styles.txnCardNote}>{deadline}</p>}
      <div className={styles.txnCardFoot}>
        <span className={styles.txnCardFootNote}>
          {exchange.diffAmount > 0
            ? `Bù ${formatVnd(exchange.diffAmount)}`
            : "Không bù tiền"}
        </span>
        <span className={styles.txnCardActions}>
          {room && (
            <Link
              className={styles.txnLink}
              to={ROUTES.chat(room.id)}
              viewTransition
            >
              Hội thoại <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          )}
          <Link
            className={styles.txnLink}
            to={ROUTES.exchangeDetail(exchange.id)}
            viewTransition
          >
            Mở phiếu <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </span>
      </div>
    </article>
  );
}

function ExchangeList({
  userId,
  items,
  rooms,
  pending,
  error,
  onRetry,
}: {
  userId: string;
  items: Exchange[];
  rooms: PurchaseConversation[];
  pending: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (pending)
    return (
      <p className={styles.panelState} role="status">
        Đang tải giao dịch đổi sách…
      </p>
    );
  if (error)
    return (
      <div className={styles.panelError} role="alert">
        <p>Chưa tải được giao dịch đổi sách.</p>
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" /> Thử lại
        </button>
      </div>
    );
  if (!items.length)
    return (
      <div className={styles.panelEmpty}>
        <ArrowLeftRight size={30} aria-hidden="true" />
        <h3>Chưa có giao dịch đổi sách</h3>
        <p>
          Mở một cuốn sách để gửi đề nghị đổi. Đề nghị, khoản cọc và hành trình
          giao nhận hai chiều sẽ được theo dõi tại đây.
        </p>
        <Link className={styles.panelCta} to="/books?data=live">
          Tìm sách để đổi <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    );
  return (
    <div className={styles.txnGrid} role="list">
      {items.map((exchange) => {
        const room = rooms.find(
          (item) =>
            item.terms?.exchangeIds?.includes(exchange.id) ||
            item.terms?.activeExchangeId === exchange.id,
        );
        return (
          <div key={exchange.id} role="listitem">
            <ExchangeCard exchange={exchange} userId={userId} room={room} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Giao dịch đấu giá ────────────────────────────────────────────────────────

function AuctionCard({
  item,
  serverTime,
}: {
  item: MyAuctionItem;
  serverTime: string;
}) {
  const auction = item.auction;
  const winnerOrder = item.role === "Bidder" && item.won;
  const destination = winnerOrder ? `${ROUTES.auctionOrder(auction.id)}?from=chat` : ROUTES.auctionDetail(auction.id);
  const status = auctionStatus(item, serverTime);
  const priceLabel =
    auction.currentPrice === null
      ? "Giá khởi điểm"
      : auction.state === "Sold"
        ? "Giá chốt"
        : "Giá hiện tại";
  return (
    <article className={styles.txnCard}>
      <div className={styles.txnCardHead}>
        <span className={styles.typeBadge}>
          Đấu giá · {item.role === "Seller" ? "Bạn bán" : "Bạn mua"}
        </span>
        <span className={styles.statusBadge} data-tone={status.tone}>
          {status.label}
        </span>
      </div>
      <div className={styles.txnCardIdentity}>
        <span className={styles.txnCardCover}>
          <AuctionPhoto auction={auction} interactive={false} />
        </span>
        <div>
          <h3 className={styles.txnCardTitle}>
            <Link to={destination}>{auction.title}</Link>
          </h3>
          <p className={styles.txnCardMeta}>{auction.pointName}</p>
          <p className={styles.txnCardMeta}>
            {priceLabel}:{" "}
            <strong>{formatVnd(auction.currentPrice ?? auction.startPrice)}</strong>
          </p>
        </div>
      </div>
      {item.needsPayment && item.paymentDeadline && (
        <p className={styles.txnCardNote}>
          Hạn thanh toán {dateTime(item.paymentDeadline)}
        </p>
      )}
      <div className={styles.txnCardFoot}>
        <span className={styles.txnCardFootNote}>
          {auction.bidderCount} người trả giá
        </span>
        <Link className={styles.txnLink} to={destination}>
          {winnerOrder ? "Mở đơn đấu giá" : "Xem phiên"} <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function AuctionList({
  items,
  serverTime,
  pending,
  error,
  onRetry,
  limit,
}: {
  items: MyAuctionItem[];
  serverTime: string;
  pending: boolean;
  error: boolean;
  onRetry: () => void;
  limit?: number;
}) {
  if (pending)
    return (
      <p className={styles.panelState} role="status">
        Đang tải giao dịch đấu giá…
      </p>
    );
  if (error)
    return (
      <div className={styles.panelError} role="alert">
        <p>Chưa tải được giao dịch đấu giá.</p>
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" /> Thử lại
        </button>
      </div>
    );
  if (!items.length)
    return (
      <div className={styles.panelEmpty}>
        <Gavel size={30} aria-hidden="true" />
        <h3>Chưa có giao dịch đấu giá</h3>
        <p>
          Phiên bạn mở bán hoặc đang trả giá sẽ xuất hiện tại đây cùng giá hiện
          tại và bước tiếp theo.
        </p>
        <Link className={styles.panelCta} to={ROUTES.auctions}>
          Xem các phiên đang mở <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    );
  const visible = limit ? items.slice(0, limit) : items;
  return (
    <>
      <div className={styles.txnGrid} role="list">
        {visible.map((item) => (
          <div key={item.auction.id} role="listitem">
            <AuctionCard item={item} serverTime={serverTime} />
          </div>
        ))}
      </div>
      {items.length > visible.length && (
        <p className={styles.panelMore}>
          <Link to={ROUTES.myAuctions}>
            Xem tất cả {items.length} phiên đấu giá{" "}
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </p>
      )}
    </>
  );
}

// ─── Trang quản lý giao dịch tập trung ────────────────────────────────────────

type TransactionTab = "all" | "buy" | "exchange" | "auction";

const TRANSACTION_TABS: TransactionTab[] = ["all", "buy", "exchange", "auction"];

const TAB_LABELS: Record<TransactionTab, string> = {
  all: "Tất cả",
  buy: "Mua ngay",
  exchange: "Đổi sách",
  auction: "Đấu giá",
};

function TransactionHub({
  userId,
  rooms,
  roomsLoading,
  roomsError,
  refetchRooms,
}: {
  userId: string;
  rooms: PurchaseConversation[];
  roomsLoading: boolean;
  roomsError: boolean;
  refetchRooms: () => void;
}) {
  const [tabParams, setTabParams] = useSearchParams();
  const requestedTab = tabParams.get("tab");
  const activeTab = TRANSACTION_TABS.find((tab) => tab === requestedTab) ?? "all";
  function setActiveTab(tab: TransactionTab) {
    setTabParams((previous) => {
      const next = new URLSearchParams(previous);
      if (tab === "all") next.delete("tab");
      else next.set("tab", tab);
      return next;
    }, { replace: true, preventScrollReset: true });
  }
  const exchanges = useQuery({
    queryKey: ["conversation-exchanges", userId],
    queryFn: getExchanges,
    retry: false,
    refetchInterval: 10000,
  });
  const auctions = useQuery({
    queryKey: ["my-auctions", userId, "hub"],
    queryFn: () => listMyAuctions("all"),
    retry: false,
    refetchInterval: 20000,
  });
  const buyRooms = rooms.filter((room) => room.terms?.mode !== "Exchange");
  // An exchange-mode conversation has no Exchange record until a proposal is
  // sent, so it is reachable from its own notice in the exchange category.
  const exchangeRooms = rooms.filter(
    (room) =>
      room.terms?.mode === "Exchange" &&
      !room.terms.exchangeIds?.length &&
      !room.terms.activeExchangeId,
  );
  const exchangeItems = exchanges.data?.items ?? [];
  const auctionItems = auctions.data?.items ?? [];
  const auctionTime = auctions.data?.serverTime ?? "";
  const attention: Record<TransactionTab, number> = {
    all: 0,
    buy: buyRooms.filter(
      (room) => buyNowStatus(room, userId).tone === "attention",
    ).length,
    exchange: exchangeItems.filter(
      (exchange) => exchangeStatus(exchange, userId).tone === "attention",
    ).length,
    auction: auctionItems.filter(
      (item) => auctionStatus(item, auctionTime).tone === "attention",
    ).length,
  };
  attention.all = attention.buy + attention.exchange + attention.auction;
  const counts: Record<TransactionTab, number> = {
    all: rooms.length + exchangeItems.length + auctionItems.length,
    buy: buyRooms.length,
    exchange: exchangeItems.length,
    auction: auctionItems.length,
  };
  const tabId = (tab: TransactionTab) => `txn-tab-${tab}`;
  const panelId = (tab: TransactionTab) => `txn-panel-${tab}`;
  const pendingPart = [
    attention.buy ? `${attention.buy} mua ngay` : "",
    attention.exchange ? `${attention.exchange} đổi sách` : "",
    attention.auction ? `${attention.auction} đấu giá` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={styles.hub}>
      <header className={styles.pageHeading}>
        <div>
          <h1>Giao dịch của bạn</h1>
          <p>
            Mua ngay, đổi sách và đấu giá — theo dõi trạng thái của từng giao
            dịch tại một nơi.
          </p>
        </div>
        <Link className={styles.browseLink} to="/books?data=live">
          Tìm sách <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </header>

      {attention.all > 0 && (
        <p className={styles.attentionBanner} role="status">
          <Clock3 size={16} aria-hidden="true" />
          {attention.all} giao dịch đang chờ bạn xử lý
          {pendingPart ? ` (${pendingPart})` : ""}.
        </p>
      )}

      <nav
        className={styles.tabNav}
        role="tablist"
        aria-label="Loại giao dịch"
        onKeyDown={(event) => {
          const index = TRANSACTION_TABS.indexOf(activeTab);
          const next =
            event.key === "ArrowRight"
              ? TRANSACTION_TABS[(index + 1) % TRANSACTION_TABS.length]
              : event.key === "ArrowLeft"
                ? TRANSACTION_TABS[
                    (index - 1 + TRANSACTION_TABS.length) %
                      TRANSACTION_TABS.length
                  ]
                : event.key === "Home"
                  ? TRANSACTION_TABS[0]
                  : event.key === "End"
                    ? TRANSACTION_TABS[TRANSACTION_TABS.length - 1]
                    : undefined;
          if (!next) return;
          event.preventDefault();
          setActiveTab(next);
          document.getElementById(tabId(next))?.focus();
        }}
      >
        {TRANSACTION_TABS.map((tab) => (
          <button
            key={tab}
            id={tabId(tab)}
            role="tab"
            type="button"
            className={styles.tabButton}
            aria-selected={activeTab === tab}
            aria-controls={panelId(tab)}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
          >
            <span className={styles.tabLabel}>{TAB_LABELS[tab]}</span>
            <span className={styles.tabMeta}>
              {counts[tab] > 0 ? `${counts[tab]} giao dịch` : "Chưa có giao dịch"}
              {attention[tab] > 0 && (
                <span className={styles.tabAttention}>
                  {" "}
                  · {attention[tab]} cần xử lý
                </span>
              )}
            </span>
          </button>
        ))}
      </nav>

      {TRANSACTION_TABS.map((tab) => (
        <div
          key={tab}
          id={panelId(tab)}
          role="tabpanel"
          aria-labelledby={tabId(tab)}
          hidden={activeTab !== tab}
          className={styles.tabPanel}
        >
          {activeTab !== tab ? null : tab === "all" ? (
            <>
              <section
                className={styles.panelSection}
                aria-label="Hội thoại mua ngay và đổi sách"
              >
                <ConversationInbox
                  rooms={rooms}
                  loading={roomsLoading}
                  error={roomsError}
                  retry={refetchRooms}
                  userId={userId}
                />
              </section>
              <section className={styles.panelSection} aria-label="Đấu giá">
                <div className={styles.sectionHead}>
                  <h2>Đấu giá</h2>
                  <Link to={ROUTES.myAuctions}>
                    Quản lý phiên <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </div>
                <AuctionList
                  items={auctionItems}
                  serverTime={auctionTime}
                  pending={auctions.isPending}
                  error={auctions.isError}
                  onRetry={() => void auctions.refetch()}
                  limit={4}
                />
              </section>
            </>
          ) : tab === "buy" ? (
            <section aria-label="Giao dịch mua ngay">
              <p className={styles.panelIntro}>
                Hội thoại mua ngay: hỏi về sách, thống nhất giá và tạo đơn. Đơn
                đã tạo được theo dõi tiếp ở phần đơn hàng.
              </p>
              <ConversationInbox
                rooms={buyRooms}
                showExchanges={false}
                loading={roomsLoading}
                error={roomsError}
                retry={refetchRooms}
                userId={userId}
              />
            </section>
          ) : tab === "exchange" ? (
            <section aria-label="Giao dịch đổi sách">
              <div className={styles.sectionHead}>
                <h2>Giao dịch đổi sách</h2>
                <Link to={ROUTES.exchangeMine}>
                  Lịch sử đổi sách{" "}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </div>
              {exchangeRooms.length > 0 && (
                <div className={styles.panelNotice}>
                  <p>
                    Đang thỏa thuận đổi sách trong hội thoại{" "}
                    {exchangeRooms.map((room, index) => (
                      <span key={room.id}>
                        {index > 0 && ", "}
                        <Link to={ROUTES.chat(room.id)} viewTransition>
                          với{" "}
                          {room.buyer.id === userId
                            ? room.seller.displayName
                            : room.buyer.displayName}
                        </Link>
                      </span>
                    ))}{" "}
                    — phiếu đổi sách xuất hiện khi hai bên gửi đề nghị.
                  </p>
                </div>
              )}
              <ExchangeList
                userId={userId}
                items={exchangeItems}
                rooms={rooms}
                pending={exchanges.isPending}
                error={exchanges.isError}
                onRetry={() => void exchanges.refetch()}
              />
            </section>
          ) : (
            <section aria-label="Giao dịch đấu giá">
              <div className={styles.sectionHead}>
                <h2>Giao dịch đấu giá</h2>
                <Link to={ROUTES.myAuctions}>
                  Quản lý phiên <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </div>
              <AuctionList
                items={auctionItems}
                serverTime={auctionTime}
                pending={auctions.isPending}
                error={auctions.isError}
                onRetry={() => void auctions.refetch()}
              />
            </section>
          )}
        </div>
      ))}
    </div>
  );
}

export function ChatPage() {
  const { roomId } = useParams<{ roomId?: string }>();
  const location = useLocation();
  const position = useInboxPosition();
  const transitioning = useConversationTransition("/chat");
  const scrollKey = useRef<string | undefined>(undefined);
  const frameRef = useRef<HTMLDivElement>(null);
  const auth = useSession();
  const viewerId = auth.status === "authenticated" ? auth.user.id : undefined;
  const cache = useQueryClient();
  const roomKey = ["purchase-conversation", roomId, viewerId] as const;
  const roomLive = useTransactionLive("conversation", roomId, () => {
    for (const queryKey of [roomKey, ["conversation-events", roomId], ["purchase-conversations", viewerId]]) {
      void cache.invalidateQueries({ queryKey });
    }
  });
  const rooms = useQuery({
    queryKey: [
      "purchase-conversations",
      auth.status === "authenticated" ? auth.user.id : undefined,
    ],
    queryFn: getPurchaseConversations,
    enabled: auth.status === "authenticated",
    refetchInterval: 3000,
  });
  useTransactionLive("inbox", roomId ? undefined : viewerId, () => {
    for (const queryKey of [["purchase-conversations", viewerId], ["conversation-exchanges", viewerId], ["my-auctions", viewerId, "hub"]]) {
      void cache.invalidateQueries({ queryKey });
    }
  });
  const room = useQuery({
    queryKey: roomKey,
    queryFn: () => getPurchaseConversation(roomId!),
    enabled: !!roomId && auth.status === "authenticated",
    refetchInterval: roomLive ? 30_000 : 3_000,
  });
  useLayoutEffect(() => {
    if (auth.status !== "authenticated" || (!roomId && rooms.isPending)) return;
    if (scrollKey.current === location.key) return;
    scrollKey.current = location.key;
    window.scrollTo({
      top: roomId ? 0 : position.read().scrollY,
      behavior: "instant",
    });
  }, [roomId, rooms.isPending, location.key, position, auth.status]);
  useEffect(() => {
    if (transitioning || auth.status !== "authenticated") return;
    if (roomId && location.state?.chatFromInbox) {
      frameRef.current?.focus({ preventScroll: true });
    } else if (!roomId && position.read().selectedId) {
      const card = [
        ...document.querySelectorAll<HTMLElement>("[data-room-id]"),
      ].find(
        (element) => element.dataset.roomId === position.read().selectedId,
      );
      card
        ?.querySelector<HTMLAnchorElement>("a")
        ?.focus({ preventScroll: true });
    }
  }, [
    transitioning,
    roomId,
    location.key,
    location.state,
    position,
    auth.status,
  ]);
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
    for (const key of [
      "home-shelves",
      "catalog-search",
      "exchange-public-listings",
    ]) {
      void cache.invalidateQueries({ queryKey: [key] });
    }
  };
  if (auth.status !== "authenticated")
    return (
      <section className={styles.guest}>
        <h1>Giao dịch của bạn</h1>
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
    <div
      className={styles.root}
      data-room-selected={!!roomId}
      data-chat-morph-inbox={(!roomId && transitioning) || undefined}
    >
      {!roomId ? (
        <TransactionHub
          userId={auth.user.id}
          rooms={rooms.data ?? []}
          roomsLoading={rooms.isPending}
          roomsError={rooms.isError}
          refetchRooms={() => void rooms.refetch()}
        />
      ) : (
        <div
          ref={frameRef}
          tabIndex={-1}
          className={styles.room}
          aria-label="Phiếu và hội thoại"
          data-chat-morph-room={transitioning || undefined}
        >
          {room.isError && room.data && (
            <div role="alert" className={sheet.error}>
              Chưa cập nhật được hội thoại. Dữ liệu đã tải vẫn được giữ.{" "}
              <button type="button" onClick={() => void room.refetch()}>
                Thử lại
              </button>
            </div>
          )}
          {room.data ? (
            <ChatRoom
              key={`${auth.user.id}:${room.data.id}`}
              room={room.data}
              userId={auth.user.id}
              refreshRooms={refresh}
            />
          ) : (
            <PendingChatRoom
              preview={rooms.data?.find((item) => item.id === roomId)}
              pending={room.isPending}
              retry={() => void room.refetch()}
            />
          )}
        </div>
      )}
    </div>
  );
}

function PendingChatRoom({
  preview,
  pending,
  retry,
}: {
  preview?: PurchaseConversation;
  pending: boolean;
  retry: () => void;
}) {
  return (
    <section
      className={exchangeStyles.exchangeSheet}
      aria-label="Đang mở phiếu và hội thoại"
    >
      <div className={exchangeStyles.handoverNav}>
        <ConversationBackLink className={exchangeStyles.backLink} />
        {preview?.id && (
          <span className={exchangeStyles.code}>
            Phiếu #{preview.id.slice(0, 8).toUpperCase()}
          </span>
        )}
      </div>
      <header className={exchangeStyles.handoverHeader}>
        <div>
          <h1>{pending ? "Đang mở hội thoại…" : "Chưa mở được hội thoại"}</h1>
          <p>
            {pending
              ? "Đang tải phiếu thỏa thuận và tin nhắn…"
              : "Hội thoại không tồn tại hoặc bạn không có quyền truy cập."}
          </p>
        </div>
      </header>
      <div
        className={styles.pendingRoom}
        role={pending ? "status" : "alert"}
      >
        <p>
          {pending
            ? "Đang tải phiếu thỏa thuận và tin nhắn…"
            : "Hội thoại không tồn tại hoặc bạn không có quyền truy cập."}
        </p>
        {!pending && (
          <button
            type="button"
            className={exchangeStyles.secondaryButton}
            onClick={retry}
          >
            Thử lại
          </button>
        )}
      </div>
    </section>
  );
}
