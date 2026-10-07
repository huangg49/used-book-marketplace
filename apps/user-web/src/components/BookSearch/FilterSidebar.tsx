import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function FilterAccordion({ title, icon, defaultOpen = true, children }: { title: string, icon: string, defaultOpen?: boolean, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/10 pb-4 relative z-10">
      <div 
        className="flex items-center justify-between cursor-pointer list-none text-title-md text-white py-1 select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex items-center gap-2 text-[#e7e2d8]">
          <span className="material-symbols-outlined text-[18px] text-[#80a794]">{icon}</span>
          {title}
        </span>
        <motion.span 
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="material-symbols-outlined text-white/50"
        >
          expand_more
        </motion.span>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pt-2 pb-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FilterSidebar({ activeFilters = [], toggleFilter = (_f: any) => {} }: any) {
  return (
    <>
      {/*  ================= LEFT COLUMN: DESKTOP ADVANCED FILTER SIDEBAR =================  */}
<aside className="[color-scheme:dark] hidden lg:block w-[280px] xl:w-[300px] shrink-0 sticky top-24 space-y-5 bg-[#00261a] text-white/90 p-space-md rounded-xl border border-white/10 shadow-lg relative overflow-hidden">
  {/* Decorative Gradient Background overlay */}
  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.05)_0%,transparent_100%)] pointer-events-none"></div>

{/*  Sidebar Title Header  */}
<div className="flex items-center justify-between pb-3 border-b border-white/10 relative z-10">
<div className="flex items-center gap-2">
<span className="material-symbols-outlined text-[#a8cfbc] text-[24px] -translate-y-[2px]">tune</span>
<h2 className="text-title-lg text-[#a8cfbc] font-bold tracking-wide">Bộ lọc tuyển chọn</h2>
</div>
<span className="bg-[#a8cfbc] text-[#00261a] text-label-sm px-2 py-0.5 rounded-full font-bold">{activeFilters.length}</span>
</div>

{/*  Filter Section 1: Categories (Accordion/List)  */}
<FilterAccordion title="Chuyên mục thư tịch" icon="auto_stories" defaultOpen={true}>
<div className="mt-1 flex flex-col divide-y divide-[#00261a]/10 p-3 bg-[#c3ecd7] rounded-xl text-body-sm text-[#00261a] shadow-inner">
<label className="flex items-center justify-between cursor-pointer hover:text-[#173c2e] hover:scale-[1.02] origin-left transition-all duration-200 py-2.5 first:pt-1 last:pb-1">
<span className="flex items-center gap-2.5">
<input  className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'cat_tien_chien')} onChange={() => toggleFilter({ id: 'cat_tien_chien', label: 'Thời kỳ: 1930 - 1945', type: 'category' })}/>
<span className="font-medium">Văn học tiền chiến (1930-1945)</span>
</span>
<span className="text-[#00261a]/60 text-xs">48</span>
</label>
<label className="flex items-center justify-between cursor-pointer hover:text-[#173c2e] hover:scale-[1.02] origin-left transition-all duration-200 py-2.5 first:pt-1 last:pb-1">
<span className="flex items-center gap-2.5">
<input className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'cat_tho_ca')} onChange={() => toggleFilter({ id: 'cat_tho_ca', label: 'Thơ ca & Kịch bản xưa', type: 'category' })}/>
<span>Thơ ca &amp; Kịch bản xưa</span>
</span>
<span className="text-[#00261a]/60 text-xs">34</span>
</label>
<label className="flex items-center justify-between cursor-pointer hover:text-[#173c2e] hover:scale-[1.02] origin-left transition-all duration-200 py-2.5 first:pt-1 last:pb-1">
<span className="flex items-center gap-2.5">
<input className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'cat_lich_su')} onChange={() => toggleFilter({ id: 'cat_lich_su', label: 'Lịch sử - Địa chí - Khảo cứu', type: 'category' })}/>
<span>Lịch sử - Địa chí - Khảo cứu</span>
</span>
<span className="text-[#00261a]/60 text-xs">29</span>
</label>
<label className="flex items-center justify-between cursor-pointer hover:text-[#173c2e] hover:scale-[1.02] origin-left transition-all duration-200 py-2.5 first:pt-1 last:pb-1">
<span className="flex items-center gap-2.5">
<input className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'cat_triet_hoc')} onChange={() => toggleFilter({ id: 'cat_triet_hoc', label: 'Triết học & Tư tưởng Đông Phương', type: 'category' })}/>
<span>Triết học &amp; Tư tưởng Đông Phương</span>
</span>
<span className="text-[#00261a]/60 text-xs">17</span>
</label>
<label className="flex items-center justify-between cursor-pointer hover:text-[#173c2e] hover:scale-[1.02] origin-left transition-all duration-200 py-2.5 first:pt-1 last:pb-1">
<span className="flex items-center gap-2.5">
<input className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'cat_sach_dich')} onChange={() => toggleFilter({ id: 'cat_sach_dich', label: 'Sách dịch thời kỳ đầu', type: 'category' })}/>
<span>Sách dịch thời kỳ đầu (Hàn Thuyên, Tao Đàn)</span>
</span>
<span className="text-[#00261a]/60 text-xs">12</span>
</label>
<label className="flex items-center justify-between cursor-pointer hover:text-[#173c2e] hover:scale-[1.02] origin-left transition-all duration-200 py-2.5 first:pt-1 last:pb-1">
<span className="flex items-center gap-2.5">
<input className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'cat_giao_khoa')} onChange={() => toggleFilter({ id: 'cat_giao_khoa', label: 'Sách giáo khoa & Giáo trình Pháp Việt', type: 'category' })}/>
<span>Sách giáo khoa &amp; Giáo trình Pháp Việt</span>
</span>
<span className="text-[#00261a]/60 text-xs">8</span>
</label>
<label className="flex items-center justify-between cursor-pointer hover:text-[#173c2e] hover:scale-[1.02] origin-left transition-all duration-200 py-2.5 first:pt-1 last:pb-1">
<span className="flex items-center gap-2.5">
<input className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'cat_tap_chi')} onChange={() => toggleFilter({ id: 'cat_tap_chi', label: 'Tạp chí Nam Phong, Tri Tân, Phong Hóa', type: 'category' })}/>
<span>Tạp chí Nam Phong, Tri Tân, Phong Hóa</span>
</span>
<span className="text-[#00261a]/60 text-xs">6</span>
</label>
</div>
</FilterAccordion>

