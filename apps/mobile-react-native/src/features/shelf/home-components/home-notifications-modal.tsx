import { useMemo, useState } from "react";
import { ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { AppText } from "../../../core/ui/text";
import { AppModal, Button, Icon, stitchTokens  } from "../../../core/ui";
import { useSession } from "../../../core/session/session-provider";
import {
  useNotifications,
  useMarkNotificationsRead,
} from "../../notifications/notifications-model";
import {
  INITIAL_NOTIFICATIONS,
  type HomeNotificationItem,
} from "../home-mock-data";

export interface HomeNotificationsModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

function formatNotificationTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "Vừa xong";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return new Date(isoString).toLocaleDateString("vi-VN");
  } catch {
    return "Gần đây";
  }
}

export function HomeNotificationsModal({
  visible,
  onClose,
}: HomeNotificationsModalProps) {
  const { client, state } = useSession();
  const isAuthenticated = state.status === "authenticated";

  // Real API notifications query
  const query = useNotifications(client, isAuthenticated);
  const markRead = useMarkNotificationsRead(client);

  // Local state fallback for mock when not authenticated or offline
  const [localMockNotifications, setLocalMockNotifications] = useState<
    readonly HomeNotificationItem[]
  >(INITIAL_NOTIFICATIONS);

  // Merge & normalize items
  const displayItems = useMemo(() => {
    if (isAuthenticated && query.data?.items) {
      return query.data.items.map((it) => ({
        id: it.id,
        title: it.title,
        message: it.body,
        time: formatNotificationTime(it.createdAt),
        read: Boolean(it.readAt),
        type: "auction" as const,
      }));
    }
    return localMockNotifications;
  }, [isAuthenticated, query.data, localMockNotifications]);

  const handleMarkAllRead = () => {
    if (isAuthenticated) {
      markRead.mutate({ all: true });
    } else {
      setLocalMockNotifications((prev) =>
        prev.map((item) => ({ ...item, read: true })),
      );
    }
  };

  const handleItemPress = (itemId: string, isRead: boolean) => {
    if (isAuthenticated && !isRead) {
      markRead.mutate({ ids: [itemId] });
    } else if (!isAuthenticated) {
      setLocalMockNotifications((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, read: true } : it)),
      );
    }
  };

  return (
    <AppModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Đóng thông báo"
        />
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <Icon name="bell" size={22} color={stitchTokens.wine} />
              <AppText kind="bookHeading" style={styles.headerTitle}>
                Thông Báo
              </AppText>
              {isAuthenticated && query.data ? (
                <View style={styles.badgeUnreadCount}>
                  <AppText kind="small" style={styles.badgeUnreadText}>
                    {query.data.unreadCount} mới
                  </AppText>
                </View>
              ) : null}
            </View>
            <View style={styles.headerRight}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đánh dấu tất cả đã đọc"
                onPress={handleMarkAllRead}
                disabled={markRead.isPending}
                style={styles.markReadBtn}
              >
                {markRead.isPending ? (
                  <ActivityIndicator size="small" color={stitchTokens.wine} />
                ) : (
                  <AppText kind="small" style={styles.markReadText}>
                    Đã đọc tất cả
                  </AppText>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                onPress={onClose}
                hitSlop={8}
                style={styles.closeBtn}
              >
                <Icon name="close" size={20} color={stitchTokens.stoneMuted} />
              </Pressable>
            </View>
          </View>

          {/* Notifications List */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {query.isPending && isAuthenticated ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={stitchTokens.wine} />
                <AppText kind="small" style={styles.loadingText}>
                  Đang tải hộp thư thông báo…
                </AppText>
              </View>
            ) : null}

            {isAuthenticated && !query.isPending && displayItems.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Icon name="bell" size={26} color={stitchTokens.coolMuted} />
                </View>
                <AppText kind="bold" style={styles.emptyTitle}>
                  Hộp thư thông báo đang trống
                </AppText>
                <AppText kind="small" style={styles.emptySubtitle}>
                  Bạn chưa có thông báo nào từ các phiên đấu giá hoặc đơn sách.
                </AppText>
              </View>
            ) : null}

            {displayItems.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => handleItemPress(item.id, item.read)}
                style={({ pressed }) => [
                  styles.notifItem,
                  !item.read && styles.notifUnread,
                  pressed && { opacity: 0.88 },
                ]}
              >
                <View
                  style={[
                    styles.iconCircle,
                    item.type === "order"
                      ? styles.iconOrder
                      : item.type === "auction"
                        ? styles.iconAuction
                        : styles.iconDefault,
                  ]}
                >
                  <Icon
                    name={
                      item.type === "order"
                        ? "truck"
                        : item.type === "auction"
                          ? "gavel"
                          : item.type === "voucher"
                            ? "ticket"
                            : "info"
                    }
                    size={16}
                    color={stitchTokens.white}
                  />
                </View>

                <View style={styles.itemTextContainer}>
                  <View style={styles.itemTitleRow}>
                    <AppText kind="bold" style={styles.itemTitle}>
                      {item.title}
                    </AppText>
                    {!item.read ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <AppText kind="small" style={styles.itemMessage}>
                    {item.message}
                  </AppText>
                  <AppText kind="small" style={styles.itemTime}>
                    {item.time}
                  </AppText>
                </View>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.bottomArea}>
            <Button title="Đóng" secondary onPress={onClose} />
          </View>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: stitchTokens.modalScrim,
    justifyContent: "flex-end",
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: stitchTokens.parchment,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "80%",
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: stitchTokens.warmBorder,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  badgeUnreadCount: {
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeUnreadText: {
    fontSize: 10,
    color: stitchTokens.white,
    fontWeight: "600",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  markReadBtn: {
    paddingVertical: 4,
  },
  markReadText: {
    fontSize: 11,
    color: stitchTokens.wine,
    fontWeight: "600",
  },
  closeBtn: {
    padding: 4,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 12,
    color: stitchTokens.stoneMuted,
  },
  notifItem: {
    flexDirection: "row",
    backgroundColor: stitchTokens.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.creamParchment,
    padding: 12,
    gap: 10,
    alignItems: "flex-start",
  },
  notifUnread: {
    backgroundColor: stitchTokens.creamWarm,
    borderColor: stitchTokens.peachLight,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  iconOrder: {
    backgroundColor: stitchTokens.trustBlue,
  },
  iconAuction: {
    backgroundColor: stitchTokens.wine,
  },
  iconDefault: {
    backgroundColor: stitchTokens.oliveGreen,
  },
  itemTextContainer: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemTitle: {
    fontSize: 12,
    color: stitchTokens.charcoalBrown,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.flashRed,
  },
  itemMessage: {
    fontSize: 11,
    color: stitchTokens.stoneMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  itemTime: {
    fontSize: 10,
    color: stitchTokens.coolMuted,
    marginTop: 4,
  },
  bottomArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: stitchTokens.warmBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 14,
    color: stitchTokens.warmSlate,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 12,
    color: stitchTokens.mediumAsh,
    textAlign: "center",
    lineHeight: 17,
  },
});
