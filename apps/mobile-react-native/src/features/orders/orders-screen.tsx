import React, { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTransactionLive } from "../../core/hooks/use-transaction-live";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Button,
  Icon,
  Notice,
  StatePanel,
  WineHeader,
  colorRoles,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  ORDER_STATE_CONFIG,
  ordersPageSchema,
  type OrderListItem,
} from "./contracts";
import { PublicPhoto } from "../shelf/public-photo";
import { publicListing } from "../shelf/contracts";

type TabKey =
  | "all"
  | "awaiting_payment"
  | "processing"
  | "completed"
  | "cancelled";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "awaiting_payment", label: "Chờ thanh toán" },
  { key: "processing", label: "Đang xử lý" },
  { key: "completed", label: "Hoàn tất" },
  { key: "cancelled", label: "Đã hủy" },
];

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  } catch {
    return isoString;
  }
}

function OrderBookCover({
  listingId,
  title,
}: {
  listingId?: string;
  title?: string;
}) {
  const { client } = useSession();
  const listingQuery = useQuery({
    queryKey: ["public-listing", listingId],
    queryFn: () =>
      client.publicRequest(
        `/listings/${listingId}?bundleSupport=whole-v1`,
        publicListing,
      ),
    enabled: !!listingId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const photo = listingQuery.data?.photos?.[0];
  const revisionId = listingQuery.data?.revisionId;

  if (listingId && photo && revisionId) {
    return (
      <View style={styles.bookCoverBox}>
        <PublicPhoto
          listingId={listingId}
          revisionId={revisionId}
          mediaId={photo.id}
          label={title || "Ảnh bìa"}
          active
          compact
        />
      </View>
    );
  }

  return (
    <View style={styles.bookIconBox}>
      <Icon name="book" size={20} color={stitchTokens.wine} />
    </View>
  );
}

export function OrdersScreen() {
  const { client, state } = useSession();
  const foreground = useForeground();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const ownerId = state.status === "authenticated" ? state.user.id : null;

  const ordersQuery = useInfiniteQuery({
    queryKey: ["my-orders", ownerId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      client.request(
        `/me/orders?limit=20${pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""}`,
        ordersPageSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: foreground && state.status === "authenticated",
    staleTime: 5_000,
    refetchInterval: foreground ? 8_000 : false,
  });
  useTransactionLive("inbox", ownerId ?? "", foreground, () => { void ordersQuery.refetch(); });

  const allOrders = useMemo(
    () => ordersQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [ordersQuery.data?.pages],
  );

  const awaitingCount = useMemo(
    () =>
      allOrders.filter(
        (o) => o.state === "AwaitingPayment" && o.role === "Buyer",
      ).length,
    [allOrders],
  );

  const filteredOrders = useMemo(() => {
    switch (activeTab) {
      case "awaiting_payment":
        return allOrders.filter((o) => o.state === "AwaitingPayment");
      case "processing":
        return allOrders.filter((o) =>
          [
            "PendingSellerConfirmation",
            "Preparing",
            "InTransit",
            "Inspection",
            "ResolutionPending",
            "SettlementPending",
          ].includes(o.state),
        );
      case "completed":
        return allOrders.filter((o) => o.state === "Completed");
      case "cancelled":
        return allOrders.filter((o) =>
          ["Cancelled", "PaymentExpired"].includes(o.state),
        );
      case "all":
      default:
        return allOrders;
    }
  }, [allOrders, activeTab]);

  function renderStatusBadge(orderState: string) {
    const config = ORDER_STATE_CONFIG[orderState] ?? {
      label: orderState,
      tone: "neutral",
    };

    let bg: string = stitchTokens.canvasMuted;
    let textColor: string = colors.muted;

    if (config.tone === "warning") {
      bg = stitchTokens.amberBg;
      textColor = stitchTokens.orangeDeep;
    } else if (config.tone === "success") {
      bg = stitchTokens.likeNewGreenBg;
      textColor = stitchTokens.likeNewGreen;
    } else if (config.tone === "info") {
      bg = stitchTokens.terracottaSoft;
      textColor = stitchTokens.wineDark;
    } else if (config.tone === "danger") {
      bg = stitchTokens.flashRedBg;
      textColor = stitchTokens.flashRed;
    }

    return (
      <View style={[styles.statusBadge, { backgroundColor: bg }]}>
        <AppText
          numberOfLines={1}
          style={[styles.statusBadgeText, { color: textColor }]}
        >
          {config.label}
        </AppText>
      </View>
    );
  }

  function renderOrderItem(item: OrderListItem) {
    const isAwaiting =
      item.state === "AwaitingPayment" && item.role === "Buyer";

    return (
      <Pressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={`Mở chi tiết đơn ${item.title || item.id.slice(0, 8)}`}
        onPress={() =>
          router.push({ pathname: "/orders", params: { orderId: item.id } })
        }
        style={({ pressed }) => [
          styles.orderCard,
          isAwaiting && styles.orderCardAttention,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.cardMainRow}>
          <OrderBookCover listingId={item.listingId} title={item.title} />

          <View style={styles.bookInfo}>
            <View style={styles.metaTopRow}>
              <View style={styles.orderCodeRow}>
                <Icon name="bag" size={13} color={stitchTokens.wine} />
                <AppText style={styles.orderCodeText}>
                  {item.role === "Buyer" ? "Mua" : "Bán"} · #
                  {item.id.slice(0, 8).toUpperCase()}
                </AppText>
              </View>
              <AppText style={styles.orderDate}>
                {formatDate(item.createdAt)}
              </AppText>
            </View>

            <AppText numberOfLines={2} style={styles.bookTitle}>
              {item.title || "Ấn bản sách"}
            </AppText>

            {isAwaiting && (
              <View style={styles.awaitingNotice}>
                <Icon name="clock" size={13} color={stitchTokens.orangeDeep} />
                <AppText style={styles.awaitingNoticeText}>
                  Mở đơn để kiểm tra hạn thanh toán và hoàn tất.
                </AppText>
              </View>
            )}
          </View>
        </View>

        <View style={styles.cardFooter}>
          {renderStatusBadge(item.state)}

          <View style={styles.footerActions}>
            {item.state === "Completed" && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xem hoặc viết đánh giá"
                onPress={() =>
                  router.push({
                    pathname: "/reviews",
                    params: { type: "DirectOrder", id: item.id },
                  })
                }
                style={({ pressed }) => [
                  styles.inlineActionBtn,
                  pressed && styles.pressed,
                ]}
              >
                <AppText style={styles.inlineActionText}>Đánh giá</AppText>
              </Pressable>
            )}
            <View style={styles.openCueRow}>
              <AppText
                style={[
                  styles.openCueText,
                  isAwaiting && styles.openCueTextUrgent,
                ]}
              >
                {isAwaiting ? "Thanh toán" : "Chi tiết"}
              </AppText>
              <Icon
                name="chevronRight"
                size={15}
                color={isAwaiting ? stitchTokens.wine : colors.muted}
              />
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.screenRoot}>
      <WineHeader
        title="Đơn hàng của tôi"
        subtitle={
          awaitingCount > 0
            ? `${awaitingCount} đơn chờ bạn thanh toán`
            : "Đơn mua và bán trực tiếp"
        }
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/account")
        }
        rightIcon="gavel"
        rightLabel="Mở đấu giá của tôi"
        onRightPress={() => router.push("/my-auctions")}
      />

      {/* Scrollable Filter Tabs */}
      <View style={styles.tabsOuter}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const showBadge =
              tab.key === "awaiting_payment" && awaitingCount > 0;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveTab(tab.key)}
                style={({ pressed }) => [
                  styles.tabItem,
                  isActive && styles.tabItemActive,
                  pressed && styles.pressed,
                ]}
              >
                <AppText
                  style={[styles.tabText, isActive && styles.tabTextActive]}
                >
                  {tab.label}
                </AppText>
                {showBadge && (
                  <View
                    style={[
                      styles.tabBadge,
                      isActive && styles.tabBadgeActive,
                    ]}
                  >
                    <AppText
                      style={[
                        styles.tabBadgeText,
                        isActive && styles.tabBadgeTextActive,
                      ]}
                    >
                      {awaitingCount}
                    </AppText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={ordersQuery.isRefetching}
            onRefresh={() => void ordersQuery.refetch()}
            tintColor={stitchTokens.wineDark}
          />
        }
      >
        <View style={styles.helperStrip}>
          <AppText style={styles.helperText}>
            Đơn mua/bán trực tiếp. Sách thắng đấu giá được theo dõi ở mục Đấu
            giá của tôi.
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cách mua sách"
            onPress={() =>
              router.push({ pathname: "/guide", params: { task: "buy" } })
            }
            style={({ pressed }) => [
              styles.guideLink,
              pressed && styles.pressed,
            ]}
          >
            <AppText style={styles.guideLinkText}>Hướng dẫn</AppText>
            <Icon name="chevronRight" size={14} color={stitchTokens.wine} />
          </Pressable>
        </View>

        {ordersQuery.isPending ? (
          <View style={styles.centerWrap}>
            <StatePanel wine loading title="Đang tải danh sách đơn hàng…" />
          </View>
        ) : ordersQuery.error && allOrders.length === 0 ? (
          <StatePanel
            wine
            title="Chưa tải được đơn hàng"
            message="Chưa thể kết luận bạn không có đơn. Kiểm tra kết nối rồi thử lại."
            action={{
              label: "Thử lại",
              onPress: () => void ordersQuery.refetch(),
            }}
          />
        ) : filteredOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Icon name="bag" size={26} color={stitchTokens.wine} />
            </View>
            <AppText style={styles.emptyTitle}>
              {ordersQuery.hasNextPage
                ? "Chưa thấy đơn trong phần đã tải"
                : "Chưa có đơn hàng trong nhóm này"}
            </AppText>
            <AppText style={styles.emptySub}>
              {activeTab === "awaiting_payment" || activeTab === "processing"
                ? "Bộ lọc áp dụng trên các đơn đã tải. Tải tiếp nếu còn trang để xem đầy đủ."
                : "Chọn nhóm khác hoặc mở kệ sách để tìm cuốn phù hợp."}
            </AppText>
          </View>
        ) : (
          filteredOrders.map((order) => renderOrderItem(order))
        )}

        {ordersQuery.error && allOrders.length > 0 && (
          <Notice tone="error">
            Chưa cập nhật được danh sách. Các đơn đang hiển thị thuộc lần tải
            trước.
          </Notice>
        )}

        {ordersQuery.hasNextPage && (
          <Button
            wine
            secondary
            busy={ordersQuery.isFetching}
            title={
              ordersQuery.isFetchNextPageError
                ? "Thử tải tiếp đơn"
                : "Tải thêm đơn"
            }
            onPress={() => void ordersQuery.fetchNextPage()}
          />
        )}

        {allOrders.length > 0 && (
          <AppText style={styles.loadedHint}>
            Đã tải {allOrders.length} đơn. Số chờ trả và bộ lọc chỉ tính phần đã
            tải.
          </AppText>
        )}
      </ScrollView>

      <View
        style={[
          styles.footerContainer,
          { paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        <MemberNavigation current="/account" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  tabsOuter: {
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  tabsContainer: {
    paddingHorizontal: space.lg,
    gap: 8,
    alignItems: "center",
  },
  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 38,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 6,
  },
  tabItemActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  tabText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  tabTextActive: {
    color: stitchTokens.white,
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: stitchTokens.orangeDeep,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabBadgeActive: {
    backgroundColor: stitchTokens.whiteAlpha20,
  },
  tabBadgeText: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "700",
    color: stitchTokens.white,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  tabBadgeTextActive: {
    color: stitchTokens.gold,
  },
  listContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: 12,
    flexGrow: 1,
  },
  helperStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  helperText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  guideLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  guideLinkText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  orderCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 14,
    gap: 12,
  },
  orderCardAttention: {
    backgroundColor: stitchTokens.warmIvory,
    borderColor: stitchTokens.peachBorder,
  },
  cardMainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  bookCoverBox: {
    width: 56,
    height: 84,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
  },
  bookIconBox: {
    width: 56,
    height: 84,
    borderRadius: 8,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
  },
  bookInfo: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  metaTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  orderCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  orderCodeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  orderDate: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    includeFontPadding: false,
  },
  bookTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    color: colors.ink,
    includeFontPadding: false,
  },
  awaitingNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  awaitingNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: stitchTokens.orangeDeep,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.warmBorder,
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    flexShrink: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    includeFontPadding: false,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  inlineActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.roseParchment,
  },
  inlineActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  openCueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  openCueText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: colors.muted,
    includeFontPadding: false,
  },
  openCueTextUrgent: {
    color: stitchTokens.wine,
  },
  centerWrap: {
    paddingVertical: space.section,
  },
  emptyCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    gap: 8,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: stitchTokens.roseParchment,
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
  emptySub: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    textAlign: "center",
  },
  loadedHint: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
  },
  footerContainer: {
    backgroundColor: colorRoles.navigationBackground,
    paddingTop: space.xs,
    paddingHorizontal: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
  pressed: {
    opacity: 0.8,
  },
});
