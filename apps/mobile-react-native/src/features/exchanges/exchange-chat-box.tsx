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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppText, AppTextInput, Icon, space, stitchTokens } from "../../core/ui";
import { useSession } from "../../core/session/session-provider";
import {
  exchangeMessagePageSchema,
  type ExchangeMessage,
} from "./contracts";
import { z } from "zod";

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

  const messagesQuery = useQuery({
    queryKey: ["exchange-messages", exchangeId],
    queryFn: () =>
      client.request(
        `/exchanges/${exchangeId}/messages`,
        exchangeMessagePageSchema,
      ),
    enabled: Boolean(exchangeId) && state.status === "authenticated",
    refetchInterval: 3500,
  });

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
      void queryClient.invalidateQueries({
        queryKey: ["exchange-messages", exchangeId],
      });
    },
  });

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || sendMutation.isPending || isReadOnly) return;
    sendMutation.mutate(trimmed);
  };

  const messages = messagesQuery.data?.items ?? [];

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

      {/* Messages List */}
      <View style={styles.messageListContainer}>
        {messagesQuery.isPending && messages.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={stitchTokens.wine} />
            <AppText style={styles.loadingText}>Đang tải tin nhắn...</AppText>
          </View>
        ) : messages.length === 0 ? (
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
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            renderItem={({ item }: { item: ExchangeMessage }) => {
              const isMe = item.senderId === currentUserId;
              const isSystem =
                item.body.startsWith("[") && item.body.includes("]");

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
                onChangeText={setInputText}
                placeholder="Nhắn tin về việc đổi sách..."
                placeholderTextColor={stitchTokens.subtleGray}
                multiline
                maxLength={1000}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gửi tin nhắn"
              onPress={handleSend}
              disabled={!inputText.trim() || sendMutation.isPending}
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
