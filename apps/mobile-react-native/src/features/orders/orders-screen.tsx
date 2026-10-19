import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  ConfirmDialog,
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
  buyNowError,
  orderReceiptSchema,
  ordersPageSchema,
  type OrderListItem,
} from "./contracts";
import { BuyNowModal } from "./buy-now-modal";
import { PublicPhoto } from "../shelf/public-photo";
import { publicListing } from "../shelf/contracts";

type TabKey = "all" | "awaiting_payment" | "processing" | "completed" | "cancelled";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "awaiting_payment", label: "Chờ thanh toán" },
  { key: "processing", label: "Đang giao" },
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
  const cache = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [selectedPayOrderId, setSelectedPayOrderId] = useState<string | null>(null);
  const [selectedPayOrderTitle, setSelectedPayOrderTitle] = useState<string>("");
  const [cancelCandidate, setCancelCandidate] = useState<OrderListItem | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const ordersQuery = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => client.request("/me/orders?limit=50", ordersPageSchema),
    enabled: foreground && state.status === "authenticated",
    staleTime: 5_000,
  });

  const allOrders = useMemo(
    () => ordersQuery.data?.items ?? [],
    [ordersQuery.data?.items],
  );

  const awaitingCount = useMemo(
    () => allOrders.filter((o) => o.state === "AwaitingPayment" && o.role === "Buyer").length,
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

  async function handleConfirmCancel() {
    if (!cancelCandidate || actionBusy) return;
    setActionBusy(true);
    setActionError("");
    try {
      await client.request(
        `/orders/${cancelCandidate.id}/cancel`,
        orderReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": Crypto.randomUUID() },
          body: JSON.stringify({
            expectedVersion: cancelCandidate.version,
          }),
        },
      );
      setCancelCandidate(null);
      void ordersQuery.refetch();
      void cache.invalidateQueries({ queryKey: ["public-listing"] });
      void cache.invalidateQueries({ queryKey: ["wallet"] });
    } catch (err) {
      setActionError(buyNowError(err));
    } finally {
      setActionBusy(false);
    }
  }

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
      <View
        style={[
          styles.statusBadge,
          { backgroundColor: bg, borderColor },
        ]}
      >
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
    const isAwaiting = item.state === "AwaitingPayment" && item.role === "Buyer";

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
            <AppText
              kind="bold"
              numberOfLines={2}
              style={styles.bookTitle}
            >
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
              Đang giữ sách 15 phút. Vui lòng thanh toán để xác nhận đơn.
            </AppText>
          </View>
        )}

        {/* Card Actions */}
        <View style={styles.cardActions}>
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

          {isAwaiting && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hủy giữ đơn hàng"
                style={({ pressed }) => [
                  styles.cancelBtn,
                  pressed && styles.pressed,
                ]}
                onPress={() => setCancelCandidate(item)}
              >
                <AppText kind="small" style={styles.cancelBtnText}>
                  Hủy đơn
                </AppText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Thanh toán ngay bằng ví"
                style={({ pressed }) => [
                  styles.payBtn,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setSelectedPayOrderId(item.id);
                  setSelectedPayOrderTitle(item.title || "Ấn bản sách");
                }}
              >
                <Icon name="wallet" size={14} color={stitchTokens.white} />
                <AppText kind="bold" style={styles.payBtnText}>
                  Thanh toán ngay
                </AppText>
              </Pressable>
            </>
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
        {/* Error Notice */}
        {actionError ? (
          <View style={{ paddingHorizontal: space.md, paddingTop: space.xs }}>
            <Notice tone="error">{actionError}</Notice>
          </View>
        ) : null}

        {/* Filter Tabs */}
        <View style={styles.tabsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContainer}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const showBadge = tab.key === "awaiting_payment" && awaitingCount > 0;
              return (
                <Pressable
                  key={tab.key}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  onPress={() => setActiveTab(tab.key)}
                  style={[
                    styles.tabItem,
                    isActive && styles.tabItemActive,
                  ]}
                >
                  <AppText
                    kind="bold"
                    style={[
                      styles.tabText,
                      isActive && styles.tabTextActive,
                    ]}
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
          <View style={{ flex: 1, justifyContent: "center", paddingVertical: 60 }}>
            <StatePanel loading title="Đang tải danh sách đơn hàng…" />
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: space.lg, paddingVertical: 60 }}>
            <StatePanel
              title="Chưa có đơn hàng nào"
              message={
                activeTab === "awaiting_payment"
                  ? "Bạn không có đơn hàng nào đang chờ thanh toán."
                  : activeTab === "processing"
                    ? "Bạn không có đơn hàng nào đang giao dịch."
                    : "Bạn chưa có đơn hàng nào trong danh mục này."
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
      </View>


      {/* Pay Order Modal */}
      {selectedPayOrderId && (
        <BuyNowModal
          visible={Boolean(selectedPayOrderId)}
          initialOrderId={selectedPayOrderId}
          initialBookTitle={selectedPayOrderTitle}
          onClose={() => {
            setSelectedPayOrderId(null);
            void ordersQuery.refetch();
          }}
          onSuccess={() => {
            setSelectedPayOrderId(null);
            void ordersQuery.refetch();
          }}
        />
      )}

      {/* Confirm Cancel Dialog */}
      <ConfirmDialog
        visible={Boolean(cancelCandidate)}
        title="Hủy đơn giữ sách?"
        message={`Bạn có chắc chắn muốn hủy đơn hàng #${cancelCandidate?.id.slice(0, 8).toUpperCase()}? Sách sẽ được mở lại công khai cho các bạn đọc khác.`}
        confirmLabel={actionBusy ? "Đang hủy…" : "Xác nhận hủy đơn"}
        onConfirm={() => void handleConfirmCancel()}
        onCancel={() => setCancelCandidate(null)}
      />
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
