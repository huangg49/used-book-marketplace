import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { AppText, AppTextInput as TextInput, Icon, space, stitchTokens } from "../../../core/ui";

export interface AuctionSearchBarProps {
  readonly search: string;
  readonly onSearchChange: (text: string) => void;
  readonly onHistoryPress: () => void;
  readonly historyCount?: number;
  readonly isMember?: boolean;
  readonly onSendToAuctionPress?: () => void;
  readonly onFilterPress?: () => void;
  readonly activeFilterCount?: number;
  readonly onGuidePress?: () => void;
}

export function AuctionSearchBar({
  search,
  onSearchChange,
  onHistoryPress,
  historyCount = 0,
  onSendToAuctionPress,
  onFilterPress,
  activeFilterCount = 0,
  onGuidePress,
}: AuctionSearchBarProps) {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <View style={styles.container}>
      {/* 1. Search Bar + Filter + Guide (48dp touch targets) */}
      <View style={styles.searchRow}>
        <View
          {...(Platform.OS === "web" ? { dataSet: { focusSurface: "true" } } : {})}
          style={[styles.searchBox, searchFocused && styles.searchBoxFocused]}
        >
          <Icon name="search" size={17} color={stitchTokens.brownMuted} />
          <TextInput
            composite
            accessibilityLabel="Tìm phiên đấu giá"
            value={search}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onChangeText={onSearchChange}
            placeholder="Tìm tên sách, tác giả…"
            placeholderTextColor={stitchTokens.brownMuted}
            style={styles.searchInput}
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xóa từ khóa tìm kiếm"
              hitSlop={8}
              onPress={() => onSearchChange("")}
              style={styles.clearBtn}
            >
              <Icon name="close" size={15} color={stitchTokens.brownMuted} />
            </Pressable>
          ) : null}
        </View>

        {onFilterPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              activeFilterCount > 0 ? `Bộ lọc, đang bật ${activeFilterCount} mục` : "Mở bộ lọc phiên đấu giá"
            }
            onPress={onFilterPress}
            style={({ pressed }) => [
              styles.iconActionBtn,
              activeFilterCount > 0 && styles.iconActionBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Icon
              name="tune"
              size={18}
              color={activeFilterCount > 0 ? stitchTokens.gold : stitchTokens.wineDark}
            />
            {activeFilterCount > 0 ? (
              <View style={styles.filterBadge}>
                <AppText style={styles.filterBadgeText}>{activeFilterCount}</AppText>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        {onGuidePress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hướng dẫn tham gia đấu giá"
            onPress={onGuidePress}
            style={({ pressed }) => [styles.iconActionBtn, pressed && styles.pressed]}
          >
            <Icon name="info" size={18} color={stitchTokens.wineDark} />
          </Pressable>
        ) : null}
      </View>

      {/* 2. Quick Member Shortcuts (2 equal 44dp pills) */}
      {onSendToAuctionPress ? (
        <View style={styles.quickRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xem phiên đấu giá của bạn"
            onPress={onHistoryPress}
            style={({ pressed }) => [styles.quickBtnSecondary, pressed && styles.pressed]}
          >
            <Icon name="gavel" size={15} color={stitchTokens.wine} />
            <AppText kind="bold" style={styles.quickBtnSecondaryText} numberOfLines={1}>
              Phiên của bạn
            </AppText>
            {historyCount > 0 ? (
              <View style={styles.countBadge}>
                <AppText style={styles.countBadgeText}>{historyCount}</AppText>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gửi sách đấu giá mới"
            onPress={onSendToAuctionPress}
            style={({ pressed }) => [styles.quickBtnPrimary, pressed && styles.pressed]}
          >
            <Icon name="plus" size={15} color={stitchTokens.gold} />
            <AppText kind="bold" style={styles.quickBtnPrimaryText} numberOfLines={1}>
              Gửi sách đấu giá
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
    gap: 10,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchBox: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchBoxFocused: {
    borderColor: stitchTokens.wine,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: stitchTokens.deepCocoa,
    paddingVertical: 10,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActionBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActionBtnActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  filterBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: stitchTokens.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  quickRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickBtnSecondary: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  quickBtnSecondaryText: {
    fontSize: 13,
    color: stitchTokens.wineDark,
    flexShrink: 1,
  },
  quickBtnPrimary: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.wine,
  },
  quickBtnPrimaryText: {
    fontSize: 13,
    color: stitchTokens.gold,
    flexShrink: 1,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: stitchTokens.gold,
    includeFontPadding: false,
  },
  pressed: { opacity: 0.78 },
});
