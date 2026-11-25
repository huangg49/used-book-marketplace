import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText, Icon, radius, space, stitchTokens } from "../../../core/ui";

export type CategoryTabId = "all" | "ending_soon" | "buy_now" | "no_bids";

export interface CategoryTab {
  id: CategoryTabId;
  title: string;
  count?: number;
  icon?: "clock" | "bolt" | "gavel";
}

export interface AuctionCategoryTabsProps {
  readonly selectedTab: CategoryTabId;
  readonly onSelectTab: (tab: CategoryTabId) => void;
  readonly totalCount: number;
  readonly watchlistCount?: number;
}

export function AuctionCategoryTabs({
  selectedTab,
  onSelectTab,
  totalCount,
}: AuctionCategoryTabsProps) {
  const tabs: CategoryTab[] = [
    { id: "all", title: "Đang mở", count: totalCount },
    { id: "ending_soon", title: "Sắp kết thúc (<1h)", icon: "clock" },
    { id: "buy_now", title: "Có mua ngay", icon: "bolt" },
    { id: "no_bids", title: "Chưa ai trả giá", icon: "gavel" },
  ];

  return (
    <ScrollView
      horizontal
      style={styles.scrollView}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => {
        const isSelected = selectedTab === tab.id;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelectTab(tab.id)}
            style={({ pressed }) => [
              styles.tab,
              isSelected ? styles.tabSelected : styles.tabUnselected,
              pressed && styles.pressed,
            ]}
          >
            {tab.id === "all" ? (
              <View style={[styles.liveDot, isSelected && styles.liveDotSelected]} />
            ) : null}
            {tab.icon ? (
              <Icon
                name={tab.icon}
                size={14}
                color={isSelected ? stitchTokens.gold : stitchTokens.wine}
              />
            ) : null}
            <AppText
              kind="small"
              style={[
                styles.tabText,
                isSelected ? styles.tabTextSelected : styles.tabTextUnselected,
              ]}
            >
              {tab.count !== undefined ? `${tab.title} (${tab.count})` : tab.title}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flexGrow: 0, marginTop: space.md },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingVertical: 4,
    gap: 8,
  },
  tab: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  tabSelected: {
    backgroundColor: stitchTokens.wine,
  },
  tabUnselected: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  tabText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    includeFontPadding: false,
  },
  tabTextSelected: { color: stitchTokens.warmIvory },
  tabTextUnselected: { color: stitchTokens.deepCocoa },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.wine,
  },
  liveDotSelected: {
    backgroundColor: stitchTokens.gold,
  },
  pressed: { opacity: 0.78 },
});
