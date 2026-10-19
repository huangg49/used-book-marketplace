import { useEffect, useState } from "react";
import { View } from "react-native";
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
  Notice,
  Screen,
  StatePanel,
  TextField,
  colors,
  formatVnd,
  presentError,
  radius,
  space,
} from "../../core/ui";
import {
  AUCTION_MAX_PRICE,
  amountError,
  auctionErrorText,
  auctionOptions,
  autoFloor,
  bidOptions,
  createAuctionCommand,
  formatRemaining,
  isOpen,
  minimumBidOf,
  outcomeUnknown,
  participationKey,
  participationOptions,
  receiptMessage,
  sendAuctionCommand,
  standingOf,
  type AuctionCommand,
  type AuctionCommandKind,
} from "./auctions-model";
import type {
  AuctionState,
  Participation,
  PublicAuction,
  PublicAuctionSummary,
} from "./contracts";
import { WinnerSteps } from "./winner-steps";

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
              refresh={async () => {
                await Promise.all([detail.refetch(), member ? me.refetch() : undefined]);
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
  refresh,
}: {
  data: PublicAuction;
  now: number;
  me: Participation | null;
  meLoading: boolean;
  signedIn: boolean;
  refresh: () => Promise<unknown>;
}) {
  const { auction, history, leaderAlias } = data;
  const open = isOpen(auction, now);
  const price = auction.currentPrice ?? auction.startPrice;
  return (
    <View style={{ gap: space.xl }}>
      <View style={{ gap: space.sm }}>
        <AppText kind="label" color={colors.rustText}>
          {STATE_LABEL[auction.state].toUpperCase()}
        </AppText>
        <AppText kind="bookTitle" color={colors.forest} accessibilityRole="header">
          {auction.title}
        </AppText>
        <AppText kind="small" color={colors.muted}>
          Đã kiểm tra tình trạng tại {auction.pointName}. Người thắng tự nhận sách tại điểm.
        </AppText>
      </View>
      <View style={{ gap: space.xs, padding: space.lg, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.rule }}>
        <AppText kind="small" color={colors.muted}>
          {auction.currentPrice === null
            ? "Giá khởi điểm"
            : open
              ? "Giá hiện tại"
              : CLOSED_PRICE[auction.state] ?? "Giá cuối"}
        </AppText>
        <AppText kind="bookPrice" color={colors.ink} selectable accessibilityLiveRegion="polite">
          {formatVnd(price)}
        </AppText>
        <AppText kind="small" color={colors.muted}>
          {auction.bidderCount} người trả giá · bước giá {formatVnd(auction.step)}
        </AppText>
        <AppText kind="small" color={colors.muted}>
          {open
            ? `Còn ${formatRemaining(Date.parse(auction.endAt) - now)} · kết thúc ${time(auction.endAt)}`
            : `Phiên kết thúc lúc ${time(auction.endAt)}`}
        </AppText>
      </View>
      {open && auction.buyNowAt ? (
        <Notice tone="warning">
          {`Đã có người chọn mua ngay. Còn ${formatRemaining(Date.parse(auction.endAt) - now)} để trả cao hơn; hết giờ, người dẫn đầu thắng phiên.`}
        </Notice>
      ) : null}
      {me?.won ? (
        me.orderId ? (
          <WinnerSteps orderId={me.orderId} boughtNow={me.boughtNow} />
        ) : (
          <Notice tone="success">Đơn nhận sách đang được tạo. Trang sẽ tự cập nhật.</Notice>
        )
      ) : open && auction.state === "Active" ? (
        signedIn ? (
          meLoading ? (
            <StatePanel loading title="Đang tải lượt trả giá của bạn" />
          ) : (
            <BidPanel auction={auction} me={me} refresh={refresh} />
          )
        ) : (
          <Button title="Đăng nhập để trả giá" onPress={() => router.push("/account")} />
        )
      ) : (
        <Notice>
          {auction.state === "OnHold"
            ? "Phiên tạm dừng để quản trị viên xem xét; phiên không nhận thêm giá."
            : "Phiên không còn nhận trả giá."}
        </Notice>
      )}
      <History history={history} state={auction.state} leaderAlias={leaderAlias} myAlias={me?.alias ?? null} startPrice={auction.startPrice} />
    </View>
  );
}

