import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { WebBrandLogo } from "./brand-logo";
import { Icon } from "./icon";
import { AppText } from "./text";
import { stitchTokens } from "./theme";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../session/session-provider";
import { useForeground } from "../hooks/use-foreground";
import { useTransactionLive } from "../hooks/use-transaction-live";
import { getPurchaseConversations } from "../../features/conversations/purchase-conversation-service";

export interface TopNavbarProps {
  readonly onNotificationsPress?: () => void;
  readonly onMessagesPress?: () => void;
  readonly onLogoPress?: () => void;
  readonly notificationCount?: number;
  readonly messageCount?: number;
  readonly subtitle?: string;
  readonly leading?: ReactNode;
  readonly flushWithContent?: boolean;
}

/**
 * Thanh trên của các tab thành viên. Trang chủ có thể thay logo bằng ô tìm sách.
 */
export function TopNavbar({
  onNotificationsPress,
  onMessagesPress,
  onLogoPress,
  notificationCount = 0,
  messageCount,
  subtitle = "TP. Hồ Chí Minh",
  leading,
  flushWithContent = false,
}: TopNavbarProps) {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const { client, state } = useSession();
  const userId = state.status === "authenticated" ? state.user.id : undefined;

  // Tự động đếm số cuộc trò chuyện cần hành động hoặc đang hoạt động nếu không truyền messageCount
  const queryClient = useQueryClient();
  const foreground = useForeground();
  const counting = Boolean(userId) && messageCount === undefined;
  // Chat commits wake the member inbox; the poll only backs up a dropped socket.
  const live = useTransactionLive("inbox", userId ?? "", foreground && counting, () => {
    void queryClient.invalidateQueries({ queryKey: ["purchase-conversations-inbox-count"] });
  });
  const conversationsQuery = useQuery({
    queryKey: ["purchase-conversations-inbox-count"],
    queryFn: () => getPurchaseConversations(client),
    enabled: counting,
    staleTime: 4_000,
    refetchInterval: !foreground ? false : live ? 60_000 : 6_000,
  });

  const effectiveMessageCount =
    messageCount !== undefined
      ? messageCount
      : conversationsQuery.data
        ? conversationsQuery.data.filter((c) => {
            if (c.status !== "Active") return false;
            if (!userId) return false;
            const proposal = c.terms?.pendingProposal;
            if (proposal) {
              return proposal.proposedById !== userId; // Đối phương gửi đề xuất cần mình phản hồi
            }
            return false;
          }).length
        : undefined;

  const handleLogoPress = () => {
    if (onLogoPress) {
      onLogoPress();
    } else {
      router.navigate("/");
    }
  };

  const handleNotificationsPress = () => {
    if (onNotificationsPress) {
      onNotificationsPress();
    } else {
      router.navigate("/");
    }
  };

  const handleMessagesPress = () => {
    if (onMessagesPress) {
      onMessagesPress();
    } else {
      router.push("/chat-inbox");
    }
  };

  return (
    <View
      {...(Platform.OS === "web" ? { dataSet: { focusInverse: "true" } } : {})}
      style={[
        styles.navbarRoot,
        flushWithContent && styles.flushWithContent,
        { paddingTop: Math.max(insets.top, 14) },
      ]}
    >
      <View style={styles.navbarContent}>
        <View style={styles.leading}>
          {leading ?? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Về trang chủ Lật Lại"
              onPress={handleLogoPress}
              style={({ pressed }) => [
                styles.brandGroup,
                pressed && { opacity: 0.85 },
              ]}
            >
              <WebBrandLogo scale={0.78} />
              {subtitle && width >= 480 && fontScale < 1.3 ? (
                <>
                  <View style={styles.divider} />
                  <AppText kind="small" style={styles.subtitle} numberOfLines={1}>
                    {subtitle}
                  </AppText>
                </>
              ) : null}
            </Pressable>
          )}
        </View>

        {/* Right Action Icons: Bell & Message */}
        <View style={styles.rightActionsGroup}>
          {/* Nút Chuông Thông Báo */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={notificationCount > 0 ? `Thông báo (${notificationCount} chưa đọc)` : "Thông báo"}
            onPress={handleNotificationsPress}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Icon name="bell" size={20} color={stitchTokens.white} />
            {notificationCount > 0 ? (
              <View style={styles.countBadge} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <AppText kind="small" style={styles.badgeNumber}>
                  {notificationCount > 9 ? "9+" : notificationCount}
                </AppText>
              </View>
            ) : null}
          </Pressable>

          {/* Nút Tin Nhắn */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={effectiveMessageCount ? `Tin nhắn (${effectiveMessageCount} đề nghị cần phản hồi)` : "Tin nhắn"}
            onPress={handleMessagesPress}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Icon name="message" size={20} color={stitchTokens.white} />
            {effectiveMessageCount != null && effectiveMessageCount > 0 ? (
              <View style={styles.countBadge} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <AppText kind="small" style={styles.badgeNumber}>
                  {effectiveMessageCount > 9 ? "9+" : effectiveMessageCount}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navbarRoot: {
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 100,
  },
  flushWithContent: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  navbarContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
  },
  leading: {
    flex: 1,
    minWidth: 0,
  },
  brandGroup: {
    minHeight: 48,
    alignSelf: "flex-start",
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  divider: {
    width: 1,
    height: 18,
    backgroundColor: "rgba(255, 223, 151, 0.4)",
    marginHorizontal: 2,
  },
  rightActionsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: stitchTokens.whiteAlpha14,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  subtitle: {
    flexShrink: 1,
    fontSize: 11,
    color: stitchTokens.gold,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  countBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    minHeight: 16,
    borderRadius: 12,
    backgroundColor: stitchTokens.goldAccent,
    borderWidth: 1,
    borderColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeNumber: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    lineHeight: 11,
  },
});
