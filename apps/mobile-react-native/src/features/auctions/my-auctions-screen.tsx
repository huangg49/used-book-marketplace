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
import { ScheduleAuctionSheet } from "./components";
import { AuctionCover } from "./components/auction-cover";
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
      footer={<MemberNavigation current="/auctions" />}
      footerAppearance="navigation"
    >
      {/* Top Back Action Bar */}
      <BackAction
        title="Về phiên đang mở"
        onPress={() => router.replace("/auctions")}
      />

      {/* Main Header with Brand Gavel Badge */}
      <View style={styles.headerSection}>
        <View style={styles.headerTitleRow}>
          <View style={styles.gavelBadge}>
            <Icon name="gavel" size={17} color={stitchTokens.warmIvory} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText kind="small" style={styles.headerCategoryLabel}>
              ĐẤU GIÁ & THEO DÕI
            </AppText>
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
          Theo dõi các lượt trả giá, sách bạn gửi bán và phiên thắng cần thanh toán.
        </AppText>
      </View>

      {/* Bento Stats Metric Card */}
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
          ? "Bạn đã thắng phiên"
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
          {/* Badge Row: Role + Format + Registration info */}
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
                  ? "NGƯỜI BÁN"
                  : item.won
                    ? "ĐÃ THẮNG"
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

          {/* Book Title */}
          <AppText
            kind="heading"
            style={styles.bookTitle}
            numberOfLines={2}
          >
            {auction.title}
          </AppText>

          {/* Dynamic Auction Status */}
          <View style={styles.statusRow}>
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

          {/* Price & Pickup Point Row */}
          <View style={styles.priceAndPointRow}>
            <View>
              <AppText kind="small" style={styles.pricePrefixLabel}>
                {item.won
                  ? "Giá thắng:"
                  : item.role === "Seller"
                    ? "Giá hiện tại:"
                    : "Mức giá:"}
              </AppText>
              <AppText kind="heading" style={styles.priceValue}>
                {auction.currentPrice !== null
                  ? formatVnd(auction.currentPrice)
                  : item.won
                    ? "Mua ngay"
                    : `Khởi điểm ${formatVnd(auction.startPrice)}`}
              </AppText>
            </View>

            <View style={styles.pointWrapper}>
              <Icon name="pin" size={11} color={stitchTokens.stoneMuted} />
              <AppText
                kind="small"
                style={styles.pointText}
                numberOfLines={1}
              >
                {auction.pointName}
              </AppText>
            </View>
          </View>
        </View>
      </View>

      {/* Seller Reschedule & Manage Actions */}
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
    marginBottom: 2,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  gavelBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: stitchTokens.wine,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  headerCategoryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wine,
    letterSpacing: 0.8,
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
    gap: space.md,
    padding: space.md,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 14,
    backgroundColor: stitchTokens.warmIvory,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
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
  cardMainRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  coverThumbnailWrapper: {
    width: 72,
    height: 94,
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
  badgesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
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

  bookTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    lineHeight: 20,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
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

  priceAndPointRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  pricePrefixLabel: {
    fontSize: 10,
    color: stitchTokens.roseBrown,
    fontWeight: "500",
  },
  priceValue: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  pointWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: "50%",
  },
  pointText: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
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