{/*  Filter Section 2: Book Condition (Phân cấp bảo quản)  */}
<FilterAccordion title="Tình trạng bảo quản" icon="approval" defaultOpen={true}>
<div className="mt-1 flex flex-col divide-y divide-[#00261a]/10 p-3 bg-[#c3ecd7] rounded-xl text-body-sm text-[#00261a] shadow-inner">
<label className="flex items-center justify-between cursor-pointer hover:text-[#173c2e] hover:scale-[1.02] origin-left transition-all duration-200 py-2.5 first:pt-1 last:pb-1">
<span className="flex items-center gap-2.5">
<input  className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'cond_like_new')} onChange={() => toggleFilter({ id: 'cond_like_new', label: 'Tình trạng: Rất tốt (Like New)', type: 'condition' })}/>
<span className="font-semibold text-[#00261a]">Như mới (Like New · 95-99%)</span>
</span>
<span className="text-xs bg-white/50 px-1.5 py-0.5 rounded text-[#00261a] font-medium">19</span>
</label>
<label className="flex items-center justify-between cursor-pointer hover:text-[#173c2e] hover:scale-[1.02] origin-left transition-all duration-200 py-2.5 first:pt-1 last:pb-1">
<span className="flex items-center gap-2.5">
<input className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'cond_good')} onChange={() => toggleFilter({ id: 'cond_good', label: 'Rất tốt', type: 'condition' })}/>
<span>Rất tốt (Good · 85-90%)</span>
</span>
<span className="text-xs bg-white/30 px-1.5 py-0.5 rounded text-[#00261a]/60">54</span>
</label>
<label className="flex items-center justify-between cursor-pointer hover:text-[#173c2e] hover:scale-[1.02] origin-left transition-all duration-200 py-2.5 first:pt-1 last:pb-1">
<span className="flex items-center gap-2.5">
<input className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'cond_fair')} onChange={() => toggleFilter({ id: 'cond_fair', label: 'Khá', type: 'condition' })}/>
<span>Khá (Fair · 70-80%)</span>
</span>
<span className="text-xs bg-white/30 px-1.5 py-0.5 rounded text-[#00261a]/60">41</span>
</label>
<label className="flex items-center justify-between cursor-pointer hover:text-[#173c2e] hover:scale-[1.02] origin-left transition-all duration-200 py-2.5 first:pt-1 last:pb-1">
<span className="flex items-center gap-2.5">
<input className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'cond_aged')} onChange={() => toggleFilter({ id: 'cond_aged', label: 'Dấu ấn thời gian', type: 'condition' })}/>
<span>Dấu ấn thời gian (Ố vàng / sờn gáy)</span>
</span>
<span className="text-xs bg-white/30 px-1.5 py-0.5 rounded text-[#00261a]/60">28</span>
</label>
</div>
</FilterAccordion>

{/*  Filter Section 3: Price Range Slider & Inputs  */}
<div className="border-b border-white/10 pb-4 relative z-10">
<label className="flex items-center justify-between text-title-md text-[#e7e2d8] py-1">
<span className="flex items-center gap-2">
<span className="material-symbols-outlined text-[18px] text-[#80a794]">payments</span>
              Khoảng giá (VNĐ)
            </span>
