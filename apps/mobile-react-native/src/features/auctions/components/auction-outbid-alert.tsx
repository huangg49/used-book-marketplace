import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, stitchTokens } from "../../../core/ui";

export interface AuctionOutbidAlertProps {
  readonly visible: boolean;
  readonly onReclaim: () => void;
}

export function AuctionOutbidAlert({
  visible,
  onReclaim,
}: AuctionOutbidAlertProps) {
  if (!visible) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.outbidAlertBox}>
        <View style={styles.contentGroup}>
          <View style={styles.outbidAlertIcon}>
            <Icon name="bolt" size={16} color={stitchTokens.white} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={styles.outbidBadge}>
                <AppText kind="small" style={styles.outbidBadgeText}>
                  BỊ VƯỢT MẶT!
                </AppText>
              </View>
              <AppText kind="bold" style={styles.outbidTitle} numberOfLines={1}>
                Hán Việt Từ Điển (1932)
              </AppText>
            </View>
            <AppText kind="small" style={styles.outbidDesc} numberOfLines={1}>
              Khách #TanDinh90 vừa nâng giá lên 2.150.000₫
            </AppText>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onReclaim}
          style={styles.reclaimBidBtn}
        >
          <AppText kind="bold" style={styles.reclaimBidBtnText}>
            Đòi Lại (+50k)
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  outbidAlertBox: {
    backgroundColor: stitchTokens.flashRedBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  contentGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  outbidAlertIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: stitchTokens.flashRed,
    alignItems: "center",
    justifyContent: "center",
  },
  outbidBadge: {
    backgroundColor: stitchTokens.flashRed,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  outbidBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  outbidTitle: {
    fontSize: 12,
    color: stitchTokens.wineDark,
  },
  outbidDesc: {
    fontSize: 11,
    color: stitchTokens.deepCocoa,
    marginTop: 1,
  },
  reclaimBidBtn: {
    backgroundColor: stitchTokens.flashRed,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  reclaimBidBtnText: {
    fontSize: 11,
    color: stitchTokens.white,
  },
});
