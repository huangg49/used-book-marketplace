import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, StatePanel, formatVnd, stitchTokens } from "../../../core/ui";
import type { PublicAuctionSummary } from "../../auctions/contracts";
import { AuctionCover } from "../../auctions/components/auction-cover";
import { formatRemaining } from "../../auctions/auctions-model";
import { useForeground } from "../../../core/hooks/use-foreground";

export interface HomeLiveAuctionsProps {
  readonly items: readonly PublicAuctionSummary[];
  readonly serverTime?: string;
  readonly loading?: boolean;
  readonly error?: boolean;
  readonly onRetry?: () => void;
  readonly onOpenAuction: (auctionId: string) => void;
  readonly onSeeAllPress: () => void;
}

export function HomeLiveAuctions({
  items, serverTime, loading, error, onRetry,
  onOpenAuction,
  onSeeAllPress,
}: HomeLiveAuctionsProps) {
  const active = useForeground();
  const anchor = useRef<{ source: string; local: number } | null>(null);
  const [clock, setClock] = useState({ source: serverTime, now: serverTime ? Date.parse(serverTime) : 0 });
  useEffect(() => {
    if (!active || !serverTime || !items.length) return;
    if (anchor.current?.source !== serverTime) anchor.current = { source: serverTime, local: Date.now() };
    const local = anchor.current.local;
    const timer = setInterval(() => setClock({ source: serverTime, now: Date.parse(serverTime) + Math.max(0, Date.now() - local) }), 1000);
    return () => clearInterval(timer);
  }, [active, serverTime, items.length]);
  const now = clock.source === serverTime ? clock.now : (serverTime ? Date.parse(serverTime) : 0);

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
            {items.length > 0 ? <View style={styles.liveTag}>
              <View style={styles.livePulseDot} />
              <AppText kind="small" style={styles.liveTagText}>
                LIVE
              </AppText>
            </View> : null}
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

      {loading && !items.length ? <StatePanel loading title="Đang tải phiên đấu giá…" /> : null}
      {error ? <StatePanel title="Chưa tải được phiên đấu giá" action={onRetry ? { label: "Thử lại", onPress: onRetry } : undefined} /> : null}
      {!loading && !error && !items.length ? <StatePanel title="Chưa có phiên đang diễn ra" message="Bạn có thể xem các phiên sắp mở trong mục Đấu giá." /> : null}
      {/* Horizontal Cards Scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollList}
      >
        {items.map((item) => {
          // Placeholder cards have no real auction behind them.
          const real = !!item.listingId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. Giá dẫn đầu ${formatVnd((item.currentPrice ?? item.startPrice))}`}
              disabled={!real}
              onPress={real ? () => onOpenAuction(item.id) : undefined}
              style={({ pressed }) => [
                styles.dealCard,
                pressed && styles.cardPressed,
              ]}
            >
              {/* Cover with Auction Badge */}
              <View style={styles.coverWrapper}>
                <AuctionCover auctionId={item.id} mediaId={item.book?.photos[0]?.id} label={item.title} />

                {/* Live Gavel Overlay Badge */}
                <View style={styles.bidCountBadge}>
                  <Icon name="flame" size={10} color={stitchTokens.white} />
                  <AppText kind="small" style={styles.bidCountText}>
                    {item.bidderCount} lượt đấu
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
                    {formatVnd((item.currentPrice ?? item.startPrice))}
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

                <AppText kind="small" style={styles.startPriceText}>
                  {now >= Date.parse(item.endAt) ? "Đã kết thúc" : `Còn ${formatRemaining(Date.parse(item.endAt) - now)}`}
                </AppText>
                {/* Auction Bid Action Pill */}
                <View style={styles.actionPillBg}>
                  <Icon name="gavel" size={11} color={stitchTokens.white} />
                  <AppText kind="small" style={styles.actionPillText}>
                    Xem phiên đấu giá
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
