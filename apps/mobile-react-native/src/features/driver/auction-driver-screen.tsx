import { useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
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
  presentError,
  stitchTokens,
} from "../../core/ui";
import {
  auctionErrorText,
  demoDeliverPointOrder,
  demoStartPointDelivery,
  outcomeUnknown,
  pointOrderKey,
} from "../auctions/auctions-model";
import { DriverMilestones, formatDriverTime } from "./driver-milestones";
import { driverStyles as styles } from "./driver-styles";

// Same read the web AuctionDriverView uses (ADR 0044). The server decides
// whether this viewer may drive the demo; the client never guesses it.
export const pointDeliveryTrackingSchema = z.object({
  orderId: z.string().uuid(),
  auctionId: z.string().uuid(),
  title: z.string(),
  pointName: z.string(),
  trackingCode: z.string(),
  dispatchedAt: z.string(),
  deliveryDeadline: z.string(),
  outcomeAt: z.string().nullable(),
  status: z.enum(["InTransit", "Delivered", "Failed", "Overdue"]),
  viewer: z.enum(["Buyer", "Operator"]),
  canReport: z.boolean(),
  serverTime: z.string(),
  canDemoControl: z.boolean().default(false),
  version: z.number().int().optional(),
  demoOutForDeliveryAt: z.string().nullish(),
});
type Tracking = z.infer<typeof pointDeliveryTrackingSchema>;

type Intent =
  | { kind: "Start" | "Deliver"; orderId: string; version: number; key: string }
  | {
      kind: "Report";
      event: {
        eventId: string;
        orderId: string;
        trackingCode: string;
        carrier: "LatLaiSimulator";
        outcome: "Delivered" | "Failed";
        occurredAt: string;
      };
    };

const STATUS_LABEL: Record<Tracking["status"], string> = {
  InTransit: "Đang giao",
  Delivered: "Đã giao",
  Failed: "Giao không thành công",
  Overdue: "Quá hạn giao",
};

