import { createServerNow } from "../../core/api/session-client";
import { auctionCheckoutBalance, auctionOrderHoldText, buyerSaleFeeText } from "@used-books/session-client";
import { router } from "expo-router";
import { ReviewEntry } from "../reviews/review-entry";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import * as Crypto from "expo-crypto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Button,
  Chip,
  ConfirmDialog,
  Icon,
  Notice,
  Sheet,
  StatePanel,
  TextField,
  colors,
  formatVnd,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import {
  CLAIM_MIN_LENGTH,
  POINT_HOURS,
  POINT_HOURS_LABEL,
  pointReopensAt,
  advanceDemoPointOrder,
  demoStartPointDelivery,
  demoDeliverPointOrder,
  getDemoSkipStatus,
  auctionErrorText,
  createOrderCommand,
  formatRemaining,
  outcomeUnknown,
  pointOrderKey,
  sendOrderCommand,
  type DeliveryChoice,
  type OrderCommand,
  type OrderStep,
} from "./auctions-model";
import { DemoSkipButton } from "./components/demo-skip-button";
import { WinnerPaymentReview, type WinnerPaymentReviewProps } from "./components/winner-payment-review";
import { readPointOrderNewest, usePointOrderLive } from "./use-point-order-live";
import { walletSummary } from "../wallet/contracts";
import { auctionDriverHref, driverSimulatorEnabled } from "../driver/driver-model";
import { addressBook, addressReceipt, directory } from "../addresses/contracts";
import { deliveryQuote, type CodeIssued, type PointOrder } from "./contracts";

// The winner's steps for a point Order (FR-AU08, FR-H09/H11, FR-T03): pay from
// the wallet (pickup, or delivery from the point per ADR 0044), answer the
// point's report, request the collection code at the desk or follow the
// delivery, then report a problem within the inspection window. The server
// decides every deadline and fee; times here are a display only.

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : "—";

const length = (value: string) => [...value.trim()].length;

