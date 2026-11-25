import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import {
  AppText, Icon, Sheet, colors, formatVnd, radius, space, stitchTokens,
} from "../../../core/ui";
import { conditions } from "../../shelf/contracts";
import { isSealedFormat, waitingTime } from "../auctions-model";
import { isClosing } from "../auction-live-model";
import type { PublicAuctionSummary } from "../contracts";
import { AuctionCover } from "./auction-cover";

const stateLabels = {
  Active: "Đang nhận giá",
  BuyNowPending: "Đã có người mua ngay",
  AwaitingWinnerPayment: "Chờ người thắng thanh toán",
  Sold: "Đã bán",
  Unsold: "Kết thúc, không có người mua",
  OnHold: "Tạm dừng để xem xét",
  Cancelled: "Đã hủy",
  PaymentExpired: "Quá hạn thanh toán",
  SecondChanceOffered: "Cơ hội thứ hai",
} as const;

export function auctionHeaderSubtitle(auction: PublicAuctionSummary, open: boolean, scheduled: boolean, now: number) {
  const closing = isClosing(auction, now);
  const status = closing ? "Đang chốt kết quả" : scheduled ? "Sắp mở" : stateLabels[auction.state];
  const format =
    auction.auctionType === "Dutch" ? "Giá giảm dần"
    : auction.auctionType === "SealedFirst" ? "Giá kín · Thứ nhất"
    : auction.auctionType === "SealedSecond" ? "Giá kín · Thứ hai"
    : "Trả giá lên";
  return `${status} · ${format}`;
}

const dateLabel = (value: string) =>
  new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
  });

function countdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  const minutes = pad(Math.floor((total % 3600) / 60));
  const seconds = pad(total % 60);
  return hours > 0 ? `${pad(hours)}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function priceLabel(auction: PublicAuctionSummary, live: boolean, scheduled: boolean) {
  if (auction.auctionType === "Dutch" && (live || scheduled))
    return live && auction.dutchPrice != null
      ? { label: "Giá có thể chốt", amount: auction.dutchPrice }
      : { label: "Giá mở phiên", amount: auction.dutchTopPrice ?? auction.startPrice };
  if (isSealedFormat(auction) && (live || scheduled))
    return { label: "Giá khởi điểm", amount: auction.startPrice };
  const amount = auction.currentPrice ?? auction.startPrice;
  if (auction.currentPrice == null || (live && auction.bidderCount === 0))
    return { label: "Giá khởi điểm", amount };
  if (live) return { label: "Giá hiện tại", amount };
  switch (auction.state) {
    case "BuyNowPending": return { label: "Giá mua ngay", amount };
    case "AwaitingWinnerPayment":
    case "Sold": return { label: "Giá chốt", amount };
    case "PaymentExpired":
    case "SecondChanceOffered": return { label: "Giá thắng chưa thanh toán", amount };
    case "OnHold": return { label: "Giá khi tạm dừng", amount };
    case "Cancelled": return { label: "Giá khi hủy", amount };
    default: return { label: "Giá cuối", amount };
  }
}

export function AuctionSessionOverview({
  auction, now, open, scheduled, pushing,
}: {
  auction: PublicAuctionSummary;
  now: number;
  open: boolean;
  scheduled: boolean;
  pushing: boolean;
}) {
  const { fontScale, width, height } = useWindowDimensions();
  const photos = auction.book?.photos ?? [];
  const [gallery, setGallery] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const safeIndex = Math.min(photoIndex, Math.max(0, photos.length - 1));
  const cover = photos[safeIndex] ?? photos[0];
  const { label, amount } = priceLabel(auction, open, scheduled);
  const stack = fontScale > 1.22 || width < 340 || (width < 420 && amount >= 10_000_000);
  const next = scheduled ? waitingTime(auction, now) : null;
  const active = open || scheduled;
  const closing = isClosing(auction, now);
  const sealed = isSealedFormat(auction) && active;
  const status = closing ? "Đang chốt kết quả" : scheduled ? "Sắp mở" : stateLabels[auction.state];
  const condition = auction.book?.condition;
  const authors = auction.book?.authors.join(", ");
  const format = auction.auctionType === "Dutch" ? "Giá giảm dần"
    : auction.auctionType === "SealedFirst" ? "Giá kín · Giá thứ nhất"
    : auction.auctionType === "SealedSecond" ? "Giá kín · Giá thứ hai" : "Trả giá lên";
  const [highlight] = useState(() => new Animated.Value(0));
  const lastPrice = useRef(amount);

  useEffect(() => {
    if (amount === lastPrice.current) return;
    lastPrice.current = amount;
    highlight.setValue(0.24);
    const motion = Animated.timing(highlight, {
      toValue: 0, duration: 420, useNativeDriver: Platform.OS !== "web",
    });
    motion.start();
    return () => motion.stop();
  }, [amount, highlight]);

  return (
    <View style={styles.overview}>
      {/* Book Identity Card */}
      <View style={styles.identityCard}>
        <Pressable
          accessibilityRole={photos.length ? "button" : undefined}
          accessibilityLabel={photos.length ? `Xem ảnh sách ${auction.title}` : undefined}
          disabled={!photos.length}
          onPress={() => {
            setPhotoIndex(0);
            setGallery(true);
          }}
          style={({ pressed }) => [styles.cover, pressed && styles.pressed]}
        >
          <AuctionCover auctionId={auction.id} mediaId={photos[0]?.id} label={auction.title} iconSize={28} resizeMode="contain" />
          {photos.length > 0 ? (
            <View style={styles.photoCount}>
              <Icon name="image" size={12} color={stitchTokens.warmIvory} />
              <AppText style={styles.photoCountText}>{photos.length}</AppText>
            </View>
          ) : null}
        </Pressable>

        <View style={styles.details}>
          <View style={styles.badgesRow}>
            <View style={[styles.state, open && styles.stateOpen, scheduled && styles.stateScheduled]}>
              {open ? <View style={styles.stateDot} /> : null}
              <AppText style={[styles.stateText, scheduled && styles.stateScheduledText]}>{status}</AppText>
            </View>
            {condition ? (
              <View style={styles.conditionPill}>
                <AppText style={styles.conditionPillText}>{conditions[condition]}</AppText>
              </View>
            ) : null}
          </View>
          <AppText accessibilityRole="header" style={styles.title}>{auction.title}</AppText>
          {authors ? <AppText style={styles.author} numberOfLines={2}>{authors}</AppText> : null}
          <AppText style={styles.formatMeta}>{format}</AppText>
        </View>
      </View>

      {/* Price & Live Countdown Stage */}
      <View style={styles.board}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.priceFlash, { opacity: highlight }]} />
        <View style={[styles.metrics, stack && styles.metricsStacked]}>
          <View accessibilityLiveRegion="polite" style={styles.metric}>
            <AppText style={styles.boardLabel}>{label}</AppText>
            <AppText style={styles.price}>{formatVnd(amount)}</AppText>
          </View>
          {active ? (
            <View accessibilityRole="timer" style={[styles.metric, stack ? styles.timerWide : styles.timer]}>
              <AppText style={styles.boardLabel}>
                {next?.label === "Hạn đăng ký" ? "Còn hạn đăng ký" : scheduled ? "Mở sau" : "Còn lại"}
              </AppText>
              <AppText style={styles.clock}>{countdown(Date.parse(next?.at ?? auction.endAt) - now)}</AppText>
            </View>
          ) : null}
        </View>

        <View style={styles.boardFooter}>
          {active ? (
            <View style={styles.boardFact} accessibilityLiveRegion="polite">
              <View style={[styles.liveDot, !pushing && styles.pollDot]} />
              <AppText style={styles.boardSmall}>{pushing ? "Trực tiếp" : "Cập nhật định kỳ"}</AppText>
            </View>
          ) : null}
          <View style={styles.boardFact}>
            <Icon name="clock" size={14} color={stitchTokens.goldAccent} />
            <AppText style={styles.boardSmall}>
              {next?.label ?? "Kết thúc"} {dateLabel(next?.at ?? auction.endAt)}
            </AppText>
          </View>
        </View>
      </View>

      {/* Compact Unboxed Fact Strip */}
      <View style={styles.facts}>
        {auction.sellerName ? (
          <>
            <View style={styles.fact}>
              <Icon name="person" size={16} color={stitchTokens.wine} />
              <AppText style={styles.factText} numberOfLines={1}>
                Người bán:{" "}
                <AppText kind="bold" style={styles.factBold}>
                  {auction.sellerName}
                </AppText>
              </AppText>
            </View>
            <View style={styles.factDivider} />
          </>
        ) : null}
        <View style={styles.fact}>
          <Icon name="pin" size={16} color={stitchTokens.wine} />
          <AppText style={styles.factText}>{auction.pointName}</AppText>
        </View>
        <View style={styles.factDivider} />
        <View style={styles.fact}>
          <Icon name={sealed ? "lock" : "gavel"} size={15} color={stitchTokens.wine} />
          <AppText style={styles.factText}>
            {scheduled && auction.minBidders != null
              ? `Đã đăng ký ${auction.registeredCount ?? 0}/${auction.minBidders} người`
              : sealed ? "Giá và người dẫn được giữ kín"
              : `${auction.bidderCount} người trả giá · Bước ${formatVnd(auction.step)}`}
          </AppText>
        </View>
      </View>

      {/* Photo Gallery Sheet */}
      <Sheet visible={gallery} onClose={() => setGallery(false)} title={`Ảnh sách (${safeIndex + 1}/${Math.max(1, photos.length)})`} motion="photo">
        {cover ? (
          <>
            <View style={[styles.galleryImage, { height: Math.min(height * 0.48, 430) }]}>
              <AuctionCover auctionId={auction.id} mediaId={cover.id} label={`${auction.title} · Ảnh ${safeIndex + 1}`} iconSize={36} resizeMode="contain" />
            </View>
            {photos.length > 1 ? (
              <View style={styles.galleryActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Ảnh trước"
                  disabled={safeIndex === 0}
                  onPress={() => setPhotoIndex(Math.max(0, safeIndex - 1))}
                  style={[styles.galleryNav, safeIndex === 0 && styles.disabled]}
                >
                  <Icon name="back" size={18} color={stitchTokens.wine} />
                </Pressable>
                <View style={styles.galleryDots}>
                  {photos.map((p, idx) => (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Ảnh ${idx + 1}`}
                      onPress={() => setPhotoIndex(idx)}
                      style={[styles.galleryDot, idx === safeIndex && styles.galleryDotActive]}
                    />
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Ảnh tiếp theo"
                  disabled={safeIndex >= photos.length - 1}
                  onPress={() => setPhotoIndex(Math.min(photos.length - 1, safeIndex + 1))}
                  style={[styles.galleryNav, safeIndex >= photos.length - 1 && styles.disabled]}
                >
                  <Icon name="chevronRight" size={18} color={stitchTokens.wine} />
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

