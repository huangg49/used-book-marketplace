import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText, Icon, radius, space, stitchTokens } from "../../../core/ui";

export interface AuctionSortChipsProps {
  readonly selectedSort: string;
  readonly onSelectSort: (sort: string) => void;
  readonly filterHasBuyNow?: boolean;
  readonly onToggleBuyNow?: () => void;
  readonly onOpenFilterModal?: () => void;
  readonly activeFilterCount?: number;
}

const SORTS = [
  { id: "newest", title: "Mới nhất" },
  { id: "price_asc", title: "Giá thấp → cao" },
  { id: "price_desc", title: "Giá cao → thấp" },
  { id: "bids", title: "Nhiều người trả giá" },
] as const;

export function AuctionSortChips({
  selectedSort,
  onSelectSort,
}: AuctionSortChipsProps) {
  return (
    <ScrollView
      horizontal
      style={styles.scrollView}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.prefix}>
        <Icon name="filterList" size={14} color={stitchTokens.brownMuted} />
        <AppText kind="small" style={styles.prefixText}>Sắp xếp</AppText>
      </View>

      {SORTS.map((s) => {
        const isSelected = selectedSort === s.id;
        return (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelectSort(s.id)}
            style={({ pressed }) => [
              styles.chip,
              isSelected && styles.chipActive,
              pressed && styles.pressed,
            ]}
          >
            <AppText
              kind="small"
              style={[styles.chipText, isSelected && styles.chipTextActive]}
            >
              {s.title}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flexGrow: 0, marginTop: 6 },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingVertical: 4,
    gap: 8,
    alignItems: "center",
  },
  prefix: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 2,
  },
  prefixText: {
    fontSize: 12,
    color: stitchTokens.brownMuted,
    fontWeight: "600",
  },
  chip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.control,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  chipActive: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderColor: stitchTokens.wine,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  chipTextActive: {
    color: stitchTokens.wineDark,
    fontWeight: "700",
  },
  pressed: { opacity: 0.78 },
});
