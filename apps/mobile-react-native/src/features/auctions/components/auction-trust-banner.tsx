import { StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, stitchTokens } from "../../../core/ui";

export function AuctionTrustBanner() {
  return (
    <View style={styles.sectionContainer}>
      <View style={styles.trustBanner}>
        <View style={styles.contentGroup}>
          <View style={styles.trustIconCircle}>
            <Icon name="verified" size={16} color={stitchTokens.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText kind="bold" style={styles.trustTitle}>
              Thẩm Định 5 Bước • Cam Kết Hoàn 200%
            </AppText>
            <AppText kind="small" style={styles.trustSubtitle} numberOfLines={1}>
              Ký quỹ Escrow an toàn đến khi người mua cầm sách trên tay
            </AppText>
          </View>
        </View>
        <Icon name="chevronRight" size={16} color={stitchTokens.subtleGray} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  trustBanner: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  contentGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  trustIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
  },
  trustTitle: {
    fontSize: 12,
    color: stitchTokens.wineDark,
  },
  trustSubtitle: {
    fontSize: 10,
    color: stitchTokens.subtleGray,
    marginTop: 1,
  },
});
