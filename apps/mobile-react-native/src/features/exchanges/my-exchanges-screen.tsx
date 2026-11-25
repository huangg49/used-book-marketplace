import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTransactionLive } from "../../core/hooks/use-transaction-live";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AppText,
  Button,
  Icon,
  Notice,
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
import { MemberNavigation } from "../navigation/member-navigation";
import { PublicPhoto } from "../shelf/public-photo";

function doesExchangeNeedMyAction(
  item: Exchange,
  currentUserId: string | null,
): boolean {
  if (!currentUserId) return false;
  const isInitiator = item.initiatorId === currentUserId;
  if (item.status === "Proposed") {
    return item.lastProposedById
      ? item.lastProposedById !== currentUserId
      : !isInitiator;
  }
  if (item.status === "AcceptedAwaitingFunding") {
    return isInitiator ? !item.initiatorFundedAt : !item.recipientFundedAt;
  }
  if (item.status === "Preparing" || item.status === "InTransit") {
    const shipped = isInitiator
      ? Boolean(item.initiatorShippedAt || item.initiatorShipment)
      : Boolean(item.recipientShippedAt || item.recipientShipment);
    const partnerShipped = isInitiator
      ? Boolean(item.recipientShippedAt)
      : Boolean(item.initiatorShippedAt);
    const received = isInitiator
      ? Boolean(item.initiatorReceivedAt)
      : Boolean(item.recipientReceivedAt);
    return !shipped || (partnerShipped && !received);
  }
  if (item.status === "Delivered") {
    return isInitiator ? !item.initiatorCompletedAt : !item.recipientCompletedAt;
  }
  return false;
}

