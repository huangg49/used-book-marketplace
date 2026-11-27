import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../core/api/session-client";
import { auctionBidHoldNotes, auctionRegistrationNotes, auctionSellerAmounts, auctionSellerSaleLabels, serverClock, type TransactionNote } from "@used-books/session-client";
import { TransactionAmount, TransactionNotes } from "../../core/ui/transaction-review";
import { SaleFeeBreakdown } from "../../core/ui/sale-fee-breakdown";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { readAuctionNewest, useAuctionLive } from "./use-auction-live";
import { useTransactionLive } from "../../core/hooks/use-transaction-live";
import { useAuctionNow } from "./use-auction-now";
import {
  CLOSING_POLL_MS,
  FALLBACK_POLL_MS,
  LIVE_BACKSTOP_MS,
  isClosing,
} from "./auction-live-model";
import {
  AppText,
  Button,
  ConfirmDialog,
  Icon,
  Notice,
  Screen,
  StatePanel,
  TextField,
  WineHeader,
  colors,
  formatVnd,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import {
  AuctionBookCondition,
  AuctionSessionOverview,
  auctionHeaderSubtitle,
} from "./components/auction-session-overview";
import { ManualAuctionBidSheet } from "./components/manual-auction-bid-sheet";
import { AutoBidSheet } from "./components/auto-bid-sheet";
import { AuctionBidHistory } from "./components/auction-bid-history";
import { DemoSkipButton } from "./components/demo-skip-button";
import {
  AUCTION_MAX_PRICE,
  AUCTION_MIN_BIDDERS_FLOOR,
  advanceDemoAuction,
  amountError,
  auctionErrorText,
  auctionOptions,
  autoFloor,
  bidOptions,
  createAuctionCommand,
  formatRemaining,
  AUCTIONS_QUERY_KEY,
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

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const time = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });

