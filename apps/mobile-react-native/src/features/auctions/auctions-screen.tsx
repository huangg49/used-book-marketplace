import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { useAuctionListLive } from "./use-auction-live";
import { useAuctionNow } from "./use-auction-now";
import {
  AppText,
  Button,
  Icon,
  Notice,
  Screen,
  StatePanel,
  TopNavbar,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  AUCTION_ENDING,
  AUCTION_PRICE_RANGES,
  DEFAULT_AUCTION_FILTERS,
  activeFilterCount,
  isOpen,
  matchesAuctionFilters,
  myAuctionsOptions,
  usePublicAuctions,
  useUpcomingAuctions,
  type AuctionFilters,
} from "./auctions-model";
import {
  AuctionCard,
  AuctionCategoryTabs,
  AuctionFilterModal,
  AuctionGuideModal,
  AuctionHeroCard,
  AuctionOutbidAlert,
  AuctionSearchBar,
  AuctionSortChips,
  UpcomingAuctionsShelf,
  type CategoryTabId,
} from "./components";
import { HomeNotificationsModal } from "../shelf/home-components/home-notifications-modal";
import { useNotifications } from "../notifications/notifications-model";
import { conditions as conditionLabels } from "../shelf/contracts";

export function AuctionsScreen() {
  const { client, state } = useSession();
  const foreground = useForeground();
  const isAuthenticated = state.status === "authenticated";
  const isMember = isAuthenticated && state.user.roles.includes("MEMBER");

  const notifQuery = useNotifications(client, isAuthenticated);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationCount = isAuthenticated && notifQuery.data ? notifQuery.data.unreadCount : 0;

  const listLive = useAuctionListLive(foreground);
  const result = usePublicAuctions(client, foreground, listLive);
  const allAuctions = useMemo(() => result.data?.items ?? [], [result.data]);

  const upcomingResult = useUpcomingAuctions(client, foreground);
  const upcomingAuctions = useMemo(() => upcomingResult.data?.items ?? [], [upcomingResult.data]);

  const mine = useInfiniteQuery({
    ...myAuctionsOptions(client, isMember ? state.user.id : "", "active"),
    enabled: isMember && foreground,
  });

  const now = useAuctionNow(
    result.data?.serverTime ?? upcomingResult.data?.serverTime ?? mine.data?.pages[0]?.serverTime,
    foreground,
  );

  // Unified filter & search states (single source of truth — no duplicate BuyNow flag)
  const [search, setSearch] = useState("");
  const [selectedTab, setSelectedTab] = useState<CategoryTabId>("all");
  const [selectedSort, setSelectedSort] = useState<string>("newest");
  const [filters, setFilters] = useState<AuctionFilters>(DEFAULT_AUCTION_FILTERS);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);

  const availablePoints = useMemo(
    () => [...new Set(allAuctions.map((a) => a.pointName).filter(Boolean))].sort(),
    [allAuctions],
  );

  const myItems = mine.data?.pages.flatMap((page) => page.items) ?? [];
  const outbid = myItems.filter(
    (i) => i.role === "Bidder" && !i.leading && isOpen(i.auction, now),
  );
  const attentionCount = outbid.length + myItems.filter((i) => i.needsPayment).length;

  const heroAuction = allAuctions.find((a) => isOpen(a, now));

  const displayedAuctions = useMemo(() => {
    let list = allAuctions.filter((a) =>
      matchesAuctionFilters(a, { ...filters, q: search }, now),
    );

    if (selectedTab === "ending_soon") {
      list = list.filter((a) => {
        const remaining = Date.parse(a.endAt) - now;
        return remaining > 0 && remaining < 3600000;
      });
    } else if (selectedTab === "buy_now") {
      list = list.filter((a) => a.buyNowPrice !== null);
    } else if (selectedTab === "no_bids") {
      list = list.filter((a) => a.bidderCount === 0);
    }

    const sorted = [...list];
    if (selectedSort === "newest") {
      sorted.sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
    } else if (selectedSort === "price_asc") {
      sorted.sort((a, b) => (a.currentPrice ?? a.startPrice) - (b.currentPrice ?? b.startPrice));
    } else if (selectedSort === "price_desc") {
      sorted.sort((a, b) => (b.currentPrice ?? b.startPrice) - (a.currentPrice ?? a.startPrice));
    } else if (selectedSort === "bids") {
      sorted.sort((a, b) => b.bidderCount - a.bidderCount);
    }
    return sorted;
  }, [allAuctions, search, filters, selectedTab, selectedSort, now]);

  const handleOpenAuction = (id: string) => {
    router.push({ pathname: "/auction", params: { id } });
  };

  const openQuickBid = (id: string) => {
    router.push({ pathname: "/auction", params: { id, bid: "1" } });
  };

  const handleMyAuctions = () => {
    if (!isAuthenticated) {
      router.push("/account");
      return;
    }
    router.push("/my-auctions");
  };

  const handleSendToAuction = () => {
    if (!isAuthenticated) {
      router.push("/account");
      return;
    }
    router.push("/send-to-auction");
  };

  const resetAllFilters = () => {
    setFilters(DEFAULT_AUCTION_FILTERS);
    setSearch("");
    setSelectedTab("all");
  };

  const activeFiltersNum = activeFilterCount(filters);
  const hasAnyCriteria = activeFiltersNum > 0 || search.trim().length > 0 || selectedTab !== "all";

  return (
    <Screen
      appearance="home"
      header={
        <TopNavbar
          subtitle="SÀN ĐẤU GIÁ"
          notificationCount={notificationCount}
          onNotificationsPress={() => setNotificationsOpen(true)}
          onMessagesPress={() => router.push("/chat-inbox")}
        />
      }
      footer={<MemberNavigation current="/auctions" />}
      footerAppearance="navigation"
    >
      <View style={styles.content}>
        {/* 1. Search + Filter + Guide + Member Shortcuts */}
        <AuctionSearchBar
          search={search}
          onSearchChange={setSearch}
          onHistoryPress={handleMyAuctions}
          historyCount={attentionCount}
          isMember={isMember}
          onSendToAuctionPress={handleSendToAuction}
          onFilterPress={() => setFilterModalVisible(true)}
          activeFilterCount={activeFiltersNum}
          onGuidePress={() => setGuideModalOpen(true)}
        />

        {/* 2. Outbid Alert */}
        <AuctionOutbidAlert
          auction={outbid[0]?.auction ?? null}
          totalOutbid={outbid.length}
          onReclaim={() => {
            if (outbid[0]) openQuickBid(outbid[0].auction.id);
          }}
        />

        {/* 3. Hero Open Auction (soonest ending) */}
        {heroAuction ? (
          <AuctionHeroCard
            auction={heroAuction}
            remainingMs={Date.parse(heroAuction.endAt) - now}
            onQuickBid={() => openQuickBid(heroAuction.id)}
            onOpenLive={() => handleOpenAuction(heroAuction.id)}
          />
        ) : null}

        {/* 4. Upcoming Auctions Shelf */}
        {upcomingAuctions.length > 0 ? (
          <UpcomingAuctionsShelf
            items={upcomingAuctions}
            now={now}
            onOpenAuction={handleOpenAuction}
          />
        ) : null}

        {/* 5. Category Tabs & Sort Chips */}
        <AuctionCategoryTabs
          selectedTab={selectedTab}
          onSelectTab={setSelectedTab}
          totalCount={allAuctions.length}
        />

        <AuctionSortChips
          selectedSort={selectedSort}
          onSelectSort={setSelectedSort}
        />

        {/* 6. Active Filters Summary Strip */}
        {hasAnyCriteria ? (
          <ScrollView
            horizontal
            style={styles.activeScroll}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeScrollContent}
          >
            <AppText kind="small" style={styles.activeCountText}>
              {displayedAuctions.length} kết quả
            </AppText>

            {filters.point ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Xóa lọc điểm ${filters.point}`}
                onPress={() => setFilters((prev) => ({ ...prev, point: "" }))}
                style={styles.activeChip}
              >
                <AppText style={styles.activeChipText}>{filters.point}</AppText>
                <Icon name="close" size={13} color={stitchTokens.wineDark} />
              </Pressable>
            ) : null}

            {filters.conditions.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={`Xóa lọc tình trạng ${conditionLabels[c] ?? c}`}
                onPress={() =>
                  setFilters((prev) => ({
                    ...prev,
                    conditions: prev.conditions.filter((item) => item !== c),
                  }))
                }
                style={styles.activeChip}
              >
                <AppText style={styles.activeChipText}>{conditionLabels[c] ?? c}</AppText>
                <Icon name="close" size={13} color={stitchTokens.wineDark} />
              </Pressable>
            ))}

            {filters.price ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Xóa lọc giá ${AUCTION_PRICE_RANGES[filters.price]?.label}`}
                onPress={() => setFilters((prev) => ({ ...prev, price: "" }))}
                style={styles.activeChip}
              >
                <AppText style={styles.activeChipText}>{AUCTION_PRICE_RANGES[filters.price]?.label}</AppText>
                <Icon name="close" size={13} color={stitchTokens.wineDark} />
              </Pressable>
            ) : null}

            {filters.ending ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Xóa lọc thời gian ${AUCTION_ENDING[filters.ending]?.label}`}
                onPress={() => setFilters((prev) => ({ ...prev, ending: "" }))}
                style={styles.activeChip}
              >
                <AppText style={styles.activeChipText}>{AUCTION_ENDING[filters.ending]?.label}</AppText>
                <Icon name="close" size={13} color={stitchTokens.wineDark} />
              </Pressable>
            ) : null}

            {filters.buyNow ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xóa lọc Mua ngay"
                onPress={() => setFilters((prev) => ({ ...prev, buyNow: false }))}
                style={styles.activeChip}
              >
                <AppText style={styles.activeChipText}>Mua ngay</AppText>
                <Icon name="close" size={13} color={stitchTokens.wineDark} />
              </Pressable>
            ) : null}

            {filters.noBids ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xóa lọc Chưa ai trả giá"
                onPress={() => setFilters((prev) => ({ ...prev, noBids: false }))}
                style={styles.activeChip}
              >
                <AppText style={styles.activeChipText}>Chưa ai trả giá</AppText>
                <Icon name="close" size={13} color={stitchTokens.wineDark} />
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={resetAllFilters}
              style={styles.clearAllBtn}
            >
              <AppText style={styles.clearAllText}>Xóa tất cả</AppText>
            </Pressable>
          </ScrollView>
        ) : null}

        {/* 7. Grid Section Header */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Icon name="gavel" size={16} color={stitchTokens.wine} />
            <AppText kind="bold" style={styles.sectionTitle}>Sách đang đấu giá</AppText>
          </View>
          <AppText kind="small" color={stitchTokens.brownMuted}>
            {displayedAuctions.length} phiên
          </AppText>
        </View>

        {/* 8. States & Grid */}
        <View style={styles.gridWrap}>
          {result.isPending ? (
            <StatePanel wine loading title="Đang tải phiên đấu giá" />
          ) : null}

          {result.error ? (
            <View style={styles.errorBox}>
              <Notice tone="error">
                {result.data ? "Danh sách dưới đây chưa được cập nhật. " : ""}
                {presentError(result.error).message}
              </Notice>
              <Button
                wine
                secondary
                title="Thử tải lại"
                busy={result.isFetching}
                onPress={() => void result.refetch()}
              />
            </View>
          ) : null}

          {result.isSuccess && allAuctions.length === 0 && upcomingAuctions.length > 0 && !hasAnyCriteria ? (
            <View style={styles.upcomingOnlyNotice}>
              <AppText kind="bold" style={styles.upcomingOnlyTitle}>Chưa có phiên đang mở</AppText>
              <AppText kind="small" color={stitchTokens.deepCocoa} style={styles.upcomingOnlyBody}>
                Hiện có {upcomingAuctions.length} phiên sắp mở phía trên đang nhận đăng ký đặt cọc trước.
              </AppText>
            </View>
          ) : result.isSuccess && allAuctions.length === 0 ? (
            <StatePanel
              wine
              title="Chưa có phiên nào đang mở"
              message="Phiên mới sẽ xuất hiện sau khi sách được kiểm định tại điểm TP.HCM và người bán mở phiên."
              icon="info"
            />
          ) : null}

          {result.isSuccess && allAuctions.length > 0 && displayedAuctions.length === 0 ? (
            <StatePanel
              wine
              title="Không tìm thấy phiên phù hợp"
              message="Thử xóa bớt tiêu chí lọc hoặc đổi từ khóa tìm kiếm."
              icon="search"
              action={{ label: "Đặt lại bộ lọc", onPress: resetAllFilters }}
            />
          ) : null}

          {displayedAuctions.length > 0 ? (
            <View style={styles.grid}>
              {displayedAuctions.map((item) => (
                <AuctionCard
                  key={item.id}
                  item={item}
                  remainingMs={Date.parse(item.endAt) - now}
                  onPress={() => handleOpenAuction(item.id)}
                  onQuickBid={() => openQuickBid(item.id)}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <AuctionFilterModal
        visible={filterModalVisible}
        filters={filters}
        availablePoints={availablePoints}
        totalMatchesCount={displayedAuctions.length}
        countMatches={(draft) =>
          allAuctions.filter((a) => matchesAuctionFilters(a, { ...draft, q: search }, now)).length
        }
        onClose={() => setFilterModalVisible(false)}
        onApply={(next) => setFilters(next)}
      />

      <AuctionGuideModal
        visible={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
      />

      <HomeNotificationsModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 24,
  },
  activeScroll: { flexGrow: 0, marginTop: 8 },
  activeScrollContent: {
    paddingHorizontal: space.lg,
    gap: 8,
    alignItems: "center",
  },
  activeCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.brownMuted,
  },
  activeChip: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeChipText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  clearAllBtn: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wine,
    textDecorationLine: "underline",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    marginTop: space.md,
    marginBottom: 10,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 16, color: stitchTokens.wineDark },
  gridWrap: {
    paddingHorizontal: space.lg,
  },
  errorBox: { gap: space.sm, marginBottom: space.md },
  upcomingOnlyNotice: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.md,
    gap: 4,
  },
  upcomingOnlyTitle: { color: stitchTokens.wineDark, fontSize: 15 },
  upcomingOnlyBody: { lineHeight: 19 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
});
