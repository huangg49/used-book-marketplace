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
      {/* 1. Khung đăng sách rút gọn & tích hợp nút (?) hướng dẫn */}
      {onSendToAuctionPress && (
        <View style={styles.sellerBanner}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đấu giá sách của bạn"
            onPress={onSendToAuctionPress}
            style={styles.sellerBannerLeft}
          >
            <View style={styles.sellerBannerIconCircle}>
              <Icon name="gavel" size={15} color={stitchTokens.whiteSurface} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <AppText kind="bold" style={styles.sellerBannerTitle}>
                  Đấu giá sách của bạn
                </AppText>
                <View style={styles.badgeHcm}>
                  <AppText kind="small" style={styles.badgeHcmText}>
                    TP.HCM
                  </AppText>
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
              <AppText kind="small" numberOfLines={1} style={styles.sellerBannerSubtitle}>
                Gửi sách tại điểm TP.HCM • Nhân viên kiểm định • Mở sàn
              </AppText>
            </View>
          </Pressable>

          <View style={styles.sellerBannerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xem phiên của bạn"
              onPress={onHistoryPress}
              style={({ pressed }) => [
                styles.sellerBannerHistoryBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Icon name="gavel" size={13} color={stitchTokens.gold} />
              <AppText kind="bold" style={styles.sellerBannerHistoryText}>
                Phiên của bạn
              </AppText>
              {historyCount > 0 && (
                <View style={styles.sellerBannerHistoryBadge}>
                  <AppText kind="small" style={styles.sellerBannerHistoryBadgeText}>
                    {historyCount}
                  </AppText>
                </View>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đăng sách ngay"
              onPress={onSendToAuctionPress}
              style={({ pressed }) => [
                styles.sellerBannerCta,
                pressed && { opacity: 0.85 },
              ]}
            >
              <AppText kind="bold" style={styles.sellerBannerCtaText}>
                Đăng sách
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.wineDark,
    borderWidth: 1.5,
    borderColor: stitchTokens.wineLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 8,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 3,
    elevation: 2,
  },
  sellerBannerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sellerBannerIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteAlpha25,
    borderWidth: 1,
    borderColor: stitchTokens.whiteAlpha40,
    alignItems: "center",
    justifyContent: "center",
  },
  sellerBannerTitle: {
    fontSize: 12.5,
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
    width: 17,
    height: 17,
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
  sellerBannerSubtitle: {
    fontSize: 10.5,
    color: stitchTokens.whiteAlpha85,
    marginTop: 1,
  },
  sellerBannerCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: stitchTokens.whiteSurface,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: stitchTokens.goldLight,
  },
  sellerBannerCtaText: {
    fontSize: 10.5,
    color: stitchTokens.wineDark,
  },
  sellerBannerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sellerBannerHistoryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.whiteAlpha25,
    borderWidth: 1,
    borderColor: stitchTokens.whiteAlpha40,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    position: "relative",
  },
  sellerBannerHistoryText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.whiteSurface,
  },
  sellerBannerHistoryBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: stitchTokens.flashRed,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  sellerBannerHistoryBadgeText: {
    fontSize: 8.5,
    fontWeight: "800",
    color: stitchTokens.white,
  },
});
