import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Icon,
  Screen,
  Toast,
  TopNavbar,
  formatVnd,
  stitchTokens,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  AUCTIONS_QUERY_KEY,
  usePublicAuctions,
} from "./auctions-model";
import type { PublicAuctionSummary } from "./contracts";
import {
  CURATED_SAIGON_AUCTIONS,
  type ExtendedAuctionItem,
} from "./auctions-data";
import {
  AuctionCard,
  AuctionCategoryTabs,
  AuctionCommitments,
  AuctionHeroCard,
  AuctionOutbidAlert,
  AuctionSearchBar,
  AuctionSortChips,
  AuctionTrustBanner,
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

  // Real backend auctions query
  const result = usePublicAuctions(client, foreground);
  const serverItems = result.data?.items;

  // Ticking countdown clock
  const [flashSeconds, setFlashSeconds] = useState(385); // 00:06:25
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setNow(Date.now());
      setFlashSeconds((prev) => (prev > 0 ? prev - 1 : 480));
    }, 1000);

    return () => {
      clearInterval(clockTimer);
    };
  }, []);

  // Filter & Search states
  const [search, setSearch] = useState("");
  const [selectedTab, setSelectedTab] = useState<CategoryTabId>("all");
  const [selectedSort, setSelectedSort] = useState<string>("newest");
  const [filterVerifiedOnly, setFilterVerifiedOnly] = useState(false);
  const [filterHasBuyNow, setFilterHasBuyNow] = useState(false);
  const [filterHcmOnly, setFilterHcmOnly] = useState(false);

  // Watchlist (bookmarked auction IDs)
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(
    () => new Set(["b3c4d5e6-f7a8-49bc-8d1e-3f4a5b6c7d8e"]),
  );

  // Quick Bid Modal State
  const [bidModalTarget, setBidModalTarget] = useState<
    ExtendedAuctionItem | PublicAuctionSummary | null
  >(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Outbid alert banner state
  const showOutbidAlert = true;

  // Combine real backend items with rich fallback items
  const allAuctions: ExtendedAuctionItem[] = useMemo(() => {
    if (serverItems && serverItems.length > 0) {
      return serverItems.map((item, idx) => {
        const curatedMatch =
          CURATED_SAIGON_AUCTIONS.find((c) => c.id === item.id) ??
          CURATED_SAIGON_AUCTIONS[idx % CURATED_SAIGON_AUCTIONS.length];
        return {
          ...item,
          coverUrl: curatedMatch?.coverUrl,
          author: curatedMatch?.author ?? "Tác giả cổ thư",
          publisher: curatedMatch?.publisher ?? item.pointName,
          conditionTag: curatedMatch?.conditionTag ?? "Đã thẩm định",
          location: item.pointName,
          depositAmount: curatedMatch?.depositAmount ?? 100000,
          isHot: item.bidderCount > 10,
          viewersCount: Math.max(12, item.bidderCount * 2 + 5),
        };
      });
    }
    return CURATED_SAIGON_AUCTIONS;
  }, [serverItems]);

  // Flash Auction Hero Item (First hot auction)
  const heroAuction = allAuctions[0];

  // Filtered auctions
  const displayedAuctions = useMemo(() => {
    let list = [...allAuctions];

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.author && a.author.toLowerCase().includes(q)) ||
          (a.publisher && a.publisher.toLowerCase().includes(q)),
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
    if (filterHcmOnly) {
      list = list.filter(
        (a) =>
          a.pointName.includes("Q.1") ||
          a.pointName.includes("Gia Trí") ||
          a.pointName.includes("Hồ Chí Minh"),
      );
    }

    // Sorting
    if (selectedSort === "price_asc") {
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
    filterHcmOnly,
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
    setToastMessage(`Đã đặt giá thành công mức ${formatVnd(amount)}!`);
  };

  // Format flash countdown
  const flashHours = String(Math.floor(flashSeconds / 3600)).padStart(2, "0");
  const flashMinutes = String(Math.floor((flashSeconds % 3600) / 60)).padStart(
    2,
    "0",
  );
  const flashSecs = String(flashSeconds % 60).padStart(2, "0");

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
          onMessagesPress={() => router.push("/account")}
        />

        {/* 2. Search & Shortcuts Sub-Header */}
        <AuctionSearchBar
          search={search}
          onSearchChange={setSearch}
          onHistoryPress={() => router.push("/my-auctions")}
          historyCount={isMember ? 2 : 0}
          isMember={isMember}
          onSendToAuctionPress={handleSendToAuction}
        />

        {/* 4. PHÂN KHU 1: PHIÊN ĐẤU GIÁ VÀNG - SẮP GÕ BÚA (Flash Hero Card) */}
        {heroAuction && (
          <AuctionHeroCard
            auction={heroAuction}
            flashHours={flashHours}
            flashMinutes={flashMinutes}
            flashSecs={flashSecs}
            onQuickBid={() => setBidModalTarget(heroAuction)}
            onOpenLive={() => handleOpenAuction(heroAuction.id)}
          />
        )}

        {/* 5. BẢO CHỨNG DI SẢN (Trust Banner) */}
        <AuctionTrustBanner />

        {/* 6. PHÂN KHU 2: TIÊU ĐỀ SÁCH CŨ ĐANG ĐẤU GIÁ */}
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
              {displayedAuctions.length} bản thảo trực tuyến
            </AppText>
          </View>
        </View>

        {/* 7. Quick Category Tabs (Horizontal Pill Bar) - Đang diễn ra, Gần kết thúc... */}
        <AuctionCategoryTabs
          selectedTab={selectedTab}
          onSelectTab={setSelectedTab}
          totalCount={allAuctions.length}
          watchlistCount={bookmarkedIds.size}
        />

        {/* 8. Sort & Filter Chips - Mới nhất, Giá tăng/giảm... */}
        <AuctionSortChips
          selectedSort={selectedSort}
          onSelectSort={setSelectedSort}
          filterVerifiedOnly={filterVerifiedOnly}
          onToggleVerified={() => setFilterVerifiedOnly((v) => !v)}
          filterHasBuyNow={filterHasBuyNow}
          onToggleBuyNow={() => setFilterHasBuyNow((v) => !v)}
          filterHcmOnly={filterHcmOnly}
          onToggleHcmOnly={() => setFilterHcmOnly((v) => !v)}
        />

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

        {/* 9. FLOATING / INLINE OUTBID NOTIFICATION WIDGET */}
        <AuctionOutbidAlert
          visible={showOutbidAlert}
          onReclaim={() => {
            if (heroAuction) setBidModalTarget(heroAuction);
          }}
        />

        {/* 10. Footer Commitments */}
        <AuctionCommitments />
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
