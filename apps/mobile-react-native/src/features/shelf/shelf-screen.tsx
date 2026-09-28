import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  BookCondition,
  BookPrice,
  Button,
  Chip,
  Notice,
  Screen,
  SearchField,
  Sheet,
  StatePanel,
  TextField,
  colors,
  space,
  presentError,
} from "../../core/ui";
import { conditions, modes, publicPage } from "./contracts";
import {
  filterError,
  initialFilters,
  queryString,
  sorts,
  type Filters,
} from "./filters";
import { PublicPhoto } from "./public-photo";
import { ShelfHeader } from "./shelf-controls";

export function ShelfScreen() {
  const { client } = useSession();
  const active = useForeground();
  const [input, setInput] = useState(initialFilters),
    [applied, setApplied] = useState(initialFilters);
  const [filterOpen, setFilterOpen] = useState(false),
    [error, setError] = useState<string>();
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
  function apply(next = input) {
    const issue = filterError(next);
    setError(issue);
    if (issue) return;
    setApplied({ ...next, q: next.q.trim() });
    setCursors([""]);
    setFilterOpen(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  const field = (name: keyof Filters, value: string) =>
    setInput((previous) => ({ ...previous, [name]: value }));
  return (
    <Screen scrollRef={scroll}>
      <ShelfHeader />
      <View
        style={{
          borderLeftWidth: 3,
          borderColor: colors.terracotta,
          paddingLeft: space.lg,
          marginVertical: space.md,
        }}
      >
        <AppText kind="title" color={colors.forest} accessibilityRole="header">
          Sách cũ.{"\n"}Chương mới.
        </AppText>
        <AppText color={colors.muted}>
          Một cuốn đã đọc, một người đang đợi.
        </AppText>
      </View>
      <SearchField
        label="Tìm sách"
        placeholder="Tên sách, tác giả hoặc ISBN"
        maxLength={400}
        onSubmitEditing={() => apply()}
        value={input.q}
        onChangeText={(value) => field("q", value)}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button title="Tìm trên kệ" onPress={() => apply()} />
        <Button
          title="Lọc và sắp xếp"
          secondary
          onPress={() => {
            setError(undefined);
            setFilterOpen(true);
          }}
        />
      </View>
      {error && !filterOpen ? <Notice tone="error">{error}</Notice> : null}
      <View
        style={{
          borderBottomWidth: 1,
          borderColor: colors.forest,
          paddingBottom: space.lg,
          gap: space.sm,
        }}
      >
        <AppText
          kind="heading"
          color={colors.forest}
          accessibilityRole="header"
        >
          {applied.q ? `Kết quả cho “${applied.q}”` : "Trên kệ hôm nay"}
        </AppText>
        <AppText kind="small" color={colors.muted}>
          {sorts[applied.sort]}
          {applied.mode
            ? ` · ${modes[applied.mode as keyof typeof modes]}`
            : ""}
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
        {Object.entries(applied).some(
          ([key, value]) => value && (key !== "sort" || value !== "newest"),
        ) && (
          <Button
            title="Bỏ bộ lọc"
            secondary
            onPress={() => {
              setInput(initialFilters);
              apply(initialFilters);
            }}
          />
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
        <StatePanel
          title="Chưa gặp cuốn bạn tìm."
          message="Thử tên tác giả, một từ khóa ngắn hơn hoặc bỏ bớt bộ lọc."
          action={{
            label: "Làm mới kệ",
            busy: result.isFetching,
            onPress: () => {
              void result.refetch();
            },
          }}
        />
      )}
      {result.data?.items.map((item, index) => (
        <View
          key={item.id}
          style={{
            gap: space.lg,
            paddingBottom: space.xxl,
            borderBottomWidth: 1,
            borderColor: colors.rule,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              gap: space.lg,
              alignItems: "flex-start",
            }}
          >
            <View style={{ width: "36%" }}>
              <PublicPhoto
                listingId={item.id}
                revisionId={item.revisionId}
                mediaId={item.photos[0].id}
                label={`Ảnh sách ${item.book.title}`}
                active={active && !result.isError}
              />
            </View>
            <View style={{ flex: 1, gap: space.md }}>
              <AppText kind="label" color={colors.rustText}>
                {String((cursors.length - 1) * 12 + index + 1).padStart(2, "0")}
              </AppText>
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
              <BookCondition
                condition={conditions[item.condition]}
                mode={modes[item.mode]}
              />
            </View>
          </View>
          <BookPrice
            sale={item.salePrice ?? undefined}
            exchange={item.exchangeValue ?? undefined}
          />
          <AppText kind="small" color={colors.muted}>
            Từ kệ của {item.seller.displayName}
          </AppText>
          <Button
            title="Xem cuốn sách"
            secondary
            onPress={() =>
              router.push({ pathname: "./book", params: { id: item.id } })
            }
          />
        </View>
      ))}
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
      <Button
        title="Cập nhật kệ"
        secondary
        busy={result.isFetching}
        onPress={() => void result.refetch()}
      />
      <AppText kind="small" color={colors.muted}>
        Ảnh và tình trạng do người đăng cung cấp. Hãy đọc kỹ trước khi trao
        sách. Chức năng giao dịch đang được chuẩn bị.
      </AppText>
      <Sheet
        visible={filterOpen}
        title="Tìm đúng cuốn bạn cần"
        onClose={() => setFilterOpen(false)}
      >
        <AppText kind="bold">Hình thức</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {Object.entries({ "": "Tất cả", ...modes }).map(([key, title]) => (
            <Chip
              key={key}
              title={title}
              selected={input.mode === key}
              onPress={() => field("mode", key)}
            />
          ))}
        </View>
        <AppText kind="bold">Tình trạng</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {Object.entries({ "": "Tất cả tình trạng", ...conditions }).map(
            ([key, title]) => (
              <Chip
                key={key}
                title={title}
                selected={input.condition === key}
                onPress={() => field("condition", key)}
              />
            ),
          )}
        </View>
        <AppText kind="bold">Sắp xếp</AppText>
        {Object.entries(sorts).map(([key, title]) => (
          <Button
            key={key}
            secondary
            selected={input.sort === key}
            title={title}
            onPress={() => field("sort", key)}
          />
        ))}
        <AppText kind="small" color={colors.muted}>
          Nhập số đồng, không có dấu phân cách. Bỏ trống để không giới hạn. Hai
          khoảng giá được áp dụng đồng thời.
        </AppText>
        {(
          [
            ["minSalePrice", "Giá bán tối thiểu"],
            ["maxSalePrice", "Giá bán tối đa"],
            ["minExchangeValue", "Giá trị đổi tối thiểu"],
            ["maxExchangeValue", "Giá trị đổi tối đa"],
          ] as const
        ).map(([key, label]) => (
          <TextField
            key={key}
            label={`${label} (đồng)`}
            value={input[key]}
            onChangeText={(value) => field(key, value)}
            keyboardType="number-pad"
            maxLength={10}
          />
        ))}
        {error && <Notice tone="error">{error}</Notice>}
        <Button title="Áp dụng bộ lọc" onPress={() => apply()} />
      </Sheet>
    </Screen>
  );
}
