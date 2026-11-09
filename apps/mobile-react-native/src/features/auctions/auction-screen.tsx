import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../core/api/session-client";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  BackAction,
  Button,
  Chip,
  ConfirmDialog,
  Icon,
  Notice,
  Screen,
  StatePanel,
  TextField,
  colors,
  formatVnd,
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
  canWithdrawRegistration,
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
  SecondChanceOffered: "Người thắng không thanh toán; đang mời người trả giá cao thứ hai",
};
// Same wording as user-web: only a won or bought auction has a final price.
const CLOSED_PRICE: Partial<Record<AuctionState, string>> = {
  BuyNowPending: "Giá mua ngay",
  AwaitingWinnerPayment: "Giá chốt",
  Sold: "Giá chốt",
  PaymentExpired: "Giá thắng (chưa thanh toán)",
  SecondChanceOffered: "Giá thắng (chưa thanh toán)",
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
  const selectedMediaId = photos[selectedPhotoIndex]?.id ?? photos[0]?.id;
  const authors = auction.book?.authors.join(", ");

  return (
    <View style={{ gap: space.lg }}>
      {/* 1. Large Cover Gallery with Badges */}
      <View style={{ gap: 8 }}>
        <View
          style={{
            width: "100%",
            aspectRatio: 3 / 4,
            maxHeight: 340,
            borderRadius: radius.card * 2,
            overflow: "hidden",
            backgroundColor: stitchTokens.parchment,
            borderWidth: 1,
            borderColor: stitchTokens.cardBorder,
            position: "relative",
            alignSelf: "center",
          }}
        >
          <AuctionCover
            auctionId={auction.id}
            mediaId={selectedMediaId}
            label={auction.title}
            iconSize={48}
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
            >
              {STATE_LABEL[auction.state].toUpperCase()}
            </AppText>
          </View>

          {/* Floating Countdown Pill */}
          <View
            style={{
              position: "absolute",
              bottom: 12,
              right: 12,
              backgroundColor: stitchTokens.scrimDark,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Icon name="clock" size={13} color={stitchTokens.goldAccent} />
            <AppText
              kind="small"
              style={{
                color: stitchTokens.white,
                fontWeight: "700",
                fontSize: 11,
              }}
            >
              {scheduled
                ? `${waitingTime(auction, now).label === "Mở lúc" ? "Mở sau" : "Hết hạn đăng ký sau"} ${formatRemaining(Date.parse(waitingTime(auction, now).at) - now)}`
                : open
                  ? `Còn ${formatRemaining(Date.parse(auction.endAt) - now)}`
                  : `Đã kết thúc`}
            </AppText>
          </View>
        </View>

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

      {/* 2. Title & Author & Condition */}
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

      {/* 3. Inspection & Trust Banner */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
          padding: 12,
          borderRadius: radius.card,
          backgroundColor: stitchTokens.roseWarmSurface,
          borderWidth: 1,
          borderColor: stitchTokens.peachBorder,
        }}
      >
        <Icon name="verified" size={18} color={stitchTokens.wineDark} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText kind="bold" style={{ fontSize: 13, color: stitchTokens.wineDark }}>
            Đã kiểm định trước khi lên sàn
          </AppText>
          <AppText kind="small" color={colors.muted} style={{ lineHeight: 16 }}>
            Bản sách đã được nhân viên kiểm tra đạt chuẩn tại điểm giao nhận {auction.pointName}. Người thắng nhận sách an tâm trực tiếp tại điểm.
          </AppText>
        </View>
      </View>

      {/* 4. Price & Bid Stats Card */}
      <View
        style={{
          gap: space.sm,
          padding: space.lg,
          borderRadius: radius.card * 1.5,
          backgroundColor: stitchTokens.whiteSurface,
          borderWidth: 1.5,
          borderColor: stitchTokens.peachBorder,
          shadowColor: stitchTokens.black,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 5,
          elevation: 2,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <AppText kind="small" color={colors.muted}>
              {auction.currentPrice === null
                ? "Giá khởi điểm"
                : open
                  ? "Giá hiện tại"
                  : CLOSED_PRICE[auction.state] ?? "Giá cuối"}
            </AppText>
            <AppText
              kind="bookPrice"
              color={stitchTokens.wineDark}
              style={{ fontSize: 26, fontWeight: "800", marginVertical: 2 }}
              selectable
              accessibilityLiveRegion="polite"
            >
              {formatVnd(price)}
            </AppText>
          </View>

          {auction.buyNowPrice !== null && open && (
            <View
              style={{
                backgroundColor: stitchTokens.roseWarmSurface,
                borderWidth: 1,
                borderColor: stitchTokens.peachBorder,
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 5,
                alignItems: "flex-end",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Icon name="bolt" size={13} color={stitchTokens.wineDark} />
                <AppText kind="small" style={{ color: stitchTokens.wineDark, fontWeight: "700" }}>
                  Mua ngay
                </AppText>
              </View>
              <AppText kind="bold" style={{ color: stitchTokens.wineDark, fontSize: 13 }}>
                {formatVnd(auction.buyNowPrice)}
              </AppText>
            </View>
          )}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: space.xs,
            borderTopWidth: 1,
            borderTopColor: stitchTokens.cardBorder,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="gavel" size={13} color={stitchTokens.subtleGray} />
            <AppText kind="small" color={colors.muted}>
              {auction.bidderCount} người trả giá · bước {formatVnd(auction.step)}
            </AppText>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="clock" size={13} color={stitchTokens.subtleGray} />
            <AppText kind="small" color={colors.muted}>
              {time(auction.endAt)}
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
      ) : signedIn && auction.state === "SecondChanceOffered" && me?.secondChance?.outcome === "Offered" ? (
        // ADR 0086: the runner-up answers the one offer.
        <BidPanel auction={auction} me={me} now={now} refresh={refresh} paused={ownerError} />
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
            <BidPanel auction={auction} me={me} now={now} refresh={refresh} paused={ownerError} />
          )
        ) : (
          <Button title="Đăng nhập để trả giá" onPress={() => router.push("/account")} />
        )
      ) : scheduled && signedIn && !meLoading && auction.state === "Active"
        && (registrationBlocks(auction, me) || canWithdrawRegistration(auction, me, now)) ? (
        <BidPanel auction={auction} me={me} now={now} refresh={refresh} paused={ownerError} />
      ) : scheduled ? (
        <Notice>
          {`Phiên chưa mở. Người bán hẹn mở lúc ${time(auction.startAt)}; khi đó bạn có thể trả giá${auction.buyNowPrice !== null ? ` hoặc mua ngay với ${formatVnd(auction.buyNowPrice)}` : ""}.`}
        </Notice>
      ) : (
        <Notice>
          {auction.state === "OnHold"
            ? `Phiên tạm dừng để quản trị viên xem xét; phiên không nhận thêm giá. Nếu phiên tiếp tục, thời gian tạm dừng được cộng lại.${auction.holdExpiresAt ? ` Nếu chưa được xử lý trước ${time(auction.holdExpiresAt)}, phiên tự hủy và mọi khoản giữ được hoàn.` : ""}`
            : closeReasonText(auction) ?? "Phiên không còn nhận trả giá."}
        </Notice>
      )}
      </View>
      {/* ADR 0078: the seller and members who registered or bid flag a problem to Admin. */}
      {memberId && !ownerError && (ownerIntake || me) ? (
        <AuctionFlag auction={auction} owner={memberId} />
      ) : null}
      <History history={history} state={auction.state} leaderAlias={leaderAlias} myAlias={me?.alias ?? null} startPrice={auction.startPrice} />
    </View>
  );
}

function BidPanel({
  auction,
  me,
  now,
  refresh,
  paused,
}: {
  auction: PublicAuctionSummary;
  me: Participation | null;
  // Server-corrected clock from the screen (render stays pure).
  now: number;
  refresh: () => Promise<unknown>;
  paused: boolean;
}) {
  const { client, state } = useSession();
  const queryClient = useQueryClient();
  const standing = standingOf(auction, me);
  const minimum = minimumBidOf(auction);
  const floor = autoFloor(auction, me);
  const [manual, setManual] = useState<string | null>(null);
  const [auto, setAuto] = useState("");
  const [confirming, setConfirming] = useState<{ kind: AuctionCommandKind; amount: number } | null>(null);
  const [pending, setPending] = useState<AuctionCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);
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

  const run = async (command: AuctionCommand) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const receipt = await sendAuctionCommand(client, command);
      setPending(null);
      setManual(null);
      setAuto("");
      setNotice(receiptMessage(command.kind, command.amount, receipt, !!me?.leading, auction?.buyNowMode ?? "Challenge"));
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
  return (
    <View style={{ gap: space.lg }}>
      {standing && (
        <View
          accessibilityLiveRegion="polite"
          style={{
            gap: space.xs,
            padding: space.lg,
            borderRadius: radius.card,
            backgroundColor: standing === "lead" ? colors.successSurface : colors.warningSurface,
          }}
        >
          <AppText kind="bold" color={standing === "lead" ? colors.success : colors.warning}>
            {standing === "lead" ? "Bạn đang dẫn giá" : standing === "tied" ? "Bạn trả bằng người dẫn giá" : "Bạn đã bị vượt giá"}
          </AppText>
          <AppText kind="small" color={colors.ink}>
            {standing === "tied"
              ? `Một người khác đã cam kết ${formatVnd(price)} trước bạn. Khi hai mức bằng nhau, người đặt trước dẫn giá. Trả từ ${formatVnd(minimum)} để vượt lên.`
              : me?.mode === "Auto" && me.ownLevel !== null
                ? `Mức tự động tối đa của bạn: ${formatVnd(me.ownLevel)} (chỉ bạn thấy).`
                : me?.ownLevel != null
                  ? `Lượt trả gần nhất của bạn: ${formatVnd(me.ownLevel)}.`
                  : ""}
          </AppText>
        </View>
      )}
      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {pending ? (
        <View style={{ gap: space.sm }}>
          <Button title="Thử lại thao tác vừa rồi" busy={busy} onPress={() => void run(pending)} />
          <Button secondary title="Cập nhật trạng thái phiên" disabled={busy} onPress={() => void refresh()} />
        </View>
      ) : auction.state === "SecondChanceOffered" && me?.secondChance?.outcome === "Offered" ? (
        <SecondChanceBlock offer={me.secondChance} available={available} locked={locked} pointName={auction.pointName}
          onAccept={() => setConfirming({ kind: "SecondChanceAccept", amount: me.secondChance!.price })}
          onDecline={() => setConfirming({ kind: "SecondChanceDecline", amount: me.secondChance!.price })} />
      ) : registrationBlocks(auction, me) || canWithdrawRegistration(auction, me, now) ? (
        <RegisterBlock auction={auction} me={me} now={now} available={available} locked={locked}
          onRegister={(deposit) => setConfirming({ kind: "Register", amount: deposit })}
          onWithdraw={() => setConfirming({ kind: "Withdraw", amount: 0 })} />
      ) : auction.auctionType === "Dutch" ? (
        <DutchBlock auction={auction} available={available} locked={locked} refresh={refresh}
          onAccept={(price) => setConfirming({ kind: "DutchAccept", amount: price })} />
      ) : isSealedFormat(auction) ? (
        <SealedBlock auction={auction} me={me} available={available} locked={locked}
          onSubmit={(amount) => setConfirming({ kind: "Sealed", amount })} />
      ) : standing === "lead" ? (
        <AppText color={colors.muted}>
          Bạn không cần trả thêm. Muốn giữ vị trí khi có người trả cao hơn, hãy đặt hoặc nâng mức tự động.
        </AppText>
      ) : capped ? (
        <AppText color={colors.muted}>Giá đã chạm mức tối đa hệ thống hỗ trợ.</AppText>
      ) : (
        <View style={{ gap: space.md }}>
          <AppText kind="bold">Chọn nhanh mức trả</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {bidOptions(minimum, auction.step).map((value) => (
              <Chip
                key={value}
                wine
                title={formatVnd(value)}
                selected={manualAmount === value}
                disabled={locked}
                onPress={() => setManual(String(value))}
              />
            ))}
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
      {!pending && english && floor <= AUCTION_MAX_PRICE && (
        <View style={{ gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderColor: colors.rule }}>
          <AppText kind="bold">{me?.mode === "Auto" ? "Nâng mức tự động" : "Đặt giá tự động"}</AppText>
          <AppText kind="small" color={colors.muted}>
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
            secondary
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
      {!pending && english && auction.buyNowPrice !== null && (
        <View style={{ gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderColor: colors.rule }}>
          <AppText kind="bold">Mua ngay {formatVnd(auction.buyNowPrice)}</AppText>
          <AppText kind="small" color={colors.muted}>
            {me?.leading
              ? "Kết thúc sớm: giá lên giá mua ngay, người khác còn 60 giây để trả cao hơn."
              : "Còn dùng được khi giá hiện tại thấp hơn giá mua ngay. Sau khi bấm, người khác còn 5 phút để trả cao hơn."}
          </AppText>
          {fundsShortfall(auction.buyNowPrice, available) > 0 && (
            <AppText kind="small" color={colors.error}>
              {fundsHint(auction.buyNowPrice, available)}
            </AppText>
          )}
          {instantNeedsRival(auction, me) && (
            <AppText kind="small" color={colors.muted}>
              Mua ngay kết thúc phiên ngay, nên chỉ dùng được khi đã có người khác trả giá.
            </AppText>
          )}
          <Button
            secondary
            title="Mua ngay"
            disabled={locked || fundsShortfall(auction.buyNowPrice, available) > 0 || instantNeedsRival(auction, me)}
            onPress={() => setConfirming({ kind: "BuyNow", amount: auction.buyNowPrice! })}
          />
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
          void run(createAuctionCommand(auction.id, confirming.kind, confirming.amount, Crypto.randomUUID(), auction.version ?? 0))
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
    case "SecondChanceAccept":
      return {
        title: `Mua với giá ${formatVnd(amount)}?`,
        message: `Ví giữ ${formatVnd(amount)} ngay và bạn thanh toán trong 24 giờ để nhận sách tại ${auction.pointName}. Không thanh toán đúng hạn thì lượt không thanh toán được ghi nhận.`,
        confirm: "Mua sách",
      };
    case "SecondChanceDecline":
      return {
        title: "Từ chối lời mời mua?",
        message: "Phiên kết thúc và sách được trả lại người bán. Bạn không thể nhận lại lời mời này.",
        confirm: "Không mua",
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
        message: `Bạn cam kết mua với giá này và ${leading ? "giữ vị trí dẫn đầu; giá hiện tại tăng lên giá mua ngay" : "dẫn đầu"}. Người khác còn ${buyNowWindow(leading)} để trả cao hơn; nếu không ai vượt, bạn thắng và thanh toán từ ví trong 24 giờ sau khi phiên kết thúc, rồi tự nhận sách tại ${auction.pointName}. Lượt mua ngay không thể rút lại; không thanh toán đúng hạn sẽ bị ghi nhận vi phạm.`,
        confirm: "Mua ngay",
      };
  }
}

// ADR 0086: the runner-up's one offer after the winner did not pay.
function SecondChanceBlock({ offer, available, locked, pointName, onAccept, onDecline }: {
  offer: NonNullable<Participation["secondChance"]>;
  available: number | null;
  locked: boolean;
  pointName: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const short = fundsShortfall(offer.price, available);
  const until = new Date(offer.deadline).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  return (
    <View style={{ gap: space.sm }}>
      <AppText kind="bold">Bạn được mời mua sách này</AppText>
      <AppText kind="small" color={colors.muted}>
        {`Người thắng không thanh toán đúng hạn. Bạn có thể mua với giá trả cao nhất của bạn, ${formatVnd(offer.price)}, nếu nhận trước ${until}. Khi nhận, ví giữ số tiền này và bạn thanh toán trong 24 giờ để nhận sách tại ${pointName}. Không nhận thì không có khoản nào bị trừ.`}
      </AppText>
      {short > 0 && <AppText kind="small" color={colors.error}>{fundsHint(offer.price, available)}</AppText>}
      <Button wine title={`Mua với giá ${formatVnd(offer.price)}`} disabled={locked || short > 0} onPress={onAccept} />
      <Button secondary title="Không mua" disabled={locked} onPress={onDecline} />
    </View>
  );
}

// ADR 0077: register with a refundable deposit; bidding opens at minBidders.
function RegisterBlock({ auction, me, now, available, locked, onRegister, onWithdraw }: {
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
  // ADR 0085: below the minimum, or a full auction until 72 h before it opens.
  const withdrawable = canWithdrawRegistration(auction, me, now);
  const fullUntil = count >= need && auction.fullWithdrawUntil
    ? new Date(auction.fullWithdrawUntil).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
    : null;
  return (
    <View style={{ gap: space.sm }}>
      <AppText kind="bold">{registered ? "Bạn đã đăng ký phiên này" : "Đăng ký để tham gia đấu giá"}</AppText>
      <AppText kind="small" color={colors.muted}>
        {`${auction.openMode ? openRuleText(auction) : `Phiên mở trả giá khi có ít nhất ${need} người đăng ký.`} Hiện có ${count}/${need}. Phiên chỉ bán khi có ít nhất hai người trả giá.`}
      </AppText>
      <AppText kind="small" color={colors.muted}>
        {registered
          ? `Ví đang giữ ${formatVnd(me?.deposit ?? deposit)} tiền cọc. ${withdrawable
            ? fullUntil
              ? `Phiên đã đủ người; bạn vẫn rút đăng ký được tới ${fullUntil} (72 giờ trước giờ mở).`
              : "Bạn có thể rút đăng ký khi phiên chưa đủ người."
            : "Phiên đã đủ người nên tiền cọc được giữ đến khi phiên kết thúc."}`
          : `Tiền cọc ${formatVnd(deposit)} được hoàn khi bạn không thắng hoặc phiên không đủ người. Nếu thắng, tiền cọc tính vào giá; thắng mà không thanh toán đúng hạn thì không được hoàn.`}
      </AppText>
      {short > 0 && <AppText kind="small" color={colors.error}>{fundsHint(deposit, available)}</AppText>}
      {registered ? (
        withdrawable && <Button secondary title="Rút đăng ký và nhận lại tiền cọc" disabled={locked} onPress={onWithdraw} />
      ) : (
        <Button wine title={`Đặt cọc ${formatVnd(deposit)} và đăng ký`} disabled={locked || short > 0} onPress={() => onRegister(deposit)} />
      )}
    </View>
  );
}

// ADR 0076: the descending price; refetches when it drops.
function DutchBlock({ auction, available, locked, refresh, onAccept }: {
  auction: PublicAuctionSummary;
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
  if (price === null) return <AppText color={colors.muted}>Giá kiểu Hà Lan hiện khi phiên mở.</AppText>;
  const short = fundsShortfall(price, available);
  return (
    <View style={{ gap: space.sm }}>
      <AppText kind="bold">Giá hiện tại {formatVnd(price)}</AppText>
      <AppText kind="small" color={colors.muted}>
        {auction.dutchNextDropAt
          ? `Giảm ${formatVnd(auction.step)} lúc ${time(auction.dutchNextDropAt)}, xuống tối đa giá sàn ${formatVnd(auction.startPrice)}.`
          : `Đã ở giá sàn ${formatVnd(auction.startPrice)}.`}{" "}
        Người đầu tiên chấp nhận thắng ngay và phiên kết thúc.
      </AppText>
      {short > 0 && <AppText kind="small" color={colors.error}>{fundsHint(price, available)}</AppText>}
      <Button wine title={`Chấp nhận ${formatVnd(price)}`} disabled={locked || short > 0} onPress={() => onAccept(price)} />
    </View>
  );
}

// ADR 0076: one hidden bid, raise only; the whole bid is held until the close.
function SealedBlock({ auction, me, available, locked, onSubmit }: {
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
    <View style={{ gap: space.sm }}>
      <AppText kind="bold">Đấu giá kín · {second ? "giá thứ hai" : "giá thứ nhất"}</AppText>
      <AppText kind="small" color={colors.muted}>
        Không ai thấy giá của người khác cho tới khi phiên kết thúc. Giá cao nhất thắng
        {second ? " nhưng chỉ trả bằng giá cao thứ hai (hoặc giá khởi điểm nếu chỉ một người)." : " và trả đúng giá mình gửi."}
        {" "}Ví giữ toàn bộ giá kín; nếu không thắng, tiền về lại ví khi phiên chốt.
      </AppText>
      {own !== null && (
        <AppText kind="small">{`Giá kín của bạn: ${formatVnd(own)}${me?.heldAmount ? ` · ví đang giữ ${formatVnd(me.heldAmount)}` : ""}. Chỉ có thể nâng.`}</AppText>
      )}
      <TextField
        label={own === null ? "Giá kín của bạn" : "Nâng giá kín lên"}
        keyboardType="number-pad"
        value={text}
        editable={!locked}
        onChangeText={(t) => setText(t.replace(/\D/g, ""))}
        hint={`Tối thiểu ${formatVnd(floor)}, bước ${formatVnd(auction.step)}.`}
        error={error ?? undefined}
      />
      <Button wine title={amount ? `Gửi giá kín ${formatVnd(amount)}` : "Gửi giá kín"} disabled={locked || !!error || !amount} onPress={() => amount && onSubmit(amount)} />
    </View>
  );
}

function History({
  history,
  state,
  leaderAlias,
  myAlias,
  startPrice,
}: {
  history: PublicAuction["history"];
  state: AuctionState;
  leaderAlias: number | null;
  myAlias: number | null;
  startPrice: number;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <AppText kind="bold" accessibilityRole="header">
        Diễn biến giá
      </AppText>
      {history.length === 0 ? (
        <AppText kind="small" color={colors.muted}>
          Chưa có lượt trả giá. Giá khởi điểm {formatVnd(startPrice)}.
        </AppText>
      ) : (
        history.map((event, index) => {
          const who = event.bidderAlias === myAlias ? "Bạn" : `Người trả giá #${event.bidderAlias}`;
          const badge = TOP_BADGE[state];
          const top = index === 0 && event.bidderAlias === leaderAlias && badge !== undefined;
          return (
            <View
              key={`${event.at}-${index}`}
              style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: space.xs, borderBottomWidth: 1, borderColor: colors.rule }}
            >
              <AppText kind="small" color={top ? colors.forest : colors.ink} style={{ flexShrink: 1 }}>
                {who}
                {top ? ` · ${badge}` : ""} · {time(event.at)}
              </AppText>
              <AppText kind="bold">{formatVnd(event.price)}</AppText>
            </View>
          );
        })
      )}
    </View>
  );
}
