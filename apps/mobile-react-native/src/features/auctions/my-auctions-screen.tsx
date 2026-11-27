import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Button,
  Icon,
  Notice,
  Screen,
  StatePanel,
  WineHeader,
  colors,
  formatVnd,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import { conditions } from "../shelf/contracts";
import { useAuctionNow } from "./use-auction-now";
import {
  AUCTION_MIN_BIDDERS_FLOOR,
  advanceDemoAuction,
  canReschedule,
  closeReasonText,
  formatRemaining,
  isOpen,
  isSealedFormat,
  isScheduled,
  myAuctionsOptions,
  openTimeOf,
  waitingForRegistrants,
  waitingTime,
  type MyAuctionView,
} from "./auctions-model";
import { ScheduleAuctionSheet } from "./components";
import { AuctionCover } from "./components/auction-cover";
import { DemoSkipButton } from "./components/demo-skip-button";
import type { MyAuctionItem } from "./contracts";

const VIEWS: { value: MyAuctionView; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "active", label: "Đang mở" },
  { value: "upcoming", label: "Sắp mở" },
  { value: "payment", label: "Cần thanh toán" },
  { value: "selling", label: "Sách tôi bán" },
];

const time = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });

export function MyAuctionsScreen({
  userId,
  initialView = "all",
}: {
  userId: string;
  initialView?: MyAuctionView;
}) {
  const { client } = useSession();
  const foreground = useForeground();
  const [view, setView] = useState<MyAuctionView>(initialView);
  const result = useInfiniteQuery({
    ...myAuctionsOptions(client, userId, view),
    enabled: foreground,
    refetchInterval: foreground ? 8_000 : false,
  });
  const items = result.data?.pages.flatMap((page) => page.items) ?? [];

  // Dedicated payment queue query so the urgent banner stays accurate regardless of active tab
  const paymentQuery = useInfiniteQuery({
    ...myAuctionsOptions(client, userId, "payment"),
    enabled: foreground,
    refetchInterval: foreground ? 8_000 : false,
  });
  const paymentCount =
    paymentQuery.data?.pages.flatMap((p) => p.items).length ?? 0;

  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MyAuctionItem | null>(null);
  const now = useAuctionNow(result.data?.pages[0]?.serverTime, foreground, 30_000);
  const edited = editing?.auction;

  return (
    <Screen
      appearance="paper"
      canvasColor={stitchTokens.creamBg}
      headerExtendsToStatusBar
      header={
        <WineHeader
          title="Phiên của tôi"
          subtitle={
            paymentCount > 0
              ? `${paymentCount} phiên chờ bạn thanh toán`
              : "Theo dõi trả giá, thắng giải và sách gửi bán"
          }
          onBack={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/auctions");
          }}
          rightIcon="plus"
          rightLabel="Gửi sách đấu giá"
          onRightPress={() => router.push("/send-to-auction")}
        />
      }
      footer={<MemberNavigation current="/auctions" />}
      footerAppearance="navigation"
    >
      <View style={styles.body}>
        {/* Urgent Payment Banner */}
        {paymentCount > 0 && view !== "payment" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Bạn có ${paymentCount} phiên cần thanh toán. Bấm để xem.`}
            onPress={() => setView("payment")}
            style={({ pressed }) => [styles.paymentBanner, pressed && styles.pressed]}
          >
            <View style={styles.paymentBannerIcon}>
              <Icon name="clock" size={16} color={stitchTokens.flashRed} />
            </View>
            <View style={styles.flexOne}>
              <AppText kind="bold" style={styles.paymentBannerTitle}>
                {`Cần thanh toán ${paymentCount} phiên thắng`}
              </AppText>
              <AppText kind="small" color={stitchTokens.brownMuted}>
                Hoàn tất từ ví trước hạn chót để nhận sách
              </AppText>
            </View>
            <Icon name="chevronRight" size={16} color={stitchTokens.wine} />
          </Pressable>
        ) : null}

        {/* Single Unified Horizontal Tab Bar (flexGrow: 0 prevents Android stretch) */}
        <ScrollView
          horizontal
          style={styles.tabsScrollView}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
          accessibilityRole="tablist"
        >
          {VIEWS.map((option) => {
            const isSelected = view === option.value;
            const showPayBadge = option.value === "payment" && paymentCount > 0;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="tab"
                accessibilityLabel={`Lọc: ${option.label}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => setView(option.value)}
                style={({ pressed }) => [
                  styles.tabPill,
                  isSelected ? styles.tabPillActive : styles.tabPillInactive,
                  pressed && styles.pressed,
                ]}
              >
                <AppText
                  style={[
                    styles.tabText,
                    isSelected ? styles.tabTextActive : styles.tabTextInactive,
                  ]}
                >
                  {showPayBadge ? `${option.label} (${paymentCount})` : option.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Loading / Error / Empty States */}
        {result.isPending ? (
          <StatePanel wine loading title="Đang tải phiên của bạn…" />
        ) : null}

        {result.error ? (
          <View style={styles.stackSm}>
            <Notice tone="error">{presentError(result.error).message}</Notice>
            <Button
              wine
              secondary
              title="Thử tải lại"
              busy={result.isFetching}
              onPress={() => void result.refetch()}
            />
          </View>
        ) : null}

        {result.isSuccess && items.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Icon name="gavel" size={26} color={stitchTokens.wine} />
            </View>
            <AppText kind="bold" style={styles.emptyTitle}>
              Chưa có phiên nào ở mục này
            </AppText>
            <AppText kind="small" style={styles.emptyDesc}>
              Các phiên bạn trả giá, thắng giải hoặc sách gửi đấu giá sẽ hiển thị tại đây.
            </AppText>
            <Button
              wine
              title="Khám phá phiên đang mở"
              onPress={() => router.push("/auctions")}
            />
          </View>
        ) : null}

        {/* Auction Rows */}
        {items.length > 0 ? (
          <View style={styles.list}>
            {items.map((item) => (
              <Row
                key={item.auction.id}
                item={item}
                now={now}
                onEdit={() => setEditing(item)}
              />
            ))}
          </View>
        ) : null}

        {/* Pagination directly below list */}
        {result.hasNextPage ? (
          <Button
            wine
            secondary
            title="Xem thêm phiên cũ hơn"
            busy={result.isFetchingNextPage}
            onPress={() => void result.fetchNextPage()}
          />
        ) : null}
      </View>

      <ScheduleAuctionSheet
        key={edited ? `${edited.id}:${edited.version}` : "none"}
        visible={!!edited}
        title={edited?.title ?? ""}
        target={
          edited
            ? {
                kind: "reschedule",
                auctionId: edited.id,
                version: edited.version!,
                live: !isScheduled(edited, now),
                startAt: openTimeOf(edited),
                endAt: new Date(
                  Date.parse(openTimeOf(edited)) +
                    Date.parse(edited.endAt) -
                    Date.parse(edited.startAt),
                ).toISOString(),
                latestStartAt: edited.latestStartAt ?? null,
              }
            : null
        }
        onClose={() => setEditing(null)}
        onDone={() =>
          void queryClient.invalidateQueries({ queryKey: ["my-auctions", userId] })
        }
      />
    </Screen>
  );
}