export function AuctionScreen({ id, openBidInitially = false }: { id: string; openBidInitially?: boolean }) {
  const { client, state } = useSession();
  const foreground = useForeground();
  const valid = UUID.test(id);
  const member =
    state.status === "authenticated" && state.user.roles.includes("MEMBER")
      ? state.user.id
      : null;
  const queryClient = useQueryClient();
  const pushing = useAuctionLive(valid ? id : "", valid && foreground);
  const poll = pushing ? LIVE_BACKSTOP_MS : FALLBACK_POLL_MS;
  const detail = useQuery({
    ...auctionOptions(client, id),
    queryFn: () => readAuctionNewest(client, queryClient, id),
    enabled: valid && foreground,
    retry: false,
    refetchInterval: (query) =>
      foreground && query.state.data?.auction.state === "Active" ? poll : false,
  });
  const me = useQuery({
    ...participationOptions(client, id, member ?? ""),
    enabled: valid && foreground && !!member,
    retry: (failures, error) => failures === 0 && error instanceof ApiError &&
      (error.status === 0 || error.status >= 500),
    retryDelay: 200,
    refetchInterval: (query) =>
      !foreground
        ? false
        : query.state.data?.won && !query.state.data.orderId
          ? 3000
          : detail.data?.auction.state === "Active"
            ? poll
            : false,
  });
  const ownIntakes = useQuery({
    queryKey: ["my-auction-intakes", member, "auction", id],
    queryFn: () => client.request(`/me/auction-intakes?auctionId=${encodeURIComponent(id)}`, myIntakes),
    enabled: valid && foreground && !!member,
    retry: false,
    staleTime: 0,
    refetchInterval: ({ state: qState }) => {
      const status = qState.data?.items[0]?.sellerSale?.status;
      return foreground && (status === "AwaitingPayment" || status === "PendingSettlement") ? 15_000 : false;
    },
  });
  const now = useAuctionNow(detail.data?.serverTime, foreground);
  const [manualOpen, setManualOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const requestedBid = useRef(openBidInitially);

  const auction = detail.data?.auction;
  const shownNow = now || (detail.data ? Date.parse(detail.data.serverTime) : 0);
  const participationReady = !!member && !me.isPending && !me.isError && me.data !== undefined;
  const ownershipReady = !!member && !!ownIntakes.data && !ownIntakes.isError;
  const ownerIntake = ownIntakes.data?.items.find((item) => item.auctionId === id) ?? null;
  const sellerView = !!ownerIntake;
  const saleState = auction?.state;
  const { refetch: refreshIntakes } = ownIntakes;
  const sellerSale = ownerIntake?.sellerSale;
  useTransactionLive("point-order", sellerSale?.orderId ?? "", foreground &&
    (sellerSale?.status === "AwaitingPayment" || sellerSale?.status === "PendingSettlement"),
    () => { void refreshIntakes(); },
  );

  useEffect(() => {
    if (
      foreground &&
      sellerView &&
      (saleState === "AwaitingWinnerPayment" || saleState === "BuyNowPending" || saleState === "Sold")
    ) {
      void refreshIntakes();
    }
  }, [foreground, sellerView, saleState, refreshIntakes]);

  const open = !!auction && isOpen(auction, shownNow);
  const scheduled = !!auction && isScheduled(auction, shownNow);
  const canManual =
    !!auction &&
    participationReady &&
    ownershipReady &&
    !ownerIntake &&
    !detail.error &&
    canPlaceManualBid(auction, me.data ?? null, shownNow);
  const leadingEnglishLive =
    !!auction &&
    participationReady &&
    ownershipReady &&
    !ownerIntake &&
    !detail.error &&
    open &&
    (auction.auctionType ?? "English") === "English" &&
    !!me.data?.leading &&
    !me.data?.won;
  const guestCanJoin =
    !member &&
    !!auction &&
    !detail.error &&
    (open || (scheduled && auction.minBidders != null));
  const canReport = !!member && !!auction && !ownIntakes.isError && (!!ownerIntake || !!me.data);

  useEffect(() => {
    if (!canManual || !requestedBid.current) return;
    const timer = setTimeout(() => {
      requestedBid.current = false;
      setManualOpen(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [canManual]);

  const closing = !!detail.data && !!now && isClosing(detail.data.auction, now);
  const { refetch: refetchDetail } = detail;
  const { refetch: refetchMe } = me;
  useEffect(() => {
    if (!closing || !foreground) return;
    const timer = setInterval(() => {
      void refetchDetail();
      if (member) void refetchMe();
    }, CLOSING_POLL_MS);
    return () => clearInterval(timer);
  }, [closing, foreground, member, refetchDetail, refetchMe]);

  const unavailable =
    !valid || (detail.error instanceof ApiError && detail.error.status === 404);

  const minimum = auction ? minimumBidOf(auction) : null;
  const stickyFooter = canManual ? (
    <View style={styles.dock}>
      <View style={styles.dockSummary}>
        <AppText kind="small" color={stitchTokens.brownMuted}>Mức trả tối thiểu</AppText>
        <AppText kind="bold" style={styles.dockPrice}>{minimum != null ? formatVnd(minimum) : "—"}</AppText>
      </View>
      <Button wine title="Trả giá" onPress={() => setManualOpen(true)} />
    </View>
  ) : leadingEnglishLive && auction ? (
    <View style={styles.dockLeading}>
      <View style={styles.dockLeadingInfo}>
        <View style={styles.dockLeadingBadge}>
          <Icon name="check" size={14} color={stitchTokens.likeNewGreen} />
          <AppText kind="bold" style={styles.dockLeadingText}>Bạn đang dẫn giá</AppText>
        </View>
        <AppText kind="small" color={stitchTokens.brownMuted}>
          {me.data?.mode === "Auto" && me.data.ownLevel != null
            ? `Tự động tối đa ${formatVnd(me.data.ownLevel)}`
            : `Giá hiện tại ${formatVnd(auction.currentPrice ?? auction.startPrice)}`}
        </AppText>
      </View>
      {autoFloor(auction, me.data ?? null) <= AUCTION_MAX_PRICE ? (
        <Button
          wine
          secondary
          title={me.data?.mode === "Auto" ? "Sửa tự động" : "Đặt tự động"}
          onPress={() => setAutoOpen(true)}
        />
      ) : null}
    </View>
  ) : guestCanJoin ? (
    <Button wine title="Đăng nhập để trả giá" onPress={() => router.push("/account")} />
  ) : undefined;

  return (
    <Screen
      appearance="paper"
      canvasColor={stitchTokens.creamBg}
      headerExtendsToStatusBar
      footer={stickyFooter}
      header={
        <WineHeader
          title="Phiên đấu giá"
          subtitle={auction ? auctionHeaderSubtitle(auction, open, scheduled, shownNow) : undefined}
          onBack={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/auctions");
          }}
          rightIcon={canReport ? "shield" : undefined}
          rightLabel="Báo cáo sự cố cho Admin"
          onRightPress={canReport ? () => setReportOpen(true) : undefined}
        />
      }
    >
      {unavailable ? (
        <StatePanel
          wine
          title="Không tìm thấy phiên"
          message="Phiên đấu giá không còn ở đường dẫn này. Quay lại danh sách để chọn phiên khác."
          action={{ label: "Xem phiên đang mở", onPress: () => router.replace("/auctions") }}
        />
      ) : (
        <>
          {detail.isPending && <StatePanel wine loading title="Đang tải phiên đấu giá" />}
          {detail.error && (
            <View style={styles.stackSm}>
              <Notice tone="error">
                {detail.data ? "Thông tin dưới đây chưa được cập nhật. " : ""}
                {presentError(detail.error).message}
              </Notice>
              <Button wine secondary title="Thử tải lại" busy={detail.isFetching} onPress={() => void detail.refetch()} />
            </View>
          )}
          {detail.data && (
            <AuctionBody
              data={detail.data}
              now={shownNow}
              pushing={pushing}
              detailError={detail.isError}
              meError={!!member && me.isError}
              retryMe={() => void me.refetch()}
              manualOpen={manualOpen}
              closeManual={() => setManualOpen(false)}
              autoOpen={autoOpen}
              openAuto={() => setAutoOpen(true)}
              closeAuto={() => setAutoOpen(false)}
              reportOpen={reportOpen}
              closeReport={() => setReportOpen(false)}
              me={me.data ?? null}
              meLoading={!!member && me.isPending}
              signedIn={!!member}
              memberId={member}
              ownerIntake={ownerIntake}
              ownerLoading={!!member && ownIntakes.isPending}
              ownerError={!!member && ownIntakes.isError}
              ownerKnown={ownIntakes.data !== undefined}
              retryOwner={() => void ownIntakes.refetch()}
              refresh={async () => {
                await Promise.all([
                  detail.refetch(),
                  member ? me.refetch() : undefined,
                  member ? ownIntakes.refetch() : undefined,
                ]);
              }}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function canPlaceManualBid(auction: PublicAuctionSummary, me: Participation | null, now: number) {
  return (
    isOpen(auction, now) &&
    (auction.auctionType ?? "English") === "English" &&
    !me?.won &&
    !me?.leading &&
    !registrationBlocks(auction, me) &&
    minimumBidOf(auction) <= AUCTION_MAX_PRICE
  );
}

function AuctionBody({
  data,
  now,
  me,
  meLoading,
  meError,
  signedIn,
  memberId,
  ownerIntake,
  ownerLoading,
  ownerError,
  ownerKnown,
  detailError,
  pushing,
  manualOpen,
  closeManual,
  autoOpen,
  openAuto,
  closeAuto,
  reportOpen,
  closeReport,
  retryOwner,
  retryMe,
  refresh,
}: {
  data: PublicAuction;
  now: number;
  me: Participation | null;
  meLoading: boolean;
  meError: boolean;
  signedIn: boolean;
  memberId: string | null;
  ownerIntake: MyIntake | null;
  ownerLoading: boolean;
  ownerError: boolean;
  ownerKnown: boolean;
  detailError: boolean;
  pushing: boolean;
  manualOpen: boolean;
  closeManual: () => void;
  autoOpen: boolean;
  openAuto: () => void;
  closeAuto: () => void;
  reportOpen: boolean;
  closeReport: () => void;
  retryOwner: () => void;
  retryMe: () => void;
  refresh: () => Promise<unknown>;
}) {
  const { client } = useSession();
  const { auction, history, leaderAlias } = data;
  const open = isOpen(auction, now);
  const scheduled = isScheduled(auction, now);
  const offer = auction.state === "SecondChanceOffered" && me?.secondChance?.outcome === "Offered";
  const registration = registrationBlocks(auction, me) || canWithdrawRegistration(auction, me, now);
  const memberActions = !ownerError && !detailError && !meLoading && !meError;
  const bidding = !me?.won && (open || (scheduled && registration) || offer);
  const report = !!memberId && !ownerError && (ownerIntake || me);
  const sale = ownerIntake?.sellerSale;
  const demo = signedIn && memberActions && (ownerIntake || me) && auction.version != null && (scheduled || open);

  return (
    <View style={styles.body}>
      <AuctionSessionOverview auction={auction} now={now} open={open} scheduled={scheduled} pushing={pushing} />

      {open && auction.buyNowAt ? (
        <Notice tone="warning">
          {`Đã có người chọn mua ngay. Còn ${formatRemaining(Date.parse(auction.endAt) - now)} để trả cao hơn.`}
        </Notice>
      ) : null}

      {report && memberId ? (
        <AuctionFlag
          auction={auction}
          owner={memberId}
          hideTrigger
          externalVisible={reportOpen}
          onExternalClose={closeReport}
        />
      ) : null}

      {ownerError ? (
        <StatePanel
          wine
          title="Chưa kiểm tra được vai trò của bạn"
          message="Tải lại để xem các thao tác dành cho bạn."
          action={{ label: "Thử lại kiểm tra vai trò", onPress: retryOwner }}
        />
      ) : ownerLoading ? (
        <StatePanel wine loading title="Đang kiểm tra vai trò của bạn trong phiên" />
      ) : signedIn && !ownerKnown ? null : ownerIntake ? (
        waitingForRegistrants(auction, now) ? (
          <WaitingSellerBlock auction={auction} now={now} refresh={refresh} />
        ) : (
          <View style={styles.sellerCard}>
            <View style={styles.sellerCardHeader}>
              <View style={styles.sellerIcon}>
                <Icon name="gavel" size={17} color={stitchTokens.wineDark} />
              </View>
              <View style={styles.flexOne}>
                <AppText kind="bold" style={styles.cardTitle}>Đây là phiên của bạn</AppText>
                <AppText kind="small" color={colors.muted} style={styles.helper}>
                  {closeReasonText(auction) ??
                    (scheduled
                      ? `Hẹn mở lúc ${time(auction.startAt)}. Bạn có thể đổi giờ trong Phiên của tôi khi chưa có lượt trả giá.`
                      : `${STATE_LABEL[auction.state]}. Theo dõi diễn biến và kết quả ngay tại đây.`)}
                </AppText>
              </View>
            </View>

            {sale ? (
              <View style={styles.sellerSection}>
                <AppText kind="bold" color={stitchTokens.wine}>{auctionSellerSaleLabels[sale.status]}</AppText>
                {sale.status !== "Closed" ? (
                  <SaleFeeBreakdown amounts={auctionSellerAmounts(sale)} settled={sale.status === "Settled"} />
                ) : null}
                {sale.status === "Settled" ? (
                  <Button
                    wine
                    secondary
                    title="Đối chiếu tiền bán trong ví"
                    onPress={() => router.push({ pathname: "/wallet", params: { sale: sale.orderId } })}
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.sellerActions}>
              <Button
                wine
                secondary
                title="Xem hồ sơ gửi sách"
                onPress={() => router.push({ pathname: "/send-to-auction", params: { intakeId: ownerIntake.id } })}
              />
              <Button wine secondary title="Phiên của tôi" onPress={() => router.push("/my-auctions")} />
            </View>
          </View>
        )
      ) : meError ? (
        <StatePanel
          wine
          title="Chưa tải được lượt trả giá của bạn"
          message="Tải lại để kiểm tra vị trí và thao tác của bạn trong phiên."
          action={{ label: "Thử tải lại", onPress: retryMe }}
        />
      ) : me?.won ? (
        <View style={styles.stackMd}>
          <Notice tone="success">{me.boughtNow ? "Bạn đã mua ngay cuốn sách này." : "Bạn đã thắng phiên đấu giá."}</Notice>
          {me.orderId ? (
            <WinnerSteps orderId={me.orderId} boughtNow={me.boughtNow} heldAmount={me.heldAmount} paused={ownerError} />
          ) : (
            <Notice>Đơn nhận sách đang được tạo. Trang sẽ tự cập nhật.</Notice>
          )}
        </View>
      ) : bidding ? (
        !signedIn ? null : meLoading ? (
          <StatePanel wine loading title="Đang tải lượt trả giá của bạn" />
        ) : null
      ) : scheduled ? (
        <Notice>{auction.openMode ? openRuleText(auction, now) : `Phiên hẹn mở lúc ${time(auction.startAt)}.`}</Notice>
      ) : (
        <Notice>
          {auction.state === "OnHold"
            ? `Quản trị viên đang xem xét phiên này. ${auction.holdExpiresAt ? `Hạn xử lý ${time(auction.holdExpiresAt)}. ` : ""}Nếu phiên tiếp tục, hệ thống sẽ cộng lại thời gian tạm dừng.`
            : isClosing(auction, now)
              ? "Máy chủ đang chốt kết quả phiên."
              : closeReasonText(auction) ?? STATE_LABEL[auction.state]}
        </Notice>
      )}

      {signedIn && memberId && ownerKnown && !ownerIntake ? (
        <BidPanel
          key={memberId}
          auction={auction}
          me={me}
          now={now}
          refresh={refresh}
          active={bidding && !meLoading}
          paused={!memberActions}
          manualOpen={manualOpen}
          closeManual={closeManual}
          autoOpen={autoOpen}
          openAuto={openAuto}
          closeAuto={closeAuto}
        />
      ) : null}

      {/* Book condition placed BEFORE bid history so buyers inspect book flaws before bidding */}
      <AuctionBookCondition book={auction.book} />

      <AuctionBidHistory
        sealedLive={isSealedFormat(auction) && (open || scheduled)}
        history={history}
        state={auction.state}
        leaderAlias={leaderAlias}
        myAlias={me?.alias ?? null}
        startPrice={auction.startPrice}
      />

      {demo && auction.version != null ? (
        <DemoSkipButton
          intentKey={`${auction.id}:${auction.version}`}
          label={scheduled ? "Mở phiên ngay · Demo" : "Kết thúc phiên ngay · Demo"}
          note={
            scheduled
              ? "Bỏ qua giờ hẹn và số người đăng ký trong phiên demo."
              : "Chốt phiên và tạo đơn như khi hết giờ."
          }
          run={(key) => advanceDemoAuction(client, auction.id, auction.version!, key)}
          onDone={refresh}
        />
      ) : null}
    </View>
  );
}

function BidPanel({
  auction,
  me,
  now,
  refresh,
  active,
  paused,
  manualOpen,
  closeManual,
  autoOpen,
  openAuto,
  closeAuto,
}: {
  auction: PublicAuctionSummary;
  me: Participation | null;
  now: number;
  refresh: () => Promise<unknown>;
  active: boolean;
  paused: boolean;
  manualOpen: boolean;
  closeManual: () => void;
  autoOpen: boolean;
  openAuto: () => void;
  closeAuto: () => void;
}) {
  const { client, state } = useSession();
  const queryClient = useQueryClient();
  const standing = standingOf(auction, me);
  const minimum = minimumBidOf(auction);
  const floor = autoFloor(auction, me);
  const [manual, setManual] = useState<string | null>(null);
  const [auto, setAuto] = useState("");
  const [confirming, setConfirming] = useState<{ kind: Exclude<AuctionCommandKind, "Manual">; amount: number } | null>(null);
  const [pending, setPending] = useState<AuctionCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
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

  const locked = paused || busy || !!pending;
  const capped = minimum > AUCTION_MAX_PRICE;
  const wallet = useQuery({
    queryKey: ["wallet"],
    queryFn: () => client.request("/me/wallet", walletSummary),
    enabled: state.status === "authenticated" && active && !paused,
    retry: false,
  });
  const heldHere = me?.heldAmount ?? 0;
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["wallet"] });
  }, [heldHere, queryClient]);
  const available = wallet.data ? wallet.data.available + heldHere : null;
  const price = auction.currentPrice ?? auction.startPrice;

  const run = async (command: AuctionCommand) => {
    if (sending.current || paused) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setNoticePrice(null);
    try {
      const receipt = await sendAuctionCommand(client, command);
      setPending(null);
      setManual(null);
      setAuto("");
      closeAuto();
      setNotice(receiptMessage(command.kind, command.amount, receipt, !!me?.leading, auction?.buyNowMode ?? "Challenge"));
      setNoticePrice(receipt.currentPrice);
      if (command.kind === "Manual") closeManual();
    } catch (caught) {
      const uncertainResponse =
        outcomeUnknown(caught) ||
        (caught instanceof ApiError && [401, 403, 408, 429].includes(caught.status));
      setPending(uncertainResponse ? command : null);
      setError(auctionErrorText(caught));
    } finally {
      sending.current = false;
      setBusy(false);
      setConfirming(null);
      if (state.status === "authenticated") {
        void queryClient.invalidateQueries({ queryKey: participationKey(auction.id, state.user.id) });
      }
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: AUCTIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["my-auctions"] });
      void refresh();
    }
  };

  const copy = confirming && dialogCopy(confirming.kind, auction, !!me?.leading);
  const english = (auction.auctionType ?? "English") === "English";
  const registering = registrationBlocks(auction, me) || canWithdrawRegistration(auction, me, now);
  const buyNowPrice = english && isOpen(auction, now) && !registering ? auction.buyNowPrice : null;
  const rivalRequired = instantNeedsRival(auction, me);
  const offerDeadline = me?.secondChance?.deadline;
  const offerExpired = !!offerDeadline && Date.parse(offerDeadline) <= now;
  const manualBlocked = paused
    ? "Chưa xác minh được trạng thái hiện tại. Hãy tải lại phiên."
    : canPlaceManualBid(auction, me, now)
      ? null
      : "Phiên hoặc vị trí của bạn đã thay đổi. Hiện không thể gửi lượt mới.";

  const submit = (kind: AuctionCommandKind, amount: number) => {
    if (locked) return;
    const decisionNow = serverClock.now() ?? now;
    const isBid =
      kind === "Manual" ||
      kind === "Auto" ||
      kind === "BuyNow" ||
      kind === "Disable" ||
      kind === "DutchAccept" ||
      kind === "Sealed";
    const secondChance = kind === "SecondChanceAccept" || kind === "SecondChanceDecline";
    const problem =
      secondChance && (!offerDeadline || Date.parse(offerDeadline) <= decisionNow)
        ? "Đã hết hạn xác nhận cơ hội mua sách."
        : !active || (isBid && !isOpen(auction, decisionNow))
          ? "Phiên đã đổi trạng thái. Vui lòng cập nhật trước khi tiếp tục."
          : kind === "Manual"
            ? canPlaceManualBid(auction, me, decisionNow)
              ? amountError(amount, minimum, auction.startPrice, auction.step)
              : "Bạn hiện không thể gửi lượt trả giá mới."
            : kind === "Auto"
              ? amountError(amount, floor, auction.startPrice, auction.step)
              : kind === "BuyNow" && (buyNowPrice !== amount || rivalRequired)
                ? "Điều kiện Mua ngay đã thay đổi. Vui lòng cập nhật phiên."
                : null;
    const short =
      kind !== "Disable" &&
      kind !== "Withdraw" &&
      kind !== "SecondChanceDecline" &&
      fundsShortfall(amount, available)
        ? fundsHint(amount, available)
        : null;
    if (problem || short) {
      setError(problem ?? short);
      setConfirming(null);
      void refresh();
      return;
    }
    void run(createAuctionCommand(auction.id, kind, amount, Crypto.randomUUID(), auction.version ?? 0));
  };

  if ((!active || paused) && !manualOpen && !autoOpen && !pending) return null;

  const staleNotice =
    (noticePrice !== null && noticePrice !== price) ||
    (notice !== null && notice.includes("Bạn đang dẫn giá"));

  const showSecondaryOptions =
    active &&
    !paused &&
    !pending &&
    !registering &&
    english &&
    isOpen(auction, now) &&
    (floor <= AUCTION_MAX_PRICE || buyNowPrice != null);

  return (
    <View style={styles.stackMd}>
      {active && !paused && standing ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.standingCard,
            standing === "lead" ? styles.standingLead : styles.standingOutbid,
          ]}
        >
          <View style={[styles.standingIcon, standing === "lead" ? styles.standingIconLead : styles.standingIconOutbid]}>
            <Icon
              name={standing === "lead" ? "check" : "flame"}
              size={16}
              color={standing === "lead" ? stitchTokens.likeNewGreen : colors.warning}
            />
          </View>
          <View style={styles.flexOne}>
            <AppText
              kind="bold"
              color={standing === "lead" ? stitchTokens.likeNewGreen : colors.warning}
              style={styles.standingTitle}
            >
              {standing === "lead"
                ? "Bạn đang dẫn giá"
                : standing === "tied"
                  ? "Bạn trả bằng người dẫn giá"
                  : "Bạn đã bị vượt giá"}
            </AppText>
            <AppText kind="small" color={colors.ink} style={styles.helper}>
              {standing === "tied"
                ? `Một người khác đã cam kết ${formatVnd(price)} trước bạn. Trả từ ${formatVnd(minimum)} để vượt lên.`
                : me?.mode === "Auto" && me.ownLevel !== null
                  ? `Mức tự động tối đa: ${formatVnd(me.ownLevel)} (chỉ bạn thấy).${heldHere > 0 ? ` Ví đang giữ ${formatVnd(heldHere)}.` : ""}`
                  : me?.ownLevel != null
                    ? `Lượt trả gần nhất: ${formatVnd(me.ownLevel)}.${heldHere > 0 ? ` Ví đang giữ ${formatVnd(heldHere)}.` : ""}`
                    : ""}
            </AppText>
          </View>
        </View>
      ) : null}

      {active && notice && !staleNotice ? <Notice tone="success">{notice}</Notice> : null}
      {error && !manualOpen && !autoOpen ? <Notice tone="error">{error}</Notice> : null}

      {pending ? (
        <View style={styles.stackSm}>
          <Button wine title="Thử lại thao tác vừa rồi" disabled={paused} busy={busy} onPress={() => void run(pending)} />
          <Button wine secondary title="Cập nhật trạng thái phiên" disabled={busy} onPress={() => void refresh()} />
        </View>
      ) : !active || paused ? null : auction.state === "SecondChanceOffered" && me?.secondChance?.outcome === "Offered" ? (
        <SecondChanceBlock
          offer={me.secondChance}
          available={available}
          locked={locked || offerExpired}
          expired={offerExpired}
          pointName={auction.pointName}
          onAccept={() => setConfirming({ kind: "SecondChanceAccept", amount: me.secondChance!.price })}
          onDecline={() => setConfirming({ kind: "SecondChanceDecline", amount: me.secondChance!.price })}
        />
      ) : registering ? (
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
      ) : capped ? (
        <Notice>Giá đã chạm mức tối đa hệ thống hỗ trợ.</Notice>
      ) : null}

      {/* Clean Action Card for Auto-Bid (opens Sheet) + Buy Now */}
      {showSecondaryOptions ? (
        <View style={styles.optionsCard}>
          {floor <= AUCTION_MAX_PRICE ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đặt giá tự động"
              disabled={locked}
              onPress={() => {
                setAutoError(null);
                openAuto();
              }}
              style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
            >
              <View style={styles.optionIcon}>
                <Icon name="bolt" size={17} color={stitchTokens.wine} />
              </View>
              <View style={styles.flexOne}>
                <AppText kind="bold" style={styles.optionTitle}>Đặt giá tự động</AppText>
                <AppText kind="small" color={stitchTokens.brownMuted}>
                  {me?.mode === "Auto" && me.ownLevel != null
                    ? `Đang bật · Tối đa ${formatVnd(me.ownLevel)}`
                    : "Hệ thống tự nâng giá thay bạn trong hạn mức"}
                </AppText>
              </View>
              <Icon name="chevronRight" size={18} color={stitchTokens.wine} />
            </Pressable>
          ) : null}

          {buyNowPrice != null ? (
            <View style={[styles.buyNowSection, floor <= AUCTION_MAX_PRICE && styles.sectionBorderTop]}>
              <View style={styles.buyNowHeader}>
                <View style={styles.flexOne}>
                  <AppText kind="bold" style={styles.optionTitle}>Mua ngay</AppText>
                  <AppText kind="small" color={stitchTokens.brownMuted}>
                    {auction.buyNowMode === "Instant"
                      ? "Chốt ngay lập tức khi đủ điều kiện"
                      : "Dẫn đầu ở giá mua ngay, mở cửa sổ thử thách"}
                  </AppText>
                </View>
                <AppText kind="bold" style={styles.buyNowPrice}>{formatVnd(buyNowPrice)}</AppText>
              </View>
              <Button
                wine
                secondary
                title={`Mua ngay · ${formatVnd(buyNowPrice)}`}
                disabled={locked || rivalRequired || fundsShortfall(buyNowPrice, available) > 0}
                onPress={() => setConfirming({ kind: "BuyNow", amount: buyNowPrice })}
              />
              {rivalRequired ? (
                <AppText kind="small" color={stitchTokens.brownMuted}>
                  Cần có người khác trả giá trước khi mua ngay.
                </AppText>
              ) : fundsShortfall(buyNowPrice, available) ? (
                <AppText kind="small" color={colors.error}>
                  {fundsHint(buyNowPrice, available)}
                </AppText>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <ManualAuctionBidSheet
        auction={auction}
        visible={manualOpen}
        onClose={closeManual}
        onChange={(value) => {
          setManual(value);
          setError(null);
        }}
        onSubmit={(amount) => (pending?.kind === "Manual" ? void run(pending) : submit("Manual", amount))}
        manual={manual}
        available={available}
        heldHere={heldHere}
        busy={busy}
        blocked={
          manualBlocked ??
          (pending && pending.kind !== "Manual" ? "Hãy xác minh kết quả thao tác trước." : null)
        }
        pendingAmount={!paused && pending?.kind === "Manual" ? pending.amount : null}
        error={error}
      />

      <AutoBidSheet
        auction={auction}
        visible={autoOpen && active && !paused}
        onClose={closeAuto}
        floor={floor}
        currentAutoMax={me?.mode === "Auto" ? me.ownLevel : null}
        value={auto}
        onChange={(val) => {
          setAuto(val);
          setAutoError(null);
        }}
        available={available}
        heldHere={heldHere}
        locked={locked}
        error={autoError}
        onSubmit={(amount) => {
          closeAuto();
          setConfirming({ kind: "Auto", amount });
        }}
        onDisable={() => {
          closeAuto();
          setConfirming({ kind: "Disable", amount: 0 });
        }}
      />

      <ConfirmDialog
        visible={!!copy && active && !paused}
        title={copy?.title ?? ""}
        message={copy?.message}
        confirmLabel={copy?.confirm ?? ""}
        busy={busy}
        onCancel={() => !busy && setConfirming(null)}
        onConfirm={() => {
          if (confirming) submit(confirming.kind, confirming.amount);
        }}
      >
        {confirming && copy?.amountLabel && (
          <View style={{ gap: space.md }}>
            <TransactionAmount label={copy.amountLabel} value={formatVnd(confirming.amount)} />
            {copy.notes && <TransactionNotes notes={copy.notes} />}
          </View>
        )}
      </ConfirmDialog>
    </View>
  );
}

function dialogCopy(kind: Exclude<AuctionCommandKind, "Manual">, auction: PublicAuctionSummary, leading: boolean): {
  title: string; confirm: string; message?: string; amountLabel?: string; notes?: TransactionNote[];
} {
  const pay = { label: "Nếu thắng", detail: `Thanh toán trong 24 giờ sau khi phiên kết thúc. Chọn nhận tại ${auction.pointName} hoặc giao tận nơi.` };
  const hold = auctionBidHoldNotes(auction.depositAmount != null);
  switch (kind) {
    case "Auto":
      return {
        title: "Đặt giá tự động",
        amountLabel: "Mức tối đa",
        notes: [
          { label: "Cách trả tự động", detail: `Hệ thống trả hơn đối thủ một bước ${formatVnd(auction.step)} trong mức tối đa này.` },
          ...hold, pay,
        ],
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
        title: "Đăng ký đấu giá",
        amountLabel: "Cọc Ví sẽ giữ ngay",
        notes: auctionRegistrationNotes(auction.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR),
        confirm: "Đặt cọc và đăng ký",
      };
    case "SecondChanceAccept":
      return {
        title: "Nhận lời mời mua",
        amountLabel: "Số tiền Ví sẽ giữ ngay",
        notes: [
          { label: "Hạn thanh toán", detail: "24 giờ từ lúc nhận lời mời." },
          { label: "Cách nhận", detail: `Nhận sách tại ${auction.pointName}.` },
        ],
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
        title: "Chấp nhận giá đang giảm",
        amountLabel: "Giá tối đa bạn chấp nhận",
        notes: [
          { label: "Khi xác nhận", detail: "Ví giữ giá tại thời điểm lệnh đến, kể cả khi giá vừa giảm. Lượt chấp nhận không thể rút lại." },
          { label: "Hạn thanh toán", detail: "24 giờ sau khi phiên kết thúc." },
        ],
        confirm: "Chấp nhận giá",
      };
    case "Sealed":
      return {
        title: "Xác nhận giá kín",
        amountLabel: "Giá kín Ví sẽ giữ",
        notes: [
          { label: "Khi gửi giá", detail: "Ví giữ toàn bộ giá kín đến lúc chốt phiên. Giá kín chỉ có thể nâng." },
          { label: "Nếu không thắng", detail: "Tiền về lại Ví khi phiên chốt." },
          pay,
        ],
        confirm: "Gửi giá kín",
      };
    case "BuyNow":
      return {
        title: "Xác nhận mua ngay",
        amountLabel: "Giá mua ngay",
        notes: [
          { label: "Kết quả", detail: auction.buyNowMode === "Instant"
            ? "Bạn thắng ngay và phiên kết thúc. Ví giữ tiền ngay. Lượt mua không thể rút lại."
            : `Bạn ${leading ? "giữ vị trí dẫn đầu ở giá mua ngay" : "dẫn đầu ở giá mua ngay"}. Bạn thắng nếu không ai trả cao hơn trong ${buyNowWindow(leading)}.` },
          pay,
        ],
        confirm: "Mua ngay",
      };
  }
}

function SecondChanceBlock({
  offer,
  available,
  locked,
  expired,
  pointName,
  onAccept,
  onDecline,
}: {
  offer: NonNullable<Participation["secondChance"]>;
  available: number | null;
  locked: boolean;
  expired: boolean;
  pointName: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const short = fundsShortfall(offer.price, available);
  const until = time(offer.deadline);
  return (
    <View style={styles.flatCard}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderIcon}>
          <Icon name="verified" size={18} color={stitchTokens.wineDark} />
        </View>
        <View style={styles.flexOne}>
          <AppText kind="bold" style={styles.cardTitle}>Bạn được mời mua sách này</AppText>
          <AppText kind="small" color={colors.muted}>{`Cơ hội thứ hai · Hạn xác nhận ${until}`}</AppText>
        </View>
      </View>

      <AppText kind="small" color={colors.ink} style={styles.helper}>
        {`Người thắng không thanh toán đúng hạn. Bạn có thể mua với mức cao nhất đã trả (${formatVnd(offer.price)}) trước ${until} để nhận sách tại ${pointName}.`}
      </AppText>

      {short > 0 ? (
        <View style={{ gap: space.xs }}>
          <Notice tone="error">{fundsHint(offer.price, available)}</Notice>
          <Button wine secondary title="Nạp tiền vào ví" onPress={() => router.push("/wallet")} />
        </View>
      ) : null}
      {expired ? <Notice tone="warning">Đã hết hạn xác nhận cơ hội mua sách.</Notice> : null}

      <View style={styles.stackSm}>
        <Button wine title={`Mua với giá ${formatVnd(offer.price)}`} disabled={locked || short > 0} onPress={onAccept} />
        <Button wine secondary title="Không mua" disabled={locked} onPress={onDecline} />
      </View>
    </View>
  );
}

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
  const withdrawable = canWithdrawRegistration(auction, me, now);
  const fullUntil = count >= need && auction.fullWithdrawUntil ? time(auction.fullWithdrawUntil) : null;
  const depositPct = auction.startPrice > 0 ? Math.round((deposit / auction.startPrice) * 100) : 10;

  return (
    <View style={[styles.flatCard, registered && styles.flatCardRegistered]}>
      <View style={styles.cardHeaderRow}>
        <View style={[styles.cardHeaderIcon, registered && styles.cardHeaderIconGreen]}>
          <Icon
            name={registered ? "verified" : "shield"}
            size={18}
            color={registered ? stitchTokens.likeNewGreen : stitchTokens.wineDark}
          />
        </View>
        <View style={styles.flexOne}>
          <AppText kind="bold" style={styles.cardTitle}>
            {registered ? "Bạn đã đăng ký phiên này" : "Đăng ký tham gia đấu giá"}
          </AppText>
          <AppText kind="small" color={colors.muted}>
            {registered ? "Tiền cọc đã được giữ hợp lệ trong ví" : `Đặt cọc ${depositPct}% để vào sàn trả giá`}
          </AppText>
        </View>
        <View style={[styles.pillBadge, registered && styles.pillBadgeGreen]}>
          <AppText style={[styles.pillBadgeText, registered && styles.pillBadgeTextGreen]}>
            {registered ? "Đã đăng ký" : `Cọc ${depositPct}%`}
          </AppText>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.sectionDividerBlock}>
        <View style={styles.rowBetween}>
          <AppText kind="small" style={styles.metricTitle}>Tiến độ đăng ký mở phiên</AppText>
          <AppText kind="bold" style={[styles.metricCount, enough && styles.metricCountGreen]}>
            {`${count}/${need} người`}
          </AppText>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: need, now: count }}
          style={styles.progressTrack}
        >
          <View style={[styles.progressFill, { width: `${progressPct}%` }, enough && styles.progressFillGreen]} />
        </View>
        <AppText kind="small" color={colors.muted} style={styles.helper}>
          {auction.openMode ? openRuleText(auction, now) : `Phiên mở trả giá khi đủ ${need} người đăng ký.`}
        </AppText>
      </View>

      {/* Clean Key-Value Money Strip (flat, no nested boxes) */}
      <View style={styles.sectionDividerBlock}>
        <View style={styles.rowBetween}>
          <AppText kind="small" color={stitchTokens.brownMuted}>
            {registered ? "Tiền cọc đang giữ" : "Mức tiền cọc"}
          </AppText>
          <AppText kind="bold" style={styles.moneyWine}>
            {formatVnd(registered ? (me?.deposit ?? deposit) : deposit)}
          </AppText>
        </View>
        <View style={styles.rowBetween}>
          <AppText kind="small" color={stitchTokens.brownMuted}>Số dư ví khả dụng</AppText>
          <AppText kind="bold" style={styles.moneyInk}>
            {available !== null ? formatVnd(available) : "—"}
          </AppText>
        </View>
        <AppText kind="small" color={colors.muted} style={styles.helper}>
          {registered
            ? withdrawable
              ? fullUntil
                ? `Bạn có thể rút đăng ký tới ${fullUntil} (72 giờ trước giờ mở).`
                : "Bạn có thể rút đăng ký khi phiên chưa đủ người."
              : "Phiên đã đủ người nên tiền cọc được giữ đến khi phiên kết thúc."
            : "Hoàn 100% nếu không thắng hoặc phiên không đủ người; tính vào giá nếu thắng."}
        </AppText>
      </View>

      {short > 0 ? (
        <View style={{ gap: space.xs }}>
          <Notice tone="error">{fundsHint(deposit, available)}</Notice>
          <Button wine secondary title="Nạp tiền vào ví" onPress={() => router.push("/wallet")} />
        </View>
      ) : null}

      {registered ? (
        withdrawable ? (
          <Button
            wine
            secondary
            title="Rút đăng ký và nhận lại tiền cọc"
            disabled={locked}
            onPress={onWithdraw}
          />
        ) : null
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
    const wait = Math.max(0, Date.parse(auction.dutchNextDropAt) - (serverClock.now() ?? now)) + 250;
    const timer = setTimeout(() => void refresh(), wait);
    return () => clearTimeout(timer);
  }, [auction.dutchNextDropAt, now, refresh]);

  if (price === null) {
    return (
      <Notice>Giá giảm dần kiểu Hà Lan sẽ xuất hiện ngay khi phiên mở.</Notice>
    );
  }

  const short = fundsShortfall(price, available);
  const topPrice = auction.dutchTopPrice ?? auction.buyNowPrice ?? price;
  const nextDropMs = auction.dutchNextDropAt ? Math.max(0, Date.parse(auction.dutchNextDropAt) - now) : 0;
  const nextDropSec = Math.ceil(nextDropMs / 1000);

  return (
    <View style={styles.flatCard}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderIcon}>
          <Icon name="flame" size={17} color={stitchTokens.wineDark} />
        </View>
        <View style={styles.flexOne}>
          <AppText kind="bold" style={styles.cardTitle}>Đấu giá giảm dần</AppText>
          <AppText kind="small" color={colors.muted}>Người đầu tiên chấp nhận sẽ thắng ngay</AppText>
        </View>
        <View style={styles.pillBadge}>
          <AppText style={styles.pillBadgeText}>
            {auction.dutchNextDropAt ? `Giảm sau ${nextDropSec}s` : "Ở giá sàn"}
          </AppText>
        </View>
      </View>

      <View style={styles.sectionDividerBlock}>
        <View style={styles.dutchStrip}>
          <View style={styles.dutchCol}>
            <AppText kind="small" color={stitchTokens.brownMuted}>Mở đầu</AppText>
            <AppText kind="bold" style={styles.dutchMutedVal}>{formatVnd(topPrice)}</AppText>
          </View>
          <Icon name="arrow" size={14} color={stitchTokens.brownMuted} />
          <View style={styles.dutchColCenter}>
            <AppText kind="small" style={styles.dutchNowLabel}>Hiện tại</AppText>
            <AppText kind="bold" style={styles.dutchNowVal}>{formatVnd(price)}</AppText>
          </View>
          <Icon name="arrow" size={14} color={stitchTokens.brownMuted} />
          <View style={styles.dutchColEnd}>
            <AppText kind="small" color={stitchTokens.brownMuted}>Giá sàn</AppText>
            <AppText kind="bold" style={styles.dutchFloorVal}>{formatVnd(auction.startPrice)}</AppText>
          </View>
        </View>

        <AppText kind="small" color={colors.muted} style={styles.helper}>
          {auction.dutchNextDropAt
            ? `Giảm ${formatVnd(auction.step)} lúc ${time(auction.dutchNextDropAt)}, xuống tối đa ${formatVnd(auction.startPrice)}.`
            : `Đã chạm giá sàn ${formatVnd(auction.startPrice)}.`}
        </AppText>
      </View>

      {short > 0 ? (
        <View style={{ gap: space.xs }}>
          <Notice tone="error">{fundsHint(price, available)}</Notice>
          <Button wine secondary title="Nạp tiền vào ví" onPress={() => router.push("/wallet")} />
        </View>
      ) : null}

      <Button
        wine
        title={`Chấp nhận mua ngay ${formatVnd(price)}`}
        disabled={locked || short > 0}
        onPress={() => onAccept(price)}
      />
    </View>
  );
}

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
    <View style={styles.flatCard}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderIcon}>
          <Icon name="lock" size={17} color={stitchTokens.wineDark} />
        </View>
        <View style={styles.flexOne}>
          <AppText kind="bold" style={styles.cardTitle}>
            Đấu giá kín · {second ? "giá thứ hai" : "giá thứ nhất"}
          </AppText>
          <AppText kind="small" color={colors.muted}>
            {second ? "Giá cao nhất thắng, trả bằng mức cao thứ hai" : "Giá cao nhất thắng và trả đúng mức đã gửi"}
          </AppText>
        </View>
      </View>

      {own !== null ? (
        <View style={styles.sectionDividerBlock}>
          <View style={styles.rowBetween}>
            <AppText kind="small" color={stitchTokens.brownMuted}>Giá kín hiện tại của bạn</AppText>
            <AppText kind="bold" style={styles.moneyWine}>{formatVnd(own)}</AppText>
          </View>
          <AppText kind="small" color={colors.muted}>
            {me?.heldAmount ? `Ví đang giữ ${formatVnd(me.heldAmount)} · Chỉ có thể nâng lên.` : "Chỉ bạn thấy · Chỉ có thể nâng lên."}
          </AppText>
        </View>
      ) : null}

      <View style={styles.sectionDividerBlock}>
        <AppText kind="small" style={styles.metricTitle}>Chọn nhanh mức giá kín</AppText>
        <View style={styles.quickGrid}>
          {bidOptions(floor, auction.step).map((value) => {
            const isSelected = amount === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: locked }}
                disabled={locked}
                onPress={() => setText(String(value))}
                style={({ pressed }) => [
                  styles.quickOption,
                  isSelected && styles.quickOptionSelected,
                  pressed && styles.pressed,
                ]}
              >
                <AppText kind="bold" style={[styles.quickOptionText, isSelected && styles.quickOptionTextSelected]}>
                  {formatVnd(value)}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <TextField
          label={own === null ? "Giá kín của bạn" : "Nâng giá kín lên"}
          keyboardType="number-pad"
          value={text}
          editable={!locked}
          onChangeText={(t) => setText(t.replace(/\D/g, ""))}
          hint={`${amount ? `${formatVnd(amount)} · ` : ""}Tối thiểu ${formatVnd(floor)}, bước ${formatVnd(auction.step)}.`}
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
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  stackSm: { gap: space.sm },
  stackMd: { gap: space.md },
  flexOne: { flex: 1, minWidth: 0, gap: 2 },
  pressed: { opacity: 0.78 },

  dock: { gap: space.sm },
  dockSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dockPrice: { color: stitchTokens.wine, fontSize: 16, fontVariant: ["tabular-nums"] },
  dockLeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  dockLeadingInfo: { flex: 1, minWidth: 0, gap: 2 },
  dockLeadingBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  dockLeadingText: { color: stitchTokens.likeNewGreen, fontSize: 14 },

  sellerCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.lg,
    gap: space.md,
  },
  sellerCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  sellerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  sellerSection: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
    paddingTop: space.md,
    gap: space.sm,
  },
  sellerActions: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
    paddingTop: space.md,
    gap: space.sm,
  },

  standingCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: space.md,
    borderRadius: 14,
    borderWidth: 1,
  },
  standingLead: {
    borderColor: stitchTokens.greenBorderSoft,
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  standingOutbid: {
    borderColor: stitchTokens.orangeBorderSoft,
    backgroundColor: stitchTokens.amberBg,
  },
  standingIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  standingIconLead: { backgroundColor: stitchTokens.whiteSurface },
  standingIconOutbid: { backgroundColor: stitchTokens.whiteSurface },
  standingTitle: { fontSize: 15 },

  optionsCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
  },
  optionRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: { color: stitchTokens.wineDark, fontSize: 15 },
  sectionBorderTop: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
  },
  buyNowSection: {
    padding: space.md,
    gap: space.sm,
  },
  buyNowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  buyNowPrice: {
    color: stitchTokens.wine,
    fontSize: 16,
    fontVariant: ["tabular-nums"],
  },

  flatCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.lg,
    gap: space.md,
  },
  flatCardRegistered: {
    borderColor: stitchTokens.greenBorderSoft,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderIconGreen: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  cardTitle: { color: stitchTokens.wineDark, fontSize: 16 },
  pillBadge: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillBadgeGreen: { backgroundColor: stitchTokens.likeNewGreenBg },
  pillBadgeText: {
    color: stitchTokens.wineDark,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    includeFontPadding: false,
  },
  pillBadgeTextGreen: { color: stitchTokens.likeNewGreen },

  sectionDividerBlock: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
    paddingTop: space.md,
    gap: space.sm,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  metricTitle: { color: stitchTokens.deepCocoa, fontWeight: "700" },
  metricCount: { color: stitchTokens.wineDark, fontSize: 14, fontVariant: ["tabular-nums"] },
  metricCountGreen: { color: stitchTokens.likeNewGreen },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: stitchTokens.parchment,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: stitchTokens.wine },
  progressFillGreen: { backgroundColor: stitchTokens.likeNewGreen },
  moneyWine: { color: stitchTokens.wine, fontSize: 15, fontVariant: ["tabular-nums"] },
  moneyInk: { color: stitchTokens.deepCocoa, fontSize: 15, fontVariant: ["tabular-nums"] },
  helper: { lineHeight: 19 },

  dutchStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  dutchCol: { alignItems: "flex-start", gap: 2 },
  dutchColCenter: {
    alignItems: "center",
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 2,
  },
  dutchColEnd: { alignItems: "flex-end", gap: 2 },
  dutchMutedVal: { color: stitchTokens.brownMuted, fontSize: 13, fontVariant: ["tabular-nums"] },
  dutchNowLabel: { color: stitchTokens.wine, fontWeight: "700", fontSize: 12 },
  dutchNowVal: { color: stitchTokens.wineDark, fontSize: 16, fontVariant: ["tabular-nums"] },
  dutchFloorVal: { color: stitchTokens.deepCocoa, fontSize: 13, fontVariant: ["tabular-nums"] },

  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  quickOption: {
    minHeight: 48,
    flexBasis: "30%",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.parchment,
  },
  quickOptionSelected: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.wine,
  },
  quickOptionText: { color: stitchTokens.wineDark, fontSize: 13, fontVariant: ["tabular-nums"] },
  quickOptionTextSelected: { color: stitchTokens.warmIvory },
});