export function AuctionBookCondition({ book }: { book: PublicAuctionSummary["book"] }) {
  const [expanded, setExpanded] = useState(false);
  if (!book) return null;
  const parts = [
    { label: "Người bán mô tả", content: book.description },
    { label: "Bìa sách", content: book.coverNote },
    { label: "Ruột sách", content: book.pages },
    { label: "Phụ kiện", content: book.accessories },
    { label: "Ghi chú", content: book.notes },
  ].filter(part => part.content?.trim());

  return (
    <View style={styles.conditionCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={({ pressed }) => [styles.conditionButton, pressed && styles.pressed]}
      >
        <View style={styles.conditionIconWrap}>
          <Icon name="book" size={17} color={stitchTokens.wine} />
        </View>
        <View style={styles.conditionHeaderText}>
          <AppText kind="bold" style={styles.partTitle}>Tình trạng & mô tả sách</AppText>
          <AppText style={styles.conditionSubtitle}>
            {conditions[book.condition]}
            {book.hasMissingPages !== undefined
              ? ` · ${book.hasMissingPages ? "Có thiếu trang" : "Đủ trang"}`
              : ""}
          </AppText>
        </View>
        <Icon name={expanded ? "chevronUp" : "chevronDown"} size={18} color={stitchTokens.wine} />
      </Pressable>

      {expanded ? (
        <View style={styles.conditionBody}>
          {parts.length === 0 ? (
            <AppText style={styles.meta}>Không có ghi chú chi tiết bổ sung từ người bán.</AppText>
          ) : (
            parts.map((part, idx) => (
              <View key={part.label} style={[styles.part, idx === 0 && styles.partFirst]}>
                <AppText kind="bold" style={styles.partLabel}>{part.label}</AppText>
                <AppText style={styles.partContent}>{part.content}</AppText>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overview: { gap: space.md },
  identityCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.md,
  },
  cover: {
    width: 90,
    height: 128,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
  },
  photoCount: {
    position: "absolute",
    right: 4,
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexDirection: "row",
    gap: 3,
    alignItems: "center",
    backgroundColor: stitchTokens.wineDark,
  },
  photoCountText: {
    color: stitchTokens.warmIvory,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    includeFontPadding: false,
  },
  pressed: { opacity: 0.78 },
  details: { flex: 1, minWidth: 0, gap: 6 },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  state: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: stitchTokens.parchment,
  },
  stateOpen: { backgroundColor: stitchTokens.roseWarmSurface },
  stateScheduled: { backgroundColor: stitchTokens.goldLight },
  stateDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: stitchTokens.wine },
  stateText: { color: stitchTokens.wine, fontWeight: "700", fontSize: 12, lineHeight: 16, includeFontPadding: false },
  stateScheduledText: { color: stitchTokens.wineDark },
  conditionPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: stitchTokens.parchment,
  },
  conditionPillText: {
    color: stitchTokens.deepCocoa,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    includeFontPadding: false,
  },
  title: { color: stitchTokens.wineDark, fontSize: 18, lineHeight: 24, fontWeight: "800" },
  author: { color: stitchTokens.brownMuted, fontSize: 13, lineHeight: 18 },
  formatMeta: { color: stitchTokens.wine, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  meta: { color: stitchTokens.brownMuted, fontSize: 13, lineHeight: 19, flexShrink: 1 },

  board: {
    backgroundColor: stitchTokens.wine,
    borderRadius: 16,
    overflow: "hidden",
  },
  priceFlash: { backgroundColor: stitchTokens.goldAccent },
  metrics: { flexDirection: "row", alignItems: "stretch", gap: space.md, padding: space.lg },
  metricsStacked: { flexDirection: "column" },
  metric: { flex: 1, minWidth: 0, gap: 4 },
  boardLabel: { color: stitchTokens.warmIvory, fontSize: 12, fontWeight: "600", opacity: 0.9 },
  price: {
    color: stitchTokens.goldAccent,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  timer: {
    borderLeftWidth: 1,
    borderLeftColor: stitchTokens.whiteAlpha25,
    paddingLeft: space.md,
    justifyContent: "center",
  },
  timerWide: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.whiteAlpha25,
    paddingTop: space.sm,
  },
  clock: {
    color: stitchTokens.warmIvory,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  boardFooter: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.whiteAlpha25,
    backgroundColor: stitchTokens.wineDark,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
  },
  boardFact: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  boardSmall: { color: stitchTokens.warmIvory, fontSize: 12, lineHeight: 16, flexShrink: 1 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: stitchTokens.likeNewGreenBg },
  pollDot: { backgroundColor: stitchTokens.goldAccent },

  facts: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    gap: 8,
  },
  fact: { flexDirection: "row", alignItems: "center", gap: 8 },
  factDivider: { height: 1, backgroundColor: stitchTokens.borderWarm },
  factText: { flex: 1, color: stitchTokens.deepCocoa, fontSize: 13, lineHeight: 19 },
  factBold: { color: stitchTokens.wineDark, fontSize: 13 },

  galleryImage: { borderRadius: 14, overflow: "hidden", backgroundColor: stitchTokens.parchment },
  galleryActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  galleryNav: {
    width: 48,
    height: 48,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryDots: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center", flex: 1 },
  galleryDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: stitchTokens.cardBorder },
  galleryDotActive: { width: 20, backgroundColor: stitchTokens.wine },
  disabled: { opacity: 0.35 },

  conditionCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
  },
  conditionButton: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: 12,
    gap: space.sm,
  },
  conditionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  conditionHeaderText: { flex: 1, minWidth: 0, gap: 2 },
  partTitle: { color: stitchTokens.wineDark, fontSize: 15 },
  conditionSubtitle: { color: stitchTokens.brownMuted, fontSize: 12, lineHeight: 16 },
  conditionBody: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    paddingTop: space.sm,
    gap: space.sm,
  },
  part: { borderTopWidth: 1, borderTopColor: stitchTokens.borderWarm, paddingTop: space.sm, gap: 4 },
  partFirst: { borderTopWidth: 0, paddingTop: 0 },
  partLabel: { color: stitchTokens.brownMuted, fontSize: 12 },
  partContent: { color: colors.ink, fontSize: 14, lineHeight: 20 },
});
