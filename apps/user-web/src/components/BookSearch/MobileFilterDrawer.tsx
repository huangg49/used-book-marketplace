export function MobileFilterDrawer() {
  return (
    <>
      {/*  ================= MOBILE FILTER BOTTOM DRAWER (SHEET) =================  */}
<div className="fixed inset-0 z-50 transform translate-y-full transition-transform duration-300 ease-in-out pointer-events-none lg:hidden" id="mobileFilterDrawer">
{/*  Scrim / Backdrop  */}
<div className="absolute inset-0 bg-primary/40 backdrop-blur-xs opacity-0 transition-opacity duration-300" id="drawerOverlay"></div>
{/*  Sheet Panel Container  */}
<div className="absolute bottom-0 inset-x-0 max-h-[88vh] bg-surface rounded-t-2xl flex flex-col shadow-2xl overflow-hidden pointer-events-auto border-t border-outline-variant">
{/*  Drawer Header Handle & Title  */}
<div className="px-space-md pt-3 pb-2.5 border-b border-outline-variant bg-surface-container flex items-center justify-between">
<div className="flex items-center gap-2">
<span className="material-symbols-outlined text-primary text-[20px]">tune</span>
<span className="font-title-lg text-title-lg text-primary font-bold">Bộ lọc tuyển chọn (5)</span>
</div>
<button className="p-1 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors" id="closeMobileFilterBtn">
<span className="material-symbols-outlined text-[22px]">close</span>
</button>
</div>
{/*  Scrollable Drawer Body with filters  */}
<div className="overflow-y-auto p-space-md space-y-4 flex-grow font-body-sm text-body-sm">
{/*  Category in Mobile  */}
<div>
<span className="font-title-md text-title-md text-primary font-semibold block mb-2">Chuyên mục</span>
<div className="space-y-1.5 pl-1">
<label className="flex items-center gap-2 text-on-surface">
<input defaultChecked className="rounded text-primary focus:ring-primary" type="checkbox"/>
<span>Văn học tiền chiến (1930-1945) (48)</span>
</label>
<label className="flex items-center gap-2 text-on-surface">
<input className="rounded text-primary focus:ring-primary" type="checkbox"/>
<span>Thơ ca &amp; Kịch bản xưa (34)</span>
</label>
<label className="flex items-center gap-2 text-on-surface">
<input className="rounded text-primary focus:ring-primary" type="checkbox"/>
<span>Lịch sử - Địa chí - Khảo cứu (29)</span>
</label>
</div>
</div>
{/*  Condition in Mobile  */}
<div className="border-t border-outline-variant pt-3">
<span className="font-title-md text-title-md text-primary font-semibold block mb-2">Tình trạng</span>
<div className="grid grid-cols-2 gap-2 text-xs">
<label className="flex items-center gap-1.5 p-2 rounded bg-surface-container border border-primary text-primary">
<input defaultChecked className="rounded text-primary" type="checkbox"/>
<span className="font-medium">Như mới (95-99%)</span>
</label>
<label className="flex items-center gap-1.5 p-2 rounded bg-surface-container-low border border-outline-variant text-on-surface">
<input className="rounded text-primary" type="checkbox"/>
<span>Rất tốt (85-90%)</span>
</label>
</div>
</div>
{/*  Price Range in Mobile  */}
<div className="border-t border-outline-variant pt-3">
<span className="font-title-md text-title-md text-primary font-semibold block mb-1">Khoảng giá tối đa</span>
<input className="w-full accent-primary" max="15000000" min="50000" step="50000" type="range" value="3500000"/>
<div className="flex justify-between text-xs text-outline mt-1 font-currency-display">
<span>100.000 đ</span>
<span>3.500.000 đ</span>
</div>
</div>
{/*  Collector Features in Mobile  */}
<div className="border-t border-outline-variant pt-3 space-y-2">
<span className="font-title-md text-title-md text-primary font-semibold block">Đặc tính</span>
<label className="flex items-center gap-2">
<input defaultChecked className="rounded text-primary" type="checkbox"/>
<span>Có giám định sách hiếm</span>
</label>
<label className="flex items-center gap-2">
<input defaultChecked className="rounded text-primary" type="checkbox"/>
<span>Có chữ ký / Thủ bút tác giả</span>
</label>
</div>
</div>
{/*  Drawer Action Footer  */}
<div className="p-space-md bg-surface-container border-t border-outline-variant flex items-center gap-2">
<button className="flex-1 py-2 text-center text-xs font-title-md text-on-surface-variant hover:text-secondary" id="resetMobileFilterBtn">
          Xóa tất cả
        </button>
<button className="flex-2 py-2 px-6 bg-primary text-on-primary rounded-lg font-title-md text-title-md shadow-md text-center" id="applyMobileFilterBtn">
          Áp dụng (142 sách)
        </button>
</div>
</div>
</div>

    </>
  );
}