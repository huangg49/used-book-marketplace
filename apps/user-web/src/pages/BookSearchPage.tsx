
import { SearchHero } from '../components/BookSearch/SearchHero';
import { FilterSidebar } from '../components/BookSearch/FilterSidebar';
import { MobileFilterDrawer } from '../components/BookSearch/MobileFilterDrawer';
import { SearchBookCard } from '../components/BookSearch/SearchBookCard';
import { SortDropdown } from '../components/BookSearch/SortDropdown';
import { MOCK_BOOKS } from '../components/BookSearch/mockBooks';
import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1, y: 0,
    transition: { type: "spring", stiffness: 260, damping: 20 }
  }
};

export function BookSearchPage() {
  // @ts-expect-error unused
  const [searchParams, setSearchParams] = useSearchParams();

  // Create exactly 30 books by repeating the mock books
  
  const [activeFilters, setActiveFilters] = useState([
    { id: 'cat_tien_chien', label: 'Thời kỳ: 1930 - 1945', type: 'category' },
    { id: 'cond_like_new', label: 'Tình trạng: Rất tốt (Like New)', type: 'condition' },
    { id: 'trans_direct', label: 'Giao dịch: Bán trực tiếp', type: 'transaction' },
    { id: 'attr_rare', label: 'Sách hiếm: Có thẩm định', type: 'attribute', icon: 'verified' },
    { id: 'attr_signed', label: 'Có thủ bút / Chữ ký', type: 'attribute', icon: 'history_edu' }
  ]);

  const toggleFilter = (filter: any) => {
    setActiveFilters(prev => {
      const exists = prev.find(f => f.id === filter.id);
      if (exists) return prev.filter(f => f.id !== filter.id);
      return [...prev, filter];
    });
  };

  const removeFilter = (id: string) => {
    setActiveFilters(prev => prev.filter(f => f.id !== id));
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
  };

  const displayBooks = Array(4).fill(MOCK_BOOKS).flat().slice(0, 30);

  return (
    <div className="bg-background text-on-surface flex-1 w-full">
      <main className="flex-grow">
        <div className="flex flex-col w-full">
          <SearchHero activeFilters={activeFilters} removeFilter={removeFilter} clearAllFilters={clearAllFilters} />

          <div className="w-full px-space-sm md:px-space-md lg:px-space-lg xl:px-8 py-space-md flex flex-col lg:flex-row gap-space-lg relative items-start">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="w-[280px] xl:w-[300px] shrink-0"
            >
              <FilterSidebar activeFilters={activeFilters} toggleFilter={toggleFilter} />
            </motion.div>

            <div className="flex-1 min-w-0 flex flex-col">
              {/* Results Header Controls Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-space-md pb-space-sm border-b border-outline-variant">
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Hiển thị <span className="font-bold text-primary">1–30</span> trên <span className="font-bold text-primary">12.800</span> ấn phẩm
                </p>
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <SortDropdown />
                  <div className="flex bg-surface-container border border-outline-variant rounded p-0.5">
                    <button className="p-1 rounded bg-surface shadow-xs text-primary"><span className="material-symbols-outlined text-[18px] block">grid_view</span></button>
                    <button className="p-1 rounded text-on-surface-variant hover:text-primary transition-colors"><span className="material-symbols-outlined text-[18px] block">view_list</span></button>
                  </div>
                </div>
              </div>

              {/*  Results Grid  */}
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3"
              >
                {displayBooks.map((book, idx) => (
                  <motion.div key={book.id + '_' + idx} variants={itemVariants}>
                    <SearchBookCard book={book} />
                  </motion.div>
                ))}
              </motion.div>

              {/*  Pagination  */}
              <div className="mt-space-xl pt-space-md border-t border-outline-variant flex flex-col items-center gap-space-md">
                <nav aria-label="Pagination" className="flex items-center gap-1">
                  <button className="w-8 h-8 flex items-center justify-center rounded text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors" disabled>
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                  <button className="w-8 h-8 flex items-center justify-center rounded bg-primary text-on-primary font-title-sm shadow-xs">1</button>
                  <button className="w-8 h-8 flex items-center justify-center rounded text-on-surface hover:bg-surface-container hover:text-primary transition-colors font-title-sm">2</button>
                  <button className="w-8 h-8 flex items-center justify-center rounded text-on-surface hover:bg-surface-container hover:text-primary transition-colors font-title-sm">3</button>
                  <span className="w-8 h-8 flex items-center justify-center text-on-surface-variant">...</span>
                  <button className="w-8 h-8 flex items-center justify-center rounded text-on-surface hover:bg-surface-container hover:text-primary transition-colors font-title-sm">42</button>
                  <button className="w-8 h-8 flex items-center justify-center rounded text-on-surface hover:bg-surface-container hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </nav>
                <div className="bg-secondary-container/50 border border-secondary/20 rounded-lg p-space-sm max-w-lg w-full text-center">
                  <span className="material-symbols-outlined text-secondary text-[24px] mb-1">auto_stories</span>
                  <h4 className="font-title-sm text-title-sm text-primary font-bold">Không tìm thấy bản thảo bạn cần?</h4>
                  <p className="text-xs text-on-surface-variant mt-0.5">Chúng tôi nhận săn tìm sách hiếm, thủ bút và tài liệu lưu trữ theo yêu cầu. <a className="text-secondary font-medium hover:underline" href="#">Gửi yêu cầu thẩm tuyển →</a></p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      <MobileFilterDrawer />
    </div>
  );
}
