import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useQueries } from "@tanstack/react-query";
import { useSession } from "../../../core/session/session-provider";
import {
  AppText,
  AppTextInput,
  Button,
  Icon,
  Sheet,
  formatVnd,
  space,
  stitchTokens,
} from "../../../core/ui";
import { conditions } from "../../shelf/contracts";
import type { PrivateDraft } from "../../drafts/contracts";
import { DraftCoverPhoto } from "../../drafts/draft-cover-photo";
import { BookIdentity, catalogBookQueryOptions } from "../../drafts/catalog-picker";

export interface SendToAuctionBookPickerProps {
  readonly eligibleListings: PrivateDraft[];
  readonly unfinishedListings?: PrivateDraft[];
  readonly selectedListingId: string | null;
  readonly onSelectListing: (id: string) => void;
  readonly onOpenListing?: (id: string) => void;
  readonly onCreateListing?: () => void;
  readonly creating?: boolean;
  readonly createError?: string | null;
  readonly loadError?: boolean;
  readonly onRetryLoad?: () => void;
  readonly disabled?: boolean;
  readonly isLoading?: boolean;
  readonly defaultExpanded?: boolean;
}

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();

type ConditionKey = keyof typeof conditions;

export function SendToAuctionBookPicker({
  eligibleListings,
  selectedListingId,
  onSelectListing,
  onCreateListing,
  creating = false,
  createError = null,
  loadError = false,
  onRetryLoad,
  disabled = false,
  isLoading = false,
}: SendToAuctionBookPickerProps) {
  const { client } = useSession();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [conditionFilter, setConditionFilter] = useState<"all" | ConditionKey>("all");

  const selectedListing = useMemo(
    () => eligibleListings.find((item) => item.id === selectedListingId) ?? null,
    [eligibleListings, selectedListingId],
  );

  const hasMultipleBooks = eligibleListings.length > 1;
  const showSearch = eligibleListings.length >= 3;

  // Deduplicated with BookIdentity via shared ["listing-book", bookId] cache key.
  const uniqueBookIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of eligibleListings) {
      if (item.currentRevision.content.bookId) {
        ids.add(item.currentRevision.content.bookId);
      }
    }
    return Array.from(ids);
  }, [eligibleListings]);

  const bookQueries = useQueries({
    queries: uniqueBookIds.map((id) => ({
      ...catalogBookQueryOptions(client, id),
      enabled: pickerOpen && showSearch && Boolean(id),
    })),
  });

  const bookMetaById = useMemo(() => {
    const map = new Map<string, { title: string; authors: string[]; pending: boolean }>();
    uniqueBookIds.forEach((id, index) => {
      const result = bookQueries[index];
      map.set(id, {
        title: result?.data?.title ?? "",
        authors: result?.data?.authors ?? [],
        pending: Boolean(result?.isPending),
      });
    });
    return map;
  }, [uniqueBookIds, bookQueries]);

  const availableConditions = useMemo(() => {
    const seen = new Set<ConditionKey>();
    for (const item of eligibleListings) {
      const cond = item.currentRevision.content.condition;
      if (cond && cond in conditions) seen.add(cond as ConditionKey);
    }
    return Array.from(seen);
  }, [eligibleListings]);

  const showConditionChips = eligibleListings.length >= 4 && availableConditions.length >= 2;
  const activeCondition =
    conditionFilter === "all" || availableConditions.includes(conditionFilter)
      ? conditionFilter
      : "all";

  const filteredListings = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    return eligibleListings.filter((item) => {
      const content = item.currentRevision.content;
      if (activeCondition !== "all" && content.condition !== activeCondition) {
        return false;
      }
      if (!q) return true;
      const condText = content.condition
        ? (conditions[content.condition] ?? content.condition)
        : "";
      const meta = content.bookId ? bookMetaById.get(content.bookId) : undefined;
      if (meta?.pending) return true;
      const haystack = normalizeSearch(
        `${meta?.title ?? ""} ${meta?.authors.join(" ") ?? ""} ${condText} ${content.description ?? ""}`,
      );
      return haystack.includes(q);
    });
  }, [eligibleListings, activeCondition, searchQuery, bookMetaById]);

  const openPicker = () => {
    if (disabled) return;
    setPickerOpen(true);
  };

  const closePicker = () => {
    setPickerOpen(false);
    setSearchQuery("");
    setConditionFilter("all");
  };

  const handleSelectFromSheet = (id: string) => {
    onSelectListing(id);
    closePicker();
  };

  const renderBookRow = (
    item: PrivateDraft,
    options: {
      isSelected: boolean;
      mode: "inline-single" | "selected-preview" | "sheet-item";
      onPress: () => void;
    },
  ) => {
    const content = item.currentRevision.content;
    const coverMediaId = content.mediaIds?.[0];
    const salePrice = content.salePrice;
    const conditionText = content.condition
      ? (conditions[content.condition] ?? content.condition)
      : "Đã duyệt";
    const { isSelected, mode, onPress } = options;

    return (
      <Pressable
        key={item.id}
        accessibilityRole={mode === "selected-preview" && hasMultipleBooks ? "button" : "radio"}
        accessibilityState={
          mode === "selected-preview" && hasMultipleBooks
            ? { disabled }
            : { checked: isSelected, selected: isSelected, disabled }
        }
        accessibilityLabel={
          mode === "selected-preview" && hasMultipleBooks ? "Đổi sách đấu giá" : "Chọn sách ký gửi"
        }
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.bookRow,
          isSelected && styles.bookRowSelected,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.coverWrapper}>
          <DraftCoverPhoto listingId={item.id} mediaId={coverMediaId} label="Ảnh bìa ấn bản" compact />
        </View>

        <View style={styles.bookDetails}>
          <View style={styles.pillsRow}>
            <View style={styles.conditionPill}>
              <AppText style={styles.conditionPillText}>{conditionText}</AppText>
            </View>
            <View style={styles.approvedPill}>
              <AppText style={styles.approvedPillText}>Đã duyệt</AppText>
            </View>
          </View>

          <BookIdentity id={content.bookId} compact />

          <AppText kind="small" style={styles.priceText} numberOfLines={1}>
            Giá trị khai báo:{" "}
            <AppText kind="bold" style={styles.priceAmount}>
              {salePrice != null ? formatVnd(salePrice) : "—"}
            </AppText>
          </AppText>
        </View>

        {mode === "selected-preview" && hasMultipleBooks ? (
          <View style={styles.changePill}>
            <Icon name="swap" size={13} color={stitchTokens.wine} />
            <AppText kind="bold" style={styles.changePillText}>Đổi</AppText>
          </View>
        ) : (
          <View style={[styles.radio, isSelected && styles.radioSelected]}>
            {isSelected ? <Icon name="check" size={12} color={stitchTokens.gold} /> : null}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.stepIcon}>
            <Icon name="book" size={16} color={stitchTokens.wine} />
          </View>
          <View style={styles.flexOne}>
            <AppText kind="bold" style={styles.title}>Chọn sách đấu giá</AppText>
            <AppText kind="small" color={stitchTokens.brownMuted} numberOfLines={1}>
              {eligibleListings.length > 0
                ? `${eligibleListings.length} sách đã duyệt sẵn sàng`
                : "Bài đăng kênh đấu giá đã được duyệt"}
            </AppText>
          </View>
        </View>

        {onCreateListing && eligibleListings.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tạo sách đấu giá mới"
            disabled={disabled || creating}
            onPress={onCreateListing}
            style={({ pressed }) => [
              styles.headerCreateBtn,
              (disabled || creating) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {creating ? (
              <ActivityIndicator size="small" color={stitchTokens.wine} />
            ) : (
              <>
                <Icon name="plus" size={14} color={stitchTokens.wine} />
                <AppText kind="bold" style={styles.headerCreateText}>Tạo mới</AppText>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      {createError ? (
        <AppText kind="small" style={styles.errorText} accessibilityRole="alert">
          {createError}
        </AppText>
      ) : null}

      {loadError && !isLoading ? (
        <View style={styles.emptyBox}>
          <AppText kind="bold" style={styles.emptyTitle}>Chưa tải được sách đấu giá</AppText>
          {onRetryLoad ? (
            <Button wine secondary title="Thử lại" onPress={onRetryLoad} />
          ) : null}
        </View>
      ) : isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={stitchTokens.wine} />
          <AppText kind="small" color={stitchTokens.brownMuted}>Đang tải danh sách sách…</AppText>
        </View>
      ) : eligibleListings.length === 0 ? (
        <View style={styles.emptyBox}>
          <Icon name="book" size={26} color={stitchTokens.brownMuted} />
          <AppText kind="bold" style={styles.emptyTitle}>Chưa có sách đấu giá đã duyệt</AppText>
          <AppText kind="small" style={styles.emptyDesc}>
            Tạo bài đăng ở kênh đấu giá; sau khi được duyệt, sách sẽ xuất hiện tại đây để bạn gửi tới điểm kiểm định.
          </AppText>
          {onCreateListing ? (
            <View style={styles.emptyAction}>
              <Button
                wine
                secondary
                title={creating ? "Đang tạo sách đấu giá…" : "+ Tạo sách đấu giá mới"}
                busy={creating}
                disabled={disabled || creating}
                onPress={onCreateListing}
              />
            </View>
          ) : null}
        </View>
      ) : selectedListing ? (
        // Compact single-slot preview of the chosen book (never expands vertically)
        renderBookRow(selectedListing, {
          isSelected: true,
          mode: "selected-preview",
          onPress: () => {
            if (hasMultipleBooks) openPicker();
          },
        })
      ) : !hasMultipleBooks ? (
        // Exactly 1 eligible book: 1 tap selects directly without an extra sheet hop
        renderBookRow(eligibleListings[0], {
          isSelected: false,
          mode: "inline-single",
          onPress: () => onSelectListing(eligibleListings[0].id),
        })
      ) : (
        // 2+ eligible books & none chosen yet: single-slot picker trigger -> opens Sheet
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mở danh sách chọn từ ${eligibleListings.length} sách đã duyệt`}
          disabled={disabled}
          onPress={openPicker}
          style={({ pressed }) => [
            styles.pickerTrigger,
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.pickerTriggerIcon}>
            <Icon name="book" size={18} color={stitchTokens.wine} />
          </View>
          <View style={styles.flexOne}>
            <AppText kind="bold" style={styles.pickerTriggerTitle}>
              Chọn từ {eligibleListings.length} sách đã duyệt
            </AppText>
            <AppText kind="small" color={stitchTokens.brownMuted} numberOfLines={1}>
              {showSearch
                ? "Chạm để chọn hoặc tìm nhanh"
                : "Chạm để chọn sách muốn gửi"}
            </AppText>
          </View>
          <Icon name="chevronRight" size={18} color={stitchTokens.wine} />
        </Pressable>
      )}

      {/* Scalable Book Picker Sheet for 2+ books */}
      <Sheet
        visible={pickerOpen}
        onClose={closePicker}
        title={`Chọn sách đấu giá (${eligibleListings.length})`}
        footer={
          onCreateListing ? (
            <Button
              wine
              secondary
              title={creating ? "Đang tạo sách đấu giá…" : "+ Tạo sách đấu giá mới"}
              busy={creating}
              disabled={disabled || creating}
              onPress={() => {
                closePicker();
                onCreateListing();
              }}
            />
          ) : undefined
        }
      >
        <View style={styles.sheetBody}>
          {showSearch ? (
            <View style={[styles.searchBox, searchFocused && styles.searchBoxFocused]}>
              <Icon name="search" size={16} color={stitchTokens.brownMuted} />
              <AppTextInput
                composite
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Tìm theo tên sách, tác giả…"
                placeholderTextColor={stitchTokens.brownMuted}
                returnKeyType="search"
                style={styles.searchInput}
                accessibilityLabel="Tìm sách đấu giá đã duyệt"
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Xóa từ khóa tìm kiếm"
                  onPress={() => setSearchQuery("")}
                  style={styles.clearBtn}
                >
                  <Icon name="close" size={15} color={stitchTokens.brownMuted} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {showConditionChips ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: activeCondition === "all" }}
                onPress={() => setConditionFilter("all")}
                style={[styles.filterChip, activeCondition === "all" && styles.filterChipActive]}
              >
                <AppText
                  kind="bold"
                  style={[
                    styles.filterChipText,
                    activeCondition === "all" && styles.filterChipTextActive,
                  ]}
                >
                  Tất cả ({eligibleListings.length})
                </AppText>
              </Pressable>
              {availableConditions.map((cond) => {
                const active = activeCondition === cond;
                const label = conditions[cond] ?? cond;
                return (
                  <Pressable
                    key={cond}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setConditionFilter(cond)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                  >
                    <AppText
                      kind="bold"
                      style={[styles.filterChipText, active && styles.filterChipTextActive]}
                    >
                      {label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {filteredListings.length === 0 ? (
            <View style={styles.emptyBox}>
              <AppText kind="bold" style={styles.emptyTitle}>Không tìm thấy sách phù hợp</AppText>
              <AppText kind="small" style={styles.emptyDesc}>
                Thử đổi từ khóa hoặc xóa bộ lọc tình trạng sách.
              </AppText>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSearchQuery("");
                  setConditionFilter("all");
                }}
                style={styles.resetFilterBtn}
              >
                <AppText kind="bold" style={styles.resetFilterText}>Xóa bộ lọc</AppText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.list}>
              {filteredListings.map((item) =>
                renderBookRow(item, {
                  isSelected: selectedListingId === item.id,
                  mode: "sheet-item",
                  onPress: () => handleSelectFromSheet(item.id),
                }),
              )}
            </View>
          )}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.lg,
    gap: space.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  flexOne: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, color: stitchTokens.wineDark },
  headerCreateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  headerCreateText: { fontSize: 12, color: stitchTokens.wine },
  errorText: { color: stitchTokens.flashRed, lineHeight: 18 },
  loadingBox: { alignItems: "center", paddingVertical: space.lg, gap: 8 },
  emptyBox: {
    alignItems: "center",
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    gap: 8,
  },
  emptyTitle: { fontSize: 14, color: stitchTokens.wineDark, textAlign: "center" },
  emptyDesc: { fontSize: 13, color: stitchTokens.brownMuted, textAlign: "center", lineHeight: 19 },
  emptyAction: { width: "100%", marginTop: 4 },
  pickerTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 68,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.parchment,
  },
  pickerTriggerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerTriggerTitle: { fontSize: 14, color: stitchTokens.wineDark },
  list: { gap: space.sm },
  bookRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
  },
  bookRowSelected: {
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  coverWrapper: {
    width: 52,
    height: 72,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  bookDetails: { flex: 1, minWidth: 0, gap: 4 },
  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  conditionPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: stitchTokens.whiteSurface,
  },
  conditionPillText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  approvedPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  approvedPillText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
    includeFontPadding: false,
  },
  priceText: { color: stitchTokens.brownMuted, fontSize: 12 },
  priceAmount: { color: stitchTokens.wine, fontSize: 13, fontVariant: ["tabular-nums"] },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.whiteSurface,
  },
  changePillText: { fontSize: 12, color: stitchTokens.wine },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.wine,
  },
  sheetBody: { gap: space.md },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
  },
  searchBoxFocused: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.whiteSurface,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: stitchTokens.wineDark,
    fontSize: 14,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  chipScroll: { flexGrow: 0 },
  chipRow: { gap: 8, paddingVertical: 2 },
  filterChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
    justifyContent: "center",
  },
  filterChipActive: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.wine,
  },
  filterChipText: { fontSize: 12, color: stitchTokens.deepCocoa },
  filterChipTextActive: { color: stitchTokens.gold },
  resetFilterBtn: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  resetFilterText: { fontSize: 13, color: stitchTokens.wine },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
});
