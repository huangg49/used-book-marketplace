import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useState } from "react";
import { BookCard } from "../components/BookCard";
import { getPublicListings } from "../services/public-listings";
import { motion } from "framer-motion";
const conditionLabels = {
  LikeNew: "Gần như mới",
  Good: "Còn tốt",
  Fair: "Đã dùng nhiều",
  Worn: "Cũ nhiều",
};
export function BookSearchPage() {
  const [params, setParams] = useSearchParams();
  const query = new URLSearchParams();
  for (const key of [
    "q",
    "mode",
    "condition",
    "sort",
    "minSalePrice",
    "maxSalePrice",
    "cursor",
  ]) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  query.set("limit", "12");
  const result = useQuery({
    queryKey: ["public-listings", query.toString()],
    queryFn: () => getPublicListings(query),
    retry: false,
    staleTime: 0,
  });
  const updateSingle = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.delete("cursor");
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const toggleFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.delete("cursor");
    const existing = next.getAll(key);
    if (existing.includes(value)) {
      next.delete(key);
      existing.filter((v) => v !== value).forEach((v) => next.append(key, v));
    } else {
      next.append(key, value);
    }
    setParams(next, { replace: true });
  };

  const clearAllFilters = () => {
    const next = new URLSearchParams();
    if (params.get("q")) next.set("q", params.get("q")!);
    setParams(next, { replace: true });
  };

  const [searchTerm, setSearchTerm] = useState(params.get("q") || "");

  const activeFilters: { key: string; value: string; label: string }[] = [];
  params.forEach((value, key) => {
    if (["q", "sort", "cursor", "limit"].includes(key)) return;
    let label = value;
    if (key === "minSalePrice") label = `Giá từ ${value}`;
    else if (key === "maxSalePrice") label = `Giá đến ${value}`;
    activeFilters.push({ key, value, label });
  });
  return (
    <motion.main
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex-grow w-full bg-surface text-on-surface"
    >
      <div className="flex flex-col w-full">
        {/* SEARCH HERO BANNER (ARCHIVAL WORKSHOP AESTHETIC) */}
        <section className="w-full bg-primary text-white pt-24 pb-5 px-space-md lg:px-space-lg relative overflow-hidden">
          {/* Atmospheric archival background tint and subtle graphic accent */}
          <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-primary-fixed/10 blur-3xl pointer-events-none"></div>
          <div className="absolute -left-20 bottom-0 w-80 h-80 rounded-full bg-secondary-fixed/10 blur-2xl pointer-events-none"></div>
          <div className="w-full mx-auto flex flex-col gap-space-md relative z-10">
            {/* Main Headline Prompt */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <span className="text-[10px] tracking-[0.2em] uppercase text-[#CCE6D4] font-semibold">
                  Văn khố &amp; Hiệu sách di sản
                </span>
                <h1 className="font-headline-md text-headline-md text-white mt-1 font-bold tracking-tight">
                  Tìm kiếm thư tịch &amp; Sách xưa
                </h1>
              </div>
              <p className="font-body-sm text-body-sm text-white/70 max-w-md text-left">
                Tra cứu hơn 12.800 ấn phẩm trước 1975, bản in đầu, có thủ bút và
                các bộ sưu tập văn chương Việt Nam thế kỷ XX.
              </p>
            </div>
            {/* Primary Search Input Cluster */}
            <div className="mt-4 flex flex-col sm:flex-row items-stretch gap-3 w-full">
              {/* Main Search Bar Container */}
              <div className="flex-1 w-full flex items-center gap-2 pl-4 pr-1 py-1 border border-[#CCE6D4]/30 rounded-md focus-within:border-[#CCE6D4]/60 transition-all bg-[#051a11]">
                <span className="material-symbols-outlined text-white/50 text-[20px]">
                  search
                </span>
                <input
                  className="w-full !bg-transparent !border-0 text-white placeholder:text-white/60 font-body-md text-[15px] focus:ring-0 focus:outline-none py-2 shadow-none"
                  id="mainSearchInput"
                  placeholder="Văn học tuyển chọn..."
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") updateSingle("q", searchTerm);
                  }}
                />
                
                <div className="flex items-center gap-1.5 shrink-0">
                  {searchTerm && (
                    <button
                      className="text-white/40 hover:text-white transition-colors flex items-center justify-center mr-1"
                      title="Xóa từ khóa"
                      onClick={() => {
                        setSearchTerm("");
                        updateSingle("q", "");
                      }}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        cancel
                      </span>
                    </button>
                  )}
                  
                  {/* Vertical Divider */}
                  <div className="w-[1px] h-6 bg-white/10 mx-1"></div>
                  
                  {/* ISBN Quick Scan Button */}
                  <button
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/80 font-medium transition-colors whitespace-nowrap text-[13px]"
                    title="Quét hoặc nhập mã số ISBN lưu trữ"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      barcode_scanner
                    </span>
                    <span>Quét ISBN</span>
                  </button>

                  {/* Search Action Submit */}
                  <button
                    className="flex items-center justify-center gap-1 px-5 py-2 rounded-md bg-[#CCE6D4] hover:bg-[#b3d9bf] text-[#0A3828] font-bold transition-colors whitespace-nowrap text-[14px] ml-1"
                    type="button"
                    onClick={() => updateSingle("q", searchTerm)}
                  >
                    <span>Tìm kiếm</span>
                    <span className="material-symbols-outlined text-[18px]">
                      arrow_forward
                    </span>
                  </button>
                </div>
              </div>
            </div>
            {/* Hot Keyword Chips Suggestions */}
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-1 text-xs">
              <span className="text-[#CCE6D4]/90 font-label-sm text-label-sm font-medium flex items-center gap-1 mr-1">
                <span className="material-symbols-outlined text-[15px] text-[#F26D6D]">
                  local_fire_department
                </span>
                Xu hướng tìm kiếm:
              </span>
              <button className="bg-white/5 px-3 py-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors border border-white/10">
                Tự Lực Văn Đoàn
              </button>
              <button className="bg-white/5 px-3 py-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors border border-white/10">
                Kim Vân Kiều
              </button>
              <button className="bg-white/5 px-3 py-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors border border-white/10">
                Vũ Trọng Phụng
              </button>
              <button className="bg-white/5 px-3 py-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors border border-white/10">
                Sách in trước 1975
              </button>
              <button className="bg-white/5 px-3 py-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors border border-white/10">
                Bản có chữ ký tác giả
              </button>
              <button className="bg-white/5 px-3 py-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors border border-white/10">
                Hàn Mặc Tử
              </button>
            </div>
          </div>
        </section>
        {/* APPLIED FILTER PILLS / CHIP STRIP */}
        {activeFilters.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-[#051f16] border-t border-b border-primary-container py-1.5 px-space-md lg:px-space-lg shadow-md z-[55] sticky top-[61px] lg:top-[76px]"
          >
            <div className="w-full mx-auto flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-label-sm text-label-sm text-[#CCE6D4]/90 uppercase tracking-wider font-semibold mr-1">
                  Bộ lọc đang bật ({activeFilters.length}):
                </span>
                {activeFilters.map((filter, i) => {
                  const isRare = filter.label.includes("Sách hiếm");
                  const isSigned = filter.label.includes("thủ bút");
                  
                  let chipClasses = "bg-[#062415] text-white/90 border border-white/20 hover:bg-[#0a3821]";
                  let icon = "";
                  
                  if (isRare) {
                    chipClasses = "bg-[#CCE6D4] text-[#0A3828] border border-[#CCE6D4] hover:bg-[#b3d9bf]";
                    icon = "workspace_premium";
                  } else if (isSigned) {
                    chipClasses = "bg-[#5c403a] text-[#f4d4cd] border border-[#5c403a] hover:bg-[#6b4c45]";
                    icon = "history_edu";
                  }

                  return (
                    <motion.div
                      key={`${filter.key}-${filter.value}-${i}`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-xs font-semibold transition-colors ${chipClasses}`}
                    >
                      {icon && (
                        <span className="material-symbols-outlined text-[14px]">
                          {icon}
                        </span>
                      )}
                      <span>{filter.label}</span>
                      <button
                        className="opacity-60 hover:opacity-100 flex items-center transition-opacity"
                        title="Bỏ lọc"
                        onClick={() => toggleFilter(filter.key, filter.value)}
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          close
                        </span>
                      </button>
                    </motion.div>
                  );
                })}
              </div>
              {/* Clear All Trigger */}
              <button
                onClick={clearAllFilters}
                className="text-[#F26D6D] hover:text-[#ff8a8a] font-label-sm text-label-sm font-medium flex items-center gap-1 ml-auto transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">
                  restart_alt
                </span>
                Xóa tất cả bộ lọc
              </button>
            </div>
          </motion.section>
        )}
        {/* MOBILE BAR FOR QUICK FILTER DRAWER OPEN + SORT */}
        <div className="lg:hidden sticky top-[61px] z-40 bg-surface border-b border-outline-variant px-space-md py-2.5 flex items-center justify-between gap-2 shadow-sm">
          <button
            className="flex-1 flex items-center justify-center gap-2 bg-primary-container text-on-primary py-2 px-3 rounded-lg font-title-md text-title-md active:scale-95 transition-transform"
            id="openMobileFilterBtn"
          >
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
            <span className="material-symbols-outlined absolute right-2 top-2.5 text-[16px] pointer-events-none text-outline">
              expand_more
            </span>
          </div>
        </div>
        {/* MAIN TWO-COLUMN WORKSPACE CANVAS */}
        <div className="w-full mx-auto px-space-md lg:px-space-lg py-space-lg">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
            {/* ================= LEFT COLUMN: DESKTOP ADVANCED FILTER SIDEBAR ================= */}
            <aside className="hidden lg:block lg:col-span-3 xl:col-span-2 sticky top-24 space-y-3 bg-primary p-4 rounded-xl border border-primary-container shadow-sm">
              {/* Sidebar Title Header */}
              <div className="flex items-center justify-between pb-2 border-b border-primary-container">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-white text-[22px]">
                    tune
                  </span>
                  <h2 className="text-base text-white font-bold">
                    Bộ lọc tuyển chọn
                  </h2>
                </div>
                <span className="bg-primary-fixed text-primary font-label-sm text-label-sm px-2 py-0.5 rounded-full font-bold">
                  5
                </span>
              </div>
              {/* Filter Section 1: Categories (Accordion/List) */}
              <div className="border-b border-primary-container pb-3">
                <details className="group" open>
                  <summary className="flex items-center justify-between cursor-pointer list-none text-[14px] text-white/90 py-0.5 select-none">
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-white/60">
                        auto_stories
                      </span>
                      Chuyên mục thư tịch
                    </span>
                    <span className="material-symbols-outlined text-white/60 transition-transform group-open:rotate-180">
                      expand_more
                    </span>
                  </summary>
                  <div className="mt-3 flex flex-col divide-y divide-primary/10 px-1 rounded-xl bg-[#CCE6D4] text-[13px] text-primary">
                    {[
                      { label: "Văn học tiền chiến (1930-1945)", count: 48 },
                      { label: "Thơ ca & Kịch bản xưa", count: 34 },
                      { label: "Lịch sử - Địa chí - Khảo cứu", count: 29 },
                      { label: "Triết học & Tư tưởng Đông Phương", count: 17 },
                      { label: "Sách dịch thời kỳ đầu (Hàn Thuyên, Tao Đàn)", count: 12 },
                      { label: "Sách giáo khoa & Giáo trình Pháp Việt", count: 8 },
                      { label: "Tạp chí Nam Phong, Tri Tân, Phong Hóa", count: 6 }
                    ].map(cat => (
                      <label key={cat.label} className="flex items-center justify-between cursor-pointer hover:bg-black/5 py-3 px-2 transition-colors relative group">
                        <span className="flex items-center gap-3">
                          <input
                            className="peer hidden"
                            type="checkbox"
                            checked={params.getAll("category").includes(cat.label)}
                            onChange={() => toggleFilter("category", cat.label)}
                          />
                          <div className="w-4 h-4 rounded border border-[#0a3828]/40 bg-white peer-checked:bg-[#0a3828] peer-checked:border-[#0a3828] flex items-center justify-center transition-colors">
                            <span className="material-symbols-outlined text-[14px] text-[#CCE6D4] opacity-0 peer-checked:opacity-100 font-bold">check</span>
                          </div>
                          <span className={params.getAll("category").includes(cat.label) ? "font-medium text-primary" : "text-primary"}>{cat.label}</span>
                        </span>
                        <span className="text-primary/60 text-xs">{cat.count}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
              {/* Filter Section 2: Book Condition (Phân cấp bảo quản) */}
              <div className="border-b border-primary-container pb-3">
                <details className="group" open>
                  <summary className="flex items-center justify-between cursor-pointer list-none text-[14px] text-white/90 py-0.5 select-none">
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-white/60">
                        approval
                      </span>
                      Tình trạng bảo quản
                    </span>
                    <span className="material-symbols-outlined text-white/60 transition-transform group-open:rotate-180">
                      expand_more
                    </span>
                  </summary>
                  <div className="mt-3 flex flex-col divide-y divide-primary/10 px-1 rounded-xl bg-[#CCE6D4] text-[13px] text-primary">
                    {[
                      { key: "LikeNew", label: "Như mới (Like New · 95-99%)", count: 19 },
                      { key: "Good", label: "Rất tốt (Good · 85-90%)", count: 54 },
                      { key: "Fair", label: "Khá (Fair · 70-80%)", count: 41 },
                      { key: "Worn", label: "Dấu ấn thời gian (Ố vàng / sờn gáy)", count: 28 }
                    ].map(cond => (
                      <label key={cond.key} className="flex items-center justify-between cursor-pointer hover:bg-black/5 py-3 px-2 transition-colors relative group">
                        <span className="flex items-center gap-3">
                          <input
                            className="peer hidden"
                            type="checkbox"
                            checked={params.getAll("condition").includes(cond.key)}
                            onChange={() => toggleFilter("condition", cond.key)}
                          />
                          <div className="w-4 h-4 rounded border border-[#0a3828]/40 bg-white peer-checked:bg-[#0a3828] peer-checked:border-[#0a3828] flex items-center justify-center transition-colors">
                            <span className="material-symbols-outlined text-[14px] text-[#CCE6D4] opacity-0 peer-checked:opacity-100 font-bold">check</span>
                          </div>
                          <span className={params.getAll("condition").includes(cond.key) ? "font-medium text-primary" : "text-primary"}>{cond.label}</span>
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${params.getAll("condition").includes(cond.key) ? 'bg-primary/10 text-primary font-medium' : 'bg-primary/5 text-primary/60'}`}>{cond.count}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
              {/* Filter Section 3: Price Range Slider & Inputs */}
              <div className="border-b border-primary-container pb-6 pt-2">
                <label className="flex items-center justify-between text-[14px] py-0.5 mb-2">
                  <span className="flex items-center gap-2 font-bold text-[#CCE6D4]">
                    <span className="material-symbols-outlined text-[20px] text-[#CCE6D4]">
                      payments
                    </span>
                    Khoảng giá (VNĐ)
                  </span>
                </label>
                {/* Slider Track Representation */}
                <div className="mt-4 px-1">
                  <div className="relative h-1.5 bg-black/40 border border-[#CCE6D4]/30 rounded-full w-full flex items-center">
                    <div className="absolute left-0 h-full bg-[#CCE6D4] rounded-l-full w-1/4"></div>
                    <div className="absolute left-1/4 w-3.5 h-3.5 bg-[#CCE6D4] rounded-full transform -translate-x-1/2"></div>
                  </div>
                  <div className="flex justify-between text-[12px] text-[#CCE6D4]/80 font-label-sm mt-4 font-medium">
                    <span>50.000 đ</span>
                    <span>15.000.000 đ</span>
                  </div>
                </div>
                {/* Dual Min-Max Inputs */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <span className="text-[13px] font-medium text-[#CCE6D4]/90 block mb-1.5">
                      Từ:
                    </span>
                    <input
                      className="w-full bg-[#1a3826] text-white border border-[#CCE6D4]/20 rounded-[4px] px-3 py-3 text-[14px] font-bold focus:outline-none focus:border-[#CCE6D4]"
                      type="text"
                      defaultValue="100.000"
                    />
                  </div>
                  <div>
                    <span className="text-[13px] font-medium text-[#CCE6D4]/90 block mb-1.5">
                      Đến:
                    </span>
                    <input
                      className="w-full bg-[#1a3826] text-white border border-[#CCE6D4]/20 rounded-[4px] px-3 py-3 text-[14px] font-bold focus:outline-none focus:border-[#CCE6D4]"
                      type="text"
                      defaultValue="3.500.000"
                    />
                  </div>
                </div>
                {/* Quick Price Shortcuts */}
                <div className="flex w-full gap-1.5 mt-4">
                  <button className="flex-1 text-[11px] xl:text-[12px] whitespace-nowrap px-1 py-2 rounded-[4px] bg-[#1e3b29] text-[#CCE6D4]/90 hover:bg-[#254631] transition-colors text-center">
                    &lt; 200k
                  </button>
                  <button className="flex-1 text-[11px] xl:text-[12px] whitespace-nowrap px-1 py-2 rounded-[4px] bg-[#1e3b29] text-[#CCE6D4]/90 hover:bg-[#254631] transition-colors text-center">
                    200k - 500k
                  </button>
                  <button className="flex-1 text-[11px] xl:text-[12px] whitespace-nowrap px-1 py-2 rounded-[4px] bg-[#CCE6D4] text-[#1a3826] font-medium shadow-sm hover:opacity-90 text-center">
                    500k - 2tr
                  </button>
                  <button className="flex-1 text-[11px] xl:text-[12px] whitespace-nowrap px-1 py-2 rounded-[4px] bg-[#1e3b29] text-[#CCE6D4]/90 hover:bg-[#254631] transition-colors text-center">
                    &gt; 2tr
                  </button>
                </div>
              </div>
              {/* Filter Section 4: Transaction Mode */}
              <div className="border-b border-primary-container pb-6 pt-4">
                <label className="block text-[14px] py-0.5 mb-4">
                  <span className="flex items-center gap-2 font-bold text-[#CCE6D4]">
                    <span className="material-symbols-outlined text-[20px] text-[#CCE6D4]">
                      swap_horizontal_circle
                    </span>
                    Hình thức giao dịch
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  {[
                    { key: "Sale", label: "Bán trực tiếp", className: "text-[#CCE6D4]" },
                    { key: "Exchange", label: "Đổi Lật-Xu", className: "text-[#CCE6D4]/70" },
                    { key: "Both", label: "Cả hai cách", className: "text-[#CCE6D4]/70" },
                    { key: "Auction", label: "Đấu giá", className: "text-[#e2938a]" }
                  ].map(m => {
                    const isActive = params.get("mode") === m.key;
                    return (
                      <label key={m.key} className={`flex items-center gap-3 p-4 rounded-md border cursor-pointer transition-colors ${isActive ? 'border-[#CCE6D4] bg-[#1a3826]' : 'border-white/10 bg-transparent hover:bg-white/5'}`}>
                        <input
                          className={`focus:ring-[#CCE6D4] w-4 h-4 accent-[#CCE6D4] ${isActive ? 'text-[#CCE6D4]' : 'text-white/30'}`}
                          name="transMode"
                          type="radio"
                          checked={isActive}
                          onChange={() => updateSingle("mode", m.key)}
                        />
                        <span className={isActive ? "font-medium text-[#CCE6D4]" : m.className}>
                          {m.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {/* Filter Section 5: Provenance & Collector Attributes */}
              <div className="border-b border-primary-container pb-6 pt-6">
                <label className="block text-[14px] py-0.5 mb-5">
                  <span className="flex items-center gap-2 font-bold text-[#CCE6D4]">
                    <span className="material-symbols-outlined text-[20px] text-[#CCE6D4]">
                      verified
                    </span>
                    Đặc tính sưu tầm di sản
                  </span>
                </label>
                <div className="space-y-4 text-[13px]">
                  {[
                    { key: "Rare", label: "Sách hiếm & Bản in đầu", icon: "stars", iconColor: "text-[#e08e82]" },
                    { key: "Autograph", label: "Thủ bút / Chữ ký tác giả", icon: "edit_note", iconColor: "text-[#CCE6D4]/80" },
                    { key: "ExLibris", label: "Dấu mộc thư viện / Ex-Libris cổ", icon: "bookmark_heart", iconColor: "text-[#CCE6D4]/50" }
                  ].map(c => (
                    <label key={c.key} className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-4">
                        <input type="checkbox" className="peer hidden" checked={params.getAll("collectible").includes(c.key)} onChange={() => toggleFilter("collectible", c.key)} />
                        <div className="flex items-center justify-center w-8 h-10 rounded-md bg-[#CCE6D4]/20 peer-checked:bg-[#CCE6D4] text-transparent peer-checked:text-[#0A3828] transition-colors">
                          <span className="material-symbols-outlined text-[20px] font-bold">check</span>
                        </div>
                        <span className="text-[#CCE6D4]/90 font-medium">
                          {c.label}
                        </span>
                      </div>
                      <span className={`material-symbols-outlined ${c.iconColor} text-[18px]`}>
                        {c.icon}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {/* Filter Section 6: Publication Era */}
              <div className="pb-6 pt-6">
                <label className="block text-[14px] py-0.5 mb-4">
                  <span className="flex items-center gap-2 font-bold text-[#CCE6D4]">
                    <span className="material-symbols-outlined text-[20px] text-[#CCE6D4]">
                      hourglass_empty
                    </span>
                    Thời kỳ ấn hành
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  {["Trước 1945", "1945 - 1954", "1954 - 1975", "Sau 1975"].map(era => {
                    const isActive = params.getAll("era").includes(era);
                    return (
                      <button
                        key={era}
                        onClick={() => toggleFilter("era", era)}
                        className={`px-2 py-2.5 rounded-md font-medium text-center transition-colors ${isActive ? 'bg-[#CCE6D4] text-primary font-bold' : 'border border-[#CCE6D4]/20 bg-transparent text-[#CCE6D4]/90 hover:bg-white/5'}`}
                      >
                        {era}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Reset Button */}
              <button
                onClick={clearAllFilters}
                className="w-full py-3.5 bg-[#122b1e] border border-[#CCE6D4]/20 hover:bg-[#1a3826] text-white font-bold text-[14px] rounded-lg transition-colors flex items-center justify-center gap-2 mt-4"
              >
                <span className="material-symbols-outlined text-[20px]">
                  filter_alt_off
                </span>
                Đặt lại bộ lọc mặc định
              </button>
            </aside>
            {/* ================= RIGHT COLUMN: SEARCH RESULT CATALOG AREA ================= */}
            <main className="lg:col-span-9 xl:col-span-10 flex flex-col gap-space-md">
              {/* Results Header Controls Bar */}
              <div className="bg-surface-container-lowest p-space-md rounded-xl border border-outline-variant shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Summary statement */}
                <div className="flex items-baseline gap-2">
                  <span className="font-headline-sm text-headline-sm text-primary font-bold">
                    {result.data?.items.length || 0}
                  </span>
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    tác phẩm tìm thấy {params.get("q") && <span>cho từ khóa <strong className="text-primary italic">“{params.get("q")}”</strong></span>}
                  </span>
                </div>
                {/* Sort and View Modes */}
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  {/* Sort dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="font-label-sm text-label-sm text-outline hidden md:inline">
                      Sắp xếp:
                    </span>
                    <div className="relative">
                      <select
                        value={params.get("sort") || "newest"}
                        onChange={(e) => updateSingle("sort", e.target.value)}
                        className="appearance-none bg-surface-container border border-outline-variant rounded-lg font-body-sm text-body-sm text-on-surface py-1.5 pl-3 pr-8 focus:outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="newest">Mới lên kệ nhất</option>
                        <option value="price_asc">Giá: Thấp đến Cao</option>
                        <option value="price_desc">Giá: Cao đến Thấp</option>
                        <option value="oldest">Năm ấn hành: Cổ nhất</option>
                        <option value="popular">Được yêu thích nhất</option>
                        <option value="ending_soon">Sắp kết thúc đấu giá</option>
                      </select>
                      <span className="material-symbols-outlined absolute right-2 top-2 text-[16px] pointer-events-none text-outline">
                        expand_more
                      </span>
                    </div>
                  </div>
                  {/* View Layout Toggle: Grid vs List */}
                  <div className="flex items-center bg-surface-container rounded-lg p-0.5 border border-outline-variant">
                    <button
                      className="p-1 rounded bg-surface-container-lowest text-primary shadow-xs"
                      title="Xem dạng lưới"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        grid_view
                      </span>
                    </button>
                    <button
                      className="p-1 rounded text-outline hover:text-on-surface"
                      title="Xem dạng danh sách"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        view_list
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 gap-4">
                {result.data?.items.map((book, index) => (
                  <motion.div
                    key={book.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.3 + index * 0.05 }}
                  >
                    <BookCard book={book} index={index} />
                  </motion.div>
                ))}
              </div>
              {result.data?.nextCursor && (
                <button
                  type="button"
                  className="mt-6 px-5 py-3 border border-outline-variant rounded"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set("cursor", result.data!.nextCursor!);
                    setParams(next);
                  }}
                >
                  Trang tiếp theo
                </button>
              )}
              {params.has("cursor") && (
                <button
                  type="button"
                  className="mt-6 px-5 py-3"
                  onClick={() => update("cursor", "")}
                >
                  Về trang đầu
                </button>
              )}
            </main>
          </div>
        </div>
      </div>
    </motion.main>
  );
}