function useRemaining(deadline: string | null, serverTime: string | undefined) {
  const [ms, setMs] = useState(() =>
    deadline && serverTime
      ? Math.max(0, Date.parse(deadline) - Date.parse(serverTime))
      : 0,
  );
  useEffect(() => {
    if (!deadline || !serverTime) return;
    const serverNow = createServerNow(serverTime);
    const tick = () => setMs(Math.max(0, Date.parse(deadline) - serverNow()));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [deadline, serverTime]);
  return ms;
}

function orderPresentation(order: PointOrder) {
  const delivery = order.fulfillmentMethod === "CarrierOutbound";
  const phase =
    order.collectedAt || order.delivery?.deliveredAt
      ? 2
      : order.paidAt
        ? 1
        : 0;
  switch (order.state) {
    case "AwaitingPayment":
      return {
        phase: 0,
        tone: "action" as const,
        actor: "Bạn cần thao tác",
        title: "Chọn cách nhận và thanh toán",
        note: "Chọn lấy tại quầy điểm Lật Lại hoặc giao tận nơi. Giá và phí được xác nhận trước khi giữ tiền trong đơn.",
        deadline: order.paymentDeadline,
      };
    case "Fulfilling":
      return {
        phase: 1,
        tone: "action" as const,
        actor: "Bạn cần thao tác",
        title: "Xem biên bản kiểm tra tại điểm",
        note: "Đối chiếu tình trạng sách trước khi đồng ý để điểm tiến hành giao nhận.",
        deadline: order.acceptanceDeadline,
      };
    case "ReadyForCollection":
      return delivery
        ? {
            phase: 1,
            tone: "waiting" as const,
            actor: "Đang chờ điểm giao nhận",
            title: "Chờ bàn giao cho hãng",
            note: "Nhân viên tại điểm sẽ đóng gói và bàn giao sách cho hãng vận chuyển. Bạn có thể theo dõi mã vận đơn tại đây.",
            deadline: order.collectionDeadline,
          }
        : {
            phase: 1,
            tone: "action" as const,
            actor: "Bạn cần thao tác",
            title: "Đến điểm nhận sách",
            note: "Lấy mã khi bạn đã đến quầy. Nhân viên dùng mã để đối chiếu và giao đúng cuốn sách.",
            deadline: order.collectionDeadline,
          };
    case "InTransit":
      if (order.delivery?.deliveredAt) {
        return {
          phase: 1,
          tone: "action" as const,
          actor: "Bạn cần thao tác",
          title: "Hãng báo đã giao sách",
          note: "Xác nhận đã nhận để bắt đầu 72 giờ kiểm tra. Nếu chưa có sách, hãy báo để quản trị viên đối chiếu.",
          deadline: order.delivery.deliveryDeadline,
        };
      }
      return {
        phase: 1,
        tone: "waiting" as const,
        actor: "Hãng đang vận chuyển",
        title: order.delivery?.demoOutForDeliveryAt
          ? "Bưu tá đang đi giao sách cho bạn"
          : "Sách đang trên đường đến bạn",
        note: "Bạn sẽ xác nhận sau khi nhận sách để bắt đầu thời hạn kiểm tra.",
        deadline: order.delivery?.deliveryDeadline ?? null,
      };
    case "Inspection":
      return {
        phase: 2,
        tone: "action" as const,
        actor: "Đã nhận sách",
        title: "Kiểm tra sách bạn đã nhận",
        note: "Tiền vẫn được giữ. Nếu sách khác biên bản, hãy báo trong hạn kiểm tra. Khi hết hạn và không có sự cố, hệ thống quyết toán cho người bán.",
        deadline: order.inspectionDeadline,
      };
    case "ResolutionPending":
      return {
        phase,
        tone: "issue" as const,
        actor: "Đang chờ quản trị viên",
        title: "Đơn đang được xem xét",
        note: "Hệ thống đã nhận yêu cầu. Tiền vẫn được giữ trong lúc xử lý. Chưa có ngày hoàn tiền.",
        deadline: null,
      };
    case "ReturnPending":
      if (order.delivery && !order.collectedAt) {
        return {
          phase,
          tone: "issue" as const,
          actor: "Đang chờ hãng vận chuyển",
          title: "Chờ hãng trả sách về điểm",
          note: "Tiền được hoàn sau khi điểm nhận lại và đối chiếu sách.",
          deadline: order.returnDeadline,
        };
      }
      return {
        phase,
        tone: "issue" as const,
        actor: "Cần trả sách",
        title: "Hoàn trả sách về điểm",
        note: `Mang sách về ${order.pointName} trong giờ mở cửa để nhân viên đối chiếu và hoàn tiền.`,
        deadline: order.returnDeadline,
      };
    case "Completed":
      return {
        phase: 2,
        tone: "success" as const,
        actor: "Đã hoàn tất",
        title: "Giao dịch hoàn tất",
        note: "Tiền bán đã được chuyển vào Ví người bán.",
        deadline: null,
      };
    case "Cancelled":
      return {
        phase,
        tone: "issue" as const,
        actor: order.paidAt && order.refunded ? "Đã hoàn tiền" : "Đã hủy",
        title: "Đơn đã bị hủy",
        note: order.paidAt && order.refunded
          ? `Đã hoàn ${formatVnd(order.amounts.buyerTotal)} về Ví của bạn.`
          : "Đơn đã đóng. Bạn có thể kiểm tra các khoản giữ của phiên trong Ví.",
        deadline: null,
      };
    case "PaymentExpired":
      return {
        phase: 0,
        tone: "issue" as const,
        actor: "Đã quá hạn",
        title: "Hết hạn thanh toán",
        note: "Đơn hàng tự động hủy do người mua không thanh toán trong thời hạn quy định.",
        deadline: null,
      };
  }
}

function Stepper({ currentPhase }: { currentPhase: number }) {
  const steps = [
    { label: "1. Thanh toán", icon: "wallet" as const },
    { label: "2. Nhận sách", icon: "bag" as const },
    { label: "3. Kiểm tra", icon: "book" as const },
  ];
  return (
    <View
      style={{
        position: "relative",
        flexDirection: "row",
        alignItems: "flex-start",
        marginVertical: space.xs,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 15,
          left: "16.67%",
          right: "50%",
          height: 2,
          backgroundColor: currentPhase > 0 ? colors.success : colors.rule,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 15,
          left: "50%",
          right: "16.67%",
          height: 2,
          backgroundColor: currentPhase > 1 ? colors.success : colors.rule,
        }}
      />
      {steps.map((st, i) => {
        const active = i === currentPhase;
        const done = i < currentPhase;
        return (
          <View
            key={st.label}
            style={{
              flex: 1,
              alignItems: "center",
            }}
          >
            <View
              style={{
                paddingHorizontal: 6,
                backgroundColor: stitchTokens.creamBg,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: active
                    ? stitchTokens.wine
                    : done
                      ? colors.success
                      : colors.surface,
                  borderWidth: 1.5,
                  borderColor: active
                    ? stitchTokens.wine
                    : done
                      ? colors.success
                      : colors.rule,
                }}
              >
                {done ? (
                  <Icon name="check" size={16} color={colors.surface} />
                ) : (
                  <AppText
                    kind="bold"
                    color={active ? colors.surface : colors.muted}
                    style={{
                      fontSize: 13,
                      lineHeight: 16,
                      includeFontPadding: false,
                    }}
                  >
                    {i + 1}
                  </AppText>
                )}
              </View>
            </View>
            <AppText
              kind="small"
              color={active ? stitchTokens.wine : done ? colors.ink : colors.muted}
              style={{
                marginTop: 6,
                fontWeight: active ? "700" : "500",
                fontSize: 11,
                textAlign: "center",
              }}
            >
              {st.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

function StatusBanner({
  presentation,
  serverTime,
}: {
  presentation: ReturnType<typeof orderPresentation>;
  serverTime: string | undefined;
}) {
  const remaining = useRemaining(presentation.deadline, serverTime);
  const toneBg =
    presentation.tone === "success"
      ? colors.successSurface
      : presentation.tone === "action"
        ? stitchTokens.goldLight
        : presentation.tone === "issue"
          ? colors.warningSurface
          : colors.surface;
  const toneBorder =
    presentation.tone === "success"
      ? colors.success
      : presentation.tone === "action"
        ? stitchTokens.wine
        : presentation.tone === "issue"
          ? colors.warning
          : colors.rule;
  const toneText =
    presentation.tone === "success"
      ? colors.success
      : presentation.tone === "action"
        ? stitchTokens.wineDark
        : presentation.tone === "issue"
          ? colors.warning
          : colors.ink;

  const badgeBg =
    presentation.tone === "success"
      ? stitchTokens.likeNewGreenBg
      : presentation.tone === "action"
        ? stitchTokens.wine
        : presentation.tone === "issue"
          ? stitchTokens.flashRedBg
          : stitchTokens.roseWarmSurface;
  const badgeText =
    presentation.tone === "success"
      ? stitchTokens.likeNewGreen
      : presentation.tone === "action"
        ? stitchTokens.gold
        : presentation.tone === "issue"
          ? stitchTokens.darkRed
          : stitchTokens.wine;

  return (
    <View
      style={{
        padding: space.md,
        borderRadius: radius.card,
        backgroundColor: toneBg,
        borderWidth: 1,
        borderColor: toneBorder,
        gap: space.xs,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        <View
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: radius.small,
            backgroundColor: badgeBg,
          }}
        >
          <AppText
            kind="small"
            color={badgeText}
            style={{ fontWeight: "700", fontSize: 11 }}
          >
            {presentation.actor}
          </AppText>
        </View>
        {presentation.deadline && remaining > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="clock" size={13} color={toneText} />
            <AppText kind="small" color={toneText} style={{ fontWeight: "700" }}>
              còn {formatRemaining(remaining)}
            </AppText>
          </View>
        )}
      </View>
      <AppText kind="bold" color={toneText} style={{ fontSize: 16 }}>
        {presentation.title}
      </AppText>
      <AppText kind="small" color={colors.ink}>
        {presentation.note}
      </AppText>
      {presentation.deadline && (
        <AppText
          kind="small"
          color={colors.muted}
          style={{ fontSize: 11, marginTop: 2 }}
        >
          Hạn chót: {time(presentation.deadline)}
        </AppText>
      )}
    </View>
  );
}

export function WinnerSteps({
  orderId,
  boughtNow,
  heldAmount,
  paused = false,
}: {
  orderId: string;
  boughtNow: boolean;
  heldAmount?: number;
  paused?: boolean;
}) {
  const { client } = useSession();
  const foreground = useForeground();
  const queryClient = useQueryClient();
  const live = usePointOrderLive(orderId, foreground);
  const order = useQuery({
    queryKey: pointOrderKey(orderId),
    queryFn: () => readPointOrderNewest(client, queryClient, orderId),
    enabled: foreground,
    retry: false,
    staleTime: 0,
    // Realtime WebSocket pushes Staff handover/dispatch and carrier updates
    // immediately; keep 5s REST polling only as a fallback when socket is down.
    refetchInterval: (query) => {
      if (!foreground || live) return false;
      const st = query.state.data?.state;
      if (st === "Completed" || st === "Cancelled" || st === "PaymentExpired") {
        return false;
      }
      return 5_000;
    },
  });
  const [pending, setPending] = useState<OrderCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    step: OrderStep;
    title: string;
    message?: string;
    label: string;
    text?: string;
    delivery?: DeliveryChoice;
    payment?: WinnerPaymentReviewProps;
  } | null>(null);
  // Shown once, kept only in memory; leaving the screen needs a new code.
  const [issued, setIssued] = useState<{
    code: string | null;
    expiresAt: string | null;
    serverTime: string;
  } | null>(null);

  const run = async (command: OrderCommand) => {
    setBusy(true);
    setError(null);
    try {
      const result = await sendOrderCommand(client, command);
      setPending(null);
      if (command.step === "collection-code") {
        const r = result as CodeIssued;
        setIssued({
          code: r.code,
          expiresAt: r.receipt.codeExpiresAt,
          serverTime: r.receipt.serverTime,
        });
      }
    } catch (caught) {
      setPending(outcomeUnknown(caught) ? command : null);
      setError(auctionErrorText(caught));
    } finally {
      setBusy(false);
      setConfirm(null);
      void queryClient.invalidateQueries({ queryKey: pointOrderKey(orderId) });
    }
  };

  const ask = (
    step: OrderStep,
    title: string,
    message: string,
    label: string,
    text?: string,
  ) => setConfirm({ step, title, message, label, text });

  if (order.isPending)
    return <StatePanel wine loading title="Đang tải đơn nhận sách" />;
  if (order.error)
    return (
      <View style={{ gap: space.sm }}>
        <Notice tone="error">{presentError(order.error).message}</Notice>
        <Button
          wine
          secondary
          title="Thử tải lại"
          busy={order.isFetching}
          onPress={() => void order.refetch()}
        />
      </View>
    );

  const o = order.data;
  const locked = busy || !!pending;
  const presentation = orderPresentation(o);

  return (
    <View style={{ gap: space.md }}>
      {/* 1. Thanh tiến trình 3 bước */}
      <Stepper currentPhase={presentation.phase} />

      {/* 2. Banner trạng thái đơn hàng */}
      <StatusBanner presentation={presentation} serverTime={o.serverTime} />
      {o.state === "Cancelled" && o.paidAt && o.refunded && (
        <Button secondary title="Xem lịch sử giao dịch Ví" onPress={() => router.push({ pathname: "/wallet", params: { section: "history" } })} />
      )}

      {o.paidAt && (
        <View style={{ gap: space.xs, padding: space.md, backgroundColor: stitchTokens.warmIvory, borderRadius: radius.small, borderWidth: 1, borderColor: stitchTokens.cardBorder }}>
          <AppText kind="bold" color={stitchTokens.wine}>
            {o.state === "Cancelled" || o.state === "Completed" ? "Tổng đã thanh toán" : "Tiền đang giữ cho đơn"} {formatVnd(o.amounts.buyerTotal)}
          </AppText>
          <AppText kind="small" color={colors.muted}>
            {`Tiền sách ${formatVnd(o.amounts.bookPrice)} · Phí giao ${o.amounts.outboundFee > 0 ? formatVnd(o.amounts.outboundFee) : "0đ"}`}
          </AppText>
          <AppText kind="small" color={colors.muted}>
            {o.state === "Cancelled" ? "Đơn đã đóng. Không thu phí dịch vụ." : buyerSaleFeeText(o.amounts.commissionBps)}
          </AppText>
        </View>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      {pending ? (
        <View style={{ gap: space.sm }}>
          <Button
            wine
            title="Thử lại thao tác vừa rồi"
            busy={busy}
            onPress={() => void run(pending)}
          />
          <Button
            wine
            secondary
            title="Cập nhật đơn"
            disabled={busy}
            onPress={() => void order.refetch()}
          />
        </View>
      ) : (
        <>
          {/* BƯỚC 1: THANH TOÁN (AwaitingPayment) */}
          {o.state === "AwaitingPayment" && (
            <Payment
              order={o}
              heldAmount={heldAmount}
              locked={locked}
              onPay={(delivery) => setConfirm({
                step: "pay",
                title: "Thanh toán từ Ví",
                label: "Thanh toán",
                delivery,
                payment: {
                  bookPrice: o.amounts.bookPrice,
                  deliveryFee: delivery?.fee ?? 0,
                  heldAmount,
                  commissionBps: o.amounts.commissionBps,
                  receiptMethod: delivery ? "Giao tận nơi" : `Tự nhận tại ${o.pointName}`,
                },
              })}
            />
          )}

          {/* BƯỚC 2: DUYỆT BIÊN BẢN KIỂM TRA (Fulfilling) */}
          {o.state === "Fulfilling" && (
            <Report order={o} locked={locked} ask={ask} />
          )}

          {/* BƯỚC 2: VẬN CHUYỂN TẬN NƠI (CarrierOutbound) */}
          {(o.state === "InTransit" ||
            (o.state === "ReadyForCollection" &&
              o.fulfillmentMethod === "CarrierOutbound")) && (
            <DeliveryPanel
              order={o}
              locked={locked}
              onRefresh={() => void order.refetch()}
            />
          )}

          {o.state === "InTransit" && o.delivery?.deliveredAt && (
            <View style={{ gap: space.sm }}>
              <Button title="Tôi đã nhận được sách" wine disabled={locked} onPress={() => ask(
                "confirm-receipt", "Xác nhận đã nhận sách?",
                "Thời hạn kiểm tra 72 giờ bắt đầu khi bạn xác nhận.", "Xác nhận đã nhận sách",
              )} />
              <Button title="Tôi chưa nhận được sách" secondary wine disabled={locked} onPress={() => ask(
                "report-non-receipt", "Báo chưa nhận được sách?",
                "Tiền vẫn được giữ trong đơn. Quản trị viên sẽ đối chiếu với bên vận chuyển.", "Gửi báo cáo",
              )} />
            </View>
          )}

          {/* BƯỚC 2: TỰ NHẬN TẠI QUẦY (SelfCollect) */}
          {o.state === "ReadyForCollection" &&
            o.fulfillmentMethod === "SelfCollect" && (
              <Collection
                order={o}
                issued={issued}
                locked={locked}
                onRequest={() =>
                  ask(
                    "collection-code",
                    "Lấy mã nhận sách?",
                    `Mã có hiệu lực 10 phút và chỉ hiển thị một lần. Hãy lấy mã khi bạn đã ở ${o.pointName}.`,
                    "Lấy mã",
                  )
                }
              />
            )}

          {/* BƯỚC 3: ĐÁNH GIÁ (Inspection / Completed) */}
          {["Inspection", "Completed"].includes(o.state) && (
            <ReviewEntry type="PointOrder" id={o.id} version={o.version} />
          )}

          {/* BƯỚC 3: KIỂM TRA SÁCH 72H (Inspection) */}
          {o.state === "Inspection" && (
            <Claim order={o} locked={locked} ask={ask} />
          )}

          {o.state === "Inspection" && (
            <DemoSkipButton
              intentKey={`${o.id}:${o.version}`}
              label="Hoàn tất kiểm tra ngay · Demo"
              note="Kết thúc thời hạn kiểm tra và giải ngân theo biên bản, như khi hết 72 giờ."
              run={(key) => advanceDemoPointOrder(client, o.id, o.version, key)}
              onDone={() =>
                queryClient.invalidateQueries({
                  queryKey: pointOrderKey(orderId),
                })
              }
            />
          )}
        </>
      )}

      <ConfirmDialog
        visible={!!confirm && !paused}
        title={confirm?.title ?? ""}
        message={confirm?.message}
        confirmLabel={confirm?.label ?? ""}
        destructive={confirm?.step === "reject-report"}
        busy={busy}
        onCancel={() => !busy && setConfirm(null)}
        onConfirm={() =>
          confirm &&
          void run(
            createOrderCommand(
              o.id,
              confirm.step,
              o.version,
              Crypto.randomUUID(),
              confirm.text,
              confirm.delivery,
            ),
          )
        }
      >
        {confirm?.payment ? <WinnerPaymentReview {...confirm.payment} /> : null}
      </ConfirmDialog>
    </View>
  );
}

type Ask = (
  step: OrderStep,
  title: string,
  message: string,
  label: string,
  text?: string,
) => void;

function Payment({
  order,
  heldAmount,
  locked,
  onPay,
}: {
  order: PointOrder;
  heldAmount?: number;
  locked: boolean;
  onPay: (delivery?: DeliveryChoice) => void;
}) {
  const { client } = useSession();
  const remaining = useRemaining(order.paymentDeadline, order.serverTime);
  const [deliver, setDeliver] = useState(false);
  const [addressId, setAddressId] = useState<string | null>(null);

  // Thêm địa chỉ mới ngay tại chỗ
  const [addingNew, setAddingNew] = useState(false);
  const [newRecipient, setNewRecipient] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLocality, setNewLocality] = useState("");
  const [localitySearch, setLocalitySearch] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () => client.request("/me/addresses", addressBook),
    enabled: deliver,
  });

  const areas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => client.request("/service-areas", directory),
    enabled: deliver,
  });

  const items = (addresses.data?.items ?? []).filter(
    (a) => a.serviceAreaCode === "HCM-DEMO-v1",
  );
  const chosen =
    addressId ?? items.find((a) => a.isDefault)?.id ?? items[0]?.id ?? null;

  // ADR 0044: the server prices delivery; payment rechecks this fee.
  const quote = useQuery({
    queryKey: ["point-order-delivery-quote", order.id, chosen],
    queryFn: () =>
      client.request(
        `/me/point-orders/${order.id}/delivery-quote?addressId=${chosen}`,
        deliveryQuote,
      ),
    enabled: deliver && !!chosen,
    staleTime: 0,
  });

  const wallet = useQuery({
    queryKey: ["wallet"],
    queryFn: () => client.request("/me/wallet", walletSummary),
    staleTime: 5_000,
  });

  const total = deliver ? quote.data?.buyerTotal : order.amounts.bookPrice;
  const balance = total === undefined || (deliver && quote.isError)
    ? null
    : auctionCheckoutBalance(total, heldAmount);
  const needFromWallet = balance?.label === "Cần trừ thêm từ ví" ? balance.amount : (total ?? 0) - (heldAmount ?? 0);
  const walletShortfall =
    wallet.data && needFromWallet > wallet.data.available
      ? needFromWallet - wallet.data.available
      : 0;
  const missingQuoteLabel = !chosen
    ? "Chọn địa chỉ"
    : quote.isFetching
      ? "Đang tính phí…"
      : "Chưa có báo giá";

  const handleSaveNewAddress = async () => {
    if (addressBusy) return;
    if (!newRecipient.trim() || newRecipient.trim().length < 2) {
      setAddressError("Vui lòng nhập họ tên người nhận.");
      return;
    }
    if (!/^0[0-9]{9}$/.test(newPhone.trim())) {
      setAddressError("Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0).");
      return;
    }
    if (!newLocality) {
      setAddressError("Vui lòng chọn tỉnh/thành phố nhận sách.");
      return;
    }
    if (!newDetail.trim() || newDetail.trim().length < 5) {
      setAddressError("Vui lòng nhập địa chỉ chi tiết (số nhà, tên đường...).");
      return;
    }
    if (!addresses.data?.version && addresses.data?.version !== 0) {
      setAddressError("Chưa tải được sổ địa chỉ. Hãy thử lại.");
      return;
    }

    setAddressBusy(true);
    setAddressError(null);
    try {
      const receipt = await client.request("/me/addresses", addressReceipt, {
        method: "POST",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
        body: JSON.stringify({
          expectedBookVersion: addresses.data.version,
          address: {
            recipientName: newRecipient.trim(),
            phone: newPhone.trim(),
            serviceAreaCode: "HCM-DEMO-v1",
            localityCode: newLocality,
            detail: newDetail.trim(),
          },
          makeDefault: items.length === 0,
        }),
      });

      const refreshed = await addresses.refetch();
      const saved = refreshed.data?.items.find((a) => a.id === receipt.addressId);
      if (saved) {
        setAddressId(saved.id);
      }
      setAddingNew(false);
      setNewRecipient("");
      setNewPhone("");
      setNewLocality("");
      setNewDetail("");
    } catch (err) {
      setAddressError(auctionErrorText(err));
    } finally {
      setAddressBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      {/* 1. Chọn phương thức nhận sách */}
      <View
        style={{
          gap: space.sm,
          padding: space.md,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.rule,
          backgroundColor: colors.surface,
        }}
      >
        <AppText kind="bold" style={{ fontSize: 15 }}>
          Phương thức nhận sách
        </AppText>

        {/* 2 Card lựa chọn phương thức song song */}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {/* Option A: Tự nhận tại điểm */}
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: !deliver, disabled: locked }}
            disabled={locked}
            onPress={() => {
              setDeliver(false);
              setAddingNew(false);
              setAddressError(null);
            }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 88,
              padding: space.md,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: !deliver ? stitchTokens.wine : stitchTokens.cardBorder,
              backgroundColor: !deliver ? stitchTokens.wine : stitchTokens.parchment,
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: locked ? 0.55 : pressed ? 0.82 : 1,
            })}
          >
            <Icon
              name="pin"
              size={20}
              color={!deliver ? stitchTokens.gold : stitchTokens.wine}
            />
            <AppText
              kind="bold"
              color={!deliver ? stitchTokens.warmIvory : stitchTokens.wineDark}
              style={{ fontSize: 13, textAlign: "center" }}
            >
              Tự nhận tại điểm
            </AppText>
            <AppText
              kind="small"
              color={!deliver ? stitchTokens.gold : stitchTokens.brownMuted}
              style={{ fontSize: 11, fontWeight: "600", textAlign: "center" }}
            >
              Miễn phí · Tại quầy
            </AppText>
          </Pressable>

          {/* Option B: Giao tận nơi */}
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: deliver, disabled: locked }}
            disabled={locked}
            onPress={() => setDeliver(true)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 88,
              padding: space.md,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: deliver ? stitchTokens.wine : stitchTokens.cardBorder,
              backgroundColor: deliver ? stitchTokens.wine : stitchTokens.parchment,
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: locked ? 0.55 : pressed ? 0.82 : 1,
            })}
          >
            <Icon
              name="truck"
              size={20}
              color={deliver ? stitchTokens.gold : stitchTokens.wine}
            />
            <AppText
              kind="bold"
              color={deliver ? stitchTokens.warmIvory : stitchTokens.wineDark}
              style={{ fontSize: 13, textAlign: "center" }}
            >
              Giao tận nơi
            </AppText>
            <AppText
              kind="small"
              color={deliver ? stitchTokens.gold : stitchTokens.brownMuted}
              style={{ fontSize: 11, fontWeight: "600", textAlign: "center" }}
            >
              {quote.data && quote.data.outboundFee > 0
                ? formatVnd(quote.data.outboundFee)
                : quote.data
                  ? "Miễn phí"
                  : "Lật Lại Express"}
            </AppText>
          </Pressable>
        </View>

        {/* Nội dung chi tiết theo phương thức */}
        {!deliver ? (
          <View
            style={{
              flexDirection: "row",
              gap: space.sm,
              padding: space.sm + 2,
              backgroundColor: colors.paper,
              borderRadius: radius.small,
              borderWidth: 1,
              borderColor: colors.rule,
              alignItems: "flex-start",
              marginTop: space.xs,
            }}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: stitchTokens.wineAlpha08,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 2,
              }}
            >
              <Icon name="pin" size={15} color={stitchTokens.wine} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText kind="bold" style={{ fontSize: 13 }}>
                {order.pointName}
              </AppText>
              <AppText kind="small" color={colors.muted} style={{ fontSize: 11 }}>
                Giờ phục vụ: {POINT_HOURS_LABEL}
              </AppText>
              <AppText kind="small" color={colors.ink} style={{ fontSize: 11, marginTop: 2 }}>
                Sau khi thanh toán thành công, hệ thống sẽ tạo mã nhận sách tại quầy. Bạn đến quầy để kiểm tra và nhận sách trực tiếp.
              </AppText>
            </View>
          </View>
        ) : (
          <View style={{ gap: space.sm, marginTop: space.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <AppText kind="bold" style={{ fontSize: 13 }}>
                Địa chỉ nhận sách
              </AppText>
              <AppText kind="small" color={colors.muted} style={{ fontSize: 11 }}>
                {quote.data?.policyCode === "GHN-LIVE-v2"
                  ? "Cước thực tế GHN Express"
                  : "Giao toàn quốc từ điểm"}
              </AppText>
            </View>

            {/* Danh sách địa chỉ đã lưu */}
            {addresses.isPending ? (
              <StatePanel wine loading title="Đang tải danh sách địa chỉ" />
            ) : addresses.error ? (
              <Notice tone="error">{presentError(addresses.error).message}</Notice>
            ) : items.length > 0 ? (
              <View style={{ gap: space.xs }}>
                {items.map((a) => {
                  const isSelected = a.id === chosen;
                  return (
                    <Pressable
                      key={a.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected, disabled: locked }}
                      disabled={locked}
                      onPress={() => setAddressId(a.id)}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "flex-start",
                        padding: space.sm + 2,
                        borderRadius: radius.card,
                        borderWidth: isSelected ? 1.5 : 1,
                        borderColor: isSelected ? stitchTokens.wine : colors.rule,
                        backgroundColor: isSelected ? stitchTokens.wineAlpha05 : colors.paper,
                        gap: space.sm,
                        opacity: locked ? 0.55 : pressed ? 0.78 : 1,
                      })}
                    >
                      <View
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          borderWidth: 2,
                          borderColor: isSelected ? stitchTokens.wine : colors.rule,
                          alignItems: "center",
                          justifyContent: "center",
                          marginTop: 2,
                        }}
                      >
                        {isSelected && (
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: stitchTokens.wine,
                            }}
                          />
                        )}
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <AppText kind="bold" style={{ fontSize: 13 }}>
                            {a.recipientName}
                          </AppText>
                          <AppText kind="small" color={colors.muted} style={{ fontSize: 12 }}>
                            · {a.phone}
                          </AppText>
                          {a.isDefault && (
                            <View
                              style={{
                                paddingHorizontal: 6,
                                paddingVertical: 1,
                                borderRadius: 4,
                                backgroundColor: stitchTokens.goldLight,
                                borderWidth: 1,
                                borderColor: stitchTokens.goldBorder,
                              }}
                            >
                              <AppText
                                kind="small"
                                color={stitchTokens.wineDark}
                                style={{ fontSize: 9, fontWeight: "700" }}
                              >
                                MẶC ĐỊNH
                              </AppText>
                            </View>
                          )}
                        </View>
                        <AppText kind="small" color={colors.ink} style={{ fontSize: 12 }}>
                          {a.detail}
                          {a.localityCode
                            ? ` · ${areas.data?.localities.find((loc) => loc.code === a.localityCode)?.label ?? a.localityCode}`
                            : ""}
                        </AppText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* Nút mở Sheet thêm địa chỉ mới */}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: locked }}
              disabled={locked}
              onPress={() => {
                setAddressError(null);
                setAddingNew(true);
              }}
              style={({ pressed }) => ({
                minHeight: 46,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 10,
                paddingHorizontal: space.md,
                borderRadius: radius.control,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: stitchTokens.wine,
                backgroundColor: stitchTokens.roseWarmSurface,
                gap: 6,
                marginTop: 2,
                opacity: locked ? 0.55 : pressed ? 0.78 : 1,
              })}
            >
              <Icon name="plus" size={15} color={stitchTokens.wine} />
              <AppText kind="bold" color={stitchTokens.wine} style={{ fontSize: 13 }}>
                Thêm địa chỉ giao nhận mới
              </AppText>
            </Pressable>

            <Sheet
              title="Thêm địa chỉ nhận sách"
              visible={addingNew}
              dismissible={!addressBusy}
              onClose={() => !addressBusy && setAddingNew(false)}
              footer={
                <View style={{ gap: space.sm }}>
                  <Button
                    wine
                    title={addressBusy ? "Đang lưu…" : "Lưu & chọn địa chỉ"}
                    busy={addressBusy}
                    disabled={addressBusy}
                    onPress={handleSaveNewAddress}
                  />
                  <Button
                    wine
                    secondary
                    title="Hủy"
                    disabled={addressBusy}
                    onPress={() => setAddingNew(false)}
                  />
                </View>
              }
            >
              <View style={{ gap: space.md }}>
                {addressError ? <Notice tone="error">{addressError}</Notice> : null}

                <TextField
                  label="Họ tên người nhận"
                  value={newRecipient}
                  onChangeText={setNewRecipient}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  editable={!addressBusy}
                />
                <TextField
                  label="Số điện thoại"
                  value={newPhone}
                  onChangeText={setNewPhone}
                  placeholder="10 chữ số (09...)"
                  keyboardType="phone-pad"
                  editable={!addressBusy}
                />

                <View style={{ gap: space.xs }}>
                  <TextField
                    label={`Tỉnh / Thành phố nhận sách (${areas.data?.localities.length ?? 63} tỉnh/thành)`}
                    value={localitySearch}
                    onChangeText={setLocalitySearch}
                    placeholder="Tìm nhanh tỉnh/thành (VD: Hà Nội, Huế, Cà Mau...)"
                    editable={!addressBusy}
                  />
                  <ScrollView
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    style={{ maxHeight: 168 }}
                    contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 4 }}
                  >
                    {(areas.data?.localities ?? [])
                      .filter((loc) => {
                        const q = localitySearch
                          .trim()
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/\p{Diacritic}/gu, "")
                          .replaceAll("đ", "d");
                        if (!q) return true;
                        const label = loc.label
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/\p{Diacritic}/gu, "")
                          .replaceAll("đ", "d");
                        return label.includes(q) || loc.code.toLowerCase().includes(q);
                      })
                      .map((loc) => (
                        <Chip
                          key={loc.code}
                          wine
                          compact
                          title={loc.label}
                          selected={newLocality === loc.code}
                          disabled={addressBusy}
                          onPress={() => setNewLocality(loc.code)}
                        />
                      ))}
                  </ScrollView>
                </View>

                <TextField
                  label="Địa chỉ chi tiết"
                  value={newDetail}
                  onChangeText={setNewDetail}
                  placeholder="Số nhà, tên đường, phường..."
                  editable={!addressBusy}
                />
              </View>
            </Sheet>

            {/* Trạng thái báo giá */}
            {quote.error ? (
              <Notice tone="error">{auctionErrorText(quote.error)}</Notice>
            ) : quote.data ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                  padding: space.sm + 2,
                  borderRadius: 10,
                  backgroundColor: quote.data.outboundFee > 0 ? stitchTokens.parchment : stitchTokens.likeNewGreenBg,
                  borderWidth: 1,
                  borderColor: quote.data.outboundFee > 0 ? stitchTokens.cardBorder : stitchTokens.greenBorderSoft,
                  marginTop: space.xs,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: quote.data.outboundFee > 0 ? stitchTokens.roseWarmSurface : stitchTokens.likeNewGreen,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={quote.data.outboundFee > 0 ? "truck" : "check"} size={13} color={quote.data.outboundFee > 0 ? stitchTokens.wine : stitchTokens.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText kind="bold" color={quote.data.outboundFee > 0 ? stitchTokens.wineDark : stitchTokens.likeNewGreen} style={{ fontSize: 13 }}>
                    {quote.data.outboundFee > 0
                      ? `Phí giao tận nơi: ${formatVnd(quote.data.outboundFee)}`
                      : "Miễn phí giao hàng"}
                  </AppText>
                  <AppText kind="small" color={colors.muted} style={{ fontSize: 12 }}>
                    {quote.data.policyCode === "GHN-LIVE-v2"
                      ? "Cước thực tế từ Giao Hàng Nhanh (GHN) tới địa chỉ đã chọn"
                      : "Tính theo biểu phí khu vực từ điểm giữ sách tới địa chỉ đã chọn"}
                  </AppText>
                </View>
              </View>
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingVertical: 4,
                }}
              >
                <Icon name="clock" size={12} color={colors.muted} />
                <AppText kind="small" color={colors.muted} style={{ fontSize: 12 }}>
                  Đang xác nhận báo giá vận chuyển…
                </AppText>
              </View>
            )}
          </View>
        )}
      </View>

      {/* 2. Bảng phân tách chi tiết tiền */}
      <View
        style={{
          gap: space.xs,
          padding: space.md,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.rule,
          backgroundColor: colors.surface,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <Icon name="tag" size={16} color={stitchTokens.wine} />
          <AppText kind="bold" style={{ fontSize: 15 }}>
            Chi tiết thanh toán
          </AppText>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <AppText kind="small" color={colors.muted}>
            Giá trúng đấu giá
          </AppText>
          <AppText kind="bold" style={{ fontSize: 14 }}>
            {formatVnd(order.amounts.bookPrice)}
          </AppText>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <AppText kind="small" color={colors.muted}>
            Phí giao nhận
          </AppText>
          {deliver ? (
            quote.data && quote.data.outboundFee > 0 ? (
              <AppText kind="bold" color={colors.ink} style={{ fontSize: 14 }}>
                {formatVnd(quote.data.outboundFee)}
              </AppText>
            ) : quote.data ? (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 4,
                  backgroundColor: colors.successSurface,
                }}
              >
                <AppText kind="bold" color={colors.success} style={{ fontSize: 12 }}>
                  Miễn phí
                </AppText>
              </View>
            ) : (
              <AppText kind="small" color={colors.muted} style={{ fontSize: 12 }}>
                {missingQuoteLabel}
              </AppText>
            )
          ) : (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor: colors.successSurface,
              }}
            >
              <AppText kind="bold" color={colors.success} style={{ fontSize: 12 }}>
                0 đ (Tại quầy)
              </AppText>
            </View>
          )}
        </View>

        <View style={{ height: 1, backgroundColor: colors.rule, marginVertical: 6 }} />

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <AppText kind="bold" style={{ fontSize: 15 }}>
            Tổng cần thanh toán
          </AppText>
          <AppText kind="bold" color={stitchTokens.wine} style={{ fontSize: 20 }}>
            {total === undefined ? "—" : formatVnd(total)}
          </AppText>
        </View>

        {heldAmount !== undefined && balance && ([
          ["Ví đang giữ cho phiên", heldAmount],
          [balance.label, balance.amount],
        ] as const).map(([label, amount]) => (
          <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
            <AppText kind="small" color={colors.muted} style={{ flex: 1 }}>{label}</AppText>
            <AppText kind="bold">{formatVnd(amount)}</AppText>
          </View>
        ))}

        <AppText kind="small" color={colors.muted}>{buyerSaleFeeText(order.amounts.commissionBps)}</AppText>
        {/* Khối bảo chứng an toàn */}
        <View
          style={{
            flexDirection: "row",
            gap: space.sm,
            padding: space.sm,
            borderRadius: radius.small,
            backgroundColor: stitchTokens.goldLight,
            borderWidth: 1,
            borderColor: stitchTokens.goldBorder,
            marginTop: space.xs,
            alignItems: "flex-start",
          }}
        >
          <View style={{ marginTop: 1 }}>
            <Icon name="shield" size={16} color={stitchTokens.wine} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 12 }}>
              Bảo chứng thanh toán an toàn
            </AppText>
            <AppText kind="small" color={colors.ink} style={{ fontSize: 11 }}>
              {auctionOrderHoldText}
            </AppText>
          </View>
        </View>
      </View>

      {/* 3. Nút bấm Thanh toán */}
      {walletShortfall > 0 && (
        <View style={{ gap: space.xs }}>
          <Notice tone="error">
            Ví khả dụng còn thiếu {formatVnd(walletShortfall)} để hoàn tất thanh toán.
          </Notice>
          <Button
            wine
            secondary
            title="Nạp tiền vào ví"
            onPress={() => router.push("/wallet")}
          />
        </View>
      )}
      <Button
        wine
        title={
          total === undefined
            ? "Thanh toán từ Ví Lật Lại"
            : `Thanh toán ${formatVnd(total)} từ Ví Lật Lại`
        }
        disabled={locked || remaining === 0 || (deliver && !quote.data) || walletShortfall > 0}
        onPress={() =>
          deliver && quote.data
            ? onPay({
                addressId: quote.data.addressId,
                addressVersion: quote.data.addressVersion,
                fee: quote.data.outboundFee,
              })
            : onPay()
        }
      />
    </View>
  );
}

