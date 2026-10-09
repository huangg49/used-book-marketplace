export function DashboardStats() {
  return (
    <>
      {/*  2. TOP STATISTIC CARDS (4 cards)  */}
<section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
{/*  Card 1: Khả dụng  */}
<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full relative overflow-hidden group hover:shadow-md transition-shadow">
<div className="flex items-start justify-between gap-space-sm">
<div className="flex flex-col gap-1">
<span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Số dư khả dụng</span>
<span className="font-currency-display text-headline-md text-primary font-headline-md tracking-tight">14.850.000 ₫</span>
</div>
<div className="w-10 h-10 rounded bg-surface-container-high flex items-center justify-center text-primary flex-shrink-0">
<span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
</div>
</div>
<div className="pt-space-md mt-space-md flex items-center justify-between">
<div className="flex items-center gap-1.5 text-secondary">
<span className="material-symbols-outlined text-[16px]">toll</span>
<span className="font-label-md text-label-md font-semibold">+420 Lật-Xu</span>
</div>
<span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-primary-container bg-surface-container-high px-2 py-0.5 rounded">
<span className="material-symbols-outlined text-[13px]">trending_up</span>
            +12.5% tháng này
          </span>
</div>
</div>
{/*  Card 2: Escrow  */}
<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full group hover:shadow-md transition-shadow">
<div className="flex items-start justify-between gap-space-sm">
<div className="flex flex-col gap-1">
<span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Tạm giữ (Escrow bảo chứng)</span>
<span className="font-currency-display text-headline-md text-primary font-headline-md tracking-tight">5.300.000 ₫</span>
</div>
<div className="w-10 h-10 rounded bg-surface-container-high flex items-center justify-center text-secondary flex-shrink-0">
<span className="material-symbols-outlined text-[20px]">verified_user</span>
</div>
</div>
<div className="pt-space-md mt-space-md flex items-center gap-1.5 text-on-surface-variant font-body-sm text-body-sm">
<span className="material-symbols-outlined text-[16px] text-primary">lock_clock</span>
<span className="">Bảo lưu 2 giao dịch thẩm định an toàn</span>
</div>
</div>
{/*  Card 3: Giá trị kệ sách  */}
<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full group hover:shadow-md transition-shadow">
<div className="flex items-start justify-between gap-space-sm">
<div className="flex flex-col gap-1">
<span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Giá trị kệ sách</span>
<span className="font-currency-display text-headline-md text-primary font-headline-md tracking-tight">68.400.000 ₫</span>
</div>
<div className="w-10 h-10 rounded bg-surface-container-high flex items-center justify-center text-primary flex-shrink-0">
<span className="material-symbols-outlined text-[20px]">shelves</span>
</div>
</div>
<div className="pt-space-md mt-space-md flex items-center justify-between">
<span className="font-body-sm text-body-sm text-on-surface-variant">34 ấn phẩm lưu trữ</span>
<span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary bg-surface-container-high px-2 py-0.5 rounded">
<span className="material-symbols-outlined text-[13px]">auto_awesome</span>
            Lật Lại AI định giá
          </span>
</div>
</div>
{/*  Card 4: Đơn đang xử lý  */}
<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full group hover:shadow-md transition-shadow">
<div className="flex items-start justify-between gap-space-sm">
<div className="flex flex-col gap-1">
<span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Đơn đang xử lý</span>
<span className="font-currency-display text-headline-md text-secondary font-headline-md tracking-tight">3 đơn hàng</span>
</div>
<div className="w-10 h-10 rounded bg-surface-container-high flex items-center justify-center text-on-surface-variant flex-shrink-0">
<span className="material-symbols-outlined text-[20px]">local_shipping</span>
</div>
</div>
<div className="pt-space-md mt-space-md flex items-center gap-1 text-on-surface-variant font-body-sm text-body-sm">
<span className="w-2 h-2 rounded-full bg-secondary inline-block"></span>
<span className="">1 mua đang giao • 2 bán chờ kiểm duyệt</span>
</div>
</div>
</section>
    </>
  );
}