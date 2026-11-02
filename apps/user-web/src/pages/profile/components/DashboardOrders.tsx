import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Truck, ArrowRight, RefreshCw } from "lucide-react";
import { listOrders, orderStates, orderTime } from "../../../services/orders";
import { DashboardSectionHeading } from "./DashboardSectionHeading";

export function DashboardOrders({ ownerId }: { ownerId: string }) {
  const [tab, setTab] = useState<"Buyer" | "Seller">("Buyer");
  const result = useQuery({
    queryKey: ["overview-orders", ownerId],
    queryFn: () => listOrders(),
  });
  const items = result.data?.items.filter((item) => item.role === tab) ?? [];
  return (
    <section aria-labelledby="overview-orders" className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-lg border border-outline-variant/30">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-surface-container-high/40 pb-space-sm">
        <DashboardSectionHeading id="overview-orders" title="Theo dõi đơn hàng"
          description="Đơn trực tiếp trong danh sách gần đây. Mở chi tiết để xem bước tiếp theo." icon={<Truck size={20} />} />
        <div className="shrink-0 self-start sm:self-center inline-flex flex-wrap p-1 rounded-lg bg-surface-container-high gap-1" role="group" aria-label="Vai trò trong đơn hàng">
          {([['Buyer', 'Đơn mua'], ['Seller', 'Đơn bán']] as const).map(([role, label]) => (
            <button type="button" key={role} aria-pressed={tab === role} onClick={() => setTab(role)}
              className={`px-3 py-2.5 min-h-11 rounded-md text-sm font-semibold transition-colors ${tab === role ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {result.isPending ? <p role="status">Đang tải đơn hàng…</p> : result.isError ? (
        <div role="alert" className="font-body-sm text-body-sm text-on-surface-variant">
          <p>Chưa tải được đơn hàng. Bạn có thể thử lại hoặc mở danh sách đơn.</p>
          <button type="button" onClick={() => void result.refetch()} className="inline-flex items-center gap-2 min-h-11 text-primary underline">
            <RefreshCw size={16} aria-hidden="true" /> Tải lại đơn hàng
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">Chưa có {tab === 'Buyer' ? 'đơn mua' : 'đơn bán'} trong danh sách gần đây.</p>
      ) : (
        <ul className="flex flex-col gap-space-sm">
          {items.slice(0, 3).map((item) => (
            <li key={item.id} className="bg-surface-container-low rounded-xl p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
              <div className="min-w-0 break-words">
                <h3 className="m-0 font-semibold text-primary">{item.title || `Đơn #${item.id.slice(0, 8)}`}</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{orderStates[item.state] ?? item.state} · {orderTime(item.createdAt)}</p>
              </div>
              <Link to={`/orders/${item.id}`} className="inline-flex items-center gap-2 min-h-11 text-primary underline shrink-0">Xem chi tiết đơn <ArrowRight size={16} aria-hidden="true" /></Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/orders" className="inline-flex items-center gap-2 min-h-11 text-primary font-semibold">Xem toàn bộ đơn trực tiếp <ArrowRight size={16} aria-hidden="true" /></Link>
    </section>
  );
}
