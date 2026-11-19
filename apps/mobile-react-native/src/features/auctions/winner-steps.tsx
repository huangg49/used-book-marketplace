import { ReviewEntry } from "../reviews/review-entry";
import { useEffect, useState } from "react";
import { View, TouchableOpacity } from "react-native";
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
  pointOrderOptions,
  sendOrderCommand,
  type DeliveryChoice,
  type OrderCommand,
  type OrderStep,
} from "./auctions-model";
import { DemoSkipButton } from "./components/demo-skip-button";
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
    const offset = Date.parse(serverTime) - Date.now();
    const tick = () =>
      setMs(Math.max(0, Date.parse(deadline) - (Date.now() + offset)));
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
        note: "Nếu sách khác biên bản, hãy báo trong thời gian kiểm tra (72h). Nếu mọi thứ ổn, hệ thống sẽ tự hoàn tất đơn khi hết hạn.",
        deadline: order.inspectionDeadline,
      };
    case "ResolutionPending":
      return {
        phase,
        tone: "issue" as const,
        actor: "Đang chờ quản trị viên",
        title: "Đơn đang được xem xét",
        note: "Hệ thống đã nhận yêu cầu và chuyển cho quản trị viên xử lý. Tiền vẫn được giữ an toàn.",
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
        note: "Bạn đã nhận sách thành công. Cảm ơn bạn đã cho cuốn sách một chương mới!",
        deadline: null,
      };
    case "Cancelled":
      return {
        phase,
        tone: "issue" as const,
        actor: "Đã hủy",
        title: "Đơn đã bị hủy",
        note: "Đơn này không còn hiệu lực. Tiền giữ đã được hoàn lại ví nếu có.",
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
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginVertical: space.xs,
        paddingHorizontal: space.xs,
      }}
    >
      {steps.map((st, i) => {
        const active = i === currentPhase;
        const done = i < currentPhase;
        return (
          <View
            key={st.label}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View style={{ alignItems: "center", flex: 1 }}>
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
                    style={{ fontSize: 13 }}
                  >
                    {i + 1}
                  </AppText>
                )}
              </View>
              <AppText
                kind="small"
                color={active ? stitchTokens.wine : done ? colors.ink : colors.muted}
                style={{
                  marginTop: 4,
                  fontWeight: active ? "700" : "500",
                  fontSize: 11,
                  textAlign: "center",
                }}
              >
                {st.label}
              </AppText>
            </View>
            {i < steps.length - 1 && (
              <View
                style={{
                  height: 2,
                  flex: 0.6,
                  backgroundColor:
                    i < currentPhase ? colors.success : colors.rule,
                  marginTop: -16,
                }}
              />
            )}
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
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: radius.small,
            backgroundColor: toneBorder,
          }}
        >
          <AppText
            kind="small"
            color={colors.surface}
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
  paused = false,
}: {
  orderId: string;
  boughtNow: boolean;
  paused?: boolean;
}) {
  const { client } = useSession();
  const foreground = useForeground();
  const queryClient = useQueryClient();
  const order = useQuery({
    ...pointOrderOptions(client, orderId),
    enabled: foreground,
    retry: false,
    staleTime: 0,
    // Staff hand the book over at the desk; pick that up while the screen is open.
    refetchInterval: foreground ? 12_000 : false,
  });
  const [pending, setPending] = useState<OrderCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    step: OrderStep;
    title: string;
    message: string;
    label: string;
    text?: string;
    delivery?: DeliveryChoice;
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
    delivery?: DeliveryChoice,
  ) => setConfirm({ step, title, message, label, text, delivery });

  if (order.isPending)
    return <StatePanel loading title="Đang tải đơn nhận sách" />;
  if (order.error)
    return (
      <View style={{ gap: space.sm }}>
        <Notice tone="error">{presentError(order.error).message}</Notice>
        <Button
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

      {error && <Notice tone="error">{error}</Notice>}

      {pending ? (
        <View style={{ gap: space.sm }}>
          <Button
            title="Thử lại thao tác vừa rồi"
            busy={busy}
            onPress={() => void run(pending)}
          />
          <Button
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
              locked={locked}
              onPay={(delivery) =>
                delivery
                  ? ask(
                      "pay",
                      `Thanh toán ${formatVnd(o.amounts.bookPrice + delivery.fee)} từ ví?`,
                      `Tiền sách ${formatVnd(o.amounts.bookPrice)}. Giao hàng miễn phí. Số tiền được giữ an toàn trong Quỹ bảo chứng cho đến khi bạn nhận và kiểm tra sách. Đã chọn giao tận nơi thì không đổi sang tự nhận; không nhận thanh toán một phần.`,
                      "Thanh toán",
                      undefined,
                      delivery,
                    )
                  : ask(
                      "pay",
                      `Thanh toán ${formatVnd(o.amounts.bookPrice)} từ ví?`,
                      `Số tiền được giữ an toàn cho đơn này đến khi bạn nhận sách tại ${o.pointName}. Ví cần đủ số dư khả dụng; không nhận thanh toán một phần.`,
                      "Thanh toán",
                    )
              }
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
        message={confirm?.message ?? ""}
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
      />
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
  locked,
  onPay,
}: {
  order: PointOrder;
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
    enabled: deliver && addingNew,
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

  const total = deliver ? quote.data?.buyerTotal : order.amounts.bookPrice;
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
      setAddressError("Vui lòng chọn quận/huyện trong khu vực phục vụ TP.HCM.");
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

        {/* 2 Card lựa chọn phương thức song song (Nổi 3D, nền đỏ khi chọn) */}
        <View style={{ flexDirection: "row", gap: space.sm, paddingVertical: 4 }}>
          {/* Option A: Tự nhận tại điểm */}
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={locked}
            onPress={() => {
              setDeliver(false);
              setAddingNew(false);
              setAddressError(null);
            }}
            style={{
              flex: 1,
              padding: space.sm + 4,
              borderRadius: 12,
              borderWidth: 1,
              borderBottomWidth: !deliver ? 3.5 : 1,
              borderColor: !deliver ? stitchTokens.wineDark : colors.rule,
              borderBottomColor: !deliver ? stitchTokens.wineDark : colors.rule,
              backgroundColor: !deliver ? stitchTokens.wine : colors.surface,
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              position: "relative",
              shadowColor: !deliver ? stitchTokens.wineDark : "transparent",
              shadowOffset: { width: 0, height: !deliver ? 4 : 0 },
              shadowOpacity: !deliver ? 0.35 : 0,
              shadowRadius: 5,
              elevation: !deliver ? 6 : 0,
              transform: [{ translateY: !deliver ? -2 : 0 }],
            }}
          >
            {!deliver && (
              <View
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: stitchTokens.black,
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.2,
                  shadowRadius: 1,
                  elevation: 2,
                }}
              >
                <Icon name="check" size={11} color={stitchTokens.wine} />
              </View>
            )}
            <Icon
              name="pin"
              size={20}
              color={!deliver ? colors.surface : colors.muted}
            />
            <AppText
              kind="bold"
              color={!deliver ? colors.surface : colors.ink}
              style={{ fontSize: 13, textAlign: "center" }}
            >
              Tự nhận tại điểm
            </AppText>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor: !deliver ? stitchTokens.whiteAlpha20 : colors.paper,
              }}
            >
              <AppText
                kind="small"
                color={!deliver ? colors.surface : colors.muted}
                style={{ fontSize: 10, fontWeight: "700" }}
              >
                Miễn phí · Tại quầy
              </AppText>
            </View>
          </TouchableOpacity>

          {/* Option B: Giao tận nơi */}
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={locked}
            onPress={() => setDeliver(true)}
            style={{
              flex: 1,
              padding: space.sm + 4,
              borderRadius: 12,
              borderWidth: 1,
              borderBottomWidth: deliver ? 3.5 : 1,
              borderColor: deliver ? stitchTokens.wineDark : colors.rule,
              borderBottomColor: deliver ? stitchTokens.wineDark : colors.rule,
              backgroundColor: deliver ? stitchTokens.wine : colors.surface,
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              position: "relative",
              shadowColor: deliver ? stitchTokens.wineDark : "transparent",
              shadowOffset: { width: 0, height: deliver ? 4 : 0 },
              shadowOpacity: deliver ? 0.35 : 0,
              shadowRadius: 5,
              elevation: deliver ? 6 : 0,
              transform: [{ translateY: deliver ? -2 : 0 }],
            }}
          >
            {deliver && (
              <View
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: stitchTokens.black,
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.2,
                  shadowRadius: 1,
                  elevation: 2,
                }}
              >
                <Icon name="check" size={11} color={stitchTokens.wine} />
              </View>
            )}
            <Icon
              name="truck"
              size={20}
              color={deliver ? colors.surface : colors.muted}
            />
            <AppText
              kind="bold"
              color={deliver ? colors.surface : colors.ink}
              style={{ fontSize: 13, textAlign: "center" }}
            >
              Giao tận nơi
            </AppText>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor: deliver ? stitchTokens.whiteAlpha20 : colors.paper,
              }}
            >
              <AppText
                kind="small"
                color={deliver ? colors.surface : colors.muted}
                style={{ fontSize: 10, fontWeight: "700" }}
              >
                {quote.data && quote.data.outboundFee > 0
                  ? `${formatVnd(quote.data.outboundFee)} · Lật Lại Express`
                  : quote.data
                    ? "Miễn phí · Lật Lại Express"
                    : "Lật Lại Express"}
              </AppText>
            </View>
          </TouchableOpacity>
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
                Hãng: Lật Lại Express (TP.HCM)
              </AppText>
            </View>

            {/* Danh sách địa chỉ đã lưu */}
            {addresses.isPending ? (
              <StatePanel loading title="Đang tải danh sách địa chỉ" />
            ) : addresses.error ? (
              <Notice tone="error">{presentError(addresses.error).message}</Notice>
            ) : items.length > 0 && !addingNew ? (
              <View style={{ gap: space.xs }}>
                {items.map((a) => {
                  const isSelected = a.id === chosen;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      activeOpacity={0.7}
                      disabled={locked}
                      onPress={() => setAddressId(a.id)}
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        padding: space.sm + 2,
                        borderRadius: radius.card,
                        borderWidth: isSelected ? 1.5 : 1,
                        borderColor: isSelected ? stitchTokens.wine : colors.rule,
                        backgroundColor: isSelected ? stitchTokens.wineAlpha05 : colors.paper,
                        gap: space.sm,
                      }}
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
                          {a.localityCode ? ` · ${a.localityCode}` : ""}
                        </AppText>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {/* Nút hoặc Form thêm địa chỉ mới */}
            {!addingNew ? (
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={locked}
                onPress={() => setAddingNew(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: space.sm + 2,
                  paddingHorizontal: space.md,
                  borderRadius: radius.card,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: stitchTokens.wine,
                  backgroundColor: stitchTokens.wineAlpha05,
                  gap: 6,
                  marginTop: 2,
                }}
              >
                <Icon name="plus" size={14} color={stitchTokens.wine} />
                <AppText kind="bold" color={stitchTokens.wine} style={{ fontSize: 13 }}>
                  Thêm địa chỉ giao nhận mới
                </AppText>
              </TouchableOpacity>
            ) : (
              <View
                style={{
                  gap: space.xs,
                  padding: space.sm + 4,
                  borderRadius: radius.card,
                  backgroundColor: colors.paper,
                  borderWidth: 1,
                  borderColor: colors.rule,
                }}
              >
                <AppText kind="bold" style={{ fontSize: 13 }}>
                  Thêm địa chỉ nhận sách mới
                </AppText>
                {addressError && <Notice tone="error">{addressError}</Notice>}

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

                <AppText kind="small" color={colors.muted} style={{ fontSize: 11, marginTop: 4 }}>
                  Chọn Quận/Huyện (TP.HCM):
                </AppText>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  {(areas.data?.localities ?? []).map((loc) => (
                    <Chip
                      key={loc.code}
                      title={loc.label}
                      selected={newLocality === loc.code}
                      disabled={addressBusy}
                      onPress={() => setNewLocality(loc.code)}
                    />
                  ))}
                </View>

                <TextField
                  label="Địa chỉ chi tiết"
                  value={newDetail}
                  onChangeText={setNewDetail}
                  placeholder="Số nhà, tên đường, phường..."
                  editable={!addressBusy}
                />

                <View style={{ flexDirection: "row", gap: space.sm, marginTop: 4 }}>
                  <Button
                    secondary
                    title="Hủy"
                    disabled={addressBusy}
                    onPress={() => setAddingNew(false)}
                  />
                  <Button
                    wine
                    title={addressBusy ? "Đang lưu…" : "Lưu & chọn địa chỉ"}
                    disabled={addressBusy}
                    onPress={handleSaveNewAddress}
                  />
                </View>
              </View>
            )}

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
                  borderRadius: radius.small,
                  backgroundColor: colors.successSurface,
                  borderWidth: 1,
                  borderColor: colors.success,
                  marginTop: space.xs,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: quote.data.outboundFee > 0 ? stitchTokens.wineAlpha08 : colors.success,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={quote.data.outboundFee > 0 ? "truck" : "check"} size={12} color={quote.data.outboundFee > 0 ? stitchTokens.wine : colors.surface} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText kind="bold" color={quote.data.outboundFee > 0 ? colors.ink : colors.success} style={{ fontSize: 12 }}>
                    {quote.data.outboundFee > 0
                      ? `Phí giao tận nơi: ${formatVnd(quote.data.outboundFee)}`
                      : "Miễn phí giao hàng (Hỗ trợ bạn đọc)"}
                  </AppText>
                  <AppText kind="small" color={colors.ink} style={{ fontSize: 11 }}>
                    Giao bởi Lật Lại Express tới địa chỉ đã chọn
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
              Thanh toán trực tiếp từ Số dư khả dụng trong Ví Lật Lại. Khoản tiền được giữ an toàn trong Quỹ bảo chứng cho đến khi bạn nhận và kiểm tra sách trong 72 giờ.
            </AppText>
          </View>
        </View>
      </View>

      {/* 3. Nút bấm Thanh toán */}
      <Button
        wine
        title={
          total === undefined
            ? "Thanh toán từ Ví Lật Lại"
            : `Thanh toán ${formatVnd(total)} từ Ví Lật Lại`
        }
        disabled={locked || remaining === 0 || (deliver && !quote.data)}
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
      {!rejecting ? (
        <Button
          secondary
          title="Từ chối biên bản"
          disabled={locked || remaining === 0}
          onPress={() => setRejecting(true)}
        />
      ) : (
        <View style={{ gap: space.sm }}>
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
          <Button
            secondary
            destructive
            title="Gửi lý do từ chối"
            disabled={locked}
            onPress={() => {
              const n = length(reason);
              if (n < 10 || n > 1000) setInvalid(true);
              else
                ask(
                  "reject-report",
                  "Từ chối biên bản?",
                  `Sách sẽ không được giao. Quản trị viên xem lý do của bạn rồi quyết định hoàn tiền hoặc mở lại thời hạn nhận sách.\n\n“${reason.trim()}”`,
                  "Từ chối biên bản",
                  reason.trim(),
                );
            }}
          />
        </View>
      )}
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
              ⚡ Chế độ Demo: Đã mở quyền lấy mã ngoài khung giờ 09:00–18:00 để kiểm thử toàn bộ hành trình.
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
        wine={!live}
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
            {d.localityCode ? ` · ${d.localityCode}` : ""}
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
              Hãng vận chuyển: Lật Lại Express (Mô phỏng)
            </AppText>
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
      {order.state === "InTransit" && !step3Done && (
        <View
          style={{
            gap: space.xs,
            padding: space.md,
            borderRadius: radius.card,
            borderWidth: 1.5,
            borderColor: stitchTokens.goldBorder,
            backgroundColor: stitchTokens.goldLight,
            marginBottom: space.xl,
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
                  backgroundColor: stitchTokens.wine,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: radius.small,
                }}
              >
                <AppText
                  kind="small"
                  color={colors.surface}
                  style={{ fontSize: 10, fontWeight: "700" }}
                >
                  SIMULATOR
                </AppText>
              </View>
            </View>
            <AppText
              kind="small"
              color={colors.ink}
              style={{ fontSize: 11, marginBottom: 4 }}
            >
              Thao tác mô phỏng bưu tá giao sách (sử dụng chung cơ chế với Web) để kiểm tra toàn bộ hành trình.
            </AppText>

            {simError && <Notice tone="error">{simError}</Notice>}

            {!step2Done ? (
              <Button
                wine
                title={simBusy ? "Đang xử lý…" : "Bưu tá bắt đầu đi giao · Demo"}
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
      {!open ? (
        <Button
          secondary
          title="Báo sách khác biên bản"
          disabled={locked}
          onPress={() => setOpen(true)}
        />
      ) : (
        <View style={{ gap: space.sm }}>
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
          <Button
            secondary
            title="Gửi báo cáo vấn đề"
            disabled={locked}
            onPress={() => {
              const n = length(text);
              if (n < CLAIM_MIN_LENGTH || n > 5000) setInvalid(true);
              else
                ask(
                  "claim",
                  "Gửi báo cáo vấn đề?",
                  "Quản trị viên sẽ xem xét và có thể yêu cầu bạn mang sách trả về điểm để đối chiếu. Tiền vẫn được giữ cho đơn trong thời gian xem xét.",
                  "Gửi báo cáo",
                  text.trim(),
                );
            }}
          />
        </View>
      )}
    </View>
  );
}
