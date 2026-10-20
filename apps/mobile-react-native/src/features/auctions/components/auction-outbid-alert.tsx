import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, formatVnd, stitchTokens } from "../../../core/ui";
import type { PublicAuctionSummary } from "../contracts";

export interface AuctionOutbidAlertProps {
  // An open auction from the caller's own activity where they no longer lead.
  readonly auction: PublicAuctionSummary | null;
  readonly onReclaim: () => void;
}

export function AuctionOutbidAlert({
  auction,
  onReclaim,
}: AuctionOutbidAlertProps) {
  if (!auction || auction.minimumBid === null) return null;

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
                  BỊ VƯỢT GIÁ
                </AppText>
              </View>
              <AppText kind="bold" style={styles.outbidTitle} numberOfLines={1}>
                {auction.title}
              </AppText>
            </View>
            <AppText kind="small" style={styles.outbidDesc} numberOfLines={1}>
              Giá hiện tại {formatVnd(auction.currentPrice ?? auction.startPrice)}
            </AppText>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Trả giá lại cho ${auction.title}`}
          onPress={onReclaim}
          style={styles.reclaimBidBtn}
        >
          <AppText kind="bold" style={styles.reclaimBidBtnText}>
            Trả {formatVnd(auction.minimumBid)}
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
