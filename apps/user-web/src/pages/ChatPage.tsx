import { NegotiationWorkspace } from "./NegotiationWorkspace";
import { ConversationCard, LegacyCard } from "../components/conversation/ConversationInbox";
import { SelectMenu } from "../components/SelectMenu";
import { CollectionPager } from "../components/Pagination/CollectionPager";
import { ExchangeCard } from "../components/conversation/ExchangeCard";
import { Facts, NextStep } from "../components/conversation/CardParts";
import { auctionFacts, auctionNext, auctionStatus, conversationStatus, exchangeStatus } from "../components/conversation/transaction-status";
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
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTransactionLive } from "../hooks/useTransactionLive";
import { io, type Socket } from "socket.io-client";
import { ApiError, CHAT_MESSAGE_LIMIT, CHAT_RATE_LIMIT_TEXT, DEFAULT_SALE_COMMISSION_BPS, chatSendWasRateLimited, clipChatMessage, directOrderCommission, formatSaleFeeRate } from "@used-books/session-client";
import { z } from "zod";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ArrowDownUp, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpRight, Gavel, HandCoins, LayoutGrid, MapPin, MessagesSquare, RefreshCw, Search, Send, X, type LucideIcon } from "lucide-react";
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
import hub from "./ChatHub.module.css";
import card from "../components/conversation/TransactionCard.module.css";
import { InfoTip } from "../components/InfoTip";
import exchangeStyles from "./ExchangeDetailPage.module.css";
import { getExchanges, type Exchange } from "../services/exchange";
import { listMyAuctions, type MyAuctionItem } from "../services/auctions";
import { AuctionPhoto } from "../components/AuctionGallery";

const configuredBase =
  import.meta.env["VITE_API_BASE_URL"] || "http://localhost:3000/api/v1";
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
  const cache = useQueryClient();
  // The parent page owns the conversation watch; this only reads whether it is live.
  const roomLive = useTransactionLive("conversation", room.id, () => {});
  // Exchange messages join this history; the exchange version includes its newest message.
  const exchangeLive = useTransactionLive(
    "exchange",
    room.terms?.activeExchangeId ?? room.terms?.exchangeIds.at(-1),
    () => void cache.invalidateQueries({ queryKey: ["purchase-message-history", userId, room.id] }),
  );
  const history = useInfiniteQuery({
    queryKey: ["purchase-message-history", userId, room.id],
    queryFn: ({ pageParam }) => getPurchaseMessageHistory(room.id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page, _pages, _param, params) =>
      page.olderCursor && !params.includes(page.olderCursor) ? page.olderCursor : undefined,
    retry: false,
    refetchInterval: room.terms?.exchangeIds.length ? (exchangeLive ? 30_000 : 3_000) : false,
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
    refetchInterval: roomLive ? 30_000 : 3_000,
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
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      timeout: 10_000,
    });
    socketRef.current = socket;
    let disposed = false;
    let currentToken = session.getAccessToken();
    const unsubscribeSession = session.subscribe(() => {
      if (disposed) return;
      const nextToken = session.getAccessToken();
      if (nextToken === currentToken) return;
      currentToken = nextToken;
      if (nextToken) {
        socket.disconnect().connect();
      } else {
        socket.disconnect();
      }
    });
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
      unsubscribeSession();
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

// ─── Giao dịch đấu giá ────────────────────────────────────────────────────────

