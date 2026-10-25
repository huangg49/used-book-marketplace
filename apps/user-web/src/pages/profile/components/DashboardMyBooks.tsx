import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ArrowRight, ArrowUpRight, Edit, Eye, ImageOff } from "lucide-react";
import { myListingsQuery } from "../../../lib/owner-listing-queries";
import { getMyPhoto } from "../../../services/my-listings";
import { ROUTES, formatVnd } from "../../../lib/routes";

function MyListingPhoto({ listingId, mediaId }: { listingId: string; mediaId: string }) {
  const photo = useQuery({
    queryKey: ["my-photo", listingId, mediaId],
    queryFn: () => getMyPhoto(listingId, mediaId),
  });

  if (photo.isLoading) {
    return <div className="w-full h-full bg-surface-container-high animate-pulse" />;
  }

  if (photo.isError || !photo.data?.url) {
    return (
      <div className="w-full h-full bg-surface-container-high flex flex-col items-center justify-center text-on-surface-variant gap-1">
        <ImageOff size={20} />
        {photo.isError && (
          <button
            type="button"
            onClick={() => void photo.refetch()}
            className="text-[10px] underline text-primary font-medium"
          >
            Tải lại ảnh
          </button>
        )}
      </div>
    );
  }

  return (
    <img
      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      src={photo.data.url}
      alt="Ảnh bản sách"
    />
  );
}

interface DashboardMyBooksProps {
  ownerId: string;
}

