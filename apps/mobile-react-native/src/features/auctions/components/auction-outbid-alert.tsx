import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, colors, formatVnd, radius, space, stitchTokens } from "../../../core/ui";
import type { PublicAuctionSummary } from "../contracts";

export interface AuctionOutbidAlertProps {
  readonly auction: PublicAuctionSummary | null;
  readonly totalOutbid?: number;
  readonly onReclaim: () => void;
}

export function AuctionOutbidAlert({
  auction,
  totalOutbid = 1,
  onReclaim,
}: AuctionOutbidAlertProps) {
  if (!auction || auction.minimumBid === null) return null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.box}>
        <View style={styles.left}>
          <View style={styles.iconWrap}>
            <Icon name="flame" size={16} color={colors.warning} />
          </View>
          <View style={styles.textCol}>
            <View style={styles.titleRow}>
              <AppText kind="bold" style={styles.badgeText}>
                Bị vượt giá{totalOutbid > 1 ? ` (${totalOutbid})` : ""}
              </AppText>
              <AppText kind="bold" style={styles.title} numberOfLines={1}>
                {auction.title}
              </AppText>
            </View>
            <AppText kind="small" color={stitchTokens.deepCocoa} numberOfLines={1}>
              Giá hiện tại {formatVnd(auction.currentPrice ?? auction.startPrice)}
            </AppText>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Trả giá lại cho ${auction.title}`}
          onPress={onReclaim}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <AppText kind="bold" style={styles.ctaText}>
            Trả {formatVnd(auction.minimumBid)}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: space.lg,
    marginTop: space.sm,
  },
  box: {
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1,
    borderColor: stitchTokens.orangeBorderSoft,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  badgeText: { fontSize: 12, color: colors.warning, flexShrink: 0 },
  title: { flex: 1, fontSize: 13, color: stitchTokens.wineDark },
  cta: {
    minHeight: 42,
    borderRadius: radius.control,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  ctaText: {
    color: stitchTokens.gold,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  pressed: { opacity: 0.8 },
});