function AuctionCard({
  item,
  serverTime,
  index,
}: {
  item: MyAuctionItem;
  serverTime: string;
  index: number;
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
    <article className={card.card} data-tone={status.tone} style={{ "--i": index } as CSSProperties}>
      <div className={card.top}>
        <span className={card.kind} data-kind="auction">
          <Gavel size={13} aria-hidden="true" /> Đấu giá · {item.role === "Seller" ? "Bạn bán" : "Bạn mua"}
        </span>
        <span className={card.status}>{status.label}</span>
      </div>
      <div className={card.main}>
        <span className={card.cover}>
          <AuctionPhoto auction={auction} interactive={false} />
        </span>
        <div>
          <h3 className={card.title}>
            <Link to={destination}>{auction.title}</Link>
          </h3>
          <p className={card.who}>
            <MapPin size={14} aria-hidden="true" /> {auction.pointName}
          </p>
          <strong className={card.price}>
            <small>{priceLabel}</small>
            {formatVnd(auction.currentPrice ?? auction.startPrice)}
          </strong>
        </div>
      </div>
      <NextStep>{auctionNext(item, serverTime)}</NextStep>
      <Facts facts={auctionFacts(item)} />
      <div className={card.foot}>
        <span className={card.footNote}>
          {item.role === "Seller" ? "Phiên của bạn" : "Bạn tham gia"}
        </span>
        <Link className={card.go} to={destination} aria-label={`${winnerOrder ? "Mở đơn đấu giá" : "Xem phiên"}: ${auction.title}`}>
          {winnerOrder ? "Mở đơn" : "Xem phiên"} <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
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
const TAB_ICONS: Record<TransactionTab, LucideIcon> = {
  all: LayoutGrid,
  buy: HandCoins,
  exchange: ArrowLeftRight,
  auction: Gavel,
};

type SortKey = "attention" | "newest" | "oldest";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "attention", label: "Cần xử lý trước" },
  { value: "newest", label: "Mới nhất" },
  { value: "oldest", label: "Cũ nhất" },
];
const PAGE_SIZE = 12;

/** One card in a hub list, with what search and sorting need. */
type Entry =
  | { type: "room"; key: string; room: PurchaseConversation; at: number; attention: boolean; text: string }
  | { type: "exchange"; key: string; exchange: Exchange; room?: PurchaseConversation; at: number; attention: boolean; text: string }
  | { type: "auction"; key: string; item: MyAuctionItem; at: number; attention: boolean; text: string };

