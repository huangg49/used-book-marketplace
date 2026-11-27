import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  stitchTokens,
} from "../../core/ui";
import {
  EXCHANGE_DRIVER_STEPS,
  exchangeDriverOrderSchema,
  exchangeDriverStep,
  simulatorUnavailable,
  type ExchangeLeg,
} from "./driver-model";
import { DriverMilestones, formatDriverTime } from "./driver-milestones";
import { driverStyles as styles } from "./driver-styles";

const UNAVAILABLE =
  "Tính năng mô phỏng vận chuyển hiện chỉ hoạt động ở môi trường thử nghiệm được cấp phép trên máy chủ.";

export function ExchangeDriverScreen({
  exchangeId,
  leg: initialLeg,
  trackingCode,
}: {
  exchangeId?: string;
  leg?: ExchangeLeg;
  trackingCode?: string;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [leg, setLeg] = useState(initialLeg);
  const [confirmStep, setConfirmStep] = useState<number | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const query = useQuery({
    queryKey: ["exchange-driver", exchangeId ?? null, leg ?? null, exchangeId ? null : trackingCode ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      if (exchangeId) params.set("exchangeId", exchangeId);
      else if (trackingCode) params.set("trackingCode", trackingCode);
      if (leg) params.set("leg", leg);
      const qs = params.toString();
      return client.request(
        `/shipments/carrier/orders/active${qs ? `?${qs}` : ""}`,
        exchangeDriverOrderSchema.nullable(),
      );
    },
    refetchInterval: (q) => (simulatorUnavailable(q.state.error) ? false : 8_000),
    retry: false,
  });

  const order = query.data ?? null;
  const step = order ? exchangeDriverStep(order) : 0;
  const nextStep = order && !order.deliveredAt
    ? EXCHANGE_DRIVER_STEPS.find((s) => s.step === step + 1)
    : undefined;
  const blocked = order?.readyForPickup === false;
  const pendingStep = EXCHANGE_DRIVER_STEPS.find((s) => s.step === confirmStep);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else if (order) router.replace({ pathname: "/exchange", params: { id: order.exchangeId } });
    else router.replace("/exchanges");
  };

  async function refreshExchange(id: string) {
    await Promise.all([
      query.refetch(),
      queryClient.invalidateQueries({ queryKey: ["exchange", id] }),
      queryClient.invalidateQueries({ queryKey: ["exchanges"] }),
    ]);
  }

  async function runStep(stepNumber: number) {
    const target = EXCHANGE_DRIVER_STEPS.find((s) => s.step === stepNumber);
    if (!order || !target || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.request("/webhooks/carrier", z.unknown(), {
        method: "POST",
        body: JSON.stringify({
          OrderCode: order.trackingCode,
          Status: target.status,
          Description: target.event(order),
        }),
      });
      setMessage({
        error: false,
        text: stepNumber === 4
          ? "Đã giao kiện thành công. Người nhận xác nhận đã nhận sách trong chi tiết trao đổi."
          : `Đã ghi nhận: ${target.label}.`,
      });
      await refreshExchange(order.exchangeId);
    } catch (caught) {
      setMessage({ error: true, text: simulatorUnavailable(caught) ? UNAVAILABLE : presentError(caught).message });
    } finally {
      setConfirmStep(null);
      setBusy(false);
    }
  }

  async function runAll() {
    if (!order || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.request(
        `/shipments/carrier/orders/${encodeURIComponent(order.exchangeId)}/auto-simulate`,
        z.unknown(),
        { method: "POST" },
      );
      setMessage({ error: false, text: "Đã mô phỏng giao xong cả hai kiện. Hai bên kiểm tra sách trong chi tiết trao đổi." });
      await refreshExchange(order.exchangeId);
    } catch (caught) {
      setMessage({ error: true, text: simulatorUnavailable(caught) ? UNAVAILABLE : presentError(caught).message });
    } finally {
      setConfirmAll(false);
      setBusy(false);
    }
  }

  const milestones = order
    ? [
        { label: "Đã tạo vận đơn", detail: order.trackingCode, done: true },
        { label: "Bưu tá đã lấy kiện", detail: formatDriverTime(order.shippedAt), done: step >= 1 },
        { label: "Đã nhập kho trung chuyển", done: step >= 2 },
        { label: "Đang đi giao", done: step >= 3 },
        { label: "Giao thành công", detail: formatDriverTime(order.deliveredAt), done: step >= 4 },
      ]
    : [];

  return (
    <View style={styles.screenRoot}>
      <WineHeader
        title="Mô phỏng Bưu tá"
        subtitle={order ? `Vận đơn ${order.trackingCode} · Trao đổi` : "Trao đổi sách"}
        onBack={handleBack}
        backLabel="Quay lại trao đổi"
        rightIcon="sync"
        rightLabel="Cập nhật vận đơn"
        onRightPress={() => void query.refetch()}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}
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
            <StatePanel wine loading title="Đang tải vận đơn trao đổi…" />
          </View>
        )}

        {query.isError && (
          <StatePanel
            wine
            title={simulatorUnavailable(query.error) ? "Simulator chưa mở cho thiết bị này" : "Chưa tải được vận đơn"}
            message={simulatorUnavailable(query.error) ? UNAVAILABLE : presentError(query.error).message}
            action={{ label: "Thử lại", busy: query.isFetching, onPress: () => void query.refetch() }}
          />
        )}

        {query.isSuccess && !order && (
          <StatePanel
            wine
            title="Không có kiện trao đổi đang giao"
            message="Tạo vận đơn ở chi tiết trao đổi trước, rồi mở lại Driver Simulator từ thẻ vận chuyển."
            action={{ label: "Quay lại", onPress: handleBack }}
          />
        )}

        {order && (
          <>
            <View style={styles.driverBanner}>
              <View style={styles.driverAvatar}>
                <Icon name="truck" size={20} color={stitchTokens.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={styles.driverName}>Bưu tá Lật Lại Simulator</AppText>
                <AppText style={styles.driverSub}>
                  {order.carrierName ?? "Vận chuyển"} · Chế độ mô phỏng
                </AppText>
              </View>
              <View style={styles.statusChip}>
                <AppText style={styles.statusChipText}>
                  {order.bothDelivered ? "Đã giao 2 kiện" : order.deliveredAt ? "Đã giao" : "Đang xử lý"}
                </AppText>
              </View>
            </View>

            {order.legs && order.legs.length > 1 ? (
              <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="tablist">
                {order.legs.map((l) => {
                  const selected = l.trackingCode === order.trackingCode;
                  return (
                    <Pressable
                      key={l.leg}
                      accessibilityRole="tab"
                      accessibilityState={{ selected, disabled: busy }}
                      disabled={busy || selected}
                      onPress={() => { setMessage(null); setLeg(l.leg); }}
                      style={({ pressed }) => [
                        styles.legTab,
                        selected && styles.legTabSelected,
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <AppText style={[styles.legTabTitle, selected && styles.legTabTitleSelected]} numberOfLines={1}>
                        {l.label}
                      </AppText>
                      <AppText style={[styles.legTabSub, selected && styles.legTabTitleSelected]}>
                        {l.isDelivered ? "Đã giao" : l.shippedAt ? "Đang giao" : "Chờ lấy"}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.card}>
              <View style={styles.parcelTopRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText style={styles.kicker}>MÃ VẬN ĐƠN</AppText>
                  <AppText style={styles.trackingCode} selectable>{order.trackingCode}</AppText>
                </View>
                <AppText style={styles.amountBadge}>{formatVnd(order.fee)}</AppText>
              </View>

              <View style={styles.bookRow}>
                <Icon name="book" size={16} color={stitchTokens.wine} />
                <AppText style={styles.bookTitle} numberOfLines={2}>{order.itemsSummary}</AppText>
              </View>

              {[
                { key: "from", label: "Lấy sách", p: order.sender },
                { key: "to", label: "Giao sách", p: order.receiver },
              ].map(({ key, label, p }) => (
                <View key={key} style={styles.addressBox}>
                  <Icon name="pin" size={14} color={stitchTokens.wine} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText style={styles.kicker}>{label.toUpperCase()}</AppText>
                    <AppText style={styles.addressMain}>{p.name} · {p.phone}</AppText>
                    <AppText style={styles.addressDetail}>{p.detail}</AppText>
                  </View>
                </View>
              ))}

              <DriverMilestones items={milestones} />

              {message ? <Notice tone={message.error ? "error" : "success"}>{message.text}</Notice> : null}

              {blocked ? (
                <Notice tone="info">Kiện chưa sẵn sàng lấy. Người gửi cần hoàn tất đóng gói trong chi tiết trao đổi.</Notice>
              ) : nextStep ? (
                <View style={styles.driverActionBox}>
                  <AppText style={styles.driverActionHint}>{nextStep.event(order)}.</AppText>
                  <Button
                    wine
                    busy={busy}
                    title={`${nextStep.step}. ${nextStep.label} · Demo`}
                    onPress={() => setConfirmStep(nextStep.step)}
                  />
                </View>
              ) : (
                <View style={styles.deliveredBox}>
                  <Icon name="check" size={16} color={stitchTokens.likeNewGreen} />
                  <AppText style={styles.deliveredText}>
                    Kiện này đã giao thành công. Quay lại trao đổi để xác nhận đã nhận sách.
                  </AppText>
                </View>
              )}

              {!order.bothDelivered && !blocked ? (
                <Button
                  wine
                  secondary
                  disabled={busy}
                  title="Giao nhanh cả hai kiện · Demo"
                  onPress={() => setConfirmAll(true)}
                />
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={handleBack}
                style={({ pressed }) => [styles.backLinkBtn, pressed && { opacity: 0.78 }]}
              >
                <Icon name="back" size={14} color={stitchTokens.wine} />
                <AppText style={styles.backLinkText}>Quay lại chi tiết trao đổi</AppText>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={Boolean(pendingStep)}
        title={pendingStep ? `${pendingStep.label}?` : ""}
        message={pendingStep && order ? `${pendingStep.event(order)}.` : ""}
        confirmLabel="Ghi nhận mốc giao hàng"
        busy={busy}
        onCancel={() => !busy && setConfirmStep(null)}
        onConfirm={() => confirmStep && void runStep(confirmStep)}
      />
      <ConfirmDialog
        visible={confirmAll}
        title="Giao nhanh cả hai kiện?"
        message="Simulator ghi nhận cả hai kiện đã giao thành công và mở thời gian kiểm tra sách cho hai bên."
        confirmLabel="Giao cả hai kiện"
        busy={busy}
        onCancel={() => !busy && setConfirmAll(false)}
        onConfirm={() => void runAll()}
      />
    </View>
  );
}
