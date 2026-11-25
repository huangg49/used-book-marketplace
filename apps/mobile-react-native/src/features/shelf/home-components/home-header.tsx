import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, TopNavbar, stitchTokens } from "../../../core/ui";

interface HomeHeaderProps {
  readonly search?: string;
  readonly onSearchPress: () => void;
  readonly onOpenNotifications: () => void;
  readonly onMessagesPress: () => void;
  readonly notificationCount: number;
}

export function HomeHeader({
  search,
  onSearchPress,
  onOpenNotifications,
  onMessagesPress,
  notificationCount,
}: HomeHeaderProps) {
  return (
    <TopNavbar
      flushWithContent
      notificationCount={notificationCount}
      onNotificationsPress={onOpenNotifications}
      onMessagesPress={onMessagesPress}
      leading={
        <View style={styles.searchBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tìm sách theo tên, tác giả hoặc ISBN"
            onPress={onSearchPress}
            style={({ pressed }) => [styles.searchEntry, pressed && styles.pressed]}
          >
            <Icon name="search" size={18} color={stitchTokens.wine} />
            <AppText
              kind="small"
              style={[styles.searchText, search && styles.searchWithValue]}
              numberOfLines={1}
            >
              {search || "Tìm sách, tác giả, ISBN"}
            </AppText>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    backgroundColor: stitchTokens.white,
    borderRadius: 8,
  },
  searchEntry: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchText: {
    flex: 1,
    color: stitchTokens.ashBrown,
  },
  searchWithValue: {
    color: stitchTokens.charcoalBrown,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.78,
  },
});