function Report({
  order,
  locked,
  ask,
}: {
  order: PointOrder;
  locked: boolean;
  ask: Ask;
}) {
  const remaining = useRemaining(order.acceptanceDeadline, order.serverTime);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);
  return (
    <View style={{ gap: space.md }}>
      <View
        style={{
          gap: space.xs,
          padding: space.lg,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.rule,
          backgroundColor: colors.surface,
        }}
      >
        <AppText kind="bold">Biên bản kiểm tra tình trạng tại điểm</AppText>
        <AppText kind="small" color={colors.ink}>
          Đạt kiểm tra tình trạng lúc {time(order.report.inspectedAt)}.{" "}
          {order.report.scope}
        </AppText>
        {order.report.note && (
          <AppText kind="small" color={colors.ink}>
            Ghi chú của nhân viên: {order.report.note}
          </AppText>
        )}
        <AppText kind="small" color={colors.muted}>
          Còn {formatRemaining(remaining)} để phản hồi biên bản.
        </AppText>
      </View>
      <Button
        wine
        title="Đồng ý biên bản"
        disabled={locked || remaining === 0}
        onPress={() =>
          ask(
            "accept-report",
            "Đồng ý biên bản kiểm tra?",
            order.fulfillmentMethod === "CarrierOutbound"
              ? `Sau khi đồng ý, ${order.pointName} sẽ giao sách cho hãng vận chuyển trong 72 giờ. Đồng ý biên bản không làm mất quyền báo vấn đề sau khi nhận sách.`
              : `Sau khi đồng ý, bạn có 72 giờ để lấy mã và nhận sách tại ${order.pointName} trong giờ ${POINT_HOURS}. Đồng ý biên bản không làm mất quyền báo vấn đề sau khi nhận sách.`,
            "Đồng ý",
          )
        }
      />
      <Button
        wine
        secondary
        title="Từ chối biên bản"
        disabled={locked || remaining === 0}
        onPress={() => setRejecting(true)}
      />
      <Sheet
        title="Từ chối biên bản kiểm tra"
        visible={rejecting}
        dismissible={!locked}
        onClose={() => !locked && setRejecting(false)}
        footer={
          <View style={{ gap: space.sm }}>
            <Button
              destructive
              title="Gửi lý do từ chối"
              disabled={locked}
              onPress={() => {
                const n = length(reason);
                if (n < 10 || n > 1000) setInvalid(true);
                else {
                  setRejecting(false);
                  ask(
                    "reject-report",
                    "Từ chối biên bản?",
                    `Sách sẽ không được giao. Quản trị viên xem lý do của bạn rồi quyết định hoàn tiền hoặc mở lại thời hạn nhận sách.\n\n“${reason.trim()}”`,
                    "Từ chối biên bản",
                    reason.trim(),
                  );
                }
              }}
            />
            <Button
              wine
              secondary
              title="Đóng"
              disabled={locked}
              onPress={() => setRejecting(false)}
            />
          </View>
        }
      >
        <TextField
          label="Lý do từ chối biên bản"
          multiline
          value={reason}
          editable={!locked}
          maxLength={1000}
          onChangeText={(text) => {
            setReason(text);
            setInvalid(false);
          }}
          hint="Nói rõ điểm biên bản khác mô tả (10–1.000 ký tự). Quản trị viên sẽ đọc lý do này."
          error={invalid ? "Nhập lý do từ 10 đến 1.000 ký tự." : undefined}
        />
      </Sheet>
    </View>
  );
}