function BidPanel({
  auction,
  me,
  refresh,
}: {
  auction: PublicAuctionSummary;
  me: Participation | null;
  refresh: () => Promise<unknown>;
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
      setNotice(receiptMessage(command.kind, command.amount, receipt));
    } catch (caught) {
      // An unknown outcome keeps the frozen request for "Thử lại".
      setPending(outcomeUnknown(caught) ? command : null);
      setError(auctionErrorText(caught));
    } finally {
      setBusy(false);
      setConfirming(null);
      if (state.status === "authenticated")
        void queryClient.invalidateQueries({ queryKey: participationKey(auction.id, state.user.id) });
      void refresh();
    }
  };
  const copy = confirming && dialogCopy(confirming.kind, confirming.amount, auction);
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
      ) : standing === "lead" ? (
        <AppText color={colors.muted}>
          Bạn không cần trả thêm. Muốn giữ vị trí khi có người trả cao hơn, hãy đặt hoặc nâng mức tự động.
        </AppText>
      ) : capped ? (
        <AppText color={colors.muted}>Giá đã chạm mức tối đa {formatVnd(AUCTION_MAX_PRICE)} của phiên.</AppText>
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
            hint={`Lượt tiếp theo tối thiểu ${formatVnd(minimum)}`}
            error={manualError ?? undefined}
          />
          <Button
            wine
            title={manualAmount ? `Tiếp tục trả ${formatVnd(manualAmount)}` : "Tiếp tục"}
            disabled={locked || !!manualError || !manualAmount}
            onPress={() => manualAmount && setConfirming({ kind: "Manual", amount: manualAmount })}
          />
        </View>
      )}
      {!pending && floor <= AUCTION_MAX_PRICE && (
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
              const problem = amountError(amount, floor, auction.startPrice, auction.step);
              if (problem) setAutoError(problem);
              else setConfirming({ kind: "Auto", amount: amount! });
            }}
          />
          {me?.mode === "Auto" && (
            <Button secondary title="Tắt đặt giá tự động" disabled={locked} onPress={() => setConfirming({ kind: "Disable", amount: 0 })} />
          )}
        </View>
      )}
      {!pending && auction.buyNowPrice !== null && (
        <View style={{ gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderColor: colors.rule }}>
          <AppText kind="bold">Mua ngay {formatVnd(auction.buyNowPrice)}</AppText>
          <AppText kind="small" color={colors.muted}>
            Chỉ có trước lượt trả giá đầu tiên. Sau khi bấm, người khác còn 60 giây để trả cao hơn.
          </AppText>
          <Button
            secondary
            title="Mua ngay"
            disabled={locked}
            onPress={() => setConfirming({ kind: "BuyNow", amount: auction.buyNowPrice! })}
          />
        </View>
      )}
      <ConfirmDialog
        visible={!!copy}
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

function dialogCopy(kind: AuctionCommandKind, amount: number, auction: PublicAuctionSummary) {
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
    case "BuyNow":
      return {
        title: `Mua ngay với ${formatVnd(amount)}?`,
        message: `Bạn cam kết mua với giá này và dẫn đầu. Người khác còn 60 giây để trả cao hơn; nếu không ai vượt, bạn thắng và thanh toán từ ví trong 24 giờ sau khi phiên kết thúc, rồi tự nhận sách tại ${auction.pointName}. Lượt mua ngay không thể rút lại; không thanh toán đúng hạn sẽ bị ghi nhận vi phạm.`,
        confirm: "Mua ngay",
      };
  }
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
