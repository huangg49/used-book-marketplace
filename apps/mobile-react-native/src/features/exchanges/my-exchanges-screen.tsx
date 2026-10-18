import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  AppText,
  Button,
  Icon,
  Notice,
  Screen,
  StatePanel,
  presentError,
  space,
  stitchTokens,
} from "../../core/ui";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  exchangePageSchema,
  mapExchangeStatusInfo,
  type Exchange,
} from "./contracts";
import { formatVnd } from "../../core/ui/format";

export function MyExchangesScreen() {
  const { client, state } = useSession();
  const foreground = useForeground();
  const currentUserId = state.status === "authenticated" ? state.user.id : null;

  const [activeTab, setActiveTab] = useState<"all" | "pending" | "active" | "completed">("all");

  const exchangesQuery = useQuery({
    queryKey: ["my-exchanges", currentUserId],
    queryFn: () => client.request("/exchanges", exchangePageSchema),
    enabled: state.status === "authenticated" && foreground,
    refetchInterval: 6000,
  });

  if (state.status !== "authenticated") {
    return (
      <Screen appearance="browse">
        <StatePanel
          title="Yêu cầu đăng nhập"
          message="Vui lòng đăng nhập để xem các giao dịch trao đổi sách của bạn."
          action={{
            label: "Đăng nhập",
            onPress: () => router.push("/account"),
          }}
        />
      </Screen>
    );
  }

  const items = exchangesQuery.data?.items ?? [];

  const filteredItems = items.filter((item) => {
    if (activeTab === "pending") return item.status === "Proposed";
    if (activeTab === "active")
      return ["AcceptedAwaitingFunding", "Preparing", "InTransit", "Delivered"].includes(
        item.status,
      );
    if (activeTab === "completed")
      return ["Completed", "Cancelled"].includes(item.status);
    return true;
  });

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
            <AppText style={styles.backLabel}>Tài khoản</AppText>
          </Pressable>

          <AppText style={styles.headerTitle}>Trao đổi sách của tôi</AppText>

          <View style={{ width: 40 }} />
        </View>
      }
    >
      <View style={styles.container}>
        {/* Filter Tabs */}
        <View style={styles.tabsRow}>
          {[
            { id: "all", label: "Tất cả" },
            { id: "pending", label: "Chờ phản hồi" },
            { id: "active", label: "Đang giao dịch" },
            { id: "completed", label: "Lịch sử" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id as any)}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
              >
                <AppText
                  style={[
                    styles.tabItemText,
                    isActive && styles.tabItemTextActive,
                  ]}
                >
                  {tab.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {exchangesQuery.isPending && (
          <StatePanel loading title="Đang tải danh sách trao đổi…" />
        )}

        {exchangesQuery.error && (
          <View style={{ padding: space.md }}>
            <Notice tone="error">
              {presentError(exchangesQuery.error).message}
            </Notice>
            <Button
              title="Thử lại"
              secondary
              onPress={() => void exchangesQuery.refetch()}
            />
          </View>
        )}

        {!exchangesQuery.isPending && filteredItems.length === 0 && (
          <View style={styles.emptyContainer}>
            <Icon name="swap" size={36} color={stitchTokens.roseBrown} />
            <AppText style={styles.emptyTitle}>Chưa có giao dịch trao đổi nào</AppText>
            <AppText style={styles.emptySubtitle}>
              Khi bạn gửi hoặc nhận đề nghị trao đổi sách từ người khác, các giao dịch sẽ hiển thị tại đây.
            </AppText>
            <Button
              title="Khám phá sách trên kệ"
              wine
              onPress={() => router.replace("/")}
            />
          </View>
        )}

        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: Exchange }) => {
            const isInitiator = item.initiatorId === currentUserId;
            const statusInfo = mapExchangeStatusInfo(item.status, isInitiator);

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mở đơn trao đổi #${item.id.slice(0, 8)}`}
                onPress={() =>
                  router.push({
                    pathname: "/exchange",
                    params: { id: item.id },
                  })
                }
                style={({ pressed }) => [
                  styles.exchangeCard,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.codeRow}>
                    <Icon name="swap" size={15} color={stitchTokens.wineDark} />
                    <AppText style={styles.cardCode}>
                      #{item.id.slice(0, 8).toUpperCase()}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: statusInfo.badgeBg },
                    ]}
                  >
                    <AppText
                      style={[
                        styles.statusPillText,
                        { color: statusInfo.badgeColor },
                      ]}
                    >
                      {statusInfo.label}
                    </AppText>
                  </View>
                </View>

                <View style={styles.cardMiddle}>
                  <AppText style={styles.cardRole}>
                    {isInitiator ? "Bạn gửi đề nghị trao đổi" : "Đối tác đề nghị trao đổi với bạn"}
                  </AppText>
                  <AppText style={styles.cardDiff}>
                    {item.diffAmount > 0
                      ? item.diffPayerId === currentUserId
                        ? `Bù thêm: ${formatVnd(item.diffAmount)}`
                        : `Nhận bù: ${formatVnd(item.diffAmount)}`
                      : "Trao đổi ngang giá"}
                  </AppText>
                </View>

                <View style={styles.cardBottom}>
                  <AppText style={styles.cardDate}>
                    Ngày tạo: {new Date(item.createdAt).toLocaleDateString("vi-VN")}
                  </AppText>
                  <View style={styles.openDetailsLink}>
                    <AppText style={styles.openDetailsText}>Xem chi tiết</AppText>
                    <Icon name="arrow" size={12} color={stitchTokens.wineDark} />
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 54,
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.roseWarmBlur,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardBorder,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  backLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  container: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: space.lg,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: stitchTokens.whiteSurface,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardBorder,
  },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: stitchTokens.parchment,
  },
  tabItemActive: {
    backgroundColor: stitchTokens.wineDark,
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.darkWood,
  },
  tabItemTextActive: {
    color: stitchTokens.white,
  },
  listContent: {
    padding: space.lg,
    gap: space.md,
  },
  exchangeCard: {
    padding: space.md,
    borderRadius: 16,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachMuted,
    gap: 10,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  cardCode: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  cardMiddle: {
    gap: 2,
    paddingVertical: 4,
  },
  cardRole: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.darkWood,
  },
  cardDiff: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
  },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.peachBorderAlpha40,
  },
  cardDate: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
  },
  openDetailsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  openDetailsText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: 10,
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  emptySubtitle: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 6,
  },
  pressed: {
    opacity: 0.7,
  },
});
