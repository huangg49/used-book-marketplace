import React, { useRef, useState } from "react";
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
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AppText,
  AppTextInput,
  Icon,
  space,
  stitchTokens,
} from "../../core/ui";
import { useSession } from "../../core/session/session-provider";
import {
  exchangeMessagePageSchema,
  type ExchangeMessage,
} from "./contracts";
import { z } from "zod";
import {
  ApiError,
  CHAT_RATE_LIMIT_TEXT,
  clipChatMessage,
} from "@used-books/session-client";

interface ExchangeChatBoxProps {
  exchangeId: string;
  partnerName: string;
  isReadOnly?: boolean;
}

const QUICK_REPLIES = [
  "Chào bạn, sách còn đủ trang và bìa đẹp như mô tả chứ?",
  "Mình đang đóng gói và gửi đơn vận chuyển hôm nay nhé.",
  "Khi nào nhận được bưu kiện bạn nhắn mình nha!",
];

function formatMessageTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ExchangeChatBox({
  exchangeId,
  partnerName,
  isReadOnly = false,
}: ExchangeChatBoxProps) {
  const { client, state } = useSession();
  const queryClient = useQueryClient();
  const currentUserId = state.status === "authenticated" ? state.user.id : null;

  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const latestShown = useRef<string | undefined>(undefined);
  const nearBottom = useRef(true);
  const messagesKey = [
    "exchange-messages",
    currentUserId,
    exchangeId,
  ] as const;

  const messagesQuery = useInfiniteQuery({
    queryKey: messagesKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: "40" });
      if (pageParam !== undefined) query.set("before", pageParam);
      return client.request(
        `/exchanges/${exchangeId}/messages?${query}`,
        exchangeMessagePageSchema,
      );
    },
    getNextPageParam: (page) => page.olderCursor ?? undefined,
    enabled: Boolean(exchangeId) && currentUserId !== null,
    refetchInterval: (query) =>
      3500 * Math.max(1, query.state.data?.pages.length ?? 0),
  });

  const denied =
    messagesQuery.error instanceof ApiError &&
    [401, 403, 404].includes(messagesQuery.error.status);

  const sendMutation = useMutation({
    mutationFn: async (bodyText: string) => {
      return client.request(
        `/exchanges/${exchangeId}/messages`,
        z.object({ id: z.string() }),
        {
          method: "POST",
          body: JSON.stringify({ body: bodyText }),
        },
      );
    },
    onSuccess: () => {
      setInputText("");
      nearBottom.current = true;
      void queryClient.invalidateQueries({ queryKey: messagesKey });
    },
  });

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || sendMutation.isPending || isReadOnly || denied) return;
    sendMutation.mutate(trimmed);
  };

  const messages = denied
    ? []
    : (messagesQuery.data?.pages
        .slice()
        .reverse()
        .flatMap((page) => page.items) ?? []);
  const latest = messages.at(-1)?.id;
  const partnerInitial = (partnerName.trim()[0] || "Đ").toUpperCase();

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      {/* Slim Trust & Sync Sub-Strip (no duplicate partner header!) */}
      <View style={styles.trustBar}>
        <View style={styles.trustLeft}>
          <Icon name="shield" size={13} color={stitchTokens.wine} />
          <AppText style={styles.trustText} numberOfLines={1}>
            Tin nhắn được lưu làm bằng chứng bảo vệ giao dịch
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Làm mới tin nhắn"
          hitSlop={8}
          onPress={() => void messagesQuery.refetch()}
          style={({ pressed }) => [
            styles.refreshChip,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="sync" size={12} color={stitchTokens.wine} />
        </Pressable>
      </View>

      {messagesQuery.isError &&
        (denied || !messagesQuery.isFetchNextPageError) && (
          <View style={styles.alertBanner}>
            <AppText accessibilityRole="alert" style={styles.alertBannerText}>
              {denied
                ? "Bạn hiện không thể xem tin nhắn trong giao dịch này."
                : "Chưa tải được tin nhắn. Nhấn biểu tượng làm mới để thử lại."}
            </AppText>
          </View>
        )}

      {/* Full-Height Message Area */}
      <View style={styles.canvas}>
        {messagesQuery.isPending && messages.length === 0 ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="small" color={stitchTokens.wine} />
            <AppText style={styles.loadingText}>
              Đang tải cuộc trò chuyện...
            </AppText>
          </View>
        ) : messages.length === 0 && messagesQuery.isError ? null : messages.length ===
          0 ? (
          <View style={styles.centerBox}>
            <View style={styles.emptyIconCircle}>
              <Icon name="message" size={24} color={stitchTokens.wine} />
            </View>
            <AppText style={styles.emptyTitle}>
              Trò chuyện cùng {partnerName}
            </AppText>
            <AppText style={styles.emptySubtitle}>
              Trao đổi thêm về tình trạng sách, cách đóng gói hoặc hẹn giờ giao
              nhận tại đây.
            </AppText>

            {!isReadOnly && !denied ? (
              <View style={styles.quickSuggestionsWrap}>
                <AppText style={styles.quickSuggestionsTitle}>
                  Gợi ý nhắn nhanh:
                </AppText>
                {QUICK_REPLIES.map((reply) => (
                  <Pressable
                    key={reply}
                    accessibilityRole="button"
                    onPress={() => setInputText(reply)}
                    style={({ pressed }) => [
                      styles.quickChip,
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText style={styles.quickChipText}>{reply}</AppText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
            onScroll={({ nativeEvent }) => {
              nearBottom.current =
                nativeEvent.contentSize.height -
                  nativeEvent.contentOffset.y -
                  nativeEvent.layoutMeasurement.height <
                120;
            }}
            scrollEventThrottle={32}
            onContentSizeChange={() => {
              if (latestShown.current === latest) return;
              const firstLoad = latestShown.current === undefined;
              latestShown.current = latest;
              if (firstLoad || nearBottom.current) {
                flatListRef.current?.scrollToEnd({ animated: true });
              }
            }}
            ListHeaderComponent={
              messagesQuery.hasNextPage ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={messagesQuery.isFetching}
                  style={styles.loadOlderBtn}
                  onPress={() =>
                    void messagesQuery.fetchNextPage({ cancelRefetch: false })
                  }
                >
                  <AppText style={styles.loadOlderText}>
                    {messagesQuery.isFetchingNextPage
                      ? "Đang tải tin nhắn cũ…"
                      : messagesQuery.isFetchNextPageError
                        ? "Thử tải lại tin nhắn cũ"
                        : "Xem tin nhắn cũ hơn"}
                  </AppText>
                </Pressable>
              ) : null
            }
            renderItem={({ item }: { item: ExchangeMessage }) => {
              const isMe = item.senderId === currentUserId;
              const isVerdict = item.body.startsWith(
                "[Phán quyết của Quản trị viên]",
              );
              const isDispute = item.body.startsWith("[Sự cố]:");
              const isSystem =
                isVerdict ||
                isDispute ||
                (item.body.startsWith("[") && item.body.includes("]"));

              if (isVerdict) {
                return (
                  <View style={styles.verdictCard}>
                    <View style={styles.verdictHeader}>
                      <Icon
                        name="shield"
                        size={14}
                        color={stitchTokens.wineDark}
                      />
                      <AppText style={styles.verdictHeaderTitle}>
                        PHÁN QUYẾT CỦA QUẢN TRỊ VIÊN
                      </AppText>
                    </View>
                    <AppText style={styles.verdictBody}>
                      {item.body
                        .replace("[Phán quyết của Quản trị viên]\n", "")
                        .replace("[Phán quyết của Quản trị viên]", "")
                        .trim()}
                    </AppText>
                    <AppText style={styles.verdictTime}>
                      {formatMessageTime(item.sentAt)}
                    </AppText>
                  </View>
                );
              }

              if (isDispute) {
                return (
                  <View style={styles.disputeCard}>
                    <View style={styles.disputeCardHeader}>
                      <Icon
                        name="info"
                        size={14}
                        color={stitchTokens.flashRed}
                      />
                      <AppText style={styles.disputeCardTitle}>
                        BIÊN BẢN KHIẾU NẠI SÁCH
                      </AppText>
                    </View>
                    <AppText style={styles.disputeCardBody}>
                      {item.body}
                    </AppText>
                    <AppText style={styles.disputeCardTime}>
                      {formatMessageTime(item.sentAt)}
                    </AppText>
                  </View>
                );
              }

              if (isSystem) {
                return (
                  <View style={styles.systemBubble}>
                    <AppText style={styles.systemText}>{item.body}</AppText>
                    <AppText style={styles.systemTime}>
                      {formatMessageTime(item.sentAt)}
                    </AppText>
                  </View>
                );
              }

              return (
                <View
                  style={[
                    styles.messageRow,
                    isMe ? styles.messageRowMe : styles.messageRowPartner,
                  ]}
                >
                  {!isMe ? (
                    <View style={styles.msgAvatar}>
                      <AppText style={styles.msgAvatarText}>
                        {partnerInitial}
                      </AppText>
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.bubble,
                      isMe ? styles.bubbleMe : styles.bubblePartner,
                    ]}
                  >
                    <AppText
                      style={[
                        styles.bubbleText,
                        isMe ? styles.bubbleTextMe : styles.bubbleTextPartner,
                      ]}
                    >
                      {item.body}
                    </AppText>
                    <AppText
                      style={[
                        styles.timeText,
                        isMe ? styles.timeTextMe : styles.timeTextPartner,
                      ]}
                    >
                      {formatMessageTime(item.sentAt)}
                    </AppText>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      {sendMutation.isError && !denied && (
        <View style={styles.alertBanner}>
          <AppText accessibilityRole="alert" style={styles.alertBannerText}>
            {sendMutation.error instanceof ApiError &&
            sendMutation.error.status === 429
              ? CHAT_RATE_LIMIT_TEXT
              : "Chưa xác nhận tin nhắn đã gửi. Nội dung vẫn còn để bạn kiểm tra và thử lại."}
          </AppText>
        </View>
      )}

      {/* Horizontal quick chips strip when there are already messages */}
      {!isReadOnly && !denied && messages.length > 0 && !inputText ? (
        <View style={styles.quickStripOuter}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickStripContent}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_REPLIES.map((reply) => (
              <Pressable
                key={reply}
                onPress={() => setInputText(reply)}
                style={({ pressed }) => [
                  styles.quickStripPill,
                  pressed && styles.pressed,
                ]}
              >
                <AppText style={styles.quickStripPillText} numberOfLines={1}>
                  {reply}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Docked Bottom Input Composer Bar */}
      {!isReadOnly ? (
        <View style={styles.inputBar}>
          <AppTextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={(text) => setInputText(clipChatMessage(text))}
            editable={!denied && !sendMutation.isPending}
            placeholder={`Nhắn tin cho ${partnerName}...`}
            placeholderTextColor={stitchTokens.subtleGray}
            multiline
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gửi tin nhắn"
            onPress={handleSend}
            disabled={!inputText.trim() || sendMutation.isPending || denied}
            style={({ pressed }) => [
              styles.sendBtn,
              inputText.trim() ? styles.sendBtnActive : styles.sendBtnDisabled,
              pressed && styles.pressed,
            ]}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator
                size="small"
                color={
                  inputText.trim()
                    ? stitchTokens.whiteSurface
                    : stitchTokens.wineDark
                }
              />
            ) : (
              <Icon
                name="arrow"
                size={18}
                color={
                  inputText.trim()
                    ? stitchTokens.whiteSurface
                    : stitchTokens.subtleGray
                }
                strokeWidth={2.3}
              />
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.readOnlyBanner}>
          <Icon name="lock" size={13} color={stitchTokens.subtleGray} />
          <AppText style={styles.readOnlyText}>
            Giao dịch đã kết thúc, cuộc trò chuyện chuyển sang chế độ chỉ đọc.
          </AppText>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F6F2EB",
  },
  trustBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#FAF7F2",
    borderBottomWidth: 1,
    borderBottomColor: "#EFEAE2",
  },
  trustLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trustText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
  },
  refreshChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  alertBanner: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: stitchTokens.flashRedBg,
  },
  alertBannerText: {
    fontSize: 12,
    color: stitchTokens.crimson,
    textAlign: "center",
  },
  canvas: {
    flex: 1,
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
    textAlign: "center",
    lineHeight: 18,
  },
  quickSuggestionsWrap: {
    width: "100%",
    marginTop: 14,
    gap: 8,
  },
  quickSuggestionsTitle: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.subtleGray,
    textAlign: "center",
    marginBottom: 2,
  },
  quickChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: "#E8E0D5",
    alignItems: "center",
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  quickChipText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: stitchTokens.wineDark,
    textAlign: "center",
  },
  messagesList: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 10,
  },
  loadOlderBtn: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: stitchTokens.whiteSurface,
    marginBottom: 8,
  },
  loadOlderText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    width: "100%",
  },
  messageRowMe: {
    justifyContent: "flex-end",
  },
  messageRowPartner: {
    justifyContent: "flex-start",
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  msgAvatarText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    gap: 3,
  },
  bubbleMe: {
    backgroundColor: stitchTokens.wine,
    borderBottomRightRadius: 4,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 2,
  },
  bubblePartner: {
    backgroundColor: stitchTokens.whiteSurface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#EAE3D9",
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextMe: {
    color: stitchTokens.white,
  },
  bubbleTextPartner: {
    color: stitchTokens.darkWood,
  },
  timeText: {
    fontSize: 10,
    alignSelf: "flex-end",
    fontVariant: ["tabular-nums"],
  },
  timeTextMe: {
    color: "rgba(255, 248, 231, 0.72)",
  },
  timeTextPartner: {
    color: stitchTokens.subtleGray,
  },
  systemBubble: {
    alignSelf: "center",
    backgroundColor: stitchTokens.whiteSurface,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EAE3D9",
    marginVertical: 4,
    alignItems: "center",
    maxWidth: "90%",
  },
  systemText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: stitchTokens.darkWood,
    textAlign: "center",
  },
  systemTime: {
    fontSize: 9.5,
    color: stitchTokens.subtleGray,
    marginTop: 2,
  },
  verdictCard: {
    alignSelf: "center",
    backgroundColor: stitchTokens.goldLight,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.goldAccent,
    marginVertical: 6,
    width: "96%",
    gap: 6,
  },
  verdictHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.goldAccent,
  },
  verdictHeaderTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    letterSpacing: 0.4,
  },
  verdictBody: {
    fontSize: 12.5,
    fontWeight: "600",
    color: stitchTokens.darkWood,
    lineHeight: 18,
  },
  verdictTime: {
    fontSize: 10,
    color: stitchTokens.roseBrown,
    alignSelf: "flex-end",
  },
  disputeCard: {
    alignSelf: "center",
    backgroundColor: stitchTokens.roseWarmSurface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    marginVertical: 6,
    width: "96%",
    gap: 6,
  },
  disputeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
  },
  disputeCardTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.crimson,
    letterSpacing: 0.4,
  },
  disputeCardBody: {
    fontSize: 12.5,
    color: stitchTokens.darkWood,
    lineHeight: 18,
  },
  disputeCardTime: {
    fontSize: 10,
    color: stitchTokens.subtleGray,
    alignSelf: "flex-end",
  },
  quickStripOuter: {
    paddingVertical: 8,
    backgroundColor: "#F6F2EB",
  },
  quickStripContent: {
    paddingHorizontal: 14,
    gap: 8,
  },
  quickStripPill: {
    maxWidth: 230,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: "#E8E0D5",
  },
  quickStripPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.wineDark,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: stitchTokens.whiteSurface,
    borderTopWidth: 1,
    borderTopColor: "#EFEAE2",
  },
  textInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderRadius: 21,
    backgroundColor: "#F5F1EB",
    borderWidth: 1,
    borderColor: "#E6DDD2",
    fontSize: 14,
    lineHeight: 20,
    color: stitchTokens.darkWood,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 10 : 9,
    paddingBottom: Platform.OS === "ios" ? 10 : 9,
    textAlignVertical: "center",
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnActive: {
    backgroundColor: stitchTokens.wine,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: {
    backgroundColor: "#EFEAE2",
  },
  readOnlyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: space.md,
    backgroundColor: stitchTokens.whiteSurface,
    borderTopWidth: 1,
    borderTopColor: "#EFEAE2",
  },
  readOnlyText: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  pressed: {
    opacity: 0.78,
  },
});
