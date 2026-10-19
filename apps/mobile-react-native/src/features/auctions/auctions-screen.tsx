import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Button,
  Icon,
  Notice,
  Screen,
  StatePanel,
  Toast,
  TopNavbar,
  formatVnd,
  presentError,
  stitchTokens,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  AUCTIONS_QUERY_KEY,
  isOpen,
  myAuctionsOptions,
  usePublicAuctions,
} from "./auctions-model";
import type { PublicAuctionSummary } from "./contracts";
import {
  AuctionCard,
  AuctionCategoryTabs,
  AuctionHeroCard,
  AuctionOutbidAlert,
  AuctionSearchBar,
  AuctionSortChips,
  type CategoryTabId,
} from "./components";
import { AuctionQuickBidModal } from "./auction-quick-bid-modal";
import { HomeNotificationsModal } from "../shelf/home-components/home-notifications-modal";
import { useNotifications } from "../notifications/notifications-model";

export function AuctionsScreen() {
  const { client, state } = useSession();
  const foreground = useForeground();
  const queryClient = useQueryClient();
  const isAuthenticated = state.status === "authenticated";
  const isMember = isAuthenticated && state.user.roles.includes("MEMBER");

  // Real backend notifications
  const notifQuery = useNotifications(client, isAuthenticated);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationCount =
    isAuthenticated && notifQuery.data ? notifQuery.data.unreadCount : 0;

  // Open auctions, soonest end first (server order).
  const result = usePublicAuctions(client, foreground);
  const allAuctions = useMemo(() => result.data?.items ?? [], [result.data]);

  // The member's own open activity, for the outbid alert and history badge.
  const mine = useInfiniteQuery({
    ...myAuctionsOptions(client, isMember ? state.user.id : "", "active"),
    enabled: isMember && foreground,
  });

  // Ticking countdown clock
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(clockTimer);
    };
  }, []);

  // Filter & Search states
  const [search, setSearch] = useState("");
  const [selectedTab, setSelectedTab] = useState<CategoryTabId>("all");
  const [selectedSort, setSelectedSort] = useState<string>("newest");
  const [filterHasBuyNow, setFilterHasBuyNow] = useState(false);

  // Watchlist (bookmarked auction IDs, kept on this screen only)
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Quick Bid Modal State
  const [bidModalTarget, setBidModalTarget] =
    useState<PublicAuctionSummary | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Open auctions where the member bid and no longer leads.
  const myItems = mine.data?.pages.flatMap((page) => page.items) ?? [];
  const outbid = myItems.filter(
    (i) => i.role === "Bidder" && !i.leading && isOpen(i.auction, now),
  );
  const attentionCount =
    outbid.length + myItems.filter((i) => i.needsPayment).length;

  // Hero: the open auction that ends soonest.
  const heroAuction = allAuctions.find((a) => isOpen(a, now));

  // Filtered auctions
  const displayedAuctions = useMemo(() => {
    let list = [...allAuctions];

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.book?.authors.some((name) => name.toLowerCase().includes(q)),
      );
    }

    // Category tabs
    if (selectedTab === "ending_soon") {
      list = list.filter((a) => {
        const remaining = Date.parse(a.endAt) - now;
        return remaining > 0 && remaining < 3600000;
      });
    } else if (selectedTab === "watchlist") {
      list = list.filter((a) => bookmarkedIds.has(a.id));
    } else if (selectedTab === "zero_vnd") {
      list = list.filter((a) => a.startPrice <= 100000);
    }

    // Quick filter chips
    if (filterHasBuyNow) {
      list = list.filter((a) => a.buyNowPrice !== null);
    }

    // Sorting
    if (selectedSort === "newest") {
      list.sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
    } else if (selectedSort === "price_asc") {
      list.sort(
        (a, b) =>
          (a.currentPrice ?? a.startPrice) - (b.currentPrice ?? b.startPrice),
      );
    } else if (selectedSort === "price_desc") {
      list.sort(
        (a, b) =>
          (b.currentPrice ?? b.startPrice) - (a.currentPrice ?? a.startPrice),
      );
    } else if (selectedSort === "bids") {
      list.sort((a, b) => b.bidderCount - a.bidderCount);
    }

    return list;
  }, [
    allAuctions,
    search,
    selectedTab,
    selectedSort,
    filterHasBuyNow,
    now,
    bookmarkedIds,
  ]);

  const toggleBookmark = (id: string, title: string) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setToastMessage(`Đã bỏ theo dõi phiên "${title}"`);
      } else {
        next.add(id);
        setToastMessage(`Đã thêm "${title}" vào mục theo dõi`);
      }
      return next;
    });
  };

  const handleOpenAuction = (id: string) => {
    router.push({ pathname: "/auction", params: { id } });
  };

  const handleSendToAuction = () => {
    if (!isAuthenticated) {
      setToastMessage("Vui lòng đăng nhập để đăng sách đấu giá");
      router.push("/account");
      return;
    }
    router.push("/send-to-auction");
  };

  const handleBidSuccess = (amount: number) => {
    void queryClient.invalidateQueries({ queryKey: AUCTIONS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["my-auctions"] });
    setToastMessage(`Đã đặt giá thành công mức ${formatVnd(amount)}!`);
  };

  return (
    <Screen
      appearance="home"
      footer={<MemberNavigation current="/auctions" />}
      footerAppearance="navigation"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* 1. Header Top Navbar */}
        <TopNavbar
          subtitle="SÀN ĐẤU GIÁ"
          hasNotification={notificationCount > 0}
          notificationCount={notificationCount}
          onNotificationsPress={() => setNotificationsOpen(true)}
          onMessagesPress={() => router.push("/chat-inbox")}
        />

        {/* 2. Search & Shortcuts Sub-Header */}
        <AuctionSearchBar
          search={search}
          onSearchChange={setSearch}
          onHistoryPress={() => router.push("/my-auctions")}
          historyCount={attentionCount}
          isMember={isMember}
          onSendToAuctionPress={handleSendToAuction}
        />

        {/* 3. Outbid alert from the member's own open bids */}
        <AuctionOutbidAlert
          auction={outbid[0]?.auction ?? null}
          onReclaim={() => {
            if (outbid[0]) setBidModalTarget(outbid[0].auction);
          }}
        />

        {/* 4. The open auction that ends soonest */}
        {heroAuction && (
          <AuctionHeroCard
            auction={heroAuction}
            remainingMs={Date.parse(heroAuction.endAt) - now}
            onQuickBid={() => setBidModalTarget(heroAuction)}
            onOpenLive={() => handleOpenAuction(heroAuction.id)}
          />
        )}

        {/* 5. PHÂN KHU 2: TIÊU ĐỀ SÁCH CŨ ĐANG ĐẤU GIÁ */}
        <View style={styles.gridSectionHeaderContainer}>
          <View style={styles.gridSectionHeader}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Icon name="gavel" size={18} color={stitchTokens.wine} />
              <AppText kind="bold" style={styles.gridSectionTitle}>
                Sách Cũ Đang Đấu Giá
              </AppText>
            </View>
            <AppText kind="small" style={styles.gridSectionCount}>
              {displayedAuctions.length} phiên
            </AppText>
          </View>
        </View>

        {/* 6. Quick Category Tabs */}
        <AuctionCategoryTabs
          selectedTab={selectedTab}
          onSelectTab={setSelectedTab}
          totalCount={allAuctions.length}
          watchlistCount={bookmarkedIds.size}
        />

        {/* 7. Sort & Filter Chips */}
        <AuctionSortChips
          selectedSort={selectedSort}
          onSelectSort={setSelectedSort}
          filterHasBuyNow={filterHasBuyNow}
          onToggleBuyNow={() => setFilterHasBuyNow((v) => !v)}
        />

        {/* 8. Loading / error / empty */}
        <View style={styles.sectionContainer}>
          {result.isPending && (
            <StatePanel loading title="Đang tải phiên đấu giá" />
          )}
          {result.error && (
            <View style={{ gap: 8 }}>
              <Notice tone="error">
                {result.data ? "Danh sách dưới đây chưa được cập nhật. " : ""}
                {presentError(result.error).message}
              </Notice>
              <Button
                secondary
                title="Thử tải lại"
                busy={result.isFetching}
                onPress={() => void result.refetch()}
              />
            </View>
          )}
          {result.isSuccess && allAuctions.length === 0 && (
            <StatePanel
              title="Chưa có phiên nào đang mở"
              message="Phiên mới xuất hiện sau khi sách được kiểm tra tại điểm giao nhận."
              icon="info"
            />
          )}
          {allAuctions.length > 0 && displayedAuctions.length === 0 && (
            <StatePanel
              title="Không có phiên phù hợp"
              message="Thử bỏ bộ lọc hoặc đổi từ khóa tìm kiếm."
              icon="info"
            />
          )}
        </View>

        {/* 9. LƯỚI THẺ SÁCH ĐẤU GIÁ 2 CỘT */}
        <View style={styles.sectionContainer}>
          <View style={styles.twoColumnGrid}>
            {displayedAuctions.map((item) => {
              const remainingMs = Date.parse(item.endAt) - now;
              const isSaved = bookmarkedIds.has(item.id);

              return (
                <AuctionCard
                  key={item.id}
                  item={item}
                  remainingMs={remainingMs}
                  isSaved={isSaved}
                  onToggleSave={() => toggleBookmark(item.id, item.title)}
                  onPress={() => handleOpenAuction(item.id)}
                  onQuickBid={() => setBidModalTarget(item)}
                />
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Quick Bid Modal */}
      <AuctionQuickBidModal
        visible={!!bidModalTarget}
        auction={bidModalTarget}
        onClose={() => setBidModalTarget(null)}
        onSuccess={handleBidSuccess}
      />

      {/* Real Notifications Modal */}
      <HomeNotificationsModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />

      {/* Toast Feedback */}
      <Toast
        visible={Boolean(toastMessage)}
        message={toastMessage ?? ""}
        onDismiss={() => setToastMessage(null)}
        actionTitle="Xem"
        onAction={() => router.push("/my-auctions")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  gridSectionHeaderContainer: {
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 2,
  },
  gridSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gridSectionTitle: {
    fontSize: 16,
    color: stitchTokens.wineDark,
  },
  gridSectionCount: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  twoColumnGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
  },
});
