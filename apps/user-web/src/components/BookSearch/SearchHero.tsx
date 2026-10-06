import { motion } from 'framer-motion';

export function SearchHero({ activeFilters = [], removeFilter = (_id: string) => {}, clearAllFilters = () => {} }: any) {
  
  return (
    <>
      {/*  SEARCH HERO BANNER (ARCHIVAL WORKSHOP AESTHETIC)  */}
      <motion.section 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full bg-[#00261a] text-white border-b border-white/10 pt-[88px] pb-space-md px-space-md lg:px-space-lg relative overflow-hidden"
      >
      {/*  Atmospheric archival background tint and subtle graphic accent  */}
<div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-[#a8cfbc]/10 blur-3xl pointer-events-none"></div>
<div className="absolute -left-20 bottom-0 w-80 h-80 rounded-full bg-[#c3ecd7]/10 blur-2xl pointer-events-none"></div>
<div className="w-full flex flex-col gap-space-md relative z-10">

{/*  Main Headline Prompt  */}
<div className="flex flex-col md:flex-row md:items-end justify-between gap-2">
<div>
<span className="font-label-sm text-[10px] tracking-widest uppercase text-[#a8cfbc] font-semibold">Văn khố & Hiệu sách di sản</span>
<h1 className="font-headline-md text-headline-md text-white mt-1 font-bold tracking-tight">Tìm kiếm thư tịch & Sách xưa</h1>
</div>
<p className="font-body-sm text-xs text-[#cfc5b6] max-w-sm">
          Tra cứu hơn 12.800 ấn phẩm trước 1975, bản in đầu, có thủ bút và các bộ sưu tập văn chương Việt Nam thế kỷ XX.
        </p>
</div>
{/*  Primary Search Input Cluster  */}
<div className="mt-2 w-full">
<div className="bg-[#00261a] border border-[#a8cfbc]/30 rounded-xl p-2 shadow-sm flex flex-col sm:flex-row items-center gap-2 focus-within:border-[#a8cfbc] focus-within:ring-2 focus-within:ring-[#a8cfbc]/30 transition-all">
<div className="flex items-center gap-2 w-full px-2">
<span className="material-symbols-outlined text-[#a8cfbc] text-[22px]">search</span>
<input className="w-full bg-transparent border-none text-white placeholder:text-[#a8cfbc]/60 font-body-md text-body-md focus:ring-0 focus:outline-none py-1.5" id="mainSearchInput" placeholder="Tìm theo tên tác phẩm, tác giả, nhà in xưa hoặc mã số ISBN..." type="text" value="Văn học tuyển chọn"/>
<button className="text-[#a8cfbc]/60 hover:text-[#a8cfbc] p-1 rounded-full transition-colors" onClick={() => { const input = document.getElementById('mainSearchInput') as HTMLInputElement; if (input) { input.value = ''; input.focus(); } }} title="Xóa từ khóa">
<span className="material-symbols-outlined text-[18px]">cancel</span>
</button>
</div>
<div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 sm:border-l border-[#a8cfbc]/30 pt-2 sm:pt-0 sm:pl-3">
{/*  ISBN Quick Scan Button  */}
<button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#173c2e] hover:bg-[#a8cfbc]/20 text-[#a8cfbc] font-label-md text-label-md transition-colors whitespace-nowrap" title="Quét hoặc nhập mã số ISBN lưu trữ" type="button">
<span className="material-symbols-outlined text-[18px] text-[#a8cfbc]">barcode_scanner</span>
<span>Quét ISBN</span>
</button>
{/*  Search Action Submit  */}
<button className="flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg bg-[#a8cfbc] hover:bg-[#c3ecd7] text-[#00261a] font-title-md text-title-md transition-colors shadow-sm whitespace-nowrap" type="button">
<span>Tìm kiếm</span>
<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
</button>
</div>
</div>
{/*  Hot Keyword Chips Suggestions  */}
<div className="flex flex-wrap items-center gap-2 mt-3 pt-1 text-xs">
<span className="text-[#a8cfbc] font-label-sm text-label-sm font-medium flex items-center gap-1">
<span className="material-symbols-outlined text-[15px] text-[#ffb4a2]">local_fire_department</span>
            Xu hướng tìm kiếm:
          </span>
<button className="bg-[#173c2e] px-2.5 py-1 rounded-full text-[#cfc5b6] hover:text-white hover:bg-[#a8cfbc]/20 transition-colors">Tự Lực Văn Đoàn</button>
<button className="bg-[#173c2e] px-2.5 py-1 rounded-full text-[#cfc5b6] hover:text-white hover:bg-[#a8cfbc]/20 transition-colors">Kim Vân Kiều</button>
<button className="bg-[#173c2e] px-2.5 py-1 rounded-full text-[#cfc5b6] hover:text-white hover:bg-[#a8cfbc]/20 transition-colors">Vũ Trọng Phụng</button>
<button className="bg-[#173c2e] px-2.5 py-1 rounded-full text-[#cfc5b6] hover:text-white hover:bg-[#a8cfbc]/20 transition-colors">Sách in trước 1975</button>
<button className="bg-[#173c2e] px-2.5 py-1 rounded-full text-[#cfc5b6] hover:text-white hover:bg-[#a8cfbc]/20 transition-colors">Bản có chữ ký tác giả</button>
<button className="bg-[#173c2e] px-2.5 py-1 rounded-full text-[#cfc5b6] hover:text-white hover:bg-[#a8cfbc]/20 transition-colors">Hàn Mặc Tử</button>
</div>
</div>
</div>
</motion.section>
{/*  APPLIED FILTER PILLS / CHIP STRIP  */}
{activeFilters.length > 0 && (
<section className="w-full bg-[#00261a] border-b border-white/10 py-2.5 px-space-md lg:px-space-lg sticky top-[72px] z-40 shadow-md">
<div className="w-full flex flex-wrap items-center justify-between gap-3">
<div className="flex flex-wrap items-center gap-2">
<span className="font-label-sm text-label-sm text-[#a8cfbc] uppercase tracking-wider font-semibold mr-1">Bộ lọc đang bật ({activeFilters.length}):</span>

            {activeFilters.map((filter: any) => {
              if (filter.type === 'attribute') {
                return (
                  <div key={filter.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${filter.icon === 'verified' ? 'bg-[#c3ecd7] text-[#00261a] border-[#a8cfbc]' : 'bg-secondary-fixed/50 text-on-secondary-fixed-variant border-secondary-fixed'} border text-xs font-body-sm font-medium`}>
                    {filter.icon && <span className={`material-symbols-outlined text-[14px] ${filter.icon === 'verified' ? 'text-primary' : 'text-secondary'}`}>{filter.icon}</span>}
                    <span><strong>{filter.label}</strong></span>
                    <button onClick={() => removeFilter(filter.id)} className={`flex items-center ${filter.icon === 'verified' ? 'text-[#00261a]/60 hover:text-[#00261a]' : 'text-secondary hover:text-on-secondary-fixed'}`} title="Bỏ lọc">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                );
              }
              return (
                <div key={filter.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#173c2e] text-white border border-[#a8cfbc]/30 text-xs font-body-sm font-medium">
                  <span dangerouslySetInnerHTML={{ __html: filter.label.replace(/: (.*)/, ': <strong>$1</strong>') }} />
                  <button onClick={() => removeFilter(filter.id)} className="text-[#a8cfbc]/60 hover:text-[#a8cfbc] flex items-center" title="Bỏ lọc">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              );
            })}
            </div>
  {/*  Clear All Trigger  */}
<button onClick={clearAllFilters} className="text-secondary hover:underline font-label-sm text-label-sm font-semibold flex items-center gap-1 ml-auto">
<span className="material-symbols-outlined text-[16px]">restart_alt</span>
        Xóa tất cả bộ lọc
      </button>
</div>
</section>
)}
{/*  MOBILE BAR FOR QUICK FILTER DRAWER OPEN + SORT  */}
<div className="lg:hidden sticky top-[61px] z-40 bg-surface border-b border-outline-variant px-space-md py-2.5 flex items-center justify-between gap-2 shadow-sm">
<button className="flex-1 flex items-center justify-center gap-2 bg-primary-container text-on-primary py-2 px-3 rounded-lg font-title-md text-title-md active:scale-95 transition-transform" id="openMobileFilterBtn">
<span className="material-symbols-outlined text-[18px]">tune</span>
<span>Bộ lọc nâng cao (5)</span>
</button>
<div className="relative">
<select className="appearance-none bg-surface-container border border-outline-variant rounded-lg text-xs font-body-sm py-2 pl-3 pr-8 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary">
<option>Mới lên kệ nhất</option>
<option>Giá: Thấp đến Cao</option>
<option>Giá: Cao đến Thấp</option>
<option>Năm ấn hành: Cổ nhất</option>
<option>Yêu thích nhất</option>
</select>
<span className="material-symbols-outlined absolute right-2 top-2.5 text-[16px] pointer-events-none text-outline">expand_more</span>
</div>
</div>

    </>
  );
}