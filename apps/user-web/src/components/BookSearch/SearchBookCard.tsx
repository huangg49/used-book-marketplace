export interface BookData {
  id: string;
  title: string;
  authorInfo: string;
  image: string;
  price: string;
  condition: string;
  badge1?: string;
  badge2?: string;
  isRare?: boolean;
}

export function SearchBookCard({ book }: { book: BookData }) {
  return (
    <div className="group flex flex-col bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-xs hover:shadow-md hover:border-outline transition-all duration-200 h-full">
      <div className="relative w-full aspect-[3/4] bg-surface-container overflow-hidden">
        <img alt={book.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src={book.image}/>
        <div className="absolute inset-y-0 left-0 w-3 pointer-events-none spine-crease"></div>
        {/*  Badges  */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
          {book.badge1 && (
            <span className="bg-primary text-on-primary font-label-sm text-[10px] uppercase font-bold px-2 py-0.5 rounded shadow-sm">
              {book.badge1}
            </span>
          )}
          {book.badge2 && (
            <span className="bg-secondary-container text-on-secondary-container font-label-sm text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[11px]">history_edu</span>
              {book.badge2}
            </span>
          )}
        </div>
        <button className="absolute top-2 right-2 p-1.5 rounded-full bg-surface/80 backdrop-blur-xs text-on-surface hover:text-secondary hover:bg-surface transition-colors" title="Lưu tác phẩm">
          <span className="material-symbols-outlined text-[18px]">bookmark</span>
        </button>
      </div>
      <div className="p-3 sm:p-3.5 flex flex-col flex-grow justify-between gap-2.5">
        <div className="space-y-1">
          <span className="text-[11px] font-label-sm text-outline block">{book.authorInfo}</span>
          <h3 className="font-title-md text-[16px] leading-tight text-primary font-bold line-clamp-2 group-hover:text-secondary transition-colors">
            {book.title}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant pt-1">
            <span className="bg-surface-container px-2 py-0.5 rounded font-label-sm text-label-sm text-primary font-medium">{book.condition}</span>
            {book.isRare && <span className="text-[11px] text-outline truncate">Bản lưu trữ thư khố</span>}
          </div>
        </div>
        <div className="pt-2.5 border-t border-outline-variant flex items-center justify-between gap-1">
          <div>
            <span className="text-[10px] text-outline block">Giá chuyển giao</span>
            <span className="font-currency-display text-currency-display text-secondary font-bold">{book.price}</span>
          </div>
          <button className="bg-primary-container hover:bg-primary text-on-primary px-3 py-1.5 rounded font-title-md text-xs transition-colors shadow-xs">
            Mua ngay
          </button>
        </div>
      </div>
    </div>
  );
}
