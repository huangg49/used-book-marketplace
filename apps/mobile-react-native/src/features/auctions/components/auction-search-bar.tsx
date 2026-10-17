import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, stitchTokens } from "../../../core/ui";

export interface AuctionSearchBarProps {
  readonly search: string;
  readonly onSearchChange: (text: string) => void;
  readonly onHistoryPress: () => void;
  readonly historyCount?: number;
  readonly isMember?: boolean;
  readonly onSendToAuctionPress?: () => void;
}

export function AuctionSearchBar({
  search,
  onSearchChange,
  onHistoryPress,
  historyCount = 0,
  isMember = false,
  onSendToAuctionPress,
}: AuctionSearchBarProps) {
  return (
    <View style={styles.container}>
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
            <Pressable onPress={() => onSearchChange("")} style={{ padding: 4 }}>
              <Icon name="close" size={14} color={stitchTokens.subtleGray} />
            </Pressable>
          ) : (
            <Icon name="tune" size={16} color={stitchTokens.subtleGray} />
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lịch sử đấu giá"
          onPress={onHistoryPress}
          style={({ pressed }) => [styles.historyBtn, pressed && { opacity: 0.8 }]}
        >
          <Icon name="gavel" size={18} color={stitchTokens.wine} />
          {historyCount > 0 && (
            <View style={styles.historyBadge}>
              <AppText kind="small" style={styles.historyBadgeText}>
                {historyCount}
              </AppText>
            </View>
          )}
        </Pressable>
      </View>

      {/* Seller Consignment shortcut - styled like web's "Đấu giá sách của bạn" */}
      {onSendToAuctionPress && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đấu giá sách của bạn"
          onPress={onSendToAuctionPress}
          style={({ pressed }) => [
            styles.sellerBanner,
            pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
          ]}
        >
          <View style={styles.sellerBannerLeft}>
            <View style={styles.sellerBannerIconCircle}>
              <Icon name="gavel" size={16} color={stitchTokens.wineDark} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <AppText kind="bold" style={styles.sellerBannerTitle}>
                  Đấu giá sách của bạn
                </AppText>
                <View style={styles.badgeHcm}>
                  <AppText kind="small" style={styles.badgeHcmText}>
                    TP.HCM
                  </AppText>
                </View>
              </View>
              <AppText kind="small" style={styles.sellerBannerSubtitle}>
                Ký gửi trạm giao nhận • Staff kiểm tra • Mở sàn 24h
              </AppText>
            </View>
          </View>
          <View style={styles.sellerBannerCta}>
            <AppText kind="bold" style={styles.sellerBannerCtaText}>
              Đăng sách
            </AppText>
            <Icon name="chevronRight" size={13} color={stitchTokens.wineDark} />
          </View>
        </Pressable>
      )}
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
  historyBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  historyBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: stitchTokens.flashRed,
    alignItems: "center",
    justifyContent: "center",
  },
  historyBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  sellerBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F6E0A8",
    borderWidth: 1.5,
    borderColor: "#D4A373",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 1.5, height: 1.5 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 2,
  },
  sellerBannerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sellerBannerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderWidth: 1,
    borderColor: "#D4A373",
    alignItems: "center",
    justifyContent: "center",
  },
  sellerBannerTitle: {
    fontSize: 13,
    color: stitchTokens.wineDark,
  },
  badgeHcm: {
    backgroundColor: stitchTokens.wineDark,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  badgeHcmText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#F6E0A8",
    letterSpacing: 0.4,
  },
  sellerBannerSubtitle: {
    fontSize: 11,
    color: stitchTokens.wineDark,
    opacity: 0.82,
    marginTop: 2,
  },
  sellerBannerCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#D4A373",
  },
  sellerBannerCtaText: {
    fontSize: 11,
    color: stitchTokens.wineDark,
  },
});
