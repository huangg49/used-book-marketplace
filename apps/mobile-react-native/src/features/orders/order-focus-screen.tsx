import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  orderResponseStateSchema,
  pendingOrderResponse,
  sendOrderResponse,
} from "@used-books/session-client";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  BackAction,
  Button,
  ConfirmDialog,
  Notice,
  Screen,
  StatePanel,
  formatVnd,
  presentError,
  space,
} from "../../core/ui";
import { orderDetailsSchema, ORDER_STATE_CONFIG } from "./contracts";
import { BuyNowModal } from "./buy-now-modal";
import { MemberNavigation } from "../navigation/member-navigation";

const details = orderDetailsSchema
  .extend(orderResponseStateSchema.shape)
  .extend({
    canCancel: z.boolean(),
    moneyHeld: z.number().int(),
    item: z.object({
      metadata: z.object({ title: z.string() }),
      description: z.string(),
    }),
    preparation: z.object({ pickupDeadline: z.string() }).nullable(),
  });
type Action = "accept" | "reject" | "cancel";
const labels: Record<Action, string> = {
  accept: "Xác nhận bán",
  reject: "Từ chối đơn",
  cancel: "Hủy đơn chưa thanh toán",
};

export function OrderFocusScreen({
  id,
  ownerId,
}: {
  id: string;
  ownerId: string;
}) {
  const { client } = useSession(),
    cache = useQueryClient(),
    foreground = useForeground();
  const result = useQuery({
    queryKey: ["direct-order", ownerId, id],
    queryFn: () =>
      client.request(`/me/orders/${encodeURIComponent(id)}`, details),
    enabled: foreground,
    retry: false,
    staleTime: 0,
    refetchInterval: foreground ? 5000 : false,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState<Action | null>(null);
  const pending = pendingOrderResponse(client, id);
  const inaccessible =
    result.error instanceof ApiError &&
    [401, 403, 404].includes(result.error.status);
  const order = inaccessible ? undefined : result.data;
  async function changed() {
    await result.refetch();
    for (const key of ["work-inbox", "my-orders", "wallet", "public-listing"])
      void cache.invalidateQueries({ queryKey: [key] });
  }
  async function act(action: Action) {
    if (busy || !order) return;
    setBusy(true);
    setError("");
    try {
      await sendOrderResponse(client, id, action, order.version, () =>
        Crypto.randomUUID(),
      );
    } catch (e) {
      setError(presentError(e).message);
    } finally {
      setBusy(false);
      setConfirming(null);
      void changed();
    }
  }
  return (
    <Screen
      footer={<MemberNavigation current="/account" />}
      footerAppearance="navigation"
    >
      <BackAction
        title="Về danh sách đơn trực tiếp"
        onPress={() => router.replace("/orders")}
      />
      <View style={{ gap: space.md }}>
        <AppText kind="heading" accessibilityRole="header">
          Đơn #{id.slice(0, 8)}
        </AppText>
        {result.isPending && (
          <StatePanel loading title="Đang mở đúng đơn của bạn…" />
        )}
        {result.error && (
          <StatePanel
            title="Chưa cập nhật được đơn"
            message="Kiểm tra kết nối hoặc quyền hiện tại. Chưa thể kết luận đơn đã mất."
            action={{
              label: "Thử lại",
              busy: result.isFetching,
              onPress: () => void result.refetch(),
            }}
          />
        )}
        {order && (
          <>
            <AppText kind="bold">{order.item.metadata.title}</AppText>
            <AppText>
              {order.role === "Buyer" ? "Bạn là người mua" : "Bạn là người bán"}{" "}
              · {ORDER_STATE_CONFIG[order.state]?.label ?? order.state}
            </AppText>
            <AppText>{order.item.description}</AppText>
            <AppText>
              Giá sách: {formatVnd(order.amounts.bookPrice)} · Phí giao nhận:{" "}
              {formatVnd(order.amounts.shippingFee)}
            </AppText>
            <AppText>
              Tổng người mua thanh toán: {formatVnd(order.amounts.buyerTotal)}
            </AppText>
            <AppText>Tiền đang được giữ: {formatVnd(order.moneyHeld)}</AppText>
            {order.state === "AwaitingPayment" && (
              <AppText>
                Hạn thanh toán:{" "}
                {new Date(order.paymentDeadline).toLocaleString("vi-VN")}
              </AppText>
            )}
            {order.sellerConfirmationDeadline &&
              order.state === "PendingSellerConfirmation" && (
                <AppText>
                  Hạn người bán trả lời:{" "}
                  {new Date(order.sellerConfirmationDeadline).toLocaleString(
                    "vi-VN",
                  )}
                </AppText>
              )}
            {order.preparation && (
              <Notice>
                Đơn đang ở bước chuẩn bị sách. Hạn bàn giao:{" "}
                {new Date(order.preparation.pickupDeadline).toLocaleString(
                  "vi-VN",
                )}
                . Người bán chuẩn bị sách theo thời hạn. Mở lại đơn để theo dõi
                cập nhật.
              </Notice>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            {pending ? (
              <>
                <Notice tone="warning">
                  Chưa xác minh xong quyết định trước. Thử lại giữ nguyên yêu
                  cầu để tránh ghi trùng.
                </Notice>
                <Button
                  wine
                  busy={busy}
                  title={`Thử lại: ${labels[pending]}`}
                  onPress={() => void act(pending)}
                />
              </>
            ) : (
              !result.error && (
                <>
                  {order.paymentEnabled && (
                    <Button
                      wine
                      title="Tiếp tục thanh toán"
                      onPress={() => setPaying(true)}
                    />
                  )}
                  {order.sellerAcceptanceEnabled && (
                    <Button
                      wine
                      busy={busy}
                      title={labels.accept}
                      onPress={() => setConfirming("accept")}
                    />
                  )}
                  {order.canReject && (
                    <Button
                      wine
                      secondary
                      busy={busy}
                      title={labels.reject}
                      onPress={() => setConfirming("reject")}
                    />
                  )}
                  {order.canCancel && (
                    <Button
                      wine
                      secondary
                      busy={busy}
                      title={labels.cancel}
                      onPress={() => setConfirming("cancel")}
                    />
                  )}
                </>
              )
            )}
            {order.state === "Completed" && (
              <Button
                wine
                title="Xem hoặc viết đánh giá"
                onPress={() =>
                  router.push({
                    pathname: "/reviews",
                    params: { type: "DirectOrder", id },
                  })
                }
              />
            )}
            <Button
              wine
              secondary
              busy={result.isFetching}
              title="Cập nhật đơn"
              onPress={() => void result.refetch()}
            />
          </>
        )}
      </View>
      <ConfirmDialog
        visible={!!confirming}
        title={confirming ? labels[confirming] + "?" : ""}
        message={
          confirming === "accept"
            ? "Bạn nhận chuẩn bị sách cho đơn đã được người mua thanh toán."
            : confirming === "reject"
              ? "Từ chối chuyển đơn sang xử lý hoàn tiền theo quy trình."
              : "Hủy giữ sách của đơn chưa thanh toán."
        }
        confirmLabel="Ghi quyết định"
        onConfirm={() => confirming && void act(confirming)}
        onCancel={() => !busy && setConfirming(null)}
      />
      {paying && order && (
        <BuyNowModal
          visible
          initialOrderId={id}
          initialBookTitle={order.item.metadata.title}
          onClose={() => {
            setPaying(false);
            void changed();
          }}
          onSuccess={() => {
            setPaying(false);
            void changed();
          }}
        />
      )}
    </Screen>
  );
}
