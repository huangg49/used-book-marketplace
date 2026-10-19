import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Icon, stitchTokens } from "../../../core/ui";
import { AppText } from "../../../core/ui/text";
import { useSession } from "../../../core/session/session-provider";
import { getPurchaseConversations } from "../../conversations/purchase-conversation-service";

export interface HomeHeaderProps {
  readonly onSearchPress?: () => void;
  readonly search?: string;
  readonly onSearchChange?: (value: string) => void;
  readonly onSubmitSearch?: () => void;
  readonly onCameraPress: () => void;
  readonly onOpenNotifications: () => void;
  readonly onMessagesPress?: () => void;
  readonly notificationCount?: number;
  readonly messageCount?: number;
}

export function HomeHeader({
  onSearchPress,
  search = "",
  onCameraPress,
  onOpenNotifications,
  onMessagesPress,
  notificationCount = 0,
  messageCount,
}: HomeHeaderProps) {
  const insets = useSafeAreaInsets();
  const { client, state } = useSession();
  const userId = state.status === "authenticated" ? state.user.id : undefined;

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
              return proposal.proposedById !== userId;
            }
            return false;
          }).length
        : undefined;

  const handleMessagesPress = () => {
    if (onMessagesPress) {
      onMessagesPress();
    } else {
      router.push("/chat-inbox");
    }
  };

  return (
    <View style={[styles.headerRoot, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.headerContent}>
        {/* Search Bar - Button-like trigger navigating directly to /search */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tìm sách theo tên, tác giả hoặc ISBN"
          onPress={onSearchPress}
          style={({ pressed }) => [
            styles.searchBar,
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={styles.searchIconWrapper}>
            <Icon name="search" size={18} color={stitchTokens.wine} />
          </View>
          <View pointerEvents="none" style={styles.searchInputWrapper}>
            <AppText
              kind="small"
              style={[
                styles.searchPlaceholder,
                search ? styles.searchActiveText : null,
              ]}
              numberOfLines={1}
            >
              {search || "Tìm kiếm sách cổ, tác giả, tựa s..."}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tìm bằng hình ảnh bìa sách"
            onPress={(e) => {
              e.stopPropagation();
              onCameraPress();
            }}
            hitSlop={8}
            style={styles.iconButton}
          >
            <Icon name="camera" size={18} color={stitchTokens.stoneMuted} />
          </Pressable>
        </Pressable>

        {/* Action: Notifications */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Thông báo (${notificationCount} chưa đọc)`}
          onPress={onOpenNotifications}
          style={({ pressed }) => [
            styles.headerActionBtn,
            pressed && styles.btnPressed,
          ]}
        >
          <Icon name="bell" size={22} color={stitchTokens.white} />
          {notificationCount > 0 ? (
            <View style={styles.badgePill}>
              <AppText kind="small" style={styles.badgeText}>
                {notificationCount > 9 ? "9+" : notificationCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>

        {/* Action: Messages */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tin nhắn"
          onPress={handleMessagesPress}
          style={({ pressed }) => [
            styles.headerActionBtn,
            pressed && styles.btnPressed,
          ]}
        >
          <Icon name="message" size={20} color={stitchTokens.white} />
          {effectiveMessageCount != null && effectiveMessageCount > 0 ? (
            <View style={styles.badgePill}>
              <AppText kind="small" style={styles.badgeText}>
                {effectiveMessageCount > 9 ? "9+" : effectiveMessageCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRoot: {
    backgroundColor: stitchTokens.wine,
    paddingBottom: 10,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 100,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    backgroundColor: stitchTokens.white,
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: stitchTokens.softRose,
  },
  searchIconWrapper: {
    marginRight: 8,
  },
  searchInputWrapper: {
    flex: 1,
    justifyContent: "center",
  },
  searchPlaceholder: {
    fontSize: 13,
    color: stitchTokens.ashBrown,
  },
  searchActiveText: {
    color: stitchTokens.charcoalBrown,
    fontWeight: "500",
  },
  iconButton: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  headerActionBtn: {
    position: "relative",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  btnPressed: {
    opacity: 0.75,
  },
  badgePill: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: stitchTokens.goldAccent,
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    lineHeight: 11,
  },
});