</label>
{/*  Slider Track Representation  */}
<div className="mt-3 px-1">
<input className="w-full accent-[#a8cfbc] h-1.5 bg-white/20 rounded cursor-pointer" max="15000000" min="50000" step="50000" type="range" defaultValue="3500000"/>
<div className="flex justify-between text-[11px] text-white/60 mt-1 font-sans">
<span>50.000 đ</span>
<span>15.000.000 đ</span>
</div>
</div>
{/*  Dual Min-Max Inputs  */}
<div className="grid grid-cols-2 gap-2 mt-3">
<div>
<span className="text-[11px] text-white/60 block mb-1">Từ:</span>
<input className="w-full bg-white/5 border border-white/20 rounded px-2.5 py-1 text-xs font-currency-display text-white focus:outline-none focus:border-[#a8cfbc]" type="text" defaultValue="100.000"/>
</div>
<div>
<span className="text-[11px] text-white/60 block mb-1">Đến:</span>
<input className="w-full bg-white/5 border border-white/20 rounded px-2.5 py-1 text-xs font-currency-display text-white focus:outline-none focus:border-[#a8cfbc]" type="text" defaultValue="3.500.000"/>
</div>
</div>
{/*  Quick Price Shortcuts  */}
<div className="flex flex-wrap gap-1.5 mt-2.5">
<button className="text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-[#a8cfbc] hover:text-[#00261a] transition-colors text-white/80">&lt; 200k</button>
<button className="text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-[#a8cfbc] hover:text-[#00261a] transition-colors text-white/80">200k - 500k</button>
<button className="text-[11px] px-2 py-0.5 rounded bg-[#a8cfbc] text-[#00261a] font-semibold">500k - 2tr</button>
<button className="text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-[#a8cfbc] hover:text-[#00261a] transition-colors text-white/80">&gt; 2tr</button>
</div>
</div>

{/*  Filter Section 4: Transaction Mode  */}
<div className="border-b border-white/10 pb-4 relative z-10">
<label className="block text-title-md text-[#e7e2d8] py-1 mb-2.5">
<span className="flex items-center gap-2">
<span className="material-symbols-outlined text-[18px] text-[#80a794]">swap_horizontal_circle</span>
              Hình thức giao dịch
            </span>
</label>
<div className="grid grid-cols-2 gap-2 text-xs">
<label className="flex items-center gap-2 p-2 rounded border border-[#a8cfbc] bg-[#a8cfbc]/10 cursor-pointer">
<input  className="text-[#a8cfbc] focus:ring-[#a8cfbc] accent-[#a8cfbc] w-3.5 h-3.5" name="transMode" type="radio" checked={activeFilters.some((f: any) => f.id === 'trans_direct')} onChange={() => toggleFilter({ id: 'trans_direct', label: 'Giao dịch: Bán trực tiếp', type: 'transaction' })}/>
<span className="font-medium text-[#a8cfbc]">Bán trực tiếp</span>
</label>
<label className="flex items-center gap-2 p-2 rounded border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
<input className="text-[#a8cfbc] focus:ring-[#a8cfbc] accent-[#a8cfbc] w-3.5 h-3.5" name="transMode" type="radio" checked={activeFilters.some((f: any) => f.id === 'trans_exchange')} onChange={() => toggleFilter({ id: 'trans_exchange', label: 'Giao dịch: Đổi Lật-Xu', type: 'transaction' })}/>
<span className="text-[#cfc5b6]">Đổi Lật-Xu</span>
</label>
<label className="flex items-center gap-2 p-2 rounded border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
<input className="text-[#a8cfbc] focus:ring-[#a8cfbc] accent-[#a8cfbc] w-3.5 h-3.5" name="transMode" type="radio" checked={activeFilters.some((f: any) => f.id === 'trans_both')} onChange={() => toggleFilter({ id: 'trans_both', label: 'Giao dịch: Cả hai cách', type: 'transaction' })}/>
<span className="text-[#cfc5b6]">Cả hai cách</span>
</label>
<label className="flex items-center gap-2 p-2 rounded border border-[#ffb4a2]/40 bg-[#ffb4a2]/10 hover:bg-[#ffb4a2]/20 cursor-pointer transition-colors">
<input className="text-[#ffb4a2] focus:ring-[#ffb4a2] accent-[#ffb4a2] w-3.5 h-3.5" name="transMode" type="radio" checked={activeFilters.some((f: any) => f.id === 'trans_auction')} onChange={() => toggleFilter({ id: 'trans_auction', label: 'Giao dịch: Đấu giá', type: 'transaction' })}/>
<span className="font-medium text-[#ffb4a2]">Đấu giá</span>
</label>
</div>
</div>

