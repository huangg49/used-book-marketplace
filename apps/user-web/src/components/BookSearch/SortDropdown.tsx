import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const sortOptions = [
  { value: 'newest', label: 'Mới cập nhật' },
  { value: 'rare', label: 'Độ hiếm cao nhất' },
  { value: 'price_asc', label: 'Giá: Thấp đến Cao' },
  { value: 'price_desc', label: 'Giá: Cao đến Thấp' },
];

export function SortDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(sortOptions[1]); // Default is 'rare'
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative z-20" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-[#E8F5E9] border border-[#C8E6C9] text-gray-800 font-title-sm text-title-sm py-2 pl-4 pr-3 rounded-md focus:outline-none focus:border-[#81C784] hover:border-[#A5D6A7] transition-colors cursor-pointer w-56 shadow-sm"
      >
        <span className="flex-1 text-left truncate font-medium">{selected.label}</span>
        <span className={`material-symbols-outlined text-gray-600 text-[20px] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-lg border border-[#C8E6C9] overflow-hidden origin-top-right"
          >
            <div className="flex flex-col divide-y divide-[#E8F5E9]">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSelected(option);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 text-title-sm transition-colors flex justify-between items-center ${
                    selected.value === option.value
                      ? 'bg-[#E8F5E9] text-gray-900 font-bold'
                      : 'text-gray-700 hover:bg-[#F1F8F1] hover:text-gray-900'
                  }`}
                >
                  {option.label}
                  {selected.value === option.value && (
                    <span className="material-symbols-outlined text-[18px]">check</span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
