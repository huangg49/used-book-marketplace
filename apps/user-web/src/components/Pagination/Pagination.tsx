import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./Pagination.module.css";

export interface PaginationProps {
  ariaLabel?: string;
  pageLabel?: string;
  previousLabel?: string;
  summaryOverride?: string;
  /** Trang hiện tại (bắt đầu từ 1) */
  page: number;
  /** Tổng số trang (nếu biết trước) */
  totalPages?: number;
  /** Tổng số bản ghi / mục */
  totalItems?: number;
  /** Số lượng mục trên mỗi trang */
  pageSize?: number;
  /** Số mục thực sự đang hiển thị khi API không cung cấp tổng */
  itemCount?: number;
  /** Tên danh từ của mục (vd: 'giao dịch', 'cuốn sách', 'nhận xét') */
  itemLabel?: string;
  /** Hàm callback khi người dùng bấm chọn trang */
  onPageChange: (newPage: number) => void;
  /** Có trang trước hay không (nếu không truyền sẽ tự tính `page > 1`) */
  hasPrev?: boolean;
  /** Có trang sau hay không (nếu không truyền sẽ tự tính `page < totalPages`) */
  hasNext?: boolean;
  /** Trạng thái đang tải dữ liệu */
  isLoading?: boolean;
  /** Chế độ hiển thị: 'full' (đầy đủ số trang + tóm tắt), 'simple' (nút trước/sau), 'compact' (chỉ trước/sau và chỉ báo trang) */
  variant?: "full" | "simple" | "compact";
  /** Có hiển thị tóm tắt không (mặc định: true, riêng compact: false) */
  showSummary?: boolean;
  /** Có hiển thị đường viền phía trên hay không (mặc định: false) */
  bordered?: boolean;
  /** Tùy biến class container ngoài */
  className?: string;
  /** Tùy chọn chèn thêm nội dung bên trái hoặc phải */
  extraContent?: ReactNode;
  /** Ẩn toàn bộ phân trang nếu chỉ có 1 trang duy nhất (mặc định: false) */
  hideOnSinglePage?: boolean;
}

/**
 * Thuật toán sinh danh sách số trang thông minh với dấu ba chấm (Ellipsis)
 */
function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // Luôn giữ trang đầu và trang cuối
  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages];
}

export function Pagination({
  ariaLabel = "Điều hướng phân trang",
  pageLabel,
  previousLabel = "Trước",
  summaryOverride,
  page,
  totalPages,
  totalItems,
  pageSize = 10,
  itemLabel = "mục",
  itemCount,
  onPageChange,
  hasPrev,
  hasNext,
  isLoading = false,
  variant = "full",
  showSummary,
  bordered = false,
  className,
  extraContent,
  hideOnSinglePage = false,
}: PaginationProps) {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 10;
  const count = totalItems !== undefined && Number.isFinite(totalItems)
    ? Math.max(0, Math.floor(totalItems)) : undefined;
  const knownPages = totalPages !== undefined && Number.isFinite(totalPages)
    ? Math.max(0, Math.floor(totalPages)) : undefined;
  const computedTotalPages = count !== undefined
    ? Math.min(knownPages ?? Infinity, Math.ceil(count / size)) : knownPages;
  const requestedPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const safePage = Math.min(requestedPage, Math.max(1, computedTotalPages ?? requestedPage));
  const isEmpty = computedTotalPages === 0;
  const canGoPrev = !isEmpty && safePage > 1 && (hasPrev ?? true);
  const canGoNext = !isEmpty && (computedTotalPages === undefined || safePage < computedTotalPages)
    && (hasNext ?? (computedTotalPages !== undefined));

  if (hideOnSinglePage && computedTotalPages !== undefined && computedTotalPages <= 1) return null;

  const numbered = variant === "full" && computedTotalPages !== undefined && !isEmpty;
  const pageNumbers = numbered ? getPageNumbers(safePage, computedTotalPages) : [];
  const visibleCount = count !== undefined
    ? Math.min(size, Math.max(0, count - (safePage - 1) * size))
    : itemCount !== undefined && Number.isFinite(itemCount)
      ? Math.min(size, Math.max(0, Math.floor(itemCount))) : undefined;
  const rangeStart = visibleCount ? (safePage - 1) * size + 1 : 0;
  const rangeEnd = visibleCount ? rangeStart + visibleCount - 1 : 0;
  const summary = count === 0 || isEmpty ? `Chưa có ${itemLabel}`
    : visibleCount === 0 ? `Chưa có ${itemLabel} trong dữ liệu đã tải`
    : visibleCount !== undefined
      ? `Hiển thị ${rangeStart === rangeEnd ? rangeStart : `${rangeStart}–${rangeEnd}`}${count !== undefined ? ` trong ${count}` : ""} ${itemLabel}`
      : undefined;
  const renderSummary = showSummary ?? variant !== "compact";
  const changePage = (next: number) => {
    if (!isLoading && next !== safePage) onPageChange(next);
  };

  return (
    <nav
      className={`${styles.paginationRoot} ${bordered ? styles.bordered : ""} ${className || ""}`}
      aria-label={ariaLabel}
      aria-busy={isLoading}
    >
      {renderSummary && (summaryOverride || summary) && (
        <div className={styles.summaryWrap} role="status" aria-live="polite" aria-atomic="true">
          <span className={styles.summaryText}>{summaryOverride || summary}</span>
        </div>
      )}

      {/* Cụm điều khiển phân trang */}
      <div className={styles.controlsWrap}>
        {/* Nút Trang trước */}
        <button
          type="button"
          className={styles.navBtn}
          disabled={!canGoPrev || isLoading}
          onClick={() => canGoPrev && changePage(safePage - 1)}
          aria-label={previousLabel === "Trước" ? "Đến trang trước" : "Về trang đầu"}
          title="Trang trước"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          <span className={styles.navBtnLabel}>{previousLabel}</span>
        </button>

        {/* Danh sách các số trang (nếu ở chế độ full hoặc có totalPages) */}
        {numbered && (
          <div className={styles.pageNumbersList}>
            {pageNumbers.map((item, index) => {
              if (item === "ellipsis") {
                return (
                  <span
                    key={`ellipsis-${index}`}
                    className={styles.ellipsisItem}
                    aria-hidden="true"
                  >
                    …
                  </span>
                );
              }

              const isCurrent = item === safePage;
              return (
                <button
                  key={item}
                  type="button"
                  className={`${styles.pageNumberBtn} ${isCurrent ? styles.pageActive : ""}`}
                  aria-current={isCurrent ? "page" : undefined}
                  aria-label={`Trang ${item}`}
                  disabled={isLoading}
                  onClick={() => changePage(item)}
                >
                  {item}
                </button>
              );
            })}
          </div>
        )}

        <div className={`${styles.simplePageBadge} ${numbered ? styles.mobileBadge : ""}`} aria-current="page">
          {pageLabel ?? (isEmpty ? "Không có trang" : `Trang ${safePage}${computedTotalPages !== undefined ? ` / ${computedTotalPages}` : ""}`)}
        </div>

        {/* Nút Trang sau */}
        <button
          type="button"
          className={styles.navBtn}
          disabled={!canGoNext || isLoading}
          onClick={() => canGoNext && changePage(safePage + 1)}
          aria-label="Đến trang tiếp theo"
          title="Trang tiếp theo"
        >
          <span className={styles.navBtnLabel}>Sau</span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>

      {extraContent && <div className={styles.extraWrap}>{extraContent}</div>}
    </nav>
  );
}