{/*  Filter Section 5: Provenance & Collector Attributes  */}
<div className="border-b border-white/10 pb-4 relative z-10">
<label className="block text-title-md text-[#e7e2d8] py-1 mb-2">
<span className="flex items-center gap-2">
<span className="material-symbols-outlined text-[18px] text-[#80a794]">verified</span>
              Đặc tính sưu tầm di sản
            </span>
</label>
<div className="space-y-2.5 text-xs text-[#cfc5b6]">
<label className="flex items-center justify-between cursor-pointer hover:text-white transition-colors">
<div className="flex items-center gap-2">
<input  className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'attr_rare')} onChange={() => toggleFilter({ id: 'attr_rare', label: 'Sách hiếm: Có thẩm định', type: 'attribute', icon: 'verified' })}/>
<span>Sách hiếm &amp; Bản in đầu</span>
</div>
<span className="material-symbols-outlined text-[#ffb4a2] text-[16px]">stars</span>
</label>
<label className="flex items-center justify-between cursor-pointer hover:text-white transition-colors">
<div className="flex items-center gap-2">
<input  className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'attr_signed')} onChange={() => toggleFilter({ id: 'attr_signed', label: 'Có thủ bút / Chữ ký', type: 'attribute', icon: 'history_edu' })}/>
<span>Thủ bút / Chữ ký tác giả</span>
</div>
<span className="material-symbols-outlined text-[#a8cfbc] text-[16px]">edit_note</span>
</label>
<label className="flex items-center justify-between cursor-pointer hover:text-white transition-colors">
<div className="flex items-center gap-2">
<input className="rounded border-[#00261a]/20 bg-white/50 text-[#00261a] focus:ring-[#00261a] w-4 h-4 accent-[#00261a]" type="checkbox" checked={activeFilters.some((f: any) => f.id === 'attr_exlibris')} onChange={() => toggleFilter({ id: 'attr_exlibris', label: 'Dấu mộc thư viện / Ex-Libris cổ', type: 'attribute', icon: 'bookmark_heart' })}/>
<span>Dấu mộc thư viện / Ex-Libris cổ</span>
</div>
<span className="material-symbols-outlined text-white/40 text-[16px]">bookmark_heart</span>
</label>
</div>
</div>

{/*  Filter Section 6: Publication Era  */}
<div className="relative z-10">
<label className="block text-title-md text-[#e7e2d8] py-1 mb-2">
<span className="flex items-center gap-2">
<span className="material-symbols-outlined text-[18px] text-[#80a794]">hourglass_empty</span>
              Thời kỳ ấn hành
            </span>
</label>
<div className="grid grid-cols-2 gap-2 text-xs">
<button className={`px-2 py-1.5 rounded border text-center transition-colors ${activeFilters.some((f: any) => f.id === 'era_pre1945') ? 'border-[#a8cfbc] bg-[#a8cfbc] text-[#00261a] font-bold' : 'border-white/20 bg-white/5 text-white hover:bg-white/10'}`} onClick={() => toggleFilter({ id: 'era_pre1945', label: 'Thời kỳ: Trước 1945', type: 'category' })}>Trước 1945</button>
<button className={`px-2 py-1.5 rounded border text-center transition-colors ${activeFilters.some((f: any) => f.id === 'era_1945_1954') ? 'border-[#a8cfbc] bg-[#a8cfbc] text-[#00261a] font-bold' : 'border-white/20 bg-white/5 text-white hover:bg-white/10'}`} onClick={() => toggleFilter({ id: 'era_1945_1954', label: 'Thời kỳ: 1945 - 1954', type: 'category' })}>1945 - 1954</button>
<button className={`px-2 py-1.5 rounded border text-center transition-colors ${activeFilters.some((f: any) => f.id === 'era_1954_1975') ? 'border-[#a8cfbc] bg-[#a8cfbc] text-[#00261a] font-bold' : 'border-white/20 bg-white/5 text-white hover:bg-white/10'}`} onClick={() => toggleFilter({ id: 'era_1954_1975', label: 'Thời kỳ: 1954 - 1975', type: 'category' })}>1954 - 1975</button>
<button className={`px-2 py-1.5 rounded border text-center transition-colors ${activeFilters.some((f: any) => f.id === 'era_post1975') ? 'border-[#a8cfbc] bg-[#a8cfbc] text-[#00261a] font-bold' : 'border-white/20 bg-white/5 text-white hover:bg-white/10'}`} onClick={() => toggleFilter({ id: 'era_post1975', label: 'Thời kỳ: Sau 1975', type: 'category' })}>Sau 1975</button>
</div>
</div>

{/*  Reset Button  */}
<button className="w-full py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 text-title-md rounded-lg transition-colors flex items-center justify-center gap-1.5 mt-5 relative z-10">
<span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
          Đặt lại bộ lọc mặc định
        </button>
</aside>
    </>
  );
}
