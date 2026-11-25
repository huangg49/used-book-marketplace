import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DirectDeliveryTimeline } from "../components/DirectDeliveryJourney";
import { useDirectDeliveryAction } from "../hooks/useDirectDeliveryAction";
import { useSession } from "../hooks/useSession";
import { ROUTES } from "../lib/routes";
import {
  getDirectOrderByTrackingCode,
  getOrder,
  listOrders,
  type DirectDeliveryAction,
  type DirectOrder,
} from "../services/orders";
import {
  DriverCompleteAction,
  DriverParcelCard,
  DriverParcelRoute,
  DriverWorkspace,
} from "./DriverWorkspace";
import styles from "./DriverPage.module.css";

const steps = [
  { action: "Pickup", label: "Xác nhận lấy kiện", description: "Tua thời gian chờ bưu tá lấy kiện. Đơn sẽ chuyển sang vận chuyển." },
  { action: "OutForDelivery", label: "Bắt đầu đi giao", description: "Ghi mốc bưu tá bắt đầu giao sách cho người mua." },
  { action: "Deliver", label: "Giao thành công", description: "Tua chặng giao. Đơn sẽ mở bước kiểm tra và vẫn giữ tiền." },
] as const;

const ACTIVE_DIRECT_STATES = new Set(["Preparing", "InTransit", "Inspection"]);

function chipStatusLabel(order: DirectOrder) {
  if (order.deliveryJourney?.issue) return "Sự cố";
  if (order.deliveredAt || order.state === "Inspection") return "✓ Đã giao";
  if (order.deliveryJourney?.outForDeliveryAt) return "🛵 Đang giao";
  if (order.deliveryJourney?.pickedUpAt) return "🚚 Đã lấy";
  return "📦 Chờ lấy";
}

