import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { AppTextInput as TextInput, Icon, stitchTokens } from "../../../core/ui";

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
  isMember = false,
  onSendToAuctionPress,
  onFilterPress,
  activeFilterCount = 0,
  onGuidePress,
}: AuctionSearchBarProps) {
  return (
    <View style={styles.container}>
      {/* 1. Khung đăng sách & Quản lý phiên đấu giá */}
      {onSendToAuctionPress && (
        <View style={styles.sellerBanner}>
          {/* Header Row: Tiêu đề & Thông tin trạm */}
          <View style={styles.sellerBannerTopRow}>
            <View style={styles.sellerBannerTitleGroup}>
              <View style={styles.sellerBannerIconCircle}>
                <Icon name="gavel" size={14} color={stitchTokens.whiteSurface} />
              </View>
              <AppText kind="bold" style={styles.sellerBannerTitle}>
                Đấu giá sách của bạn
              </AppText>
              <View style={styles.badgeHcm}>
                <AppText kind="small" style={styles.badgeHcmText}>
                  TP.HCM
                </AppText>
              </View>
            </View>

            {onGuidePress && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hướng dẫn tham gia đấu giá"
                hitSlop={8}
                onPress={onGuidePress}
                style={styles.guideHelpBtn}
              >
                <AppText kind="bold" style={styles.guideHelpText}>
                  ?
                </AppText>
              </Pressable>
            )}
          </View>

          {/* Action Buttons Row: 2 nút chia đều, rõ ràng, không bao giờ bị đè */}
          <View style={styles.sellerBannerActionsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xem phiên của bạn"
              onPress={onHistoryPress}
              style={({ pressed }) => [
                styles.bannerBtnHistory,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Icon name="gavel" size={13} color={stitchTokens.gold} />
              <AppText kind="bold" style={styles.bannerBtnHistoryText}>
                Phiên của bạn
              </AppText>
              {historyCount > 0 && (
                <View style={styles.bannerBadgeCount}>
                  <AppText kind="small" style={styles.bannerBadgeCountText}>
                    {historyCount}
                  </AppText>
                </View>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đăng sách đấu giá ngay"
              onPress={onSendToAuctionPress}
              style={({ pressed }) => [
                styles.bannerBtnCreate,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Icon name="plus" size={13} color={stitchTokens.wineDark} />
              <AppText kind="bold" style={styles.bannerBtnCreateText}>
                Đăng sách mới
              </AppText>
              <Icon name="chevronRight" size={12} color={stitchTokens.wineDark} />
            </Pressable>
          </View>
        </View>
      )}

      {/* 2. Thanh search đặt bên dưới khung đăng sách */}
      <View style={styles.searchBarRow}>
        <View style={styles.searchInputWrapper}>
          <Icon name="search" size={16} color={stitchTokens.subtleGray} />
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder="Tìm phiên đấu giá, tác giả, tựa sách..."
            placeholderTextColor={stitchTokens.subtleGray}
            style={styles.searchInput}
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xóa từ khóa tìm kiếm"
              onPress={() => onSearchChange("")}
              style={{ padding: 4 }}
            >
              <Icon name="close" size={14} color={stitchTokens.subtleGray} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: stitchTokens.deepCocoa,
    paddingVertical: 0,
  },
  sellerBanner: {
    backgroundColor: stitchTokens.wineDark,
    borderWidth: 1.5,
    borderColor: stitchTokens.wineLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 3,
    elevation: 2,
  },
  sellerBannerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sellerBannerTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  sellerBannerIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: stitchTokens.whiteAlpha25,
    borderWidth: 1,
    borderColor: stitchTokens.whiteAlpha40,
    alignItems: "center",
    justifyContent: "center",
  },
  sellerBannerTitle: {
    fontSize: 13,
    color: stitchTokens.whiteSurface,
  },
  badgeHcm: {
    backgroundColor: stitchTokens.goldAccent,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeHcmText: {
    fontSize: 8.5,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    letterSpacing: 0.3,
  },
  guideHelpBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: stitchTokens.whiteAlpha25,
    borderWidth: 1,
    borderColor: stitchTokens.whiteAlpha40,
    alignItems: "center",
    justifyContent: "center",
  },
  guideHelpText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: stitchTokens.whiteSurface,
    lineHeight: 13,
  },

  // Actions Row (2 buttons)
  sellerBannerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bannerBtnHistory: {
    flex: 1,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: stitchTokens.whiteAlpha25,
    borderWidth: 1,
    borderColor: stitchTokens.whiteAlpha40,
    borderRadius: 8,
    position: "relative",
    paddingHorizontal: 6,
  },
  bannerBtnHistoryText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.whiteSurface,
  },
  bannerBadgeCount: {
    position: "absolute",
    top: -5,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: stitchTokens.flashRed,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: stitchTokens.wineDark,
  },
  bannerBadgeCountText: {
    fontSize: 9,
    fontWeight: "800",
    color: stitchTokens.white,
  },
  bannerBtnCreate: {
    flex: 1,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.goldLight,
    paddingHorizontal: 6,
  },
  bannerBtnCreateText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
});
