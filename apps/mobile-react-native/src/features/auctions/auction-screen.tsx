import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../core/api/session-client";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppModal,
  AppText,
  BackAction,
  Button,
  ConfirmDialog,
  Icon,
  Notice,
  Screen,
  StatePanel,
  TextField,
  colors,
  formatVnd,
  layout,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { AuctionCover } from "./components/auction-cover";
import { conditions as conditionLabels } from "../shelf/contracts";
import {
  AUCTION_MAX_PRICE,
  amountError,
  auctionErrorText,
  auctionOptions,
  autoFloor,
  bidOptions,
  createAuctionCommand,
  formatRemaining,
  waitingTime,
  isOpen,
  isScheduled,
  minimumBidOf,
  outcomeUnknown,
  participationKey,
  participationOptions,
  buyNowWindow,
  fundsHint,
  fundsShortfall,
  receiptMessage,
  sendAuctionCommand,
  standingOf,
  isSealedFormat,
  registrationBlocks,
  instantNeedsRival,
  waitingForRegistrants,
  openRuleText,
  closeReasonText,
  type AuctionCommand,
  type AuctionCommandKind,
} from "./auctions-model";
import {
  myIntakes,
  type MyIntake,
  type AuctionState,
  type Participation,
  type PublicAuction,
  type PublicAuctionSummary,
} from "./contracts";
import { WinnerSteps } from "./winner-steps";
import { AuctionFlag } from "./auction-flag";
import { WaitingSellerBlock } from "./waiting-seller-block";
import { walletSummary } from "../wallet/contracts";

const STATE_LABEL: Record<AuctionState, string> = {
  Active: "Đang mở",
  BuyNowPending: "Đã có người mua ngay",
  AwaitingWinnerPayment: "Chờ người thắng thanh toán",
  Sold: "Đã bán",
  Unsold: "Kết thúc, không có người mua",
  OnHold: "Tạm dừng để xem xét",
  Cancelled: "Đã hủy",
  PaymentExpired: "Người thắng không thanh toán đúng hạn",
};
// Same wording as user-web: only a won or bought auction has a final price.
const CLOSED_PRICE: Partial<Record<AuctionState, string>> = {
  BuyNowPending: "Giá mua ngay",
  AwaitingWinnerPayment: "Giá chốt",
  Sold: "Giá chốt",
  PaymentExpired: "Giá thắng (chưa thanh toán)",
  OnHold: "Giá khi tạm dừng",
  Cancelled: "Giá khi hủy",
};
const TOP_BADGE: Partial<Record<AuctionState, string>> = {
  Active: "đang dẫn",
  AwaitingWinnerPayment: "giá chốt",
  Sold: "giá chốt",
  OnHold: "dẫn khi tạm dừng",
  Cancelled: "dẫn khi hủy",
  PaymentExpired: "giá thắng",
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const time = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });

// Server clock: `serverTime` from the last read fixes the offset, so a wrong
// device clock never shows a closed auction as open. Display only.
function useServerNow(serverTime: string | undefined, ticking: boolean) {
  const [now, setNow] = useState(() => (serverTime ? Date.parse(serverTime) : 0));
  useEffect(() => {
    if (!serverTime) return;
    const offset = Date.parse(serverTime) - Date.now();
    const tick = () => setNow(Date.now() + offset);
    const first = setTimeout(tick, 0);
    const timer = ticking ? setInterval(tick, 1000) : undefined;
    return () => {
      clearTimeout(first);
      if (timer) clearInterval(timer);
    };
  }, [serverTime, ticking]);
  return now;
}

