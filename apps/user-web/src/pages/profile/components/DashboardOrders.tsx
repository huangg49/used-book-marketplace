export function DashboardOrders() {
  return (
    <>
      {/* 6. ORDERS TIMELINE (ĐƠN HÀNG GẦN NHẤT) */}
      <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-lg h-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">local_shipping</span>
            <h2 className="font-headline-md text-headline-md text-primary">Đơn hàng di sản</h2>
          </div>
          {/* Switcher */}
          <div className="inline-flex p-1 rounded-full border border-surface-container-highest">
            <button className="px-space-md py-1.5 rounded-full text-label-md font-label-md bg-surface-container-lowest text-primary shadow-sm" type="button">
              Mua (1)
            </button>
            <button className="px-space-md py-1.5 rounded-full text-label-md font-label-md text-on-surface-variant hover:text-on-surface" type="button">
              Bán (2)
            </button>
          </div>
        </div>

        {/* Order Header & Metadata */}
        <div className="flex items-center gap-space-md bg-surface-container-low p-space-md rounded-xl border border-surface-container-high/50">
          <div className="w-16 h-12 rounded bg-surface-container-high overflow-hidden flex-shrink-0 shadow-sm">
            <img className="w-full h-full object-cover" data-alt="book" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBUW7exAcbHmQAdVKoB-vbmU8YOiQq10G1-nJfCl4Q4a-mxQNJP7UIRT9eNMgoK-pgjQDUqPjUpmOUKtiTLabq04cwjjpPV47w8wPXanAV5oVUOdqJmaqJdsPrSR6ryclor4BA4RyOknMwynwDziFJjjlsr4dhFOzBZqwJ6AGfziuPn4zvJHXRDScDwOoItda62d81oiqYBU9oQqUnIkZfFssg1SBBYDteAUV4C7B8Fda4ZtokcVR-Pzw" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-label-sm text-label-sm text-secondary font-semibold">#DH-9082</span>
              <span className="text-on-surface-variant">•</span>
              <span className="font-label-sm text-label-sm text-primary">21/10/2023</span>
            </div>
            <h4 className="font-title-md text-title-md text-primary font-semibold truncate max-w-[200px]">
              Hà Nội 36 Phố Phường (1954)
            </h4>
            <span className="font-currency-display text-label-md text-secondary font-bold">
              620.000 ₫
            </span>
          </div>
        </div>

        {/* 5-Step Vertical Timeline */}
        <div className="flex flex-col gap-space-md flex-1">
          <div className="flex items-center justify-between text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
            <span className="font-semibold text-primary">Tiến trình vận chuyển</span>
            <span className="text-secondary">Dự kiến: 24/10</span>
          </div>
          
          {/* Timeline Track */}
          <div className="relative flex flex-col gap-6 ml-2">
            {/* Vertical Line */}
            <div className="absolute left-[11px] top-4 bottom-8 w-[2px] bg-[#e1dccc]"></div>

            {/* Step 1: Done */}
            <div className="relative flex items-start gap-4 z-10">
              <span className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center text-[13px] font-bold ring-4 ring-surface-container-lowest">
                ✓
              </span>
              <div className="flex flex-col -mt-0.5">
                <span className="font-title-md text-title-md text-primary font-medium">Chờ xác nhận • Hoàn tất</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">21/10 - 10:20</span>
              </div>
            </div>

            {/* Step 2: Done */}
            <div className="relative flex items-start gap-4 z-10">
              <span className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center text-[13px] font-bold ring-4 ring-surface-container-lowest">
                ✓
              </span>
              <div className="flex flex-col -mt-0.5">
                <span className="font-title-md text-title-md text-primary font-medium">Đóng gói & Niêm phong thư tịch</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">22/10 - 14:15</span>
              </div>
            </div>

            {/* Step 3: ACTIVE */}
            <div className="relative flex items-start gap-4 z-10">
              <span className="w-6 h-6 rounded-full bg-secondary text-on-secondary flex items-center justify-center text-[13px] font-bold ring-4 ring-surface-container-lowest animate-pulse shrink-0">
                3
              </span>
              <div className="flex flex-col w-full -mt-2 p-3 rounded-xl bg-primary-container text-on-primary shadow-sm relative overflow-hidden">
                <div className="absolute right-2 top-2 px-2 py-0.5 bg-surface-container-highest/20 rounded text-[9px] uppercase tracking-wider font-semibold">
                  GHN Bảo Hiểm
                </div>
                <span className="font-title-md text-title-md text-primary-fixed font-bold mb-1">Đang giao hàng (Hiện tại)</span>
                <span className="font-label-sm text-label-sm text-inverse-primary/80 leading-relaxed pr-16">Đang luân chuyển qua trạm Bưu chính Hà Nội</span>
              </div>
            </div>

            {/* Step 4: Pending */}
            <div className="relative flex items-start gap-4 z-10 opacity-60">
              <span className="w-6 h-6 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center text-[13px] font-medium ring-4 ring-surface-container-lowest">
                4
              </span>
              <div className="flex flex-col -mt-0.5">
                <span className="font-title-md text-title-md text-on-surface-variant font-medium">Nhận & Kiểm tra ấn phẩm</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant/80">Dự kiến 24/10</span>
              </div>
            </div>

            {/* Step 5: Pending */}
            <div className="relative flex items-start gap-4 z-10 opacity-60">
              <span className="w-6 h-6 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center text-[13px] font-medium ring-4 ring-surface-container-lowest">
                5
              </span>
              <div className="flex flex-col -mt-0.5">
                <span className="font-title-md text-title-md text-on-surface-variant font-medium">Quyết toán ví người bán</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant/80">Bảo hộ Escrow 48h an tâm</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions at bottom */}
        <div className="flex items-center justify-between gap-space-sm mt-auto pt-space-md border-t border-surface-container-high/30">
          <button className="flex-1 px-space-md py-2.5 rounded-lg bg-surface-container-low border border-surface-container-high text-primary font-label-md text-label-md hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5" type="button">
            <span className="material-symbols-outlined text-[18px]">chat</span>
            Liên hệ người bán
          </button>
          <button className="flex-1 px-space-md py-2.5 rounded-lg bg-surface-container-low border border-surface-container-high text-on-surface-variant font-label-md text-label-md hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5" type="button">
            <span className="material-symbols-outlined text-[18px]">verified</span>
            Hỗ trợ giám định
          </button>
        </div>
      </section>
    </>
  );
}