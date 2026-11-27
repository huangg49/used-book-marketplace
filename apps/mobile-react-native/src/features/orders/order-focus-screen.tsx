import { ReviewEntry } from "../reviews/review-entry";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
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
  AppModal,
  AppText,
  Button,
  ConfirmDialog,
  Icon,
  Notice,
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
import { orderDetailsSchema, ORDER_STATE_CONFIG } from "./contracts";
import { BuyNowModal } from "./buy-now-modal";
import { bundleSchema } from "../bundles/book-bundle";
import { BundleManifest } from "../bundles/bundle-manifest";
import { OrderShipping } from "./order-shipping";
import {
  OrderProgressStepper,
  getCurrentOrderStep,
  hasOrderStepFacts,
  type OrderStepId,
} from "./order-progress-stepper";
import { SaleFeeBreakdown } from "../../core/ui/sale-fee-breakdown";

const deliveryJourneyActionSchema = z.enum([
  "Pickup",
  "OutForDelivery",
  "Deliver",
  "Acknowledge",
  "ReportNonReceipt",
  "ReportCondition",
  "SkipInspection",
]);
type DeliveryJourneyAction = z.infer<typeof deliveryJourneyActionSchema>;

const DELIVERY_JOURNEY_LABELS: Record<DeliveryJourneyAction, string> = {
  Pickup: "Mô phỏng: ĐVVC đã lấy hàng",
  OutForDelivery: "Mô phỏng: Đang giao hàng",
  Deliver: "Mô phỏng: Đã giao tới nơi",
  Acknowledge: "Xác nhận đã nhận sách",
  ReportNonReceipt: "Báo chưa nhận được sách",
  ReportCondition: "Báo sách không đúng mô tả",
  SkipInspection: "Mô phỏng: Hoàn tất nghiệm thu ngay",
};

const orderConversationReceiptSchema = z.object({
  entityId: z.string().uuid(),
});

const orderActionReceiptSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  state: z.string(),
});