export function AuctionScreen({ id }: { id: string }) {
  const { client, state } = useSession();
  const foreground = useForeground();
  const valid = UUID.test(id);
  const member =
    state.status === "authenticated" && state.user.roles.includes("MEMBER")
      ? state.user.id
      : null;
  const detail = useQuery({
    ...auctionOptions(client, id),
    enabled: valid && foreground,
    retry: false,
    refetchInterval: (query) =>
      foreground && query.state.data?.auction.state === "Active" ? 5_000 : false,
  });
  const me = useQuery({
    ...participationOptions(client, id, member ?? ""),
    enabled: valid && foreground && !!member,
    retry: false,
    refetchInterval: foreground && detail.data?.auction.state === "Active" ? 5_000 : false,
  });
  const ownIntakes = useQuery({
    queryKey: ["my-auction-intakes", member, "auction", id],
    queryFn: () => client.request(`/me/auction-intakes?auctionId=${encodeURIComponent(id)}`, myIntakes),
    enabled: valid && foreground && !!member,
    retry: false,
    staleTime: 0,
  });
  const now = useServerNow(detail.data?.serverTime, foreground);
  const unavailable =
    !valid || (detail.error instanceof ApiError && detail.error.status === 404);
  return (
    <Screen
      appearance="browse"
      header={
        <View style={{ paddingHorizontal: space.xl, paddingVertical: space.xs, backgroundColor: colors.surface }}>
          <BackAction
            title="Quay lại"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/auctions");
            }}
          />
        </View>
      }
    >
      {unavailable ? (
        <StatePanel
          title="Không tìm thấy phiên"
          message="Phiên đấu giá không còn ở đường dẫn này. Quay lại danh sách để chọn phiên khác."
          action={{ label: "Xem phiên đang mở", onPress: () => router.replace("/auctions") }}
        />
      ) : (
        <>
          {detail.isPending && <StatePanel loading title="Đang tải phiên đấu giá" />}
          {detail.error && (
            <>
              <Notice tone="error">
                {detail.data ? "Thông tin dưới đây chưa được cập nhật. " : ""}
                {presentError(detail.error).message}
              </Notice>
              <Button secondary title="Thử tải lại" busy={detail.isFetching} onPress={() => void detail.refetch()} />
            </>
          )}
          {detail.data && (
            <AuctionBody
              data={detail.data}
              now={now || Date.parse(detail.data.serverTime)}
              me={me.data ?? null}
              meLoading={!!member && me.isPending}
              signedIn={!!member}
              memberId={member}
              ownerIntake={ownIntakes.data?.items.find((item) => item.auctionId === id) ?? null}
              ownerLoading={!!member && ownIntakes.isPending}
              ownerError={!!member && ownIntakes.isError}
              ownerKnown={ownIntakes.data !== undefined}
              retryOwner={() => void ownIntakes.refetch()}
              refresh={async () => {
                await Promise.all([detail.refetch(), member ? me.refetch() : undefined, member ? ownIntakes.refetch() : undefined]);
              }}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function DigitBlock({ value, highlight }: { value: number | string; highlight?: boolean }) {
  const formatted = typeof value === "number" ? String(value).padStart(2, "0") : value;
  return (
    <View
      style={{
        backgroundColor: highlight ? stitchTokens.goldAlpha20 : stitchTokens.whiteAlpha14,
        borderWidth: 1,
        borderColor: highlight ? stitchTokens.goldAccent : stitchTokens.whiteAlpha25,
        borderRadius: 6,
        minWidth: 28,
        height: 26,
        paddingHorizontal: 4,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText
        style={{
          color: highlight ? stitchTokens.goldAccent : stitchTokens.white,
          fontSize: 14,
          fontWeight: "800",
          fontVariant: ["tabular-nums"],
          lineHeight: 18,
          textAlign: "center",
        }}
      >
        {formatted}
      </AppText>
    </View>
  );
}

function TimeSeparator() {
  return (
    <AppText
      style={{
        color: stitchTokens.goldAccent,
        fontSize: 14,
        fontWeight: "800",
        lineHeight: 18,
        marginHorizontal: 1,
      }}
    >
      :
    </AppText>
  );
}

function AuctionTimerCard({
  auction,
  scheduled,
  open,
  now,
}: {
  auction: PublicAuctionSummary;
  scheduled: boolean;
  open: boolean;
  now: number;
}) {
  if (!scheduled && !open) {
    const isOnHold = auction.state === "OnHold";
    return (
      <View
        accessibilityRole="timer"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: isOnHold ? stitchTokens.amberBg : stitchTokens.parchment,
          borderWidth: 1.2,
          borderColor: isOnHold ? stitchTokens.orangeBorderSoft : stitchTokens.cardBorder,
          borderRadius: radius.card * 1.5,
          paddingHorizontal: space.md,
          paddingVertical: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="clock" size={15} color={isOnHold ? colors.warning : stitchTokens.subtleGray} />
          <AppText kind="bold" style={{ color: isOnHold ? colors.warning : stitchTokens.wineDark, fontSize: 13 }}>
            {isOnHold ? "TẠM DỪNG XEM XÉT" : "PHIÊN ĐÃ KẾT THÚC"}
          </AppText>
        </View>
        <AppText kind="small" color={colors.muted}>
          {isOnHold && auction.holdExpiresAt ? `Hạn xử lý: ${time(auction.holdExpiresAt)}` : time(auction.endAt)}
        </AppText>
      </View>
    );
  }

  const waiting = waitingTime(auction, now);
  const targetTime = scheduled ? Date.parse(waiting.at) : Date.parse(auction.endAt);
  const remainingMs = Math.max(0, targetTime - now);
  const isUrgent = open && remainingMs > 0 && remainingMs <= 5 * 60 * 1000;
  const isGraceDeadline = scheduled && waiting.label === "Hạn đăng ký";

  const totalSec = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  return (
    <View
      accessibilityRole="timer"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Thời gian còn lại: ${days > 0 ? `${days} ngày ` : ""}${hours} giờ ${minutes} phút ${seconds} giây`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: stitchTokens.scrimDark,
        borderWidth: 1.5,
        borderColor: isUrgent || isGraceDeadline ? stitchTokens.goldAccent : stitchTokens.peachBorder,
        borderRadius: radius.card * 1.5,
        paddingHorizontal: space.md,
        paddingVertical: 10,
        shadowColor: stitchTokens.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 5,
        elevation: 3,
      }}
    >
      {/* Left indicator */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: scheduled
              ? stitchTokens.goldAccent
              : isUrgent
                ? stitchTokens.goldAccent
                : stitchTokens.likeNewGreen,
          }}
        />
        <Icon
          name="clock"
          size={15}
          color={isUrgent || isGraceDeadline ? stitchTokens.goldAccent : stitchTokens.goldMedal}
        />
        <AppText
          kind="bold"
          style={{
            color: stitchTokens.white,
            fontSize: 13,
            letterSpacing: 0.3,
          }}
        >
          {isGraceDeadline ? "HẠN ĐĂNG KÝ" : scheduled ? "MỞ SAU" : isUrgent ? "SẮP KẾT THÚC" : "CÒN LẠI"}
        </AppText>
      </View>

      {/* Right digital tiles */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        {days > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <DigitBlock value={days} highlight={isUrgent || isGraceDeadline} />
            <AppText style={{ color: stitchTokens.white, fontSize: 11, fontWeight: "700" }}>d</AppText>
            <TimeSeparator />
          </View>
        ) : null}

        <DigitBlock value={hours} highlight={isUrgent || isGraceDeadline} />
        <TimeSeparator />
        <DigitBlock value={minutes} highlight={isUrgent || isGraceDeadline} />
        <TimeSeparator />
        <DigitBlock value={seconds} highlight={isUrgent || isGraceDeadline} />
      </View>
    </View>
  );
}

function AuctionBody({
  data,
  now,
  me,
  meLoading,
  signedIn,
  memberId,
  ownerIntake,
  ownerLoading,
  ownerError,
  ownerKnown,
  retryOwner,
  refresh,
}: {
  data: PublicAuction;
  now: number;
  me: Participation | null;
  meLoading: boolean;
  signedIn: boolean;
  memberId: string | null;
  ownerIntake: MyIntake | null;
  ownerLoading: boolean;
  ownerError: boolean;
  ownerKnown: boolean;
  retryOwner: () => void;
  refresh: () => Promise<unknown>;
}) {
  const { auction, history, leaderAlias } = data;
  const open = isOpen(auction, now);
  const scheduled = isScheduled(auction, now);
  const price = auction.currentPrice ?? auction.startPrice;
  const photos = auction.book?.photos ?? [];
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const buyNowTriggerRef = useRef<(() => void) | null>(null);
  const selectedMediaId = photos[selectedPhotoIndex]?.id ?? photos[0]?.id;
  const authors = auction.book?.authors.join(", ");
  const waiting = waitingTime(auction, now);
  const formatType = auction.auctionType ?? "English";
  const isDutch = formatType === "Dutch";
  const isSealed = isSealedFormat(auction);
  const formatBadgeLabel =
    formatType === "Dutch"
      ? "Kiểu Hà Lan · Giá giảm dần"
      : formatType === "SealedFirst"
        ? "Đấu giá kín · Giá thứ nhất"
        : formatType === "SealedSecond"
          ? "Đấu giá kín · Giá thứ hai"
          : "Đấu giá trả giá lên";

  return (
    <View style={{ gap: space.lg }}>
      {/* 1. Large Cover Gallery with Badges */}
      <View style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chạm để xem ảnh toàn màn hình"
          onPress={() => setFullscreenVisible(true)}
          style={{
            marginHorizontal: -space.xl,
            marginTop: -space.xl,
            aspectRatio: 1,
            maxHeight: 420,
            overflow: "hidden",
            backgroundColor: stitchTokens.parchment,
            borderBottomWidth: 1,
            borderBottomColor: stitchTokens.cardBorder,
            position: "relative",
          }}
        >
          <AuctionCover
            auctionId={auction.id}
            mediaId={selectedMediaId}
            label={auction.title}
            iconSize={48}
            resizeMode="cover"
          />

          {/* Floating State Badge */}
          <View
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              backgroundColor: open
                ? stitchTokens.wineDark
                : scheduled
                  ? stitchTokens.wineAlpha85
                  : stitchTokens.subtleGray,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            {open && (
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: stitchTokens.likeNewGreen,
                }}
              />
            )}
            <AppText
              kind="small"
              style={{
                color: stitchTokens.white,
                fontWeight: "700",
                fontSize: 11,
              }}
              numberOfLines={1}
            >
              {STATE_LABEL[auction.state].toUpperCase()}
            </AppText>
          </View>

          {/* Fullscreen Pill Trigger */}
          <View
            style={{
              position: "absolute",
              bottom: 12,
              right: 12,
              backgroundColor: stitchTokens.modalScrimDark,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Icon name="search" size={13} color={stitchTokens.white} />
            <AppText kind="small" style={{ color: stitchTokens.white, fontSize: 11, fontWeight: "600" }}>
              Toàn màn hình
            </AppText>
          </View>
        </Pressable>

        {/* Thumbnail Row if multiple photos */}
        {photos.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          >
            {photos.map((photo, idx) => {
              const active = idx === selectedPhotoIndex;
              return (
                <Pressable
                  key={photo.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Xem ảnh ${idx + 1}`}
                  onPress={() => setSelectedPhotoIndex(idx)}
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 8,
                    overflow: "hidden",
                    borderWidth: 2,
                    borderColor: active
                      ? stitchTokens.wineDark
                      : stitchTokens.cardBorder,
                    opacity: active ? 1 : 0.65,
                  }}
                >
                  <AuctionCover
                    auctionId={auction.id}
                    mediaId={photo.id}
                    label={`${auction.title} - ảnh ${idx + 1}`}
                    iconSize={16}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Fullscreen Modal Lightbox */}
      <AppModal
        visible={fullscreenVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: stitchTokens.black,
            justifyContent: "center",
            alignItems: "center",
            position: "relative",
          }}
        >
          {/* Header with counter and close */}
          <View
            style={{
              position: "absolute",
              top: 50,
              left: 16,
              right: 16,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              zIndex: 10,
            }}
          >
            <View
              style={{
                backgroundColor: stitchTokens.whiteAlpha25,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
              }}
            >
              <AppText style={{ color: stitchTokens.white, fontSize: 13, fontWeight: "700" }}>
                Ảnh {selectedPhotoIndex + 1} / {Math.max(1, photos.length)}
              </AppText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng xem toàn màn hình"
              hitSlop={12}
              onPress={() => setFullscreenVisible(false)}
              style={({ pressed }) => [
                {
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: stitchTokens.whiteAlpha25,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Icon name="close" size={20} color={stitchTokens.white} />
            </Pressable>
          </View>

          {/* Fullscreen Image Preview */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng toàn màn hình"
            style={{ width: "100%", height: "80%", justifyContent: "center", alignItems: "center" }}
            onPress={() => setFullscreenVisible(false)}
          >
            <AuctionCover
              auctionId={auction.id}
              mediaId={selectedMediaId}
              label={auction.title}
              iconSize={64}
              resizeMode="contain"
            />
          </Pressable>

          {/* Bottom Thumbnails Navigator */}
          {photos.length > 1 && (
            <View
              style={{
                position: "absolute",
                bottom: 36,
                left: 0,
                right: 0,
                alignItems: "center",
              }}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}
              >
                {photos.map((photo, idx) => {
                  const active = idx === selectedPhotoIndex;
                  return (
                    <Pressable
                      key={photo.id}
                      onPress={() => setSelectedPhotoIndex(idx)}
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 6,
                        overflow: "hidden",
                        borderWidth: 2,
                        borderColor: active ? stitchTokens.goldAccent : stitchTokens.whiteAlpha40,
                        opacity: active ? 1 : 0.6,
                      }}
                    >
                      <AuctionCover
                        auctionId={auction.id}
                        mediaId={photo.id}
                        label={`${auction.title} - ảnh ${idx + 1}`}
                        iconSize={16}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </AppModal>

      {/* 2. Dedicated Countdown Card (Khung riêng đếm ngược từng giây đặt trên tên sách) */}
      <AuctionTimerCard
        auction={auction}
        scheduled={scheduled}
        open={open}
        now={now}
      />

      {/* 3. Title & Author & Condition & Format Pills */}
      <View style={{ gap: space.xs }}>
        <AppText kind="bookTitle" color={colors.ink} accessibilityRole="header">
          {auction.title}
        </AppText>
        {authors ? (
          <AppText kind="reading" color={colors.muted}>
            Tác giả: <AppText kind="bold" color={colors.ink}>{authors}</AppText>
          </AppText>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {auction.book?.condition && (
            <View
              style={{
                backgroundColor: stitchTokens.roseWarmSurface,
                borderWidth: 1,
                borderColor: stitchTokens.peachBorder,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <AppText kind="small" style={{ color: stitchTokens.wineDark, fontWeight: "600" }}>
                Tình trạng: {conditionLabels[auction.book.condition] ?? auction.book.condition}
              </AppText>
            </View>
          )}

          <View
            style={{
              backgroundColor: stitchTokens.goldLight,
              borderWidth: 1,
              borderColor: stitchTokens.goldBorder,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Icon name={isSealed ? "lock" : isDutch ? "flame" : "gavel"} size={12} color={stitchTokens.wineDark} />
            <AppText kind="small" style={{ color: stitchTokens.wineDark, fontWeight: "700" }}>
              {formatBadgeLabel}
            </AppText>
          </View>

          {auction.buyNowPrice !== null && !isDutch && !isSealed && (
            <View
              style={{
                backgroundColor: stitchTokens.parchment,
                borderWidth: 1,
                borderColor: stitchTokens.peachBorder,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 3,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon name="bolt" size={12} color={stitchTokens.crimsonBolt} />
              <AppText kind="small" style={{ color: stitchTokens.wineDark, fontWeight: "600" }}>
                {auction.buyNowMode === "Instant" ? "Mua ngay: Kết thúc ngay" : "Mua ngay: Chờ thách đấu"}
              </AppText>
            </View>
          )}

          <View
            style={{
              backgroundColor: stitchTokens.parchment,
              borderWidth: 1,
              borderColor: stitchTokens.cardBorder,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Icon name="pin" size={12} color={stitchTokens.wineDark} />
            <AppText kind="small" style={{ color: stitchTokens.deepCocoa }}>
              {auction.pointName}
            </AppText>
          </View>
        </View>
      </View>

      {/* 4. Price & Bid Stats Card (3D Red Ombre) */}
      <View
        style={{
          borderRadius: radius.card * 2,
          overflow: "hidden",
          borderTopWidth: 1.5,
          borderTopColor: stitchTokens.cardBorderHighlightTop,
          borderLeftWidth: 1.2,
          borderLeftColor: stitchTokens.cardBorderHighlightLeft,
          borderRightWidth: 1.2,
          borderRightColor: stitchTokens.cardBorderShadowRight,
          borderBottomWidth: 3.5,
          borderBottomColor: stitchTokens.cardBorderShadowBottom,
          shadowColor: stitchTokens.shadowDeepCrimson,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.35,
          shadowRadius: 12,
          elevation: 6,
          position: "relative",
        }}
      >
        {/* SVG Red Ombre 3D Background */}
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <LinearGradient id="redOmbre3D" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={stitchTokens.ombreStop0} />
              <Stop offset="30%" stopColor={stitchTokens.ombreStop30} />
              <Stop offset="70%" stopColor={stitchTokens.ombreStop70} />
              <Stop offset="100%" stopColor={stitchTokens.ombreStop100} />
            </LinearGradient>
            <LinearGradient id="specularGlow" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor={stitchTokens.white} stopOpacity={0.18} />
              <Stop offset="45%" stopColor={stitchTokens.white} stopOpacity={0.03} />
              <Stop offset="100%" stopColor={stitchTokens.white} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#redOmbre3D)" />
          <Rect width="100%" height="65%" fill="url(#specularGlow)" />
        </Svg>

        {/* Top Tier: Price & Format / Buy Now 3D Action */}
        <View style={{ padding: space.lg, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <AppText
              kind="small"
              style={{
                color: stitchTokens.whitePinkText,
                fontWeight: "700",
                fontSize: 12,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              {isDutch
                ? open && auction.dutchPrice != null
                  ? "Giá Hà Lan hiện tại"
                  : scheduled
                    ? "Giá mở đầu (Hà Lan)"
                    : CLOSED_PRICE[auction.state] ?? "Giá cuối"
                : isSealed
                  ? open || scheduled
                    ? "Giá khởi điểm (Đấu giá kín)"
                    : CLOSED_PRICE[auction.state] ?? "Giá chốt"
                  : auction.currentPrice === null
                    ? "Giá khởi điểm"
                    : open
                      ? "Giá hiện tại"
                      : CLOSED_PRICE[auction.state] ?? "Giá cuối"}
            </AppText>
            <AppText
              kind="bookPrice"
              style={{
                color: stitchTokens.goldAccent,
                fontSize: 32,
                fontWeight: "900",
                letterSpacing: 0.5,
                marginVertical: 4,
                textShadowColor: stitchTokens.textShadowDeep,
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 4,
              }}
              selectable
              accessibilityLiveRegion="polite"
            >
              {formatVnd(
                isDutch
                  ? open && auction.dutchPrice != null
                    ? auction.dutchPrice
                    : scheduled
                      ? (auction.dutchTopPrice ?? auction.buyNowPrice ?? price)
                      : price
                  : isSealed && (open || scheduled)
                    ? auction.startPrice
                    : price,
              )}
            </AppText>
            {isDutch && (open || scheduled) ? (
              <AppText kind="small" style={{ color: stitchTokens.whitePinkTextMuted, fontSize: 11 }}>
                {`Giá sàn: ${formatVnd(auction.startPrice)} · Giảm -${formatVnd(auction.step)}`}
              </AppText>
            ) : isSealed && (open || scheduled) ? (
              <AppText kind="small" style={{ color: stitchTokens.whitePinkTextMuted, fontSize: 11 }}>
                Ẩn giá & người dẫn cho tới khi kết thúc
              </AppText>
            ) : null}
          </View>

          {!isDutch && !isSealed && auction.buyNowPrice !== null && open ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mua ngay với giá ${formatVnd(auction.buyNowPrice)}`}
              disabled={Boolean(ownerIntake) || me?.won}
              onPress={() => {
                if (!signedIn) {
                  router.push("/account");
                  return;
                }
                buyNowTriggerRef.current?.();
              }}
              style={({ pressed }) => [
                {
                  backgroundColor: stitchTokens.goldAccent,
                  borderTopWidth: 1.5,
                  borderTopColor: stitchTokens.goldLight,
                  borderLeftWidth: 1.2,
                  borderLeftColor: stitchTokens.goldLight,
                  borderRightWidth: 1.5,
                  borderRightColor: stitchTokens.goldCardBorderBottom,
                  borderBottomWidth: pressed ? 1.5 : 4.5,
                  borderBottomColor: stitchTokens.goldDark,
                  borderRadius: 14,
                  paddingHorizontal: 13,
                  paddingVertical: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  transform: [{ translateY: pressed ? 2.5 : 0 }],
                  opacity: ownerIntake || me?.won ? 0.65 : 1,
                  shadowColor: stitchTokens.black,
                  shadowOffset: { width: 0, height: pressed ? 1 : 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 5,
                  elevation: pressed ? 2 : 5,
                },
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: stitchTokens.crimsonBolt,
                  paddingHorizontal: 8,
                  paddingVertical: 2.5,
                  borderRadius: 8,
                  marginBottom: 3,
                }}
              >
                <Icon name="bolt" size={12} color={stitchTokens.goldAccent} />
                <AppText
                  kind="small"
                  style={{
                    color: stitchTokens.white,
                    fontWeight: "900",
                    fontSize: 10,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                  }}
                >
                  MUA NGAY
                </AppText>
              </View>
              <AppText
                kind="bold"
                style={{
                  color: stitchTokens.wineDark,
                  fontSize: 15,
                  fontWeight: "900",
                }}
              >
                {formatVnd(auction.buyNowPrice)}
              </AppText>
            </Pressable>
          ) : isDutch && (open || scheduled) ? (
            <View
              style={{
                backgroundColor: stitchTokens.goldLight,
                borderWidth: 1.5,
                borderColor: stitchTokens.goldCardBorder,
                borderBottomWidth: 3.5,
                borderBottomColor: stitchTokens.goldCardBorderBottom,
                borderRadius: 12,
                paddingHorizontal: 11,
                paddingVertical: 7,
                alignItems: "flex-end",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name="flame" size={13} color={stitchTokens.crimsonBolt} />
                <AppText kind="small" style={{ color: stitchTokens.crimsonBolt, fontWeight: "800", fontSize: 11 }}>
                  KIỂU HÀ LAN
                </AppText>
              </View>
              <AppText kind="bold" style={{ color: stitchTokens.crimsonDeepText, fontSize: 12, fontWeight: "800" }}>
                Chốt ngay khi bấm
              </AppText>
            </View>
          ) : isSealed && (open || scheduled) ? (
            <View
              style={{
                backgroundColor: stitchTokens.goldLight,
                borderWidth: 1.5,
                borderColor: stitchTokens.goldCardBorder,
                borderBottomWidth: 3.5,
                borderBottomColor: stitchTokens.goldCardBorderBottom,
                borderRadius: 12,
                paddingHorizontal: 11,
                paddingVertical: 7,
                alignItems: "flex-end",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name="lock" size={13} color={stitchTokens.crimsonBolt} />
                <AppText kind="small" style={{ color: stitchTokens.crimsonBolt, fontWeight: "800", fontSize: 11 }}>
                  GIÁ KÍN
                </AppText>
              </View>
              <AppText kind="bold" style={{ color: stitchTokens.crimsonDeepText, fontSize: 12, fontWeight: "800" }}>
                {formatType === "SealedSecond" ? "Trả mức cao #2" : "Trả đúng giá đặt"}
              </AppText>
            </View>
          ) : null}
        </View>

        {/* Bottom Tier: Stats Bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: space.lg,
            paddingVertical: 10,
            backgroundColor: stitchTokens.scrimDarkCrimson,
            borderTopWidth: 1,
            borderTopColor: stitchTokens.whiteAlpha15,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon
              name={scheduled && auction.minBidders != null ? "person" : "gavel"}
              size={14}
              color={stitchTokens.goldAccent}
            />
            <AppText kind="small" style={{ color: stitchTokens.whitePinkTextMuted, fontWeight: "600", fontSize: 12 }}>
              {scheduled && auction.minBidders != null
                ? `Đăng ký: ${auction.registeredCount ?? 0}/${auction.minBidders} người`
                : `${auction.bidderCount} người trả giá${auction.minBidders != null ? ` · ${auction.registeredCount ?? 0} đã ĐK` : ""}`}
            </AppText>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="clock" size={14} color={stitchTokens.goldAccent} />
            <AppText kind="small" style={{ color: stitchTokens.whitePinkTextMuted, fontWeight: "600", fontSize: 12 }}>
              {scheduled ? `${waiting.label}: ${time(waiting.at)}` : `Kết thúc: ${time(auction.endAt)}`}
            </AppText>
          </View>
        </View>
      </View>
      {open && auction.buyNowAt ? (
        <Notice tone="warning">
          {`Đã có người chọn mua ngay. Còn ${formatRemaining(Date.parse(auction.endAt) - now)} để trả cao hơn; hết giờ, người dẫn đầu thắng phiên.`}
        </Notice>
      ) : null}
      {ownerError && (
        <StatePanel title="Chưa kiểm tra được vai trò của bạn" message="Tải lại trước khi thực hiện thao tác trong phiên." action={{ label: "Thử lại kiểm tra vai trò", onPress: retryOwner }} />
      )}
      {/* Keep frozen command state mounted, with every control hidden during
          ownership recovery, including keyboard/accessibility interaction. */}
      <View style={ownerError ? { display: "none" } : undefined}>
      {ownerLoading ? (
        <StatePanel loading title="Đang kiểm tra vai trò của bạn trong phiên" />
      ) : signedIn && !ownerKnown ? null : ownerIntake && waitingForRegistrants(auction, now) ? (
        <WaitingSellerBlock auction={auction} now={now} refresh={refresh} />
      ) : ownerIntake ? (
        <View style={{ gap: space.sm }}>
          <Notice>
            <AppText kind="bold">Đây là phiên của bạn</AppText>{"\n"}
            {closeReasonText(auction)
              ? closeReasonText(auction)
              : auction.minBidders != null && open
              ? "Phiên đã mở nên bạn không đóng được nữa. Cần hỗ trợ, hãy dùng Báo cáo sự cố cho Admin."
              : scheduled
              ? `Phiên hẹn mở lúc ${time(auction.startAt)}. Bạn có thể đổi thời gian trong Phiên của tôi khi chưa có lượt trả giá.`
              : open && auction.bidderCount === 0
                ? "Chưa có lượt trả giá. Bạn có thể đổi thời gian trong Phiên của tôi. Người bán không tham gia trả giá."
                : `${STATE_LABEL[auction.state]}. Người bán theo dõi kết quả và không tham gia trả giá.`}
          </Notice>
          <Button wine secondary title="Xem hồ sơ gửi sách" onPress={() => router.push({ pathname: "/send-to-auction", params: { intakeId: ownerIntake.id } })} />
          <Button wine secondary title="Phiên của tôi" onPress={() => router.push("/my-auctions")} />
        </View>
      ) : me?.won ? (
        me.orderId ? (
          <WinnerSteps orderId={me.orderId} boughtNow={me.boughtNow} paused={ownerError} />
        ) : (
          <Notice tone="success">Đơn nhận sách đang được tạo. Trang sẽ tự cập nhật.</Notice>
        )
      ) : open && auction.state === "Active" ? (
        signedIn ? (
          meLoading ? (
            <StatePanel loading title="Đang tải lượt trả giá của bạn" />
          ) : (
            <BidPanel
              auction={auction}
              me={me}
              now={now}
              refresh={refresh}
              paused={ownerError}
              onRegisterBuyNow={(fn) => {
                buyNowTriggerRef.current = fn;
              }}
            />
          )
        ) : (
          <Button title="Đăng nhập để trả giá" onPress={() => router.push("/account")} />
        )
      ) : scheduled && signedIn && !meLoading && auction.state === "Active" && registrationBlocks(auction, me) ? (
        <BidPanel
          auction={auction}
          me={me}
          now={now}
          refresh={refresh}
          paused={ownerError}
          onRegisterBuyNow={(fn) => {
            buyNowTriggerRef.current = fn;
          }}
        />
      ) : scheduled ? (
        <Notice>
          {`Phiên chưa mở. ${auction.openMode ? `${openRuleText(auction, now)} ` : `Người bán hẹn mở lúc ${time(auction.startAt)}; `}khi phiên mở bạn có thể trả giá${auction.buyNowPrice !== null ? ` hoặc mua ngay với ${formatVnd(auction.buyNowPrice)}` : ""}.`}
        </Notice>
      ) : (
        <Notice>
          {auction.state === "OnHold"
            ? `Phiên tạm dừng để quản trị viên xem xét; phiên không nhận thêm giá.${auction.holdExpiresAt ? ` Nếu chưa được xử lý trước ${time(auction.holdExpiresAt)}, phiên tự hủy và mọi khoản giữ được hoàn.` : ""}`
            : closeReasonText(auction) ?? "Phiên không còn nhận trả giá."}
        </Notice>
      )}
      </View>
      {/* ADR 0078: the seller and members who registered or bid flag a problem to Admin. */}
      {memberId && !ownerError && (ownerIntake || me) ? (
        <AuctionFlag auction={auction} owner={memberId} />
      ) : null}
      <History
        auction={auction}
        open={open}
        scheduled={scheduled}
        history={history}
        state={auction.state}
        leaderAlias={leaderAlias}
        myAlias={me?.alias ?? null}
        startPrice={auction.startPrice}
      />
    </View>
  );
}

function BidPanel({
  auction,
  me,
  now,
  refresh,
  paused,
  onRegisterBuyNow,
}: {
  auction: PublicAuctionSummary;
  me: Participation | null;
  now: number;
  refresh: () => Promise<unknown>;
  paused: boolean;
  onRegisterBuyNow?: (fn: () => void) => void;
}) {
  const { client, state } = useSession();
  const queryClient = useQueryClient();
  const standing = standingOf(auction, me);
  const minimum = minimumBidOf(auction);
  const floor = autoFloor(auction, me);
  const [manual, setManual] = useState<string | null>(null);
  const [auto, setAuto] = useState("");
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [confirming, setConfirming] = useState<{ kind: AuctionCommandKind; amount: number } | null>(null);
  const [pending, setPending] = useState<AuctionCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticePrice, setNoticePrice] = useState<number | null>(null);
  const [wasLeading, setWasLeading] = useState(me?.leading ?? false);
  const [autoError, setAutoError] = useState<string | null>(null);

  if (wasLeading !== (me?.leading ?? false)) {
    setWasLeading(me?.leading ?? false);
    if (wasLeading && !me?.leading && !busy) {
      setNotice(null);
      setNoticePrice(null);
    }
  }

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      setNotice(null);
      setNoticePrice(null);
    }, 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  const manualAmount = manual === null ? minimum : Number(manual.replace(/\D/g, "")) || null;
  const manualError = manual === null ? null : amountError(manualAmount, minimum, auction.startPrice, auction.step);
  const locked = busy || !!pending;
  const capped = minimum > AUCTION_MAX_PRICE;
  const wallet = useQuery({
    queryKey: ["wallet"],
    queryFn: () => client.request("/me/wallet", walletSummary),
    enabled: state.status === "authenticated",
    retry: false,
  });
  // ADR 0075: the amount already held for this auction counts toward a raise.
  const heldHere = me?.heldAmount ?? 0;
  const available = wallet.data ? wallet.data.available + heldHere : null;
  const price = auction.currentPrice ?? auction.startPrice;

  useEffect(() => {
    if (!onRegisterBuyNow) return;
    onRegisterBuyNow(() => {
      if (locked || auction.buyNowPrice === null) return;
      if (registrationBlocks(auction, me)) {
        setError("Bạn cần đặt cọc đăng ký tham gia phiên và chờ đủ người trước khi mua ngay.");
        return;
      }
      if (instantNeedsRival(auction, me)) {
        setError("Mua ngay kết thúc phiên ngay, nên chỉ dùng được khi đã có người khác trả giá.");
        return;
      }
      if (fundsShortfall(auction.buyNowPrice, available) > 0) {
        setError(fundsHint(auction.buyNowPrice, available));
        return;
      }
      setConfirming({ kind: "BuyNow", amount: auction.buyNowPrice });
    });
  }, [onRegisterBuyNow, locked, auction, me, available]);

  const run = async (command: AuctionCommand) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setNoticePrice(null);
    try {
      const receipt = await sendAuctionCommand(client, command);
      setPending(null);
      setManual(null);
      setAuto("");
      setAutoExpanded(false);
      setNotice(receiptMessage(command.kind, command.amount, receipt, !!me?.leading, auction?.buyNowMode ?? "Challenge"));
      setNoticePrice(receipt.currentPrice);
    } catch (caught) {
      // An unknown outcome keeps the frozen request for "Thử lại".
      setPending(outcomeUnknown(caught) ? command : null);
      setError(auctionErrorText(caught));
    } finally {
      setBusy(false);
      setConfirming(null);
      if (state.status === "authenticated")
        void queryClient.invalidateQueries({ queryKey: participationKey(auction.id, state.user.id) });
      // ADR 0075: bids move wallet holds.
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void refresh();
    }
  };
  const copy = confirming && dialogCopy(confirming.kind, confirming.amount, auction, !!me?.leading);
  const english = (auction.auctionType ?? "English") === "English";
  const staleNotice =
    (noticePrice !== null && noticePrice !== price) ||
    (standing !== "lead" && notice !== null && notice.includes("dẫn"));
  return (
    <View style={{ gap: space.lg }}>
      {standing && (
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
            padding: space.md,
            borderRadius: radius.card * 1.5,
            borderWidth: 1.5,
            borderColor: standing === "lead" ? stitchTokens.greenBorderSoft : stitchTokens.orangeBorderSoft,
            backgroundColor: standing === "lead" ? stitchTokens.likeNewGreenBg : stitchTokens.amberBg,
          }}
        >
          <Icon
            name={standing === "lead" ? "check" : "flame"}
            size={18}
            color={standing === "lead" ? colors.success : colors.warning}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText kind="bold" color={standing === "lead" ? colors.success : colors.warning}>
              {standing === "lead" ? "Bạn đang dẫn giá" : standing === "tied" ? "Bạn trả bằng người dẫn giá" : "Bạn đã bị vượt giá"}
            </AppText>
            <AppText kind="small" color={colors.ink}>
              {standing === "tied"
                ? `Một người khác đã cam kết ${formatVnd(price)} trước bạn. Khi hai mức bằng nhau, người đặt trước dẫn giá. Trả từ ${formatVnd(minimum)} để vượt lên.`
                : me?.mode === "Auto" && me.ownLevel !== null
                  ? `Mức tự động tối đa của bạn: ${formatVnd(me.ownLevel)} (chỉ bạn thấy).${heldHere > 0 ? ` · Ví đang giữ ${formatVnd(heldHere)}.` : ""}`
                  : me?.ownLevel != null
                    ? `Lượt trả gần nhất của bạn: ${formatVnd(me.ownLevel)}.${heldHere > 0 ? ` · Ví đang giữ ${formatVnd(heldHere)}.` : ""}`
                    : ""}
            </AppText>
          </View>
        </View>
      )}
      {notice && !staleNotice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {pending ? (
        <View style={{ gap: space.sm }}>
          <Button title="Thử lại thao tác vừa rồi" busy={busy} onPress={() => void run(pending)} />
          <Button secondary title="Cập nhật trạng thái phiên" disabled={busy} onPress={() => void refresh()} />
        </View>
      ) : registrationBlocks(auction, me) ? (
        <RegisterBlock
          auction={auction}
          me={me}
          now={now}
          available={available}
          locked={locked}
          onRegister={(deposit) => setConfirming({ kind: "Register", amount: deposit })}
          onWithdraw={() => setConfirming({ kind: "Withdraw", amount: 0 })}
        />
      ) : auction.auctionType === "Dutch" ? (
        <DutchBlock
          auction={auction}
          now={now}
          available={available}
          locked={locked}
          refresh={refresh}
          onAccept={(dutchPrice) => setConfirming({ kind: "DutchAccept", amount: dutchPrice })}
        />
      ) : isSealedFormat(auction) ? (
        <SealedBlock
          auction={auction}
          me={me}
          available={available}
          locked={locked}
          onSubmit={(amount) => setConfirming({ kind: "Sealed", amount })}
        />
      ) : standing === "lead" ? (
        <View
          style={{
            padding: space.md,
            borderRadius: radius.card * 1.5,
            backgroundColor: stitchTokens.whiteSurface,
            borderWidth: 1,
            borderColor: stitchTokens.peachBorder,
          }}
        >
          <AppText color={colors.muted}>
            Bạn không cần trả thêm. Muốn giữ vị trí khi có người trả cao hơn, hãy đặt hoặc nâng mức tự động bên dưới.
          </AppText>
        </View>
      ) : capped ? (
        <View
          style={{
            padding: space.md,
            borderRadius: radius.card * 1.5,
            backgroundColor: stitchTokens.whiteSurface,
            borderWidth: 1,
            borderColor: stitchTokens.cardBorder,
          }}
        >
          <AppText color={colors.muted}>Giá đã chạm mức tối đa hệ thống hỗ trợ.</AppText>
        </View>
      ) : (
        /* Card 1: Khung Trả giá trực tiếp (Direct Bidding Card) */
        <View
          style={{
            gap: space.md,
            padding: space.lg,
            borderRadius: radius.card * 2,
            backgroundColor: stitchTokens.whiteSurface,
            borderWidth: 1.5,
            borderColor: stitchTokens.peachBorder,
            shadowColor: stitchTokens.black,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 6,
            elevation: 2,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="gavel" size={17} color={stitchTokens.wineDark} />
              <AppText kind="bold" style={{ fontSize: 16, color: stitchTokens.wineDark }}>
                Đặt mức trả giá
              </AppText>
            </View>
            <View
              style={{
                backgroundColor: stitchTokens.parchment,
                borderWidth: 1,
                borderColor: stitchTokens.cardBorder,
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 2,
              }}
            >
              <AppText kind="small" style={{ color: stitchTokens.subtleGray, fontSize: 11 }}>
                Bước: +{formatVnd(auction.step)}
              </AppText>
            </View>
          </View>

          <View style={{ gap: space.xs }}>
            <AppText kind="small" color={colors.muted} style={{ fontWeight: "600" }}>
              Chọn nhanh mức trả:
            </AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {bidOptions(minimum, auction.step).map((value) => {
                const isSelected = manualAmount === value;
                return (
                  <Pressable
                    key={value}
                    disabled={locked}
                    onPress={() => setManual(String(value))}
                    style={({ pressed }) => [
                      {
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: radius.pill,
                        borderWidth: 1.5,
                        borderColor: isSelected ? stitchTokens.wineDark : stitchTokens.peachBorder,
                        backgroundColor: isSelected ? stitchTokens.wineDark : stitchTokens.parchment,
                        opacity: locked ? 0.6 : pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <AppText
                      kind="bold"
                      style={{
                        color: isSelected ? stitchTokens.white : stitchTokens.wineDark,
                        fontSize: 14,
                      }}
                    >
                      {formatVnd(value)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <TextField
            label="Số tiền trả lượt này"
            keyboardType="number-pad"
            value={manual ?? String(minimum)}
            editable={!locked}
            onChangeText={(text) => setManual(text.replace(/\D/g, ""))}
            hint={`Lượt tiếp theo tối thiểu ${formatVnd(minimum)}. ${heldHere > 0 ? `Ví đang giữ ${formatVnd(heldHere)} cho phiên này; bị vượt giá thì tiền về lại ví. ` : "Khi dẫn giá, ví giữ đúng mức bạn cam kết. "}${fundsHint(manualAmount, available) ?? ""}`.trim()}
            error={manualError ?? (fundsShortfall(manualAmount, available) ? (fundsHint(manualAmount, available) ?? undefined) : undefined)}
          />

          <Button
            wine
            title={manualAmount ? `Tiếp tục trả ${formatVnd(manualAmount)}` : "Tiếp tục"}
            disabled={locked || !!manualError || !manualAmount || fundsShortfall(manualAmount, available) > 0}
            onPress={() => manualAmount && setConfirming({ kind: "Manual", amount: manualAmount })}
          />
        </View>
      )}
      {/* Card 2: Khung Đặt giá tự động (Collapsible Auto-bid Card) */}
      {!pending && !registrationBlocks(auction, me) && english && floor <= AUCTION_MAX_PRICE && (
        <View
          style={{
            borderRadius: radius.card * 1.5,
            borderWidth: 1.5,
            borderColor: stitchTokens.wineDark,
            backgroundColor: stitchTokens.wineDark,
            overflow: "hidden",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={autoExpanded ? "Thu gọn đặt giá tự động" : "Mở rộng đặt giá tự động"}
            accessibilityState={{ expanded: autoExpanded }}
            onPress={() => setAutoExpanded(!autoExpanded)}
            style={({ pressed }) => [
              layout.row,
              {
                justifyContent: "space-between",
                alignItems: "center",
                padding: space.md,
                backgroundColor: stitchTokens.wineDark,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <View style={{ gap: 2, flex: 1, paddingRight: space.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="tune" size={16} color={stitchTokens.whiteSurface} />
                <AppText kind="bold" style={{ color: stitchTokens.whiteSurface }}>
                  {me?.mode === "Auto" ? "Nâng mức tự động" : "Đặt giá tự động"}
                </AppText>
                {me?.mode === "Auto" && (
                  <View style={{ backgroundColor: stitchTokens.goldAccent, paddingVertical: 2, paddingHorizontal: 6, borderRadius: radius.small }}>
                    <AppText kind="small" style={{ fontSize: 11, color: stitchTokens.wineDark, fontWeight: "700" }}>
                      Đang bật
                    </AppText>
                  </View>
                )}
              </View>
              {!autoExpanded && (
                <AppText kind="small" style={{ color: stitchTokens.whiteAlpha85 }} numberOfLines={1}>
                  {me?.mode === "Auto" && me.ownLevel !== null
                    ? `Mức trần: ${formatVnd(me.ownLevel)} · Chạm để nâng`
                    : `Hệ thống tự trả theo bước giá, tối thiểu ${formatVnd(floor)}`}
                </AppText>
              )}
            </View>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: stitchTokens.whiteAlpha25,
                borderWidth: 1,
                borderColor: stitchTokens.whiteAlpha40,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name={autoExpanded ? "chevronUp" : "chevronDown"}
                size={16}
                color={stitchTokens.whiteSurface}
              />
            </View>
          </Pressable>

          {autoExpanded && (
            <View style={{ gap: space.sm, padding: space.md, backgroundColor: stitchTokens.goldLight, borderTopWidth: 1, borderTopColor: stitchTokens.wineLight }}>
              <AppText kind="small" color={colors.muted} style={{ lineHeight: 18 }}>
                Khi có người trả cao hơn, hệ thống tự trả hơn họ một bước giá, không vượt mức tối đa bạn chọn. Chỉ bạn
                thấy mức này và chỉ có thể nâng lên.
              </AppText>
              <TextField
                label="Mức tối đa"
                keyboardType="number-pad"
                value={auto}
                editable={!locked}
                placeholder={String(floor)}
                onChangeText={(text) => {
                  setAuto(text.replace(/\D/g, ""));
                  setAutoError(null);
                }}
                hint={`Tối thiểu ${formatVnd(floor)}`}
                error={autoError ?? undefined}
              />
              <Button
                wine
                title={me?.mode === "Auto" ? "Nâng mức tự động" : "Đặt giá tự động"}
                disabled={locked}
                onPress={() => {
                  const amount = Number(auto) || null;
                  const problem =
                    amountError(amount, floor, auction.startPrice, auction.step) ??
                    (fundsShortfall(amount, available) ? fundsHint(amount, available) : null);
                  if (problem) setAutoError(problem);
                  else setConfirming({ kind: "Auto", amount: amount! });
                }}
              />
              {me?.mode === "Auto" && (
                <Button secondary title="Tắt đặt giá tự động" disabled={locked} onPress={() => setConfirming({ kind: "Disable", amount: 0 })} />
              )}
            </View>
          )}
        </View>
      )}
      <ConfirmDialog
        visible={!!copy && !paused}
        title={copy?.title ?? ""}
        message={copy?.message ?? ""}
        confirmLabel={copy?.confirm ?? ""}
        busy={busy}
        onCancel={() => !busy && setConfirming(null)}
        onConfirm={() =>
          confirming &&
          void run(createAuctionCommand(auction.id, confirming.kind, confirming.amount, Crypto.randomUUID()))
        }
      />
    </View>
  );
}

function dialogCopy(kind: AuctionCommandKind, amount: number, auction: PublicAuctionSummary, leading: boolean) {
  const pay = `Nếu thắng, bạn thanh toán từ ví trong 24 giờ sau khi phiên kết thúc và tự nhận sách tại ${auction.pointName}. Không thanh toán đúng hạn sẽ bị ghi nhận vi phạm.`;
  switch (kind) {
    case "Manual":
      return { title: `Trả ${formatVnd(amount)}?`, message: `Lượt trả giá không thể rút lại. ${pay}`, confirm: "Xác nhận trả giá" };
    case "Auto":
      return {
        title: `Đặt giá tự động tối đa ${formatVnd(amount)}?`,
        message: `Hệ thống chỉ trả vừa đủ để bạn dẫn: cao hơn người khác một bước ${formatVnd(auction.step)}, không vượt mức này. ${pay}`,
        confirm: "Đặt giá tự động",
      };
    case "Disable":
      return {
        title: "Tắt đặt giá tự động?",
        message: "Hệ thống ngừng trả thay bạn. Nếu bạn đang dẫn, bạn vẫn cam kết mua ở giá hiện tại.",
        confirm: "Tắt tự động",
      };
    case "Register":
      return {
        title: `Đặt cọc ${formatVnd(amount)} để đăng ký?`,
        message: `Ví giữ ${formatVnd(amount)} ngay. Tiền cọc được hoàn khi bạn không thắng, phiên không đủ người hoặc bị hủy; bạn có thể rút đăng ký trước khi phiên đủ ${auction.minBidders ?? 2} người. Nếu thắng mà không thanh toán trong 24 giờ, tiền cọc chuyển cho nền tảng.`,
        confirm: "Đặt cọc và đăng ký",
      };
    case "Withdraw":
      return {
        title: "Rút đăng ký?",
        message: "Tiền cọc về lại ví ngay. Bạn có thể đăng ký lại khi phiên còn mở.",
        confirm: "Rút đăng ký",
      };
    case "DutchAccept":
      return {
        title: `Mua với ${formatVnd(amount)}?`,
        message: `Nếu giá đã giảm khi lệnh tới máy chủ, bạn trả giá thấp hơn đó. Ví giữ số tiền này ngay; phiên kết thúc và bạn thanh toán từ ví trong 24 giờ, rồi tự nhận sách tại ${auction.pointName}. Không thể rút lại.`,
        confirm: "Chấp nhận giá",
      };
    case "Sealed":
      return {
        title: `Gửi giá kín ${formatVnd(amount)}?`,
        message: `Giá kín không thể rút hay hạ, chỉ có thể nâng. Ví giữ toàn bộ số tiền này đến khi phiên chốt; nếu không thắng, tiền về lại ví. ${pay}`,
        confirm: "Gửi giá kín",
      };
    case "BuyNow":
      return {
        title: `Mua ngay với ${formatVnd(amount)}?`,
        message:
          auction.buyNowMode === "Instant"
            ? `Bạn cam kết mua với giá này, thắng luôn và phiên kết thúc ngay lập tức. Ví giữ số tiền này ngay; bạn thanh toán từ ví trong 24 giờ sau khi phiên kết thúc, rồi tự nhận sách tại ${auction.pointName}. Lượt mua ngay không thể rút lại; không thanh toán đúng hạn sẽ bị ghi nhận vi phạm.`
            : `Bạn cam kết mua với giá này và ${leading ? "giữ vị trí dẫn đầu; giá hiện tại tăng lên giá mua ngay" : "dẫn đầu"}. Người khác còn ${buyNowWindow(leading)} để trả cao hơn; nếu không ai vượt, bạn thắng và thanh toán từ ví trong 24 giờ sau khi phiên kết thúc, rồi tự nhận sách tại ${auction.pointName}. Lượt mua ngay không thể rút lại; không thanh toán đúng hạn sẽ bị ghi nhận vi phạm.`,
        confirm: "Mua ngay",
      };
  }
}

// ADR 0077: register with a refundable deposit; bidding opens at minBidders.
function RegisterBlock({
  auction,
  me,
  now,
  available,
  locked,
  onRegister,
  onWithdraw,
}: {
  auction: PublicAuctionSummary;
  me: Participation | null;
  now: number;
  available: number | null;
  locked: boolean;
  onRegister: (deposit: number) => void;
  onWithdraw: () => void;
}) {
  const deposit = auction.depositAmount ?? 0;
  const need = auction.minBidders ?? 2;
  const count = auction.registeredCount ?? 0;
  const registered = me?.registrationState === "Registered";
  const short = registered ? 0 : fundsShortfall(deposit, available);
  const progressPct = Math.min(100, Math.round((count / Math.max(1, need)) * 100));
  const enough = count >= need;

  return (
    <View
      style={{
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.card * 2,
        backgroundColor: stitchTokens.whiteSurface,
        borderWidth: 1.5,
        borderColor: registered ? stitchTokens.greenBorderSoft : stitchTokens.goldBorder,
        shadowColor: stitchTokens.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      {/* Header Row */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: registered ? stitchTokens.likeNewGreenBg : stitchTokens.goldLight,
              borderWidth: 1,
              borderColor: registered ? stitchTokens.greenBorderSoft : stitchTokens.goldBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              name={registered ? "verified" : "shield"}
              size={18}
              color={registered ? stitchTokens.likeNewGreen : stitchTokens.wineDark}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppText kind="bold" style={{ fontSize: 16, color: stitchTokens.wineDark }}>
              {registered ? "Bạn đã đăng ký phiên này" : "Đăng ký tham gia đấu giá"}
            </AppText>
            <AppText kind="small" color={colors.muted}>
              {registered ? "Đã giữ tiền cọc hợp lệ trong ví" : "Đặt cọc 10% trước khi vào sàn trả giá"}
            </AppText>
          </View>
        </View>

        <View
          style={{
            backgroundColor: registered ? stitchTokens.likeNewGreenBg : stitchTokens.goldLight,
            borderWidth: 1,
            borderColor: registered ? stitchTokens.greenBorderSoft : stitchTokens.goldBorder,
            borderRadius: radius.pill,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <AppText
            kind="small"
            style={{
              fontSize: 11,
              fontWeight: "800",
              color: registered ? stitchTokens.likeNewGreen : stitchTokens.wineDark,
            }}
          >
            {registered ? "ĐÃ ĐĂNG KÝ" : "CỌC 10%"}
          </AppText>
        </View>
      </View>

      {/* Progress Bar Section */}
      <View
        style={{
          backgroundColor: stitchTokens.parchment,
          borderRadius: 12,
          padding: 12,
          borderWidth: 1,
          borderColor: stitchTokens.cardBorder,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <AppText kind="small" style={{ color: stitchTokens.deepCocoa, fontWeight: "700" }}>
            Tiến độ người đăng ký mở phiên
          </AppText>
          <AppText
            kind="bold"
            style={{
              fontSize: 13,
              color: enough ? stitchTokens.likeNewGreen : stitchTokens.wineDark,
            }}
          >
            {`${count} / ${need} người`}
          </AppText>
        </View>

        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: need, now: count }}
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: stitchTokens.sandWarm,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${progressPct}%`,
              height: "100%",
              borderRadius: 4,
              backgroundColor: enough ? stitchTokens.likeNewGreen : stitchTokens.wineDark,
            }}
          />
        </View>

        <AppText kind="small" color={colors.muted} style={{ lineHeight: 17 }}>
          {`${auction.openMode ? openRuleText(auction, now) : `Phiên mở trả giá khi có ít nhất ${need} người đăng ký.`} Phiên chỉ bán khi có ít nhất hai người trả giá.`}
        </AppText>
      </View>

      {/* Deposit & Wallet 2-Column Summary */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: stitchTokens.roseWarmSurface,
            borderWidth: 1,
            borderColor: stitchTokens.peachBorder,
            borderRadius: 10,
            padding: 10,
            gap: 2,
          }}
        >
          <AppText kind="small" color={colors.muted} style={{ fontSize: 11 }}>
            {registered ? "Tiền cọc đang giữ" : "Mức tiền cọc"}
          </AppText>
          <AppText kind="bold" style={{ fontSize: 16, color: stitchTokens.wineDark }}>
            {formatVnd(registered ? (me?.deposit ?? deposit) : deposit)}
          </AppText>
          <AppText kind="small" style={{ fontSize: 10, color: stitchTokens.subtleGray }}>
            Hoàn 100% nếu không thắng
          </AppText>
        </View>

        <View
          style={{
            flex: 1,
            backgroundColor: stitchTokens.parchment,
            borderWidth: 1,
            borderColor: stitchTokens.cardBorder,
            borderRadius: 10,
            padding: 10,
            gap: 2,
          }}
        >
          <AppText kind="small" color={colors.muted} style={{ fontSize: 11 }}>
            Số dư ví khả dụng
          </AppText>
          <AppText kind="bold" style={{ fontSize: 16, color: stitchTokens.deepCocoa }}>
            {available !== null ? formatVnd(available) : "—"}
          </AppText>
          <AppText kind="small" style={{ fontSize: 10, color: stitchTokens.subtleGray }}>
            {registered ? "Cọc tính vào giá khi thắng" : "Giữ cọc ngay khi đăng ký"}
          </AppText>
        </View>
      </View>

      <AppText kind="small" color={colors.muted} style={{ lineHeight: 17 }}>
        {registered
          ? `Ví đang giữ ${formatVnd(me?.deposit ?? deposit)} tiền cọc. Bạn có thể rút đăng ký khi phiên chưa đủ người.`
          : `Tiền cọc ${formatVnd(deposit)} được hoàn khi bạn không thắng hoặc phiên không đủ người. Nếu thắng, tiền cọc tính vào giá; thắng mà không thanh toán đúng hạn thì không được hoàn.`}
      </AppText>

      {short > 0 && (
        <Notice tone="error">{fundsHint(deposit, available)}</Notice>
      )}

      {registered ? (
        <Button
          secondary
          title="Rút đăng ký và nhận lại tiền cọc"
          disabled={locked}
          onPress={onWithdraw}
        />
      ) : (
        <Button
          wine
          title={`Đặt cọc ${formatVnd(deposit)} và đăng ký`}
          disabled={locked || short > 0}
          onPress={() => onRegister(deposit)}
        />
      )}
    </View>
  );
}

// ADR 0076: the descending price; refetches when it drops.
function DutchBlock({
  auction,
  now,
  available,
  locked,
  refresh,
  onAccept,
}: {
  auction: PublicAuctionSummary;
  now: number;
  available: number | null;
  locked: boolean;
  refresh: () => Promise<unknown>;
  onAccept: (price: number) => void;
}) {
  const price = auction.dutchPrice ?? null;
  useEffect(() => {
    if (!auction.dutchNextDropAt) return;
    const wait = Math.max(0, Date.parse(auction.dutchNextDropAt) - Date.now()) + 250;
    const timer = setTimeout(() => void refresh(), wait);
    return () => clearTimeout(timer);
  }, [auction.dutchNextDropAt, refresh]);

  if (price === null) {
    return (
      <View
        style={{
          padding: space.md,
          borderRadius: radius.card * 1.5,
          backgroundColor: stitchTokens.parchment,
          borderWidth: 1,
          borderColor: stitchTokens.cardBorder,
        }}
      >
        <AppText color={colors.muted}>Giá kiểu Hà Lan sẽ xuất hiện ngay khi phiên mở.</AppText>
      </View>
    );
  }

  const short = fundsShortfall(price, available);
  const topPrice = auction.dutchTopPrice ?? auction.buyNowPrice ?? price;
  const nextDropMs = auction.dutchNextDropAt ? Math.max(0, Date.parse(auction.dutchNextDropAt) - now) : 0;
  const nextDropSec = Math.ceil(nextDropMs / 1000);

  return (
    <View
      style={{
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.card * 2,
        backgroundColor: stitchTokens.whiteSurface,
        borderWidth: 1.5,
        borderColor: stitchTokens.goldBorder,
        shadowColor: stitchTokens.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="flame" size={18} color={stitchTokens.wineDark} />
          <AppText kind="bold" style={{ fontSize: 16, color: stitchTokens.wineDark }}>
            Đấu giá kiểu Hà Lan
          </AppText>
        </View>
        <View
          style={{
            backgroundColor: stitchTokens.goldLight,
            borderWidth: 1,
            borderColor: stitchTokens.goldBorder,
            borderRadius: radius.pill,
            paddingHorizontal: 9,
            paddingVertical: 3,
          }}
        >
          <AppText kind="small" style={{ color: stitchTokens.wineDark, fontWeight: "800", fontSize: 11 }}>
            {auction.dutchNextDropAt ? `Giảm sau ${nextDropSec}s` : "Đã ở giá sàn"}
          </AppText>
        </View>
      </View>

      {/* 3-Step Price Ladder Strip */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: stitchTokens.parchment,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: stitchTokens.cardBorder,
          padding: 10,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ alignItems: "flex-start" }}>
          <AppText kind="small" color={colors.muted} style={{ fontSize: 10 }}>
            Giá mở đầu
          </AppText>
          <AppText kind="bold" style={{ fontSize: 13, color: stitchTokens.subtleGray }}>
            {formatVnd(topPrice)}
          </AppText>
        </View>

        <Icon name="arrow" size={14} color={stitchTokens.goldBronze} />

        <View
          style={{
            alignItems: "center",
            backgroundColor: stitchTokens.roseWarmSurface,
            borderWidth: 1,
            borderColor: stitchTokens.peachBorder,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <AppText kind="small" style={{ fontSize: 10, color: stitchTokens.wineDark, fontWeight: "700" }}>
            Giá hiện tại
          </AppText>
          <AppText kind="bold" style={{ fontSize: 16, color: stitchTokens.wineDark }}>
            {formatVnd(price)}
          </AppText>
        </View>

        <Icon name="arrow" size={14} color={stitchTokens.goldBronze} />

        <View style={{ alignItems: "flex-end" }}>
          <AppText kind="small" color={colors.muted} style={{ fontSize: 10 }}>
            Giá sàn
          </AppText>
          <AppText kind="bold" style={{ fontSize: 13, color: stitchTokens.deepCocoa }}>
            {formatVnd(auction.startPrice)}
          </AppText>
        </View>
      </View>

      <AppText kind="small" color={colors.muted} style={{ lineHeight: 18 }}>
        {auction.dutchNextDropAt
          ? `Giảm ${formatVnd(auction.step)} lúc ${time(auction.dutchNextDropAt)}, xuống tối đa giá sàn ${formatVnd(auction.startPrice)}.`
          : `Đã ở giá sàn ${formatVnd(auction.startPrice)}.`}{" "}
        Người đầu tiên chấp nhận thắng ngay và phiên kết thúc.
      </AppText>

      {short > 0 && <Notice tone="error">{fundsHint(price, available)}</Notice>}

      <Button
        wine
        title={`Chấp nhận mua ngay ${formatVnd(price)}`}
        disabled={locked || short > 0}
        onPress={() => onAccept(price)}
      />
    </View>
  );
}

// ADR 0076: one hidden bid, raise only; the whole bid is held until the close.
function SealedBlock({
  auction,
  me,
  available,
  locked,
  onSubmit,
}: {
  auction: PublicAuctionSummary;
  me: Participation | null;
  available: number | null;
  locked: boolean;
  onSubmit: (amount: number) => void;
}) {
  const second = auction.auctionType === "SealedSecond";
  const own = me?.ownLevel ?? null;
  const floor = own !== null ? own + auction.step : auction.startPrice;
  const [text, setText] = useState(String(floor));
  const amount = Number(text) || null;
  const error =
    amountError(amount, floor, auction.startPrice, auction.step) ??
    (fundsShortfall(amount, available) ? fundsHint(amount, available) : null);

  return (
    <View
      style={{
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.card * 2,
        backgroundColor: stitchTokens.whiteSurface,
        borderWidth: 1.5,
        borderColor: stitchTokens.peachBorder,
        shadowColor: stitchTokens.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flex: 1 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: stitchTokens.goldLight,
              borderWidth: 1,
              borderColor: stitchTokens.goldBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="lock" size={16} color={stitchTokens.wineDark} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText kind="bold" style={{ fontSize: 16, color: stitchTokens.wineDark }}>
              Đấu giá kín · {second ? "giá thứ hai" : "giá thứ nhất"}
            </AppText>
            <AppText kind="small" color={colors.muted}>
              {second ? "Thắng giá cao nhất, trả mức cao thứ hai" : "Thắng giá cao nhất, trả đúng giá đã gửi"}
            </AppText>
          </View>
        </View>

        <View
          style={{
            backgroundColor: stitchTokens.parchment,
            borderWidth: 1,
            borderColor: stitchTokens.cardBorder,
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <AppText kind="small" style={{ color: stitchTokens.wineDark, fontWeight: "700", fontSize: 11 }}>
            Bước: +{formatVnd(auction.step)}
          </AppText>
        </View>
      </View>

      <AppText kind="small" color={colors.muted} style={{ lineHeight: 18 }}>
        Không ai thấy giá của người khác cho tới khi phiên kết thúc. Giá cao nhất thắng
        {second ? " nhưng chỉ trả bằng giá cao thứ hai (hoặc giá khởi điểm nếu chỉ một người)." : " và trả đúng giá mình gửi."}
        {" "}Ví giữ toàn bộ giá kín; nếu không thắng, tiền về lại ví khi phiên chốt.
      </AppText>

      {/* Current Own Sealed Bid Box */}
      {own !== null && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: stitchTokens.goldLight,
            borderWidth: 1.5,
            borderColor: stitchTokens.goldBorder,
            borderRadius: 12,
            padding: 12,
          }}
        >
          <View style={{ gap: 2 }}>
            <AppText kind="small" style={{ color: stitchTokens.wineDark, fontWeight: "700" }}>
              Giá kín hiện tại của bạn (chỉ bạn thấy)
            </AppText>
            <AppText kind="small" color={colors.muted} style={{ fontSize: 11 }}>
              {me?.heldAmount ? `Ví đang giữ ${formatVnd(me.heldAmount)} · Chỉ có thể nâng lên` : "Chỉ có thể nâng lên"}
            </AppText>
          </View>
          <AppText kind="bold" style={{ fontSize: 18, color: stitchTokens.wineDark }}>
            {formatVnd(own)}
          </AppText>
        </View>
      )}

      {/* Quick Picks */}
      <View style={{ gap: space.xs }}>
        <AppText kind="small" color={colors.muted} style={{ fontWeight: "600" }}>
          Chọn nhanh mức giá kín:
        </AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {bidOptions(floor, auction.step).map((value) => {
            const isSelected = amount === value;
            return (
              <Pressable
                key={value}
                disabled={locked}
                onPress={() => setText(String(value))}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: radius.pill,
                    borderWidth: 1.5,
                    borderColor: isSelected ? stitchTokens.wineDark : stitchTokens.peachBorder,
                    backgroundColor: isSelected ? stitchTokens.wineDark : stitchTokens.parchment,
                    opacity: locked ? 0.6 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <AppText
                  kind="bold"
                  style={{
                    color: isSelected ? stitchTokens.white : stitchTokens.wineDark,
                    fontSize: 14,
                  }}
                >
                  {formatVnd(value)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TextField
        label={own === null ? "Giá kín của bạn" : "Nâng giá kín lên"}
        keyboardType="number-pad"
        value={text}
        editable={!locked}
        onChangeText={(t) => setText(t.replace(/\D/g, ""))}
        hint={`Tối thiểu ${formatVnd(floor)}, bước ${formatVnd(auction.step)}. ${fundsHint(amount, available) ?? ""}`.trim()}
        error={error ?? undefined}
      />
      <Button
        wine
        title={
          amount
            ? own === null
              ? `Gửi giá kín ${formatVnd(amount)}`
              : `Nâng giá kín lên ${formatVnd(amount)}`
            : "Gửi giá kín"
        }
        disabled={locked || !!error || !amount}
        onPress={() => amount && onSubmit(amount)}
      />
    </View>
  );
}

function History({
  auction,
  open,
  scheduled,
  history,
  state,
  leaderAlias,
  myAlias,
  startPrice,
}: {
  auction: PublicAuctionSummary;
  open: boolean;
  scheduled: boolean;
  history: PublicAuction["history"];
  state: AuctionState;
  leaderAlias: number | null;
  myAlias: number | null;
  startPrice: number;
}) {
  const sealedLive = isSealedFormat(auction) && (open || scheduled);

  return (
    <View
      style={{
        gap: space.sm,
        padding: space.lg,
        borderRadius: radius.card * 2,
        backgroundColor: stitchTokens.whiteSurface,
        borderWidth: 1,
        borderColor: stitchTokens.cardBorder,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name={sealedLive ? "lock" : "clock"} size={16} color={stitchTokens.wineDark} />
          <AppText kind="bold" accessibilityRole="header" style={{ fontSize: 16, color: stitchTokens.wineDark }}>
            Diễn biến giá
          </AppText>
        </View>
        {!sealedLive && history.length > 0 && (
          <View
            style={{
              backgroundColor: stitchTokens.parchment,
              borderRadius: radius.pill,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderWidth: 1,
              borderColor: stitchTokens.cardBorder,
            }}
          >
            <AppText kind="small" style={{ fontSize: 11, color: stitchTokens.subtleGray, fontWeight: "700" }}>
              {history.length} lượt
            </AppText>
          </View>
        )}
      </View>

      {sealedLive ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: stitchTokens.parchment,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: stitchTokens.cardBorder,
          }}
        >
          <Icon name="eyeOff" size={16} color={stitchTokens.subtleGray} />
          <AppText kind="small" color={colors.muted} style={{ flex: 1, lineHeight: 17 }}>
            Phiên đấu giá kín bảo mật toàn bộ lượt trả giá cho tới khi phiên kết thúc. Giá khởi điểm {formatVnd(startPrice)}.
          </AppText>
        </View>
      ) : history.length === 0 ? (
        <AppText kind="small" color={colors.muted}>
          Chưa có lượt trả giá. Giá khởi điểm {formatVnd(startPrice)}.
        </AppText>
      ) : (
        history.map((event, index) => {
          const isMe = event.bidderAlias === myAlias;
          const who = isMe ? "Bạn" : `Người trả giá #${event.bidderAlias}`;
          const badge = TOP_BADGE[state];
          const top = index === 0 && event.bidderAlias === leaderAlias && badge !== undefined;
          return (
            <View
              key={`${event.at}-${index}`}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: space.md,
                paddingVertical: 8,
                paddingHorizontal: top ? 10 : 4,
                borderRadius: top ? 8 : 0,
                backgroundColor: top ? stitchTokens.likeNewGreenBg : "transparent",
                borderBottomWidth: index === history.length - 1 ? 0 : 1,
                borderColor: colors.rule,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
                <AppText
                  kind={top || isMe ? "bold" : "small"}
                  color={top ? colors.forest : isMe ? stitchTokens.wineDark : colors.ink}
                  style={{ flexShrink: 1 }}
                >
                  {who}
                </AppText>
                {top && (
                  <View
                    style={{
                      backgroundColor: stitchTokens.likeNewGreen,
                      paddingHorizontal: 6,
                      paddingVertical: 1.5,
                      borderRadius: 4,
                    }}
                  >
                    <AppText kind="small" style={{ color: stitchTokens.white, fontSize: 10, fontWeight: "700" }}>
                      {badge.toUpperCase()}
                    </AppText>
                  </View>
                )}
                <AppText kind="small" color={colors.muted} style={{ fontSize: 11 }}>
                  · {time(event.at)}
                </AppText>
              </View>
              <AppText kind="bold" style={{ color: top ? colors.forest : stitchTokens.wineDark }}>
                {formatVnd(event.price)}
              </AppText>
            </View>
          );
        })
      )}
    </View>
  );
}
