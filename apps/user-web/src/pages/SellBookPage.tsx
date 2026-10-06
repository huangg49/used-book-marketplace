
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '../layouts/MainLayout';

export function SellBookPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(1);

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen">
      <Header />

      <main className="w-full pt-20 bg-surface min-h-[calc(100vh-80px)] pb-space-xl">
        <div className="flex flex-col w-full">

          {/* WIZARD HEADER & EDITORIAL SUMMARY */}
          <section className="w-full px-margin-mobile lg:px-margin pt-space-lg pb-space-md bg-surface">
            <div className="w-full">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md pb-space-lg">
                <div className="max-w-3xl">
                  <div className="inline-flex items-center gap-space-xs px-space-sm py-space-xs rounded bg-surface-container-high text-primary font-label-sm text-label-sm uppercase tracking-widest mb-space-xs">
                    <span className="material-symbols-outlined text-[15px] text-secondary">auto_stories</span>
                    Ký gửi & Chuyển giao di sản
                  </div>
                  <h1 className="font-headline-xl text-headline-xl text-primary font-serif tracking-tight">
                    Đăng Bán & Lưu Ký Ấn Phẩm Di Sản
                  </h1>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-space-xs">
                    Đưa ấn phẩm xưa của bạn đến với mạng lưới 38.000+ nhà sưu tầm và độc giả trung kiên. Hệ thống Lật Lại AI và Hội đồng Cố vấn Thư mục Thư tịch Quốc gia sẽ hỗ trợ bạn xác thực mộc bản, đối chiếu bản in gốc và đề xuất khung giá tối ưu.
                  </p>
                </div>
                <div className="flex items-center gap-space-md">
                  <div className="p-space-sm rounded bg-surface-container flex items-center gap-space-sm shadow-sm">
                    <div className="w-10 h-10 rounded bg-primary text-on-primary flex items-center justify-center">
                      <span className="material-symbols-outlined text-[22px]">policy</span>
                    </div>
                    <div>
                      <div className="font-title-md text-title-md text-primary leading-tight">Miễn phí thẩm định</div>
                      <div className="font-label-sm text-label-sm text-on-surface-variant">Ấn bản tiền chiến 1930 - 1945</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* HORIZONTAL STEPPER PROGRESS BAR (5 STEPS) */}
          <section className="w-full px-margin-mobile lg:px-margin pb-space-lg bg-surface hidden lg:block">
            <div className="w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                {/* Step 1 */}
                <div className={`flex items-center gap-space-sm flex-1 ${activeTab === 1 ? 'p-space-xs rounded-lg bg-[#F0E6DE]/50' : ''}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${activeTab > 1 ? 'bg-[#1A3B2E] text-white' : activeTab === 1 ? 'bg-[#9C4B3A] text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {activeTab > 1 ? <span className="material-symbols-outlined text-[20px]">check</span> : '01'}
                  </div>
                  <div>
                    <div className={`font-label-sm text-label-sm uppercase tracking-wider mb-0.5 ${activeTab === 1 ? 'text-[#9C4B3A] font-bold' : 'text-outline'}`}>{activeTab === 1 ? 'ĐANG CHỈNH' : 'BƯỚC 01'}</div>
                    <div className={`font-title-md text-title-md ${activeTab >= 1 ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>Thông tin sách</div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant">Đã quét ISBN 1937</div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className={`flex items-center gap-space-sm flex-1 ${activeTab === 2 ? 'p-space-xs rounded-lg bg-[#F0E6DE]/50' : ''}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${activeTab > 2 ? 'bg-[#1A3B2E] text-white' : activeTab === 2 ? 'bg-[#9C4B3A] text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {activeTab > 2 ? <span className="material-symbols-outlined text-[20px]">check</span> : '02'}
                  </div>
                  <div>
                    <div className={`font-label-sm text-label-sm uppercase tracking-wider mb-0.5 ${activeTab === 2 ? 'text-[#9C4B3A] font-bold' : 'text-outline'}`}>{activeTab === 2 ? 'ĐANG CHỈNH' : 'BƯỚC 02'}</div>
                    <div className={`font-title-md text-title-md ${activeTab >= 2 ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>Hình ảnh hiện vật</div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant">4 ảnh đối chiếu rõ nét</div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className={`flex items-center gap-space-sm flex-1 ${activeTab === 3 ? 'p-space-xs rounded-lg bg-[#F0E6DE]/50' : ''}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${activeTab > 3 ? 'bg-[#1A3B2E] text-white' : activeTab === 3 ? 'bg-[#9C4B3A] text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {activeTab > 3 ? <span className="material-symbols-outlined text-[20px]">check</span> : '03'}
                  </div>
                  <div>
                    <div className={`font-label-sm text-label-sm uppercase tracking-wider mb-0.5 ${activeTab === 3 ? 'text-[#9C4B3A] font-bold' : 'text-outline'}`}>{activeTab === 3 ? 'ĐANG CHỈNH' : 'BƯỚC 03'}</div>
                    <div className={`font-title-md text-title-md ${activeTab >= 3 ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>Tình trạng bảo quản</div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant">Rất tốt (88/100)</div>
                  </div>
                </div>

                {/* Step 4 */}
                <div className={`flex items-center gap-space-sm flex-1 ${activeTab === 4 ? 'p-space-xs rounded-lg bg-[#F0E6DE]' : ''}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${activeTab > 4 ? 'bg-[#1A3B2E] text-white' : activeTab === 4 ? 'bg-[#9C4B3A] text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {activeTab > 4 ? <span className="material-symbols-outlined text-[20px]">check</span> : '04'}
                  </div>
                  <div>
                    <div className={`font-label-sm text-label-sm uppercase tracking-wider mb-0.5 ${activeTab === 4 ? 'text-[#9C4B3A] font-bold' : 'text-outline'}`}>{activeTab === 4 ? 'ĐANG CHỈNH' : 'BƯỚC 04'}</div>
                    <div className={`font-title-md text-title-md ${activeTab >= 4 ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>AI Price Assist</div>
                    <div className={`font-body-sm text-body-sm ${activeTab === 4 ? 'text-[#9C4B3A]' : 'text-on-surface-variant'}`}>Khuyến nghị 4.850.000₫</div>
                  </div>
                </div>

                {/* Step 5 */}
                <div className={`flex items-center gap-space-sm flex-1 ${activeTab === 5 ? 'p-space-xs rounded-lg bg-[#F0E6DE]' : ''}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${activeTab > 5 ? 'bg-[#1A3B2E] text-white' : activeTab === 5 ? 'bg-[#9C4B3A] text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {activeTab > 5 ? <span className="material-symbols-outlined text-[20px]">check</span> : '05'}
                  </div>
                  <div>
                    <div className={`font-label-sm text-label-sm uppercase tracking-wider mb-0.5 ${activeTab === 5 ? 'text-[#9C4B3A] font-bold' : 'text-outline'}`}>{activeTab === 5 ? 'ĐANG CHỈNH' : 'KẾ TIẾP'}</div>
                    <div className={`font-title-md text-title-md ${activeTab >= 5 ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>Hình thức giao dịch</div>
                    <div className={`font-body-sm text-body-sm ${activeTab === 5 ? 'text-[#9C4B3A]' : 'text-on-surface-variant'}`}>Niêm yết / Đổi xu / Đấu giá</div>
                  </div>
                </div>

              </div>
              
              {/* Progress Line */}
              <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden mt-space-sm flex">
                <div className="h-full bg-[#1A3B2E] transition-all duration-500" style={{ width: `${Math.max(0, (activeTab - 1) / 5 * 100)}%` }}></div>
                <div className="h-full bg-[#9C4B3A] transition-all duration-500" style={{ width: `${100 / 5}%` }}></div>
              </div>
            </div>
          </section>

          {/* MAIN MULTI-STEP INTERACTIVE WORKSPACE */}
          <section className="w-full px-margin-mobile lg:px-margin bg-surface">
            <div className="w-full flex flex-col md:flex-row gap-space-lg">
              
              {/* SIDEBAR TABS */}
              <div className="w-full md:w-64 shrink-0 flex flex-col gap-space-xs sticky top-28 h-fit">
                <button 
                  onClick={() => setActiveTab(1)}
                  className={`flex items-center gap-space-sm p-space-sm rounded-lg transition-colors text-left ${activeTab === 1 ? 'bg-primary-container text-on-primary-container' : 'hover:bg-surface-container-low'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] shrink-0 ${activeTab === 1 ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    1
                  </div>
                  <div>
                    <div className="font-title-md text-title-md font-semibold truncate">Thông tin sách</div>
                  </div>
                </button>

                <button 
                  onClick={() => setActiveTab(2)}
                  className={`flex items-center gap-space-sm p-space-sm rounded-lg transition-colors text-left ${activeTab === 2 ? 'bg-primary-container text-on-primary-container' : 'hover:bg-surface-container-low'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] shrink-0 ${activeTab === 2 ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    2
                  </div>
                  <div>
                    <div className="font-title-md text-title-md font-semibold truncate">Hình ảnh hiện vật</div>
                  </div>
                </button>

                <button 
                  onClick={() => setActiveTab(3)}
                  className={`flex items-center gap-space-sm p-space-sm rounded-lg transition-colors text-left ${activeTab === 3 ? 'bg-primary-container text-on-primary-container' : 'hover:bg-surface-container-low'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] shrink-0 ${activeTab === 3 ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    3
                  </div>
                  <div>
                    <div className="font-title-md text-title-md font-semibold truncate">Tình trạng bảo quản</div>
                  </div>
                </button>

                <button 
                  onClick={() => setActiveTab(4)}
                  className={`flex items-center gap-space-sm p-space-sm rounded-lg transition-colors text-left ${activeTab === 4 ? 'bg-primary-container text-on-primary-container' : 'hover:bg-surface-container-low'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] shrink-0 ${activeTab === 4 ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    4
                  </div>
                  <div>
                    <div className="font-title-md text-title-md font-semibold truncate">Giao vận & Giao dịch</div>
                  </div>
                </button>

                <button 
                  onClick={() => setActiveTab(5)}
                  className={`flex items-center gap-space-sm p-space-sm rounded-lg transition-colors text-left ${activeTab === 5 ? 'bg-primary-container text-on-primary-container' : 'hover:bg-surface-container-low'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] shrink-0 ${activeTab === 5 ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    5
                  </div>
                  <div>
                    <div className="font-title-md text-title-md font-semibold truncate">Tổng hợp & Kiểm tra</div>
                  </div>
                </button>
              </div>

              {/* CONTENT AREA */}
              <div className="flex-1 flex flex-col gap-space-lg min-w-0 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="flex flex-col gap-space-lg"
                  >
                {activeTab === 1 && (
                  <div className="flex flex-col gap-space-lg">
                {/* SECTION A: BƯỚC 1 */}
                <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
                  <div className="flex items-center justify-between pb-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm uppercase font-bold tracking-wider">
                        Mục 01
                      </span>
                      <h2 className="font-title-lg text-title-lg text-primary font-serif">Thông tin ấn phẩm & Thư tịch</h2>
                    </div>
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-secondary text-[18px]">verified_user</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Đã thẩm định dữ liệu</span>
                    </div>
                  </div>

                  <div className="p-space-md rounded bg-surface-container-low flex flex-col md:flex-row items-stretch md:items-center gap-space-sm">
                    <div className="flex-1 flex items-center gap-space-xs bg-surface px-space-md py-space-xs rounded shadow-inner">
                      <span className="material-symbols-outlined text-outline text-[20px]">barcode_scanner</span>
                      <div className="flex flex-col flex-1">
                        <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Mã ISBN / Ký hiệu lưu chiểu cổ</span>
                        <input className="bg-transparent font-title-md text-title-md text-primary font-mono focus:outline-none" readOnly type="text" value="978-604-0-19370-1" />
                      </div>
                    </div>
                    <div className="flex items-center gap-space-xs">
                      <button className="flex items-center gap-1 px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-primary font-title-md text-title-md transition-colors shadow-sm" type="button">
                        <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                        Quét mã vạch
                      </button>
                      <button className="flex items-center gap-1 px-space-md py-space-xs rounded bg-primary text-on-primary font-title-md text-title-md hover:bg-primary-container transition-colors shadow-sm" type="button">
                        <span className="material-symbols-outlined text-[18px]">search</span>
                        Tìm tựa
                      </button>
                    </div>
                  </div>

                  <div className="p-space-md rounded bg-surface-container flex flex-col md:flex-row gap-space-md">
                    <div className="w-full md:w-36 h-48 rounded bg-surface-container-high overflow-hidden shrink-0 shadow-sm relative group">
                      <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="Book cover" src="https://upload.wikimedia.org/wikipedia/vi/4/4e/Sodo_bia.jpg"/>
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-secondary text-on-secondary font-label-sm text-label-sm uppercase tracking-wider">
                        1937 Bản Đầu
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-space-xs mb-space-xs">
                          <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-highest text-primary font-label-sm text-label-sm font-semibold">
                            <span className="material-symbols-outlined text-[14px] text-secondary">menu_book</span>
                            Thư mục Thư tịch Quốc gia Việt Nam
                          </span>
                          <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm">
                            Hội Cổ Thư Hà Nội giám tuyển
                          </span>
                        </div>
                        <h3 className="font-headline-sm text-headline-sm text-primary font-serif">
                          Số Đỏ (Ấn bản đầu tiên 1937 kèm tranh minh họa mộc bản)
                        </h3>
                        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                          Tác giả: <strong className="text-primary font-medium">Vũ Trọng Phụng (1912 - 1939)</strong>
                        </p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-sm pt-space-sm mt-space-sm">
                        <div>
                          <span className="font-label-sm text-label-sm text-outline block">Nhà xuất bản</span>
                          <span className="font-body-sm text-body-sm text-primary font-medium">Lê Cường (Hà Nội, 1937)</span>
                        </div>
                        <div>
                          <span className="font-label-sm text-label-sm text-outline block">Thể loại văn học</span>
                          <span className="font-body-sm text-body-sm text-primary font-medium">Văn học tiền chiến</span>
                        </div>
                        <div>
                          <span className="font-label-sm text-label-sm text-outline block">Quy cách in ấn</span>
                          <span className="font-body-sm text-body-sm text-primary font-medium">248 trang, 14 × 21 cm</span>
                        </div>
                        <div>
                          <span className="font-label-sm text-label-sm text-outline block">Chất liệu giấy</span>
                          <span className="font-body-sm text-body-sm text-primary font-medium">Giấy mộc ngà mỏng</span>
                        </div>
                        <div>
                          <span className="font-label-sm text-label-sm text-outline block">Số lượng bản in gốc</span>
                          <span className="font-body-sm text-body-sm text-primary font-medium">Giới hạn 1.200 bản</span>
                        </div>
                        <div>
                          <span className="font-label-sm text-label-sm text-outline block">Thao tác</span>
                          <button className="text-secondary hover:text-on-secondary-container font-label-sm text-label-sm font-semibold inline-flex items-center gap-1" type="button">
                            <span className="material-symbols-outlined text-[14px]">edit_note</span>
                            Chỉnh sửa chi tiết
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>


                    <div className="flex justify-end">
                      <button onClick={() => setActiveTab(2)} className="px-space-md py-space-sm rounded bg-primary text-on-primary font-title-md text-title-md hover:bg-primary-container transition-colors">Tiếp tục: Hình ảnh hiện vật</button>
                    </div>
                  </div>
                )}
                
                {activeTab === 2 && (
                  <div className="flex flex-col gap-space-lg">
                {/* SECTION B: BƯỚC 2 */}
                <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs pb-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm uppercase font-bold tracking-wider">
                        Mục 02
                      </span>
                      <h2 className="font-title-lg text-title-lg text-primary font-serif">Hình ảnh hiện vật thực tế</h2>
                    </div>
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-emerald-700 text-[18px]">check_circle</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Đã tải 4/10 ảnh đối chiếu</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
                    {/* Fake Photos using placeholder URLs */}
                    {[
                      { title: "Cover Front", subtitle: "Mộc bản khắc gỗ", label: "01. Bìa trước", url: "https://upload.wikimedia.org/wikipedia/vi/4/4e/Sodo_bia.jpg" },
                      { title: "Cover Back", subtitle: "Mộc giá Piastre", label: "02. Bìa sau", url: "https://upload.wikimedia.org/wikipedia/commons/4/4c/Sodo_bia_sau.jpg" },
                      { title: "Spine & Stitching", subtitle: "Vết mòn tự nhiên", label: "03. Gáy sách", url: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=400&auto=format&fit=crop" },
                      { title: "Provenance & Ố", subtitle: "Chữ ký tặng 1938", label: "04. Thủ bút quý", url: "https://images.unsplash.com/photo-1585806655189-54805e2bb2da?q=80&w=400&auto=format&fit=crop" }
                    ].map((img, i) => (
                      <div key={i} className="group relative flex flex-col bg-surface-container rounded-lg p-space-xs shadow-sm hover:shadow-md transition-all">
                        <div className="aspect-[3/4] w-full rounded overflow-hidden relative bg-surface-container-high">
                          <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={img.title} src={img.url} />
                          <span className={`absolute top-1.5 left-1.5 ${i === 3 ? 'bg-secondary text-on-secondary' : 'bg-primary/85 text-on-primary'} font-label-sm text-label-sm px-1.5 py-0.5 rounded`}>
                            {img.label}
                          </span>
                          <button className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-surface-container-lowest/80 text-on-surface flex items-center justify-center hover:bg-surface transition-colors shadow" type="button">
                            <span className="material-symbols-outlined text-[14px]">zoom_in</span>
                          </button>
                        </div>
                        <div className="mt-space-xs">
                          <div className="font-title-md text-[13px] text-primary font-semibold truncate">{img.title}</div>
                          <div className="font-label-sm text-label-sm text-on-surface-variant line-clamp-1">{img.subtitle}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-space-sm pt-space-xs">
                    <button className="w-full sm:w-auto inline-flex items-center justify-center gap-space-xs px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-primary font-title-md text-title-md transition-colors shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[20px] text-secondary">add_photo_alternate</span>
                      + Thêm ảnh chi tiết khác (Tối đa 10 ảnh)
                    </button>
                    <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                      Độ phân giải đạt chuẩn HD giám định
                    </div>
                  </div>
                </div>


                    <div className="flex justify-between">
                      <button onClick={() => setActiveTab(1)} className="px-space-md py-space-sm rounded bg-surface hover:bg-surface-container-low text-primary font-title-md text-title-md transition-colors border border-outline-variant">Quay lại</button>
                      <button onClick={() => setActiveTab(3)} className="px-space-md py-space-sm rounded bg-primary text-on-primary font-title-md text-title-md hover:bg-primary-container transition-colors">Tiếp tục: Tình trạng bảo quản</button>
                    </div>
                  </div>
                )}
                
                {activeTab === 3 && (
                  <div className="flex flex-col gap-space-lg">
                {/* SECTION C: BƯỚC 3 */}
                <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs pb-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm uppercase font-bold tracking-wider">Mục 03</span>
                      <h2 className="font-title-lg text-title-lg text-primary font-serif">Checklist thẩm định hao mòn vật lý</h2>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-100 text-emerald-950">
                      <span className="material-symbols-outlined text-[18px] text-emerald-800">verified</span>
                      <span className="font-label-md text-label-md font-bold">Chỉ số: Rất tốt (88/100)</span>
                    </div>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Đánh giá minh bạch giúp tăng <strong>94% độ tin cậy</strong> của người mua và tránh khiếu nại sau giao dịch.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                    <label className="flex items-start gap-space-sm p-space-sm rounded bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors">
                      <input className="mt-1 w-4 h-4 rounded text-primary focus:ring-primary" type="checkbox" />
                      <div className="flex flex-col">
                        <span className="font-title-md text-title-md text-primary font-semibold">Rách trang / Khuyết thiếu</span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">Không rách — Đã kiểm đếm 248/248 trang nguyên vẹn đầy đủ.</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-space-sm p-space-sm rounded bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors shadow-sm">
                      <input defaultChecked className="mt-1 w-4 h-4 rounded text-secondary focus:ring-secondary accent-secondary" type="checkbox"/>
                      <div className="flex flex-col">
                        <span className="font-title-md text-title-md text-primary font-semibold flex items-center gap-1">
                          Ố vàng tự nhiên (Foxing) <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container-highest text-secondary">Mức nhẹ</span>
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">Có ố vàng sậm màu theo năm tháng ở viền mép giấy ngoài.</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-space-sm p-space-sm rounded bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors md:col-span-2">
                      <input defaultChecked className="mt-1 w-4 h-4 rounded text-secondary focus:ring-secondary accent-secondary" type="checkbox"/>
                      <div className="flex flex-col">
                        <span className="font-title-md text-title-md text-secondary font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px]">stars</span>
                          Thủ bút tác giả & Đề tặng (Provenance) <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-secondary text-on-secondary">Tăng giá trị +45%</span>
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface">Trang xi-nê có chữ ký mực tím nguyên bản đề ngày <strong>18 Tháng 4, 1938</strong> tặng học giả nghiên cứu văn học Bắc Kỳ.</span>
                      </div>
                    </label>
                  </div>
                </div>


                    <div className="flex justify-between">
                      <button onClick={() => setActiveTab(2)} className="px-space-md py-space-sm rounded bg-surface hover:bg-surface-container-low text-primary font-title-md text-title-md transition-colors border border-outline-variant">Quay lại</button>
                      <button onClick={() => setActiveTab(4)} className="px-space-md py-space-sm rounded bg-primary text-on-primary font-title-md text-title-md hover:bg-primary-container transition-colors">Tiếp tục: Giao vận & Giao dịch</button>
                    </div>
                  </div>
                )}

                {activeTab === 4 && (
                  <div className="flex flex-col gap-space-lg">
                {/* SECTION D: BƯỚC 4 */}
                <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs pb-space-sm border-b border-outline-variant/30">
                    <div className="flex items-center gap-space-sm">
                      <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm uppercase font-bold tracking-wider">Mục 04</span>
                      <h2 className="font-title-lg text-title-lg text-primary font-serif">Thông tin nơi gửi sách & Giao vận</h2>
                    </div>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Chọn nơi bạn sẽ gửi cuốn sách. Tên, số điện thoại và địa chỉ chi tiết chỉ hiển thị trong sổ của bạn.</p>

                  <div className="flex flex-col gap-space-sm">
                    {/* Selected Address Card */}
                    <div className="p-space-md rounded-xl bg-surface border-2 border-primary shadow-sm flex items-start gap-space-md relative">
                      <div className="absolute top-3 right-3">
                        <span className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm font-semibold">Mặc định</span>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-surface-container-highest text-primary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[20px]">location_on</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="font-title-md text-title-md text-primary font-semibold">Nguyễn Văn A</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">0901234567</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">123 Đường Số 1, Phường 2, Quận 3, TP.HCM</p>
                        <span className="inline-block mt-2 font-label-sm text-label-sm text-secondary">Giao trực tiếp · TP.HCM · khu vực mô phỏng</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-space-sm mt-space-xs">
                      <button className="px-space-md py-space-xs rounded bg-surface hover:bg-surface-container-low text-primary font-title-md text-title-md transition-colors border border-outline-variant" type="button">
                        Chọn địa chỉ khác
                      </button>
                      <button className="px-space-md py-space-xs rounded bg-surface hover:bg-surface-container-low text-primary font-title-md text-title-md transition-colors border border-outline-variant flex items-center gap-1" type="button">
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        Thêm địa chỉ mới
                      </button>
                    </div>

                    <p className="font-label-sm text-label-sm text-outline mt-space-sm">
                      Hiện mới lưu lựa chọn giao trực tiếp. Chưa tính phí, đặt giao hàng hay nhận sách qua điểm. Thay đổi nơi gửi trên bài đã duyệt cần được duyệt lại.
                    </p>
                  </div>
                </div>


                {/* SECTION E: BƯỚC 5 */}
                <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
                  <div className="flex items-center justify-between pb-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm uppercase font-bold tracking-wider">Mục 05</span>
                      <h2 className="font-title-lg text-title-lg text-primary font-serif">Chọn hình thức giao dịch & Chuyển nhượng</h2>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
                    <div className="cursor-pointer p-space-md rounded-xl bg-surface-container-low transition-all relative flex flex-col justify-between shadow-sm hover:shadow-md border-2 border-primary">
                      <div className="absolute -top-3 left-4 px-2 py-0.5 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold">Đang kích hoạt</div>
                      <div>
                        <div className="flex items-center justify-between mt-1 mb-space-sm">
                          <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[20px]">sell</span>
                          </div>
                          <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-on-primary">
                            <span className="material-symbols-outlined text-[14px]">check</span>
                          </span>
                        </div>
                        <h3 className="font-title-lg text-title-lg text-primary font-semibold mb-1">Bán trực tiếp</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">Người mua thanh toán tiền mặt/chuyển khoản qua sàn.</p>
                      </div>
                      <div className="mt-space-md pt-space-xs flex items-center justify-between text-primary font-title-md text-title-md font-serif">
                        <span>Giá niêm yết:</span>
                        <span className="text-secondary font-bold text-headline-sm font-sans">4.850.000 ₫</span>
                      </div>
                    </div>
                    
                    <div className="cursor-pointer p-space-md rounded-xl bg-surface hover:bg-surface-container-low transition-all flex flex-col justify-between shadow-sm hover:shadow-md border border-outline-variant">
                      <div>
                        <div className="flex items-center justify-between mb-space-sm">
                          <div className="w-10 h-10 rounded-full bg-surface-container-highest text-secondary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[20px]">token</span>
                          </div>
                          <span className="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center text-outline"></span>
                        </div>
                        <h3 className="font-title-lg text-title-lg text-primary font-semibold mb-1">Đổi lấy Lật-Xu</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">Không nhận tiền mặt, cộng 380 Xu vĩnh viễn vào tài khoản.</p>
                      </div>
                      <div className="mt-space-md pt-space-xs flex items-center justify-between text-primary font-title-md text-title-md font-serif">
                        <span>Tích lũy:</span>
                        <span className="text-secondary font-bold text-headline-sm font-sans">+380 Lật-Xu</span>
                      </div>
                    </div>

                    <div className="cursor-pointer p-space-md rounded-xl bg-surface hover:bg-surface-container-low transition-all flex flex-col justify-between shadow-sm hover:shadow-md border border-outline-variant">
                      <div>
                        <div className="flex items-center justify-between mb-space-sm">
                          <div className="w-10 h-10 rounded-full bg-surface-container-highest text-secondary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[20px]">gavel</span>
                          </div>
                          <span className="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center text-outline"></span>
                        </div>
                        <h3 className="font-title-lg text-title-lg text-primary font-semibold mb-1">Đấu giá trực tiếp</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">Mở phiên 48 giờ để độc giả tranh quyền sở hữu.</p>
                      </div>
                      <div className="mt-space-md pt-space-xs flex items-center justify-between text-primary font-title-md text-title-md font-serif">
                        <span>Khởi điểm:</span>
                        <span className="text-on-surface font-semibold text-headline-sm font-sans">2.500.000 ₫</span>
                      </div>
                    </div>
                  </div>
                </div>

                    <div className="flex justify-between">
                      <button onClick={() => setActiveTab(3)} className="px-space-md py-space-sm rounded bg-surface hover:bg-surface-container-low text-primary font-title-md text-title-md transition-colors border border-outline-variant">Quay lại</button>
                      <button onClick={() => setActiveTab(5)} className="px-space-md py-space-sm rounded bg-primary text-on-primary font-title-md text-title-md hover:bg-primary-container transition-colors">Tiếp tục: Kiểm tra tổng hợp</button>
                    </div>
                  </div>
                )}

                {activeTab === 5 && (
                  <div className="flex flex-col gap-space-lg">
                    {/* SUMMARY TABS */}
                    <h2 className="font-title-lg text-title-lg text-primary font-serif">Tổng hợp thông tin ấn phẩm</h2>
                {/* SECTION A: BƯỚC 1 */}
                <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
                  <div className="flex items-center justify-between pb-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm uppercase font-bold tracking-wider">
                        Mục 01
                      </span>
                      <h2 className="font-title-lg text-title-lg text-primary font-serif">Thông tin ấn phẩm & Thư tịch</h2>
                    </div>
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-secondary text-[18px]">verified_user</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Đã thẩm định dữ liệu</span>
                    </div>
                  </div>

                  <div className="p-space-md rounded bg-surface-container-low flex flex-col md:flex-row items-stretch md:items-center gap-space-sm">
                    <div className="flex-1 flex items-center gap-space-xs bg-surface px-space-md py-space-xs rounded shadow-inner">
                      <span className="material-symbols-outlined text-outline text-[20px]">barcode_scanner</span>
                      <div className="flex flex-col flex-1">
                        <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Mã ISBN / Ký hiệu lưu chiểu cổ</span>
                        <input className="bg-transparent font-title-md text-title-md text-primary font-mono focus:outline-none" readOnly type="text" value="978-604-0-19370-1" />
                      </div>
                    </div>
                    <div className="flex items-center gap-space-xs">
                      <button className="flex items-center gap-1 px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-primary font-title-md text-title-md transition-colors shadow-sm" type="button">
                        <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                        Quét mã vạch
                      </button>
                      <button className="flex items-center gap-1 px-space-md py-space-xs rounded bg-primary text-on-primary font-title-md text-title-md hover:bg-primary-container transition-colors shadow-sm" type="button">
                        <span className="material-symbols-outlined text-[18px]">search</span>
                        Tìm tựa
                      </button>
                    </div>
                  </div>

                  <div className="p-space-md rounded bg-surface-container flex flex-col md:flex-row gap-space-md">
                    <div className="w-full md:w-36 h-48 rounded bg-surface-container-high overflow-hidden shrink-0 shadow-sm relative group">
                      <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="Book cover" src="https://upload.wikimedia.org/wikipedia/vi/4/4e/Sodo_bia.jpg"/>
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-secondary text-on-secondary font-label-sm text-label-sm uppercase tracking-wider">
                        1937 Bản Đầu
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-space-xs mb-space-xs">
                          <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-highest text-primary font-label-sm text-label-sm font-semibold">
                            <span className="material-symbols-outlined text-[14px] text-secondary">menu_book</span>
                            Thư mục Thư tịch Quốc gia Việt Nam
                          </span>
                          <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm">
                            Hội Cổ Thư Hà Nội giám tuyển
                          </span>
                        </div>
                        <h3 className="font-headline-sm text-headline-sm text-primary font-serif">
                          Số Đỏ (Ấn bản đầu tiên 1937 kèm tranh minh họa mộc bản)
                        </h3>
                        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                          Tác giả: <strong className="text-primary font-medium">Vũ Trọng Phụng (1912 - 1939)</strong>
                        </p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-sm pt-space-sm mt-space-sm">
                        <div>
                          <span className="font-label-sm text-label-sm text-outline block">Nhà xuất bản</span>
                          <span className="font-body-sm text-body-sm text-primary font-medium">Lê Cường (Hà Nội, 1937)</span>
                        </div>
                        <div>
                          <span className="font-label-sm text-label-sm text-outline block">Thể loại văn học</span>
                          <span className="font-body-sm text-body-sm text-primary font-medium">Văn học tiền chiến</span>
                        </div>
                        <div>
                          <span className="font-label-sm text-label-sm text-outline block">Quy cách in ấn</span>
                          <span className="font-body-sm text-body-sm text-primary font-medium">248 trang, 14 × 21 cm</span>
                        </div>
                        <div>
                          <span className="font-label-sm text-label-sm text-outline block">Chất liệu giấy</span>
                          <span className="font-body-sm text-body-sm text-primary font-medium">Giấy mộc ngà mỏng</span>
                        </div>
                        <div>
                          <span className="font-label-sm text-label-sm text-outline block">Số lượng bản in gốc</span>
                          <span className="font-body-sm text-body-sm text-primary font-medium">Giới hạn 1.200 bản</span>
                        </div>
                        <div>
                          <span className="font-label-sm text-label-sm text-outline block">Thao tác</span>
                          <button className="text-secondary hover:text-on-secondary-container font-label-sm text-label-sm font-semibold inline-flex items-center gap-1" type="button">
                            <span className="material-symbols-outlined text-[14px]">edit_note</span>
                            Chỉnh sửa chi tiết
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>


                {/* SECTION B: BƯỚC 2 */}
                <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs pb-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm uppercase font-bold tracking-wider">
                        Mục 02
                      </span>
                      <h2 className="font-title-lg text-title-lg text-primary font-serif">Hình ảnh hiện vật thực tế</h2>
                    </div>
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-emerald-700 text-[18px]">check_circle</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Đã tải 4/10 ảnh đối chiếu</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
                    {/* Fake Photos using placeholder URLs */}
                    {[
                      { title: "Cover Front", subtitle: "Mộc bản khắc gỗ", label: "01. Bìa trước", url: "https://upload.wikimedia.org/wikipedia/vi/4/4e/Sodo_bia.jpg" },
                      { title: "Cover Back", subtitle: "Mộc giá Piastre", label: "02. Bìa sau", url: "https://upload.wikimedia.org/wikipedia/commons/4/4c/Sodo_bia_sau.jpg" },
                      { title: "Spine & Stitching", subtitle: "Vết mòn tự nhiên", label: "03. Gáy sách", url: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=400&auto=format&fit=crop" },
                      { title: "Provenance & Ố", subtitle: "Chữ ký tặng 1938", label: "04. Thủ bút quý", url: "https://images.unsplash.com/photo-1585806655189-54805e2bb2da?q=80&w=400&auto=format&fit=crop" }
                    ].map((img, i) => (
                      <div key={i} className="group relative flex flex-col bg-surface-container rounded-lg p-space-xs shadow-sm hover:shadow-md transition-all">
                        <div className="aspect-[3/4] w-full rounded overflow-hidden relative bg-surface-container-high">
                          <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={img.title} src={img.url} />
                          <span className={`absolute top-1.5 left-1.5 ${i === 3 ? 'bg-secondary text-on-secondary' : 'bg-primary/85 text-on-primary'} font-label-sm text-label-sm px-1.5 py-0.5 rounded`}>
                            {img.label}
                          </span>
                          <button className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-surface-container-lowest/80 text-on-surface flex items-center justify-center hover:bg-surface transition-colors shadow" type="button">
                            <span className="material-symbols-outlined text-[14px]">zoom_in</span>
                          </button>
                        </div>
                        <div className="mt-space-xs">
                          <div className="font-title-md text-[13px] text-primary font-semibold truncate">{img.title}</div>
                          <div className="font-label-sm text-label-sm text-on-surface-variant line-clamp-1">{img.subtitle}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-space-sm pt-space-xs">
                    <button className="w-full sm:w-auto inline-flex items-center justify-center gap-space-xs px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-primary font-title-md text-title-md transition-colors shadow-sm" type="button">
                      <span className="material-symbols-outlined text-[20px] text-secondary">add_photo_alternate</span>
                      + Thêm ảnh chi tiết khác (Tối đa 10 ảnh)
                    </button>
                    <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                      Độ phân giải đạt chuẩn HD giám định
                    </div>
                  </div>
                </div>


                {/* SECTION C: BƯỚC 3 */}
                <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs pb-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm uppercase font-bold tracking-wider">Mục 03</span>
                      <h2 className="font-title-lg text-title-lg text-primary font-serif">Checklist thẩm định hao mòn vật lý</h2>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-100 text-emerald-950">
                      <span className="material-symbols-outlined text-[18px] text-emerald-800">verified</span>
                      <span className="font-label-md text-label-md font-bold">Chỉ số: Rất tốt (88/100)</span>
                    </div>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Đánh giá minh bạch giúp tăng <strong>94% độ tin cậy</strong> của người mua và tránh khiếu nại sau giao dịch.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                    <label className="flex items-start gap-space-sm p-space-sm rounded bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors">
                      <input className="mt-1 w-4 h-4 rounded text-primary focus:ring-primary" type="checkbox" />
                      <div className="flex flex-col">
                        <span className="font-title-md text-title-md text-primary font-semibold">Rách trang / Khuyết thiếu</span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">Không rách — Đã kiểm đếm 248/248 trang nguyên vẹn đầy đủ.</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-space-sm p-space-sm rounded bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors shadow-sm">
                      <input defaultChecked className="mt-1 w-4 h-4 rounded text-secondary focus:ring-secondary accent-secondary" type="checkbox"/>
                      <div className="flex flex-col">
                        <span className="font-title-md text-title-md text-primary font-semibold flex items-center gap-1">
                          Ố vàng tự nhiên (Foxing) <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container-highest text-secondary">Mức nhẹ</span>
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">Có ố vàng sậm màu theo năm tháng ở viền mép giấy ngoài.</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-space-sm p-space-sm rounded bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors md:col-span-2">
                      <input defaultChecked className="mt-1 w-4 h-4 rounded text-secondary focus:ring-secondary accent-secondary" type="checkbox"/>
                      <div className="flex flex-col">
                        <span className="font-title-md text-title-md text-secondary font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px]">stars</span>
                          Thủ bút tác giả & Đề tặng (Provenance) <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-secondary text-on-secondary">Tăng giá trị +45%</span>
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface">Trang xi-nê có chữ ký mực tím nguyên bản đề ngày <strong>18 Tháng 4, 1938</strong> tặng học giả nghiên cứu văn học Bắc Kỳ.</span>
                      </div>
                    </label>
                  </div>
                </div>


                {/* SECTION D: BƯỚC 4 */}
                <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs pb-space-sm border-b border-outline-variant/30">
                    <div className="flex items-center gap-space-sm">
                      <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm uppercase font-bold tracking-wider">Mục 04</span>
                      <h2 className="font-title-lg text-title-lg text-primary font-serif">Thông tin nơi gửi sách & Giao vận</h2>
                    </div>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Chọn nơi bạn sẽ gửi cuốn sách. Tên, số điện thoại và địa chỉ chi tiết chỉ hiển thị trong sổ của bạn.</p>

                  <div className="flex flex-col gap-space-sm">
                    {/* Selected Address Card */}
                    <div className="p-space-md rounded-xl bg-surface border-2 border-primary shadow-sm flex items-start gap-space-md relative">
                      <div className="absolute top-3 right-3">
                        <span className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm font-semibold">Mặc định</span>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-surface-container-highest text-primary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[20px]">location_on</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="font-title-md text-title-md text-primary font-semibold">Nguyễn Văn A</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">0901234567</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">123 Đường Số 1, Phường 2, Quận 3, TP.HCM</p>
                        <span className="inline-block mt-2 font-label-sm text-label-sm text-secondary">Giao trực tiếp · TP.HCM · khu vực mô phỏng</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-space-sm mt-space-xs">
                      <button className="px-space-md py-space-xs rounded bg-surface hover:bg-surface-container-low text-primary font-title-md text-title-md transition-colors border border-outline-variant" type="button">
                        Chọn địa chỉ khác
                      </button>
                      <button className="px-space-md py-space-xs rounded bg-surface hover:bg-surface-container-low text-primary font-title-md text-title-md transition-colors border border-outline-variant flex items-center gap-1" type="button">
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        Thêm địa chỉ mới
                      </button>
                    </div>

                    <p className="font-label-sm text-label-sm text-outline mt-space-sm">
                      Hiện mới lưu lựa chọn giao trực tiếp. Chưa tính phí, đặt giao hàng hay nhận sách qua điểm. Thay đổi nơi gửi trên bài đã duyệt cần được duyệt lại.
                    </p>
                  </div>
                </div>


                {/* SECTION E: BƯỚC 5 */}
                <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
                  <div className="flex items-center justify-between pb-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm uppercase font-bold tracking-wider">Mục 05</span>
                      <h2 className="font-title-lg text-title-lg text-primary font-serif">Chọn hình thức giao dịch & Chuyển nhượng</h2>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
                    <div className="cursor-pointer p-space-md rounded-xl bg-surface-container-low transition-all relative flex flex-col justify-between shadow-sm hover:shadow-md border-2 border-primary">
                      <div className="absolute -top-3 left-4 px-2 py-0.5 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold">Đang kích hoạt</div>
                      <div>
                        <div className="flex items-center justify-between mt-1 mb-space-sm">
                          <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[20px]">sell</span>
                          </div>
                          <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-on-primary">
                            <span className="material-symbols-outlined text-[14px]">check</span>
                          </span>
                        </div>
                        <h3 className="font-title-lg text-title-lg text-primary font-semibold mb-1">Bán trực tiếp</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">Người mua thanh toán tiền mặt/chuyển khoản qua sàn.</p>
                      </div>
                      <div className="mt-space-md pt-space-xs flex items-center justify-between text-primary font-title-md text-title-md font-serif">
                        <span>Giá niêm yết:</span>
                        <span className="text-secondary font-bold text-headline-sm font-sans">4.850.000 ₫</span>
                      </div>
                    </div>
                    
                    <div className="cursor-pointer p-space-md rounded-xl bg-surface hover:bg-surface-container-low transition-all flex flex-col justify-between shadow-sm hover:shadow-md border border-outline-variant">
                      <div>
                        <div className="flex items-center justify-between mb-space-sm">
                          <div className="w-10 h-10 rounded-full bg-surface-container-highest text-secondary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[20px]">token</span>
                          </div>
                          <span className="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center text-outline"></span>
                        </div>
                        <h3 className="font-title-lg text-title-lg text-primary font-semibold mb-1">Đổi lấy Lật-Xu</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">Không nhận tiền mặt, cộng 380 Xu vĩnh viễn vào tài khoản.</p>
                      </div>
                      <div className="mt-space-md pt-space-xs flex items-center justify-between text-primary font-title-md text-title-md font-serif">
                        <span>Tích lũy:</span>
                        <span className="text-secondary font-bold text-headline-sm font-sans">+380 Lật-Xu</span>
                      </div>
                    </div>

                    <div className="cursor-pointer p-space-md rounded-xl bg-surface hover:bg-surface-container-low transition-all flex flex-col justify-between shadow-sm hover:shadow-md border border-outline-variant">
                      <div>
                        <div className="flex items-center justify-between mb-space-sm">
                          <div className="w-10 h-10 rounded-full bg-surface-container-highest text-secondary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[20px]">gavel</span>
                          </div>
                          <span className="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center text-outline"></span>
                        </div>
                        <h3 className="font-title-lg text-title-lg text-primary font-semibold mb-1">Đấu giá trực tiếp</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">Mở phiên 48 giờ để độc giả tranh quyền sở hữu.</p>
                      </div>
                      <div className="mt-space-md pt-space-xs flex items-center justify-between text-primary font-title-md text-title-md font-serif">
                        <span>Khởi điểm:</span>
                        <span className="text-on-surface font-semibold text-headline-sm font-sans">2.500.000 ₫</span>
                      </div>
                    </div>
                  </div>
                </div>

                    
                    {/* AI ASSIST & FINAL ACTION */}
              {/* RIGHT SIDEBAR - AI ASSIST CARD */}
              <div className="w-full flex flex-col gap-space-lg">
                <div className=" flex flex-col gap-space-md">
                  <div className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-xl relative overflow-hidden">
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-secondary/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
                    
                    <div className="flex items-start justify-between gap-space-sm pb-space-md relative">
                      <div className="flex items-center gap-space-sm">
                        <div className="w-11 h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-[0_2px_10px_rgba(0,38,26,0.3)]">
                          <span className="material-symbols-outlined text-[24px]">psychology</span>
                        </div>
                        <div>
                          <span className="font-label-sm text-label-sm text-secondary uppercase font-bold tracking-widest block">Hội Đồng Thuật Toán</span>
                          <h3 className="font-title-lg text-title-lg text-primary font-serif font-bold leading-tight">
                            Lật Lại AI Price Assist <span className="font-sans text-xs bg-surface-container px-1 py-0.5 rounded text-on-surface-variant font-normal">v2.4</span>
                          </h3>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-label-sm text-label-sm font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>Trực tiếp
                      </span>
                    </div>

                    <div className="p-space-xs rounded bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm flex items-center gap-1 mb-space-md relative">
                      <span className="material-symbols-outlined text-secondary text-[16px]">query_stats</span>
                      Phân tích dữ liệu đối chiếu <strong>14.280+ giao dịch</strong> cổ thư Việt Nam
                    </div>

                    <div className="p-space-md rounded-xl bg-surface-container mb-space-md relative">
                      <div className="font-label-md text-label-md text-primary font-semibold flex items-center gap-1 mb-1">
                        <span className="material-symbols-outlined text-[16px] text-secondary">lightbulb</span> Căn cứ & Luận chứng định giá
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                        Ấn bản <em>Số Đỏ</em> (NXB Lê Cường, 1937) có thủ bút tác giả Vũ Trọng Phụng thuộc nhóm <strong>hiếm cấp độ IV</strong>. Thị trường ghi nhận 3 giao dịch tương đồng trong 18 tháng qua. Tình trạng sách của bạn đạt điểm 88/100, giữ nguyên bản không tẩy hóa chất.
                      </p>
                    </div>

                    <div className="p-space-md rounded-xl bg-surface-container-high flex flex-col items-center justify-center text-center mb-space-md relative border border-primary/20">
                      <span className="font-label-sm text-label-sm text-secondary uppercase font-bold tracking-widest mb-1">Mức giá đề xuất bán tối ưu</span>
                      <div className="font-headline-xl text-headline-xl text-primary font-bold tracking-tight">
                        4.850.000 <span className="text-headline-sm font-serif font-normal text-on-surface-variant">₫</span>
                      </div>
                      <span className="font-label-sm text-label-sm text-emerald-800 font-medium mt-1 inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">trending_up</span> Khả năng thanh khoản thành công trong 7 ngày: ~91%
                      </span>
                    </div>

                    <div className="flex flex-col gap-space-xs mb-space-md relative">
                      <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
                        <span>Tối thiểu: 3tr</span>
                        <span className="font-semibold text-primary">Mốc chọn: 4.85tr</span>
                        <span>Tối đa: 7tr</span>
                      </div>
                      <div className="relative py-2">
                        <input className="w-full h-2 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-secondary" max="7000000" min="3000000" step="50000" type="range" defaultValue="4850000"/>
                      </div>
                    </div>

                    <div className="flex flex-col gap-space-xs relative">
                      <button className="w-full py-space-sm px-space-md rounded bg-secondary text-on-secondary font-title-md text-title-md hover:bg-on-secondary-container transition-all flex items-center justify-center gap-1.5 shadow-[0_2px_10px_rgba(153,69,48,0.25)]" type="button">
                        <span className="material-symbols-outlined text-[20px]">auto_awesome</span> Áp dụng mức giá 4.850.000₫
                      </button>
                      <button className="w-full py-space-sm px-space-md rounded bg-surface hover:bg-surface-container text-primary font-title-md text-title-md transition-all border border-outline-variant" type="button">
                        Tôi muốn tự định giá
                      </button>
                    </div>
                  </div>
                  
                  {/* Final Action sticky */}
                  <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-emerald-100 flex flex-col gap-3">
                    <button className="w-full py-space-md px-space-md rounded bg-primary text-on-primary font-title-md text-title-md hover:bg-primary-container transition-all flex items-center justify-center gap-2" type="button">
                      Hoàn tất & Lưu ký chờ duyệt <span className="material-symbols-outlined text-[20px]">send</span>
                    </button>
                    <p className="text-center font-label-sm text-label-sm text-on-surface-variant">Bằng cách tiếp tục, bạn đồng ý với Quy chế thẩm định cổ thư của mạng lưới Lật Lại.</p>
                  </div>

                </div>
              </div>


                  </div>
                )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}