function Row({
  item,
  now,
  onEdit,
}: {
  item: MyAuctionItem;
  now: number;
  onEdit: () => void;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const { auction } = item;
  const open = isOpen(auction, now);
  const scheduled = isScheduled(auction, now);
  const waitingReg = waitingForRegistrants(auction, now);
  const sealed = isSealedFormat(auction);
  const isDutch = auction.auctionType === "Dutch";
  const formatLabel = isDutch
    ? "Giảm dần"
    : auction.auctionType === "SealedFirst"
      ? "Giá kín #1"
      : auction.auctionType === "SealedSecond"
        ? "Giá kín #2"
        : "Trả giá lên";
  const price = isDutch
    ? (auction.dutchPrice ?? auction.dutchTopPrice ?? auction.startPrice)
    : sealed && (open || scheduled)
      ? auction.startPrice
      : (auction.currentPrice ?? auction.startPrice);
  const remaining = open ? Math.max(0, Date.parse(auction.endAt) - now) : 0;
  const wait = scheduled ? waitingTime(auction, now) : null;
  const untilStart = wait ? Math.max(0, Date.parse(wait.at) - now) : 0;

  const badge = item.needsPayment
    ? { label: "Cần thanh toán", tone: "danger" as const }
    : item.won
      ? { label: "Đã thắng", tone: "success" as const }
      : item.role === "Seller"
        ? { label: "Người bán", tone: "neutral" as const }
        : open && item.leading
          ? { label: "Đang dẫn giá", tone: "success" as const }
          : open
            ? { label: "Bị vượt giá", tone: "warn" as const }
            : scheduled
              ? { label: "Sắp mở", tone: "neutral" as const }
              : { label: "Đã kết thúc", tone: "neutral" as const };

  const statusText = item.needsPayment
    ? "Bạn đã thắng · Vào thanh toán từ ví trong 24 giờ"
    : item.won
      ? "Đã hoàn tất thắng phiên · Xem tiến độ nhận sách"
      : waitingReg
        ? `Chờ đủ người đăng ký (${auction.registeredCount ?? 0}/${auction.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR})`
        : scheduled && wait
          ? `${wait.label} ${time(wait.at)} (còn ${formatRemaining(untilStart)})`
          : open
            ? `Đang mở · Còn ${formatRemaining(remaining)}`
            : closeReasonText(auction) ?? `Kết thúc lúc ${time(auction.endAt)}`;

  const conditionText = auction.book?.condition ? conditions[auction.book.condition] : null;
  const canEditSchedule = item.role === "Seller" && canReschedule(auction, now);

  const openDetail = () =>
    router.push({ pathname: "/auction", params: { id: auction.id } });

  return (
    <View style={[styles.rowCard, item.needsPayment && styles.rowCardUrgent]}>
      {/* Main Tappable Info Area (separate from action buttons to avoid nested Pressable) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mở phiên ${auction.title}`}
        onPress={openDetail}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        <View style={styles.rowHeader}>
          <View
            style={[
              styles.badge,
              badge.tone === "danger" && styles.badgeDanger,
              badge.tone === "success" && styles.badgeSuccess,
              badge.tone === "warn" && styles.badgeWarn,
            ]}
          >
            <AppText
              style={[
                styles.badgeText,
                badge.tone === "danger" && styles.badgeTextDanger,
                badge.tone === "success" && styles.badgeTextSuccess,
                badge.tone === "warn" && styles.badgeTextWarn,
              ]}
            >
              {badge.label}
            </AppText>
          </View>
          <AppText kind="small" color={stitchTokens.brownMuted} style={styles.formatLabel}>
            {formatLabel}
          </AppText>
        </View>

        <View style={styles.bookRow}>
          <View style={styles.coverBox}>
            <AuctionCover
              auctionId={auction.id}
              mediaId={auction.book?.photos[0]?.id}
              label={auction.title}
              iconSize={22}
            />
          </View>
          <View style={styles.bookInfo}>
            <AppText kind="bold" numberOfLines={2} style={styles.bookTitle}>
              {auction.title}
            </AppText>
            <AppText kind="small" color={stitchTokens.brownMuted} numberOfLines={1}>
              {[conditionText, auction.pointName].filter(Boolean).join(" · ")}
            </AppText>
            <AppText kind="small" color={stitchTokens.deepCocoa} style={styles.statusLine}>
              {statusText}
            </AppText>
          </View>
        </View>

        {/* Clean Metrics Strip */}
        <View style={styles.metricsStrip}>
          <View style={styles.metricCell}>
            <AppText style={styles.metricLabel}>
              {isDutch ? "Giá hiện tại" : sealed && (open || scheduled) ? "Khởi điểm" : "Giá phiên"}
            </AppText>
            <AppText kind="bold" style={styles.metricPrice}>{formatVnd(price)}</AppText>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricCell}>
            <AppText style={styles.metricLabel}>
              {waitingReg ? "Đăng ký" : "Người trả giá"}
            </AppText>
            <AppText kind="bold" style={styles.metricValue}>
              {waitingReg
                ? `${auction.registeredCount ?? 0}/${auction.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR}`
                : `${auction.bidderCount} người`}
            </AppText>
          </View>
          {auction.buyNowPrice != null && !isDutch && !sealed ? (
            <>
              <View style={styles.metricDivider} />
              <View style={styles.metricCell}>
                <AppText style={styles.metricLabel}>Mua ngay</AppText>
                <AppText kind="bold" style={styles.metricValue}>{formatVnd(auction.buyNowPrice)}</AppText>
              </View>
            </>
          ) : null}
        </View>
      </Pressable>

      {/* Action Buttons Footer */}
      <View style={styles.rowFooter}>
        <Button
          wine
          secondary={!item.needsPayment}
          title={
            item.needsPayment
              ? "Thanh toán ngay"
              : waitingReg && item.role === "Seller"
                ? "Quản lý phiên"
                : "Xem chi tiết phiên"
          }
          onPress={openDetail}
        />

        {canEditSchedule ? (
          <Button
            wine
            secondary
            title="Đổi thời gian phiên"
            onPress={onEdit}
          />
        ) : null}

        {(open || scheduled) && auction.version != null ? (
          <DemoSkipButton
            intentKey={`${auction.id}:${auction.version}`}
            label={scheduled ? "Mở phiên ngay · Demo" : "Kết thúc phiên ngay · Demo"}
            run={(key) => advanceDemoAuction(client, auction.id, auction.version!, key)}
            onDone={() => queryClient.invalidateQueries({ queryKey: ["my-auctions"] })}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  stackSm: { gap: space.sm },
  flexOne: { flex: 1, minWidth: 0, gap: 2 },
  pressed: { opacity: 0.78 },

  paymentBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: stitchTokens.flashRedBg,
    borderWidth: 1,
    borderColor: stitchTokens.errorLightBorder,
    borderRadius: 14,
    padding: 12,
  },
  paymentBannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentBannerTitle: { color: stitchTokens.flashRed, fontSize: 14 },

  tabsScrollView: { flexGrow: 0 },
  tabsContent: { gap: 8, paddingVertical: 2 },
  tabPill: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    justifyContent: "center",
  },
  tabPillActive: { backgroundColor: stitchTokens.wine },
  tabPillInactive: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  tabText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    includeFontPadding: false,
  },
  tabTextActive: { color: stitchTokens.gold, fontWeight: "700" },
  tabTextInactive: { color: stitchTokens.deepCocoa },

  emptyCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.xl,
    alignItems: "center",
    gap: 12,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, color: stitchTokens.wineDark, textAlign: "center" },
  emptyDesc: { fontSize: 13, color: stitchTokens.brownMuted, textAlign: "center", lineHeight: 19 },

  list: { gap: space.md },
  rowCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
  },
  rowCardUrgent: {
    borderColor: stitchTokens.flashRed,
  },
  rowMain: {
    padding: space.md,
    gap: space.sm,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  badge: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeDanger: { backgroundColor: stitchTokens.flashRedBg },
  badgeSuccess: { backgroundColor: stitchTokens.likeNewGreenBg },
  badgeWarn: { backgroundColor: stitchTokens.amberBg },
  badgeText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  badgeTextDanger: { color: stitchTokens.flashRed },
  badgeTextSuccess: { color: stitchTokens.likeNewGreen },
  badgeTextWarn: { color: colors.warning },
  formatLabel: { fontSize: 12, fontWeight: "600" },

  bookRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  coverBox: {
    width: 64,
    height: 90,
    borderRadius: 8,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
  },
  bookInfo: { flex: 1, minWidth: 0, gap: 4 },
  bookTitle: { fontSize: 15, lineHeight: 20, color: stitchTokens.wineDark },
  statusLine: { fontSize: 12, lineHeight: 17 },

  metricsStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  metricCell: { flex: 1, minWidth: 0, gap: 2 },
  metricDivider: { width: 1, height: 28, backgroundColor: stitchTokens.borderWarm },
  metricLabel: { fontSize: 11, color: stitchTokens.brownMuted },
  metricPrice: { fontSize: 14, color: stitchTokens.wine, fontVariant: ["tabular-nums"] },
  metricValue: { fontSize: 13, color: stitchTokens.deepCocoa, fontVariant: ["tabular-nums"] },

  rowFooter: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
    padding: space.md,
    gap: space.sm,
  },
});