const details = orderDetailsSchema
  .extend(orderResponseStateSchema.shape)
  .extend({
    canCancel: z.boolean(),
    canRequestRefund: z.boolean().optional().default(false),
    canConfirmReceipt: z.boolean().optional().default(false),
    canReportNonReceipt: z.boolean().optional().default(false),
    conversationId: z.string().uuid().nullish(),
    demoCompletionEnabled: z.boolean().optional().default(false),
    demoCompletionAt: z.iso.datetime().nullish(),
    deliveryJourney: z
      .object({
        trackingCode: z.string().nullable(),
        pickedUpAt: z.iso.datetime().nullable(),
        outForDeliveryAt: z.iso.datetime().nullable(),
        acknowledgedAt: z.iso.datetime().nullable(),
        issue: z
          .object({
            kind: z.enum(["ReportNonReceipt", "ReportCondition"]),
            openedAt: z.iso.datetime(),
            supportCaseId: z.string().uuid(),
          })
          .nullable(),
        actions: z.array(deliveryJourneyActionSchema),
      })
      .nullish(),
    moneyHeld: z.number().int(),
    refundedAmount: z.number().int().nonnegative().optional(),
    paidAt: z.iso.datetime().nullish(),
    deliveredAt: z.iso.datetime().nullish(),
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
  const [viewedHistoryStep, setViewedHistoryStep] =
    useState<OrderStepId | null>(null);
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState<
    Action | "cancel-paid" | "acknowledge" | "skip-inspection" | null
  >(null);
  const [reportModal, setReportModal] = useState<
    null | { kind: "non-receipt" | "ReportNonReceipt" | "ReportCondition" }
  >(null);
  const [reportText, setReportText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

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

  async function act(action: Action | "cancel-paid") {
    if (busy || !order) return;
    setBusy(true);
    setError("");
    try {
      if (action === "cancel-paid") {
        await client.request(
          `/orders/${encodeURIComponent(id)}/cancel-paid`,
          orderActionReceiptSchema,
          {
            method: "POST",
            headers: { "Idempotency-Key": Crypto.randomUUID() },
            body: JSON.stringify({ expectedVersion: order.version }),
          },
        );
      } else {
        await sendOrderResponse(client, id, action, order.version, () =>
          Crypto.randomUUID(),
        );
      }
      setConfirming(null);
    } catch (e) {
      setError(presentError(e).message);
    } finally {
      setBusy(false);
      void changed();
    }
  }

  async function openOrderChat() {
    if (chatBusy || !order) return;
    if (order.conversationId) {
      router.push({ pathname: "/conversation", params: { id: order.conversationId } });
      return;
    }
    setChatBusy(true);
    setError("");
    try {
      const receipt = await client.request(
        `/orders/${encodeURIComponent(id)}/conversation`,
        orderConversationReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": Crypto.randomUUID() },
          body: JSON.stringify({}),
        },
      );
      router.push({ pathname: "/conversation", params: { id: receipt.entityId } });
    } catch (e) {
      setError(presentError(e).message);
    } finally {
      setChatBusy(false);
    }
  }

  async function triggerDemoCompletion() {
    if (busy || !order) return;
    setBusy(true);
    setError("");
    try {
      await client.request(
        `/orders/${encodeURIComponent(id)}/demo-completion`,
        orderActionReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": Crypto.randomUUID() },
          body: JSON.stringify({ expectedVersion: order.version }),
        },
      );
    } catch (e) {
      setError(presentError(e).message);
    } finally {
      setBusy(false);
      void changed();
    }
  }

  async function advanceJourney(action: DeliveryJourneyAction, description?: string) {
    if (busy || !order) return;
    setBusy(true);
    setError("");
    try {
      await client.request(
        `/orders/${encodeURIComponent(id)}/delivery-journey`,
        orderActionReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": Crypto.randomUUID() },
          body: JSON.stringify({
            expectedVersion: order.version,
            action,
            ...(description ? { description } : {}),
          }),
        },
      );
      setReportModal(null);
      setReportText("");
      setConfirming(null);
    } catch (e) {
      setError(presentError(e).message);
    } finally {
      setBusy(false);
      void changed();
    }
  }

  async function submitNonReceipt() {
    if (busy || !order || !reportModal) return;
    const text = reportText.trim();
    const minLen = reportModal.kind === "non-receipt" ? 20 : 10;
    if (text.length < minLen) {
      setError(`Vui lòng mô tả chi tiết ít nhất ${minLen} ký tự.`);
      return;
    }
    if (reportModal.kind !== "non-receipt") {
      await advanceJourney(reportModal.kind, text);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await client.request(
        `/orders/${encodeURIComponent(id)}/non-receipt`,
        orderActionReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": Crypto.randomUUID() },
          body: JSON.stringify({
            expectedVersion: order.version,
            description: text,
          }),
        },
      );
      setReportModal(null);
      setReportText("");
      setConfirming(null);
    } catch (e) {
      setError(presentError(e).message);
    } finally {
      setBusy(false);
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
        backLabel="Về danh sách đơn trực tiếp"
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
            message="Không thể kết nối để tải trạng thái mới nhất của đơn hàng. Vui lòng thử lại."
            action={{
              label: "Thử lại",
              busy: result.isFetching,
              onPress: () => void result.refetch(),
            }}
          />
        )}

        {order && (() => {
          const liveStep = getCurrentOrderStep(order.state);
          const selectedStep: OrderStepId =
            viewedHistoryStep &&
            viewedHistoryStep !== liveStep &&
            hasOrderStepFacts(viewedHistoryStep, order)
              ? viewedHistoryStep
              : liveStep;
          const isViewingHistory = selectedStep !== liveStep;
          const journey = order.deliveryJourney;
          const deliveryMilestones = journey
            ? [
                {
                  label: "Đã đăng ký vận đơn",
                  detail: journey.trackingCode ?? null,
                  done: Boolean(journey.trackingCode),
                },
                {
                  label: "Đơn vị vận chuyển đã lấy kiện",
                  detail: journey.pickedUpAt
                    ? new Date(journey.pickedUpAt).toLocaleString("vi-VN")
                    : null,
                  done: Boolean(journey.pickedUpAt),
                },
                {
                  label: "Đang giao tới người mua",
                  detail: journey.outForDeliveryAt
                    ? new Date(journey.outForDeliveryAt).toLocaleString("vi-VN")
                    : null,
                  done: Boolean(journey.outForDeliveryAt),
                },
                {
                  label: "Giao hàng thành công",
                  detail: order.deliveredAt
                    ? new Date(order.deliveredAt).toLocaleString("vi-VN")
                    : null,
                  done: Boolean(order.deliveredAt),
                },
              ]
            : [];

          return (
            <>
              {/* 0. 5-Step Progress Card + Vertical History Bottom Sheet */}
              <OrderProgressStepper
                order={order}
                selectedStep={selectedStep}
                onSelectStep={(step) =>
                  setViewedHistoryStep(step === liveStep ? null : step)
                }
                bottomInset={Math.max(insets.bottom, 16)}
              />

              {isViewingHistory ? (
                <View style={styles.card}>
                  <AppText style={styles.cardHeading}>
                    {selectedStep === "proposal"
                      ? "Thông tin đơn đã chốt"
                      : selectedStep === "payment"
                        ? "Lịch sử thanh toán & ký quỹ"
                        : selectedStep === "handover"
                          ? "Lịch sử đóng gói & giao nhận"
                          : "Lịch sử kiểm tra sách 72 giờ"}
                  </AppText>
                  {selectedStep === "proposal" && (
                    <>
                      <View style={styles.kvRow}>
                        <AppText style={styles.kvLabel}>Sách giao dịch</AppText>
                        <AppText style={styles.kvValue} numberOfLines={2}>
                          {order.item.bundle?.title || order.item.metadata.title}
                        </AppText>
                      </View>
                      <View style={styles.kvRow}>
                        <AppText style={styles.kvLabel}>Vai trò của bạn</AppText>
                        <AppText style={styles.kvValue}>
                          {order.role === "Buyer" ? "Người mua" : "Người bán"}
                        </AppText>
                      </View>
                      <View style={styles.kvRow}>
                        <AppText style={styles.kvLabel}>Giá sách chốt</AppText>
                        <AppText style={styles.kvValue}>
                          {formatVnd(order.amounts.bookPrice)}
                        </AppText>
                      </View>
                    </>
                  )}
                  {selectedStep === "payment" && (
                    <>
                      <View style={styles.kvRow}>
                        <AppText style={styles.kvLabel}>Tổng thanh toán</AppText>
                        <AppText style={styles.kvTotalValue}>
                          {formatVnd(order.amounts.buyerTotal)}
                        </AppText>
                      </View>
                      <View style={styles.kvRow}>
                        <AppText style={styles.kvLabel}>Giá sách</AppText>
                        <AppText style={styles.kvValue}>
                          {formatVnd(order.amounts.bookPrice)}
                        </AppText>
                      </View>
                      <View style={styles.kvRow}>
                        <AppText style={styles.kvLabel}>Phí giao nhận</AppText>
                        <AppText style={styles.kvValue}>
                          {order.amounts.shippingFee > 0
                            ? formatVnd(order.amounts.shippingFee)
                            : "Miễn phí"}
                        </AppText>
                      </View>
                      <View style={styles.kvRow}>
                        <AppText style={styles.kvLabel}>Quỹ bảo chứng</AppText>
                        <AppText style={styles.kvHeldValue}>
                          {formatVnd(order.moneyHeld)}
                        </AppText>
                      </View>
                    </>
                  )}
                  {selectedStep === "handover" && (
                    <>
                      {journey?.trackingCode ? (
                        <View style={styles.kvRow}>
                          <AppText style={styles.kvLabel}>Mã vận đơn</AppText>
                          <AppText style={styles.kvValue}>
                            {journey.trackingCode}
                          </AppText>
                        </View>
                      ) : null}
                      {order.shippingAddress ? (
                        <View style={styles.addressSummaryBox}>
                          <AppText style={styles.addressLabelText}>
                            Địa chỉ nhận sách
                          </AppText>
                          <AppText style={styles.addressMainText}>
                            {order.shippingAddress.recipientName} ·{" "}
                            {order.shippingAddress.phone}
                          </AppText>
                          <AppText style={styles.addressDetailText}>
                            {order.shippingAddress.detail}
                          </AppText>
                        </View>
                      ) : null}
                      {journey?.pickedUpAt ? (
                        <View style={styles.kvRow}>
                          <AppText style={styles.kvLabel}>Đã lấy kiện</AppText>
                          <AppText style={styles.kvValue}>
                            {new Date(journey.pickedUpAt).toLocaleString("vi-VN")}
                          </AppText>
                        </View>
                      ) : null}
                      {order.deliveredAt ? (
                        <View style={styles.kvRow}>
                          <AppText style={styles.kvLabel}>Giao thành công</AppText>
                          <AppText style={styles.kvValue}>
                            {new Date(order.deliveredAt).toLocaleString("vi-VN")}
                          </AppText>
                        </View>
                      ) : null}
                    </>
                  )}
                  {selectedStep === "inspection" && (
                    <>
                      {order.deliveredAt ? (
                        <View style={styles.kvRow}>
                          <AppText style={styles.kvLabel}>Mốc giao hàng</AppText>
                          <AppText style={styles.kvValue}>
                            {new Date(order.deliveredAt).toLocaleString("vi-VN")}
                          </AppText>
                        </View>
                      ) : null}
                      {order.inspectionDeadline ? (
                        <View style={styles.kvRow}>
                          <AppText style={styles.kvLabel}>Hạn kiểm tra 72h</AppText>
                          <AppText style={styles.kvValue}>
                            {new Date(order.inspectionDeadline).toLocaleString("vi-VN")}
                          </AppText>
                        </View>
                      ) : null}
                      {journey?.acknowledgedAt ? (
                        <View style={styles.kvRow}>
                          <AppText style={styles.kvLabel}>Xác nhận nhận sách</AppText>
                          <AppText style={styles.kvValue}>
                            {new Date(journey.acknowledgedAt).toLocaleString("vi-VN")}
                          </AppText>
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              ) : (
                <>
                  {/* 1. Delivery Journey Timeline + Driver Simulator / Primary Journey Actions */}
                  {journey &&
                    (["Preparing", "InTransit", "Inspection"].includes(
                      order.state,
                    ) ||
                      Boolean(journey.issue)) && (
                      <View style={styles.journeyCard}>
                        <View style={styles.journeyHeaderRow}>
                          <View style={styles.journeyIconCircle}>
                            <Icon
                              name="truck"
                              size={16}
                              color={stitchTokens.wine}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <AppText style={styles.cardHeading}>
                              Hành trình giao nhận
                            </AppText>
                            {journey.trackingCode ? (
                              <AppText style={styles.trackingSubText}>
                                Mã vận đơn: {journey.trackingCode}
                              </AppText>
                            ) : (
                              <AppText style={styles.trackingSubText}>
                                Đang chờ người bán đăng ký mã vận đơn
                              </AppText>
                            )}
                          </View>
                        </View>

                        <View style={styles.milestoneList}>
                          {deliveryMilestones.map((m, idx) => {
                            const isLast = idx === deliveryMilestones.length - 1;
                            return (
                              <View key={m.label} style={styles.milestoneRow}>
                                <View style={styles.milestoneTrack}>
                                  <View
                                    style={[
                                      styles.milestoneDot,
                                      m.done && styles.milestoneDotDone,
                                    ]}
                                  >
                                    {m.done ? (
                                      <Icon
                                        name="check"
                                        size={10}
                                        color={stitchTokens.white}
                                      />
                                    ) : null}
                                  </View>
                                  {!isLast ? (
                                    <View
                                      style={[
                                        styles.milestoneLine,
                                        m.done && styles.milestoneLineDone,
                                      ]}
                                    />
                                  ) : null}
                                </View>
                                <View style={styles.milestoneBody}>
                                  <AppText
                                    style={[
                                      styles.milestoneLabel,
                                      m.done && styles.milestoneLabelDone,
                                    ]}
                                  >
                                    {m.label}
                                  </AppText>
                                  {m.detail ? (
                                    <AppText style={styles.milestoneDetail}>
                                      {m.detail}
                                    </AppText>
                                  ) : null}
                                </View>
                              </View>
                            );
                          })}
                        </View>

                        {(() => {
                          const driverActions = journey.actions.filter(
                            (a) =>
                              a === "Pickup" ||
                              a === "OutForDelivery" ||
                              a === "Deliver",
                          );
                          const memberActions = journey.actions.filter(
                            (a) =>
                              a !== "Pickup" &&
                              a !== "OutForDelivery" &&
                              a !== "Deliver" &&
                              a !== "ReportNonReceipt",
                          );
                          const hasDriverActions = driverActions.length > 0;
                          return (
                            <View style={styles.journeyActionsWrap}>
                              {journey.trackingCode &&
                                (hasDriverActions ||
                                  ["Preparing", "InTransit"].includes(
                                    order.state,
                                  )) && (
                                  <Button
                                    wine
                                    secondary={!hasDriverActions}
                                    title={
                                      hasDriverActions
                                        ? "Mở Driver Simulator · Demo"
                                        : "Theo dõi vận đơn"
                                    }
                                    onPress={() =>
                                      router.push({
                                        pathname: "/driver",
                                        params: {
                                          kind: "direct",
                                          trackingCode: journey.trackingCode!,
                                        },
                                      })
                                    }
                                  />
                                )}
                              {memberActions.map((action) => (
                                <Button
                                  key={action}
                                  wine
                                  secondary={action !== "Acknowledge"}
                                  busy={busy}
                                  title={DELIVERY_JOURNEY_LABELS[action]}
                                  onPress={() => {
                                    if (action === "ReportCondition") {
                                      setError("");
                                      setReportText("");
                                      setReportModal({ kind: action });
                                    } else if (action === "Acknowledge") {
                                      setError("");
                                      setConfirming("acknowledge");
                                    } else if (action === "SkipInspection") {
                                      setError("");
                                      setConfirming("skip-inspection");
                                    } else {
                                      void advanceJourney(action);
                                    }
                                  }}
                                />
                              ))}
                            </View>
                          );
                        })()}
                      </View>
                    )}

                  {/* 2. Seller Packaging & Shipment Registration Card (when Preparing / needed) */}
                  {order.preparation &&
                    (order.role === "Seller" || !journey?.trackingCode) && (
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

                  {/* 3. Book & Address Identity Card */}
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

                    <View style={styles.bookIdentityRow}>
                      <View style={styles.bookIconTile}>
                        <Icon name="book" size={22} color={stitchTokens.wine} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText style={styles.bookTitle}>
                          {order.item.bundle?.title || order.item.metadata.title}
                        </AppText>
                        <AppText style={styles.bookPriceTag}>
                          {formatVnd(order.amounts.bookPrice)}
                        </AppText>
                      </View>
                    </View>

                    <BundleManifest bundle={order.item.bundle} />

                    {Boolean(order.item.description) && (
                      <AppText style={styles.descriptionText}>
                        {order.item.description}
                      </AppText>
                    )}

                    {order.shippingAddress &&
                    !(
                      order.preparation &&
                      (order.role === "Seller" || !journey?.trackingCode)
                    ) ? (
                      <View style={styles.addressSummaryBox}>
                        <AppText style={styles.addressLabelText}>
                          Địa chỉ nhận sách
                        </AppText>
                        <AppText style={styles.addressMainText}>
                          {order.shippingAddress.recipientName} ·{" "}
                          {order.shippingAddress.phone}
                        </AppText>
                        <AppText style={styles.addressDetailText}>
                          {order.shippingAddress.detail}
                        </AppText>
                      </View>
                    ) : null}
                  </View>

                  {/* 4. Payment & Escrow Breakdown Card */}
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
                        {order.amounts.shippingFee > 0
                          ? formatVnd(order.amounts.shippingFee)
                          : "Miễn phí"}
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
                    {order.moneyHeld > 0 && (
                      <View style={styles.kvRow}>
                        <AppText style={styles.kvLabel}>Tiền đang giữ</AppText>
                        <AppText style={styles.kvHeldValue}>
                          {formatVnd(order.moneyHeld)}
                        </AppText>
                      </View>
                    )}
                    {closedWithoutSale ? (
                      <AppText kind="small" color={colors.muted}>
                        Đơn đã đóng. Không thu phí dịch vụ.
                      </AppText>
                    ) : order.role === "Buyer" ? (
                      <AppText kind="small" color={colors.muted}>
                        {buyerSaleFeeText(order.amounts.commissionBps)}
                      </AppText>
                    ) : sellerAmounts ? (
                      <SaleFeeBreakdown
                        amounts={sellerAmounts}
                        settled={order.state === "Completed"}
                      />
                    ) : null}
                    {order.state === "Completed" && order.role === "Buyer" && (
                      <AppText kind="small" color={colors.muted}>
                        Đã chuyển tiền bán vào Ví người bán.
                      </AppText>
                    )}
                    {order.state === "SettlementPending" && (
                      <AppText kind="small" color={colors.muted}>
                        Đang xử lý hoàn tiền về Ví người mua.
                      </AppText>
                    )}
                    {order.state === "ResolutionPending" &&
                      order.moneyHeld > 0 && (
                        <AppText kind="small" color={colors.muted}>
                          Tiền được giữ trong lúc xử lý sự cố. Chưa có ngày hoàn
                          tiền.
                        </AppText>
                      )}
                    {buyerRefund > 0 && (
                      <>
                        <AppText kind="small" color={colors.muted}>
                          Đã hoàn {formatVnd(buyerRefund)} về Ví.
                        </AppText>
                        <Button
                          wine
                          secondary
                          title="Xem lịch sử giao dịch Ví"
                          onPress={() =>
                            router.push({
                              pathname: "/wallet",
                              params: { section: "history" },
                            })
                          }
                        />
                      </>
                    )}
                    {order.role === "Seller" && order.state === "Completed" && (
                      <Button
                        wine
                        secondary
                        title="Đối chiếu tiền bán trong ví"
                        onPress={() =>
                          router.push({
                            pathname: "/wallet",
                            params: { sale: order.id },
                          })
                        }
                      />
                    )}
                  </View>

                  {/* 5. Order Actions */}
                  <View style={styles.actionStack}>
                    {pending ? (
                      <>
                        <Notice tone="warning">
                          Chưa xác minh xong quyết định trước. Thử lại giữ nguyên
                          yêu cầu để tránh ghi trùng.
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
                          {order.canRequestRefund && (
                            <Button
                              wine
                              secondary
                              busy={busy}
                              title="Hủy đơn & hoàn tiền"
                              onPress={() => setConfirming("cancel-paid")}
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

                    {order.demoCompletionEnabled && (
                      <Button
                        wine
                        secondary
                        busy={busy}
                        title="Mô phỏng hoàn tất giao hàng (Demo)"
                        onPress={() => void triggerDemoCompletion()}
                      />
                    )}
                    {order.demoCompletionAt && (
                      <Notice>
                        Đang tự động mô phỏng hoàn tất giao hàng lúc{" "}
                        {new Date(order.demoCompletionAt).toLocaleTimeString(
                          "vi-VN",
                        )}
                        .
                      </Notice>
                    )}

                    <Button
                      wine
                      secondary
                      busy={chatBusy}
                      title={
                        order.role === "Buyer"
                          ? "Nhắn tin với người bán"
                          : "Nhắn tin với người mua"
                      }
                      onPress={() => void openOrderChat()}
                    />
                    <Button
                      wine
                      secondary
                      title="Gửi hỗ trợ / khiếu nại đơn hàng"
                      onPress={() =>
                        router.push({
                          pathname: "/support",
                          params: { targetType: "DirectOrder", targetId: id },
                        })
                      }
                    />
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
            </>
          );
        })()}
      </ScrollView>

      <ConfirmDialog
        visible={!!confirming}
        title={
          confirming === "cancel-paid"
            ? "Hủy đơn & yêu cầu hoàn tiền?"
            : confirming === "skip-inspection"
              ? "Xác nhận hài lòng & hoàn tất đơn?"
              : confirming === "acknowledge" || confirming === "confirm-receipt"
                ? "Xác nhận bạn đã nhận sách?"
                : confirming === "accept"
                  ? "Xác nhận nhận đơn hàng?"
                  : confirming === "reject"
                    ? "Từ chối đơn hàng này?"
                    : confirming === "cancel"
                      ? "Hủy đơn hàng chưa thanh toán?"
                      : ""
        }
        message={
          confirming === "cancel-paid"
            ? `Người bán chưa xác nhận đơn${order ? ` #${id.slice(0, 8).toUpperCase()}` : ""}. Hủy đơn sẽ đóng giao dịch và hoàn lại ${order ? formatVnd(order.amounts.buyerTotal) : "toàn bộ số tiền đã thanh toán"} về Ví của bạn.`
            : confirming === "skip-inspection"
              ? `Bạn xác nhận sách đúng mô tả và kết thúc sớm 72 giờ kiểm tra? Khoản thanh toán (${order ? formatVnd(order.amounts.buyerTotal) : "đơn hàng"}) sẽ được giải ngân cho người bán và không thể mở báo cáo sự cố sau bước này.`
              : confirming === "acknowledge" || confirming === "confirm-receipt"
                ? `Xác nhận bạn đã cầm trên tay cuốn sách${order ? ` (${formatVnd(order.amounts.buyerTotal)})` : ""}. Hệ thống mở 72 giờ kiểm tra chất lượng sách; tiền vẫn được giữ an toàn cho đến khi hết hạn kiểm tra và không có khiếu nại.`
                : confirming === "accept"
                  ? `Bạn xác nhận nhận chuẩn bị đơn${order ? ` #${id.slice(0, 8).toUpperCase()} (${formatVnd(order.amounts.buyerTotal)})` : ""}. Sau khi nhận, bạn cần đóng gói và đăng ký gửi sách trong vòng 48 giờ và không thể tự hủy đơn.`
                  : confirming === "reject"
                    ? `Từ chối đơn${order ? ` #${id.slice(0, 8).toUpperCase()}` : ""} sẽ đóng vĩnh viễn giao dịch và hoàn lại 100% số tiền (${order ? formatVnd(order.amounts.buyerTotal) : "đã thanh toán"}) về Ví người mua.`
                    : `Hủy đơn${order ? ` #${id.slice(0, 8).toUpperCase()}` : ""} chưa thanh toán sẽ mở lại cuốn sách cho người mua khác.`
        }
        confirmLabel={
          confirming === "cancel-paid"
            ? "Hủy & hoàn tiền"
            : confirming === "skip-inspection"
              ? "Xác nhận hoàn tất"
              : confirming === "acknowledge" || confirming === "confirm-receipt"
                ? "Đã nhận sách"
                : confirming === "accept"
                  ? "Nhận đơn ngay"
                  : confirming === "reject"
                    ? "Từ chối đơn"
                    : "Hủy đơn hàng"
        }
        destructive={
          confirming === "cancel" ||
          confirming === "cancel-paid" ||
          confirming === "reject"
        }
        busy={busy}
        error={error || undefined}
        onConfirm={() => {
          if (!confirming) return;
          if (confirming === "acknowledge") {
            void advanceJourney("Acknowledge");
          } else if (confirming === "skip-inspection") {
            void advanceJourney("SkipInspection");
          } else {
            void act(confirming);
          }
        }}
        onCancel={() => !busy && setConfirming(null)}
      />

      <AppModal
        visible={!!reportModal}
        transparent
        animationType="slide"
        onRequestClose={() => !busy && setReportModal(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            flex: 1,
            backgroundColor: stitchTokens.modalScrim,
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng biểu mẫu báo sự cố"
            style={StyleSheet.absoluteFill}
            onPress={() => !busy && setReportModal(null)}
          />
          <View
            style={{
              backgroundColor: stitchTokens.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: space.lg,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 18),
              gap: space.md,
            }}
          >
            <View style={{ alignItems: "center", paddingBottom: 2 }}>
              <View
                style={{
                  width: 38,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: stitchTokens.cardBorder,
                }}
              />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <AppText style={[styles.cardHeading, { flex: 1 }]}>
                {reportModal?.kind === "ReportCondition"
                  ? "Báo sách không đúng mô tả"
                  : "Báo sự cố giao nhận"}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                disabled={busy}
                onPress={() => setReportModal(null)}
                hitSlop={8}
                style={({ pressed }) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: stitchTokens.pillWarmBg,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.72 : 1,
                })}
              >
                <Icon name="close" size={18} color={stitchTokens.wineDark} strokeWidth={2.2} />
              </Pressable>
            </View>
            {(() => {
              const minLen = reportModal?.kind === "non-receipt" ? 20 : 10;
              return (
                <TextField
                  label={`Mô tả sự việc (${reportText.trim().length}/${minLen}+ ký tự)`}
                  value={reportText}
                  onChangeText={setReportText}
                  placeholder={`Nêu rõ tình trạng sách hoặc vấn đề gặp phải (tối thiểu ${minLen} ký tự)...`}
                  multiline
                />
              );
            })()}
            {Boolean(error) && <Notice tone="error">{error}</Notice>}
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  wine
                  secondary
                  title="Hủy"
                  disabled={busy}
                  onPress={() => setReportModal(null)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  wine
                  title="Gửi báo cáo"
                  busy={busy}
                  onPress={() => void submitNonReceipt()}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </AppModal>

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
  journeyCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    padding: 16,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  journeyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  journeyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: stitchTokens.roseParchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  trackingSubText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.wine,
    marginTop: 1,
  },
  milestoneList: {
    gap: 0,
  },
  milestoneRow: {
    flexDirection: "row",
    gap: 10,
  },
  milestoneTrack: {
    width: 18,
    alignItems: "center",
  },
  milestoneDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: stitchTokens.creamParchment,
    borderWidth: 1.5,
    borderColor: stitchTokens.borderWarm,
    alignItems: "center",
    justifyContent: "center",
  },
  milestoneDotDone: {
    backgroundColor: stitchTokens.likeNewGreen,
    borderColor: stitchTokens.likeNewGreen,
  },
  milestoneLine: {
    width: 2,
    flex: 1,
    minHeight: 14,
    backgroundColor: stitchTokens.cardBorder,
    marginVertical: 2,
  },
  milestoneLineDone: {
    backgroundColor: stitchTokens.likeNewGreen,
  },
  milestoneBody: {
    flex: 1,
    paddingBottom: 10,
    gap: 1,
  },
  milestoneLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
  },
  milestoneLabelDone: {
    color: stitchTokens.darkWood,
    fontWeight: "700",
  },
  milestoneDetail: {
    fontSize: 11.5,
    color: stitchTokens.subtleGray,
  },
  journeyActionsWrap: {
    gap: 8,
    paddingTop: 4,
  },
  bookIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bookIconTile: {
    width: 48,
    height: 60,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseParchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  bookPriceTag: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  addressSummaryBox: {
    padding: 11,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 2,
  },
  addressLabelText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    color: stitchTokens.subtleGray,
  },
  addressMainText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  addressDetailText: {
    fontSize: 12.5,
    color: stitchTokens.deepCocoa,
    lineHeight: 18,
  },
});
