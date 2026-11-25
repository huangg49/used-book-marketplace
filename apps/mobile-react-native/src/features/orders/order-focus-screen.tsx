import { ReviewEntry } from "../reviews/review-entry";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  buyerSaleFeeText,
  directSellerAmounts,
  orderResponseStateSchema,
  pendingOrderResponse,
  sendOrderResponse,
} from "@used-books/session-client";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { useTransactionLive } from "../../core/hooks/use-transaction-live";
import {
  AppText,
  Button,
  ConfirmDialog,
  Notice,
  StatePanel,
  WineHeader,
  colors,
  formatVnd,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { orderDetailsSchema, ORDER_STATE_CONFIG } from "./contracts";
import { BuyNowModal } from "./buy-now-modal";
import { bundleSchema } from "../bundles/book-bundle";
import { BundleManifest } from "../bundles/bundle-manifest";
import { OrderShipping } from "./order-shipping";
import { SaleFeeBreakdown } from "../../core/ui/sale-fee-breakdown";

const details = orderDetailsSchema
  .extend(orderResponseStateSchema.shape)
  .extend({
    canCancel: z.boolean(),
    canConfirmReceipt: z.boolean().optional().default(false),
    moneyHeld: z.number().int(),
    refundedAmount: z.number().int().nonnegative().optional(),
    inspectionDeadline: z.iso.datetime().nullish(),
    item: z.object({
      bundle: bundleSchema.nullable().optional(),
      metadata: z.object({ title: z.string() }),
      description: z.string(),
    }),
    preparation: z.object({ pickupDeadline: z.iso.datetime() }).nullable(),
    serverTime: z.iso.datetime(),
    shipmentRegistrationEnabled: z.boolean(),
    shippingAddress: z
      .object({
        recipientName: z.string(),
        phone: z.string(),
        localityCode: z.string(),
        detail: z.string(),
      })
      .nullable(),
  });

type Action = "accept" | "reject" | "cancel" | "pay" | "confirm-receipt";

const labels: Record<Action, string> = {
  accept: "Xác nhận bán",
  reject: "Từ chối đơn",
  cancel: "Hủy đơn chưa thanh toán",
  pay: "Thanh toán đơn",
  "confirm-receipt": "Xác nhận đã nhận sách",
};

export function OrderFocusScreen({
  id,
  ownerId,
}: {
  id: string;
  ownerId: string;
}) {
  const { client } = useSession();
  const cache = useQueryClient();
  const foreground = useForeground();
  const insets = useSafeAreaInsets();
  const orderKey = ["direct-order", ownerId, id] as const;
  const live = useTransactionLive("order", id, foreground, () => {
    for (const queryKey of [orderKey, ["order-shipment", ownerId, id], ["order-packaging", ownerId, id], ["my-orders", ownerId], ["work-inbox"]]) {
      void cache.invalidateQueries({ queryKey });
    }
  });

  const result = useQuery({
    queryKey: orderKey,
    queryFn: () =>
      client.request(`/me/orders/${encodeURIComponent(id)}`, details),
    enabled: foreground,
    retry: false,
    staleTime: 0,
    refetchInterval: foreground ? (live ? 30_000 : 5_000) : false,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState<Action | null>(null);

  const pending = pendingOrderResponse(client, id);
  const inaccessible =
    result.error instanceof ApiError &&
    [401, 403, 404].includes(result.error.status);
  const order = inaccessible ? undefined : result.data;
  const sellerAmounts = order?.role === "Seller" ? directSellerAmounts(order.amounts) : null;
  const closedWithoutSale = order?.state === "Cancelled" || order?.state === "PaymentExpired";
  const buyerRefund = order?.role === "Buyer" ? order.refundedAmount ?? 0 : 0;

  async function changed() {
    await result.refetch();
    for (const key of ["work-inbox", "my-orders", "wallet", "public-listing"]) {
      void cache.invalidateQueries({ queryKey: [key] });
    }
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

  const stateConfig = order
    ? (ORDER_STATE_CONFIG[order.state] ?? {
        label: order.state,
        tone: "neutral",
      })
    : null;

  return (
    <View style={styles.screenRoot}>
      <WineHeader
        title={`Đơn #${id.slice(0, 8).toUpperCase()}`}
        subtitle={stateConfig?.label ?? "Chi tiết đơn hàng trực tiếp"}
        onBack={() => router.replace("/orders")}
        rightIcon="sync"
        rightLabel="Cập nhật đơn"
        onRightPress={() => void result.refetch()}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={result.isRefetching}
            onRefresh={() => void result.refetch()}
            tintColor={stitchTokens.wineDark}
          />
        }
      >
        {result.isPending && (
          <View style={styles.centerWrap}>
            <StatePanel wine loading title="Đang mở đúng đơn của bạn…" />
          </View>
        )}

        {result.error && (
          <StatePanel
            wine
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
            {/* 1. Book & Order Identity Card */}
            <View style={styles.card}>
              <View style={styles.badgesRow}>
                <View style={styles.rolePill}>
                  <AppText style={styles.rolePillText}>
                    {order.role === "Buyer"
                      ? "Bạn là người mua"
                      : "Bạn là người bán"}
                  </AppText>
                </View>
                <View style={styles.statePill}>
                  <AppText style={styles.statePillText}>
                    {stateConfig?.label ?? order.state}
                  </AppText>
                </View>
              </View>

              <AppText style={styles.bookTitle}>
                {order.item.bundle?.title || order.item.metadata.title}
              </AppText>

              <BundleManifest bundle={order.item.bundle} />

              {Boolean(order.item.description) && (
                <AppText style={styles.descriptionText}>
                  {order.item.description}
                </AppText>
              )}

              {order.state === "AwaitingPayment" && (
                <View style={styles.deadlineBox}>
                  <AppText style={styles.deadlineText}>
                    Hạn thanh toán:{" "}
                    {new Date(order.paymentDeadline).toLocaleString("vi-VN")}
                  </AppText>
                </View>
              )}

              {order.sellerConfirmationDeadline &&
                order.state === "PendingSellerConfirmation" && (
                  <View style={styles.deadlineBox}>
                    <AppText style={styles.deadlineText}>
                      Hạn người bán trả lời:{" "}
                      {new Date(
                        order.sellerConfirmationDeadline,
                      ).toLocaleString("vi-VN")}
                    </AppText>
                  </View>
                )}
            </View>

            {/* 2. Payment & Escrow Breakdown Card */}
            <View style={styles.card}>
              <AppText style={styles.cardHeading}>
                Thanh toán & Ký quỹ
              </AppText>
              <View style={styles.kvRow}>
                <AppText style={styles.kvLabel}>Giá sách</AppText>
                <AppText style={styles.kvValue}>
                  {formatVnd(order.amounts.bookPrice)}
                </AppText>
              </View>
              <View style={styles.kvRow}>
                <AppText style={styles.kvLabel}>Phí giao nhận</AppText>
                <AppText style={styles.kvValue}>
                  {order.amounts.shippingFee > 0 ? formatVnd(order.amounts.shippingFee) : "Miễn phí"}
                </AppText>
              </View>
              <View style={[styles.kvRow, styles.kvTotalRow]}>
                <AppText style={styles.kvTotalLabel}>
                  Tổng người mua thanh toán
                </AppText>
                <AppText style={styles.kvTotalValue}>
                  {formatVnd(order.amounts.buyerTotal)}
                </AppText>
              </View>
              {order.moneyHeld > 0 && <View style={styles.kvRow}>
                <AppText style={styles.kvLabel}>Tiền đang giữ</AppText>
                <AppText style={styles.kvHeldValue}>
                  {formatVnd(order.moneyHeld)}
                </AppText>
              </View>}
              {closedWithoutSale ? (
                <AppText kind="small" color={colors.muted}>Đơn đã đóng. Không thu phí dịch vụ.</AppText>
              ) : order.role === "Buyer" ? (
                <AppText kind="small" color={colors.muted}>{buyerSaleFeeText(order.amounts.commissionBps)}</AppText>
              ) : sellerAmounts ? (
                <SaleFeeBreakdown amounts={sellerAmounts} settled={order.state === "Completed"} />
              ) : null}
              {order.state === "Completed" && order.role === "Buyer" && (
                <AppText kind="small" color={colors.muted}>Đã chuyển tiền bán vào Ví người bán.</AppText>
              )}
              {order.state === "SettlementPending" && (
                <AppText kind="small" color={colors.muted}>Đang xử lý hoàn tiền về Ví người mua.</AppText>
              )}
              {order.state === "ResolutionPending" && order.moneyHeld > 0 && (
                <AppText kind="small" color={colors.muted}>Tiền được giữ trong lúc xử lý sự cố. Chưa có ngày hoàn tiền.</AppText>
              )}
              {order.state === "Inspection" && order.inspectionDeadline && (
                <AppText kind="small" color={colors.muted}>
                  Hạn kiểm tra sách {new Date(order.inspectionDeadline).toLocaleString("vi-VN")}. Theo dõi kết quả xử lý tại đơn này.
                </AppText>
              )}
              {buyerRefund > 0 && (
                <>
                  <AppText kind="small" color={colors.muted}>Đã hoàn {formatVnd(buyerRefund)} về Ví.</AppText>
                  <Button secondary title="Xem lịch sử giao dịch Ví" onPress={() => router.push({ pathname: "/wallet", params: { section: "history" } })} />
                </>
              )}
              {order.role === "Seller" && order.state === "Completed" && (
                <Button secondary title="Đối chiếu tiền bán trong ví" onPress={() => router.push({ pathname: "/wallet", params: { sale: order.id } })} />
              )}
            </View>

            {/* 3. Preparation & Shipping */}
            {order.state === "Preparing" && order.preparation && (
              <Notice>
                {order.role === "Seller"
                  ? "Bạn cần chuẩn bị sách. "
                  : "Người bán đang chuẩn bị sách. "}
                Hạn bàn giao:{" "}
                {new Date(order.preparation.pickupDeadline).toLocaleString(
                  "vi-VN",
                )}
                .{" "}
                {order.role === "Seller"
                  ? "Chọn ảnh đóng gói bên dưới, rồi đăng ký mã vận đơn mô phỏng. Sau đó chờ xác nhận bàn giao vận chuyển."
                  : "Tiền đang được giữ trong giao dịch. Theo dõi cập nhật tại đơn này; chưa cần xác nhận đã nhận sách."}
              </Notice>
            )}

            {order.preparation && (
              <View style={styles.card}>
                <OrderShipping
                  key={`${ownerId}:${id}`}
                  order={order}
                  ownerId={ownerId}
                  foreground={foreground}
                  readFailed={!!result.error}
                  readAt={result.dataUpdatedAt}
                  onChange={changed}
                />
              </View>
            )}

            {Boolean(error) && <Notice tone="error">{error}</Notice>}

            {/* 4. Order Actions */}
            <View style={styles.actionStack}>
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

              {order.canConfirmReceipt && (
                <Button
                  wine
                  title="Tôi đã nhận được sách"
                  busy={busy}
                  onPress={() => setConfirming("confirm-receipt")}
                />
              )}
            </View>

            {["Inspection", "Completed"].includes(order.state) && (
              <ReviewEntry
                type="DirectOrder"
                id={id}
                version={order.version}
              />
            )}
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!confirming}
        title={confirming ? labels[confirming] + "?" : ""}
        message={
          confirming === "confirm-receipt"
            ? "Xác nhận bạn đã nhận sách. Mở 72 giờ kiểm tra và đánh giá riêng tư; tiền vẫn giữ, không giải ngân."
            : confirming === "accept"
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
          initialBookTitle={
            order.item.bundle?.title || order.item.metadata.title
          }
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
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: 12,
    flexGrow: 1,
  },
  centerWrap: {
    paddingVertical: space.section,
  },
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 16,
    gap: 10,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  rolePill: {
    backgroundColor: stitchTokens.roseParchment,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rolePillText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  statePill: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statePillText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  bookTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
    color: colors.ink,
  },
  descriptionText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
  deadlineBox: {
    backgroundColor: stitchTokens.amberBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.amberBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deadlineText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: stitchTokens.orangeDeep,
  },
  cardHeading: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  kvRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  kvLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  kvValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  kvTotalRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.warmBorder,
  },
  kvTotalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  kvTotalValue: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  kvHeldValue: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
  actionStack: {
    gap: 10,
  },
});
