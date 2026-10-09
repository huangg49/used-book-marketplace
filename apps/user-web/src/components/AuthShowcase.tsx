export function AuthShowcase({ className = '' }: { className?: string }) {
  return (
    <div className={`lg:col-span-5 bg-gradient-to-br from-[#122e23] via-[#173c2e] to-[#0c1f17] text-[#ffffff] p-8 flex flex-col justify-between relative overflow-hidden border-b lg:border-b-0 lg:border-r border-amber-900/30 ${className}`}>
      {/* Antique archival book image backdrop & pattern */}
      <div className="absolute inset-0 opacity-20 mix-blend-luminosity pointer-events-none scale-125 translate-x-4">
        <img
          alt="Antique library manuscript background"
          className="w-full h-full object-cover filter sepia contrast-125"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAZzQ4i3KeDqMHcAbshHmPgydxnZPbzrHpq3vUCoJLj9NRC_GVcqJMn8yXHn4EKHB7EVLe0IbtaF64AvZl41qxujcpROF_dg6rDluMM2MBKNd23dWKrmntvVj6lNjyUIiEAdL21bPbKcPCsW85YIdfXXwcLpIbQ7q57V2wL7wKaES6qhRXzjvkY8M2kC36KlD9OO_MAdUaSYj7w1yinBa2ANLLM4H5AliFzRerPazUoW--pZzB6B8jHew"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#0c1f17] via-transparent to-[#122e23]/70 pointer-events-none"></div>

      {/* Subtle archival drafting grid overlay */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <svg className="w-full h-full" height="100%" width="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern height="32" id="archival-pattern" patternUnits="userSpaceOnUse" width="32">
              <path d="M0 16h32M16 0v32" fill="none" stroke="currentColor" strokeDasharray="2 4" strokeWidth="0.75"></path>
            </pattern>
          </defs>
          <rect fill="url(#archival-pattern)" height="100%" width="100%"></rect>
        </svg>
      </div>

      {/* Top Badge & Header text */}
      <div className="relative z-10 flex flex-col gap-4">
        <div className="inline-flex items-center gap-1.5 text-[#c3ecd7] font-label-sm text-[11px] tracking-widest uppercase bg-black/25 px-2.5 py-1 rounded w-fit border border-amber-400/20 shadow-sm backdrop-blur-sm">
          <span className="material-symbols-outlined text-[15px] text-[#ffdad2]">history_edu</span>
          <span>Khảo Cổ & Lưu Trữ</span>
        </div>
        <div className="flex flex-col gap-1.5 mt-2">
          <h2 className="font-headline-md text-[24px] text-[#fef9ef] leading-snug drop-shadow font-semibold">
            Từng trang sách,<br /><span className="italic font-normal text-[#a8cfbc]">một mảnh hồn xưa.</span>
          </h2>
          <p className="font-body-sm text-[13px] text-[#80a794] mt-1 leading-relaxed opacity-95">
            Thư khố mở cửa cho các dịch giả, nhà sưu tầm và độc giả mẫn cảm với mùi giấy ngả vàng.
          </p>
        </div>
      </div>

      {/* Rare book card highlight with vintage book cover vignette */}
      <div className="relative z-10 my-6">
        <div className="p-4 rounded-xl bg-gradient-to-b from-white/10 to-black/35 backdrop-blur-md border border-amber-300/20 shadow-lg flex flex-col gap-1.5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between text-[#c3ecd7] font-label-sm text-[11px]">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="material-symbols-outlined text-[16px] text-[#ff9479]">auto_stories</span>
              Ấn bản ngày hôm nay
            </span>
            <span className="font-mono text-[11px] text-[#c3ecd7] bg-black/40 px-1.5 py-0.5 rounded border border-white/10">MS: 1938-HN</span>
          </div>
          <p className="font-body-md text-[14px] text-[#fef9ef] font-semibold italic flex items-center gap-1.5 mt-1">
            <span>"Số Đỏ" — Vũ Trọng Phụng</span>
          </p>
          <p className="font-label-sm text-[11px] text-[#cfc5b6] leading-relaxed">
            Bản in 1938 Lê Cường Thư Quán (Hà Nội). Nguyên bìa vẽ tay, lưu vết mộc độc bản.
          </p>
        </div>
      </div>

      {/* Bottom archival footer note */}
      <div className="relative z-10 flex items-center justify-between pt-4 border-t border-white/10 text-[#80a794] font-label-sm text-[11px]">
        <div className="flex items-center gap-1.5 text-[#a8cfbc]">
          <span className="material-symbols-outlined text-[16px] text-[#c3ecd7]">verified</span>
          <span>Gìn giữ trọn vẹn thư tịch</span>
        </div>
        <span className="font-mono text-[11px] text-amber-200/60 bg-black/20 px-1.5 py-0.5 rounded">v2.4 Di Sản</span>
      </div>
    </div>
  );
}
