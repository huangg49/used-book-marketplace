import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  BackAction,
  Button,
  Icon,
  Notice,
  Screen,
  StatePanel,
  colors,
  formatVnd,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  AUCTION_MIN_BIDDERS_FLOOR,
  canReschedule,
  closeReasonText,
  formatRemaining,
  isSealedFormat,
  isScheduled,
  myAuctionsOptions,
  openTimeOf,
  waitingForRegistrants,
  waitingTime,
  type MyAuctionView,
} from "./auctions-model";
import {
  AuctionGuideCard,
  AuctionTrustBanner,
  ScheduleAuctionSheet,
} from "./components";
import { AuctionCover } from "./components/auction-cover";
import { MyAuctionsBackground } from "./components/my-auctions-background";
import type { MyAuctionItem } from "./contracts";

const VIEWS: { value: MyAuctionView; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "active", label: "Đang diễn ra" },
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

const formatConditionText = (cond?: string | null) => {
  switch (cond) {
    case "LikeNew":
      return "Như mới 99%";
    case "Good":
      return "Tốt (85-95%)";
    case "Fair":
      return "Khá (70-80%)";
    case "Worn":
      return "Có dấu vết thời gian";
    default:
      return "Sách tuyển chọn";
  }
};

// The member's own auctions: bids, wins to pay and books they sell.
export function MyAuctionsScreen({ userId }: { userId: string }) {
  const { client } = useSession();
  const foreground = useForeground();
  const [view, setView] = useState<MyAuctionView>("all");
  const result = useInfiniteQuery({
    ...myAuctionsOptions(client, userId, view),
    enabled: foreground,
  });
  const items = result.data?.pages.flatMap((page) => page.items) ?? [];

  // Summary query to drive the 4-stat Bento metrics
  const summaryQuery = useInfiniteQuery({
    ...myAuctionsOptions(client, userId, "all"),
    enabled: foreground,
  });
  const allItems =
    summaryQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const activeCount = allItems.filter(
    (i) => i.auction.state === "Active",
  ).length;
  const paymentCount = allItems.filter((i) => i.needsPayment).length;
  const sellingCount = allItems.filter((i) => i.role === "Seller").length;
  const leadingCount = allItems.filter(
    (i) => i.leading && i.auction.state === "Active",
  ).length;

  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MyAuctionItem | null>(null);
  // Scheduled/editable states follow the clock without reading it in render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const edited = editing?.auction;

  return (
    <Screen
      background={<MyAuctionsBackground />}
      canvasColor="transparent"
      footer={<MemberNavigation current="/auctions" />}
      footerAppearance="navigation"
    >
      {/* Top Back Action Bar */}
      <BackAction
        title="Về phiên đang mở"
        onPress={() => router.replace("/auctions")}
      />

      {/* Main Header with Brand Gavel Badge & Live Counter */}
      <View style={styles.headerSection}>
        <View style={styles.headerTitleRow}>
          <View style={styles.gavelBadge}>
            <Icon name="gavel" size={17} color={stitchTokens.warmIvory} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppText kind="small" style={styles.headerCategoryLabel}>
                SÀN ĐẤU GIÁ CÁ NHÂN
              </AppText>
              <View style={styles.livePulseTag}>
                <View style={styles.livePulseDot} />
                <AppText kind="small" style={styles.livePulseTagText}>
                  LIVE
                </AppText>
              </View>
            </View>
            <AppText
              kind="heading"
              style={styles.headerMainTitle}
              accessibilityRole="header"
            >
              Phiên của tôi
            </AppText>
          </View>
        </View>
        <AppText kind="small" style={styles.headerSubtitle}>
          Quản lý lượt trả giá, tiến độ chốt phiên và các đầu sách bạn gửi đấu giá.
        </AppText>
      </View>

      {/* Action Priority Alert Banner (Hiển thị khi cần thanh toán hoặc đang dẫn giá) */}
      {paymentCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Bạn có ${paymentCount} phiên cần thanh toán. Bấm để xem.`}
          onPress={() => setView("payment")}
          style={styles.priorityPaymentBanner}
        >
          <View style={styles.priorityPaymentIconBox}>
            <Icon name="clock" size={16} color={stitchTokens.flashRed} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText kind="bold" style={styles.priorityPaymentTitle}>
              {`Cần thanh toán ${paymentCount} phiên thắng`}
            </AppText>
            <AppText kind="small" style={styles.priorityPaymentSubtitle}>
              Hoàn tất trước hạn chót để nhận sách tại trạm Lật Lại
            </AppText>
          </View>
          <Icon name="chevronRight" size={14} color={stitchTokens.flashRed} />
        </Pressable>
      ) : leadingCount > 0 ? (
        <View style={styles.priorityLeadingBanner}>
          <View style={styles.priorityLeadingIconBox}>
            <Icon name="flame" size={16} color={stitchTokens.forestGreen} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText kind="bold" style={styles.priorityLeadingTitle}>
              {`Bạn đang dẫn đầu ${leadingCount} phiên trực tiếp`}
            </AppText>
            <AppText kind="small" style={styles.priorityLeadingSubtitle}>
              Giữ vững mức giá để sở hữu cuốn sách xưa yêu thích
            </AppText>
          </View>
        </View>
      ) : null}

      {/* 4-Stat Bento Analytics Card */}
      <View style={styles.bentoCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Xem tất cả ${allItems.length} phiên`}
          onPress={() => setView("all")}
          style={[
            styles.bentoStatItem,
            view === "all" && styles.bentoStatItemActive,
          ]}
        >
          <AppText
            kind="heading"
            style={[
              styles.bentoStatNumber,
              view === "all" && styles.bentoStatNumberActive,
            ]}
          >
            {summaryQuery.isPending ? "…" : allItems.length}
          </AppText>
          <AppText kind="small" style={styles.bentoStatLabel}>
            Tất cả
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Xem ${activeCount} phiên đang diễn ra`}
          onPress={() => setView("active")}
          style={[
            styles.bentoStatItem,
            view === "active" && styles.bentoStatItemActive,
          ]}
        >
          <View style={styles.bentoStatWithDot}>
            <View style={styles.dotActive} />
            <AppText
              kind="heading"
              style={[
                styles.bentoStatNumber,
                view === "active" && styles.bentoStatNumberActive,
              ]}
            >
              {summaryQuery.isPending ? "…" : activeCount}
            </AppText>
          </View>
          <AppText kind="small" style={styles.bentoStatLabel}>
            Đang mở
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Xem ${paymentCount} phiên cần thanh toán`}
          onPress={() => setView("payment")}
          style={[
            styles.bentoStatItem,
            view === "payment" && styles.bentoStatItemActive,
          ]}
        >
          <View style={styles.bentoStatWithDot}>
            <View style={styles.dotPayment} />
            <AppText
              kind="heading"
              style={[
                styles.bentoStatNumber,
                view === "payment" && styles.bentoStatNumberActive,
              ]}
            >
              {summaryQuery.isPending ? "…" : paymentCount}
            </AppText>
          </View>
          <AppText kind="small" style={styles.bentoStatLabel}>
            Cần trả tiền
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Xem ${sellingCount} sách tôi bán`}
          onPress={() => setView("selling")}
          style={[
            styles.bentoStatItem,
            view === "selling" && styles.bentoStatItemActive,
          ]}
        >
          <View style={styles.bentoStatWithDot}>
            <View style={styles.dotSelling} />
            <AppText
              kind="heading"
              style={[
                styles.bentoStatNumber,
                view === "selling" && styles.bentoStatNumberActive,
              ]}
            >
              {summaryQuery.isPending ? "…" : sellingCount}
            </AppText>
          </View>
          <AppText kind="small" style={styles.bentoStatLabel}>
            Tôi bán
          </AppText>
        </Pressable>
      </View>

      {/* Horizontal Filter Tabs Scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterTabsScroll}
      >
        {VIEWS.map((option) => {
          const isSelected = view === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityLabel={`Lọc: ${option.label}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setView(option.value)}
              style={[
                styles.filterTabPill,
                isSelected
                  ? styles.filterTabPillSelected
                  : styles.filterTabPillUnselected,
              ]}
            >
              <AppText
                kind="small"
                style={[
                  styles.filterTabPillText,
                  isSelected
                    ? styles.filterTabPillTextSelected
                    : styles.filterTabPillTextUnselected,
                ]}
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* States: Loading / Error */}
      {result.isPending && (
        <StatePanel wine loading title="Đang tải phiên của bạn…" />
      )}
      {result.error && (
        <View style={styles.errorContainer}>
          <Notice tone="error">{presentError(result.error).message}</Notice>
          <Button
            wine
            secondary
            title="Thử tải lại"
            busy={result.isFetching}
            onPress={() => void result.refetch()}
          />
        </View>
      )}

      {/* State: Empty View */}
      {result.isSuccess && items.length === 0 && (
        <View style={styles.emptyCardBox}>
          <View style={styles.emptyIconCircle}>
            <Icon name="gavel" size={28} color={stitchTokens.wine} />
          </View>
          <AppText kind="heading" style={styles.emptyTitle}>
            Chưa có phiên nào ở mục này
          </AppText>
          <AppText kind="small" style={styles.emptySubtitle}>
            Phiên bạn tham gia trả giá, thắng giải hoặc sách gửi đấu giá sẽ hiển thị tại đây.
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Khám phá các phiên đấu giá đang mở"
            onPress={() => router.push("/auctions")}
            style={styles.emptyExploreBtn}
          >
            <Icon name="explore" size={15} color={stitchTokens.warmIvory} />
            <AppText kind="bold" style={styles.emptyExploreBtnText}>
              Khám phá phiên đang mở
            </AppText>
          </Pressable>
        </View>
      )}

      {/* Auction Cards List */}
      <View style={{ gap: space.md }}>
        {items.map((item) => (
          <Row
            key={item.auction.id}
            item={item}
            now={now}
            onEdit={() => setEditing(item)}
          />
        ))}
      </View>

      {/* Trust & Guarantee Banner */}
      <View style={{ marginTop: space.sm }}>
        <AuctionTrustBanner />
      </View>

      {/* 3-Step Auction Guide Card */}
      <View style={{ marginTop: 2, marginBottom: space.lg }}>
        <AuctionGuideCard />
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
                // ADR 0081: a waiting registration auction edits its open time.
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
          void queryClient.invalidateQueries({
            queryKey: ["my-auctions", userId],
          })
        }
      />

      {result.hasNextPage && (
        <Button
          wine
          secondary
          title="Xem thêm phiên cũ hơn"
          busy={result.isFetchingNextPage}
          onPress={() => void result.fetchNextPage()}
        />
      )}
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
  const { auction } = item;
  const scheduled = isScheduled(auction, now);
  const waiting = waitingTime(auction, now);
  const formatType = auction.auctionType ?? "English";
  const isDutch = formatType === "Dutch";
  const isSealed = isSealedFormat(auction);

  const isWaiting = scheduled && waitingForRegistrants(auction, now);
  const waitingUntilMs = waiting.at ? Date.parse(waiting.at) - now : 0;

  const status = item.needsPayment
    ? `Cần thanh toán trước ${item.paymentDeadline ? time(item.paymentDeadline) : "hạn"}`
    : isWaiting
      ? `Đăng ký ${auction.registeredCount ?? 0}/${auction.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR} người · ${waiting.label === "Mở lúc" ? "mở sau" : "hạn còn"} ${formatRemaining(Math.max(0, waitingUntilMs))}`
      : scheduled
        ? `${waiting.label} ${time(waiting.at)}`
        : item.won
          ? "Bạn đã thắng phiên này"
          : auction.state === "SecondChanceOffered"
            ? "Đang mời người trả giá cao thứ hai"
            : item.role === "Seller"
              ? auction.state === "Active"
                ? "Phiên của bạn đang mở"
                : closeReasonText(auction) ?? "Sách bạn bán"
              : auction.state === "Active"
                ? isSealed
                  ? "Đã gửi giá kín"
                  : item.leading
                    ? "Bạn đang dẫn giá"
                    : "Bạn chưa dẫn giá"
                : closeReasonText(auction) ?? "Phiên đã kết thúc";

  const isLeadOrWon =
    item.won || (auction.state === "Active" && item.leading);

  const auctionCode = `#AUC-${auction.id.slice(0, 6).toUpperCase()}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${auction.title}. ${status}.`}
      onPress={() =>
        router.push({ pathname: "/auction", params: { id: auction.id } })
      }
      style={({ pressed }) => [
        styles.cardContainer,
        item.needsPayment && styles.cardContainerPayment,
        isLeadOrWon && styles.cardContainerLead,
        pressed && styles.cardContainerPressed,
      ]}
    >
      {/* Card Header Strip: Auction Code & Badges */}
      <View style={styles.cardHeaderStrip}>
        <View style={styles.auctionCodeWrap}>
          <Icon name="tag" size={12} color={stitchTokens.roseBrown} />
          <AppText kind="small" style={styles.auctionCodeText}>
            {auctionCode}
          </AppText>
        </View>

        {/* Badges: Role + Format */}
        <View style={styles.badgesWrap}>
          <View
            style={[
              styles.roleBadge,
              item.needsPayment
                ? styles.roleBadgePayment
                : isLeadOrWon
                  ? styles.roleBadgeLead
                  : item.role === "Seller"
                    ? styles.roleBadgeSeller
                    : styles.roleBadgeBuyer,
            ]}
          >
            <AppText
              kind="small"
              style={[
                styles.roleBadgeText,
                item.needsPayment
                  ? styles.roleBadgeTextPayment
                  : isLeadOrWon
                    ? styles.roleBadgeTextLead
                    : item.role === "Seller"
                      ? styles.roleBadgeTextSeller
                      : styles.roleBadgeTextBuyer,
              ]}
            >
              {item.role === "Seller"
                ? "📦 NGƯỜI BÁN"
                : item.won
                  ? "🏆 ĐÃ THẮNG"
                  : item.leading
                    ? "🔥 DẪN ĐẦU"
                    : "NGƯỜI MUA"}
            </AppText>
          </View>

          {(isDutch || isSealed) && (
            <View style={styles.formatBadge}>
              <AppText kind="small" style={styles.formatBadgeText}>
                {isDutch
                  ? "Kiểu Hà Lan"
                  : formatType === "SealedSecond"
                    ? "Kín #2"
                    : "Kín #1"}
              </AppText>
            </View>
          )}

          {auction.minBidders != null && scheduled && (
            <View style={styles.regBadge}>
              <AppText kind="small" style={styles.regBadgeText}>
                {`ĐK: ${auction.registeredCount ?? 0}/${auction.minBidders}`}
              </AppText>
            </View>
          )}
        </View>
      </View>

      {/* Middle Row: Cover Thumbnail + Book Details */}
      <View style={styles.cardMainRow}>
        {/* Book Cover Thumbnail with subtle depth */}
        <View style={styles.coverThumbnailWrapper}>
          <AuctionCover
            auctionId={auction.id}
            mediaId={auction.book?.photos[0]?.id}
            label={auction.title}
            iconSize={22}
          />
        </View>

        {/* Info Column */}
        <View style={styles.infoCol}>
          {/* Book Title */}
          <AppText
            kind="heading"
            style={styles.bookTitle}
            numberOfLines={2}
          >
            {auction.title}
          </AppText>

          {/* Authors & Condition */}
          <View style={styles.bookMetadataRow}>
            <AppText kind="small" style={styles.authorText} numberOfLines={1}>
              {auction.book?.authors?.join(", ") || "Sách đấu giá Lật Lại"}
            </AppText>
            <View style={styles.conditionChip}>
              <AppText kind="small" style={styles.conditionChipText}>
                {formatConditionText(auction.book?.condition)}
              </AppText>
            </View>
          </View>

          {/* Dynamic Auction Status Bar */}
          <View style={styles.statusBox}>
            {item.needsPayment ? (
              <Icon name="clock" size={13} color={stitchTokens.flashRed} />
            ) : isLeadOrWon ? (
              <Icon name="check" size={13} color={stitchTokens.forestGreen} />
            ) : (
              <Icon name="info" size={13} color={stitchTokens.roseBrown} />
            )}
            <AppText
              kind="small"
              style={[
                styles.statusText,
                item.needsPayment
                  ? styles.statusTextPayment
                  : isLeadOrWon
                    ? styles.statusTextLead
                    : styles.statusTextDefault,
              ]}
              numberOfLines={2}
            >
              {status}
            </AppText>
          </View>
        </View>
      </View>

      {/* Rich Financial & Activity Metrics Bar (3 Cột Dữ Liệu) */}
      <View style={styles.metricsBar}>
        <View style={styles.metricColumn}>
          <AppText kind="small" style={styles.metricLabel}>
            {item.won
              ? "Giá trúng phiên"
              : item.role === "Seller"
                ? "Giá hiện tại"
                : "Mức giá dẫn"}
          </AppText>
          <AppText kind="heading" style={styles.metricValuePrice}>
            {auction.currentPrice !== null
              ? formatVnd(auction.currentPrice)
              : item.won
                ? "Mua ngay"
                : `Khởi điểm ${formatVnd(auction.startPrice)}`}
          </AppText>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricColumn}>
          <AppText kind="small" style={styles.metricLabel}>
            Bước giá
          </AppText>
          <AppText kind="bold" style={styles.metricValueStep}>
            {`+${formatVnd(auction.step)}`}
          </AppText>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricColumn}>
          <AppText kind="small" style={styles.metricLabel}>
            Lượt trả giá
          </AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Icon name="flame" size={11} color={stitchTokens.orangeDeep} />
            <AppText kind="bold" style={styles.metricValueBids}>
              {`${auction.bidderCount} lượt`}
            </AppText>
          </View>
        </View>
      </View>

      {/* Pickup Location & Action CTA Footer */}
      <View style={styles.cardFooterRow}>
        <View style={styles.pointWrapper}>
          <Icon name="pin" size={12} color={stitchTokens.wine} />
          <AppText kind="small" style={styles.pointText} numberOfLines={1}>
            {`Trạm Lật Lại — ${auction.pointName}`}
          </AppText>
        </View>

        <View style={styles.ctaButtonWrap}>
          {item.needsPayment ? (
            <View style={styles.actionBtnPayment}>
              <AppText kind="bold" style={styles.actionBtnPaymentText}>
                Thanh toán ngay →
              </AppText>
            </View>
          ) : (
            <View style={styles.actionBtnDefault}>
              <AppText kind="small" style={styles.actionBtnDefaultText}>
                {auction.state === "Active" ? "Vào phòng đấu giá →" : "Xem chi tiết →"}
              </AppText>
            </View>
          )}
        </View>
      </View>

      {/* Seller Specific Actions */}
      {item.role === "Seller" &&
        auction.minBidders == null &&
        canReschedule(auction, now) && (
          <Button
            wine
            secondary
            title="Đổi thời gian phiên"
            onPress={onEdit}
          />
        )}
      {item.role === "Seller" && waitingForRegistrants(auction, now) && (
        <Button
          wine
          secondary
          title="Quản lý phiên →"
          onPress={() =>
            router.push({ pathname: "/auction", params: { id: auction.id } })
          }
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerSection: {
    gap: 4,
    marginTop: 4,
    marginBottom: 4,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  gavelBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: stitchTokens.wine,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  headerCategoryLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: stitchTokens.wine,
    letterSpacing: 0.8,
  },
  livePulseTag: {
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
  livePulseTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: stitchTokens.flashRed,
    letterSpacing: 0.5,
  },
  headerMainTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: stitchTokens.roseBrown,
    marginTop: 2,
    lineHeight: 17,
  },

  // Priority Action Alert Banners
  priorityPaymentBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: stitchTokens.flashRedBg,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: stitchTokens.flashRed,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    shadowColor: stitchTokens.flashRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  priorityPaymentIconBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: stitchTokens.white,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityPaymentTitle: {
    fontSize: 13,
    color: stitchTokens.wineDark,
  },
  priorityPaymentSubtitle: {
    fontSize: 11,
    color: colors.rustText,
  },

  priorityLeadingBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: stitchTokens.greenBorderSoft,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  priorityLeadingIconBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: stitchTokens.white,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityLeadingTitle: {
    fontSize: 13,
    color: stitchTokens.forestDeep,
  },
  priorityLeadingSubtitle: {
    fontSize: 11,
    color: stitchTokens.leafGreen,
  },

  // Bento Stats Metric Card
  bentoCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: space.md,
    flexDirection: "row",
    gap: 6,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  bentoStatItem: {
    flex: 1,
    backgroundColor: stitchTokens.parchment,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  bentoStatItemActive: {
    backgroundColor: stitchTokens.warmIvory,
    borderColor: stitchTokens.wine,
    borderWidth: 1.5,
  },
  bentoStatNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  bentoStatNumberActive: {
    color: stitchTokens.wine,
  },
  bentoStatWithDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  dotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.forestGreen,
  },
  dotPayment: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.flashRed,
  },
  dotSelling: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.goldMedal,
  },
  bentoStatLabel: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "600",
    color: stitchTokens.roseBrown,
  },

  // Filter Tabs Pill Scroll
  filterTabsScroll: {
    paddingVertical: 4,
    gap: 8,
  },
  filterTabPill: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  filterTabPillSelected: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wineDark,
    shadowColor: stitchTokens.wine,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  filterTabPillUnselected: {
    backgroundColor: stitchTokens.parchment,
    borderColor: stitchTokens.peachBorder,
  },
  filterTabPillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterTabPillTextSelected: {
    color: stitchTokens.gold,
  },
  filterTabPillTextUnselected: {
    color: stitchTokens.charcoalBrown,
  },

  // Card Container & Layout
  cardContainer: {
    gap: 10,
    padding: space.md,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 14,
    backgroundColor: stitchTokens.warmIvory,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  cardContainerPayment: {
    borderColor: stitchTokens.flashRed,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  cardContainerLead: {
    borderColor: stitchTokens.greenBorderSoft,
  },
  cardContainerPressed: {
    backgroundColor: stitchTokens.parchment,
  },

  // Card Header Strip
  cardHeaderStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: stitchTokens.peachBorder,
    paddingBottom: 6,
  },
  auctionCodeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  auctionCodeText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.roseBrown,
    letterSpacing: 0.5,
  },
  badgesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    alignItems: "center",
  },

  // Role Badges
  roleBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  roleBadgePayment: {
    backgroundColor: stitchTokens.flashRedBg,
    borderColor: stitchTokens.redBorderSoft,
  },
  roleBadgeLead: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderColor: stitchTokens.greenBorderSoft,
  },
  roleBadgeSeller: {
    backgroundColor: stitchTokens.amberBg,
    borderColor: stitchTokens.amberBorder,
  },
  roleBadgeBuyer: {
    backgroundColor: stitchTokens.parchment,
    borderColor: stitchTokens.peachBorder,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  roleBadgeTextPayment: {
    color: colors.rustText,
  },
  roleBadgeTextLead: {
    color: stitchTokens.forestGreen,
  },
  roleBadgeTextSeller: {
    color: stitchTokens.orangeBurned,
  },
  roleBadgeTextBuyer: {
    color: stitchTokens.wineDark,
  },

  formatBadge: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  formatBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },

  regBadge: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  regBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
  },

  cardMainRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  coverThumbnailWrapper: {
    width: 76,
    height: 100,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  infoCol: {
    flex: 1,
    gap: 4,
  },

  bookTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    lineHeight: 20,
  },
  bookMetadataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  authorText: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
    fontWeight: "500",
  },
  conditionChip: {
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  conditionChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.wine,
  },

  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },
  statusTextPayment: {
    color: stitchTokens.flashRed,
  },
  statusTextLead: {
    color: stitchTokens.forestGreen,
  },
  statusTextDefault: {
    color: stitchTokens.roseBrown,
  },

  // 3-Column Financial & Activity Metrics Bar
  metricsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.parchment,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  metricColumn: {
    flex: 1,
    alignItems: "center",
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: stitchTokens.peachBorder,
  },
  metricLabel: {
    fontSize: 9,
    color: stitchTokens.roseBrown,
    fontWeight: "600",
    marginBottom: 2,
  },
  metricValuePrice: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  metricValueStep: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.charcoalBrown,
  },
  metricValueBids: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.orangeBurned,
  },

  // Card Footer Row
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 2,
  },
  pointWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    marginRight: 8,
  },
  pointText: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
  },
  ctaButtonWrap: {
    flexShrink: 0,
  },
  actionBtnPayment: {
    backgroundColor: stitchTokens.flashRed,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionBtnPaymentText: {
    fontSize: 11,
    color: stitchTokens.white,
    fontWeight: "700",
  },
  actionBtnDefault: {
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  actionBtnDefaultText: {
    fontSize: 11,
    color: stitchTokens.wine,
    fontWeight: "700",
  },

  errorContainer: {
    gap: space.sm,
    marginVertical: space.md,
  },

  // Empty State Card
  emptyCardBox: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: space.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    marginVertical: space.md,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 12,
    color: stitchTokens.roseBrown,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 18,
  },
  emptyExploreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
    shadowColor: stitchTokens.wine,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyExploreBtnText: {
    fontSize: 13,
    color: stitchTokens.warmIvory,
  },
});
