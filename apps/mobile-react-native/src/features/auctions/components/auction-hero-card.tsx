import { Image, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, formatVnd, stitchTokens } from "../../../core/ui";
import type { ExtendedAuctionItem } from "../auctions-data";

export interface AuctionHeroCardProps {
  readonly auction: ExtendedAuctionItem;
  readonly flashHours: string;
  readonly flashMinutes: string;
  readonly flashSecs: string;
  readonly onQuickBid: () => void;
  readonly onOpenLive: () => void;
}

export function AuctionHeroCard({
  auction,
  flashHours,
  flashMinutes,
  flashSecs,
  onQuickBid,
  onOpenLive,
}: AuctionHeroCardProps) {
  const currentPrice = auction.currentPrice ?? auction.startPrice;
  const nextBid = currentPrice + auction.step;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.heroCard}>
        {/* Top Banner Strip */}
        <View style={styles.heroTopBanner}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="gavel" size={17} color={stitchTokens.gold} />
            <AppText kind="bold" style={styles.heroTopBannerText}>
              SẮP GÕ BÚA • PHIÊN VÀNG
            </AppText>
          </View>
          <View style={styles.heroTimerBox}>
            <View style={styles.livePulseDot} />
            <AppText kind="bold" style={styles.heroTimerText}>
              {flashHours}:{flashMinutes}:{flashSecs}
            </AppText>
          </View>
        </View>

        {/* Showcase Container */}
        <View style={styles.heroContent}>
          <View
            style={{
              flexDirection: "row",
              gap: 14,
              alignItems: "flex-start",
            }}
          >
            {/* Book Cover */}
            <View style={styles.heroCoverBox}>
              {auction.coverUrl ? (
                <Image
                  source={{ uri: auction.coverUrl }}
                  style={styles.heroCoverImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.heroCoverPlaceholder}>
                  <Icon name="book" size={32} color={stitchTokens.wine} />
                </View>
              )}
              <View style={styles.heroCoverTag}>
                <AppText kind="small" style={styles.heroCoverTagText}>
                  {auction.conditionTag ?? "Độc bản 1938"}
                </AppText>
              </View>
            </View>

            {/* Info Column */}
            <View
              style={{
                flex: 1,
                minWidth: 0,
                justifyContent: "space-between",
                height: 144,
              }}
            >
              <View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    marginBottom: 2,
                  }}
                >
                  <Icon name="pin" size={13} color={stitchTokens.goldBronze} />
                  <AppText
                    kind="small"
                    style={styles.heroLocationText}
                    numberOfLines={1}
                  >
                    {auction.location ?? auction.pointName}
                  </AppText>
                </View>
                <AppText kind="bold" style={styles.heroTitle} numberOfLines={2}>
                  {auction.title}
                </AppText>
                <AppText
                  kind="small"
                  style={styles.heroAuthor}
                  numberOfLines={1}
                >
                  {auction.author}
                </AppText>
              </View>

              {/* Price and Bidding Stats Box */}
              <View style={styles.heroPriceStatsBox}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <AppText
                    kind="small"
                    style={{ fontSize: 11, color: stitchTokens.subtleGray }}
                  >
                    Giá cao nhất:
                  </AppText>
                  <AppText kind="bold" style={styles.heroPriceText}>
                    {formatVnd(currentPrice)}
                  </AppText>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <Icon
                      name="flame"
                      size={13}
                      color={stitchTokens.flashRed}
                    />
                    <AppText
                      kind="small"
                      style={{
                        fontSize: 11,
                        color: stitchTokens.flashRed,
                        fontWeight: "600",
                      }}
                    >
                      {auction.bidderCount} lượt đấu
                    </AppText>
                  </View>
                  <AppText
                    kind="small"
                    style={{ fontSize: 10, color: stitchTokens.subtleGray }}
                  >
                    Bước: +{formatVnd(auction.step)}
                  </AppText>
                </View>
              </View>
            </View>
          </View>

          {/* FOMO Thermometer Bar */}
          <View style={styles.thermometerTrack}>
            <View style={styles.thermometerFill} />
          </View>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <AppText
              kind="small"
              style={{
                fontSize: 11,
                color: stitchTokens.flashRed,
                fontWeight: "600",
              }}
            >
              🔥 Cạnh tranh cao ({auction.viewersCount ?? 3} người đang canh)
            </AppText>
            <AppText
              kind="small"
              style={{
                fontSize: 11,
                color: stitchTokens.wine,
                fontWeight: "500",
              }}
            >
              Cọc an toàn: {formatVnd(auction.depositAmount ?? 200000)}
            </AppText>
          </View>

          {/* Hero Action CTA Buttons */}
          <View style={styles.heroActionsRow}>
            <Pressable
              accessibilityRole="button"
              onPress={onQuickBid}
              style={({ pressed }) => [
                styles.heroQuickBidBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Icon name="plus" size={16} color={stitchTokens.wineDark} />
              <AppText kind="bold" style={styles.heroQuickBidBtnText}>
                Nâng giá: {formatVnd(nextBid)}
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onOpenLive}
              style={({ pressed }) => [
                styles.heroLiveFloorBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <AppText kind="bold" style={styles.heroLiveFloorBtnText}>
                Vào Sàn Live
              </AppText>
              <Icon name="arrow" size={16} color={stitchTokens.white} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  heroCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    overflow: "hidden",
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  heroTopBanner: {
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroTopBannerText: {
    fontSize: 13,
    color: stitchTokens.gold,
    letterSpacing: 0.5,
  },
  heroTimerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: stitchTokens.blackAlpha25,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  heroTimerText: {
    fontSize: 12,
    color: stitchTokens.gold,
    fontFamily: "monospace",
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.flashRed,
  },
  heroContent: {
    padding: 14,
    gap: 12,
  },
  heroCoverBox: {
    width: 108,
    height: 144,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    backgroundColor: stitchTokens.parchment,
  },
  heroCoverImage: {
    width: "100%",
    height: "100%",
  },
  heroCoverPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCoverTag: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: stitchTokens.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  heroCoverTagText: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    textTransform: "uppercase",
  },
  heroLocationText: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
  },
  heroTitle: {
    fontSize: 16,
    color: stitchTokens.wineDark,
    lineHeight: 21,
  },
  heroAuthor: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    marginTop: 2,
  },
  heroPriceStatsBox: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 8,
    padding: 8,
    gap: 3,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  heroPriceText: {
    fontSize: 17,
    color: stitchTokens.wine,
  },
  thermometerTrack: {
    width: "100%",
    height: 6,
    backgroundColor: stitchTokens.cardBorder,
    borderRadius: 3,
    overflow: "hidden",
  },
  thermometerFill: {
    width: "85%",
    height: "100%",
    backgroundColor: stitchTokens.flashRed,
    borderRadius: 3,
  },
  heroActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  heroQuickBidBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: stitchTokens.gold,
    paddingVertical: 11,
    borderRadius: 8,
    shadowColor: stitchTokens.goldBronze,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  heroQuickBidBtnText: {
    fontSize: 13,
    color: stitchTokens.wineDark,
  },
  heroLiveFloorBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: stitchTokens.wine,
    paddingVertical: 11,
    borderRadius: 8,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  heroLiveFloorBtnText: {
    fontSize: 13,
    color: stitchTokens.white,
  },
});
