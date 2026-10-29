import { useEffect, useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Button,
  Chip,
  ConfirmDialog,
  Notice,
  StatePanel,
  TextField,
  colors,
  formatVnd,
  presentError,
  radius,
  space,
} from "../../core/ui";
import {
  CLAIM_MIN_LENGTH,
  POINT_HOURS,
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
import { addressBook } from "../addresses/contracts";
import { deliveryQuote, type CodeIssued, type PointOrder } from "./contracts";

// The winner's steps for a point Order (FR-AU08, FR-H09/H11, FR-T03): pay from
// the wallet (pickup, or delivery from the point per ADR 0044), answer the
// point's report, request the collection code at the desk or follow the
// delivery, then report a problem within the inspection window. The server
// decides every deadline and fee; times here are a display only.

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
    : "—";
const length = (value: string) => [...value.trim()].length;

function useRemaining(deadline: string | null, serverTime: string | undefined) {
  const [ms, setMs] = useState(() =>
    deadline && serverTime ? Math.max(0, Date.parse(deadline) - Date.parse(serverTime)) : 0,
  );
  useEffect(() => {
    if (!deadline || !serverTime) return;
    const offset = Date.parse(serverTime) - Date.now();
    const tick = () => setMs(Math.max(0, Date.parse(deadline) - (Date.now() + offset)));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [deadline, serverTime]);
  return ms;
}

export function WinnerSteps({ orderId, boughtNow, paused = false }: { orderId: string; boughtNow: boolean; paused?: boolean }) {
  const { client } = useSession();
  const foreground = useForeground();
  const queryClient = useQueryClient();
  const order = useQuery({
    ...pointOrderOptions(client, orderId),
    enabled: foreground,
    retry: false,
    staleTime: 0,
    // Staff hand the book over at the desk; pick that up while the screen is open.
    refetchInterval: foreground ? 15_000 : false,
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
  const [issued, setIssued] = useState<{ code: string | null; expiresAt: string | null; serverTime: string } | null>(null);
  const headline = boughtNow ? "Bạn đã mua ngay cuốn sách này" : "Bạn đã thắng phiên đấu giá";

  const run = async (command: OrderCommand) => {
    setBusy(true);
    setError(null);
    try {
      const result = await sendOrderCommand(client, command);
      setPending(null);
      if (command.step === "collection-code") {
        const r = result as CodeIssued;
        setIssued({ code: r.code, expiresAt: r.receipt.codeExpiresAt, serverTime: r.receipt.serverTime });
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
  const ask = (step: OrderStep, title: string, message: string, label: string, text?: string, delivery?: DeliveryChoice) =>
    setConfirm({ step, title, message, label, text, delivery });

  if (order.isPending) return <StatePanel loading title="Đang tải đơn nhận sách" />;
  if (order.error)
    return (
      <View style={{ gap: space.sm }}>
        <Notice tone="error">{presentError(order.error).message}</Notice>
        <Button secondary title="Thử tải lại" busy={order.isFetching} onPress={() => void order.refetch()} />
      </View>
    );
  const o = order.data;
  const locked = busy || !!pending;
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.xs, padding: space.lg, borderRadius: radius.card, backgroundColor: o.state === "Cancelled" || o.state === "PaymentExpired" ? colors.warningSurface : colors.successSurface }}>
        <AppText kind="bold" color={o.state === "Cancelled" || o.state === "PaymentExpired" ? colors.warning : colors.success}>
          {o.state === "AwaitingPayment" ? headline : o.state === "Completed" ? "Đơn nhận sách đã hoàn tất" : o.state === "PaymentExpired" ? "Đã quá hạn thanh toán" : o.state === "Cancelled" ? "Đơn đã bị hủy" : `Đã thanh toán ${formatVnd(o.amounts.buyerTotal)}`}
        </AppText>
        <AppText kind="small" color={colors.ink}>
          {summary(o)}
        </AppText>
      </View>
      {error && <Notice tone="error">{error}</Notice>}
      {pending ? (
        <View style={{ gap: space.sm }}>
          <Button title="Thử lại thao tác vừa rồi" busy={busy} onPress={() => void run(pending)} />
          <Button secondary title="Cập nhật đơn" disabled={busy} onPress={() => void order.refetch()} />
        </View>
      ) : (
        <>
          {o.state === "AwaitingPayment" && (
            <Payment
              order={o}
              locked={locked}
              onPay={(delivery) =>
                delivery
                  ? ask(
                      "pay",
                      `Thanh toán ${formatVnd(o.amounts.bookPrice + delivery.fee)} từ ví?`,
                      `Gồm ${formatVnd(o.amounts.bookPrice)} tiền sách và ${formatVnd(delivery.fee)} phí giao. Số tiền được giữ cho đơn này đến khi bạn nhận sách. Đã chọn giao tận nơi thì không đổi sang tự nhận; không nhận thanh toán một phần.`,
                      "Thanh toán",
                      undefined,
                      delivery,
                    )
                  : ask("pay", `Thanh toán ${formatVnd(o.amounts.bookPrice)} từ ví?`, `Số tiền được giữ cho đơn này đến khi bạn nhận sách tại ${o.pointName}. Ví cần đủ số dư khả dụng; không nhận thanh toán một phần.`, "Thanh toán")
              }
            />
          )}
          {o.state === "Fulfilling" && <Report order={o} locked={locked} ask={ask} />}
          {(o.state === "InTransit" || (o.state === "ReadyForCollection" && o.fulfillmentMethod === "CarrierOutbound")) && (
            <DeliveryPanel order={o} />
          )}
          {o.state === "ReadyForCollection" && o.fulfillmentMethod === "SelfCollect" && (
            <Collection order={o} issued={issued} locked={locked} onRequest={() => ask("collection-code", "Lấy mã nhận sách?", `Mã có hiệu lực 10 phút và chỉ hiển thị một lần. Hãy lấy mã khi bạn đã ở ${o.pointName}.`, "Lấy mã")} />
          )}
          {o.state === "Inspection" && <Claim order={o} locked={locked} ask={ask} />}
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
          void run(createOrderCommand(o.id, confirm.step, o.version, Crypto.randomUUID(), confirm.text, confirm.delivery))
        }
      />
    </View>
  );
}

function summary(o: PointOrder) {
  const delivered = o.fulfillmentMethod === "CarrierOutbound";
  switch (o.state) {
    case "AwaitingPayment":
      return `Thanh toán từ ví trước ${time(o.paymentDeadline)}. Bạn chọn tự nhận tại ${o.pointName} hoặc giao tận nơi.`;
    case "Fulfilling":
      return `Sách đã đạt kiểm tra tại ${o.pointName}. Hãy xem biên bản và trả lời trước ${time(o.acceptanceDeadline)}.`;
    case "ReadyForCollection":
      return delivered
        ? `${o.pointName} sẽ giao sách cho hãng vận chuyển trước ${time(o.collectionDeadline)}.`
        : `Sách chờ bạn tại ${o.pointName} đến ${time(o.collectionDeadline)}, trong giờ ${POINT_HOURS}.`;
    case "InTransit":
      return `Sách đang được giao tới địa chỉ của bạn, chậm nhất ${time(o.delivery?.deliveryDeadline ?? null)}.`;
    case "Inspection":
      return delivered
        ? `Sách đã giao tới bạn lúc ${time(o.delivery?.deliveredAt ?? null)}. Nếu sách khác biên bản, hãy báo trước ${time(o.inspectionDeadline)}.`
        : `Bạn đã nhận sách. Nếu sách khác biên bản, hãy báo trước ${time(o.inspectionDeadline)}.`;
    case "ResolutionPending":
      return "Quản trị viên đang xem xét đơn này. Tiền vẫn được giữ cho đơn cho tới khi có quyết định.";
    case "ReturnPending":
      return delivered && !o.delivery?.deliveredAt
        ? `Giao hàng không thành công. Hãng đang trả sách về ${o.pointName}; tiền sách và phí giao được hoàn sau khi nhân viên đối chiếu sách.`
        : `Hãy mang sách trả về ${o.pointName} trước ${time(o.returnDeadline)}, trong giờ ${POINT_HOURS}. Tiền được hoàn sau khi nhân viên đối chiếu sách.`;
    case "Completed":
      return "Quy trình nhận sách đã hoàn tất. Cảm ơn bạn đã cho cuốn sách một chương mới.";
    case "PaymentExpired":
      return "Sách được trả lại người bán. Lượt không thanh toán đã được ghi nhận vào tài khoản.";
    case "Cancelled":
      return "Đơn nhận sách này không còn hiệu lực.";
  }
}

type Ask = (step: OrderStep, title: string, message: string, label: string, text?: string) => void;

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
  const router = useRouter();
  const remaining = useRemaining(order.paymentDeadline, order.serverTime);
  const [deliver, setDeliver] = useState(false);
  const [addressId, setAddressId] = useState<string | null>(null);
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () => client.request("/me/addresses", addressBook),
    enabled: deliver,
  });
  const items = (addresses.data?.items ?? []).filter((a) => a.serviceAreaCode === "HCM-DEMO-v1");
  const chosen = addressId ?? items.find((a) => a.isDefault)?.id ?? items[0]?.id ?? null;
  // ADR 0044: the server prices delivery; payment rechecks this fee.
  const quote = useQuery({
    queryKey: ["point-order-delivery-quote", order.id, chosen],
    queryFn: () => client.request(`/me/point-orders/${order.id}/delivery-quote?addressId=${chosen}`, deliveryQuote),
    enabled: deliver && !!chosen,
    staleTime: 0,
  });
  const total = deliver ? quote.data?.buyerTotal : order.amounts.bookPrice;
  return (
    <View style={{ gap: space.sm }}>
      <AppText kind="bold">Nhận sách bằng cách nào?</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Chip title="Tự nhận tại điểm" selected={!deliver} disabled={locked} onPress={() => setDeliver(false)} />
        <Chip title="Giao tận nơi" selected={deliver} disabled={locked} onPress={() => setDeliver(true)} />
      </View>
      {deliver &&
        (addresses.isPending ? (
          <StatePanel loading title="Đang tải địa chỉ" />
        ) : addresses.error ? (
          <Notice tone="error">{presentError(addresses.error).message}</Notice>
        ) : items.length === 0 ? (
          <View style={{ gap: space.sm }}>
            <Notice tone="warning">Bạn chưa có địa chỉ nhận trong khu vực được hỗ trợ.</Notice>
            <Button secondary title="Thêm địa chỉ" onPress={() => router.push("/addresses")} />
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {items.map((a) => (
                <Chip
                  key={a.id}
                  title={`${a.recipientName} · ${a.detail}`}
                  selected={a.id === chosen}
                  disabled={locked}
                  onPress={() => setAddressId(a.id)}
                />
              ))}
            </View>
            {quote.error ? (
              <Notice tone="error">{auctionErrorText(quote.error)}</Notice>
            ) : (
              <AppText kind="small" color={colors.ink}>
                {quote.data
                  ? `Phí giao ${formatVnd(quote.data.outboundFee)} (hãng vận chuyển mô phỏng). Sau khi bạn đồng ý biên bản, điểm giao sách cho hãng.`
                  : "Đang tính phí giao…"}
              </AppText>
            )}
          </View>
        ))}
      <AppText kind="small" color={colors.muted}>
        Còn {formatRemaining(remaining)} để thanh toán. Không nhận thanh toán một phần.
      </AppText>
      <Button
        wine
        title={total === undefined ? "Thanh toán" : `Thanh toán ${formatVnd(total)}`}
        disabled={locked || remaining === 0 || (deliver && !quote.data)}
        onPress={() =>
          deliver && quote.data
            ? onPay({ addressId: quote.data.addressId, addressVersion: quote.data.addressVersion, fee: quote.data.outboundFee })
            : onPay()
        }
      />
    </View>
  );
}

// ADR 0044: the point hands the book to the simulated carrier, which delivers
// to the buyer's address; inspection starts at delivery.
function DeliveryPanel({ order }: { order: PointOrder }) {
  const d = order.delivery;
  return (
    <View style={{ gap: space.xs, padding: space.lg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.surface }}>
      <AppText kind="bold">Giao tận nơi</AppText>
      {d && (
        <AppText kind="small" color={colors.ink}>
          {d.recipientName} · {d.phone} · {d.detail}
        </AppText>
      )}
      {d?.trackingCode ? (
        <AppText kind="small" color={colors.ink} selectable>
          Mã vận đơn {d.trackingCode} · đã giao cho hãng lúc {time(d.dispatchedAt)}
        </AppText>
      ) : (
        <AppText kind="small" color={colors.muted}>
          Nhân viên {order.pointName} sẽ đóng gói và giao sách cho hãng vận chuyển.
        </AppText>
      )}
    </View>
  );
}

function Report({ order, locked, ask }: { order: PointOrder; locked: boolean; ask: Ask }) {
  const remaining = useRemaining(order.acceptanceDeadline, order.serverTime);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: space.xs, padding: space.lg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.surface }}>
        <AppText kind="bold">Biên bản kiểm tra tại điểm</AppText>
        <AppText kind="small" color={colors.ink}>
          Đạt kiểm tra tình trạng lúc {time(order.report.inspectedAt)}. {order.report.scope}
        </AppText>
        {order.report.note && <AppText kind="small" color={colors.ink}>Ghi chú của nhân viên: {order.report.note}</AppText>}
        <AppText kind="small" color={colors.muted}>Còn {formatRemaining(remaining)} để trả lời.</AppText>
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
              ? `Sau khi đồng ý, ${order.pointName} giao sách cho hãng vận chuyển trong 72 giờ. Đồng ý biên bản không làm mất quyền báo vấn đề sau khi nhận sách.`
              : `Sau khi đồng ý, bạn có 72 giờ để lấy mã và nhận sách tại ${order.pointName} trong giờ ${POINT_HOURS}. Đồng ý biên bản không làm mất quyền báo vấn đề sau khi nhận sách.`,
            "Đồng ý",
          )
        }
      />
      {!rejecting ? (
        <Button secondary title="Từ chối biên bản" disabled={locked || remaining === 0} onPress={() => setRejecting(true)} />
      ) : (
        <View style={{ gap: space.sm }}>
          <TextField
            label="Lý do từ chối"
            multiline
            value={reason}
            editable={!locked}
            maxLength={1000}
            onChangeText={(text) => {
              setReason(text);
              setInvalid(false);
            }}
            hint="Nói rõ điểm biên bản khác mô tả (10–1.000 ký tự). Quản trị viên đọc lý do này."
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
              else ask("reject-report", "Từ chối biên bản?", `Sách sẽ không được giao. Quản trị viên xem lý do của bạn rồi quyết định hoàn tiền hoặc mở lại thời hạn nhận sách.\n\n“${reason.trim()}”`, "Từ chối biên bản", reason.trim());
            }}
          />
        </View>
      )}
    </View>
  );
}

