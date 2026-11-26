import { useMemo, useRef, useState } from "react";
import { Keyboard, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  Button,
  Chip,
  Notice,
  Screen,
  StatePanel,
  presentError,
  space,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import { publicPage, type Listing } from "./contracts";
import {
  filterError,
  initialFilters,
  queryString,
  type Filters,
} from "./filters";
import { PublicPhoto } from "./public-photo";
import { ShelfResults } from "./shelf-results";
import { HomeHeader } from "./home-components/home-header";
import { HomeBanner } from "./home-components/home-banner";
import { HomeShortcuts } from "./home-components/home-shortcuts";
import { HomeFlashDeals } from "./home-components/home-flash-deals";
import { HomeCategoryTabs } from "./home-components/home-category-tabs";
import { HomeVouchersModal } from "./home-components/home-vouchers-modal";
import { HomeNotificationsModal } from "./home-components/home-notifications-modal";
import { HomeShelfFooter } from "./home-components/home-shelf-footer";
import { usePublicAuctions } from "../auctions/auctions-model";
import { useNotifications } from "../notifications/notifications-model";

export function ShelfScreen() {
  const { client, state } = useSession();
  const isAuthenticated = state.status === "authenticated";
  const notifQuery = useNotifications(client, isAuthenticated);
  const notificationCount = notifQuery.data?.unreadCount ?? 0;
  const active = useForeground();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [applied, setApplied] = useState(initialFilters);
  const [vouchersOpen, setVouchersOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [error, setError] = useState<string>();
  const scroll = useRef<ScrollView>(null);
  const query = queryString(applied);

  const auctionsQuery = usePublicAuctions(client);

  const liveAuctions = auctionsQuery.data?.items.filter(auction =>
    auction.state === "Active" && Date.parse(auction.startAt) <= Date.parse(auctionsQuery.data!.serverTime) &&
    Date.parse(auction.endAt) > Date.parse(auctionsQuery.data!.serverTime),
  ) ?? [];

  const result = useInfiniteQuery({
    queryKey: ["public-shelf", query],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      client.publicRequest(
        `/listings?bundleSupport=whole-v1&${query}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        publicPage,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: active,
    staleTime: 8_000,
    gcTime: 300_000,
    refetchInterval: active ? 10_000 : false,
    retry: false,
  });

  const items = useMemo(() => {
    const seen = new Set<string>();
    const list: Listing[] = [];
    for (const page of result.data?.pages ?? []) {
      for (const item of page.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          list.push(item);
        }
      }
    }
    return list;
  }, [result.data?.pages]);

  function apply(next: Filters) {
    const issue = filterError(next);
    setError(issue);
    if (issue) return;
    setApplied({ ...next, q: next.q.trim() });
    setSearch(next.q.trim());
    Keyboard.dismiss();
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  const filterCount =
    Number(!!applied.mode) +
    Number(!!applied.condition) +
    Number(applied.sort !== "newest") +
    Number(!!(applied.minSalePrice || applied.maxSalePrice)) +
    Number(!!(applied.minExchangeValue || applied.maxExchangeValue));
  const hasCriteria = !!applied.q || filterCount > 0;

  const handleOpenAuction = (id: string) => {
    router.push({ pathname: "./auction", params: { id } });
  };

  return (
    <Screen
      appearance="home"
      scrollRef={scroll}
      header={
        <HomeHeader
          search={search}
          onSearchPress={() => router.navigate("/search")}
          onOpenNotifications={() => setNotificationsOpen(true)}
          onMessagesPress={() => router.push("/chat-inbox")}
          notificationCount={notificationCount}
        />
      }
      footer={<MemberNavigation current="/" />}
      footerAppearance="navigation"
      compactFooter
    >
      <View style={{ gap: space.md }}>
        {/* 1. Hero Promo Banner Carousel */}
        <HomeBanner
          onExplorePress={() => {
            scroll.current?.scrollTo({ y: 520, animated: true });
          }}
        />

        {/* 2. Quick Action 4 Shortcuts */}
        <HomeShortcuts
          onAuctionPress={() => router.navigate("/auctions")}
          onNewestPress={() => apply({ ...applied, sort: "newest" })}
          onExchangePress={() =>
            router.push({ pathname: "/search", params: { mode: "Exchange" } })
          }
          onRarePress={() => apply({ ...applied, condition: "LikeNew" })}
        />

        {/* 3. Live Book Auctions Section */}
        <HomeFlashDeals
          items={liveAuctions}
          serverTime={auctionsQuery.data?.serverTime}
          loading={auctionsQuery.isPending}
          error={!!auctionsQuery.error}
          onRetry={() => void auctionsQuery.refetch()}
          onOpenAuction={handleOpenAuction}
          onSeeAllPress={() => {
            router.navigate("/auctions");
          }}
        />

        {/* 4. Curated Category Discovery Chips */}
        <HomeCategoryTabs
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => {
            setSelectedCategory(cat);
            apply({ ...applied, q: cat });
          }}
        />

        {error ? <Notice tone="error">{error}</Notice> : null}

        {hasCriteria && (items.length !== 0 || result.error) && (
          <View style={{ alignSelf: "flex-start", paddingHorizontal: 12 }}>
            <Chip
              title="Xóa tìm kiếm và bộ lọc"
              selected={false}
              onPress={() => apply(initialFilters)}
            />
          </View>
        )}

        {result.isPending && <StatePanel loading title="Đang tải sách…" />}

        {result.error && items.length === 0 && (
          <View style={{ paddingHorizontal: 12, gap: 10 }}>
            <Notice tone="error">
              {presentError(result.error).message}
            </Notice>
            <Button
              title="Thử lại"
              secondary
              wine
              busy={result.isFetching}
              onPress={() => void result.refetch()}
            />
          </View>
        )}

        {!result.isPending && items.length === 0 && !result.error && (
          <StatePanel
            icon="book"
            title={
              hasCriteria
                ? "Không tìm thấy sách phù hợp"
                : "Chưa có sách được đăng"
            }
            message={
              hasCriteria
                ? "Thử từ khóa khác hoặc bỏ bớt bộ lọc."
                : "Bạn có thể chuẩn bị bài đăng cho những cuốn đã đọc xong."
            }
            action={
              hasCriteria
                ? {
                  label: "Xóa tìm kiếm và bộ lọc",
                  onPress: () => apply(initialFilters),
                }
                : {
                  label: "Mở sách của tôi",
                  onPress: () => router.navigate("/drafts"),
                }
            }
          />
        )}

        {/* 6. Curated Product Grid */}
        <View style={{ paddingHorizontal: 12 }}>
          <ShelfResults
            items={items}
            composition="grid"
            onOpen={(item) =>
              router.push({ pathname: "./book", params: { id: item.id } })
            }
            renderPhoto={(item) => (
              <PublicPhoto
                listingId={item.id}
                revisionId={item.revisionId}
                mediaId={item.photos[0].id}
                label={`Ảnh sách ${item.book.title}`}
                active={active && !result.isError}
                result
                onOpen={() =>
                  router.push({ pathname: "./book", params: { id: item.id } })
                }
              />
            )}
          />
        </View>

        <HomeShelfFooter
          loadedCount={items.length}
          hasNextPage={Boolean(result.hasNextPage)}
          fetchingNextPage={result.isFetchingNextPage}
          nextPageError={
            result.isFetchNextPageError && result.error
              ? presentError(result.error).message
              : undefined
          }
          onLoadMore={() => {
            if (!result.isFetchingNextPage) {
              void result.fetchNextPage();
            }
          }}
          onScrollTop={() => scroll.current?.scrollTo({ y: 0, animated: true })}
        />
      </View>

      {/* Interactive Voucher Modal */}
      <HomeVouchersModal
        visible={vouchersOpen}
        onClose={() => setVouchersOpen(false)}
      />

      {/* Interactive Notifications Modal */}
      <HomeNotificationsModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </Screen>
  );
}
