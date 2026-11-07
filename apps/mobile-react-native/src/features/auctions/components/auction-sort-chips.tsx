import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, stitchTokens } from "../../../core/ui";

export interface AuctionSortChipsProps {
  readonly selectedSort: string;
  readonly onSelectSort: (sort: string) => void;
  readonly filterHasBuyNow: boolean;
  readonly onToggleBuyNow: () => void;
  readonly onOpenFilterModal?: () => void;
  readonly activeFilterCount?: number;
}

const SORTS = [
  { id: "newest", title: "Mới nhất" },
  { id: "price_asc", title: "Giá tăng dần" },
  { id: "price_desc", title: "Giá giảm dần" },
  { id: "bids", title: "Lượt trả nhiều nhất" },
] as const;

export function AuctionSortChips({
  selectedSort,
  onSelectSort,
  filterHasBuyNow,
  onToggleBuyNow,
  onOpenFilterModal,
  activeFilterCount = 0,
}: AuctionSortChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterChipsScroll}
    >
      {onOpenFilterModal && (
        <Pressable
          onPress={onOpenFilterModal}
          style={[
            styles.sortChip,
            activeFilterCount > 0 && styles.sortChipActive,
          ]}
        >
          <Icon
            name="tune"
            size={13}
            color={
              activeFilterCount > 0
                ? stitchTokens.whiteSurface
                : stitchTokens.wineDark
            }
          />
          <AppText
            kind="small"
            style={[
              styles.sortChipText,
              activeFilterCount > 0 && styles.sortChipTextActive,
            ]}
          >
            {activeFilterCount > 0 ? `Bộ lọc (${activeFilterCount})` : "Bộ lọc"}
          </AppText>
        </Pressable>
      )}

      <View style={styles.filterPrefix}>
        <Icon name="filterList" size={14} color={stitchTokens.subtleGray} />
        <AppText kind="small" style={styles.filterPrefixText}>
          Sắp xếp:
        </AppText>
      </View>

      {SORTS.map((s) => {
        const isSelected = selectedSort === s.id;
        return (
          <Pressable
            key={s.id}
            onPress={() => onSelectSort(s.id)}
            style={[styles.sortChip, isSelected && styles.sortChipActive]}
          >
            <AppText
              kind="small"
              style={[
                styles.sortChipText,
                isSelected && styles.sortChipTextActive,
              ]}
            >
              {s.title}
            </AppText>
          </Pressable>
        );
      })}

      <Pressable
        onPress={onToggleBuyNow}
        style={[styles.sortChip, filterHasBuyNow && styles.sortChipActive]}
      >
        <AppText
          kind="small"
          style={[
            styles.sortChipText,
            filterHasBuyNow && styles.sortChipTextActive,
          ]}
        >
          {"Có \"Mua Ngay\""}
        </AppText>
      </Pressable>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filterChipsScroll: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    alignItems: "center",
  },
  filterPrefix: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 4,
  },
  filterPrefixText: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    fontWeight: "600",
  },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  sortChipActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  sortChipText: {
    fontSize: 11,
    color: stitchTokens.deepCocoa,
  },
  sortChipTextActive: {
    color: stitchTokens.white,
    fontWeight: "700",
  },
});
