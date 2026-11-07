import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppText, AppTextInput, Icon, space, stitchTokens } from "../../core/ui";
import { useSession } from "../../core/session/session-provider";
import {
  exchangeMessagePageSchema,
  type ExchangeMessage,
} from "./contracts";
import { z } from "zod";
import { ApiError, CHAT_RATE_LIMIT_TEXT, clipChatMessage } from "@used-books/session-client";

interface ExchangeChatBoxProps {
  exchangeId: string;
  partnerName: string;
  isReadOnly?: boolean;
}

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
  const messagesKey = ["exchange-messages", currentUserId, exchangeId] as const;
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
    refetchInterval: (query) => 3500 * Math.max(1, query.state.data?.pages.length ?? 0),
  });
  const denied = messagesQuery.error instanceof ApiError
    && [401, 403, 404].includes(messagesQuery.error.status);

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

  const messages = denied ? [] : messagesQuery.data?.pages.slice().reverse().flatMap((page) => page.items) ?? [];
  const latest = messages.at(-1)?.id;

  return (
    <View style={styles.card}>
      {/* Chat Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarMini}>
            <Icon name="person" size={16} color={stitchTokens.white} />
          </View>
          <View>
            <AppText style={styles.title}>Hộp thoại trao đổi</AppText>
            <AppText style={styles.subtitle}>
              Trò chuyện cùng <AppText style={styles.partnerName}>{partnerName}</AppText>
            </AppText>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Làm mới tin nhắn"
          onPress={() => void messagesQuery.refetch()}
          style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
        >
          <Icon
            name="sync"
            size={14}
            color={stitchTokens.wineMid}
          />
        </Pressable>
      </View>

      {messagesQuery.isError && (denied || !messagesQuery.isFetchNextPageError) && (
        <AppText accessibilityRole="alert" style={styles.emptySubtitle}>
          {denied ? "Bạn hiện không thể xem tin nhắn trong giao dịch này." : "Chưa tải được tin nhắn. Dùng nút làm mới để thử lại."}
        </AppText>
      )}

      {/* Messages List */}
      <View style={styles.messageListContainer}>
        {messagesQuery.isPending && messages.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={stitchTokens.wine} />
            <AppText style={styles.loadingText}>Đang tải tin nhắn...</AppText>
          </View>
        ) : messages.length === 0 && messagesQuery.isError ? null : messages.length === 0 ? (
          <View style={styles.emptyBox}>
            <Icon name="message" size={26} color={stitchTokens.roseBrown} />
            <AppText style={styles.emptyTitle}>Chưa có tin nhắn</AppText>
            <AppText style={styles.emptySubtitle}>
              Gửi tin nhắn mở lời về tình trạng sách hoặc phương thức bàn giao.
            </AppText>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
            onScroll={({ nativeEvent }) => {
              nearBottom.current = nativeEvent.contentSize.height
                - nativeEvent.contentOffset.y - nativeEvent.layoutMeasurement.height < 120;
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
            ListHeaderComponent={messagesQuery.hasNextPage ? (
              <Pressable
                accessibilityRole="button"
                disabled={messagesQuery.isFetching}
                onPress={() => void messagesQuery.fetchNextPage({ cancelRefetch: false })}
              >
                <AppText style={styles.emptySubtitle}>
                  {messagesQuery.isFetchingNextPage
                    ? "Đang tải tin nhắn cũ…"
                    : messagesQuery.isFetchNextPageError ? "Thử tải lại tin nhắn cũ" : "Tải tin nhắn cũ"}
                </AppText>
              </Pressable>
            ) : null}
            renderItem={({ item }: { item: ExchangeMessage }) => {
              const isMe = item.senderId === currentUserId;
              const isVerdict = item.body.startsWith("[Phán quyết của Quản trị viên]");
              const isDispute = item.body.startsWith("[Sự cố]:");
              const isSystem = isVerdict || isDispute || (item.body.startsWith("[") && item.body.includes("]"));

              if (isVerdict) {
                return (
                  <View style={styles.verdictCard}>
                    <View style={styles.verdictHeader}>
                      <Icon name="shield" size={14} color={stitchTokens.wineDark} />
                      <AppText style={styles.verdictHeaderTitle}>PHÁN QUYẾT CỦA QUẢN TRỊ VIÊN</AppText>
                    </View>
                    <AppText style={styles.verdictBody}>
                      {item.body.replace("[Phán quyết của Quản trị viên]\n", "").replace("[Phán quyết của Quản trị viên]", "").trim()}
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
                      <Icon name="info" size={14} color={stitchTokens.flashRed} />
                      <AppText style={styles.disputeCardTitle}>BIÊN BẢN KHIẾU NẠI SÁCH</AppText>
                    </View>
                    <AppText style={styles.disputeCardBody}>{item.body}</AppText>
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
        <AppText accessibilityRole="alert" style={styles.emptySubtitle}>
          {sendMutation.error instanceof ApiError && sendMutation.error.status === 429
            ? CHAT_RATE_LIMIT_TEXT
            : "Chưa xác nhận tin nhắn đã gửi. Nội dung vẫn còn để bạn kiểm tra và thử lại."}
        </AppText>
      )}

      {/* Input Bar */}
      {!isReadOnly ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={12}
        >
          <View style={styles.inputBar}>
            <View style={styles.inputContainer}>
              <AppTextInput
                style={styles.textInput}
                value={inputText}
                onChangeText={(text) => setInputText(clipChatMessage(text))}
                editable={!denied && !sendMutation.isPending}
                placeholder="Nhắn tin về việc đổi sách..."
                placeholderTextColor={stitchTokens.subtleGray}
                multiline
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gửi tin nhắn"
              onPress={handleSend}
              disabled={!inputText.trim() || sendMutation.isPending || denied}
              style={({ pressed }) => [
                styles.sendBtn,
                inputText.trim()
                  ? styles.sendBtnActive
                  : styles.sendBtnDisabled,
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
                  size={19}
                  color={
                    inputText.trim()
                      ? stitchTokens.whiteSurface
                      : stitchTokens.subtleGray
                  }
                  strokeWidth={2.2}
                />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.readOnlyBanner}>
          <AppText style={styles.readOnlyText}>
            Giao dịch đã kết thúc hoặc bị hủy, cuộc trò chuyện chuyển sang chỉ đọc.
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachMuted,
    overflow: "hidden",
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: 12,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarMini: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  subtitle: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
  },
  partnerName: {
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: stitchTokens.terracottaSoft,
  },
  messageListContainer: {
    minHeight: 220,
    maxHeight: 340,
    backgroundColor: stitchTokens.parchment,
  },
  messagesList: {
    padding: space.md,
    gap: 10,
  },
  loadingBox: {
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  emptyBox: {
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  emptySubtitle: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    textAlign: "center",
    lineHeight: 16,
  },
  messageRow: {
    flexDirection: "row",
    width: "100%",
  },
  messageRowMe: {
    justifyContent: "flex-end",
  },
  messageRowPartner: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 3,
  },
  bubbleMe: {
    backgroundColor: stitchTokens.wineMid,
    borderBottomRightRadius: 3,
  },
  bubblePartner: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderBottomLeftRadius: 3,
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 18,
  },
  bubbleTextMe: {
    color: stitchTokens.white,
  },
  bubbleTextPartner: {
    color: stitchTokens.darkWood,
  },
  timeText: {
    fontSize: 9,
    alignSelf: "flex-end",
  },
  timeTextMe: {
    color: stitchTokens.roseWarmTag,
  },
  timeTextPartner: {
    color: stitchTokens.subtleGray,
  },
  systemBubble: {
    alignSelf: "center",
    backgroundColor: stitchTokens.amberBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
    marginVertical: 4,
    alignItems: "center",
    maxWidth: "90%",
  },
  systemText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.darkWood,
    textAlign: "center",
  },
  systemTime: {
    fontSize: 9,
    color: stitchTokens.roseBrown,
    marginTop: 2,
  },
  verdictCard: {
    alignSelf: "center",
    backgroundColor: stitchTokens.amberBg,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: stitchTokens.goldBorder,
    marginVertical: 6,
    maxWidth: "94%",
    width: "94%",
    gap: 6,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  verdictHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.goldBorder,
  },
  verdictHeaderTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    letterSpacing: 0.5,
  },
  verdictBody: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.darkWood,
    lineHeight: 18,
  },
  verdictTime: {
    fontSize: 9,
    color: stitchTokens.roseBrown,
    alignSelf: "flex-end",
  },
  disputeCard: {
    alignSelf: "center",
    backgroundColor: stitchTokens.roseWarmSurface,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    marginVertical: 6,
    maxWidth: "94%",
    width: "94%",
    gap: 6,
  },
  disputeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
  },
  disputeCardTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.crimson,
    letterSpacing: 0.5,
  },
  disputeCardBody: {
    fontSize: 12,
    color: stitchTokens.darkWood,
    lineHeight: 17,
  },
  disputeCardTime: {
    fontSize: 9,
    color: stitchTokens.subtleGray,
    alignSelf: "flex-end",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    backgroundColor: stitchTokens.whiteSurface,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.peachBorder,
  },
  inputContainer: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 14,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1.2,
    borderColor: stitchTokens.peachBorder,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 4 : 2,
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: stitchTokens.wineDark,
    paddingVertical: Platform.OS === "ios" ? 8 : 6,
    paddingHorizontal: 0,
    textAlignVertical: "center",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnActive: {
    backgroundColor: stitchTokens.wineDark,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  sendBtnDisabled: {
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1.2,
    borderColor: stitchTokens.peachBorder,
    opacity: 0.75,
  },
  readOnlyBanner: {
    padding: 10,
    backgroundColor: stitchTokens.canvasMuted,
    alignItems: "center",
  },
  readOnlyText: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    fontStyle: "italic",
    textAlign: "center",
  },
  pressed: {
    opacity: 0.8,
  },
});