export function DirectDriverView({ code, onSearch }: { code: string; onSearch: (code: string) => void }) {
  const state = useSession();
  const ownerId = state.status === "authenticated" ? state.user.id : null;

  const recentTracked = useQuery({
    queryKey: ["direct-driver-recent", ownerId],
    queryFn: async () => {
      const page = await listOrders();
      const active = page.items.filter((item) => ACTIVE_DIRECT_STATES.has(item.state)).slice(0, 6);
      const settled = await Promise.allSettled(active.map((item) => getOrder(item.id)));
      return settled
        .filter((res): res is PromiseFulfilledResult<DirectOrder> => res.status === "fulfilled")
        .map((res) => res.value)
        .filter((item) => Boolean(item.deliveryJourney?.trackingCode));
    },
    enabled: !!ownerId,
    refetchInterval: 10_000,
    retry: false,
  });

  const activeCode = code || recentTracked.data?.[0]?.deliveryJourney?.trackingCode || "";
  const validCode = /^LL-[A-Z0-9]{8,32}$/.test(activeCode);
  const order = useQuery({
    queryKey: ["direct-driver-order", ownerId, activeCode],
    queryFn: () => getDirectOrderByTrackingCode(activeCode),
    enabled: !!ownerId && validCode,
    refetchInterval: (query) => ["Preparing", "InTransit", "Inspection"].includes(query.state.data?.state ?? "") ? 4_000 : false,
    retry: false,
  });
  const parcel = order.data?.deliveryJourney?.trackingCode === activeCode && order.data.deliveryJourney ? order.data : null;
  const recentItems = recentTracked.data ?? [];

  return (
    <DriverWorkspace
      mode="direct"
      subtitle="Mô phỏng bưu tá · Mua ngay"
      trackingCode={activeCode}
      searchLocked={order.isFetching}
      onSearch={onSearch}
      back={parcel ? { to: parcel.conversationId ? `/chat/${parcel.conversationId}` : `/orders/${parcel.id}`, label: "Quay lại đơn mua" } : undefined}
      refresh={{
        loading: order.isFetching || recentTracked.isFetching,
        disabled: !ownerId,
        run: () => {
          void recentTracked.refetch();
          if (validCode) void order.refetch();
        },
      }}
    >
      {ownerId && recentItems.length > 0 && (
        <div className={styles.chipsSection}>
          <p className={styles.chipsLabel}>Chọn nhanh đơn mua đang giao</p>
          <div className={styles.chipsRow}>
            {recentItems.map((item) => {
              const itemCode = item.deliveryJourney!.trackingCode!;
              const isActive = itemCode === activeCode;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.chip} ${isActive ? styles.chipActive : ""}`}
                  onClick={() => onSearch(itemCode)}
                  title={`${item.item.metadata.title} (${itemCode})`}
                >
                  #{item.id.slice(0, 6).toUpperCase()} ({chipStatusLabel(item)})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {state.status === "loading" || (ownerId && ((validCode && order.isPending) || (!code && recentTracked.isPending))) ? (
        <p className={styles.loadingBox} role="status">Đang tải vận đơn…</p>
      ) : !ownerId ? (
        <section className={styles.auctionShipment}>
          <h2>Đăng nhập để xem vận đơn</h2>
          <p>Phiên đăng nhập chỉ lưu trong bộ nhớ của tab hiện tại. Hãy bấm trực tiếp từ tab đơn mua hoặc đăng nhập tại đây để tiếp tục.</p>
          <Link
            className={styles.auctionAction}
            to={`${ROUTES.login}?returnUrl=${encodeURIComponent(
              code ? `/driver?${new URLSearchParams({ kind: "direct", trackingCode: code })}` : "/driver?kind=direct",
            )}`}
          >
            Đăng nhập
          </Link>
        </section>
      ) : parcel ? (
        <DirectDriverParcel
          key={parcel.id}
          order={parcel}
          ownerId={ownerId}
          reload={() => Promise.all([order.refetch(), recentTracked.refetch()])}
        />
      ) : !activeCode ? (
        <div className={styles.emptyBox}>
          <p className={styles.emptyTitle}>Chưa có đơn mua nào đang giao</p>
          <p className={styles.emptyDesc}>
            Khi người bán đăng ký mã vận đơn (dạng LL-...), đơn sẽ tự hiện ở đây để bưu tá chọn giao.
          </p>
        </div>
      ) : (
        <div className={styles.emptyBox} role="alert">
          <p className={styles.emptyTitle}>Chưa tìm thấy mã vận đơn này</p>
          <p className={styles.emptyDesc}>
            Kiểm tra lại mã {activeCode} hoặc chọn một đơn ở danh sách phía trên.
          </p>
        </div>
      )}
    </DriverWorkspace>
  );
}

function DirectDriverParcel({ order, ownerId, reload }: { order: DirectOrder; ownerId: string; reload: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const command = useDirectDeliveryAction(order, async () => {
    await Promise.all([reload(), queryClient.invalidateQueries({ queryKey: ["direct-order", ownerId, order.id] })]);
  });
  const [confirm, setConfirm] = useState<DirectDeliveryAction>();
  const journey = order.deliveryJourney!;
  const step = steps.find((entry) =>
    command.pending ? entry.action === command.pending : journey.actions.includes(entry.action));
  const inspection = order.state === "Inspection";
  const status = journey.issue ? "Đang xử lý sự cố" : order.deliveredAt ? "Đã giao" :
    journey.outForDeliveryAt ? "Đang giao" : journey.pickedUpAt ? "Đã lấy kiện" : "Chờ lấy kiện";

  const pickupRoute = order.role === "Seller"
    ? {
        label: "Điểm lấy sách (người bán)",
        name: `${order.ownAddress.recipientName} · ${order.ownAddress.phone}`,
        detail: order.ownAddress.detail,
      }
    : {
        label: "Điểm lấy sách (người bán)",
        name: "Người bán sách Lật Lại",
        detail: "Địa chỉ lấy kiện đã xác nhận khi đăng ký vận đơn",
      };

  const dropoffRoute = order.shippingAddress
    ? {
        label: "Điểm giao sách (người nhận)",
        name: `${order.shippingAddress.recipientName} · ${order.shippingAddress.phone}`,
        detail: order.shippingAddress.detail,
      }
    : {
        label: "Điểm giao sách (người nhận)",
        name: "Người mua sách",
      };

  return (
    <>
      <DriverParcelCard
        label="Mã vận đơn (Mua ngay)"
        trackingCode={journey.trackingCode!}
        summary={order.item.bundle?.title || order.item.metadata.title}
        badge={<strong className={styles.feeBadge}>{status}</strong>}
      >
        <DriverParcelRoute pickup={pickupRoute} dropoff={dropoffRoute} />
        <div className={styles.directTimelineWrap}>
          <DirectDeliveryTimeline order={order} />
          {step && (
            <DriverCompleteAction
              title={step.label}
              description={step.description}
              badge="Demo"
              delivered={false}
              disabled={command.busy}
              onClick={() => setConfirm(step.action)}
            />
          )}
          {inspection && (
            <p className={styles.directInspectionNote}>
              <PackageCheck size={16} aria-hidden="true" />
              <span>Giao thành công. Quay lại đơn để người mua kiểm tra sách.</span>
            </p>
          )}
        </div>
      </DriverParcelCard>
      {command.error && !confirm && <p className={styles.auctionFeedback} role="alert">{command.error}</p>}
      <ConfirmDialog
        isOpen={!!confirm}
        onClose={() => !command.busy && setConfirm(undefined)}
        title={step?.label ?? "Cập nhật giao nhận"}
        description={step?.description ?? "Tiến độ đơn sẽ được cập nhật."}
        confirmText={command.pending ? "Thử lại ghi nhận" : "Ghi nhận mốc giao hàng"}
        isBusy={command.busy}
        onConfirm={async () => {
          if (confirm && await command.run(confirm)) setConfirm(undefined);
        }}
      >
        {command.error && <p role="alert">{command.error}</p>}
      </ConfirmDialog>
    </>
  );
}
