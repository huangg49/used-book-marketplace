import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppTextInput, Icon, stitchTokens } from "../../../core/ui";
import { AppText } from "../../../core/ui/text";

export interface HomeHeaderProps {
  readonly onSearchPress?: () => void;
  readonly search?: string;
  readonly onSearchChange?: (value: string) => void;
  readonly onSubmitSearch?: () => void;
  readonly onCameraPress: () => void;
  readonly onOpenNotifications: () => void;
  readonly onOpenCart: () => void;
  readonly notificationCount?: number;
  readonly cartCount?: number;
}

export function HomeHeader({
  onSearchPress,
  search = "",
  onSearchChange,
  onSubmitSearch,
  onCameraPress,
  onOpenNotifications,
  onOpenCart,
  notificationCount = 3,
  cartCount = 0,
}: HomeHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerRoot, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.headerContent}>
        {/* Search Bar - Real input with accessibility label for test and UX */}
        <Pressable
          accessibilityRole="search"
          onPress={onSearchPress}
          style={styles.searchBar}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tìm kiếm"
            onPress={onSubmitSearch || onSearchPress}
            style={styles.searchIconWrapper}
          >
            <Icon name="search" size={18} color={stitchTokens.wine} />
          </Pressable>
          <AppTextInput
            accessibilityLabel="Tìm sách theo tên, tác giả hoặc ISBN"
            placeholder="Tìm kiếm sách cổ, tác giả, tựa s..."
            placeholderTextColor={stitchTokens.ashBrown}
            value={search}
            onChangeText={onSearchChange}
            onSubmitEditing={onSubmitSearch}
            onFocus={() => {
              if (onSearchPress) {
                onSearchPress();
              }
            }}
            returnKeyType="search"
            style={styles.searchInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tìm bằng hình ảnh bìa sách"
            onPress={onCameraPress}
            hitSlop={8}
            style={styles.iconButton}
          >
            <Icon name="camera" size={18} color={stitchTokens.stoneMuted} />
          </Pressable>
        </Pressable>

        {/* Action: Notifications */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Thông báo (${notificationCount} chưa đọc)`}
          onPress={onOpenNotifications}
          style={({ pressed }) => [
            styles.headerActionBtn,
            pressed && styles.btnPressed,
          ]}
        >
          <Icon name="bell" size={22} color={stitchTokens.white} />
          {notificationCount > 0 ? (
            <View style={styles.badgePill}>
              <AppText kind="small" style={styles.badgeText}>
                {notificationCount > 9 ? "9+" : notificationCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>

        {/* Action: Messages */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tin nhắn"
          onPress={onOpenCart}
          style={({ pressed }) => [
            styles.headerActionBtn,
            pressed && styles.btnPressed,
          ]}
        >
          <Icon name="message" size={20} color={stitchTokens.white} />
          {cartCount >= 0 ? (
            <View style={styles.badgePill}>
              <AppText kind="small" style={styles.badgeText}>
                {cartCount > 9 ? "9+" : cartCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRoot: {
    backgroundColor: stitchTokens.wine,
    paddingBottom: 10,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 100,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    backgroundColor: stitchTokens.white,
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: stitchTokens.softRose,
  },
  searchIconWrapper: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    height: 38,
    fontSize: 13,
    color: stitchTokens.charcoalBrown,
    paddingVertical: 0,
    paddingHorizontal: 4,
  },
  iconButton: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  headerActionBtn: {
    position: "relative",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  btnPressed: {
    opacity: 0.75,
  },
  badgePill: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: stitchTokens.goldAccent,
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    lineHeight: 11,
  },
});
