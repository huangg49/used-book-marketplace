import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, formatVnd, radius, space, stitchTokens } from "../../../core/ui";
import { conditions } from "../../shelf/contracts";
import { formatRemaining, isSealedFormat, minimumBidOf } from "../auctions-model";
import type { PublicAuctionSummary } from "../contracts";
import { AuctionCover } from "./auction-cover";

export interface AuctionHeroCardProps {
  readonly auction: PublicAuctionSummary;
  readonly remainingMs: number;
  readonly onQuickBid: () => void;
  readonly onOpenLive: () => void;
}

export function AuctionHeroCard({
  auction,
  remainingMs,
  onQuickBid,
  onOpenLive,
}: AuctionHeroCardProps) {
  const formatType = auction.auctionType ?? "English";
  const isDutch = formatType === "Dutch";
  const isSealed = isSealedFormat(auction);
  const canQuickBid = !isDutch && !isSealed && auction.minBidders == null;
  const currentPrice = isDutch
    ? (auction.dutchPrice ?? auction.dutchTopPrice ?? auction.buyNowPrice ?? auction.startPrice)
    : isSealed
      ? auction.startPrice
      : (auction.currentPrice ?? auction.startPrice);
  const nextBid = minimumBidOf(auction);
  const authors = auction.book?.authors.join(", ");

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Phiên sắp kết thúc: ${auction.title}`}
        onPress={onOpenLive}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        {/* Top Wine Header Strip */}
        <View style={styles.topStrip}>
          <View style={styles.stripLeft}>
            <Icon name="gavel" size={15} color={stitchTokens.gold} />
            <AppText kind="bold" style={styles.stripTitle}>Sắp kết thúc</AppText>
          </View>
          <View style={styles.timerPill}>
            <View style={styles.liveDot} />
            <AppText kind="bold" style={styles.timerText}>
              {formatRemaining(remainingMs)}
            </AppText>
          </View>
        </View>

        {/* Main Body */}
        <View style={styles.body}>
          <View style={styles.row}>
            <View style={styles.coverBox}>
              <AuctionCover
                auctionId={auction.id}
                mediaId={auction.book?.photos[0]?.id}
                label={auction.title}
                iconSize={28}
              />
            </View>

            <View style={styles.infoCol}>
              <View style={styles.metaLine}>
                <Icon name="pin" size={12} color={stitchTokens.wine} />
                <AppText kind="small" style={styles.pointText} numberOfLines={1}>
                  {auction.pointName}
                </AppText>
              </View>

              <AppText kind="bold" style={styles.title} numberOfLines={2}>
                {auction.title}
              </AppText>

              {authors ? (
                <AppText kind="small" style={styles.author} numberOfLines={1}>
                  {authors}
                </AppText>
              ) : null}

              <View style={styles.chipsRow}>
                {auction.book ? (
                  <View style={styles.metaChip}>
                    <AppText style={styles.metaChipText}>
                      {conditions[auction.book.condition]}
                    </AppText>
                  </View>
                ) : null}
                <View style={styles.metaChip}>
                  <AppText style={styles.metaChipText}>
                    {isSealed ? "Giá kín" : `${auction.bidderCount} người trả giá`}
                  </AppText>
                </View>
              </View>
            </View>
          </View>

          {/* Price Strip */}
          <View style={styles.priceBox}>
            <View style={styles.priceCol}>
              <AppText kind="small" color={stitchTokens.brownMuted}>
                {isDutch
                  ? "Giá đang giảm"
                  : isSealed
                    ? "Giá khởi điểm"
                    : auction.currentPrice === null
                      ? "Giá khởi điểm"
                      : "Giá hiện tại"}
              </AppText>
              <AppText kind="bold" style={styles.priceVal}>
                {formatVnd(currentPrice)}
              </AppText>
            </View>

            <View style={styles.priceRight}>
              <AppText kind="small" color={stitchTokens.brownMuted}>
                {isDutch
                  ? `Sàn ${formatVnd(auction.startPrice)}`
                  : !isSealed && auction.buyNowPrice !== null
                    ? `Mua ngay ${formatVnd(auction.buyNowPrice)}`
                    : `Bước +${formatVnd(auction.step)}`}
              </AppText>
            </View>
          </View>

          {/* Action Row: distinct CTAs when quick-bid applies, single clean CTA otherwise */}
          <View style={styles.actionsRow}>
            {canQuickBid ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={(e) => {
                    e.stopPropagation();
                    onQuickBid();
                  }}
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                >
                  <AppText kind="bold" style={styles.primaryBtnText}>
                    Trả {formatVnd(nextBid)}
                  </AppText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={onOpenLive}
                  style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                >
                  <AppText kind="bold" style={styles.secondaryBtnText}>
                    Xem chi tiết
                  </AppText>
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={onOpenLive}
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
              >
                <AppText kind="bold" style={styles.primaryBtnText}>
                  {isDutch
                    ? `Xem phiên giảm dần · ${formatVnd(currentPrice)}`
                    : isSealed
                      ? "Vào gửi giá kín"
                      : "Xem phiên đấu giá"}
                </AppText>
                <Icon name="chevronRight" size={16} color={stitchTokens.gold} />
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: space.lg,
    marginTop: space.md,
  },
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
  },
  topStrip: {
    backgroundColor: stitchTokens.wine,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stripLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  stripTitle: { color: stitchTokens.warmIvory, fontSize: 13 },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: stitchTokens.wineDark,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: stitchTokens.gold },
  timerText: {
    color: stitchTokens.gold,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  body: { padding: 14, gap: 12 },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  coverBox: {
    width: 84,
    height: 118,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
  },
  infoCol: { flex: 1, minWidth: 0, gap: 5 },
  metaLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  pointText: { flex: 1, color: stitchTokens.brownMuted, fontSize: 12 },
  title: { color: stitchTokens.wineDark, fontSize: 16, lineHeight: 22 },
  author: { color: stitchTokens.brownMuted, fontSize: 13 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  metaChip: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaChipText: {
    color: stitchTokens.deepCocoa,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    includeFontPadding: false,
  },
  priceBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  priceCol: { gap: 2 },
  priceVal: {
    color: stitchTokens.wine,
    fontSize: 20,
    lineHeight: 25,
    fontVariant: ["tabular-nums"],
  },
  priceRight: { flexShrink: 1, alignItems: "flex-end" },
  actionsRow: { flexDirection: "row", gap: 8 },
  primaryBtn: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.control,
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 12,
  },
  primaryBtnText: {
    color: stitchTokens.gold,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  secondaryBtn: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: stitchTokens.wineDark, fontSize: 14 },
  pressed: { opacity: 0.8 },
});
