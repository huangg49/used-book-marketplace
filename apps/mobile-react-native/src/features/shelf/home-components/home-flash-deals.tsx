import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, formatVnd, stitchTokens } from "../../../core/ui";
import {
  type LiveAuctionItem,
  FALLBACK_AUCTIONS,
} from "../home-mock-data";

export interface HomeLiveAuctionsProps {
  readonly items?: readonly LiveAuctionItem[];
  readonly onOpenAuction: (listingId: string) => void;
  readonly onSeeAllPress: () => void;
}

export function HomeLiveAuctions({
  items = FALLBACK_AUCTIONS,
  onOpenAuction,
  onSeeAllPress,
}: HomeLiveAuctionsProps) {
  // Live ticking countdown timer
  const [secondsLeft, setSecondsLeft] = useState(6322); // ~ 1h 45m 22s

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 7200));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = String(Math.floor(secondsLeft / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <View style={styles.container}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleWithCountdown}>
          <View style={styles.titleGroup}>
            <View style={styles.gavelCircle}>
              <Icon name="gavel" size={15} color={stitchTokens.white} />
            </View>
            <AppText kind="heading" style={styles.titleText}>
              ĐẤU GIÁ TRỰC TIẾP
            </AppText>
            <View style={styles.liveTag}>
              <View style={styles.livePulseDot} />
              <AppText kind="small" style={styles.liveTagText}>
                LIVE
              </AppText>
            </View>
          </View>

          {/* Countdown timer pills */}
          <View style={styles.countdownBox}>
            <View style={styles.pill}>
              <AppText kind="small" style={styles.pillText}>
                {hours}
              </AppText>
            </View>
            <AppText kind="small" style={styles.separator}>
              :
            </AppText>
            <View style={styles.pill}>
              <AppText kind="small" style={styles.pillText}>
                {minutes}
              </AppText>
            </View>
            <AppText kind="small" style={styles.separator}>
              :
            </AppText>
            <View style={styles.pill}>
              <AppText kind="small" style={styles.pillText}>
                {seconds}
              </AppText>
            </View>
          </View>
        </View>

        {/* See All CTA */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Xem tất cả phiên đấu giá trực tiếp"
          onPress={onSeeAllPress}
          style={styles.seeAllBtn}
        >
          <AppText kind="small" style={styles.seeAllText}>
            Xem tất cả
          </AppText>
          <Icon name="chevronRight" size={14} color={stitchTokens.stoneMuted} />
        </Pressable>
      </View>

      {/* Horizontal Cards Scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollList}
      >
        {items.map((item) => {
          const { listingId } = item;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. Giá dẫn đầu ${formatVnd(item.currentBid)}`}
              disabled={!listingId}
              onPress={listingId ? () => onOpenAuction(listingId) : undefined}
              style={({ pressed }) => [
                styles.dealCard,
                pressed && styles.cardPressed,
              ]}
            >
              {/* Cover with Auction Badge */}
              <View style={styles.coverWrapper}>
                <Image
                  source={{ uri: item.coverUrl }}
                  style={styles.coverImage}
                  resizeMode="cover"
                />

                {/* Top Rare/Condition Badge */}
                {item.conditionLabel ? (
                  <View style={styles.conditionBadge}>
                    <AppText kind="small" style={styles.conditionText}>
                      {item.conditionLabel}
                    </AppText>
                  </View>
                ) : null}

                {/* Live Gavel Overlay Badge */}
                <View style={styles.bidCountBadge}>
                  <Icon name="flame" size={10} color={stitchTokens.white} />
                  <AppText kind="small" style={styles.bidCountText}>
                    {item.statusText}
                  </AppText>
                </View>
              </View>

              {/* Price & Bid Progress */}
              <View style={styles.infoWrapper}>
                <View style={styles.priceRow}>
                  <AppText kind="small" style={styles.pricePrefix}>
                    Dẫn giá:
                  </AppText>
                  <AppText kind="shelfPrice" style={styles.dealPrice}>
                    {formatVnd(item.currentBid)}
                  </AppText>
                </View>

                {item.buyNowPrice ? (
                  <AppText kind="small" style={styles.buyNowText}>
                    Mua ngay: {formatVnd(item.buyNowPrice)}
                  </AppText>
                ) : (
                  <AppText kind="small" style={styles.startPriceText}>
                    Khởi điểm: {formatVnd(item.startPrice)}
                  </AppText>
                )}

                {/* Auction Bid Action Pill */}
                <View style={styles.actionPillBg}>
                  <Icon name="gavel" size={11} color={stitchTokens.white} />
                  <AppText kind="small" style={styles.actionPillText}>
                    Trả giá ngay
                  </AppText>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Backward compatible export for existing imports
export { HomeLiveAuctions as HomeFlashDeals };

const styles = StyleSheet.create({
  container: {
    backgroundColor: stitchTokens.white,
    marginTop: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: stitchTokens.canvasWhite,
    elevation: 2,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  titleWithCountdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  gavelCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wine,
    letterSpacing: 0.3,
  },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: stitchTokens.flashRedBg,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: stitchTokens.lightPink,
  },
  livePulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: stitchTokens.flashRed,
  },
  liveTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: stitchTokens.flashRed,
    letterSpacing: 0.5,
  },
  countdownBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  pill: {
    backgroundColor: stitchTokens.wineDark,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: {
    color: stitchTokens.white,
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "BeBold",
  },
  separator: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seeAllText: {
    fontSize: 11,
    color: stitchTokens.stoneMuted,
    fontWeight: "500",
  },
  scrollList: {
    paddingHorizontal: 12,
    gap: 10,
  },
  dealCard: {
    width: 116,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  coverWrapper: {
    width: 116,
    height: 146,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: stitchTokens.surfaceSoft,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    position: "relative",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  conditionBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: stitchTokens.scrimDark,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  conditionText: {
    color: stitchTokens.gold,
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 12,
  },
  bidCountBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: stitchTokens.wineScrim,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  bidCountText: {
    color: stitchTokens.white,
    fontSize: 8.5,
    fontWeight: "700",
    lineHeight: 11,
  },
  infoWrapper: {
    marginTop: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    flexWrap: "wrap",
  },
  pricePrefix: {
    fontSize: 9.5,
    color: stitchTokens.stoneMuted,
    fontWeight: "500",
  },
  dealPrice: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.wine,
    lineHeight: 16,
  },
  buyNowText: {
    fontSize: 9.5,
    color: stitchTokens.verifiedGreen,
    fontWeight: "600",
    marginTop: 1,
  },
  startPriceText: {
    fontSize: 9.5,
    color: stitchTokens.mediumGray,
    marginTop: 1,
  },
  actionPillBg: {
    backgroundColor: stitchTokens.wine,
    borderRadius: 4,
    marginTop: 5,
    paddingVertical: 3,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionPillText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: stitchTokens.white,
    lineHeight: 12,
  },
});
