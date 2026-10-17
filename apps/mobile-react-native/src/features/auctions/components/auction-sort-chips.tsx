import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, stitchTokens } from "../../../core/ui";

export interface AuctionSortChipsProps {
  readonly selectedSort: string;
  readonly onSelectSort: (sort: string) => void;
  readonly filterVerifiedOnly: boolean;
  readonly onToggleVerified: () => void;
  readonly filterHasBuyNow: boolean;
  readonly onToggleBuyNow: () => void;
  readonly filterHcmOnly: boolean;
  readonly onToggleHcmOnly: () => void;
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
  filterVerifiedOnly,
  onToggleVerified,
  filterHasBuyNow,
  onToggleBuyNow,
  filterHcmOnly,
  onToggleHcmOnly,
}: AuctionSortChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterChipsScroll}
    >
      <View style={styles.filterPrefix}>
        <Icon name="filterList" size={14} color={stitchTokens.subtleGray} />
        <AppText kind="small" style={styles.filterPrefixText}>
          Lọc:
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
        onPress={onToggleVerified}
        style={[styles.sortChip, filterVerifiedOnly && styles.sortChipActive]}
      >
        <Icon
          name="verified"
          size={13}
          color={
            filterVerifiedOnly ? stitchTokens.white : stitchTokens.goldBronze
          }
        />
        <AppText
          kind="small"
          style={[
            styles.sortChipText,
            filterVerifiedOnly && styles.sortChipTextActive,
          ]}
        >
          Bảo chứng 100%
        </AppText>
      </Pressable>

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

      <Pressable
        onPress={onToggleHcmOnly}
        style={[styles.sortChip, filterHcmOnly && styles.sortChipActive]}
      >
        <AppText
          kind="small"
          style={[
            styles.sortChipText,
            filterHcmOnly && styles.sortChipTextActive,
          ]}
        >
          TP. Hồ Chí Minh
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
