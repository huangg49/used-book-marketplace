import { memo, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { AppText, Icon, Sheet, formatVnd, radius, space, stitchTokens } from "../../../core/ui";
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

const PREVIEW_LIMIT = 5;

function HistoryRow({
  event,
  mine,
  leading,
  status,
  stackAmount,
  isLast,
}: {
  event: PublicAuction["history"][number];
  mine: boolean;
  leading: boolean;
  status?: string;
  stackAmount: boolean;
  isLast: boolean;
}) {
  const name = mine ? "Bạn" : `Người trả giá #${event.bidderAlias}`;
  const timestamp = bidTime.format(new Date(event.at));
  const amount = formatVnd(event.price);

  return (
    <View
      accessible
      accessibilityLabel={[mine ? `Bạn, số ${event.bidderAlias}` : name, timestamp, amount, status].filter(Boolean).join(", ")}
      style={[
        styles.row,
        leading && styles.leaderRow,
        stackAmount && styles.stackedRow,
        isLast && styles.lastRow,
      ]}
    >
      <View style={[styles.bidder, stackAmount && styles.stackedBidder]}>
        <View style={[styles.alias, mine && styles.myAlias]}>
          <AppText
            kind="label"
            color={mine ? stitchTokens.goldLight : stitchTokens.wine}
            style={styles.aliasText}
          >
            #{event.bidderAlias}
          </AppText>
        </View>
        <View style={styles.identity}>
          <View style={styles.nameLine}>
            <AppText kind="bold" color={stitchTokens.darkWood} style={styles.bidderName}>
              {name}
            </AppText>
            {status ? (
              <View style={styles.leaderBadge}>
                <AppText style={styles.leaderBadgeText}>{status}</AppText>
              </View>
            ) : null}
          </View>
          <AppText kind="small" color={stitchTokens.brownMuted} style={styles.timeText}>
            {timestamp}
          </AppText>
        </View>
      </View>

      <View style={[styles.amount, stackAmount && styles.stackedAmount]}>
        <AppText kind="bold" color={leading ? stitchTokens.wine : stitchTokens.darkWood} style={styles.price}>
          {amount}
        </AppText>
      </View>
    </View>
  );
}

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
  const { width, fontScale } = useWindowDimensions();
  const stackAmount = width / fontScale < 300;
  const [allOpen, setAllOpen] = useState(false);
  const preview = history.slice(0, PREVIEW_LIMIT);
  const hasMore = history.length > PREVIEW_LIMIT;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <AppText kind="bold" accessibilityRole="header" style={styles.heading}>
          Diễn biến giá
        </AppText>
        {!sealedLive && history.length > 0 ? (
          <View style={styles.countPill}>
            <AppText style={styles.countPillText}>{history.length} lượt</AppText>
          </View>
        ) : null}
      </View>

      {sealedLive ? (
        <View style={styles.sealedNotice}>
          <Icon name="lock" size={16} color={stitchTokens.wine} />
          <AppText kind="small" color={stitchTokens.brownMuted} style={styles.identity}>
            Phiên đấu giá kín bảo mật các lượt trả giá cho tới khi phiên kết thúc. Giá khởi điểm {formatVnd(startPrice)}.
          </AppText>
        </View>
      ) : history.length === 0 ? (
        <AppText kind="small" color={stitchTokens.brownMuted} style={styles.emptyText}>
          Chưa có lượt trả giá nào. Giá khởi điểm là {formatVnd(startPrice)}.
        </AppText>
      ) : (
        <View style={styles.list} accessibilityLabel="Các lần giá thay đổi, mới nhất trước">
          {preview.map((event, index) => {
            const mine = event.bidderAlias === myAlias;
            const leading = index === 0 && event.bidderAlias === leaderAlias;
            const status = leading ? leaderStatus[state] : undefined;
            return (
              <HistoryRow
                key={`${event.at}:${event.bidderAlias}:${event.price}`}
                event={event}
                mine={mine}
                leading={leading}
                status={status}
                stackAmount={stackAmount}
                isLast={index === preview.length - 1}
              />
            );
          })}
          {hasMore ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setAllOpen(true)}
              style={({ pressed }) => [styles.moreBtn, pressed && styles.pressed]}
            >
              <AppText kind="bold" style={styles.moreBtnText}>
                Xem tất cả {history.length} lượt trả giá
              </AppText>
              <Icon name="chevronRight" size={16} color={stitchTokens.wine} />
            </Pressable>
          ) : null}
        </View>
      )}

      <AppText kind="small" color={stitchTokens.brownMuted} style={styles.footnote}>
        Người trả giá hiển thị ẩn danh; mức tự động luôn được giữ kín. Phiên đang chạy mô phỏng tại TP.HCM.
      </AppText>

      <Sheet
        visible={allOpen}
        onClose={() => setAllOpen(false)}
        title={`Diễn biến giá (${history.length} lượt)`}
      >
        <View style={styles.sheetList}>
          {history.map((event, index) => {
            const mine = event.bidderAlias === myAlias;
            const leading = index === 0 && event.bidderAlias === leaderAlias;
            const status = leading ? leaderStatus[state] : undefined;
            return (
              <HistoryRow
                key={`full:${event.at}:${event.bidderAlias}:${event.price}`}
                event={event}
                mine={mine}
                leading={leading}
                status={status}
                stackAmount={stackAmount}
                isLast={index === history.length - 1}
              />
            );
          })}
        </View>
      </Sheet>
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    gap: space.md,
    padding: space.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.whiteSurface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  heading: {
    color: stitchTokens.wineDark,
    fontSize: 16,
    lineHeight: 22,
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.parchment,
  },
  countPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  emptyText: {
    lineHeight: 20,
  },
  list: {
    gap: 2,
  },
  sheetList: {
    gap: 2,
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.borderWarm,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  leaderRow: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderBottomWidth: 0,
    marginBottom: 4,
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
  identity: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  bidderName: { fontSize: 14, lineHeight: 19 },
  timeText: { fontSize: 12, lineHeight: 16 },
  leaderBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: stitchTokens.wine,
  },
  leaderBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: stitchTokens.warmIvory,
    includeFontPadding: false,
  },
  alias: {
    minWidth: 34,
    minHeight: 34,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: stitchTokens.parchment,
  },
  myAlias: { backgroundColor: stitchTokens.wine },
  aliasText: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  amount: { alignItems: "flex-end", maxWidth: "46%" },
  stackedAmount: { maxWidth: "100%" },
  price: {
    fontSize: 15,
    lineHeight: 20,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  moreBtn: {
    marginTop: space.xs,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: space.md,
  },
  moreBtnText: {
    color: stitchTokens.wine,
    fontSize: 13,
  },
  pressed: { opacity: 0.78 },
  sealedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 18,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
  },
});