export function AuctionDriverScreen({ trackingCode }: { trackingCode: string }) {
  const { client, state } = useSession();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const ownerId = state.status === "authenticated" ? state.user.id : "";
  const [confirm, setConfirm] = useState<"Start" | "Deliver" | "Failed" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  // A lost response keeps the same intent (key/event) so a retry replays it.
  const pending = useRef<Intent | null>(null);

  const query = useQuery({
    queryKey: ["point-order-delivery-tracking", ownerId, trackingCode],
    queryFn: () =>
      client.request(
        `/point-orders/delivery-tracking/${encodeURIComponent(trackingCode)}`,
        pointDeliveryTrackingSchema,
      ),
    enabled: Boolean(ownerId) && Boolean(trackingCode),
    refetchInterval: (q) => (q.state.data?.status === "InTransit" ? 10_000 : false),
    retry: false,
  });

  const t = query.data;
  const awaitingStart = Boolean(t && t.status === "InTransit" && !t.demoOutForDeliveryAt);
  const buyerDemo = Boolean(t?.canDemoControl && t.version !== undefined && t.status === "InTransit");
  const operatorReport = Boolean(t?.canReport && !t?.canDemoControl);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else if (t) router.replace({ pathname: "/auction", params: { id: t.auctionId } });
    else router.replace("/my-auctions");
  };

  async function run(choice: "Start" | "Deliver" | "Failed") {
    if (!t || busy) return;
    let intent = pending.current;
    if (!intent) {
      if (choice === "Failed" || (choice === "Deliver" && operatorReport)) {
        const current = await client
          .request(`/point-orders/delivery-tracking/${encodeURIComponent(trackingCode)}`, pointDeliveryTrackingSchema)
          .catch(() => null);
        if (!current?.canReport) {
          setConfirm(null);
          setMessage({ error: true, text: "Vận đơn đã đổi trạng thái. Kiểm tra lại thông tin ở trên." });
          void query.refetch();
          return;
        }
        intent = {
          kind: "Report",
          event: {
            eventId: Crypto.randomUUID(),
            orderId: current.orderId,
            trackingCode: current.trackingCode,
            carrier: "LatLaiSimulator",
            outcome: choice === "Failed" ? "Failed" : "Delivered",
            occurredAt: current.serverTime,
          },
        };
      } else {
        intent = { kind: choice, orderId: t.orderId, version: t.version!, key: Crypto.randomUUID() };
      }
    }
    setBusy(true);
    setMessage(null);
    try {
      if (intent.kind === "Report") {
        await client.request("/operations/simulator/point-delivery-events", z.unknown(), {
          method: "POST",
          headers: { "Idempotency-Key": intent.event.eventId },
          body: JSON.stringify(intent.event),
        });
      } else {
        const send = intent.kind === "Start" ? demoStartPointDelivery : demoDeliverPointOrder;
        await send(client, intent.orderId, intent.version, intent.key);
      }
      pending.current = null;
      const orderId = intent.kind === "Report" ? intent.event.orderId : intent.orderId;
      setMessage({
        error: false,
        text: intent.kind === "Start"
          ? "Bưu tá đã bắt đầu đi giao."
          : intent.kind === "Report" && intent.event.outcome === "Failed"
            ? "Đã ghi nhận giao không thành công. Đơn chuyển quản trị viên xử lý."
            : "Đã ghi nhận giao thành công. Quay lại đơn để xác nhận đã nhận sách.",
      });
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: pointOrderKey(orderId) }),
      ]);
    } catch (caught) {
      const unknown = outcomeUnknown(caught);
      pending.current = unknown ? intent : null;
      setMessage({
        error: true,
        text: unknown ? "Chưa rõ hệ thống đã ghi nhận. Hãy thử lại đúng thao tác này." : auctionErrorText(caught),
      });
      if (!unknown) void query.refetch();
    } finally {
      setConfirm(null);
      setBusy(false);
    }
  }

  const milestones = t
    ? [
        { label: `Điểm ${t.pointName} đã bàn giao cho hãng`, detail: formatDriverTime(t.dispatchedAt), done: true },
        {
          label: "Bưu tá bắt đầu đi giao",
          detail: formatDriverTime(t.demoOutForDeliveryAt) ?? `Hạn giao ${formatDriverTime(t.deliveryDeadline)}`,
          done: Boolean(t.demoOutForDeliveryAt) || t.status !== "InTransit",
        },
        {
          label: t.status === "Failed" || t.status === "Overdue" ? STATUS_LABEL[t.status] : "Giao thành công",
          detail: formatDriverTime(t.outcomeAt),
          done: t.status !== "InTransit",
        },
      ]
    : [];

  const confirmCopy = {
    Start: { title: "Bắt đầu đi giao?", body: "Ghi nhận mốc bưu tá rời điểm và bắt đầu giao sách tới người thắng." },
    Deliver: { title: "Xác nhận giao thành công?", body: "Ghi nhận hãng đã giao sách tới người thắng đấu giá." },
    Failed: { title: "Báo giao không thành công?", body: "Đơn sẽ chuyển quản trị viên xử lý theo quy trình giao lỗi." },
  } as const;

  return (
    <View style={styles.screenRoot}>
      <WineHeader
        title="Mô phỏng Bưu tá"
        subtitle={`Vận đơn ${trackingCode} · Đấu giá`}
        onBack={handleBack}
        backLabel="Quay lại đơn đấu giá"
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
        {!ownerId && (
          <StatePanel
            wine
            title="Đăng nhập để mở simulator"
            message="Chỉ người thắng đấu giá hoặc tài khoản vận hành thử nghiệm mới xem được vận đơn này."
            action={{ label: "Đăng nhập", onPress: () => router.push("/account") }}
          />
        )}

        {ownerId && query.isPending && (
          <View style={styles.centerWrap}>
            <StatePanel wine loading title="Đang tải vận đơn đấu giá…" />
          </View>
        )}

        {query.isError && (
          <StatePanel
            wine
            title="Chưa tải được vận đơn"
            message={presentError(query.error).message}
            action={{ label: "Thử lại", busy: query.isFetching, onPress: () => void query.refetch() }}
          />
        )}

        {t && (
          <>
            <View style={styles.driverBanner}>
              <View style={styles.driverAvatar}>
                <Icon name="truck" size={20} color={stitchTokens.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={styles.driverName}>Lật Lại Express (Mô phỏng)</AppText>
                <AppText style={styles.driverSub}>Từ điểm {t.pointName} · TP.HCM</AppText>
              </View>
              <View style={styles.statusChip}>
                <AppText style={styles.statusChipText}>
                  {awaitingStart ? "Hãng đã nhận sách" : STATUS_LABEL[t.status]}
                </AppText>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.parcelTopRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText style={styles.kicker}>MÃ VẬN ĐƠN (ĐẤU GIÁ)</AppText>
                  <AppText style={styles.trackingCode} selectable>{t.trackingCode}</AppText>
                </View>
              </View>
              <View style={styles.bookRow}>
                <Icon name="book" size={16} color={stitchTokens.wine} />
                <AppText style={styles.bookTitle} numberOfLines={2}>{t.title}</AppText>
              </View>

              <DriverMilestones items={milestones} />

              {message ? <Notice tone={message.error ? "error" : "success"}>{message.text}</Notice> : null}

              {buyerDemo ? (
                <View style={styles.driverActionBox}>
                  <AppText style={styles.driverActionHint}>
                    {awaitingStart
                      ? "Bước kế tiếp: bưu tá rời điểm và bắt đầu đi giao."
                      : "Bước kế tiếp: xác nhận sách đã tới tay người thắng."}
                  </AppText>
                  <Button
                    wine
                    busy={busy}
                    title={awaitingStart ? "Bắt đầu đi giao · Demo" : "Giao thành công · Demo"}
                    onPress={() => setConfirm(awaitingStart ? "Start" : "Deliver")}
                  />
                </View>
              ) : operatorReport ? (
                <View style={styles.driverActionBox}>
                  <AppText style={styles.driverActionHint}>Báo kết quả giao của hãng mô phỏng.</AppText>
                  <Button wine busy={busy} title="Giao thành công" onPress={() => setConfirm("Deliver")} />
                  <Button wine secondary disabled={busy} title="Giao không thành công" onPress={() => setConfirm("Failed")} />
                </View>
              ) : t.status === "Delivered" ? (
                <View style={styles.deliveredBox}>
                  <Icon name="check" size={16} color={stitchTokens.likeNewGreen} />
                  <AppText style={styles.deliveredText}>
                    Sách đã giao. Quay lại đơn đấu giá để xác nhận đã nhận sách.
                  </AppText>
                </View>
              ) : t.status === "InTransit" ? (
                <Notice tone="info">
                  Thao tác mô phỏng chỉ mở khi máy chủ bật chế độ demo và bạn là người thắng phiên. Bạn vẫn theo dõi được vận đơn ở đây.
                </Notice>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={handleBack}
                style={({ pressed }) => [styles.backLinkBtn, pressed && { opacity: 0.78 }]}
              >
                <Icon name="back" size={14} color={stitchTokens.wine} />
                <AppText style={styles.backLinkText}>Quay lại đơn đấu giá</AppText>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={Boolean(confirm)}
        title={confirm ? confirmCopy[confirm].title : ""}
        message={confirm ? confirmCopy[confirm].body : ""}
        confirmLabel="Ghi nhận"
        busy={busy}
        onCancel={() => !busy && setConfirm(null)}
        onConfirm={() => confirm && void run(confirm)}
      />
    </View>
  );
}
