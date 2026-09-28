import { useContext, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  BookCondition,
  Button,
  Chip,
  Icon,
  IconButton,
  Notice,
  Screen,
  SearchField,
  StatePanel,
  TextScale,
  colors,
  layout,
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
import { ShelfHeader, ShelfStory } from "./shelf-controls";
import { ShelfFilterSheet } from "./shelf-filter-sheet";

export function ShelfScreen() {
  const { client } = useSession();
  const active = useForeground();
  const { width, fontScale } = useWindowDimensions();
  const textScale = useContext(TextScale);
  const singleColumn = width < 360 || fontScale * textScale >= 1.3;
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [focusedBook, setFocusedBook] = useState<string>();
  const [cursors, setCursors] = useState<string[]>([""]);
  const scroll = useRef<ScrollView>(null);
  const cursor = cursors[cursors.length - 1],
    query = queryString(applied);
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
  return (
    <Screen
      scrollRef={scroll}
      header={<ShelfHeader />}
      footer={<MemberNavigation current="/" />}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
      >
        <View style={{ flex: 1 }}>
          <SearchField
            label="Tìm sách"
            submitLabel="Tìm trên kệ"
            placeholder="Tên sách, tác giả, ISBN"
            maxLength={400}
            onSubmitEditing={() => apply({ ...applied, q: search })}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <IconButton
          name="tune"
          label={`Lọc và sắp xếp${filterCount ? `, ${filterCount} mục đang áp dụng` : ""}`}
          onPress={openFilters}
        />
      </View>
      {error && !filterOpen ? <Notice tone="error">{error}</Notice> : null}
      {!hasCriteria && <ShelfStory />}
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
      <View style={{ gap: space.sm }}>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
        >
          <AppText
            kind="heading"
            color={colors.forest}
            accessibilityRole="header"
            style={{ flex: 1 }}
          >
            {applied.q ? `Kết quả cho “${applied.q}”` : "Trên kệ hôm nay"}
          </AppText>
        </View>
        <AppText kind="small" color={colors.muted}>
          {sorts[applied.sort]}
          {applied.condition
            ? ` · ${conditions[applied.condition as keyof typeof conditions]}`
            : ""}{" "}
          · Trang {cursors.length}
        </AppText>
        {(
          [
            ["minSalePrice", "maxSalePrice", "Giá bán"],
            ["minExchangeValue", "maxExchangeValue", "Giá trị đổi"],
          ] as const
        ).map(([min, max, label]) =>
          applied[min] || applied[max] ? (
            <AppText key={min} kind="small" color={colors.muted}>
              {label}:{" "}
              {applied[min]
                ? `từ ${Number(applied[min]).toLocaleString("vi-VN")} ₫`
                : "không giới hạn dưới"}
              {applied[max]
                ? ` đến ${Number(applied[max]).toLocaleString("vi-VN")} ₫`
                : ", không giới hạn trên"}
            </AppText>
          ) : null,
        )}
        {hasCriteria && (
          <View style={{ alignSelf: "flex-start" }}>
            <Chip
              title="Bỏ bộ lọc"
              selected={false}
              onPress={() => apply(initialFilters)}
            />
          </View>
        )}
      </View>
      {result.isPending && <StatePanel loading title="Đang xếp sách lên kệ" />}
      {result.error && (
        <>
          <Notice tone="error">
            {result.data
              ? "Chưa cập nhật được kệ. Danh sách dưới đây là lần tải trước; sách có thể không còn khả dụng. "
              : ""}
            {presentError(result.error).message}
          </Notice>
          <Button
            title={cursor ? "Tải lại từ trang đầu" : "Thử tải lại kệ"}
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
        <View
          style={{
            paddingVertical: space.xl,
            borderTopWidth: 1,
            borderColor: colors.rule,
            gap: space.md,
          }}
        >
          <Icon name="book" size={32} />
          <AppText kind="card" color={colors.forest}>
            {hasCriteria
              ? "Chưa gặp cuốn bạn tìm."
              : "Kệ đang đợi những cuốn sách đầu tiên."}
          </AppText>
          <AppText kind="small" color={colors.muted}>
            {hasCriteria
              ? "Thử tên tác giả, một từ khóa ngắn hơn hoặc bỏ bớt bộ lọc."
              : "Bạn có sách đã đọc xong? Hãy chuẩn bị một bản nháp để gửi đến người đọc tiếp theo."}
          </AppText>
          {!hasCriteria && (
            <Button
              title="Mở sách của tôi"
              onPress={() => router.navigate("/drafts")}
            />
          )}
          <Button
            title="Làm mới kệ"
            secondary
            busy={result.isFetching}
            onPress={() => void result.refetch()}
          />
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          columnGap: space.lg,
          rowGap: space.xxl,
        }}
      >
        {result.data?.items.map((item) => (
          <View
            key={item.id}
            style={{ width: singleColumn ? "100%" : "47%", gap: space.md }}
          >
            <PublicPhoto
              listingId={item.id}
              revisionId={item.revisionId}
              mediaId={item.photos[0].id}
              label={`Ảnh sách ${item.book.title}`}
              active={active && !result.isError}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Xem cuốn sách: ${item.book.title}`}
              onFocus={() => setFocusedBook(item.id)}
              onBlur={() => setFocusedBook(undefined)}
              onPress={() =>
                router.push({ pathname: "./book", params: { id: item.id } })
              }
              style={({ pressed }) => [
                {
                  gap: space.sm,
                  paddingBottom: space.md,
                  opacity: pressed ? 0.75 : 1,
                },
                focusedBook === item.id && layout.focus,
              ]}
            >
              <BookCondition condition={conditions[item.condition]} />
              <AppText
                kind="card"
                color={colors.forest}
                accessibilityRole="header"
              >
                {item.book.title}
              </AppText>
              <AppText kind="small" color={colors.muted}>
                {item.book.authors.join(" · ")}
              </AppText>
              {(
                [
                  ["Giá bán", item.salePrice],
                  ["Giá trị đổi", item.exchangeValue],
                ] as const
              ).map(([label, amount]) =>
                amount != null ? (
                  <View key={label}>
                    <AppText kind="small" color={colors.muted}>
                      {label}
                    </AppText>
                    <AppText kind="bold" color={colors.forest}>
                      {amount.toLocaleString("vi-VN")} ₫
                    </AppText>
                  </View>
                ) : null,
              )}
              <AppText kind="small" color={colors.muted}>
                Từ kệ của {item.seller.displayName}
              </AppText>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.xs,
                }}
              >
                <AppText
                  kind="small"
                  color={colors.rustText}
                  style={{ flex: 1 }}
                >
                  Xem cuốn sách
                </AppText>
                <Icon name="arrow" size={16} color={colors.rustText} />
              </View>
            </Pressable>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
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
            title="Trang sách tiếp"
            busy={result.isFetching}
            onPress={() => {
              setCursors((previous) => [...previous, result.data!.nextCursor!]);
              scroll.current?.scrollTo({ y: 0, animated: false });
            }}
          />
        )}
      </View>
      {!!result.data?.items.length && (
        <Button
          title="Cập nhật kệ"
          secondary
          busy={result.isFetching}
          onPress={() => void result.refetch()}
        />
      )}
      <AppText kind="small" color={colors.muted}>
        Ảnh và tình trạng do người đăng cung cấp. Hãy đọc kỹ trước khi trao
        sách. Chức năng giao dịch đang được chuẩn bị.
      </AppText>
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
