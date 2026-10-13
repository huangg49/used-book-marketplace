import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, stitchTokens } from "../../../core/ui";
import { CATEGORIES } from "../home-mock-data";

export { CATEGORIES };

export interface HomeCategoryTabsProps {
  readonly selectedCategory: string;
  readonly onSelectCategory: (category: string) => void;
}

export function HomeCategoryTabs({
  selectedCategory,
  onSelectCategory,
}: HomeCategoryTabsProps) {
  return (
    <View style={styles.container}>
      {/* Category Section Label */}
      <View style={styles.headerRow}>
        <Icon name="bookmark" size={15} color={stitchTokens.wine} />
        <AppText kind="small" style={styles.headerLabel}>
          DANH MỤC TUYỂN CHỌN
        </AppText>
      </View>

      {/* Horizontal Tabs Scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScroll}
      >
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <Pressable
              key={cat.id || "all"}
              accessibilityRole="tab"
              accessibilityLabel={`Danh mục: ${cat.title}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelectCategory(cat.id)}
              style={[
                styles.chip,
                isSelected ? styles.chipSelected : styles.chipUnselected,
              ]}
            >
              <AppText
                kind="small"
                style={[
                  styles.chipText,
                  isSelected ? styles.chipTextSelected : styles.chipTextUnselected,
                ]}
              >
                {cat.title}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4A3F3B",
    letterSpacing: 0.5,
  },
  chipsScroll: {
    paddingHorizontal: 12,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  chipUnselected: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2DCD5",
  },
  chipText: {
    fontSize: 12,
  },
  chipTextSelected: {
    color: stitchTokens.gold,
    fontWeight: "700",
  },
  chipTextUnselected: {
    color: "#3F3734",
    fontWeight: "500",
  },
});