/** Case- and accent-insensitive, so "dac nhan tam" finds "Đắc nhân tâm". */
const fold = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/gi, "d").toLowerCase();

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
  // ChatPage owns the inbox watch and its invalidations; this reads its state.
  const hubLive = useTransactionLive("inbox", userId, () => {});
  const position = useInboxPosition();
  const [params, setParams] = useSearchParams();
  const activeTab = TRANSACTION_TABS.find((tab) => tab === params.get("tab")) ?? "all";
  const query = params.get("q") ?? "";
  const sort = SORTS.find((option) => option.value === params.get("sort"))?.value ?? "attention";
  const requestedPage = Math.max(1, Number(params.get("page")) || 1);
  // Tab, search, sort and page live in the URL, so Back returns to the same list.
  function update(patch: Record<string, string | null>) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true, preventScrollReset: true });
  }
  const setActiveTab = (tab: TransactionTab) => update({ tab: tab === "all" ? null : tab, page: null });
  useLayoutEffect(() => {
    const rememberScroll = () => {
      if (window.location.pathname === "/chat") position.save({ scrollY: window.scrollY });
    };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => window.removeEventListener("scroll", rememberScroll);
  }, [position]);

  const exchanges = useQuery({
    queryKey: ["conversation-exchanges", userId],
    queryFn: getExchanges,
    retry: false,
    refetchInterval: hubLive ? 30_000 : 10_000,
  });
  const auctions = useQuery({
    queryKey: ["my-auctions", userId, "hub"],
    queryFn: () => listMyAuctions("all"),
    retry: false,
    refetchInterval: 20000,
  });
  // Book titles for searching conversations: the same reads the cards make,
  // only while a search is typed.
  const listings = useQueries({
    queries: rooms.map((room) => ({
      queryKey: ["public-listing", room.listingId],
      queryFn: () => getPublicListing(room.listingId),
      enabled: query.trim().length > 0,
      retry: false,
      staleTime: 60000,
    })),
  });

  const exchangeItems = exchanges.data?.items ?? [];
  const auctionItems = auctions.data?.items ?? [];
  const auctionTime = auctions.data?.serverTime ?? "";
  const roomOf = (exchange: Exchange) =>
    rooms.find((room) => room.terms?.exchangeIds?.includes(exchange.id) || room.terms?.activeExchangeId === exchange.id);

  const roomEntries: Entry[] = rooms.map((room, index) => {
    const partner = room.buyer.id === userId ? room.seller : room.buyer;
    const listing = listings[index]?.data;
    return {
      type: "room", key: `room-${room.id}`, room, at: Date.parse(room.createdAt),
      attention: conversationStatus(room, userId).tone === "attention",
      text: fold([partner.displayName, listing?.bundle?.title, listing?.book.title].filter(Boolean).join(" ")),
    };
  });
  const exchangeEntries: Entry[] = exchangeItems.map((exchange) => ({
    type: "exchange", key: `exchange-${exchange.id}`, exchange, room: roomOf(exchange), at: Date.parse(exchange.createdAt),
    attention: exchangeStatus(exchange, userId).tone === "attention",
    text: fold([
      exchangeBookTitle(exchange, userId),
      exchange.agreement?.recipientBook.book.title,
      ...(exchange.agreement?.initiatorBooks.map((book) => book.book.title) ?? []),
      exchange.agreement?.recipientBook.ownerDisplayName,
      exchange.agreement?.initiatorBooks[0]?.ownerDisplayName,
    ].filter(Boolean).join(" ")),
  }));
  const auctionEntries: Entry[] = auctionItems.map((item) => ({
    type: "auction", key: `auction-${item.auction.id}`, item, at: Date.parse(item.auction.startAt),
    attention: auctionStatus(item, auctionTime).tone === "attention",
    text: fold([item.auction.title, item.auction.pointName, item.auction.sellerName].filter(Boolean).join(" ")),
  }));
  const isRoom = (entry: Entry): entry is Extract<Entry, { type: "room" }> => entry.type === "room";
  const swapRoom = (entry: Entry) =>
    isRoom(entry) && entry.room.terms?.mode === "Exchange" && !entry.room.terms.exchangeIds?.length && !entry.room.terms.activeExchangeId;
  const byTab: Record<TransactionTab, Entry[]> = {
    // Exchanges with a conversation are reached through it; the rest stand alone.
    all: [...roomEntries, ...exchangeEntries.filter((entry) => entry.type === "exchange" && !entry.room), ...auctionEntries],
    buy: roomEntries.filter((entry) => isRoom(entry) && entry.room.terms?.mode !== "Exchange"),
    exchange: [...roomEntries.filter(swapRoom), ...exchangeEntries],
    auction: auctionEntries,
  };
  const attention = Object.fromEntries(
    TRANSACTION_TABS.map((tab) => [tab, byTab[tab].filter((entry) => entry.attention).length]),
  ) as Record<TransactionTab, number>;

  const needle = fold(query.trim());
  const matched = byTab[activeTab]
    .filter((entry) => !needle || entry.text.includes(needle))
    .sort((a, b) =>
      sort === "oldest" ? a.at - b.at
        : sort === "newest" ? b.at - a.at
          : Number(b.attention) - Number(a.attention) || b.at - a.at,
    );
  const totalPages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const shown = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Which sources this tab reads, for loading and error lines.
  const sources = [
    activeTab !== "auction" && { name: "hội thoại", pending: roomsLoading, error: roomsError, retry: refetchRooms },
    (activeTab === "all" || activeTab === "exchange") && { name: "đổi sách", pending: exchanges.isPending, error: exchanges.isError, retry: () => void exchanges.refetch() },
    (activeTab === "all" || activeTab === "auction") && { name: "đấu giá", pending: auctions.isPending, error: auctions.isError, retry: () => void auctions.refetch() },
  ].filter((source): source is { name: string; pending: boolean; error: boolean; retry: () => void } => !!source);
  const loading = sources.some((source) => source.pending);

  const tabId = (tab: TransactionTab) => `txn-tab-${tab}`;
  const goToTab = (tab: TransactionTab) => {
    setActiveTab(tab);
    document.getElementById(tabId(tab))?.focus();
  };
  const empties: Record<TransactionTab, { art: string; title: string; text: ReactNode; cta: { to: string; label: string } }> = {
    all: { art: "/illustrations/chat/empty-inbox.svg", title: "Chưa có giao dịch nào", text: <>Mở một cuốn sách để <b>hỏi mua</b>, <b>gửi ý định đổi</b> hoặc tham gia một phiên đấu giá.</>, cta: { to: "/books?data=live", label: "Tìm một cuốn sách" } },
    buy: { art: "/illustrations/chat/empty-inbox.svg", title: "Chưa có hội thoại mua ngay", text: <>Mở một cuốn sách để <b>hỏi mua</b>; cuộc trao đổi được lưu tại đây.</>, cta: { to: "/books?data=live", label: "Tìm một cuốn sách" } },
    exchange: { art: "/illustrations/chat/empty-inbox.svg", title: "Chưa có giao dịch đổi sách", text: <>Mở một cuốn sách để <b>gửi đề nghị đổi</b>; đề nghị, khoản cọc và giao nhận hai chiều được theo dõi tại đây.</>, cta: { to: "/books?data=live", label: "Tìm sách để đổi" } },
    auction: { art: "/illustrations/my-auctions/empty-rack.svg", title: "Chưa có giao dịch đấu giá", text: <>Phiên bạn <b>mở bán</b> hoặc <b>đang trả giá</b> xuất hiện tại đây cùng giá hiện tại và bước tiếp theo.</>, cta: { to: ROUTES.auctions, label: "Xem các phiên đang mở" } },
  };
  const empty = empties[activeTab];

  return (
    <div className={hub.hub}>
      <header className={hub.header}>
        <div className={hub.headerText}>
          <p className={hub.kicker}><MessagesSquare size={14} aria-hidden="true" /> Hộp giao dịch</p>
          <div className={hub.titleRow}>
            <h1 className={hub.title}>Giao dịch của bạn</h1>
            <InfoTip label="Giao dịch của bạn">
              Mua ngay, đổi sách và đấu giá ở <b>một nơi</b>. Mỗi thẻ cho biết trạng thái và <b>bước tiếp theo</b>; thẻ viền vàng đang chờ bạn.
            </InfoTip>
          </div>
          <div className={hub.headerActions}>
            <Link className={hub.primaryLink} to="/books?data=live">
              <Search size={17} aria-hidden="true" /> Tìm sách <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className={hub.ghostLink} to={ROUTES.myAuctions}>
              <Gavel size={17} aria-hidden="true" /> Đấu giá của tôi
            </Link>
          </div>
        </div>
        <img className={hub.art} src="/illustrations/chat/letters.svg" alt="" width={200} height={160} />
      </header>

      {attention.all > 0 && (
        <section className={hub.attention} aria-labelledby="txn-attention">
          <span className={hub.attentionCount} aria-hidden="true">{attention.all}</span>
          <div className={hub.attentionText}>
            <p id="txn-attention" role="status">
              <b>{attention.all} giao dịch</b> đang chờ bạn xử lý
            </p>
            <div className={hub.attentionChips}>
              {(["buy", "exchange", "auction"] as const)
                .filter((tab) => attention[tab] > 0)
                .map((tab) => {
                  const Icon = TAB_ICONS[tab];
                  return (
                    <button key={tab} type="button" onClick={() => goToTab(tab)}>
                      <Icon size={14} aria-hidden="true" />
                      <b>{attention[tab]}</b> {TAB_LABELS[tab].toLowerCase()}
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  );
                })}
            </div>
          </div>
        </section>
      )}

      <nav
        className={hub.tabs}
        role="tablist"
        aria-label="Loại giao dịch"
        onKeyDown={(event) => {
          const index = TRANSACTION_TABS.indexOf(activeTab);
          const next =
            event.key === "ArrowRight" ? TRANSACTION_TABS[(index + 1) % TRANSACTION_TABS.length]
              : event.key === "ArrowLeft" ? TRANSACTION_TABS[(index - 1 + TRANSACTION_TABS.length) % TRANSACTION_TABS.length]
                : event.key === "Home" ? TRANSACTION_TABS[0]
                  : event.key === "End" ? TRANSACTION_TABS[TRANSACTION_TABS.length - 1]
                    : undefined;
          if (!next) return;
          event.preventDefault();
          goToTab(next);
        }}
      >
        {TRANSACTION_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab];
          return (
            <button
              key={tab}
              id={tabId(tab)}
              role="tab"
              type="button"
              aria-selected={activeTab === tab}
              aria-controls="txn-panel"
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => setActiveTab(tab)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{TAB_LABELS[tab]}</span>
              <span className={hub.tabCount}>
                {byTab[tab].length}<span className={hub.srOnly}> giao dịch</span>
              </span>
              {attention[tab] > 0 && (
                <span className={hub.tabAttention}>
                  {attention[tab]}<span className={hub.srOnly}> cần xử lý</span>
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div id="txn-panel" role="tabpanel" aria-labelledby={tabId(activeTab)} className={hub.panel}>
        {/* Search + sort: both act on the list below and stay in the URL. */}
        <div className={hub.toolbar} role="search">
          <label className={hub.search}>
            <Search size={18} aria-hidden="true" />
            <span className={hub.srOnly}>Tìm trong giao dịch</span>
            <input
              type="search"
              value={query}
              placeholder="Tìm theo tên sách, người giao dịch hoặc điểm giao nhận"
              onChange={(event) => update({ q: event.target.value, page: null })}
            />
            {query && (
              <button type="button" className={hub.clear} onClick={() => update({ q: null, page: null })} aria-label="Xóa tìm kiếm">
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </label>
          <div className={hub.sort}>
            <span id="txn-sort-label" className={hub.sortLabel}>
              <ArrowDownUp size={15} aria-hidden="true" /> Sắp xếp
            </span>
            <SelectMenu
              id="txn-sort"
              labelledBy="txn-sort-label"
              value={sort}
              options={SORTS}
              onChange={(value) => update({ sort: value === "attention" ? null : value, page: null })}
            />
          </div>
        </div>

        <p className={hub.summary} aria-live="polite">
          {loading && !matched.length
            ? "Đang tải giao dịch…"
            : needle
              ? <>Tìm thấy <b>{matched.length}</b> giao dịch khớp “{query.trim()}”</>
              : <><b>{matched.length}</b> giao dịch{totalPages > 1 && <> · trang {page}/{totalPages}</>}</>}
        </p>

        {sources.filter((source) => source.error).map((source) => (
          <p key={source.name} className={card.state} role="alert">
            Chưa tải được giao dịch {source.name}.
            <button type="button" onClick={source.retry}><RefreshCw size={14} aria-hidden="true" /> Thử lại</button>
          </p>
        ))}

        {!loading && !matched.length && (needle ? (
          <div className={card.empty}>
            <img src="/illustrations/chat/empty-inbox.svg" alt="" width={160} height={120} />
            <h3>Không có giao dịch khớp</h3>
            <p>Thử tên sách khác, tên người giao dịch, hoặc xem ở mục <b>Tất cả</b>.</p>
            <button type="button" className={card.more} onClick={() => update({ q: null, page: null })}>Xóa tìm kiếm</button>
          </div>
        ) : !sources.some((source) => source.error) && (
          <div className={card.empty}>
            <img src={empty.art} alt="" width={160} height={120} />
            <h3>{empty.title}</h3>
            <p>{empty.text}</p>
            <Link className={card.go} to={empty.cta.to}>
              {empty.cta.label} <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
        ))}

        {shown.length > 0 && (
          <ul id="txn-results" className={card.grid} aria-label={`${TAB_LABELS[activeTab]}: danh sách giao dịch`}>
            {shown.map((entry, index) => (
              <li key={entry.key}>
                {entry.type === "room" ? (
                  <ConversationCard room={entry.room} userId={userId} index={index} />
                ) : entry.type === "exchange" ? (
                  entry.room ? (
                    <ExchangeCard
                      exchange={entry.exchange}
                      userId={userId}
                      index={index}
                      title={exchangeBookTitle(entry.exchange, userId)}
                      conversationHref={ROUTES.chat(entry.room.id)}
                      open={{ to: ROUTES.exchangeDetail(entry.exchange.id), label: "Mở phiếu" }}
                    />
                  ) : (
                    <LegacyCard exchange={entry.exchange} userId={userId} index={index} />
                  )
                ) : (
                  <AuctionCard item={entry.item} serverTime={auctionTime} index={index} />
                )}
              </li>
            ))}
          </ul>
        )}

        <CollectionPager
          anchorId="txn-panel"
          itemLabel="giao dịch"
          label="Phân trang giao dịch"
          model={{
            visible: totalPages > 1,
            busy: false,
            props: { page, totalPages, totalItems: matched.length, pageSize: PAGE_SIZE, onPageChange: (next) => update({ page: next > 1 ? String(next) : null }) },
          }}
        />
      </div>
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
  // Kept while a room is open so the list beside it follows other rooms too.
  const inboxLive = useTransactionLive("inbox", viewerId, () => {
    for (const queryKey of [["purchase-conversations", viewerId], ["conversation-exchanges", viewerId], ["my-auctions", viewerId, "hub"]]) {
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
    refetchInterval: inboxLive ? 30_000 : 3_000,
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
