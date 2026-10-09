import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { ROUTES, formatVnd } from "../lib/routes";
import {
  getPublicPhoto,
  type PublicListing,
} from "../services/public-listings";

export interface BookCardProps {
  book: PublicListing;
  index: number;
}
const conditions = {
  LikeNew: "Gần như mới",
  Good: "Còn tốt",
  Fair: "Đã dùng nhiều",
  Worn: "Cũ nhiều",
};
export function BookCard({ book }: BookCardProps) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const photoId = book.photos[0]?.id;
  const photo = useQuery({
    queryKey: ["public-photo", book.id, book.revisionId, photoId],
    queryFn: () => getPublicPhoto(book.id, photoId!),
    enabled: !!photoId,
    staleTime: 0,
    retry: false,
  });
  const photoUrl = photo.data?.url;
  const imageError = photo.isError || (!!photoUrl && failedUrl === photoUrl);
  return (
    <article className="group flex flex-col bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-xs hover:shadow-md hover:border-outline transition-all duration-200 h-full">
      <Link
        to={ROUTES.bookDetail(book.id)}
        className="relative w-full aspect-[3/4] bg-surface-container overflow-hidden block"
      >
        {photoUrl && !imageError ? (
          <img
            src={photoUrl}
            alt={`Bìa sách ${book.book.title}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={() => setFailedUrl(photoUrl)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-outline bg-surface-container group-hover:scale-105 transition-transform duration-300">
            <BookOpen aria-hidden="true" className="mb-2" />
            <span className="text-xs">
              {imageError
                ? "Chưa tải được ảnh"
                : photoId
                  ? "Đang tải ảnh…"
                  : "Chưa có ảnh bìa"}
            </span>
          </div>
        )}
        <div
          className="absolute inset-y-0 left-0 w-3 pointer-events-none spine-crease"
          style={{ boxShadow: "inset 3px 0 6px -1px rgba(36, 35, 31, 0.22)" }}
        ></div>
        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
          {book.exchangeValue !== null && book.salePrice === null && (
            <span className="bg-primary text-on-primary font-label-sm text-[10px] uppercase font-bold px-2 py-0.5 rounded shadow-sm">
              Đổi Lật-Xu
            </span>
          )}
        </div>
        {/* Bookmark button */}
        <button
          className="absolute top-2 right-2 p-1.5 rounded-full bg-surface/80 backdrop-blur-xs text-on-surface hover:text-secondary hover:bg-surface transition-colors"
          title="Lưu tác phẩm"
        >
          <span className="material-symbols-outlined text-[18px]">
            bookmark_border
          </span>
        </button>
      </Link>

      {/* Metadata Details */}
      <div className="p-3 sm:p-3.5 flex flex-col flex-grow justify-between gap-2.5">
        <div className="space-y-1">
          <span
            className="text-[11px] font-label-sm text-outline block truncate"
            title={book.book.authors.join(", ")}
          >
            {book.book.authors.join(", ")} • {book.book.category || "Khác"}
          </span>
          <h3
            className="font-headline-sm text-[16px] leading-tight text-primary font-bold line-clamp-2 group-hover:text-secondary transition-colors"
            title={book.book.title}
          >
            <Link to={ROUTES.bookDetail(book.id)}>{book.book.title}</Link>
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant pt-1">
            <span className="bg-surface-container px-2 py-0.5 rounded font-label-sm text-label-sm text-primary font-medium">
              {conditions[book.condition]}
            </span>
          </div>
        </div>

        {/* Transaction Footer */}
        <div className="pt-2.5 border-t border-outline-variant flex items-center justify-between gap-1">
          <div>
            <span className="text-[10px] text-outline block">
              {book.salePrice !== null ? "Giá bán" : "Điểm đổi"}
            </span>
            <span className="font-currency-display text-currency-display text-secondary font-bold">
              {book.salePrice !== null
                ? formatVnd(book.salePrice)
                : `${book.exchangeValue} Xu`}
            </span>
          </div>
          <Link
            to={ROUTES.bookDetail(book.id)}
            className="bg-primary-container hover:bg-primary text-on-primary px-3 py-1.5 rounded font-title-md text-xs transition-colors shadow-xs"
          >
            {book.salePrice !== null ? "Mua ngay" : "Xem ngay"}
          </Link>
        </div>
      </div>
    </article>
  );
}
