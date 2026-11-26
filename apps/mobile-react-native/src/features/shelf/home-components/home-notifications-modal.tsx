import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { AppText } from "../../../core/ui/text";
import {
  AppModal,
  Icon,
  StatePanel,
  stitchTokens,
  type IconName,
} from "../../../core/ui";
import { useSession } from "../../../core/session/session-provider";
import {
  useNotifications,
  useMarkNotificationsRead,
} from "../../notifications/notifications-model";

export interface HomeNotificationsModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

type NotificationFilter = "all" | "unread";

interface NotificationVisual {
  icon: IconName;
  iconColor: string;
  badgeBg: string;
  category: string;
}

function resolveNotificationVisual(
  targetType: string | null | undefined,
  kind: string | null | undefined,
  title: string,
): NotificationVisual {
  const lowerTitle = title.toLowerCase();
  const isShippingText =
    lowerTitle.includes("vận đơn") ||
    lowerTitle.includes("lấy hàng") ||
    lowerTitle.includes("đang giao") ||
    lowerTitle.includes("nhận được sách") ||
    lowerTitle.includes("đã giao");

  if (kind === "OrderSaleSettled" || targetType === "Withdrawal") {
    return {
      icon: "wallet",
      iconColor: stitchTokens.likeNewGreen,
      badgeBg: stitchTokens.likeNewGreenBg,
      category: "Ví tiền",
    };
  }
  if (targetType === "SupportCase") {
    return {
      icon: "shield",
      iconColor: stitchTokens.crimson,
      badgeBg: stitchTokens.flashRedBg,
      category: "Hỗ trợ",
    };
  }
  if (targetType === "Auction" || targetType === "AuctionIntake") {
    return {
      icon: "gavel",
      iconColor: stitchTokens.wine,
      badgeBg: stitchTokens.roseParchment,
      category: "Đấu giá",
    };
  }
  if (targetType === "Exchange") {
    if (lowerTitle.includes("hoàn tất")) {
      return {
        icon: "check",
        iconColor: stitchTokens.likeNewGreen,
        badgeBg: stitchTokens.likeNewGreenBg,
        category: "Trao đổi",
      };
    }
    if (isShippingText) {
      return {
        icon: "truck",
        iconColor: stitchTokens.forestGreen,
        badgeBg: stitchTokens.likeNewGreenBg,
        category: "Trao đổi",
      };
    }
    return {
      icon: "swap",
      iconColor: stitchTokens.tagExchangeText,
      badgeBg: stitchTokens.tagExchangeBg,
      category: "Trao đổi",
    };
  }
  if (targetType === "Order") {
    if (isShippingText) {
      return {
        icon: "truck",
        iconColor: stitchTokens.forestGreen,
        badgeBg: stitchTokens.likeNewGreenBg,
        category: "Vận chuyển",
      };
    }
    return {
      icon: "bag",
      iconColor: stitchTokens.wine,
      badgeBg: stitchTokens.roseParchment,
      category: "Đơn hàng",
    };
  }
  if (targetType === "PurchaseConversation") {
    return {
      icon: "message",
      iconColor: stitchTokens.wineDark,
      badgeBg: stitchTokens.goldLight,
      category: "Thương lượng",
    };
  }
  if (targetType === "Listing") {
    const rejected =
      kind === "ListingRejected" || lowerTitle.includes("từ chối");
    return {
      icon: "book",
      iconColor: rejected ? stitchTokens.crimson : stitchTokens.likeNewGreen,
      badgeBg: rejected
        ? stitchTokens.flashRedBg
        : stitchTokens.likeNewGreenBg,
      category: "Bài đăng",
    };
  }
  if (targetType === "TransactionReview") {
    return {
      icon: "star",
      iconColor: stitchTokens.goldBronze,
      badgeBg: stitchTokens.goldLight,
      category: "Đánh giá",
    };
  }
  return {
    icon: "bell",
    iconColor: stitchTokens.wine,
    badgeBg: stitchTokens.roseParchment,
    category: "Hệ thống",
  };
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
  const insets = useSafeAreaInsets();
  const { client, state } = useSession();
  const isAuthenticated = state.status === "authenticated";
  const [filter, setFilter] = useState<NotificationFilter>("all");

  // Real API notifications query
  const query = useNotifications(client, isAuthenticated);
  const markRead = useMarkNotificationsRead(client);

  const displayItems = useMemo(
    () =>
      isAuthenticated
        ? (query.data?.items ?? []).map((it) => ({
            id: it.id,
            title: it.title,
            message: it.body,
            time: formatNotificationTime(it.createdAt),
            read: Boolean(it.readAt),
            kind: it.kind,
            targetType: it.targetType,
            targetId: it.targetId,
          }))
        : [],
    [isAuthenticated, query.data],
  );

  const unreadCount = query.data?.unreadCount ?? 0;
  const visibleItems = useMemo(
    () =>
      filter === "unread"
        ? displayItems.filter((item) => !item.read)
        : displayItems,
    [displayItems, filter],
  );

  const handleMarkAllRead = () => {
    if (isAuthenticated && unreadCount > 0) {
      markRead.mutate({ all: true });
    }
  };

  const handleItemPress = (item: (typeof displayItems)[number]) => {
    if (isAuthenticated && !item.read) markRead.mutate({ ids: [item.id] });
    onClose();
    switch (item.targetType) {
      case "Exchange":
        router.push({ pathname: "/exchange", params: { id: item.targetId } });
        break;
      case "Order":
        if (item.kind === "OrderSaleSettled") {
          router.push({ pathname: "/wallet", params: { sale: item.targetId } });
        } else {
          router.push({ pathname: "/orders", params: { orderId: item.targetId } });
        }
        break;
      case "PurchaseConversation":
        router.push({ pathname: "/conversation", params: { id: item.targetId } });
        break;
      case "Auction":
        router.push({ pathname: "/auction", params: { id: item.targetId } });
        break;
      case "AuctionIntake":
        router.push({
          pathname: "/send-to-auction",
          params: { intakeId: item.targetId },
        });
        break;
      case "Listing":
        if (item.kind === "ListingApproved") {
          router.push({ pathname: "/book", params: { id: item.targetId } });
        } else {
          router.push({ pathname: "/drafts", params: { listingId: item.targetId } });
        }
        break;
      case "SupportCase":
        router.push({ pathname: "/support", params: { id: item.targetId } });
        break;
      case "Withdrawal":
        router.push({ pathname: "/wallet", params: { section: "history" } });
        break;
      case "TransactionReview":
        router.push("/reviews");
        break;
    }
  };

  const canMarkAll = isAuthenticated && unreadCount > 0 && !markRead.isPending;

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
        <View
          style={[
            styles.sheetContainer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          {/* Drag Handle */}
          <View style={styles.handleRow}>
            <View style={styles.handleBar} />
          </View>

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <AppText kind="bookHeading" style={styles.headerTitle}>
                Thông báo
              </AppText>
              {isAuthenticated && unreadCount > 0 ? (
                <View style={styles.unreadPill}>
                  <AppText style={styles.unreadPillText}>
                    {unreadCount} mới
                  </AppText>
                </View>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="close" size={18} color={stitchTokens.deepCocoa} />
            </Pressable>
          </View>

          {/* Filter & Mark-all Strip */}
          {isAuthenticated && displayItems.length > 0 ? (
            <View style={styles.toolbarRow}>
              <View style={styles.filterGroup} accessibilityRole="tablist">
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: filter === "all" }}
                  onPress={() => setFilter("all")}
                  style={[
                    styles.filterPill,
                    filter === "all" && styles.filterPillActive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.filterPillText,
                      filter === "all" && styles.filterPillTextActive,
                    ]}
                  >
                    Tất cả
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: filter === "unread" }}
                  onPress={() => setFilter("unread")}
                  style={[
                    styles.filterPill,
                    filter === "unread" && styles.filterPillActive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.filterPillText,
                      filter === "unread" && styles.filterPillTextActive,
                    ]}
                  >
                    Chưa đọc{unreadCount > 0 ? ` (${unreadCount})` : ""}
                  </AppText>
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đánh dấu tất cả đã đọc"
                onPress={handleMarkAllRead}
                disabled={!canMarkAll}
                style={({ pressed }) => [
                  styles.markReadBtn,
                  !canMarkAll && styles.markReadBtnDisabled,
                  pressed && canMarkAll && styles.pressed,
                ]}
              >
                {markRead.isPending ? (
                  <ActivityIndicator size="small" color={stitchTokens.wine} />
                ) : (
                  <>
                    <Icon
                      name="check"
                      size={13}
                      color={
                        canMarkAll
                          ? stitchTokens.wine
                          : stitchTokens.softStone
                      }
                    />
                    <AppText
                      style={[
                        styles.markReadText,
                        !canMarkAll && styles.markReadTextDisabled,
                      ]}
                    >
                      Đọc tất cả
                    </AppText>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}

          {/* Notifications Feed */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {query.isPending && isAuthenticated ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={stitchTokens.wine} />
                <AppText style={styles.loadingText}>
                  Đang tải hộp thư thông báo…
                </AppText>
              </View>
            ) : null}

            {!isAuthenticated ? (
              <View style={styles.statePad}>
                <StatePanel
                  title="Đăng nhập để xem thông báo"
                  message="Hộp thư chỉ hiển thị thông báo dành cho tài khoản của bạn."
                />
              </View>
            ) : null}

            {isAuthenticated && query.isError ? (
              <View style={styles.statePad}>
                <StatePanel
                  title="Chưa tải được thông báo"
                  action={{
                    label: "Thử lại",
                    onPress: () => void query.refetch(),
                  }}
                />
              </View>
            ) : null}

            {markRead.isError ? (
              <View style={styles.statePad}>
                <StatePanel
                  title="Chưa đánh dấu đã đọc"
                  action={{
                    label: "Thử lại",
                    onPress: () => markRead.mutate(markRead.variables!),
                  }}
                />
              </View>
            ) : null}

            {isAuthenticated &&
            !query.isPending &&
            !query.isError &&
            visibleItems.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Icon
                    name={filter === "unread" ? "check" : "bell"}
                    size={24}
                    color={
                      filter === "unread"
                        ? stitchTokens.likeNewGreen
                        : stitchTokens.subtleGray
                    }
                  />
                </View>
                <AppText kind="bold" style={styles.emptyTitle}>
                  {filter === "unread"
                    ? "Bạn đã xem hết thông báo mới"
                    : "Hộp thư thông báo đang trống"}
                </AppText>
                <AppText style={styles.emptySubtitle}>
                  {filter === "unread"
                    ? "Mọi cập nhật đơn hàng, trao đổi và đấu giá đều đã được đọc."
                    : "Thông báo từ đơn hàng, trao đổi và phiên đấu giá sẽ xuất hiện tại đây."}
                </AppText>
              </View>
            ) : null}

            {visibleItems.map((item, idx) => {
              const visual = resolveNotificationVisual(
                item.targetType,
                item.kind,
                item.title,
              );
              const isLast = idx === visibleItems.length - 1;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  accessibilityHint={item.message}
                  onPress={() => handleItemPress(item)}
                  style={({ pressed }) => [
                    styles.notifRow,
                    !item.read && styles.notifRowUnread,
                    !isLast && styles.notifRowBorder,
                    pressed && styles.notifRowPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.iconBadge,
                      { backgroundColor: visual.badgeBg },
                    ]}
                  >
                    <Icon
                      name={visual.icon}
                      size={18}
                      color={visual.iconColor}
                    />
                  </View>

                  <View style={styles.itemBody}>
                    <View style={styles.itemTitleRow}>
                      <AppText
                        style={[
                          styles.itemTitle,
                          !item.read && styles.itemTitleUnread,
                        ]}
                        numberOfLines={2}
                      >
                        {item.title}
                      </AppText>
                      {!item.read ? <View style={styles.unreadDot} /> : null}
                    </View>

                    <AppText style={styles.itemMessage} numberOfLines={3}>
                      {item.message}
                    </AppText>

                    <View style={styles.itemMetaRow}>
                      <View style={styles.categoryChip}>
                        <AppText style={styles.categoryChipText}>
                          {visual.category}
                        </AppText>
                      </View>
                      <AppText style={styles.metaDot}>·</AppText>
                      <AppText style={styles.itemTime}>{item.time}</AppText>
                    </View>
                  </View>

                  <View style={styles.chevronWrap}>
                    <Icon
                      name="chevronRight"
                      size={15}
                      color={stitchTokens.borderWarm}
                    />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
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
    backgroundColor: stitchTokens.whiteSurface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "84%",
    overflow: "hidden",
  },
  handleRow: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: stitchTokens.borderWarm,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: stitchTokens.darkWood,
    letterSpacing: -0.2,
  },
  unreadPill: {
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  unreadPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.white,
    fontVariant: ["tabular-nums"],
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardBorder,
    gap: 8,
  },
  filterGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  filterPillActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.deepCocoa,
  },
  filterPillTextActive: {
    color: stitchTokens.white,
    fontWeight: "700",
  },
  markReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  markReadBtnDisabled: {
    opacity: 0.55,
  },
  markReadText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  markReadTextDisabled: {
    color: stitchTokens.softStone,
  },
  listContent: {
    paddingBottom: 16,
  },
  statePad: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 28,
  },
  loadingText: {
    fontSize: 13,
    color: stitchTokens.subtleGray,
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: stitchTokens.whiteSurface,
  },
  notifRowUnread: {
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  notifRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardBorder,
  },
  notifRowPressed: {
    backgroundColor: stitchTokens.parchment,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "600",
    color: stitchTokens.deepCocoa,
    lineHeight: 19,
  },
  itemTitleUnread: {
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: stitchTokens.wine,
    flexShrink: 0,
  },
  itemMessage: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
    lineHeight: 18,
  },
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  categoryChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  categoryChipText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
  },
  metaDot: {
    fontSize: 11,
    color: stitchTokens.softStone,
  },
  itemTime: {
    fontSize: 11.5,
    color: stitchTokens.softStone,
    fontVariant: ["tabular-nums"],
  },
  chevronWrap: {
    paddingTop: 10,
    flexShrink: 0,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 44,
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    color: stitchTokens.darkWood,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: stitchTokens.subtleGray,
    textAlign: "center",
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.78,
  },
});