const reopenLabel = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });

function Collection({
  order,
  issued,
  locked,
  onRequest,
}: {
  order: PointOrder;
  issued: {
    code: string | null;
    expiresAt: string | null;
    serverTime: string;
  } | null;
  locked: boolean;
  onRequest: () => void;
}) {
  const { client } = useSession();
  const demoStatus = useQuery({
    queryKey: ["demo-skip"],
    queryFn: () => getDemoSkipStatus(client),
    staleTime: Infinity,
    retry: false,
  });
  const demoEnabled = !!demoStatus.data?.enabled;

  const remaining = useRemaining(issued?.expiresAt ?? null, issued?.serverTime);
  const live = !!issued?.code && remaining > 0;
  const reopensAt = pointReopensAt(Date.parse(order.serverTime));
  const closed = useRemaining(reopensAt, order.serverTime) > 0;

  return (
    <View style={{ gap: space.md }}>
      {live ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            gap: space.xs,
            padding: space.lg,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.rule,
            backgroundColor: colors.surface,
          }}
        >
          <AppText kind="bold">Mã nhận sách tại quầy</AppText>
          <AppText
            kind="title"
            color={stitchTokens.wineDark}
            selectable
            style={{
              letterSpacing: 8,
              fontSize: 28,
              textAlign: "center",
              marginVertical: space.sm,
            }}
            accessibilityLabel={`Mã nhận sách ${issued!.code!.split("").join(" ")}`}
          >
            {issued!.code}
          </AppText>
          <AppText kind="small" color={colors.ink} style={{ textAlign: "center" }}>
            Đọc mã này cho nhân viên tại quầy {order.pointName}. Mã hết hạn sau{" "}
            {formatRemaining(remaining)}; không chia sẻ mã cho người khác.
          </AppText>
        </View>
      ) : issued ? (
        <AppText kind="small" color={colors.muted}>
          {issued.code === null
            ? "Mã đã được tạo nhưng không thể hiển thị lại. Hãy lấy mã mới khi đang ở quầy."
            : "Mã đã hết hạn. Hãy lấy mã mới khi đang ở quầy."}
        </AppText>
      ) : closed && reopensAt ? (
        <View
          style={{
            backgroundColor: stitchTokens.goldLight,
            padding: space.md,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: stitchTokens.goldBorder,
            gap: 4,
          }}
        >
          <AppText kind="small" color={stitchTokens.wineDark}>
            Điểm đang đóng cửa. Quầy mở lại lúc {reopenLabel(reopensAt)}; hãy
            lấy mã khi bạn đã ở quầy trong giờ {POINT_HOURS_LABEL}.
          </AppText>
          {demoEnabled && (
            <AppText
              kind="small"
              color={stitchTokens.wine}
              style={{ fontWeight: "600", marginTop: 2 }}
            >
              Chế độ Demo: Đã mở quyền lấy mã ngoài khung giờ 09:00–18:00 để kiểm thử toàn bộ hành trình.
            </AppText>
          )}
        </View>
      ) : (
        <AppText kind="small" color={colors.muted}>
          Chỉ lấy mã khi bạn đã ở quầy {order.pointName}, trong giờ{" "}
          {POINT_HOURS_LABEL}. Mã có hiệu lực 10 phút.
        </AppText>
      )}
      <Button
        wine
        secondary={live}
        title={issued ? "Lấy mã mới" : "Lấy mã nhận sách tại quầy"}
        disabled={locked || (closed && !live && !demoEnabled)}
        onPress={onRequest}
      />
      <AppText kind="small" color={colors.muted}>
        Địa điểm: {order.pointName}.
      </AppText>
    </View>
  );
}

