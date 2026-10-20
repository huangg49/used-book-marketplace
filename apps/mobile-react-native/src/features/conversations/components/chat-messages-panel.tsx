import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import {
  AppText,
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
import { apiBaseUrl } from "../../../core/api/api-base-url";
import {
  changeConversationTerms,
  createSellerOrder,
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
import { orderReceiptSchema } from "../../orders/contracts";
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
}

export function ChatMessagesPanel({
  room,
  listing,
  onRefresh,
  onRefreshEvents,
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
  const [proposePriceInput, setProposePriceInput] = useState<string>(
    String(room.terms?.agreedPrice ?? getListingPrice(listing))
  );
  const [confirmOrderDialogOpen, setConfirmOrderDialogOpen] = useState(false);

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
        messageId: crypto.randomUUID(),
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

  const handleConfirmCreateOrder = async (agreedPrice: number) => {
    if (termsBusy) return;
    setTermsBusy(true);
    setTermsActionError(null);
    try {
      await createSellerOrder(client, {
        conversationId: room.id,
        expectedVersion: room.version,
        agreedBookPrice: agreedPrice,
      });
      sendAutoChatMessage(
        `Đơn hàng đã được tạo theo giá chốt ${agreedPrice.toLocaleString("vi-VN")} ₫. Bạn có thể bấm thanh toán ngay!`
      );
      setConfirmOrderDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      if (onRefreshRef.current) onRefreshRef.current();
      if (onRefreshEventsRef.current) onRefreshEventsRef.current();
    } catch (err: any) {
      setTermsActionError(err?.message ?? "Chưa tạo được đơn hàng lúc này.");
    } finally {
      setTermsBusy(false);
    }
  };

  const handlePayOrder = async () => {
    if (!room.orderId || termsBusy) return;
    setTermsBusy(true);
    setTermsActionError(null);
    try {
      await client.request(`/orders/${room.orderId}/pay`, orderReceiptSchema, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ expectedVersion: 1 }),
      });
      sendAutoChatMessage("Tôi đã hoàn tất thanh toán đơn hàng qua Ví!");
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

      {/* 1.1 Thông báo lỗi nếu có */}
      {termsActionError && (
        <View style={{ marginHorizontal: space.md, marginTop: space.xs }}>
          <Notice tone="error">{termsActionError}</Notice>
        </View>
      )}

      {/* 1.2 Banner Thỏa thuận giá ghim trực tiếp trên Chat */}
      {room.terms?.pendingProposal && room.terms.pendingProposal.kind === "Price" ? (
        <View style={styles.pinnedBanner}>
          {room.terms.pendingProposal.proposedById !== currentUserId ? (
            <View style={styles.pendingProposalBox}>
              <View style={styles.proposalHeaderRow}>
                <Icon name="tag" size={16} color={stitchTokens.wineDark} />
                <AppText style={styles.proposalTitle}>
                  {other.displayName} đề xuất đổi giá thành{" "}
                  <AppText style={styles.priceHighlight}>
                    {(room.terms.pendingProposal.amount ?? 0).toLocaleString("vi-VN")} ₫
                  </AppText>
                </AppText>
              </View>
              <AppText style={styles.proposalDesc}>
                Bạn có đồng ý chốt mức giá này để tiến hành tạo đơn hàng và thanh toán không?
              </AppText>
              <View style={styles.proposalActionRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Từ chối"
                    secondary
                    busy={termsBusy}
                    onPress={() =>
                      handleRespondProposal(room.terms!.pendingProposal!.id, false)
                    }
                  />
                </View>
                <View style={{ flex: 1.2 }}>
                  <Button
                    title="Đồng ý giá này"
                    wine
                    busy={termsBusy}
                    onPress={() =>
                      handleRespondProposal(room.terms!.pendingProposal!.id, true)
                    }
                  />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.myPendingProposalBox}>
              <Icon name="clock" size={16} color={stitchTokens.wineDark} />
              <AppText style={styles.myPendingProposalText}>
                Bạn đã đề xuất đổi giá thành{" "}
                <AppText style={styles.priceHighlight}>
                  {(room.terms.pendingProposal.amount ?? 0).toLocaleString("vi-VN")} ₫
                </AppText>
                . Đang chờ {other.displayName} xác nhận…
              </AppText>
            </View>
          )}
        </View>
      ) : room.orderId ? (
        <View style={styles.pinnedBanner}>
          <View style={styles.orderReadyBox}>
            <View style={styles.orderReadyRow}>
              <Icon name="check" size={16} color={stitchTokens.likeNewGreen} />
              <AppText style={styles.orderReadyTitle}>
                Đơn hàng #{room.orderId.slice(0, 8)} đã được tạo
                {room.terms?.agreedPrice ? ` (${room.terms.agreedPrice.toLocaleString("vi-VN")} ₫)` : ""}
              </AppText>
            </View>
            {isBuyer ? (
              <View style={{ marginTop: 6 }}>
                <AppText style={styles.orderReadySub}>
                  Hãy bấm thanh toán ngay bằng số dư ví để người bán bắt đầu giao sách.
                </AppText>
                <View style={{ marginTop: 8 }}>
                  <Button
                    title="Thanh toán đơn hàng ngay (Ví)"
                    wine
                    busy={termsBusy}
                    onPress={handlePayOrder}
                  />
                </View>
              </View>
            ) : (
              <AppText style={styles.orderReadySub}>
                Đang chờ người mua thanh toán từ số dư ví để kích hoạt đóng gói và vận chuyển.
              </AppText>
            )}
          </View>
        </View>
      ) : room.terms?.agreedPrice ? (
        <View style={styles.pinnedBanner}>
          <View style={styles.agreedPriceBox}>
            <View style={styles.agreedHeaderRow}>
              <Icon name="check" size={16} color={stitchTokens.likeNewGreen} />
              <AppText style={styles.agreedTitle}>
                Hai bên đã chốt giá:{" "}
                <AppText style={styles.priceHighlight}>
                  {room.terms.agreedPrice.toLocaleString("vi-VN")} ₫
                </AppText>
              </AppText>
            </View>
            {!isBuyer ? (
              <View style={{ marginTop: 6 }}>
                <AppText style={styles.agreedSub}>
                  Người mua đã đồng ý mức giá này. Hãy bấm tạo đơn hàng giữ sách để người mua tiến hành thanh toán.
                </AppText>
                <View style={{ marginTop: 8 }}>
                  <Button
                    title="Tạo đơn hàng giữ sách ngay"
                    wine
                    busy={termsBusy}
                    onPress={() => setConfirmOrderDialogOpen(true)}
                  />
                </View>
              </View>
            ) : (
              <AppText style={styles.agreedSub}>
                Đã chốt giá thành công! Đang chờ người bán tạo đơn hàng để bạn tiến hành thanh toán.
              </AppText>
            )}
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

      {/* Modal Đề xuất giá mới */}
      <Modal
        visible={proposeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setProposeModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="tag" size={18} color={stitchTokens.wineDark} />
                <AppText style={styles.modalTitle}>
                  {isBuyer ? "Đề xuất mức giá bạn muốn mua" : "Đổi giá bán cho người mua"}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng modal"
                onPress={() => setProposeModalOpen(false)}
              >
                <Icon name="close" size={20} color={stitchTokens.darkWood} />
              </Pressable>
            </View>

            <AppText style={styles.modalSub}>
              Giá niêm yết hiện tại:{" "}
              <AppText style={{ fontWeight: "800", color: stitchTokens.wineDark }}>
                {getListingPrice(listing).toLocaleString("vi-VN")} ₫
              </AppText>
              . Đề xuất này sẽ gửi đến đối tác để họ xác nhận trước khi chốt đơn.
            </AppText>

            <View style={styles.inputSection}>
              <AppText style={styles.inputLabel}>Mức giá đề xuất mới (VNĐ):</AppText>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                value={proposePriceInput}
                onChangeText={(val) => setProposePriceInput(val.replace(/\D/g, ""))}
                placeholder="Ví dụ: 45000"
                placeholderTextColor="#999"
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
                      style={styles.presetChip}
                      onPress={() => setProposePriceInput(String(item.val))}
                    >
                      <AppText style={styles.presetChipText}>{item.label}</AppText>
                    </Pressable>
                  ));
                })()}
              </View>
            </View>

            <View style={styles.modalActionRow}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Hủy"
                  secondary
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
                    if (amount > 0) {
                      void handleProposePrice(amount);
                    }
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Dialog: Seller Creates Order */}
      <ConfirmDialog
        visible={confirmOrderDialogOpen}
        title="Tạo đơn hàng giữ sách?"
        message={`Tạo đơn hàng với mức giá đã thỏa thuận ${room.terms?.agreedPrice?.toLocaleString("vi-VN")} ₫. Người mua sẽ nhận được thông báo để bấm thanh toán qua Ví.`}
        confirmLabel="Tạo đơn hàng ngay"
        onCancel={() => setConfirmOrderDialogOpen(false)}
        onConfirm={() => {
          if (room.terms?.agreedPrice) {
            void handleConfirmCreateOrder(room.terms.agreedPrice);
          }
        }}
      />
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
  /* Pinned Terms Banner */
  pinnedBanner: {
    paddingHorizontal: space.md,
    paddingTop: space.xs,
  },
  pendingProposalBox: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: stitchTokens.wineDark,
    padding: space.sm,
    gap: 8,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  proposalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  proposalTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    flex: 1,
  },
  priceHighlight: {
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  proposalDesc: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    lineHeight: 16,
  },
  proposalActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  myPendingProposalBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.amberBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: space.sm,
  },
  myPendingProposalText: {
    fontSize: 12,
    color: stitchTokens.wineDark,
    flex: 1,
    lineHeight: 16,
  },
  orderReadyBox: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: stitchTokens.likeNewGreen,
    padding: space.sm,
    gap: 4,
  },
  orderReadyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderReadyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
    flex: 1,
  },
  orderReadySub: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    lineHeight: 16,
  },
  agreedPriceBox: {
    backgroundColor: "#F4F9F4",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: stitchTokens.likeNewGreen,
    padding: space.sm,
    gap: 4,
  },
  agreedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  agreedTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
    flex: 1,
  },
  agreedSub: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    lineHeight: 16,
  },
  /* Quick Offer Bar */
  quickBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 4,
  },
  makeOfferBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  makeOfferBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  referencePriceText: {
    fontSize: 11,
    color: colors.muted,
  },
  /* Modal Styles */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
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
    backgroundColor: "#fff",
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
