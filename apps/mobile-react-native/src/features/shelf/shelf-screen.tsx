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
  formatVnd,
  space,
  presentError,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import { conditions, modes, publicPage } from "./contracts";
import {
  filterError,
  initialFilters,
  queryString,
  sorts,
  type Filters,
} from "./filters";
import { PublicPhoto } from "./public-photo";
import { ShelfSearchHeader } from "./shelf-controls";
import { ShelfResults } from "./shelf-results";
import { ShelfFilterSheet } from "./shelf-filter-sheet";
import { HomeFlashDeals } from "./home-components/home-flash-deals";
import { FALLBACK_AUCTIONS, type LiveAuctionItem } from "./home-mock-data";
import { usePublicAuctions } from "../auctions/auctions-model";

export function ShelfScreen() {
  const { client } = useSession();
  const active = useForeground();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [filterOpen, setFilterOpen] = useState(false);
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
    setFilterOpen(false);
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

  const openFilters = () => {
    Keyboard.dismiss();
    setDraft({ ...applied, q: search });
    setError(undefined);
    setFilterOpen(true);
  };

  const handleOpenAuction = (id: string) => {
    router.push({ pathname: "./auction", params: { id } });
  };

  return (
    <Screen
      appearance="browse"
      scrollRef={scroll}
      header={
        <ShelfSearchHeader
          search={search}
          onSearchChange={setSearch}
          onSubmit={() => apply({ ...applied, q: search })}
          onFilter={openFilters}
          filterCount={filterCount}
        />
      }
      footer={<MemberNavigation current="/" />}
      footerAppearance="navigation"
      compactFooter
    >
      <View style={{ gap: space.lg }}>
        {/* Live Book Auctions Section */}
        <HomeFlashDeals
          items={liveAuctions}
          onOpenAuction={handleOpenAuction}
          onSeeAllPress={() => {
            router.navigate("/auctions");
          }}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm }}
        >
          {Object.entries({ "": "Tất cả", ...modes }).map(([key, title]) => (
            <Chip
              key={key}
              title={title}
              selected={applied.mode === key}
              onPress={() => apply({ ...applied, q: search, mode: key })}
            />
          ))}
        </ScrollView>
        {error && !filterOpen ? <Notice tone="error">{error}</Notice> : null}
        <View style={{ gap: space.sm }}>
          <AppText kind="bookHeading" accessibilityRole="header">
            {applied.q ? `Kết quả cho “${applied.q}”` : "Sách đang có"}
          </AppText>
          <AppText kind="annotation" color={colors.muted}>
            {sorts[applied.sort]}
            {applied.condition
              ? ` · ${conditions[applied.condition as keyof typeof conditions]}`
              : ""}
            {` · Trang ${cursors.length}`}
          </AppText>
          {(
            [
              ["minSalePrice", "maxSalePrice", "Giá bán"],
              ["minExchangeValue", "maxExchangeValue", "Giá trị đổi"],
            ] as const
          ).map(([min, max, label]) =>
            applied[min] || applied[max] ? (
              <AppText key={min} kind="annotation" color={colors.muted}>
                {label}:{" "}
                {applied[min]
                  ? `từ ${formatVnd(Number(applied[min]))}`
                  : "không giới hạn dưới"}
                {applied[max]
                  ? ` đến ${formatVnd(Number(applied[max]))}`
                  : ", không giới hạn trên"}
              </AppText>
            ) : null,
          )}
          {hasCriteria && (result.data?.items.length !== 0 || result.error) && (
            <View style={{ alignSelf: "flex-start" }}>
              <Chip
                title="Xóa tìm kiếm và bộ lọc"
                selected={false}
                onPress={() => apply(initialFilters)}
              />
            </View>
          )}
        </View>
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
        <ShelfResults
          items={result.data?.items ?? []}
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
            title="Làm mới danh sách"
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
      <ShelfFilterSheet
        visible={filterOpen}
        value={draft}
        onChange={(next) => {
          setDraft(next);
          setError(undefined);
        }}
        onClose={() => {
          setFilterOpen(false);
          setError(undefined);
        }}
        onApply={() => apply(draft)}
        error={error}
      />
    </Screen>
  );
}