// ADR 0044: the point hands the book to the simulated carrier, which delivers
// to the buyer's address. The buyer confirms receipt before inspection.
function DeliveryPanel({
  order,
  locked,
  onRefresh,
}: {
  order: PointOrder;
  locked: boolean;
  onRefresh: () => void;
}) {
  const { client } = useSession();
  const demoStatus = useQuery({
    queryKey: ["demo-skip"],
    queryFn: () => getDemoSkipStatus(client),
    staleTime: Infinity,
    retry: false,
  });
  const demoEnabled = !!demoStatus.data?.enabled;
  const d = order.delivery;
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  const step1Done = Boolean(d?.dispatchedAt);
  const step2Done = Boolean(d?.demoOutForDeliveryAt);
  const step3Done = Boolean(d?.deliveredAt);

  const handleDemoStart = async () => {
    if (simBusy || locked) return;
    setSimBusy(true);
    setSimError(null);
    try {
      await demoStartPointDelivery(
        client,
        order.id,
        order.version,
        Crypto.randomUUID(),
      );
      onRefresh();
    } catch (err) {
      setSimError(auctionErrorText(err));
    } finally {
      setSimBusy(false);
    }
  };

  const handleDemoDeliver = async () => {
    if (simBusy || locked) return;
    setSimBusy(true);
    setSimError(null);
    try {
      await demoDeliverPointOrder(
        client,
        order.id,
        order.version,
        Crypto.randomUUID(),
      );
      onRefresh();
    } catch (err) {
      setSimError(auctionErrorText(err));
    } finally {
      setSimBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      {/* 1. Thông tin giao nhận */}
      <View
        style={{
          gap: space.xs,
          padding: space.lg,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.rule,
          backgroundColor: colors.surface,
        }}
      >
        <AppText kind="bold">Thông tin nhận sách</AppText>
        {d && (
          <AppText kind="small" color={colors.ink}>
            {d.recipientName} · {d.phone}
          </AppText>
        )}
        {d && (
          <AppText kind="small" color={colors.muted}>
            {d.detail}
            {d.localityCode
              ? ` · ${
                  d.localityCode === "DEMO-A" || /^Q\d+$/i.test(d.localityCode)
                    ? "TP.HCM"
                    : d.localityCode === "DEMO-B"
                      ? "Bình Dương"
                      : d.localityCode === "DEMO-C"
                        ? "Vũng Tàu"
                        : d.localityCode
                }`
              : ""}
          </AppText>
        )}
        {d?.trackingCode ? (
          <View
            style={{
              marginTop: space.xs,
              padding: space.sm,
              backgroundColor: colors.paper,
              borderRadius: radius.small,
            }}
          >
            <AppText kind="small" color={colors.ink} selectable>
              Mã vận đơn: <AppText kind="bold">{d.trackingCode}</AppText>
            </AppText>
            <AppText
              kind="small"
              color={colors.muted}
              style={{ fontSize: 11, marginTop: 2 }}
            >
              Đơn vị vận chuyển: Giao Hàng Nhanh / Lật Lại Express
            </AppText>
            <View style={{ marginTop: space.sm }}>
              <Button
                wine
                secondary
                title={
                  !demoEnabled && driverSimulatorEnabled() && order.state === "InTransit"
                    ? "Mở Driver Simulator · Demo"
                    : "Theo dõi vận đơn"
                }
                onPress={() => router.push(auctionDriverHref(d.trackingCode!))}
              />
            </View>
          </View>
        ) : (
          <AppText
            kind="small"
            color={colors.muted}
            style={{ marginTop: space.xs }}
          >
            Nhân viên {order.pointName} sẽ đóng gói và bàn giao sách cho hãng vận
            chuyển.
          </AppText>
        )}
      </View>

      {/* 2. Tiến trình vận chuyển (Timeline) */}
      <View
        style={{
          gap: space.sm,
          padding: space.lg,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.rule,
          backgroundColor: colors.surface,
        }}
      >
        <AppText kind="bold">Tiến trình vận chuyển</AppText>

        {/* Step 1: Đã nhận từ điểm */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: space.sm,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: step1Done ? colors.success : colors.rule,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name={step1Done ? "check" : "pin"}
                size={13}
                color={colors.surface}
              />
            </View>
            <View
              style={{
                width: 2,
                height: 28,
                backgroundColor: step1Done ? colors.success : colors.rule,
              }}
            />
          </View>
          <View style={{ flex: 1, paddingBottom: 8 }}>
            <AppText
              kind="bold"
              color={step1Done ? colors.ink : colors.muted}
              style={{ fontSize: 13 }}
            >
              1. Đã tiếp nhận từ điểm {order.pointName}
            </AppText>
            <AppText kind="small" color={colors.muted} style={{ fontSize: 11 }}>
              {d?.dispatchedAt
                ? `Bàn giao lúc ${time(d.dispatchedAt)}`
                : "Đang chuẩn bị đóng gói tại điểm"}
            </AppText>
          </View>
        </View>

        {/* Step 2: Bưu tá đi giao */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: space.sm,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: step2Done
                  ? colors.success
                  : step1Done
                    ? stitchTokens.wine
                    : colors.rule,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="truck" size={13} color={colors.surface} />
            </View>
            <View
              style={{
                width: 2,
                height: 28,
                backgroundColor: step2Done ? colors.success : colors.rule,
              }}
            />
          </View>
          <View style={{ flex: 1, paddingBottom: 8 }}>
            <AppText
              kind="bold"
              color={step1Done ? colors.ink : colors.muted}
              style={{ fontSize: 13 }}
            >
              2. Vận chuyển đến người nhận
            </AppText>
            <AppText kind="small" color={colors.muted} style={{ fontSize: 11 }}>
              {step2Done
                ? `Bưu tá đang đi giao từ ${time(d?.demoOutForDeliveryAt ?? null)}`
                : step1Done
                  ? `Dự kiến giao trước ${time(d?.deliveryDeadline ?? null)}`
                  : "Chờ xuất phát"}
            </AppText>
          </View>
        </View>

        {/* Step 3: Giao thành công */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: space.sm,
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: step3Done ? colors.success : colors.rule,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="check" size={13} color={colors.surface} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText
              kind="bold"
              color={step3Done ? colors.success : colors.muted}
              style={{ fontSize: 13 }}
            >
              3. Giao sách thành công
            </AppText>
            <AppText kind="small" color={colors.muted} style={{ fontSize: 11 }}>
              {step3Done
                ? `Đã giao lúc ${time(d?.deliveredAt ?? null)}`
                : "Chờ nhận hàng và kiểm tra trong 72 giờ"}
            </AppText>
          </View>
        </View>
      </View>

      {/* 3. KHÚC GIẢ LẬP GIAO HÀNG (Sử dụng chung API /demo với Web) */}
      {demoEnabled && order.state === "InTransit" && !step3Done && (
        <View
          style={{
            gap: space.sm,
            padding: space.md,
            borderRadius: 14,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: stitchTokens.peachBorder,
            backgroundColor: stitchTokens.parchment,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <AppText
              kind="bold"
              color={stitchTokens.wineDark}
              style={{ fontSize: 13 }}
            >
              Mô phỏng bưu tá giao hàng · Demo
            </AppText>
            <View
              style={{
                backgroundColor: stitchTokens.wineDark,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 6,
              }}
            >
              <AppText
                kind="small"
                color={stitchTokens.gold}
                style={{ fontSize: 10, fontWeight: "800", includeFontPadding: false }}
              >
                DEMO
              </AppText>
            </View>
          </View>
          <AppText
            kind="small"
            color={colors.muted}
            style={{ fontSize: 12, lineHeight: 17 }}
          >
            Thao tác mô phỏng bưu tá giao sách để kiểm thử toàn bộ hành trình.
          </AppText>

          {simError && <Notice tone="error">{simError}</Notice>}

          {!step2Done ? (
            <Button
              wine
              title={simBusy ? "Đang xử lý…" : "Bưu tá bắt đầu đi giao · Demo"}
              busy={simBusy}
              disabled={simBusy || locked}
              onPress={handleDemoStart}
            />
          ) : (
            <Button
              wine
              title={
                simBusy
                  ? "Đang xử lý…"
                  : "Xác nhận đã giao hàng thành công · Demo"
              }
              busy={simBusy}
              disabled={simBusy || locked}
              onPress={handleDemoDeliver}
            />
          )}
        </View>
      )}
    </View>
  );
}

function Claim({
  order,
  locked,
  ask,
}: {
  order: PointOrder;
  locked: boolean;
  ask: Ask;
}) {
  const remaining = useRemaining(order.inspectionDeadline, order.serverTime);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  if (remaining === 0 && order.inspectionDeadline)
    return (
      <AppText kind="small" color={colors.muted}>
        Đã hết thời hạn kiểm tra sách.
      </AppText>
    );
  return (
    <View style={{ gap: space.md }}>
      <AppText kind="small" color={colors.muted}>
        Còn {formatRemaining(remaining)} để kiểm tra sách. Không có vấn đề thì
        bạn không cần làm gì thêm; đơn sẽ tự động hoàn tất.
      </AppText>
      <Button
        wine
        secondary
        title="Báo sách khác biên bản"
        disabled={locked}
        onPress={() => setOpen(true)}
      />
      <Sheet
        title="Báo sách khác biên bản"
        visible={open}
        dismissible={!locked}
        onClose={() => !locked && setOpen(false)}
        footer={
          <View style={{ gap: space.sm }}>
            <Button
              wine
              title="Gửi báo cáo vấn đề"
              disabled={locked}
              onPress={() => {
                const n = length(text);
                if (n < CLAIM_MIN_LENGTH || n > 5000) setInvalid(true);
                else {
                  setOpen(false);
                  ask(
                    "claim",
                    "Gửi báo cáo vấn đề?",
                    "Quản trị viên sẽ xem xét và có thể yêu cầu bạn mang sách trả về điểm để đối chiếu. Tiền vẫn được giữ cho đơn trong thời gian xem xét.",
                    "Gửi báo cáo",
                    text.trim(),
                  );
                }
              }}
            />
            <Button
              wine
              secondary
              title="Đóng"
              disabled={locked}
              onPress={() => setOpen(false)}
            />
          </View>
        }
      >
        <TextField
          label="Sách khác biên bản ở điểm nào?"
          multiline
          value={text}
          editable={!locked}
          maxLength={5000}
          onChangeText={(value) => {
            setText(value);
            setInvalid(false);
          }}
          hint={`Ít nhất ${CLAIM_MIN_LENGTH} ký tự: trang, vết hỏng hoặc điểm khác so với biên bản. Giữ nguyên sách để đối chiếu.`}
          error={
            invalid
              ? `Mô tả vấn đề từ ${CLAIM_MIN_LENGTH} đến 5.000 ký tự.`
              : undefined
          }
        />
      </Sheet>
    </View>
  );
}
