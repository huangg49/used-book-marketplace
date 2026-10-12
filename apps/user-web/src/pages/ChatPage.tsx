import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
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
import { ListingPhoto } from "../components/BookCard";
import styles from "./ChatPage.module.css";

const configuredBase =
  import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:3000/api/v1";
const socketUrl = configuredBase.startsWith("/")
  ? window.location.origin
  : configuredBase.replace(/\/api\/v1\/?$/, "");
const statusLabels = {
  Active: "Đang giữ sách",
  Expired: "Đã hết hạn",
  Cancelled: "Đã hủy",
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
}: {
  room: PurchaseConversation;
  userId: string;
}) {
  const other = room.buyer.id === userId ? room.seller : room.buyer;
  const history = useQuery({
    queryKey: ["purchase-messages", room.id],
    queryFn: () => getPurchaseMessages(room.id),
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
  const [attempt, setAttempt] = useState<{
    messageId: string;
    conversationId: string;
    body: string;
  }>();
  const socketRef = useRef<Socket | null>(null);
  const attemptRef = useRef<typeof attempt>(undefined);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const active =
    room.status === "Active" && Date.now() < Date.parse(room.expiresAt);
  const [expired, setExpired] = useState(!active);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(
      () => setExpired(true),
      Math.min(
        2147483647,
        Math.max(0, Date.parse(room.expiresAt) - Date.now()),
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
          {statusLabels[room.status]} · Hạn giữ:{" "}
          <time dateTime={room.expiresAt}>{dateTime(room.expiresAt)}</time>
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
            Cuộc trò chuyện đã đóng hoặc hết hạn giữ sách. Bạn vẫn có thể đọc
            tin nhắn cũ.
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
                Chưa có hội thoại. Khi giữ một bản sách và mở chat, cuộc trò
                chuyện sẽ xuất hiện ở đây.
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
          <ChatRoom key={room.id} room={room} userId={auth.user.id} />
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
