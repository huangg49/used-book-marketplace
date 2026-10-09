export function DashboardLiveAuctions() {
  return (
    <>
      {/*  4. AUCTION LIVE ACTIVITY with PROMINENT OUTBID ALERT  */}
<section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-lg">
<div className="flex flex-col items-center justify-center text-center gap-2 relative">
<div className="flex items-center justify-center gap-space-sm">
<span className="material-symbols-outlined text-secondary text-[28px]">gavel</span>
<h2 className="font-headline-md text-headline-md text-primary tracking-tight">
            Phiên đấu giá đang tham gia (2 phiên)
          </h2>
</div>
<span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Cập nhật trực tiếp</span>
</div>
<div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
{/*  CARD 1: CRITICAL OUTBID ALERT (Terracotta Theme)  */}
<div className="relative bg-surface-container-low rounded-xl shadow-md overflow-hidden flex flex-col justify-between border border-surface-container-high/30">
{/*  Top Terracotta Pulsating Outbid Header  */}
<div className="bg-secondary text-on-secondary px-space-md py-3 flex items-center justify-between">
<div className="flex items-center gap-2">
<span className="relative flex h-3 w-3">
<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-on-secondary opacity-75"></span>
<span className="relative inline-flex rounded-full h-3 w-3 bg-on-secondary"></span>
</span>
<span className="font-label-md text-label-md uppercase tracking-wider font-bold">
                Cảnh báo: Bạn đã bị trả giá cao hơn!
              </span>
</div>
<span className="font-label-sm text-label-sm bg-on-secondary/20 text-on-secondary px-2 py-0.5 rounded font-mono">
              OUTBID ALERT
            </span>
</div>
<div className="p-space-lg flex flex-col md:flex-row gap-space-md items-start">
{/*  Book Cover Thumbnail (3:4 ratio)  */}
<div className="w-24 sm:w-28 aspect-[3/4] flex-shrink-0 rounded bg-surface-container-high overflow-hidden shadow-sm relative">
<img className="w-full h-full object-cover" data-alt="Antique Vietnamese literary book cover of Vang Bong Mot Thoi published in 1941 by Tan Dan. Vintage aged typography, textured handmade brownish parchment paper, weathered binding spine with delicate gold embossed Vietnamese calligraphy, subtle bookshop ex-libris stamp." src="https://lh3.googleusercontent.com/aida-public/AB6AXuAALX_uHkB-T_CxP7985RvKXy_1WiMuhHU0pT1P9x8SXdSFL_ABJHNn976PGTKvrVw0As2CfSGZJH4S9nSMAREzuKAj3_jTfhXev5uIxQRhstjXL3zOOhH3p1oKK48WwFb6w7Ki4QWPY-7IIHEwkrJMLA2R_gr7EEf_ONdEEZssyESRGUQl1Etwp-nR5RLYJ-U80LHFe7ilVgDo1nQ3P5o_MU7JGFjh8dhqpI-ziBczKE9p3LC6mRsD8w" />
<span className="absolute top-1 left-1 bg-primary/80 backdrop-blur-sm text-on-primary font-label-sm text-[10px] px-1 rounded">1941</span>
</div>
<div className="flex flex-col gap-space-xs flex-1 min-w-0">
<div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
<span className="">Nguyễn Tuân</span>
<span className="">•</span>
<span className="text-secondary font-medium">Bản in thầu Tân Dân 1941</span>
</div>
<h3 className="font-title-lg text-title-lg text-primary line-clamp-2 leading-snug">
                Vang Bóng Một Thời (Có thủ bút Vũ Ngọc Phan)
              </h3>
<div className="mt-2 grid grid-cols-2 gap-space-sm p-space-sm bg-surface-container-low rounded">
<div>
<span className="font-label-sm text-label-sm text-on-surface-variant block">Giá cao nhất hiện tại</span>
<span className="font-currency-display text-currency-display text-secondary font-bold">4.200.000 ₫</span>
<span className="font-label-sm text-[11px] text-on-surface-variant block mt-0.5">bởi #HN-921</span>
</div>
<div>
<span className="font-label-sm text-label-sm text-on-surface-variant block">Giá bạn đã đặt trước đó</span>
<span className="font-currency-display text-currency-display text-on-surface-variant line-through">3.900.000 ₫</span>
<span className="font-label-sm text-[11px] text-secondary font-semibold block mt-0.5">-300.000 ₫</span>
</div>
</div>
<div className="mt-2 flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm">
<div className="flex items-center gap-1.5 font-mono text-secondary font-semibold">
<span className="material-symbols-outlined text-[18px]">timer</span>
<span className="">Còn lại: 03h : 24m</span>
</div>
<a className="font-label-md text-label-md text-primary underline hover:text-secondary" href="#">
                  Xem nhật ký đặt giá (19)
                </a>
</div>
</div>
</div>
{/*  Bottom Action Area  */}
<div className="px-space-lg pb-space-lg pt-space-xs flex items-center gap-space-sm">
<button className="w-full py-2.5 px-space-md rounded bg-secondary text-on-secondary font-title-md text-title-md hover:bg-on-secondary-container transition-colors shadow-sm flex items-center justify-center gap-1.5" type="button">
<span className="material-symbols-outlined text-[18px]">upgrade</span>
<span className="">Ra giá lại ngay (Tối thiểu 4.300.000 ₫)</span>
</button>
</div>
</div>
{/*  CARD 2: WINNING BID CARD (Deep Forest Green Theme)  */}
<div className="relative bg-surface-container-low rounded-xl shadow-md overflow-hidden flex flex-col justify-between border border-surface-container-high/30">
{/*  Top Forest Green Status Header  */}
<div className="bg-primary-container text-on-primary px-space-md py-3 flex items-center justify-between">
<div className="flex items-center gap-2">
<span className="w-2.5 h-2.5 rounded-full bg-primary-fixed inline-block"></span>
<span className="font-label-md text-label-md uppercase tracking-wider font-semibold">
                Bạn đang dẫn đầu phiên đấu giá
              </span>
</div>
<span className="font-label-sm text-label-sm bg-on-primary/20 text-on-primary px-2 py-0.5 rounded font-mono">
              LEADING BID
            </span>
</div>
<div className="p-space-lg flex flex-col md:flex-row gap-space-md items-start">
{/*  Book Cover Thumbnail  */}
<div className="w-24 sm:w-28 aspect-[3/4] flex-shrink-0 rounded bg-surface-container-high overflow-hidden shadow-sm relative">
<img className="w-full h-full object-cover" data-alt="First edition Vietnamese book cover of So Do by Vu Trong Phung published in 1938 by Le Cuong. Antiquarian woodblock printed book spine, deep green natural patina, fragile antique paper with deckled edges and vintage publisher seal." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDpbWVrn_VVIkSJzkXywwuwkdLvU_OTpSpxqJB6wfl0ADecsbmqsmf8FbUBN_kprZrWMYagGoPB96yV4M2ERV3hfLjUOViwO1ML6LpD8st4wzrvWpLTf92f_GAlnyTbdqh3nqBPLdHRXOns4ra0b6efuFsCaSDnJZHFoYGgEEeqyCImVdrOU50FOGR-6QzMHo9yKNbUq03s47yrJ5MT_JLhSMR8wf8_EEZ8hrjWMUmULh4jSBFSi_fA9g" />
<span className="absolute top-1 left-1 bg-primary/80 backdrop-blur-sm text-on-primary font-label-sm text-[10px] px-1 rounded">1938</span>
</div>
<div className="flex flex-col gap-space-xs flex-1 min-w-0">
<div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
<span className="">Vũ Trọng Phụng</span>
<span className="">•</span>
<span className="text-primary font-medium">Bản in 1938 Lê Cường, Mộc bản</span>
</div>
<h3 className="font-title-lg text-title-lg text-primary line-clamp-2 leading-snug">
                Số Đỏ (Ấn bản lưu chiểu đặc biệt)
              </h3>
<div className="mt-2 grid grid-cols-2 gap-space-sm p-space-sm bg-surface-container-low rounded">
<div>
<span className="font-label-sm text-label-sm text-on-surface-variant block">Mức giá bạn đang giữ</span>
<span className="font-currency-display text-currency-display text-primary font-bold">4.850.000 ₫</span>
<span className="font-label-sm text-[11px] text-primary-fixed-variant block mt-0.5">Đặt lúc 09:15 hôm nay</span>
</div>
<div>
<span className="font-label-sm text-label-sm text-on-surface-variant block">Giá dự bị kế cận</span>
<span className="font-currency-display text-currency-display text-on-surface-variant">4.600.000 ₫</span>
<span className="font-label-sm text-[11px] text-on-surface-variant block mt-0.5">bởi #SG-404</span>
</div>
</div>
<div className="mt-2 flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm">
<div className="flex items-center gap-1.5 font-mono text-primary font-semibold">
<span className="material-symbols-outlined text-[18px]">hourglass_top</span>
<span className="">Còn lại: 18h : 45m</span>
</div>
<a className="font-label-md text-label-md text-primary underline hover:text-secondary" href="#">
                  Lịch sử 28 lượt đặt
                </a>
</div>
</div>
</div>
{/*  Bottom Action Area  */}
<div className="px-space-lg pb-space-lg pt-space-xs flex items-center gap-space-sm">
<button className="w-full py-2.5 px-space-md rounded bg-surface-container-high text-primary font-title-md text-title-md hover:bg-surface-dim transition-colors flex items-center justify-center gap-1.5" type="button">
<span className="material-symbols-outlined text-[18px]">notifications_active</span>
<span className="">Cài đặt thông báo tự động trả giá</span>
</button>
</div>
</div>
</div>
</section>
    </>
  );
}