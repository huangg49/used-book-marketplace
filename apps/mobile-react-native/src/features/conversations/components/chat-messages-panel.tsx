import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import {
  AppText,
  AppTextInput,
  Icon,
  Notice,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../../core/ui";
import { useSession } from "../../../core/session/session-provider";
import { apiBaseUrl } from "../../../core/api/api-base-url";
import {
  eventSummaryText,
  formatDateTimeVi,
  formatMessageTime,
  getConversationEvents,
  getPurchaseMessages,
} from "../purchase-conversation-service";
import {
  purchaseMessageSchema,
  type PurchaseConversation,
  type PurchaseMessage,
} from "../contracts";

interface ChatMessagesPanelProps {
  room: PurchaseConversation;
  onRefreshEvents?: () => void;
}

export function ChatMessagesPanel({
  room,
  onRefreshEvents,
}: ChatMessagesPanelProps) {
  const { client, state } = useSession();
  const currentUserId = state.status === "authenticated" ? state.user.id : "";
  const other = room.buyer.id === currentUserId ? room.seller : room.buyer;
  const isBuyer = room.buyer.id === currentUserId;
  const isExpired = room.status === "Expired" || room.status === "Cancelled";

  const [inputBody, setInputBody] = useState("");
  const [liveMessages, setLiveMessages] = useState<PurchaseMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const [expandedEvents, setExpandedEvents] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "online" | "offline"
  >("connecting");

  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const onRefreshEventsRef = useRef(onRefreshEvents);

  useEffect(() => {
    onRefreshEventsRef.current = onRefreshEvents;
  }, [onRefreshEvents]);

  // 1. Fetch message history with polling fallback
  const historyQuery = useQuery({
    queryKey: ["purchase-messages", room.id],
    queryFn: () => getPurchaseMessages(client, room.id),
    refetchInterval: 3500,
  });

  const refetchHistory = historyQuery.refetch;

  // 2. Fetch conversation events
  const eventsQuery = useQuery({
    queryKey: ["conversation-events", room.id],
    queryFn: () => getConversationEvents(client, room.id),
    refetchInterval: 5000,
  });

  // 3. Setup WebSocket connection
  useEffect(() => {
    let disposed = false;
    let url: string;
    try {
      const base = apiBaseUrl(Platform.OS, {
        shared: process.env.EXPO_PUBLIC_API_BASE_URL,
        android: process.env.EXPO_PUBLIC_API_BASE_URL_ANDROID,
        web: process.env.EXPO_PUBLIC_API_BASE_URL_WEB,
        ios: process.env.EXPO_PUBLIC_API_BASE_URL_IOS,
      });
      url = base.replace(/\/api\/v1\/?$/, "");
    } catch {
      url = "http://localhost:3000";
    }

    const token = client.getAccessToken();
    const socket = io(`${url}/purchase-chat`, {
      transports: ["websocket", "polling"],
      auth: { token },
      extraHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (disposed) return;
      setConnectionStatus("online");
      socket.emit("purchase:join", room.id);
    });

    socket.on("purchase:message", (data: unknown) => {
      if (disposed) return;
      const parsed = purchaseMessageSchema.safeParse(data);
      if (parsed.success && parsed.data.conversationId === room.id) {
        setLiveMessages((prev) =>
          prev.some((m) => m.id === parsed.data.id)
            ? prev
            : [...prev, parsed.data],
        );
        void refetchHistory();
        if (onRefreshEventsRef.current) onRefreshEventsRef.current();
      }
    });

    socket.on("connect_error", () => {
      if (!disposed) setConnectionStatus("offline");
    });

    socket.on("disconnect", () => {
      if (!disposed) setConnectionStatus("offline");
    });

    return () => {
      disposed = true;
      socketRef.current = null;
      socket.disconnect();
    };
  }, [room.id, client, refetchHistory]);

  // Combine history messages + live messages, sorted by sentAt
  const allMessages = [
    ...new Map(
      [...(historyQuery.data ?? []), ...liveMessages].map((m) => [m.id, m]),
    ).values(),
  ].sort((a, b) => a.sentAt.localeCompare(b.sentAt));

  // Auto scroll to bottom
  useEffect(() => {
    if (allMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [allMessages.length]);

  // Send message
  const handleSend = () => {
    const text = inputBody.trim();
    if (!text || sending || isExpired) return;

    setSending(true);
    setSendError(undefined);

    const messageId = crypto.randomUUID();
    const payload = {
      messageId,
      conversationId: room.id,
      body: text,
    };

    const socket = socketRef.current;
    if (socket && connectionStatus === "online") {
      socket
        .timeout(10000)
        .emit("purchase:send", payload, (err: unknown, reply: unknown) => {
          setSending(false);
          const parsed = purchaseMessageSchema.safeParse(reply);
          if (err || !parsed.success) {
            setSendError("Chưa xác nhận được tin nhắn. Vui lòng thử lại.");
            return;
          }
          setLiveMessages((prev) =>
            prev.some((m) => m.id === parsed.data.id)
              ? prev
              : [...prev, parsed.data],
          );
          setInputBody("");
        });
    } else {
      setSending(false);
      setSendError("Đang kết nối lại máy chủ. Hãy thử gửi lại trong giây lát.");
    }
  };

  const events = eventsQuery.data ?? [];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      {/* 1. Header đối tác */}
      <View style={styles.partnerHeader}>
        <View style={styles.avatarCircle}>
          <AppText style={styles.avatarText}>
            {other.displayName.slice(0, 1).toUpperCase()}
          </AppText>
        </View>

        <View style={styles.partnerInfo}>
          <AppText numberOfLines={1} style={styles.partnerName}>
            {other.displayName}
          </AppText>
          <AppText numberOfLines={1} style={styles.partnerRole}>
            {isBuyer
              ? "Người bán · Bạn đang hỏi mua"
              : "Người mua · Bạn đang bán sách"}
          </AppText>
        </View>

        <View style={styles.statusPill}>
          <View
            style={[
              styles.connectionDot,
              connectionStatus === "online"
                ? styles.dotOnline
                : connectionStatus === "connecting"
                  ? styles.dotConnecting
                  : styles.dotOffline,
            ]}
          />
          <AppText style={styles.connectionLabel}>
            {connectionStatus === "online"
              ? "Trực tuyến"
              : connectionStatus === "connecting"
                ? "Đang kết nối…"
                : "Ngoại tuyến"}
          </AppText>
        </View>
      </View>

      {/* 2. Lịch sử sự kiện thỏa thuận (Accordion / Summary) */}
      {events.length > 0 && (
        <View style={styles.eventsAccordion}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mở rộng hoặc thu gọn lịch sử thỏa thuận"
            style={styles.eventsHeader}
            onPress={() => setExpandedEvents((prev) => !prev)}
          >
            <View style={styles.eventsHeaderLeft}>
              <Icon name="tag" size={14} color={stitchTokens.wineDark} />
              <AppText style={styles.eventsHeaderTitle}>
                Lịch sử thỏa thuận ({events.length})
              </AppText>
            </View>
            <Icon
              name="chevronDown"
              size={14}
              color={colors.muted}
            />
          </Pressable>

          {(expandedEvents ? events : events.slice(-1)).map((ev) => (
            <View key={ev.id} style={styles.eventEntry}>
              <AppText style={styles.eventText}>
                <AppText style={styles.eventActor}>
                  {ev.actorId === currentUserId ? "Bạn " : `${other.displayName} `}
                </AppText>
                {eventSummaryText(ev)}
              </AppText>
              <AppText style={styles.eventTime}>
                {formatDateTimeVi(ev.createdAt)}
              </AppText>
            </View>
          ))}
        </View>
      )}

      {/* 3. Danh sách tin nhắn */}
      <FlatList
        ref={flatListRef}
        data={allMessages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          historyQuery.isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator color={stitchTokens.wineDark} />
              <AppText style={styles.loadingText}>Đang tải tin nhắn…</AppText>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Icon
                  name="message"
                  size={30}
                  color={stitchTokens.wineDark}
                />
              </View>
              <AppText style={styles.emptyTitle}>
                {isExpired
                  ? "Chưa có tin nhắn trong cuộc trao đổi"
                  : "Bắt đầu cuộc trò chuyện"}
              </AppText>
              <AppText style={styles.emptySubtitle}>
                {isExpired
                  ? "Lịch sử hội thoại được lưu lại tại đây."
                  : "Bạn có thể hỏi về tình trạng sách, ảnh thật hoặc giá trước khi gửi thông tin nhận sách."}
              </AppText>

              {!isExpired && !inputBody && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Soạn lời chào mẫu"
                  style={styles.suggestionBtn}
                  onPress={() => {
                    setInputBody(
                      isBuyer
                        ? "Chào bạn, sách còn không và tình trạng hiện tại thế nào?"
                        : "Chào bạn, bạn muốn hỏi thêm điều gì về cuốn sách này?",
                    );
                  }}
                >
                  <Icon name="star" size={14} color={stitchTokens.wineDark} />
                  <AppText style={styles.suggestionText}>
                    Soạn lời chào mở đầu
                  </AppText>
                </Pressable>
              )}
            </View>
          )
        }
        renderItem={({ item }) => {
          const isOwn = item.senderId === currentUserId;
          return (
            <View
              style={[
                styles.bubbleWrapper,
                isOwn ? styles.bubbleWrapperOwn : styles.bubbleWrapperOther,
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  isOwn ? styles.bubbleOwn : styles.bubbleOther,
                ]}
              >
                <AppText style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
                  {item.body}
                </AppText>
                <AppText
                  style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}
                >
                  {formatMessageTime(item.sentAt)}
                </AppText>
              </View>
            </View>
          );
        }}
      />

      {/* 4. Khung soạn tin nhắn (Composer) */}
      <View style={styles.composerWrapper}>
        {sendError && (
          <Notice tone="error">
            {sendError}
          </Notice>
        )}

        {isExpired ? (
          <View style={styles.closedBar}>
            <Icon name="lock" size={14} color={colors.muted} />
            <AppText style={styles.closedBarText}>
              Cuộc trò chuyện đã đóng. Bạn vẫn có thể đọc tin nhắn cũ.
            </AppText>
          </View>
        ) : (
          <View style={styles.composerRow}>
            <AppTextInput
              style={styles.textInput}
              value={inputBody}
              onChangeText={setInputBody}
              placeholder={
                isBuyer
                  ? "Hỏi về sách hoặc trao đổi giá…"
                  : "Trả lời người mua về cuốn sách…"
              }
              placeholderTextColor={colors.muted}
              multiline
              maxLength={1000}
              editable={!sending}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gửi tin nhắn"
              style={[
                styles.sendBtn,
                (!inputBody.trim() || sending) && styles.sendBtnDisabled,
              ]}
              disabled={!inputBody.trim() || sending}
              onPress={handleSend}
            >
              {sending ? (
                <ActivityIndicator size="small" color={stitchTokens.white} />
              ) : (
                <Icon name="arrow" size={17} color={stitchTokens.white} />
              )}
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: stitchTokens.parchment,
  },
  partnerHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: space.sm,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: stitchTokens.white,
    fontWeight: "700",
    fontSize: 15,
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  partnerRole: {
    fontSize: 11,
    color: colors.muted,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotOnline: {
    backgroundColor: stitchTokens.verifiedGreen,
  },
  dotConnecting: {
    backgroundColor: stitchTokens.goldBronze,
  },
  dotOffline: {
    backgroundColor: colors.muted,
  },
  connectionLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "600",
  },
  eventsAccordion: {
    backgroundColor: stitchTokens.warmIvory,
    marginHorizontal: space.md,
    marginTop: space.sm,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: space.sm,
    gap: 4,
  },
  eventsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eventsHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eventsHeaderTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  eventEntry: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingTop: 4,
    gap: 8,
  },
  eventText: {
    flex: 1,
    fontSize: 12,
    color: colors.ink,
    lineHeight: 16,
  },
  eventActor: {
    fontWeight: "700",
  },
  eventTime: {
    fontSize: 10,
    color: colors.muted,
  },
  messagesList: {
    padding: space.md,
    gap: space.sm,
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: space.xl * 2,
    gap: space.xs,
  },
  loadingText: {
    fontSize: 13,
    color: colors.muted,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
  },
  suggestionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    marginTop: space.sm,
  },
  suggestionText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  bubbleWrapper: {
    flexDirection: "row",
    marginVertical: 2,
  },
  bubbleWrapperOwn: {
    justifyContent: "flex-end",
  },
  bubbleWrapperOther: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 3,
  },
  bubbleOwn: {
    backgroundColor: stitchTokens.wineDark,
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 2,
  },
  bubbleText: {
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  bubbleTextOwn: {
    color: stitchTokens.white,
  },
  bubbleTime: {
    fontSize: 10,
    color: colors.muted,
    alignSelf: "flex-end",
  },
  bubbleTimeOwn: {
    color: stitchTokens.roseParchment,
  },
  composerWrapper: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: space.sm,
    gap: space.xs,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
  },
  textInput: {
    flex: 1,
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.sheet,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: colors.ink,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: colors.muted,
    opacity: 0.5,
  },
  closedBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  closedBarText: {
    fontSize: 12,
    color: colors.muted,
  },
});
