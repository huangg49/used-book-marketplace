import { CoverImage } from "./primitives";
import { useContext, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  filterBooks,
  modeLabel,
  money,
  type Book,
  type Scenario,
} from "./model";
import {
  Button,
  BrandLogo,
  StatePanel,
  SearchField,
  BookCondition,
  Chip,
  Icon,
  IconButton,
  Sheet,
  AppText as T,
  TextScale,
  colors as c,
  layout as s,
} from "../../core/ui";

export function ExploreScreen({
  onOpen,
  saved,
  onSave,
  savedOnly,
  scenario,
  onRetry,
}: {
  onOpen: (book: Book) => void;
  saved: string[];
  onSave: (id: string) => void;
  savedOnly: boolean;
  scenario: Scenario;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "sale" | "exchange">("all");
  const [sort, setSort] = useState<"default" | "asc" | "desc">("default");
  const [sortOpen, setSortOpen] = useState(false);
  const textScale = useContext(TextScale);
  const { fontScale } = useWindowDimensions();
  const largeText = textScale * fontScale >= 1.3;
  const results = useMemo(() => {
    const filtered = filterBooks(query, mode, savedOnly ? saved : undefined);
    return sort === "default"
      ? filtered
      : [...filtered].sort(
          (a, b) =>
            ((a.price ?? a.exchangeValue ?? 0) -
              (b.price ?? b.exchangeValue ?? 0)) *
            (sort === "asc" ? 1 : -1),
        );
  }, [query, mode, saved, savedOnly, sort]);
  const visible = scenario === "empty" ? [] : results;
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 28 }}
    >
      <View style={[s.pad, { paddingTop: 12, gap: 18 }]}>
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <BrandLogo />
          <T
            kind="small"
            color={c.muted}
            style={{ flexShrink: 1, textAlign: "right" }}
          >
            Sách cũ. Chương mới.
          </T>
        </View>
        <SearchField
          label="Tìm sách, tác giả hoặc thể loại"
          value={query}
          onChangeText={setQuery}
          placeholder="Tìm sách, tác giả…"
        />
        {!savedOnly && !query ? (
          <View style={styles.intro}>
            <View style={styles.marker} />
            <T kind="label" color={c.rustText} style={{ letterSpacing: 1.4 }}>
              KỆ SÁCH CHUYỀN TAY
            </T>
            <T kind="title" color={c.forest}>
              Một cuốn sách,{"\n"}một lần gặp mới.
            </T>
            <T kind="small" color={c.muted}>
              Chọn một cuốn. Viết tiếp hành trình đọc của bạn.
            </T>
          </View>
        ) : (
          <T kind="title" color={c.forest}>
            {savedOnly ? "Để dành lần đọc tới." : "Tìm một cuốn sách."}
          </T>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          <Chip
            title="Tất cả"
            selected={mode === "all"}
            onPress={() => setMode("all")}
          />
          <Chip
            title="Bán sách"
            selected={mode === "sale"}
            onPress={() => setMode("sale")}
          />
          <Chip
            title="Đổi sách"
            selected={mode === "exchange"}
            onPress={() => setMode("exchange")}
          />
        </ScrollView>
        <View
          style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}
        >
          <T kind="bold">
            {savedOnly ? "Sách đã lưu" : "Đang chờ bạn đọc"}{" "}
            <T kind="small" color={c.muted}>
              / {visible.length}
            </T>
          </T>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sắp xếp sách"
            onPress={() => setSortOpen(true)}
            style={[s.row, { minHeight: 44 }]}
          >
            <T kind="small" color={c.muted}>
              {sort === "default"
                ? "Gợi ý"
                : sort === "asc"
                  ? "Giá tăng"
                  : "Giá giảm"}
            </T>
            <Icon name="tune" size={18} />
          </Pressable>
        </View>
        {scenario === "loading" ? (
          <View
            accessibilityLabel="Đang tải danh sách sách"
            accessibilityRole="progressbar"
            style={styles.grid}
          >
            {[1, 2].map((n) => (
              <View key={n} style={styles.tile}>
                <View style={{ height: 190, backgroundColor: c.rule }} />
                <View
                  style={{
                    height: 14,
                    backgroundColor: c.rule,
                    marginTop: 16,
                    width: "80%",
                  }}
                />
                <T kind="small" color={c.muted}>
                  Đang tải sách…
                </T>
              </View>
            ))}
          </View>
        ) : scenario === "offline" ? (
          <StatePanel
            icon="wifi"
            title="Chưa kết nối được"
            message="Kệ sách vẫn ở đây. Kiểm tra kết nối rồi thử lại nhé."
            action={{ label: "Thử lại", onPress: onRetry }}
          />
        ) : !visible.length ? (
          <View style={styles.empty}>
            <Icon name="bookmark" size={34} />
            <T kind="heading">
              {savedOnly && !saved.length
                ? "Giữ lại một cuốn bạn thích."
                : "Chưa thấy cuốn bạn tìm."}
            </T>
            <T color={c.muted} style={{ textAlign: "center" }}>
              {savedOnly && !saved.length
                ? "Chạm biểu tượng lưu trên bìa sách. Bạn có thể quay lại xem ở đây."
                : "Thử tên tác giả, một từ khóa ngắn hơn hoặc bỏ bộ lọc."}
            </T>
            {!savedOnly || saved.length > 0 ? (
              <Button
                title={savedOnly ? "Bỏ bộ lọc" : "Xem tất cả sách"}
                secondary
                onPress={() => {
                  setQuery("");
                  setMode("all");
                  onRetry();
                }}
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.grid}>
            {visible.map((book) => (
              <View
                key={book.id}
                style={[styles.tile, largeText && { width: "100%" }]}
              >
                <View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Xem ${book.title}`}
                    onPress={() => onOpen(book)}
                  >
                    <CoverImage
                      cover={book.cover}
                      missing={scenario === "missing"}
                      label={`Bìa minh họa ${book.title}`}
                      style={{ height: 196, padding: 12 }}
                    />
                  </Pressable>
                  <View style={styles.save}>
                    <IconButton
                      name="bookmark"
                      label={`${saved.includes(book.id) ? "Bỏ lưu" : "Lưu"} ${book.title}`}
                      selected={saved.includes(book.id)}
                      onPress={() => onSave(book.id)}
                    />
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Chi tiết ${book.title}`}
                  onPress={() => onOpen(book)}
                  style={{ gap: 5, paddingTop: 12 }}
                >
                  <BookCondition
                    condition={book.condition}
                    mode={
                      book.mode === "both" ? "Bán / đổi" : modeLabel[book.mode]
                    }
                  />
                  <T kind="card" color={c.forest}>
                    {book.title}
                  </T>
                  <T kind="small" color={c.muted}>
                    {book.author}
                  </T>
                  <T kind="bold">
                    {book.price
                      ? money(book.price)
                      : `Đổi · ${money(book.exchangeValue!)}`}
                  </T>
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <View style={[s.rule, { marginTop: 12 }]} />
        <T kind="small" color={c.muted}>
          Dữ liệu thử thiết kế. Ảnh sách lưu trữ có ghi nguồn; giá, người đăng
          và tình trạng là minh họa.
        </T>
      </View>
      <Sheet
        title="Sắp xếp kệ sách"
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
      >
        {(
          [
            ["default", "Gợi ý"],
            ["asc", "Giá / giá trị đổi tăng dần"],
            ["desc", "Giá / giá trị đổi giảm dần"],
          ] as const
        ).map(([value, label]) => (
          <Chip
            key={value}
            title={label}
            selected={sort === value}
            onPress={() => {
              setSort(value);
              setSortOpen(false);
            }}
          />
        ))}
      </Sheet>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  intro: { gap: 8, paddingVertical: 10, paddingRight: 14 },
  marker: {
    position: "absolute",
    right: 0,
    top: 16,
    width: 5,
    height: 57,
    backgroundColor: c.terracotta,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 26,
  },
  tile: { width: "47.5%", minWidth: 0 },
  save: { position: "absolute", top: 5, right: 5 },
  empty: { paddingVertical: 32, gap: 18, alignItems: "center" },
});
