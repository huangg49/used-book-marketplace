import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DirectDeliveryTimeline } from "../components/DirectDeliveryJourney";
import { useDirectDeliveryAction } from "../hooks/useDirectDeliveryAction";
import { useSession } from "../hooks/useSession";
import { getDirectOrderByTrackingCode, type DirectDeliveryAction, type DirectOrder } from "../services/orders";
import { DriverCompleteAction, DriverParcelCard, DriverWorkspace } from "./DriverWorkspace";
import styles from "./DriverPage.module.css";

const steps = [
  { action: "Pickup", label: "Xác nhận lấy kiện", description: "Tua thời gian chờ bưu tá lấy kiện. Đơn sẽ chuyển sang vận chuyển." },
  { action: "OutForDelivery", label: "Bắt đầu đi giao", description: "Ghi mốc bưu tá bắt đầu giao sách cho người mua." },
  { action: "Deliver", label: "Giao thành công", description: "Tua chặng giao. Đơn sẽ mở bước kiểm tra và vẫn giữ tiền." },
] as const;

export function DirectDriverView({ code, onSearch }: { code: string; onSearch: (code: string) => void }) {
  const state = useSession();
  const ownerId = state.status === "authenticated" ? state.user.id : null;
  const validCode = /^LL-[A-Z0-9]{8,32}$/.test(code);
  const order = useQuery({
    queryKey: ["direct-driver-order", ownerId, code],
    queryFn: () => getDirectOrderByTrackingCode(code),
    enabled: !!ownerId && validCode,
    refetchInterval: (query) => ["Preparing", "InTransit", "Inspection"].includes(query.state.data?.state ?? "") ? 4_000 : false,
    retry: false,
  });
  const parcel = order.data?.deliveryJourney?.trackingCode === code && order.data.deliveryJourney ? order.data : null;

  return (
    <DriverWorkspace subtitle="Mô phỏng bưu tá · Mua ngay" trackingCode={code} searchLocked={order.isFetching} onSearch={onSearch}
      back={parcel ? { to: parcel.conversationId ? `/chat/${parcel.conversationId}` : `/orders/${parcel.id}`, label: "Quay lại đơn mua" } : undefined}
      refresh={{ loading: order.isFetching, disabled: !ownerId || !validCode, run: () => void order.refetch() }}>
      {state.status === "loading" || (ownerId && validCode && order.isPending) ? <p role="status">Đang tải vận đơn…</p>
        : !ownerId ? <p>Đăng nhập tài khoản trong giao dịch để xem vận đơn.</p>
          : parcel ? <DirectDriverParcel key={parcel.id} order={parcel} reload={() => order.refetch()} />
            : <p role="alert">Chưa tìm được mã này trong đơn mua. Hãy mở lại từ bước Giao nhận của đơn.</p>}
    </DriverWorkspace>
  );
}

function DirectDriverParcel({ order, reload }: { order: DirectOrder; reload: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const command = useDirectDeliveryAction(order, async () => {
    await Promise.all([reload(), queryClient.invalidateQueries({ queryKey: ["direct-order", order.id] })]);
  });
  const [confirm, setConfirm] = useState<DirectDeliveryAction>();
  const journey = order.deliveryJourney!;
  const step = steps.find((entry) =>
    command.pending ? entry.action === command.pending : journey.actions.includes(entry.action));
  const inspection = order.state === "Inspection";
  const status = journey.issue ? "Đang xử lý sự cố" : order.deliveredAt ? "Đã giao" :
    journey.outForDeliveryAt ? "Đang giao" : journey.pickedUpAt ? "Đã lấy kiện" : "Chờ lấy kiện";

  return (
    <>
      <DriverParcelCard label="Mã vận đơn (Mua ngay)" trackingCode={journey.trackingCode!}
        summary={order.item.metadata.title} badge={<strong className={styles.feeBadge}>{status}</strong>}>
        <div>
          <DirectDeliveryTimeline order={order} />
          {step && (
            <DriverCompleteAction title={step.label} description={step.description} badge="Demo" delivered={false}
              disabled={command.busy} onClick={() => setConfirm(step.action)} />
          )}
          {inspection && <p className={styles.actionBtnDesc}><PackageCheck size={16} /> Giao thành công. Quay lại đơn để người mua kiểm tra sách.</p>}
        </div>
      </DriverParcelCard>
      {command.error && !confirm && <p role="alert">{command.error}</p>}
      <ConfirmDialog isOpen={!!confirm} onClose={() => !command.busy && setConfirm(undefined)}
        title={step?.label ?? "Cập nhật giao nhận"} description={step?.description ?? "Tiến độ đơn sẽ được cập nhật."}
        confirmText={command.pending ? "Thử lại ghi nhận" : "Ghi nhận mốc giao hàng"} isBusy={command.busy}
        onConfirm={async () => { if (confirm && await command.run(confirm)) setConfirm(undefined); }}>
        {command.error && <p role="alert">{command.error}</p>}
      </ConfirmDialog>
    </>
  );
}