export function DashboardMyBooks({ ownerId }: DashboardMyBooksProps) {
  const [filter, setFilter] = useState<string>("Approved");

  const { data, isPending, isError, refetch } = useQuery(
    myListingsQuery(ownerId, filter === "All" ? "" : filter, undefined, 8)
  );

  const items = data?.items || [];

  return (
    <section
      id="overview-books-section"
      aria-labelledby="overview-books"
      className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-lg border border-outline-variant/30"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-surface-container-high/40 pb-space-sm">
        <div>
          <h2 id="overview-books" className="text-xl md:text-2xl text-primary font-bold tracking-normal">
            Kệ cập nhật gần đây
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Những bản sách bạn vừa chăm chút. Quản lý hiện trạng niêm yết và giao lưu tác phẩm.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="inline-flex p-1 rounded-lg bg-surface-container-high gap-1 flex-wrap" id="shelfTabs">
          <button
            onClick={() => setFilter("Approved")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              filter === "Approved"
                ? "bg-surface-container-lowest text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
            type="button"
          >
            Đang hiển thị
          </button>
          <button
            onClick={() => setFilter("PendingReview")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              filter === "PendingReview"
                ? "bg-surface-container-lowest text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
            type="button"
          >
            Chờ duyệt
          </button>
          <button
            onClick={() => setFilter("Draft")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              filter === "Draft"
                ? "bg-surface-container-lowest text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
            type="button"
          >
            Bản nháp
          </button>
          <button
            onClick={() => setFilter("All")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              filter === "All"
                ? "bg-surface-container-lowest text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
            type="button"
          >
            Tất cả
          </button>
        </div>
      </div>

      {isPending ? (
        <div className="flex justify-center items-center py-12" role="status">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : isError ? (
        <div className="p-6 bg-error-container/30 rounded-lg text-error text-sm flex items-center justify-between" role="alert">
          <span>Chưa tải được kệ sách. Kiểm tra kết nối rồi thử lại.</span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="px-3 py-1 bg-surface-container-high text-primary rounded font-semibold text-xs hover:bg-surface-dim"
          >
            Thử lại
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-on-surface-variant">
          <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-secondary mb-3">
            <BookOpen size={24} />
          </div>
          <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
            Một chỗ trống cho cuốn sách đầu tiên.
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-sm mt-1">
            Đăng cuốn đã đọc xong để tìm người đọc tiếp theo.
          </p>
          <Link
            to={ROUTES.sell}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded bg-secondary text-on-secondary text-sm font-semibold hover:bg-on-secondary-container transition-colors shadow-sm"
          >
            <span>Đăng cuốn đầu tiên</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => {
            const content = item.currentRevision.content;
            const book = (item.currentRevision as any).book;
            const firstMediaId = content?.mediaIds?.[0];
            const modeText =
              content?.mode === "Sale"
                ? "Bán trực tiếp"
                : content?.mode === "Exchange"
                ? "Giao lưu & Đổi"
                : "Bán & Đổi";
            const modeColor =
              content?.mode === "Sale"
                ? "bg-primary text-on-primary"
                : "bg-tertiary text-on-tertiary";

            return (
              <div
                key={item.id}
                className="bg-surface-container-low rounded-xl p-3 sm:p-3.5 flex flex-col justify-between group hover:shadow-md transition-all border border-outline-variant/30"
              >
                <div className="flex flex-col gap-3">
                  <div className="w-full aspect-[3/4] rounded-lg bg-surface-container-high overflow-hidden relative shadow-sm">
                    {firstMediaId ? (
                      <MyListingPhoto listingId={item.id} mediaId={firstMediaId} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-on-surface-variant opacity-50">
                        <BookOpen size={36} />
                      </div>
                    )}
                    <span className={`absolute top-2 left-2 font-label-sm text-[10px] sm:text-[11px] px-2 py-0.5 rounded shadow-sm ${modeColor}`}>
                      {modeText}
                    </span>
                    <span className="absolute top-2 right-2 bg-surface-container-lowest/90 backdrop-blur text-primary font-label-sm text-[10px] sm:text-[11px] px-2 py-0.5 rounded font-medium shadow-sm">
                      {content?.condition || "Đã qua sử dụng"}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-xs">
                      <span className="line-clamp-1 mr-2">
                        {book?.authors?.join(", ") || content?.author || "Đang cập nhật"}
                      </span>
                      <span className="whitespace-nowrap">
                        {book?.publicationYear ? `Năm ${book.publicationYear}` : ""}
                      </span>
                    </div>

                    <h3
                      className="font-title-md text-sm sm:text-base text-primary font-bold line-clamp-2 h-[2.6em] leading-snug"
                      title={book?.title || content?.title || "Bản thảo"}
                    >
                      {book?.title || content?.title || "Bản thảo chưa hoàn tất"}
                    </h3>

                    <div className="flex items-center justify-between mt-1">
                      <span className="font-currency-display text-sm sm:text-base text-primary font-bold">
                        {content?.salePrice ? formatVnd(content.salePrice) : "Thỏa thuận"}
                      </span>
                      <span className="text-xs text-on-surface-variant flex items-center gap-1">
                        <Eye size={13} />
                        Xem chi tiết
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 mt-3 flex items-center justify-between gap-1 border-t border-outline-variant/30">
                  <span className="inline-flex items-center gap-1 text-[11px] font-label-sm text-primary uppercase font-semibold">
                    <span
                      className={`w-1.5 h-1.5 rounded-full inline-block ${
                        item.state.trade === "Available" ? "bg-primary" : "bg-outline"
                      }`}
                    />
                    {item.state.moderation === "Approved" ? "Đang mở bán" : item.state.moderation}
                  </span>

                  <div className="flex items-center gap-1">
                    <Link
                      to={`${ROUTES.myBooks}?edit=${item.id}`}
                      className="px-2.5 py-1 rounded bg-surface-container-high text-primary font-label-md text-xs hover:bg-surface-dim transition-colors flex items-center gap-1 font-medium"
                    >
                      <Edit size={12} />
                      Chỉnh sửa
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer shelf CTA */}
      <div className="flex justify-center pt-space-xs border-t border-surface-container-high/40">
        <Link
          to={ROUTES.myBooks}
          className="inline-flex items-center gap-2 text-primary font-title-md text-sm hover:text-secondary transition-colors font-bold"
        >
          <span>Xem toàn bộ kệ</span>
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </section>
  );
}