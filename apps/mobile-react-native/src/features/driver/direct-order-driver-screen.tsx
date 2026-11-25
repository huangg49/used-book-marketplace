import React, { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { z } from "zod";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  ConfirmDialog,
  Icon,
  Notice,
  StatePanel,
  WineHeader,
  formatVnd,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { orderDetailsSchema } from "../orders/contracts";

const directDriverActionSchema = z.enum([
  "Pickup",
  "OutForDelivery",
  "Deliver",
  "Acknowledge",
  "ReportNonReceipt",
  "ReportCondition",
  "SkipInspection",
]);
type DirectDriverAction = z.infer<typeof directDriverActionSchema>;

const directDriverOrderSchema = orderDetailsSchema.extend({
  conversationId: z.string().uuid().nullish(),
  deliveredAt: z.iso.datetime().nullish(),
  inspectionDeadline: z.iso.datetime().nullish(),
  item: z.object({
    metadata: z.object({ title: z.string() }),
    description: z.string(),
  }),
  shippingAddress: z
    .object({
      recipientName: z.string(),
      phone: z.string(),
      localityCode: z.string(),
      detail: z.string(),
    })
    .nullable(),
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
      actions: z.array(directDriverActionSchema),
    })
    .nullish(),
});

const receiptSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  state: z.string(),
});

const DRIVER_STEPS = [
  {
    action: "Pickup" as const,
    label: "Xác nhận lấy kiện",
    description:
      "Bưu tá đã nhận kiện sách từ người bán. Đơn sẽ chuyển sang trạng thái Đang vận chuyển.",
  },
  {
    action: "OutForDelivery" as const,
    label: "Bắt đầu đi giao",
    description:
      "Ghi nhận mốc bưu tá bắt đầu giao kiện sách tới địa chỉ người mua.",
  },
  {
    action: "Deliver" as const,
    label: "Giao thành công",
    description:
      "Hoàn tất chặng giao hàng. Đơn mở bước 72 giờ kiểm tra sách và vẫn giữ tiền an toàn.",
  },
] as const;

