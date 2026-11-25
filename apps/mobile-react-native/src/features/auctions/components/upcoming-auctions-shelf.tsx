import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText, Icon, formatVnd, radius, space, stitchTokens } from "../../../core/ui";
import { formatRemaining, waitingTime } from "../auctions-model";
import type { PublicAuctionSummary } from "../contracts";
import { AuctionCover } from "./auction-cover";
import { conditions as conditionLabels } from "../../shelf/contracts";

export interface UpcomingAuctionsShelfProps {
  readonly items: PublicAuctionSummary[];
  readonly now: number;
  readonly onOpenAuction: (id: string) => void;
}

export function UpcomingAuctionsShelf({
  items,
  now,
  onOpenAuction,
}: UpcomingAuctionsShelfProps) {
  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Icon name="clock" size={16} color={stitchTokens.wine} />
          <AppText kind="bold" style={styles.headerTitle}>Sắp mở phiên</AppText>
        </View>
        <View style={styles.badgeCount}>
          <AppText style={styles.badgeCountText}>{items.length} phiên</AppText>
        </View>
      </View>

      <AppText kind="small" style={styles.subtitle}>
        Đăng ký đặt cọc trước để tham gia khi phiên mở.
      </AppText>

      <ScrollView
        horizontal
        style={styles.scrollView}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollList}
      >
        {items.map((item) => {
          const waiting = waitingTime(item, now);
          const msUntilStart = Math.max(0, Date.parse(waiting.at) - now);
          const authors = item.book?.authors.join(", ");

          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Phiên sắp mở: ${item.title}`}
              onPress={() => onOpenAuction(item.id)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.coverFrame}>
                <AuctionCover
                  auctionId={item.id}
                  mediaId={item.book?.photos[0]?.id}
                  label={item.title}
                />
                <View style={styles.timerBadge}>
                  <Icon name="clock" size={11} color={stitchTokens.gold} />
                  <AppText style={styles.timerBadgeText}>
                    {waiting.label === "Hạn đăng ký"
                      ? `Hạn ĐK ${formatRemaining(msUntilStart)}`
                      : `Mở sau ${formatRemaining(msUntilStart)}`}
                  </AppText>
                </View>
              </View>

              <View style={styles.cardContent}>
                <AppText kind="bold" numberOfLines={2} style={styles.cardTitle}>
                  {item.title}
                </AppText>
                <AppText kind="small" numberOfLines={1} style={styles.cardMeta}>
                  {authors || (item.book ? conditionLabels[item.book.condition] : item.pointName)}
                </AppText>

                <View style={styles.footerRow}>
                  <View style={styles.priceCol}>
                    <AppText style={styles.priceLabel}>Khởi điểm</AppText>
                    <AppText kind="bold" style={styles.priceValue}>
                      {formatVnd(item.startPrice)}
                    </AppText>
                  </View>
                  {item.minBidders != null ? (
                    <View style={styles.regChip}>
                      <AppText style={styles.regChipText}>
                        {`${item.registeredCount ?? 0}/${item.minBidders}`}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: space.md,
    gap: 8,
  },
  headerRow: {
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: 16, color: stitchTokens.wineDark },
  badgeCount: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeCountText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  subtitle: {
    paddingHorizontal: space.lg,
    color: stitchTokens.brownMuted,
    lineHeight: 18,
  },
  scrollView: { flexGrow: 0 },
  scrollList: {
    paddingHorizontal: space.lg,
    gap: 12,
    paddingVertical: 4,
  },
  card: {
    width: 176,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
  },
  coverFrame: {
    height: 124,
    backgroundColor: stitchTokens.parchment,
    overflow: "hidden",
  },
  timerBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.wineDark,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  timerBadgeText: {
    color: stitchTokens.warmIvory,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  cardContent: {
    padding: 10,
    gap: 4,
    flex: 1,
    justifyContent: "space-between",
  },
  cardTitle: { color: stitchTokens.wineDark, fontSize: 13, lineHeight: 18 },
  cardMeta: { color: stitchTokens.brownMuted, fontSize: 12 },
  footerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 6,
  },
  priceCol: { flex: 1, minWidth: 0 },
  priceLabel: { fontSize: 11, color: stitchTokens.brownMuted },
  priceValue: {
    fontSize: 14,
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  regChip: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  regChipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  pressed: { opacity: 0.84 },
});
