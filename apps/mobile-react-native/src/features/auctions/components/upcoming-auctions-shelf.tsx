import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, formatVnd, stitchTokens } from "../../../core/ui";
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
          <Icon name="clock" size={16} color={stitchTokens.wineDark} />
          <AppText kind="bold" style={styles.headerTitle}>
            Sắp mở phiên
          </AppText>
          <View style={styles.badgeCount}>
            <AppText kind="small" style={styles.badgeCountText}>
              {items.length} phiên sắp mở
            </AppText>
          </View>
        </View>
      </View>
      <AppText kind="small" style={styles.subtitle}>
        Sách đã qua kiểm định. Đăng ký và đặt cọc để giữ chỗ; phiên mở theo giờ người bán hẹn khi đủ số người tối thiểu. Không đủ người trước hạn thì phiên bị hủy và hoàn cọc.
      </AppText>

      <ScrollView
        horizontal
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
              style={({ pressed }) => [
                styles.card,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <View style={styles.coverFrame}>
                <AuctionCover
                  auctionId={item.id}
                  mediaId={item.book?.photos[0]?.id}
                  label={item.title}
                />
                <View style={styles.timerBadge}>
                  <Icon name="clock" size={11} color={stitchTokens.wineDark} />
                  <AppText kind="small" style={styles.timerBadgeText}>
                    {waiting.label === "Hạn đăng ký"
                      ? `Hạn ĐK ${formatRemaining(msUntilStart)}`
                      : `Mở sau ${formatRemaining(msUntilStart)}`}
                  </AppText>
                </View>
                {item.book && (
                  <View style={styles.conditionTag}>
                    <AppText kind="small" style={styles.conditionTagText}>
                      {conditionLabels[item.book.condition] ?? item.book.condition}
                    </AppText>
                  </View>
                )}
              </View>

              <View style={styles.cardContent}>
                <AppText kind="bold" numberOfLines={1} style={styles.cardTitle}>
                  {item.title}
                </AppText>
                <AppText kind="small" numberOfLines={1} style={styles.cardAuthor}>
                  {authors || item.pointName}
                </AppText>

                <View style={styles.priceRow}>
                  <View>
                    <AppText kind="small" style={styles.priceLabel}>
                      Khởi điểm
                    </AppText>
                    <AppText kind="bold" style={styles.priceValue}>
                      {formatVnd(item.startPrice)}
                    </AppText>
                  </View>
                  {item.minBidders != null ? (
                    <View style={styles.buyNowChip}>
                      <Icon name="person" size={10} color={stitchTokens.wineDark} />
                      <AppText kind="small" style={styles.buyNowText}>
                        {`${item.registeredCount ?? 0}/${item.minBidders}`}
                      </AppText>
                    </View>
                  ) : item.buyNowPrice !== null ? (
                    <View style={styles.buyNowChip}>
                      <Icon name="bolt" size={10} color={stitchTokens.wineDark} />
                      <AppText kind="small" style={styles.buyNowText}>
                        {formatVnd(item.buyNowPrice)}
                      </AppText>
                    </View>
                  ) : null}
                </View>

                <View style={styles.pointRow}>
                  <Icon name="pin" size={11} color={stitchTokens.subtleGray} />
                  <AppText kind="small" numberOfLines={1} style={styles.pointText}>
                    {item.pointName}
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

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    backgroundColor: stitchTokens.roseWarmSurface,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  headerRow: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 15,
    color: stitchTokens.wineDark,
  },
  badgeCount: {
    backgroundColor: stitchTokens.goldLight,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeCountText: {
    fontSize: 11,
    color: stitchTokens.wineDark,
    fontWeight: "700",
  },
  subtitle: {
    paddingHorizontal: 16,
    marginTop: 3,
    marginBottom: 10,
    fontSize: 12,
    color: stitchTokens.subtleGray,
    lineHeight: 16,
  },
  scrollList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: 160,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  coverFrame: {
    width: "100%",
    height: 125,
    backgroundColor: stitchTokens.parchment,
    position: "relative",
  },
  timerBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: stitchTokens.peachBorder,
  },
  timerBadgeText: {
    fontSize: 10,
    color: stitchTokens.wineDark,
    fontWeight: "700",
  },
  conditionTag: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  conditionTagText: {
    fontSize: 9,
    color: stitchTokens.wineDark,
    fontWeight: "600",
  },
  cardContent: {
    padding: 10,
    gap: 4,
  },
  cardTitle: {
    fontSize: 12,
    color: stitchTokens.deepCocoa,
  },
  cardAuthor: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  priceLabel: {
    fontSize: 10,
    color: stitchTokens.subtleGray,
  },
  priceValue: {
    fontSize: 12,
    color: stitchTokens.wineDark,
  },
  buyNowChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  buyNowText: {
    fontSize: 10,
    color: stitchTokens.wineDark,
    fontWeight: "700",
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  pointText: {
    fontSize: 10,
    color: stitchTokens.subtleGray,
    flex: 1,
  },
});
