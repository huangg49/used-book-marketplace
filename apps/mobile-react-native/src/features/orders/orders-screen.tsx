import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { router } from "expo-router";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Button,
  Icon,
  Notice,
  Screen,
  StatePanel,
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
  "all" | "awaiting_payment" | "processing" | "completed" | "cancelled";

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
      client.publicRequest(`/listings/${listingId}`, publicListing),
    enabled: !!listingId,
    staleTime: 5 * 60 * 1000,
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
          active={true}
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
  });

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

    let bg: string = stitchTokens.parchment;
    let textColor: string = stitchTokens.subtleGray;
    let borderColor: string = stitchTokens.cardBorder;

    if (config.tone === "warning") {
      bg = stitchTokens.amberBg;
      textColor = stitchTokens.orangeDeep;
      borderColor = stitchTokens.amberBorder;
    } else if (config.tone === "success") {
      bg = stitchTokens.mintGreen;
      textColor = stitchTokens.leafGreen;
      borderColor = stitchTokens.leafGreen;
    } else if (config.tone === "info") {
      bg = stitchTokens.terracottaSoft;
      textColor = stitchTokens.brickRed;
      borderColor = stitchTokens.peachBorder;
    } else if (config.tone === "danger") {
      bg = stitchTokens.flashRedBg;
      textColor = stitchTokens.flashRed;
      borderColor = stitchTokens.flashRed;
    }

    return (
      <View style={[styles.statusBadge, { backgroundColor: bg, borderColor }]}>
        <AppText
          kind="small"
          style={[styles.statusBadgeText, { color: textColor }]}
        >
          {config.label}
        </AppText>
      </View>
    );
  }

  function renderOrderItem({ item }: { item: OrderListItem }) {
    const isAwaiting =
      item.state === "AwaitingPayment" && item.role === "Buyer";

    return (
      <View style={styles.orderCard}>
        {/* Card Header: Order code, role, status */}
        <View style={styles.cardHeader}>
          <View style={styles.orderCodeRow}>
            <Icon name="tag" size={14} color={stitchTokens.wine} />
            <AppText kind="bold" style={styles.orderCodeText}>
              #{item.id.slice(0, 8).toUpperCase()}
            </AppText>
            <View style={styles.roleTag}>
              <AppText kind="small" style={styles.roleText}>
                {item.role === "Buyer" ? "Mua" : "Bán"}
              </AppText>
            </View>
          </View>
          {renderStatusBadge(item.state)}
        </View>

        {/* Card Body: Book title & date */}
        <View style={styles.cardBody}>
          <OrderBookCover listingId={item.listingId} title={item.title} />
          <View style={styles.bookInfo}>
            <AppText kind="bold" numberOfLines={2} style={styles.bookTitle}>
              {item.title || "Ấn bản sách"}
            </AppText>
            <AppText kind="small" style={styles.orderDate}>
              Ngày đặt: {formatDate(item.createdAt)}
            </AppText>
          </View>
        </View>

        {/* Notice for AwaitingPayment */}
        {isAwaiting && (
          <View style={styles.awaitingNotice}>
            <Icon name="clock" size={14} color={stitchTokens.orangeDeep} />
            <AppText kind="small" style={styles.awaitingNoticeText}>
              Hạn thanh toán nằm trong chi tiết đơn. Mở đơn để kiểm tra quyền và
              thời gian còn lại.
            </AppText>
          </View>
        )}

        {/* Card Actions */}
        <View style={styles.cardActions}>
          <Button
            wine
            secondary
            title={
              isAwaiting ? "Xem để thanh toán hoặc hủy" : "Mở chi tiết đơn"
            }
            onPress={() =>
              router.push({ pathname: "/orders", params: { orderId: item.id } })
            }
          />
          {item.state === "Completed" ? (
            <Button
              wine
              secondary
              title="Xem hoặc viết đánh giá"
              onPress={() =>
                router.push({
                  pathname: "/reviews",
                  params: { type: "DirectOrder", id: item.id },
                })
              }
            />
          ) : null}
          {item.listingId && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xem chi tiết sách trên kệ"
              style={({ pressed }) => [
                styles.actionSecondaryBtn,
                pressed && styles.pressed,
              ]}
              onPress={() => {
                router.push({
                  pathname: "/book",
                  params: { id: item.listingId! },
                });
              }}
            >
              <AppText kind="small" style={styles.actionSecondaryText}>
                Xem sách
              </AppText>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <Screen
      appearance="browse"
      header={
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/account");
            }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={20} color={stitchTokens.wineDark} />
            <AppText style={styles.backLabel}>Quay lại</AppText>
          </Pressable>

          <AppText style={styles.headerTitle}>Đơn hàng của tôi</AppText>

          <View style={styles.headerRight}>
            {awaitingCount > 0 ? (
              <View style={styles.headerBadge}>
                <AppText style={styles.headerBadgeText}>
                  {awaitingCount} chờ trả
                </AppText>
              </View>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>
        </View>
      }
      footer={<MemberNavigation current="/account" />}
      footerAppearance="navigation"
    >
      <View style={styles.container}>
        <View style={{ padding: space.md, gap: space.sm }}>
          <AppText kind="small">
            Đây là đơn mua/bán trực tiếp. Sách thắng đấu giá được theo dõi
            riêng.
          </AppText>
          <Button
            wine
            secondary
            title="Mở đấu giá của tôi"
            onPress={() => router.push("/my-auctions")}
          />
          <Button
            wine
            secondary
            title="Cách mua sách"
            onPress={() =>
              router.push({ pathname: "/guide", params: { task: "buy" } })
            }
          />
        </View>
        {/* Filter Tabs */}
        <View style={styles.tabsWrapper}>
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
                  onPress={() => setActiveTab(tab.key)}
                  style={[styles.tabItem, isActive && styles.tabItemActive]}
                >
                  <AppText
                    kind="bold"
                    style={[styles.tabText, isActive && styles.tabTextActive]}
                  >
                    {tab.label}
                  </AppText>
                  {showBadge && (
                    <View style={styles.tabBadge}>
                      <AppText kind="small" style={styles.tabBadgeText}>
                        {awaitingCount}
                      </AppText>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Orders List */}
        {ordersQuery.isPending ? (
          <View
            style={{ flex: 1, justifyContent: "center", paddingVertical: 60 }}
          >
            <StatePanel loading title="Đang tải danh sách đơn hàng…" />
          </View>
        ) : ordersQuery.error && allOrders.length === 0 ? (
          <StatePanel
            title="Chưa tải được đơn hàng"
            message="Chưa thể kết luận bạn không có đơn. Kiểm tra kết nối rồi thử lại."
            action={{
              label: "Thử lại",
              onPress: () => void ordersQuery.refetch(),
            }}
          />
        ) : filteredOrders.length === 0 ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              paddingHorizontal: space.lg,
              paddingVertical: 60,
            }}
          >
            <StatePanel
              title={
                ordersQuery.hasNextPage
                  ? "Chưa thấy đơn trong phần đã tải"
                  : "Chưa có đơn hàng trong nhóm này"
              }
              message={
                activeTab === "awaiting_payment"
                  ? "Bộ lọc áp dụng trên các đơn đã tải. Tải tiếp nếu còn trang để xem đầy đủ."
                  : activeTab === "processing"
                    ? "Bộ lọc áp dụng trên các đơn đã tải. Tải tiếp nếu còn trang để xem đầy đủ."
                    : "Chọn nhóm khác hoặc tải tiếp những đơn còn lại."
              }
            />
          </View>
        ) : (
          <View style={styles.listContent}>
            {filteredOrders.map((order) => (
              <React.Fragment key={order.id}>
                {renderOrderItem({ item: order })}
              </React.Fragment>
            ))}
          </View>
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
          <AppText kind="small">
            Đã tải {allOrders.length} đơn. Số chờ trả và bộ lọc chỉ tính phần đã
            tải.
          </AppText>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: stitchTokens.parchment,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    backgroundColor: stitchTokens.parchment,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  backLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  headerRight: {
    minWidth: 40,
    alignItems: "flex-end",
  },
  headerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1,
    borderColor: stitchTokens.amberBorder,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.orangeDeep,
  },
  tabsWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  tabsContainer: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    gap: space.xs,
  },
  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 4,
  },
  tabItemActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  tabText: {
    fontSize: 12,
    color: stitchTokens.wineMid,
  },
  tabTextActive: {
    color: stitchTokens.white,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: stitchTokens.orangeDeep,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  listContent: {
    padding: space.md,
    gap: space.sm,
    paddingBottom: space.section,
  },
  orderCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: space.sm,
    gap: space.xs,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardBorder,
  },
  orderCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderCodeText: {
    fontSize: 13,
    color: stitchTokens.wineDark,
  },
  roleTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: stitchTokens.roseWarmTag,
  },
  roleText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineMid,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 4,
  },
  bookCoverBox: {
    width: 42,
    height: 54,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  bookIconBox: {
    width: 42,
    height: 54,
    borderRadius: 6,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  bookInfo: {
    flex: 1,
    gap: 2,
  },
  bookTitle: {
    fontSize: 14,
    color: stitchTokens.wineDark,
  },
  orderDate: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
  },
  awaitingNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: stitchTokens.amberBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: stitchTokens.amberBorder,
  },
  awaitingNoticeText: {
    fontSize: 11,
    color: stitchTokens.orangeDeep,
    flex: 1,
  },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space.xs,
    paddingTop: 4,
  },
  actionSecondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  actionSecondaryText: {
    fontSize: 12,
    color: stitchTokens.wineDark,
    fontWeight: "600",
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  cancelBtnText: {
    fontSize: 12,
    color: stitchTokens.crimson,
    fontWeight: "600",
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: stitchTokens.wineDark,
  },
  payBtnText: {
    fontSize: 12,
    color: stitchTokens.white,
  },
  pressed: {
    opacity: 0.8,
  },
});