function Collection({
  order,
  issued,
  locked,
  onRequest,
}: {
  order: PointOrder;
  issued: { code: string | null; expiresAt: string | null; serverTime: string } | null;
  locked: boolean;
  onRequest: () => void;
}) {
  const remaining = useRemaining(issued?.expiresAt ?? null, issued?.serverTime);
  const live = !!issued?.code && remaining > 0;
  return (
    <View style={{ gap: space.md }}>
      {live ? (
        <View accessibilityLiveRegion="polite" style={{ gap: space.xs, padding: space.lg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.surface }}>
          <AppText kind="bold">Mã nhận sách</AppText>
          <AppText kind="title" color={colors.ink} selectable style={{ letterSpacing: 8 }} accessibilityLabel={`Mã nhận sách ${issued!.code!.split("").join(" ")}`}>
            {issued!.code}
          </AppText>
          <AppText kind="small" color={colors.ink}>
            Đọc mã này cho nhân viên tại quầy. Mã hết hạn sau {formatRemaining(remaining)}; không gửi mã cho người khác.
          </AppText>
        </View>
      ) : (
        <AppText kind="small" color={colors.muted}>
          {issued
            ? issued.code === null
              ? "Mã đã được tạo nhưng không thể hiển thị lại. Hãy lấy mã mới khi đang ở quầy."
              : "Mã đã hết hạn. Hãy lấy mã mới khi đang ở quầy."
            : `Chỉ lấy mã khi bạn đã ở quầy, trong giờ ${POINT_HOURS}. Mã có hiệu lực 10 phút; lấy mã mới sẽ hủy mã cũ.`}
        </AppText>
      )}
      <Button wine={!live} secondary={live} title={issued ? "Lấy mã mới" : "Lấy mã nhận sách"} disabled={locked} onPress={onRequest} />
      <AppText kind="small" color={colors.muted}>
        Sách ở {order.pointName}.
      </AppText>
    </View>
  );
}

