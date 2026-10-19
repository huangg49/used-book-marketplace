import { type StyleProp, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { WebBrandLogo } from "./brand-logo";
import { Icon } from "./icon";
import { AppText } from "./text";
import { stitchTokens } from "./theme";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "../session/session-provider";
import { getPurchaseConversations } from "../../features/conversations/purchase-conversation-service";

export interface TopNavbarProps {
  readonly onNotificationsPress?: () => void;
  readonly onMessagesPress?: () => void;
  readonly onLogoPress?: () => void;
  readonly hasNotification?: boolean;
  readonly notificationCount?: number;
  readonly messageCount?: number;
  readonly subtitle?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * TopNavbar - Thanh điều hướng đỉnh đồng bộ phong cách rượu vang của Lật Lại
 * Bao gồm Logo cú Lật Lại, nhãn phụ (TP. HỒ CHÍ MINH) và 2 nút hành động:
 * Chuông thông báo (bên trái) + Tin nhắn (bên phải).
 */
export function TopNavbar({
  onNotificationsPress,
  onMessagesPress,
  onLogoPress,
  hasNotification = true,
  notificationCount,
  messageCount,
  subtitle = "TP. Hồ Chí Minh",
  style,
}: TopNavbarProps) {
  const insets = useSafeAreaInsets();
  const { client, state } = useSession();
  const userId = state.status === "authenticated" ? state.user.id : undefined;

  // Tự động đếm số cuộc trò chuyện cần hành động hoặc đang hoạt động nếu không truyền messageCount
  const conversationsQuery = useQuery({
    queryKey: ["purchase-conversations-inbox-count"],
    queryFn: () => getPurchaseConversations(client),
    enabled: Boolean(userId) && messageCount === undefined,
    staleTime: 15_000,
    refetchInterval: 30_000,
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
      style={[
        styles.navbarRoot,
        { paddingTop: Math.max(insets.top, 14), paddingBottom: 14 },
        style,
      ]}
    >
      <View style={styles.navbarContent}>
        {/* Brand Logo & Subtitle */}
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
          {subtitle ? (
            <>
              <View style={styles.divider} />
              <AppText
                kind="small"
                style={{
                  fontSize: 11,
                  color: stitchTokens.gold,
                  fontWeight: "600",
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                }}
              >
                {subtitle}
              </AppText>
            </>
          ) : null}
        </Pressable>

        {/* Right Action Icons: Bell & Message */}
        <View style={styles.rightActionsGroup}>
          {/* Nút Chuông Thông Báo */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thông báo"
            onPress={handleNotificationsPress}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Icon name="bell" size={19} color="#FFFFFF" />
            {hasNotification ? (
              <View style={styles.notificationDot}>
                {notificationCount != null && notificationCount > 0 ? (
                  <AppText kind="small" style={styles.badgeNumber}>
                    {notificationCount > 9 ? "9+" : notificationCount}
                  </AppText>
                ) : null}
              </View>
            ) : null}
          </Pressable>

          {/* Nút Tin Nhắn */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tin nhắn"
            onPress={handleMessagesPress}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Icon name="message" size={18} color="#FFFFFF" />
            {effectiveMessageCount != null && effectiveMessageCount > 0 ? (
              <View style={styles.messageBadge}>
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
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 100,
  },
  navbarContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandGroup: {
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notificationDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: stitchTokens.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  messageBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: stitchTokens.gold,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeNumber: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    lineHeight: 11,
  },
});
