import React, { useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { CHAT_RATE_LIMIT_TEXT, chatSendWasRateLimited, clipChatMessage } from "@used-books/session-client";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import {
  AppText,
  AppModal,
  AppTextInput,
  Button,
  ConfirmDialog,
  Icon,
  Notice,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../../core/ui";
import { useSession } from "../../../core/session/session-provider";
import { useForeground } from "../../../core/hooks/use-foreground";
import { useTransactionLive } from "../../../core/hooks/use-transaction-live";
import { apiBaseUrl } from "../../../core/api/api-base-url";
import {
  changeConversationTerms,
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
import { orderDetailsSchema, orderReceiptSchema } from "../../orders/contracts";
import type { Listing } from "../../shelf/contracts";

function getListingPrice(l?: Listing | null): number {
  if (!l) return 50000;
  if ("salePrice" in l && typeof l.salePrice === "number") return l.salePrice;
  if ("exchangeValue" in l && typeof l.exchangeValue === "number") return l.exchangeValue;
  return 50000;
}

interface ChatMessagesPanelProps {
  room: PurchaseConversation;
  listing?: Listing | null;
  onRefresh?: () => void;
  onRefreshEvents?: () => void;
  onOpenCreateOrder?: (afterCreate: (price: number) => void) => void;
}

export function ChatMessagesPanel({
  room,
  listing,
  onRefresh,
  onRefreshEvents,
  onOpenCreateOrder,
}: ChatMessagesPanelProps) {
  const { client, state } = useSession();
  const queryClient = useQueryClient();
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

  // State for Price proposals and Order actions
  const [termsBusy, setTermsBusy] = useState(false);
  const [termsActionError, setTermsActionError] = useState<string | null>(null);
  const [proposeModalOpen, setProposeModalOpen] = useState(false);
  const [proposePriceError, setProposePriceError] = useState<string | null>(null);
  const [confirmPayOpen, setConfirmPayOpen] = useState(false);
  const [confirmProposal, setConfirmProposal] = useState<
    null | { id: string; accept: boolean; amount: number }
  >(null);
  const [proposePriceInput, setProposePriceInput] = useState<string>(
    String(room.terms?.agreedPrice ?? getListingPrice(listing))
  );

  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const onRefreshEventsRef = useRef(onRefreshEvents);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshEventsRef.current = onRefreshEvents;
    onRefreshRef.current = onRefresh;
  }, [onRefreshEvents, onRefresh]);

  const sendAutoChatMessage = (text: string) => {
    const socket = socketRef.current;
    if (socket && connectionStatus === "online") {
      const payload = {
        messageId: randomUUID(),
        conversationId: room.id,
        body: text,
      };
      socket.emit("purchase:send", payload);
    }
  };

  const handleRespondProposal = async (proposalId: string, accept: boolean) => {
    if (termsBusy) return;
    setTermsBusy(true);
    setTermsActionError(null);
    try {
      await changeConversationTerms(client, room.id, {
        expectedVersion: room.version,
        proposalId,
        accept,
      });
      setConfirmProposal(null);
      sendAutoChatMessage(
        accept
          ? `Tôi đã đồng ý mức giá đề xuất ${room.terms?.pendingProposal?.amount?.toLocaleString("vi-VN")} ₫.`
          : `Tôi chưa thể đồng ý với mức giá đề xuất này.`
      );
      if (onRefreshRef.current) onRefreshRef.current();
      if (onRefreshEventsRef.current) onRefreshEventsRef.current();
    } catch (err: any) {
      setTermsActionError(err?.message ?? "Không thể phản hồi đề xuất giá lúc này.");
    } finally {
      setTermsBusy(false);
    }
  };

  const handleProposePrice = async (amount: number) => {
    if (termsBusy || amount <= 0) return;
    setTermsBusy(true);
    setTermsActionError(null);
    setProposePriceError(null);
    try {
      await changeConversationTerms(client, room.id, {
        expectedVersion: room.version,
        kind: "Price",
        amount,
      });
      sendAutoChatMessage(
        `[Đề xuất đổi giá] Mình mong muốn mua/bán sách với giá ${amount.toLocaleString("vi-VN")} ₫. Bạn xem giúp mình nhé!`
      );
      setProposeModalOpen(false);
      if (onRefreshRef.current) onRefreshRef.current();
      if (onRefreshEventsRef.current) onRefreshEventsRef.current();
    } catch (err: any) {
      setTermsActionError(err?.message ?? "Không thể gửi đề xuất đổi giá lúc này.");
    } finally {
      setTermsBusy(false);
    }
  };

  const handlePayOrder = async () => {
    if (!room.orderId || termsBusy) return;
    setTermsBusy(true);
    setTermsActionError(null);
    try {
      const currentOrder = await client.request(
        `/me/orders/${room.orderId}`,
        orderDetailsSchema,
      );
      if (currentOrder.state !== "AwaitingPayment") {
        setTermsActionError("Đơn hàng này không còn ở trạng thái chờ thanh toán.");
        if (onRefreshRef.current) onRefreshRef.current();
        return;
      }
      await client.request(`/orders/${room.orderId}/pay`, orderReceiptSchema, {
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: JSON.stringify({ expectedVersion: currentOrder.version }),
      });
      setConfirmPayOpen(false);
      sendAutoChatMessage("Tôi đã hoàn tất thanh toán đơn hàng qua Ví!");
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      if (onRefreshRef.current) onRefreshRef.current();
      if (onRefreshEventsRef.current) onRefreshEventsRef.current();
    } catch (err: any) {
      setTermsActionError(err?.message ?? "Chưa thanh toán được đơn hàng. Kiểm tra số dư ví của bạn.");
    } finally {
      setTermsBusy(false);
    }
  };

  const foreground = useForeground();
  // Conversation commits (terms, order, events) push through the shared watch.
  const roomLive = useTransactionLive("conversation", room.id, foreground, () => {
    void queryClient.invalidateQueries({ queryKey: ["conversation-events", room.id] });
  });

  // 1. Fetch message history; the chat socket delivers new messages, so the
  // poll only backs up a dropped connection.
  const historyQuery = useQuery({
    queryKey: ["purchase-messages", room.id],
    queryFn: () => getPurchaseMessages(client, room.id),
    refetchInterval: !foreground ? false : connectionStatus === "online" ? 30_000 : 3_500,
  });

  const refetchHistory = historyQuery.refetch;

  // 2. Fetch conversation events
  const eventsQuery = useQuery({
    queryKey: ["conversation-events", room.id],
    queryFn: () => getConversationEvents(client, room.id),
    refetchInterval: !foreground ? false : roomLive ? 30_000 : 5_000,
  });

  // 3. Setup WebSocket connection
  useEffect(() => {
    if (!foreground) return;
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
      url = Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";
    }

    let currentToken = client.getAccessToken();
    const socket = io(`${url}/purchase-chat`, {
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      auth: (callback) => callback({ token: client.getAccessToken() }),
      timeout: 10_000,
    });
    socketRef.current = socket;

    const unsubscribeSession = client.subscribe(() => {
      if (disposed) return;
      const nextToken = client.getAccessToken();
      if (nextToken === currentToken) return;
      currentToken = nextToken;
      if (nextToken) {
        socket.disconnect().connect();
      } else {
        socket.disconnect();
      }
    });

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
      unsubscribeSession();
      socketRef.current = null;
      socket.disconnect();
    };
  }, [room.id, client, refetchHistory, foreground]);

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

    const messageId = randomUUID();
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
          if (!err && chatSendWasRateLimited(reply)) {
            setSendError(CHAT_RATE_LIMIT_TEXT);
            return;
          }
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
      {/* 1. Thanh ngữ cảnh đối tác (gọn nhẹ, không tạo tầng header nặng) */}
      <View style={styles.partnerStrip}>
        <View style={styles.partnerStripLeft}>
          <View style={styles.avatarDot}>
            <AppText style={styles.avatarDotText}>
              {other.displayName.slice(0, 1).toUpperCase()}
            </AppText>
          </View>
          <AppText numberOfLines={1} style={styles.partnerStripName}>
            {other.displayName}
          </AppText>
          <AppText style={styles.partnerStripSep}>·</AppText>
          <AppText numberOfLines={1} style={styles.partnerStripRole}>
            {isBuyer ? "Người bán" : "Người mua"}
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

      {/* 1.1 Thông báo lỗi nếu có */}
      {termsActionError && (
        <View style={{ marginHorizontal: space.lg, marginBottom: space.xs }}>
          <Notice tone="error">{termsActionError}</Notice>
        </View>
      )}

      {/* 1.2 Thanh hành động thỏa thuận ghim gọn trên Chat */}
      {room.terms?.pendingProposal && room.terms.pendingProposal.kind === "Price" ? (
        <View style={styles.pinnedBanner}>
          {room.terms.pendingProposal.proposedById !== currentUserId ? (
            <View style={[styles.pinnedCard, styles.pinnedCardWine]}>
              <View style={styles.pinnedTopRow}>
                <View style={styles.pinnedBadgeWine}>
                  <Icon name="tag" size={12} color={stitchTokens.wineDark} />
                  <AppText style={styles.pinnedBadgeTextWine}>
                    Đề nghị giá mới
                  </AppText>
                </View>
                <AppText style={styles.pinnedPrice}>
                  {(room.terms.pendingProposal.amount ?? 0).toLocaleString("vi-VN")} ₫
                </AppText>
              </View>
              <AppText style={styles.pinnedSub}>
                {other.displayName} đề xuất chốt mức giá này. Bạn có đồng ý không?
              </AppText>
              <View style={styles.proposalActionRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Từ chối"
                    secondary
                    busy={termsBusy}
                    onPress={() => {
                      setTermsActionError(null);
                      setConfirmProposal({
                        id: room.terms!.pendingProposal!.id,
                        accept: false,
                        amount: room.terms!.pendingProposal!.amount ?? 0,
                      });
                    }}
                  />
                </View>
                <View style={{ flex: 1.25 }}>
                  <Button
                    title="Đồng ý giá này"
                    wine
                    busy={termsBusy}
                    onPress={() => {
                      setTermsActionError(null);
                      setConfirmProposal({
                        id: room.terms!.pendingProposal!.id,
                        accept: true,
                        amount: room.terms!.pendingProposal!.amount ?? 0,
                      });
                    }}
                  />
                </View>
              </View>
            </View>
          ) : (
            <View style={[styles.pinnedSlimCard, styles.pinnedCardAmber]}>
              <Icon name="clock" size={15} color={stitchTokens.orangeDeep} />
              <AppText style={styles.pinnedSlimText}>
                Bạn đã đề xuất{" "}
                <AppText style={styles.priceHighlight}>
                  {(room.terms.pendingProposal.amount ?? 0).toLocaleString("vi-VN")} ₫
                </AppText>
                {" · "}Đang chờ {other.displayName} phản hồi.
              </AppText>
            </View>
          )}
        </View>
      ) : room.orderId ? (
        <View style={styles.pinnedBanner}>
          <View style={[styles.pinnedCard, styles.pinnedCardGreen]}>
            <View style={styles.pinnedCompactRow}>
              <View style={styles.pinnedCompactInfo}>
                <View style={styles.pinnedInlineHeader}>
                  <Icon name="check" size={13} color={stitchTokens.likeNewGreen} />
                  <AppText numberOfLines={1} style={styles.pinnedTitleGreen}>
                    Đơn #{room.orderId.slice(0, 8).toUpperCase()}
                    {room.terms?.agreedPrice
                      ? ` · ${room.terms.agreedPrice.toLocaleString("vi-VN")} ₫`
                      : ""}
                  </AppText>
                </View>
                <AppText style={styles.pinnedSub}>
                  {isBuyer
                    ? "Thanh toán qua Ví để người bán bắt đầu giao sách."
                    : "Đang chờ người mua thanh toán để kích hoạt giao nhận."}
                </AppText>
              </View>
              {isBuyer ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Thanh toán đơn hàng ngay"
                  disabled={termsBusy}
                  onPress={() => {
                    setTermsActionError(null);
                    setConfirmPayOpen(true);
                  }}
                  style={({ pressed }) => [
                    styles.compactWineCta,
                    (pressed || termsBusy) && styles.compactCtaPressed,
                  ]}
                >
                  <AppText style={styles.compactWineCtaText}>
                    {termsBusy ? "Đang xử lý…" : "Thanh toán"}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : room.terms?.agreedPrice ? (
        <View style={styles.pinnedBanner}>
          <View style={[styles.pinnedCard, styles.pinnedCardGreen]}>
            <View style={styles.pinnedCompactRow}>
              <View style={styles.pinnedCompactInfo}>
                <View style={styles.pinnedInlineHeader}>
                  <Icon name="check" size={13} color={stitchTokens.likeNewGreen} />
                  <AppText numberOfLines={1} style={styles.pinnedTitleGreen}>
                    Đã chốt giá {room.terms.agreedPrice.toLocaleString("vi-VN")} ₫
                  </AppText>
                </View>
                <AppText style={styles.pinnedSub}>
                  {onOpenCreateOrder
                    ? "Sẵn sàng tạo đơn giữ sách để người mua thanh toán."
                    : isBuyer
                      ? "Đang chờ người bán tạo đơn hàng cho bạn."
                      : "Chờ người mua gửi địa chỉ & báo giá vận chuyển."}
                </AppText>
              </View>
              {onOpenCreateOrder ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tạo đơn hàng giữ sách ngay"
                  disabled={termsBusy}
                  onPress={() =>
                    onOpenCreateOrder((price) => {
                      sendAutoChatMessage(
                        `Đơn hàng đã được tạo theo giá chốt ${price.toLocaleString("vi-VN")} ₫. Bạn có thể bấm thanh toán ngay!`,
                      );
                    })
                  }
                  style={({ pressed }) => [
                    styles.compactWineCta,
                    (pressed || termsBusy) && styles.compactCtaPressed,
                  ]}
                >
                  <AppText style={styles.compactWineCtaText}>Tạo đơn ngay</AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

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
              <Icon name="tag" size={13} color={stitchTokens.wineDark} />
              <AppText style={styles.eventsHeaderTitle}>
                Lịch sử thỏa thuận ({events.length})
              </AppText>
            </View>
            <Icon
              name={expandedEvents ? "chevronUp" : "chevronDown"}
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
                  size={22}
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
                  : isBuyer
                    ? "Bạn có thể hỏi về tình trạng sách, ảnh thật hoặc thương lượng giá với người bán."
                    : "Trao đổi thêm về tình trạng sách, đóng gói hoặc thời gian giao nhận với người mua."}
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
                        : "Chào bạn, sách mình sẵn sàng đóng gói. Bạn cần hỏi thêm gì không?",
                    );
                  }}
                >
                  <Icon name="star" size={13} color={stitchTokens.wineDark} />
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

        {/* Thanh công cụ Đề xuất đổi giá nhanh */}
        {!isExpired && room.status === "Active" && (
          <View style={styles.quickBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mở hộp thoại đề xuất đổi giá"
              style={styles.makeOfferBtn}
              onPress={() => {
                setProposePriceInput(
                  String(room.terms?.agreedPrice ?? getListingPrice(listing))
                );
                setProposeModalOpen(true);
              }}
            >
              <Icon name="tag" size={13} color={stitchTokens.wineDark} />
              <AppText style={styles.makeOfferBtnText}>
                {isBuyer ? "Yêu cầu đổi giá / Trả giá" : "Đề xuất giá mới"}
              </AppText>
            </Pressable>

            <AppText style={styles.referencePriceText}>
              Giá niêm yết: {getListingPrice(listing).toLocaleString("vi-VN")} ₫
            </AppText>
          </View>
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
              onChangeText={(value) => setInputBody(clipChatMessage(value))}
              placeholder={
                isBuyer
                  ? "Hỏi về sách hoặc trao đổi giá…"
                  : "Trả lời người mua về cuốn sách…"
              }
              placeholderTextColor={colors.muted}
              multiline
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

      {/* Modal Đề xuất giá mới */}
      <AppModal
        visible={proposeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !termsBusy && setProposeModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng hộp thoại đề xuất giá"
            style={StyleSheet.absoluteFill}
            onPress={() => !termsBusy && setProposeModalOpen(false)}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                <Icon name="tag" size={18} color={stitchTokens.wineDark} />
                <AppText style={styles.modalTitle} numberOfLines={1}>
                  {isBuyer ? "Đề xuất mức giá bạn muốn mua" : "Đổi giá bán cho người mua"}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng modal"
                disabled={termsBusy}
                onPress={() => setProposeModalOpen(false)}
                style={({ pressed }) => [
                  termsBusy && { opacity: 0.4 },
                  pressed && !termsBusy && { opacity: 0.7 },
                ]}
              >
                <Icon name="close" size={20} color={stitchTokens.darkWood} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
            >
              <AppText style={styles.modalSub}>
                Giá niêm yết hiện tại:{" "}
                <AppText style={{ fontWeight: "800", color: stitchTokens.wineDark }}>
                  {getListingPrice(listing).toLocaleString("vi-VN")} ₫
                </AppText>
                . Đề xuất này sẽ gửi đến đối tác để họ xác nhận trước khi chốt đơn.
              </AppText>

              <View style={styles.inputSection}>
                <AppText style={styles.inputLabel}>Mức giá đề xuất mới (VNĐ):</AppText>
                <AppTextInput
                  accessibilityLabel="Giá sách đề nghị"
                  style={styles.amountInput}
                  keyboardType="numeric"
                  editable={!termsBusy}
                  value={proposePriceInput}
                  onChangeText={(val) => {
                    setProposePriceError(null);
                    setProposePriceInput(val.replace(/\D/g, ""));
                  }}
                  placeholder="Ví dụ: 45000"
                  placeholderTextColor={stitchTokens.subtleGray}
                />

                {/* Nút gợi ý nhanh */}
                <View style={styles.presetRow}>
                  {(() => {
                    const basePrice = getListingPrice(listing);
                    return [
                      { label: "-5.000 ₫", val: Math.max(10000, basePrice - 5000) },
                      { label: "-10.000 ₫", val: Math.max(10000, basePrice - 10000) },
                      { label: "-10%", val: Math.max(10000, Math.round((basePrice * 0.9) / 1000) * 1000) },
                      { label: "-20%", val: Math.max(10000, Math.round((basePrice * 0.8) / 1000) * 1000) },
                    ].map((item) => (
                      <Pressable
                        key={item.label}
                        disabled={termsBusy}
                        style={styles.presetChip}
                        onPress={() => {
                          setProposePriceError(null);
                          setProposePriceInput(String(item.val));
                        }}
                      >
                        <AppText style={styles.presetChipText}>{item.label}</AppText>
                      </Pressable>
                    ));
                  })()}
                </View>
              </View>

              {proposePriceError ? <Notice tone="error">{proposePriceError}</Notice> : null}
              {termsActionError ? <Notice tone="error">{termsActionError}</Notice> : null}

              <View style={styles.modalActionRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Hủy"
                    secondary
                    disabled={termsBusy}
                    onPress={() => setProposeModalOpen(false)}
                  />
                </View>
                <View style={{ flex: 1.5 }}>
                  <Button
                    title="Gửi đề xuất giá"
                    wine
                    busy={termsBusy}
                    onPress={() => {
                      const amount = parseInt(proposePriceInput.replace(/\D/g, ""), 10);
                      if (!Number.isFinite(amount) || amount < 1000) {
                        setProposePriceError("Vui lòng nhập mức giá hợp lệ (tối thiểu 1.000 ₫).");
                        return;
                      }
                      setProposePriceError(null);
                      void handleProposePrice(amount);
                    }}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </AppModal>

      <ConfirmDialog
        visible={!!confirmProposal}
        title={
          confirmProposal?.accept
            ? "Đồng ý mức giá đề xuất?"
            : "Từ chối mức giá đề xuất?"
        }
        message={
          confirmProposal?.accept
            ? `Bạn xác nhận chốt giá sách ở mức ${confirmProposal.amount.toLocaleString("vi-VN")} ₫ với ${other.displayName}? Giá này sẽ được dùng để tạo đơn hàng.`
            : `Từ chối đề xuất giá ${confirmProposal?.amount.toLocaleString("vi-VN") ?? "0"} ₫ từ ${other.displayName}. Hai bên có thể tiếp tục thương lượng mức giá khác.`
        }
        confirmLabel={confirmProposal?.accept ? "Đồng ý giá này" : "Từ chối"}
        destructive={confirmProposal?.accept === false}
        busy={termsBusy}
        error={termsActionError ?? undefined}
        onCancel={() => !termsBusy && setConfirmProposal(null)}
        onConfirm={() => {
          if (confirmProposal) {
            void handleRespondProposal(confirmProposal.id, confirmProposal.accept);
          }
        }}
      />

      <ConfirmDialog
        visible={confirmPayOpen}
        title="Xác nhận thanh toán đơn hàng?"
        message={`Thanh toán đơn #${(room.orderId ?? "").slice(0, 8).toUpperCase()}${room.terms?.agreedPrice ? ` (giá sách ${room.terms.agreedPrice.toLocaleString("vi-VN")} ₫ + phí giao hàng đã báo giá)` : ""} qua Ví Lật Lại. Tiền được giữ an toàn trong Quỹ bảo chứng cho tới khi bạn nhận sách và hết hạn kiểm tra.`}
        confirmLabel="Thanh toán ngay"
        busy={termsBusy}
        error={termsActionError ?? undefined}
        onCancel={() => !termsBusy && setConfirmPayOpen(false)}
        onConfirm={() => void handlePayOrder()}
      />

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  partnerStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 8,
  },
  partnerStripLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  avatarDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarDotText: {
    color: stitchTokens.white,
    fontWeight: "700",
    fontSize: 11,
    includeFontPadding: false,
  },
  partnerStripName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.ink,
    includeFontPadding: false,
  },
  partnerStripSep: {
    fontSize: 12,
    color: colors.muted,
    includeFontPadding: false,
  },
  partnerStripRole: {
    fontSize: 12,
    color: colors.muted,
    flexShrink: 1,
    includeFontPadding: false,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
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
    includeFontPadding: false,
  },
  eventsAccordion: {
    backgroundColor: stitchTokens.whiteSurface,
    marginHorizontal: space.lg,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
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
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
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
    paddingHorizontal: space.md,
    gap: 6,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
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
    lineHeight: 19,
    maxWidth: 290,
  },
  suggestionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    marginTop: 8,
  },
  suggestionText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
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
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 3,
  },
  bubbleOwn: {
    backgroundColor: stitchTokens.wineDark,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderBottomLeftRadius: 4,
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
    backgroundColor: stitchTokens.whiteSurface,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.cardBorder,
    paddingHorizontal: space.lg,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: colors.ink,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: colors.muted,
    opacity: 0.45,
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
  /* Pinned Terms Banner — Editorial Parchment + Left Accent */
  pinnedBanner: {
    paddingHorizontal: space.lg,
    paddingTop: 2,
    paddingBottom: 2,
  },
  pinnedCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderLeftWidth: 3.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  pinnedSlimCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderLeftWidth: 3.5,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  pinnedCardWine: {
    borderLeftColor: stitchTokens.wineDark,
  },
  pinnedCardGreen: {
    borderLeftColor: stitchTokens.verifiedGreen,
  },
  pinnedCardAmber: {
    borderLeftColor: stitchTokens.orangeDeep,
  },
  pinnedTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pinnedBadgeWine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pinnedBadgeTextWine: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  pinnedPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  pinnedCompactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pinnedCompactInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pinnedInlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pinnedTitleGreen: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    flexShrink: 1,
    includeFontPadding: false,
  },
  pinnedSub: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  pinnedSlimText: {
    fontSize: 12,
    color: stitchTokens.deepCocoa,
    flex: 1,
    lineHeight: 17,
  },
  priceHighlight: {
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  compactWineCta: {
    backgroundColor: stitchTokens.wineDark,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  compactCtaPressed: {
    opacity: 0.85,
  },
  compactWineCtaText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.white,
    includeFontPadding: false,
  },
  proposalActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  /* Quick Offer Bar */
  quickBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  makeOfferBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
  },
  makeOfferBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  referencePriceText: {
    fontSize: 11,
    color: colors.muted,
  },
  /* Modal Styles */
  modalBackdrop: {
    flex: 1,
    backgroundColor: stitchTokens.modalScrim,
    justifyContent: "center",
    alignItems: "center",
    padding: space.md,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 20,
    padding: space.lg,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    gap: 14,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  modalSub: {
    fontSize: 12,
    color: stitchTokens.darkWood,
    lineHeight: 16,
  },
  inputSection: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  amountInput: {
    height: 44,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    backgroundColor: stitchTokens.whiteSurface,
  },
  presetRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 4,
  },
  presetChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
});
