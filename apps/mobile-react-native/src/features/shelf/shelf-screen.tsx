import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Icon,
  Screen,
  StatePanel,
  stitchTokens,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import { publicPage, type Listing } from "./contracts";
import {
  initialFilters,
  queryString,
  type Filters,
} from "./filters";
import { HomeHeader } from "./home-components/home-header";
import { HomeBanner } from "./home-components/home-banner";
import { HomeShortcuts } from "./home-components/home-shortcuts";
import { HomeFlashDeals } from "./home-components/home-flash-deals";
import { HomeCategoryTabs } from "./home-components/home-category-tabs";
import { HomeBookCard } from "./home-components/home-book-card";
import { HomeVouchersModal } from "./home-components/home-vouchers-modal";
import { HomeInspectionModal } from "./home-components/home-inspection-modal";
import { HomeNotificationsModal } from "./home-components/home-notifications-modal";
import { HomeCartModal } from "./home-components/home-cart-modal";
import {
  FALLBACK_LISTINGS,
  FALLBACK_AUCTIONS,
  type LiveAuctionItem,
} from "./home-mock-data";
import { useNotifications } from "../notifications/notifications-model";
import { usePublicAuctions } from "../auctions/auctions-model";

export function ShelfScreen() {
  const { client, state } = useSession();
  const isAuthenticated = state.status === "authenticated";
  const active = useForeground();
  const scrollRef = useRef<ScrollView>(null);

  // Search & Filter State
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState(initialFilters);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [cursors, setCursors] = useState<string[]>([""]);

  // Real backend notifications & auctions
  const notifQuery = useNotifications(client, isAuthenticated);
  const auctionsQuery = usePublicAuctions(client);

  // Live auction items from API with fallback
  const liveAuctions: readonly LiveAuctionItem[] = useMemo(() => {
    if (auctionsQuery.data?.items && auctionsQuery.data.items.length > 0) {
      return auctionsQuery.data.items.map((auc, idx) => ({
        id: auc.id,
        title: auc.title,
        currentBid: auc.currentPrice ?? auc.startPrice,
        startPrice: auc.startPrice,
        bidderCount: auc.bidderCount,
        endAt: auc.endAt,
        statusText: `${auc.bidderCount} lượt đấu`,
        coverUrl:
          FALLBACK_AUCTIONS[idx % FALLBACK_AUCTIONS.length]?.coverUrl ??
          FALLBACK_AUCTIONS[0]!.coverUrl,
        conditionLabel: auc.pointName ? `Trạm ${auc.pointName}` : "Đang đấu giá",
        buyNowPrice: auc.buyNowPrice,
      }));
    }
    return FALLBACK_AUCTIONS;
  }, [auctionsQuery.data]);

  // Interactive Modals State
  const [vouchersOpen, setVouchersOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartCount, setCartCount] = useState(5);
  const [visibleCount, setVisibleCount] = useState(6);

  const notificationCount = isAuthenticated && notifQuery.data
    ? notifQuery.data.unreadCount
    : 0;

  const cursor = cursors[cursors.length - 1];
  const query = queryString(applied);

  // Real API TanStack Query
  const result = useQuery({
    queryKey: ["public-shelf", query, cursor],
    queryFn: () =>
      client.publicRequest(
        `/listings?${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        publicPage,
      ),
    enabled: active,
    staleTime: 15_000,
    gcTime: 120_000,
    refetchInterval: active ? 45_000 : false,
    retry: false,
  });

  // Apply filters
  function apply(next: Filters) {
    setApplied({ ...next, q: next.q.trim() });
    setSearch(next.q.trim());
    setCursors([""]);
    Keyboard.dismiss();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  // Combined real + fallback listings to ensure full interactive catalog
  const displayItems = useMemo(() => {
    const serverItems = result.data?.items ?? [];
    let list: (Listing & {
      coverUrl?: string;
      badgeLabel?: string;
      tags?: string[];
      salesCount?: number;
      location?: string;
    })[] = [];

    if (serverItems.length > 0) {
      list = [...serverItems];
    } else {
      list = [...FALLBACK_LISTINGS];
    }

    // Filter by selected category tab
    if (selectedCategory) {
      list = list.filter(
        (item) =>
          item.book.category?.toLowerCase() === selectedCategory.toLowerCase() ||
          item.book.title.toLowerCase().includes(selectedCategory.toLowerCase()),
      );
    }

    // Filter by search query if typed
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.book.title.toLowerCase().includes(q) ||
          item.book.authors.some((author) => author.toLowerCase().includes(q)) ||
          item.book.category.toLowerCase().includes(q),
      );
    }

    // Filter by condition
    if (applied.condition) {
      list = list.filter((item) => item.condition === applied.condition);
    }

    // Filter by mode
    if (applied.mode) {
      list = list.filter(
        (item) => item.mode === applied.mode || item.mode === "Both",
      );
    }

    // Filter by price
    if (applied.maxSalePrice) {
      const max = Number(applied.maxSalePrice);
      if (!Number.isNaN(max) && max > 0) {
        list = list.filter(
          (item) => item.salePrice != null && item.salePrice <= max,
        );
      }
    }

    return list;
  }, [
    result.data?.items,
    selectedCategory,
    search,
    applied.condition,
    applied.mode,
    applied.maxSalePrice,
  ]);

  // Handlers for shortcuts
  const handleAuctionShortcut = () => {
    apply({ ...applied, mode: "Both" });
    Alert.alert(
      "Đấu Giá Trực Tiếp",
      "Lật Lại đang lọc các ấn bản hiếm sẵn sàng cho các phiên đấu giá trực tiếp tại TP.HCM.",
    );
  };

  const handleExchangeShortcut = () => {
    apply({ ...applied, mode: "Exchange" });
  };

  const handleRareShortcut = () => {
    apply({ ...applied, condition: "LikeNew" });
  };

  const handleNewestShortcut = () => {
    apply({ ...applied, sort: "newest" });
  };

  const handleCameraPress = () => {
    Alert.alert(
      "Tìm Kiếm Bằng Hình Ảnh",
      "Tính năng chụp ảnh bìa sách để nhận diện ISBN và ấn bản đang được kết nối với AI Thẩm Định Lật Lại.",
    );
  };

  const handleOpenBook = (id: string) => {
    router.push({ pathname: "./book", params: { id } });
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 4);
  };

  return (
    <Screen
      appearance="home"
      scrollRef={scrollRef}
      header={
        <HomeHeader
          search={search}
          onSearchPress={() => router.navigate("/search")}
          onCameraPress={handleCameraPress}
          onOpenNotifications={() => {
            setNotificationsOpen(true);
          }}
          onOpenCart={() => setCartOpen(true)}
          notificationCount={notificationCount}
          cartCount={cartCount}
        />
      }
      footer={
        <MemberNavigation
          current="/"
          onAuctionPress={handleAuctionShortcut}
        />
      }
      footerAppearance="navigation"
      compactFooter
    >
      <View style={styles.homeBody}>
        {/* 1. Hero Promo Banner Carousel */}
        <HomeBanner
          onExplorePress={() => {
            setSelectedCategory("");
            scrollRef.current?.scrollTo({ y: 340, animated: true });
          }}
        />

        {/* 2. Quick Action 4 Shortcuts */}
        <HomeShortcuts
          onAuctionPress={handleAuctionShortcut}
          onExchangePress={handleExchangeShortcut}
          onNewestPress={handleNewestShortcut}
          onRarePress={handleRareShortcut}
        />

        {/* 3. Đấu Giá Trực Tiếp / Live Book Auctions */}
        <HomeFlashDeals
          items={liveAuctions}
          onOpenAuction={handleOpenBook}
          onSeeAllPress={handleAuctionShortcut}
        />

        {/* 4. Curated Category Discovery Chips */}
        <HomeCategoryTabs
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => setSelectedCategory(cat)}
        />


        {/* 5. Shopee 2-Column Product Grid ("Gợi ý hôm nay") */}
        <View style={styles.gridSection}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleGroup}>
              <View style={styles.sectionTitleBar} />
              <AppText kind="heading" style={styles.sectionTitle}>
                {selectedCategory
                  ? `TUYỂN CHỌN: ${selectedCategory.toUpperCase()}`
                  : search
                    ? `KẾT QUẢ TÌM KIẾM: “${search}”`
                    : "GỢI Ý HÔM NAY"}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mở bộ lọc sách"
              onPress={() => {
                router.navigate("/search");
              }}
              style={styles.filterBtn}
            >
              <Icon name="tune" size={15} color={stitchTokens.wine} />
              <AppText kind="small" style={styles.filterBtnText}>
                Lọc sách
              </AppText>
            </Pressable>
          </View>

          {/* Loading state indicator */}
          {result.isPending && (
            <View style={styles.stateContainer}>
              <StatePanel loading title="Đang đồng bộ sách từ máy chủ…" />
            </View>
          )}

          {/* Empty state when no books match */}
          {displayItems.length === 0 && !result.isPending && (
            <View style={styles.emptyContainer}>
              <StatePanel
                icon="book"
                title="Không tìm thấy cuốn sách phù hợp"
                message="Hãy thử thay đổi danh mục hoặc điều chỉnh lại từ khóa tìm kiếm."
                action={{
                  label: "Xem tất cả sách",
                  onPress: () => {
                    setSelectedCategory("");
                    setSearch("");
                    apply(initialFilters);
                  },
                }}
              />
            </View>
          )}

          {/* 2-Column Card Grid */}
          <View style={styles.cardsGrid}>
            {displayItems.slice(0, visibleCount).map((item) => (
              <HomeBookCard
                key={item.id}
                item={item}
                onOpen={() => handleOpenBook(item.id)}
                onToggleFavorite={() => {
                  setCartCount((prev) => prev + 1);
                }}
              />
            ))}
          </View>

          {/* Infinite Scroll / Load More Prompt */}
          {displayItems.length > visibleCount ? (
            <View style={styles.loadMoreWrapper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xem thêm các tác phẩm gợi ý"
                onPress={handleLoadMore}
                style={styles.loadMoreBtn}
              >
                <AppText kind="small" style={styles.loadMoreText}>
                  Xem thêm các tác phẩm gợi ý
                </AppText>
                <Icon name="chevronDown" size={16} color={stitchTokens.darkTaupe} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.endOfCatalog}>
              <AppText kind="small" style={styles.endOfCatalogText}>
                Đã hiển thị toàn bộ {displayItems.length} tác phẩm tuyển chọn tại
                TP.HCM
              </AppText>
            </View>
          )}
        </View>
      </View>



      {/* Interactive Voucher Modal */}
      <HomeVouchersModal
        visible={vouchersOpen}
        onClose={() => setVouchersOpen(false)}
      />

      {/* Interactive 24h Inspection Modal */}
      <HomeInspectionModal
        visible={inspectionOpen}
        onClose={() => setInspectionOpen(false)}
      />

      {/* Interactive Notifications Modal */}
      <HomeNotificationsModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />

      {/* Interactive Cart / Saved Books Modal */}
      <HomeCartModal
        visible={cartOpen}
        onClose={() => setCartOpen(false)}
        onOpenBook={handleOpenBook}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  homeBody: {
    paddingBottom: 24,
    backgroundColor: stitchTokens.creamBg,
  },
  noticeContainer: {
    marginHorizontal: 12,
    marginTop: 8,
  },
  gridSection: {
    marginTop: 10,
    paddingHorizontal: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  sectionTitleBar: {
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: stitchTokens.wine,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wine,
    letterSpacing: 0.3,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: stitchTokens.clayLight,
  },
  filterBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.wine,
  },
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  stateContainer: {
    paddingVertical: 20,
  },
  emptyContainer: {
    backgroundColor: stitchTokens.white,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    marginVertical: 8,
  },
  loadMoreWrapper: {
    marginTop: 12,
    alignItems: "center",
  },
  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    backgroundColor: stitchTokens.white,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    paddingVertical: 11,
    borderRadius: 8,
    elevation: 1,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  loadMoreText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.darkTaupe,
  },
  endOfCatalog: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 8,
  },
  endOfCatalogText: {
    fontSize: 11,
    color: stitchTokens.slateWarm,
    fontStyle: "italic",
  },
});