export function MyExchangesScreen() {
  const { client, state } = useSession();
  const foreground = useForeground();
  const insets = useSafeAreaInsets();
  const currentUserId = state.status === "authenticated" ? state.user.id : null;

  const [activeTab, setActiveTab] = useState<
    "all" | "pending" | "active" | "completed"
  >("all");

  const queryClient = useQueryClient();
  // Exchange commits wake the member inbox; the list polls only as a backstop.
  const live = useTransactionLive("inbox", currentUserId ?? "", foreground, () => {
    void queryClient.invalidateQueries({ queryKey: ["my-exchanges", currentUserId] });
  });
  const exchangesQuery = useQuery({
    queryKey: ["my-exchanges", currentUserId],
    queryFn: () => client.request("/exchanges", exchangePageSchema),
    enabled: state.status === "authenticated" && foreground,
    refetchInterval: !foreground ? false : live ? 30_000 : 6_000,
  });

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/account");
  };

  if (state.status !== "authenticated") {
    return (
      <View style={styles.screenRoot}>
        <StatusBar barStyle="light-content" />
        <View
          style={[
            styles.wineHeader,
            { paddingTop: Math.max(insets.top, 10) + 6 },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            hitSlop={8}
            onPress={handleBack}
            style={({ pressed }) => [
              styles.headerCircleBtn,
              pressed && styles.pressed,
            ]}
          >
            <Icon name="back" size={19} color={stitchTokens.white} />
          </Pressable>
          <AppText style={styles.headerTitle}>Trao đổi của tôi</AppText>
          <View style={styles.headerSpacer} />
        </View>

        <View style={{ flex: 1, justifyContent: "center", padding: space.lg }}>
          <StatePanel
            title="Yêu cầu đăng nhập"
            message="Vui lòng đăng nhập để xem các giao dịch trao đổi sách của bạn."
            action={{
              label: "Đăng nhập",
              onPress: () => router.push("/account"),
            }}
          />
        </View>
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

  const items = exchangesQuery.data?.items ?? [];

  const counts = {
    all: items.length,
    pending: items.filter((i) => i.status === "Proposed").length,
    active: items.filter((i) =>
      [
        "AcceptedAwaitingFunding",
        "Preparing",
        "InTransit",
        "Delivered",
        "ResolutionPending",
      ].includes(i.status),
    ).length,
    completed: items.filter((i) =>
      ["Completed", "Cancelled"].includes(i.status),
    ).length,
  };

  const filteredItems = items.filter((item) => {
    if (activeTab === "pending") return item.status === "Proposed";
    if (activeTab === "active")
      return [
        "AcceptedAwaitingFunding",
        "Preparing",
        "InTransit",
        "Delivered",
        "ResolutionPending",
      ].includes(item.status);
    if (activeTab === "completed")
      return ["Completed", "Cancelled"].includes(item.status);
    return true;
  });

  const tabs: readonly {
    id: "all" | "pending" | "active" | "completed";
    label: string;
    count: number;
  }[] = [
    { id: "all", label: "Tất cả", count: counts.all },
    { id: "pending", label: "Chờ phản hồi", count: counts.pending },
    { id: "active", label: "Đang diễn ra", count: counts.active },
    { id: "completed", label: "Lịch sử", count: counts.completed },
  ];

  return (
    <View style={styles.screenRoot}>
      <StatusBar barStyle="light-content" />

      {/* Unified Deep-Wine Curved App Header */}
      <View
        style={[
          styles.wineHeader,
          { paddingTop: Math.max(insets.top, 10) + 6 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          hitSlop={8}
          onPress={handleBack}
          style={({ pressed }) => [
            styles.headerCircleBtn,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="back" size={19} color={stitchTokens.white} />
        </Pressable>

        <View style={styles.headerTitleCol}>
          <AppText style={styles.headerTitle}>Trao đổi của tôi</AppText>
          <AppText style={styles.headerSubtitle}>
            {counts.active + counts.pending > 0
              ? `${counts.active + counts.pending} phiếu đang hoạt động`
              : "Quản lý phiếu đổi sách hai chiều"}
          </AppText>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hộp thư nhắn tin"
          hitSlop={8}
          onPress={() => router.push("/chat-inbox")}
          style={({ pressed }) => [
            styles.headerCircleBtn,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="message" size={18} color={stitchTokens.gold} />
        </Pressable>
      </View>

      <View style={styles.container}>
        {/* Horizontal Pill Filter Chips with Counts */}
        <View style={styles.tabsOuter}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  style={({ pressed }) => [
                    styles.tabChip,
                    isActive && styles.tabChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText
                    style={[
                      styles.tabChipText,
                      isActive && styles.tabChipTextActive,
                    ]}
                  >
                    {tab.label}
                  </AppText>
                  <View
                    style={[
                      styles.tabCountBadge,
                      isActive && styles.tabCountBadgeActive,
                    ]}
                  >
                    <AppText
                      style={[
                        styles.tabCountText,
                        isActive && styles.tabCountTextActive,
                      ]}
                    >
                      {tab.count}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {exchangesQuery.isPending && (
          <View style={styles.centerWrap}>
            <StatePanel loading title="Đang tải danh sách trao đổi…" />
          </View>
        )}

        {exchangesQuery.error && (
          <View style={{ padding: space.lg, gap: 10 }}>
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
            <View style={styles.emptyIconCircle}>
              <Icon name="swap" size={28} color={stitchTokens.wine} />
            </View>
            <AppText style={styles.emptyTitle}>
              Chưa có phiếu trao đổi nào
            </AppText>
            <AppText style={styles.emptySubtitle}>
              Khi bạn gửi hoặc nhận đề nghị đổi sách từ thành viên khác, các
              phiếu sẽ hiển thị tại đây.
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
            const awaitingMyReply =
              item.status === "Proposed" &&
              (item.lastProposedById
                ? item.lastProposedById !== currentUserId
                : !isInitiator);
            const needsAction = doesExchangeNeedMyAction(item, currentUserId);
            const statusInfo = mapExchangeStatusInfo(
              item.status,
              item.status === "Proposed" ? !awaitingMyReply : isInitiator,
            );

            const myBooks = item.agreement
              ? isInitiator
                ? item.agreement.initiatorBooks
                : [item.agreement.recipientBook]
              : [];
            const partnerBooks = item.agreement
              ? isInitiator
                ? [item.agreement.recipientBook]
                : item.agreement.initiatorBooks
              : [];
            const partnerDisplay =
              partnerBooks[0]?.ownerDisplayName ||
              (isInitiator
                ? item.recipientAddress?.recipientName
                : item.initiatorAddress?.recipientName) ||
              "Đối tác";
            const giveBook = myBooks[0];
            const recvBook = partnerBooks[0];
            const giveLabel = giveBook
              ? myBooks.length > 1
                ? `${giveBook.book.title} (+${myBooks.length - 1})`
                : giveBook.book.title
              : isInitiator
                ? "Sách bạn đề xuất"
                : "Sách của bạn";
            const recvLabel = recvBook
              ? partnerBooks.length > 1
                ? `${recvBook.book.title} (+${partnerBooks.length - 1})`
                : recvBook.book.title
              : `Sách từ ${partnerDisplay}`;

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
                  needsAction && styles.exchangeCardAction,
                  pressed && styles.pressed,
                ]}
              >
                {/* Top Meta Row */}
                <View style={styles.cardTop}>
                  <View style={styles.partnerMiniRow}>
                    <View style={styles.miniAvatar}>
                      <AppText style={styles.miniAvatarText}>
                        {(partnerDisplay.trim()[0] || "Đ").toUpperCase()}
                      </AppText>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText style={styles.partnerNameText} numberOfLines={1}>
                        {partnerDisplay}
                      </AppText>
                      <AppText style={styles.cardCode}>
                        #{item.id.slice(0, 8).toUpperCase()} ·{" "}
                        {new Date(item.createdAt).toLocaleDateString("vi-VN")}
                      </AppText>
                    </View>
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
                      numberOfLines={1}
                    >
                      {statusInfo.label}
                    </AppText>
                  </View>
                </View>

                {/* Visual Book Matchup Row with Mini Covers */}
                <View style={styles.matchupRow}>
                  <View style={styles.dualCoversWrap}>
                    <View style={styles.miniCover}>
                      {giveBook?.mediaIds[0] ? (
                        <PublicPhoto
                          exchangeId={item.id}
                          listingId={giveBook.listingId}
                          revisionId={giveBook.revisionId}
                          mediaId={giveBook.mediaIds[0]}
                          label={giveLabel}
                          active
                          compact
                        />
                      ) : (
                        <View style={styles.miniCoverFallback}>
                          <Icon
                            name="book"
                            size={15}
                            color={stitchTokens.subtleGray}
                          />
                        </View>
                      )}
                    </View>
                    <View style={styles.miniSwapDot}>
                      <Icon name="swap" size={11} color={stitchTokens.wine} />
                    </View>
                    <View style={[styles.miniCover, styles.miniCoverRecv]}>
                      {recvBook?.mediaIds[0] ? (
                        <PublicPhoto
                          exchangeId={item.id}
                          listingId={recvBook.listingId}
                          revisionId={recvBook.revisionId}
                          mediaId={recvBook.mediaIds[0]}
                          label={recvLabel}
                          active
                          compact
                        />
                      ) : (
                        <View style={styles.miniCoverFallback}>
                          <Icon
                            name="book"
                            size={15}
                            color={stitchTokens.likeNewGreen}
                          />
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.matchupTextCol}>
                    <AppText style={styles.bookLine} numberOfLines={1}>
                      <AppText style={styles.bookDirTag}>Gửi: </AppText>
                      {giveLabel}
                    </AppText>
                    <AppText style={styles.bookLine} numberOfLines={1}>
                      <AppText style={styles.bookDirTagGreen}>Nhận: </AppText>
                      {recvLabel}
                    </AppText>
                    <AppText style={styles.cardDiff} numberOfLines={1}>
                      {item.diffAmount > 0
                        ? item.diffPayerId === currentUserId
                          ? `Bạn bù ${formatVnd(item.diffAmount)}`
                          : `Nhận bù ${formatVnd(item.diffAmount)}`
                        : "Trao đổi ngang giá"}
                    </AppText>
                  </View>
                </View>

                {/* Bottom Action Hint Row */}
                <View style={styles.cardBottom}>
                  {needsAction ? (
                    <View style={styles.actionNeededBadge}>
                      <View style={styles.actionPulseDot} />
                      <AppText style={styles.actionNeededText}>
                        Đến lượt bạn thao tác
                      </AppText>
                    </View>
                  ) : (
                    <AppText style={styles.cardSubHint}>
                      Nhấn để xem tiến trình
                    </AppText>
                  )}

                  <View style={styles.openDetailsLink}>
                    <AppText style={styles.openDetailsText}>Chi tiết</AppText>
                    <Icon
                      name="chevronRight"
                      size={14}
                      color={stitchTokens.wine}
                    />
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      </View>

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
  wineHeader: {
    backgroundColor: stitchTokens.wine,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  headerCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: stitchTokens.whiteAlpha15,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    width: 38,
  },
  headerTitleCol: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: stitchTokens.white,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: stitchTokens.whiteAlpha85,
    marginTop: 1,
  },
  container: {
    flex: 1,
  },
  tabsOuter: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  tabsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: stitchTokens.whiteSurface,
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  tabChipActive: {
    backgroundColor: stitchTokens.wine,
  },
  tabChipText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  tabChipTextActive: {
    color: stitchTokens.white,
  },
  tabCountBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: stitchTokens.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountBadgeActive: {
    backgroundColor: stitchTokens.goldAlpha20,
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.subtleGray,
    fontVariant: ["tabular-nums"],
  },
  tabCountTextActive: {
    color: stitchTokens.gold,
  },
  centerWrap: {
    padding: space.lg,
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  exchangeCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.wineAlpha05,
    gap: 12,
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  exchangeCardAction: {
    borderColor: stitchTokens.wineAlpha20,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  partnerMiniRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flex: 1,
    minWidth: 0,
  },
  miniAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  miniAvatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  partnerNameText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  cardCode: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    fontVariant: ["tabular-nums"],
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    maxWidth: 140,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  matchupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 11,
    borderRadius: 14,
    backgroundColor: stitchTokens.parchment,
  },
  dualCoversWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  miniCover: {
    width: 40,
    height: 54,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: stitchTokens.whiteSurface,
  },
  miniCoverRecv: {
    borderWidth: 1,
    borderColor: stitchTokens.greenBorderSoft,
  },
  miniCoverFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  miniSwapDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  matchupTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  bookLine: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  bookDirTag: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  bookDirTagGreen: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
  cardDiff: {
    fontSize: 12,
    fontWeight: "800",
    color: stitchTokens.wine,
    marginTop: 1,
    fontVariant: ["tabular-nums"],
  },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  actionNeededBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: stitchTokens.roseParchment,
  },
  actionPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.wine,
  },
  actionNeededText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  cardSubHint: {
    fontSize: 11.5,
    color: stitchTokens.subtleGray,
  },
  openDetailsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  openDetailsText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: 10,
    marginTop: 32,
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
    fontSize: 15.5,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 6,
  },
  footerContainer: {
    backgroundColor: stitchTokens.whiteSurface,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.wineAlpha05,
  },
  pressed: {
    opacity: 0.75,
  },
});
