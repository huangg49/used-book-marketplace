import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, formatVnd, stitchTokens } from "../../../core/ui";
import { conditions } from "../../shelf/contracts";
import { formatRemaining } from "../auctions-model";
import type { PublicAuctionSummary } from "../contracts";
import { AuctionCover } from "./auction-cover";

export interface AuctionCardProps {
  readonly item: PublicAuctionSummary;
  readonly remainingMs: number;
  readonly isSaved: boolean;
  readonly onToggleSave: () => void;
  readonly onPress: () => void;
  readonly onQuickBid: () => void;
}

export function AuctionCard({
  item,
  remainingMs,
  isSaved,
  onToggleSave,
  onPress,
  onQuickBid,
}: AuctionCardProps) {
  const price = item.currentPrice ?? item.startPrice;
  const authors = item.book?.authors.join(", ");

  return (
    <View style={styles.gridCell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.title}
        onPress={onPress}
        style={styles.gridCard}
      >
        {/* Cover Frame with Badges */}
        <View style={styles.cardCoverFrame}>
          <AuctionCover
            auctionId={item.id}
            mediaId={item.book?.photos[0]?.id}
            label={item.title}
          />

          {/* Live Timer Badge */}
          <View style={styles.cardTimerBadge}>
            <View style={styles.livePulseDot} />
            <AppText kind="small" style={styles.cardTimerText}>
              {formatRemaining(remainingMs)}
            </AppText>
          </View>

          {/* Bookmark/Favorite Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lưu vào danh sách"
            onPress={(e) => {
              e.stopPropagation();
              onToggleSave();
            }}
            style={styles.cardBookmarkBtn}
          >
            <Icon
              name="heart"
              size={14}
              color={isSaved ? stitchTokens.crimson : stitchTokens.wine}
              filled={isSaved}
            />
          </Pressable>

          {/* Condition Pill */}
          {item.book && (
            <View style={styles.cardConditionTag}>
              <AppText kind="small" style={styles.cardConditionText}>
                {conditions[item.book.condition]}
              </AppText>
            </View>
          )}
        </View>

        {/* Card Body */}
        <View style={styles.cardBody}>
          <View>
            <AppText kind="bold" style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </AppText>
            <AppText kind="small" style={styles.cardAuthor} numberOfLines={1}>
              {authors || item.pointName}
            </AppText>
          </View>

          <View style={{ gap: 4, marginTop: 4 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <AppText kind="small" style={styles.bidCountLabel}>
                Người trả giá:
              </AppText>
              <AppText kind="small" style={styles.bidCountValue}>
                {item.bidderCount}
              </AppText>
            </View>

            <AppText kind="bold" style={styles.cardPriceText}>
              {formatVnd(price)}
            </AppText>

            <AppText kind="small" style={styles.buyNowHint} numberOfLines={1}>
              {item.buyNowPrice !== null ? (
                <>
                  Mua ngay:{" "}
                  <AppText
                    kind="bold"
                    style={{ fontSize: 11, color: stitchTokens.wineDark }}
                  >
                    {formatVnd(item.buyNowPrice)}
                  </AppText>
                </>
              ) : (
                <>
                  Khởi điểm:{" "}
                  <AppText
                    kind="bold"
                    style={{ fontSize: 11, color: stitchTokens.subtleGray }}
                  >
                    {formatVnd(item.startPrice)}
                  </AppText>
                </>
              )}
            </AppText>

            {/* Quick Bid CTA Button */}
            <Pressable
              accessibilityRole="button"
              onPress={(e) => {
                e.stopPropagation();
                onQuickBid();
              }}
              style={({ pressed }) => [
                styles.cardQuickBidBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Icon name="gavel" size={13} color={stitchTokens.wineDark} />
              <AppText kind="bold" style={styles.cardQuickBidText}>
                Đấu +{formatVnd(item.step)}
              </AppText>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  gridCell: {
    width: "50%",
    padding: 5,
  },
  gridCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardCoverFrame: {
    width: "100%",
    aspectRatio: 4 / 5,
    backgroundColor: stitchTokens.parchment,
    position: "relative",
    overflow: "hidden",
  },
  cardTimerBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: stitchTokens.timerBadgeBg,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cardTimerText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.white,
  },
  cardBookmarkBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteAlpha90,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardConditionTag: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: stitchTokens.roseParchmentAlpha90,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cardConditionText: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  cardBody: {
    padding: 10,
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 13,
    color: stitchTokens.wineDark,
    lineHeight: 18,
  },
  cardAuthor: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    marginTop: 2,
  },
  bidCountLabel: {
    fontSize: 10,
    color: stitchTokens.subtleGray,
  },
  bidCountValue: {
    fontSize: 10,
    fontWeight: "600",
    color: stitchTokens.flashRed,
  },
  cardPriceText: {
    fontSize: 15,
    color: stitchTokens.wine,
  },
  buyNowHint: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
  },
  cardQuickBidBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: stitchTokens.gold,
    paddingVertical: 7,
    borderRadius: 6,
    marginTop: 4,
  },
  cardQuickBidText: {
    fontSize: 11,
    color: stitchTokens.wineDark,
  },
});
