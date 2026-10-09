export function DashboardGreeting() {
  return (
    <>
      {/*  1. EDITORIAL GREETING & HEADER PANEL  */}
<section className="relative bg-surface-container-low rounded-xl p-space-xl overflow-hidden shadow-sm">
      <div 
        className="absolute right-0 top-0 bottom-0 w-[70%] pointer-events-none mix-blend-multiply opacity-60"
        style={{
          backgroundImage: 'url(/bg-greeting.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'right center',
          backgroundRepeat: 'no-repeat',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 40%)',
          maskImage: 'linear-gradient(to right, transparent, black 40%)'
        }}
      ></div>
<div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">
<div className="flex flex-col gap-space-xs max-w-3xl">
<div className="flex items-center gap-space-sm flex-wrap">
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-high text-primary font-label-sm text-label-sm uppercase tracking-wider">
<span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: '"FILL" 1' }}>verified</span>
              Hội viên Lưu khố Kì hạn Bạc
            </span>
<span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-high text-secondary font-label-sm text-label-sm uppercase tracking-wider">
<span className="material-symbols-outlined text-[15px]">military_tech</span>
              Điểm Tín Thư: 98/100
            </span>
</div>
<h1 className="font-headline-xl text-headline-xl text-primary tracking-tight mt-1">
            Chào mừng trở lại, Thư tịch viên Trần Hoàng Minh
          </h1>
<p className="font-body-md text-body-md text-on-surface-variant">
            Lưu khố cá nhân hiện đang vận hành ổn định. Các giao dịch ủy thác và hồ sơ đấu giá hôm nay được cập nhật theo thời gian thực.
          </p>
</div>
{/*  Quick Action CTAs  */}
<div className="flex items-center gap-space-sm flex-shrink-0">
<button className="inline-flex items-center gap-space-xs px-space-md py-2.5 rounded bg-secondary text-on-secondary font-title-md text-title-md hover:bg-on-secondary-container transition-colors shadow-sm" type="button">
<span className="material-symbols-outlined text-[18px]">add</span>
<span className="">+ Đăng sách mới</span>
</button>
<button className="inline-flex items-center gap-space-xs px-space-md py-2.5 rounded bg-surface-container-highest text-primary font-title-md text-title-md hover:bg-surface-dim transition-colors" type="button">
<span className="material-symbols-outlined text-[18px]">currency_exchange</span>
<span className="">Nạp / Rút Lật-Xu</span>
</button>
</div>
</div>
</section>
    </>
  );
}