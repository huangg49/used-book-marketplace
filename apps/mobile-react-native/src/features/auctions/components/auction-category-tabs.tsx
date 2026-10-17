import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, stitchTokens } from "../../../core/ui";

export type CategoryTabId =
  | "all"
  | "ending_soon"
  | "upcoming"
  | "watchlist"
  | "zero_vnd";

export interface CategoryTab {
  id: CategoryTabId;
  title: string;
  count?: number;
  icon?: "clock" | "bookmark" | "flame" | "gavel";
}

export interface AuctionCategoryTabsProps {
  readonly selectedTab: CategoryTabId;
  readonly onSelectTab: (tab: CategoryTabId) => void;
  readonly totalCount: number;
  readonly watchlistCount: number;
}

export function AuctionCategoryTabs({
  selectedTab,
  onSelectTab,
  totalCount,
  watchlistCount,
}: AuctionCategoryTabsProps) {
  const tabs: CategoryTab[] = [
    { id: "all", title: "Đang diễn ra", count: totalCount },
    { id: "ending_soon", title: "Gần kết thúc (<1h)", icon: "clock" },
    { id: "upcoming", title: "Sắp mở phiên", count: 14 },
    {
      id: "watchlist",
      title: "Đang theo dõi",
      count: watchlistCount,
      icon: "bookmark",
    },
    { id: "zero_vnd", title: "Phiên giá tốt" },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoryTabsScroll}
    >
      {tabs.map((tab) => {
        const isSelected = selectedTab === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onSelectTab(tab.id)}
            style={[
              styles.categoryTab,
              isSelected
                ? styles.categoryTabSelected
                : styles.categoryTabUnselected,
            ]}
          >
            {tab.id === "all" && <View style={styles.livePulseDot} />}
            {tab.icon && (
              <Icon
                name={tab.icon}
                size={13}
                color={isSelected ? stitchTokens.white : stitchTokens.wine}
              />
            )}
            <AppText
              kind="small"
              style={[
                styles.categoryTabText,
                isSelected
                  ? styles.categoryTabTextSelected
                  : styles.categoryTabTextUnselected,
              ]}
            >
              {tab.title} {tab.count !== undefined ? `(${tab.count})` : ""}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  categoryTabsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  categoryTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryTabSelected: {
    backgroundColor: stitchTokens.wine,
  },
  categoryTabUnselected: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  categoryTabText: {
    fontSize: 12,
    fontWeight: "600",
  },
  categoryTabTextSelected: {
    color: stitchTokens.white,
  },
  categoryTabTextUnselected: {
    color: stitchTokens.deepCocoa,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.flashRed,
  },
});
