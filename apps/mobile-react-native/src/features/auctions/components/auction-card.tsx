import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, formatVnd, radius, stitchTokens } from "../../../core/ui";
import { conditions } from "../../shelf/contracts";
import { formatRemaining, isSealedFormat } from "../auctions-model";
import type { PublicAuctionSummary } from "../contracts";
import { AuctionCover } from "./auction-cover";

export interface AuctionCardProps {
  readonly item: PublicAuctionSummary;
  readonly remainingMs: number;
  readonly isSaved?: boolean;
  readonly onToggleSave?: () => void;
  readonly onPress: () => void;
  readonly onQuickBid: () => void;
}

export function AuctionCard({
  item,
  remainingMs,
  onPress,
  onQuickBid,
}: AuctionCardProps) {
  const formatType = item.auctionType ?? "English";
  const isDutch = formatType === "Dutch";
  const isSealed = isSealedFormat(item);
  const price = isDutch
    ? (item.dutchPrice ?? item.dutchTopPrice ?? item.buyNowPrice ?? item.startPrice)
    : isSealed
      ? item.startPrice
      : (item.currentPrice ?? item.startPrice);
  const waitingReg = item.minBidders != null && (item.registeredCount ?? 0) < item.minBidders;
  const conditionText = item.book ? conditions[item.book.condition] : null;
  const authors = item.book?.authors.join(", ");

  return (
    <View style={styles.cell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.title}
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        {/* Cover Frame: max 2 quiet badges so the book cover stays legible */}
        <View style={styles.coverFrame}>
          <AuctionCover
            auctionId={item.id}
            mediaId={item.book?.photos[0]?.id}
            label={item.title}
          />

          <View style={styles.timerBadge}>
            <View style={styles.liveDot} />
            <AppText style={styles.timerText}>{formatRemaining(remainingMs)}</AppText>
          </View>

          {(isDutch || isSealed) ? (
            <View style={styles.formatTag}>
              <Icon name={isDutch ? "flame" : "lock"} size={10} color={stitchTokens.gold} />
              <AppText style={styles.formatText}>
                {isDutch ? "Giảm dần" : formatType === "SealedSecond" ? "Kín #2" : "Kín #1"}
              </AppText>
            </View>
          ) : null}
        </View>

        {/* Body */}
        <View style={styles.body}>
          <View style={styles.topText}>
            <AppText kind="bold" style={styles.title} numberOfLines={2}>
              {item.title}
            </AppText>
            <AppText kind="small" style={styles.subtitle} numberOfLines={1}>
              {[conditionText, authors || item.pointName].filter(Boolean).join(" · ")}
            </AppText>
          </View>

          <View style={styles.bottomBlock}>
            <View style={styles.priceBlock}>
              <AppText kind="bold" style={styles.price}>
                {formatVnd(price)}
              </AppText>
              <AppText kind="small" style={styles.metaLine} numberOfLines={1}>
                {waitingReg
                  ? `Đăng ký ${item.registeredCount ?? 0}/${item.minBidders}`
                  : isDutch
                    ? `Sàn ${formatVnd(item.startPrice)}`
                    : isSealed
                      ? `Bước +${formatVnd(item.step)}`
                      : item.buyNowPrice !== null
                        ? `Mua ngay ${formatVnd(item.buyNowPrice)}`
                        : `${item.bidderCount} người trả giá`}
              </AppText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mở phiên ${item.title}`}
              onPress={(e) => {
                e.stopPropagation();
                if (isDutch || isSealed || waitingReg || item.minBidders != null) {
                  onPress();
                } else {
                  onQuickBid();
                }
              }}
              style={({ pressed }) => [styles.ctaBtn, pressed && styles.pressed]}
            >
              <AppText kind="bold" style={styles.ctaText}>
                {isDutch
                  ? "Xem giá giảm"
                  : isSealed
                    ? "Gửi giá kín"
                    : waitingReg
                      ? "Đăng ký cọc"
                      : "Trả giá"}
              </AppText>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: "48.5%",
  },
  card: {
    flex: 1,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
  },
  coverFrame: {
    height: 156,
    backgroundColor: stitchTokens.parchment,
    overflow: "hidden",
  },
  timerBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.wineDark,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: stitchTokens.gold },
  timerText: {
    color: stitchTokens.warmIvory,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  formatTag: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  formatText: {
    color: stitchTokens.gold,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    includeFontPadding: false,
  },
  body: {
    flex: 1,
    padding: 10,
    gap: 8,
    justifyContent: "space-between",
  },
  topText: { gap: 3 },
  title: {
    fontSize: 14,
    lineHeight: 19,
    color: stitchTokens.wineDark,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: stitchTokens.brownMuted,
  },
  bottomBlock: { gap: 8 },
  priceBlock: { gap: 2 },
  price: {
    fontSize: 16,
    lineHeight: 20,
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  metaLine: {
    fontSize: 12,
    lineHeight: 16,
    color: stitchTokens.brownMuted,
    fontVariant: ["tabular-nums"],
  },
  ctaBtn: {
    minHeight: 40,
    borderRadius: radius.control,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  ctaText: {
    fontSize: 13,
    color: stitchTokens.wineDark,
  },
  pressed: { opacity: 0.8 },
});
