import { useMemo, useRef, useState } from "react";
import { Keyboard, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Button,
  Chip,
  Notice,
  Screen,
  StatePanel,
  colors,
  presentError,
  space,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import { publicPage } from "./contracts";
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
import { HomeInspectionModal } from "./home-components/home-inspection-modal";
import { HomeNotificationsModal } from "./home-components/home-notifications-modal";
import { HomeCartModal } from "./home-components/home-cart-modal";
import { FALLBACK_AUCTIONS, type LiveAuctionItem } from "./home-mock-data";
import { usePublicAuctions } from "../auctions/auctions-model";

export function ShelfScreen() {
  const { client } = useSession();
  const active = useForeground();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [applied, setApplied] = useState(initialFilters);
  const [vouchersOpen, setVouchersOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [cursors, setCursors] = useState<string[]>([""]);
  const scroll = useRef<ScrollView>(null);
  const cursor = cursors[cursors.length - 1],
    query = queryString(applied);

  const auctionsQuery = usePublicAuctions(client);

  const liveAuctions: readonly LiveAuctionItem[] = useMemo(() => {
    if (auctionsQuery.data?.items && auctionsQuery.data.items.length > 0) {
      return auctionsQuery.data.items.map((auc, idx) => ({
        id: auc.id,
        listingId: auc.listingId,
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

  const result = useQuery({
    queryKey: ["public-shelf", query, cursor],
    queryFn: () =>
      client.publicRequest(
        `/listings?${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        publicPage,
      ),
    enabled: active,
    staleTime: 0,
    gcTime: 120_000,
    refetchInterval: active ? 30_000 : false,
    retry: false,
  });

  function apply(next: Filters) {
    const issue = filterError(next);
    setError(issue);
    if (issue) return;
    setApplied({ ...next, q: next.q.trim() });
    setSearch(next.q.trim());
    setCursors([""]);
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

  const handleOpenBook = (id: string) => {
    router.push({ pathname: "./book", params: { id } });
  };

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
          onSearchChange={setSearch}
          onSubmitSearch={() => apply({ ...applied, q: search })}
          onCameraPress={() => setInspectionOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          onOpenCart={() => setCartOpen(true)}
          notificationCount={3}
          cartCount={0}
        />
      }
      footer={<MemberNavigation current="/" />}
      footerAppearance="navigation"
      compactFooter
    >
      <View style={{ gap: space.lg }}>
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
          onExchangePress={() => apply({ ...applied, mode: "Exchange" })}
          onRarePress={() => apply({ ...applied, condition: "LikeNew" })}
        />

        {/* 3. Live Book Auctions Section */}
        <HomeFlashDeals
          items={liveAuctions}
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

        {hasCriteria && (result.data?.items.length !== 0 || result.error) && (
          <View style={{ alignSelf: "flex-start", paddingHorizontal: 12 }}>
            <Chip
              title="Xóa tìm kiếm và bộ lọc"
              selected={false}
              onPress={() => apply(initialFilters)}
            />
          </View>
        )}

        {result.isPending && <StatePanel loading title="Đang tải sách…" />}

        {result.error && (
          <>
            <Notice tone="error">
              {result.data
                ? "Chưa cập nhật được danh sách. Sách bên dưới là dữ liệu lần tải trước và có thể không còn khả dụng. "
                : ""}
              {presentError(result.error).message}
            </Notice>
            <Button
              title={cursor ? "Tải lại từ trang đầu" : "Thử lại"}
              secondary
              busy={result.isFetching}
              onPress={() => {
                if (cursor) setCursors([""]);
                else void result.refetch();
              }}
            />
          </>
        )}

        {result.data?.items.length === 0 && !result.error && (
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
            items={result.data?.items ?? []}
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

        <View style={{ paddingHorizontal: 12, gap: space.md }}>
          {(cursors.length > 1 || (result.data?.nextCursor && !result.error)) && (
            <View
              style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}
            >
              {cursors.length > 1 && (
                <Button
                  title="Trang trước"
                  secondary
                  disabled={result.isFetching}
                  onPress={() => {
                    setCursors((previous) => previous.slice(0, -1));
                    scroll.current?.scrollTo({ y: 0, animated: false });
                  }}
                />
              )}
              {result.data?.nextCursor && !result.error && (
                <Button
                  title="Trang tiếp"
                  busy={result.isFetching}
                  onPress={() => {
                    setCursors((previous) => [
                      ...previous,
                      result.data!.nextCursor!,
                    ]);
                    scroll.current?.scrollTo({ y: 0, animated: false });
                  }}
                />
              )}
            </View>
          )}

          {!result.isPending && !result.error && (
            <Button
              title="Xem thêm các tác phẩm gợi ý"
              secondary
              busy={result.isFetching}
              onPress={() => void result.refetch()}
            />
          )}

          <AppText kind="small" color={colors.muted}>
            Ảnh và tình trạng do người đăng cung cấp. Xem chi tiết sách trước khi
            quyết định. Chức năng giao dịch trên ứng dụng đang được chuẩn bị.
          </AppText>
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
