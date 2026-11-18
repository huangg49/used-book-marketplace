import { memo } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { AppText, Icon, formatVnd, radius, space, stitchTokens } from "../../../core/ui";
import type { AuctionState, PublicAuction } from "../contracts";

const leaderStatus: Partial<Record<AuctionState, string>> = {
  Active: "Đang dẫn",
  AwaitingWinnerPayment: "Giá chốt",
  Sold: "Giá chốt",
  OnHold: "Dẫn khi tạm dừng",
  Cancelled: "Dẫn khi hủy",
  PaymentExpired: "Giá thắng",
};

const bidTime = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  day: "2-digit",
  month: "2-digit",
});

export const AuctionBidHistory = memo(function AuctionBidHistory({
  sealedLive,
  history,
  state,
  leaderAlias,
  myAlias,
  startPrice,
}: {
  sealedLive: boolean;
  history: PublicAuction["history"];
  state: AuctionState;
  leaderAlias: number | null;
  myAlias: number | null;
  startPrice: number;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const stackAmount = width / fontScale < 300;

  return (
    <View style={styles.section}>
      <AppText kind="bookHeading" accessibilityRole="header" color={stitchTokens.darkWood}>
        Diễn biến giá
      </AppText>

      {sealedLive ? (
        <View style={styles.sealedNotice}>
          <Icon name="lock" size={16} color={stitchTokens.wine} />
          <AppText kind="small" color={stitchTokens.brownMuted} style={styles.identity}>
            Phiên đấu giá kín bảo mật các lượt trả giá cho tới khi phiên kết thúc.
            {" "}Giá khởi điểm {formatVnd(startPrice)}.
          </AppText>
        </View>
      ) : history.length === 0 ? (
        <AppText kind="small" color={stitchTokens.brownMuted}>
          Chưa có lượt trả giá nào. Giá khởi điểm là {formatVnd(startPrice)}.
        </AppText>
      ) : (
        <ScrollView
          nestedScrollEnabled
          alwaysBounceVertical={false}
          persistentScrollbar
          style={[styles.list, { maxHeight: Math.min(350, Math.max(200, height * 0.48)) }]}
          contentContainerStyle={styles.listContent}
          accessibilityLabel="Các lần giá thay đổi, mới nhất trước"
        >
          {history.map((event, index) => {
            const mine = event.bidderAlias === myAlias;
            const leading = index === 0 && event.bidderAlias === leaderAlias;
            const status = leading ? leaderStatus[state] : undefined;
            const name = mine ? "Bạn" : `Người trả giá #${event.bidderAlias}`;
            const timestamp = bidTime.format(new Date(event.at));
            const amount = formatVnd(event.price);

            return (
              <View
                key={`${event.at}:${event.bidderAlias}:${event.price}`}
                accessible
                accessibilityLabel={[mine ? `Bạn, số ${event.bidderAlias}` : name, timestamp, amount, status].filter(Boolean).join(", ")}
                style={[
                  styles.row,
                  leading && styles.leaderRow,
                  stackAmount && styles.stackedRow,
                ]}
              >
                <View style={[styles.bidder, stackAmount && styles.stackedBidder]}>
                  <View style={[styles.alias, mine && styles.myAlias]}>
                    <AppText kind="label" color={mine ? stitchTokens.goldLight : stitchTokens.wine} style={styles.aliasText}>
                      #{event.bidderAlias}
                    </AppText>
                  </View>
                  <View style={styles.identity}>
                    <AppText kind="bold" color={stitchTokens.darkWood}>{name}</AppText>
                    <AppText kind="small" color={stitchTokens.brownMuted}>{timestamp}</AppText>
                  </View>
                </View>

                <View style={[styles.amount, stackAmount && styles.stackedAmount]}>
                  <AppText kind="bold" color={stitchTokens.darkWood} style={styles.price}>
                    {amount}
                  </AppText>
                  {status && (
                    <AppText kind="small" color={stitchTokens.wine} style={styles.price}>
                      {status}
                    </AppText>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.notes}>
        <AppText kind="small" color={stitchTokens.brownMuted}>
          Người trả giá được hiển thị bằng số thứ tự ẩn danh. Mức đặt giá tự động
          của mỗi người không bao giờ được công khai.
        </AppText>
        <AppText kind="small" color={stitchTokens.brownMuted}>
          Điểm giao nhận và phiên đấu giá đang chạy ở chế độ mô phỏng tại TP.HCM.
        </AppText>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card * 2,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
  },
  list: { flexGrow: 0 },
  listContent: { paddingEnd: space.xs },
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderStartWidth: 3,
    borderStartColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.borderWarm,
  },
  leaderRow: {
    backgroundColor: stitchTokens.biscuit,
    borderStartColor: stitchTokens.wine,
  },
  stackedRow: { flexDirection: "column", alignItems: "stretch" },
  bidder: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    gap: space.sm,
  },
  stackedBidder: { flex: 0 },
  identity: { flex: 1, gap: space.xs },
  alias: {
    minWidth: 34,
    minHeight: 34,
    paddingHorizontal: space.xs,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.biscuit,
  },
  myAlias: { backgroundColor: stitchTokens.wine },
  aliasText: { fontVariant: ["tabular-nums"] },
  amount: { alignItems: "flex-end", maxWidth: "48%", gap: space.xs },
  stackedAmount: { maxWidth: "100%" },
  price: { textAlign: "right", fontVariant: ["tabular-nums"] },
  sealedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.control,
    backgroundColor: stitchTokens.biscuit,
  },
  notes: {
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
  },
});