function Claim({ order, locked, ask }: { order: PointOrder; locked: boolean; ask: Ask }) {
  const remaining = useRemaining(order.inspectionDeadline, order.serverTime);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  if (remaining === 0 && order.inspectionDeadline)
    return <AppText kind="small" color={colors.muted}>Đã hết thời hạn kiểm tra sách.</AppText>;
  return (
    <View style={{ gap: space.md }}>
      <AppText kind="small" color={colors.muted}>
        Còn {formatRemaining(remaining)} để kiểm tra. Không có vấn đề thì bạn không cần làm gì thêm.
      </AppText>
      {!open ? (
        <Button secondary title="Báo sách khác biên bản" disabled={locked} onPress={() => setOpen(true)} />
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
            error={invalid ? `Mô tả vấn đề từ ${CLAIM_MIN_LENGTH} đến 5.000 ký tự.` : undefined}
          />
          <Button
            secondary
            title="Gửi báo cáo vấn đề"
            disabled={locked}
            onPress={() => {
              const n = length(text);
              if (n < CLAIM_MIN_LENGTH || n > 5000) setInvalid(true);
              else ask("claim", "Gửi báo cáo vấn đề?", "Quản trị viên sẽ xem xét và có thể yêu cầu bạn mang sách trả về điểm để đối chiếu. Tiền vẫn được giữ cho đơn trong thời gian xem xét.", "Gửi báo cáo", text.trim());
            }}
          />
        </View>
      )}
    </View>
  );
}