export function DirectOrderDriverScreen({
  trackingCode,
}: {
  trackingCode: string;
}) {
  const { client, state } = useSession();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const ownerId = state.status === "authenticated" ? state.user.id : "";
  const [confirmAction, setConfirmAction] = useState<DirectDriverAction | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const query = useQuery({
    queryKey: ["direct-driver-order", ownerId, trackingCode],
    queryFn: () =>
      client.request(
        `/me/direct-order-tracking/${encodeURIComponent(trackingCode)}`,
        directDriverOrderSchema,
      ),
    enabled: Boolean(ownerId) && Boolean(trackingCode),
    refetchInterval: 5_000,
    retry: false,
  });

  const order = query.data;
  const journey = order?.deliveryJourney;

  const activeStep = DRIVER_STEPS.find((s) =>
    journey?.actions.includes(s.action),
  );
  const confirmStep = DRIVER_STEPS.find((s) => s.action === confirmAction);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else if (order) {
      router.replace({ pathname: "/orders", params: { orderId: order.id } });
    } else {
      router.replace("/orders");
    }
  };

  async function runDriverStep(action: DirectDriverAction) {
    if (!order || busy) return;
    setBusy(true);
    setError("");
    try {
      await client.request(
        `/orders/${encodeURIComponent(order.id)}/delivery-journey`,
        receiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": Crypto.randomUUID() },
          body: JSON.stringify({
            expectedVersion: order.version,
            action,
          }),
        },
      );
      setConfirmAction(null);
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({
          queryKey: ["direct-order", ownerId, order.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["my-orders", ownerId] }),
      ]);
    } catch (caught) {
      setError(presentError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = !order || !journey
    ? "Đang tải"
    : journey.issue
      ? "Đang xử lý sự cố"
      : order.deliveredAt
        ? "Giao thành công"
        : journey.outForDeliveryAt
          ? "Đang đi giao"
          : journey.pickedUpAt
            ? "Đã lấy kiện"
            : "Chờ bưu tá lấy kiện";

  const milestones = journey
    ? [
        {
          label: "Đã đăng ký vận đơn",
          detail: journey.trackingCode,
          done: Boolean(journey.trackingCode),
        },
        {
          label: "Bưu tá đã lấy kiện",
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
          detail: order?.deliveredAt
            ? new Date(order.deliveredAt).toLocaleString("vi-VN")
            : null,
          done: Boolean(order?.deliveredAt),
        },
      ]
    : [];

  return (
    <View style={styles.screenRoot}>
      <WineHeader
        title="Mô phỏng Bưu tá"
        subtitle={`Vận đơn ${trackingCode} · Mua ngay`}
        onBack={handleBack}
        backLabel="Quay lại đơn mua"
        rightIcon="sync"
        rightLabel="Cập nhật vận đơn"
        onRightPress={() => void query.refetch()}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 20) + 12 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={stitchTokens.wineDark}
          />
        }
      >
        {query.isPending && (
          <View style={styles.centerWrap}>
            <StatePanel wine loading title="Đang tải thông tin vận đơn…" />
          </View>
        )}

        {query.isError && (
          <StatePanel
            wine
            title="Chưa tải được vận đơn"
            message="Kiểm tra quyền tài khoản trong đơn hoặc tải lại."
            action={{
              label: "Thử lại",
              busy: query.isFetching,
              onPress: () => void query.refetch(),
            }}
          />
        )}

        {order && journey && (
          <>
            {/* Driver Profile Banner */}
            <View style={styles.driverBanner}>
              <View style={styles.driverAvatar}>
                <Icon name="truck" size={20} color={stitchTokens.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={styles.driverName}>
                  Bưu tá Lật Lại Simulator
                </AppText>
                <AppText style={styles.driverSub}>
                  Tuyến TP.HCM · Chế độ mô phỏng trực tiếp
                </AppText>
              </View>
              <View style={styles.statusChip}>
                <AppText style={styles.statusChipText}>{statusLabel}</AppText>
              </View>
            </View>

            {/* Parcel & Timeline Card */}
            <View style={styles.card}>
              <View style={styles.parcelTopRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText style={styles.kicker}>MÃ VẬN ĐƠN</AppText>
                  <AppText style={styles.trackingCode} selectable>
                    {journey.trackingCode}
                  </AppText>
                </View>
                <AppText style={styles.amountBadge}>
                  {formatVnd(order.amounts.buyerTotal)}
                </AppText>
              </View>

              <View style={styles.bookRow}>
                <Icon name="book" size={16} color={stitchTokens.wine} />
                <AppText style={styles.bookTitle} numberOfLines={2}>
                  {order.item.metadata.title}
                </AppText>
              </View>

              {order.shippingAddress ? (
                <View style={styles.addressBox}>
                  <Icon name="pin" size={14} color={stitchTokens.wine} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText style={styles.addressMain}>
                      {order.shippingAddress.recipientName} ·{" "}
                      {order.shippingAddress.phone}
                    </AppText>
                    <AppText style={styles.addressDetail}>
                      {order.shippingAddress.detail}
                    </AppText>
                  </View>
                </View>
              ) : null}

              <View style={styles.milestoneList}>
                {milestones.map((m, idx) => {
                  const isLast = idx === milestones.length - 1;
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

              {Boolean(error) && <Notice tone="error">{error}</Notice>}

              {activeStep ? (
                <View style={styles.driverActionBox}>
                  <AppText style={styles.driverActionHint}>
                    {activeStep.description}
                  </AppText>
                  <Button
                    wine
                    busy={busy}
                    title={`${activeStep.label} · Demo`}
                    onPress={() => setConfirmAction(activeStep.action)}
                  />
                </View>
              ) : order.state === "Inspection" || order.state === "Completed" ? (
                <View style={styles.deliveredBox}>
                  <Icon
                    name="check"
                    size={16}
                    color={stitchTokens.likeNewGreen}
                  />
                  <AppText style={styles.deliveredText}>
                    Kiện sách đã giao thành công! Quay lại đơn hàng để kiểm tra
                    sách 72 giờ.
                  </AppText>
                </View>
              ) : (
                <Notice tone="info">
                  Đang ở chế độ theo dõi vận đơn. Thao tác mô phỏng bưu tá khả
                  dụng ở tài khoản Người mua.
                </Notice>
              )}

              <Pressable
                accessibilityRole="button"
                onPress={handleBack}
                style={({ pressed }) => [
                  styles.backLinkBtn,
                  pressed && { opacity: 0.78 },
                ]}
              >
                <Icon name="back" size={14} color={stitchTokens.wine} />
                <AppText style={styles.backLinkText}>
                  Quay lại chi tiết đơn mua
                </AppText>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={Boolean(confirmStep)}
        title={confirmStep ? `${confirmStep.label}?` : ""}
        message={confirmStep?.description ?? ""}
        confirmLabel="Ghi nhận mốc giao hàng"
        onCancel={() => !busy && setConfirmAction(null)}
        onConfirm={() => confirmAction && void runDriverStep(confirmAction)}
      />
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
  driverBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: stitchTokens.wineDark,
  },
  driverAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: stitchTokens.whiteAlpha14,
    alignItems: "center",
    justifyContent: "center",
  },
  driverName: {
    fontSize: 14.5,
    fontWeight: "800",
    color: stitchTokens.white,
  },
  driverSub: {
    fontSize: 11.5,
    color: stitchTokens.gold,
    marginTop: 1,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.gold,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 16,
    gap: 12,
  },
  parcelTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardBorder,
  },
  kicker: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.subtleGray,
    letterSpacing: 0.4,
  },
  trackingCode: {
    fontSize: 17,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    letterSpacing: 0.4,
  },
  amountBadge: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  bookRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bookTitle: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  addressBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  addressMain: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  addressDetail: {
    fontSize: 12,
    color: stitchTokens.deepCocoa,
    lineHeight: 17,
  },
  milestoneList: {
    paddingTop: 4,
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
  driverActionBox: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: 10,
  },
  driverActionHint: {
    fontSize: 12.5,
    color: stitchTokens.deepCocoa,
    lineHeight: 18,
  },
  deliveredBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderWidth: 1,
    borderColor: stitchTokens.greenBorderSoft,
  },
  deliveredText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
    lineHeight: 18,
  },
  backLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  backLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
});
