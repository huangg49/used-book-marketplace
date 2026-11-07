import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import styles from "./Pagination.module.css";

export interface PaginationProps {
  ariaLabel?: string;
  pageLabel?: string;
  previousLabel?: string;
  summaryOverride?: string;
  /** Số trang có thể mở trực tiếp từ cache/trail, không phải tổng của server. */
  reachablePages?: number;
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
  /** Chế độ hiển thị: 'full' (đầy đủ số trang + tóm tắt), 'simple'/'compact' vẫn giữ số trang truy cập được; compact ẩn tóm tắt */
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

type PageItem = number | { from: number; to: number };
function pageItems(selected: number[], max: number): PageItem[] {
  const pages = [...new Set(selected.filter(page => page >= 1 && page <= max))].sort((a, b) => a - b);
  const items: PageItem[] = [];
  let previous = 0;
  for (const page of pages) {
    if (page === previous + 2) items.push(previous + 1);
    else if (page > previous + 1) items.push({ from: previous + 1, to: page - 1 });
    items.push(page); previous = page;
  }
  if (previous < max) items.push({ from: previous + 1, to: max });
  return items;
}

export function Pagination({
  ariaLabel = "Điều hướng phân trang",
  pageLabel,
  previousLabel = "Trước",
  summaryOverride,
  reachablePages,
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
  const menuId = useId();
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [menu, setMenu] = useState<{ from: number; to: number; below: boolean; height: number; page: number } | null>(null);
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
  const reachable = computedTotalPages ?? (reachablePages !== undefined && Number.isSafeInteger(reachablePages)
    ? Math.max(0, reachablePages) : 0);
  const canGoPrev = !isEmpty && safePage > 1 && (hasPrev ?? true);
  const canGoNext = !isEmpty && (computedTotalPages === undefined || safePage < computedTotalPages)
    && (hasNext ?? (computedTotalPages !== undefined));

  useEffect(() => {
    if (!menu || menu.page !== safePage || menu.to > reachable) return;
    root.current?.querySelector<HTMLElement>(`#${CSS.escape(menuId)} .${styles.pageGrid} button`)?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenu(null); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [menu, menuId, safePage, reachable]);

  if (hideOnSinglePage && computedTotalPages !== undefined && computedTotalPages <= 1) return null;

  const numbered = reachable > 0 && !isEmpty;
  const desktopPages = pageItems([1, 2, safePage - 1, safePage, safePage + 1, reachable], reachable);
  const mobilePages: PageItem[] = reachable <= 4
    ? Array.from({ length: reachable }, (_, index) => index + 1)
    : [1, 2, { from: 1, to: reachable }, ...(safePage > 2 && safePage <= reachable ? [safePage] : [])];
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
    setMenu(null);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) {
        const current = [...(root.current?.querySelectorAll<HTMLButtonElement>('button[aria-current="page"]') ?? [])]
          .find(button => button.getClientRects().length > 0);
        current?.focus({ preventScroll: true });
      }
    });
    if (!isLoading && next !== safePage) onPageChange(next);
  };
  function numbers(items: PageItem[]) {
    return items.map((item, index) => {
      if (typeof item !== "number") return (
        <button key={`gap-${index}`} type="button" className={styles.morePages}
          disabled={isLoading} aria-label={`Chọn trang ${item.from} đến ${item.to}`}
          title="Chọn trang khác" aria-haspopup="dialog" aria-controls={menuId}
          aria-expanded={!!menu && menu.from === item.from && menu.to === item.to}
          onClick={event => {
            trigger.current = event.currentTarget;
            const box = root.current?.getBoundingClientRect();
            const above = box?.top ?? 0, below = window.innerHeight - (box?.bottom ?? 0);
            setMenu(current => current?.page === safePage && current.from === item.from && current.to === item.to ? null
              : { ...item, below: below > above, height: Math.min(320, Math.max(80, Math.max(above, below) - 16)), page: safePage });
          }}>…</button>
      );
      return <button key={item} type="button"
        className={`${styles.pageNumberBtn} ${item === safePage ? styles.pageActive : ""}`}
        aria-current={item === safePage ? "page" : undefined} aria-label={`Trang ${item}`}
        disabled={isLoading} onClick={() => changePage(item)}>{item}</button>;
    });
  }

  return (
    <nav
      ref={root}
      className={`${styles.paginationRoot} ${bordered ? styles.bordered : ""} ${className || ""}`}
      aria-label={ariaLabel}
      aria-busy={isLoading}
      aria-description={computedTotalPages === undefined && reachable ? `Các số là ${reachable} trang đã truy cập; dùng Sau để tải trang mới.` : undefined}
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
          className={`${styles.navBtn} ${styles.prevBtn}`}
          disabled={!canGoPrev || isLoading}
          onClick={() => canGoPrev && changePage(safePage - 1)}
          aria-label={previousLabel === "Trước" ? "Đến trang trước" : "Về trang đầu"}
          title="Trang trước"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          <span className={styles.navBtnLabel}>{previousLabel}</span>
        </button>

        {numbered ? <>
          <div className={styles.desktopPages}>{numbers(desktopPages)}</div>
          <div className={styles.mobilePages}>{numbers(mobilePages)}</div>
        </> : <span className={styles.simplePageBadge} aria-current="page">{pageLabel ?? (isEmpty ? "Không có trang" : `Trang ${safePage}`)}</span>}

        {/* Nút Trang sau */}
        <button
          type="button"
          className={`${styles.navBtn} ${styles.nextBtn}`}
          disabled={!canGoNext || isLoading}
          onClick={() => canGoNext && changePage(safePage + 1)}
          aria-label="Đến trang tiếp theo"
          title="Trang tiếp theo"
        >
          <span className={styles.navBtnLabel}>Sau</span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
        {numbered && <span className={styles.srOnly} role="status" aria-live="polite">{pageLabel ?? `Trang ${safePage}${computedTotalPages !== undefined ? ` / ${computedTotalPages}` : ""}`}</span>}
      </div>

      {menu && menu.page === safePage && menu.to <= reachable && <div id={menuId} className={`${styles.pageMenu} ${menu.below ? styles.menuBelow : ""}`}
        role="dialog" aria-label="Chọn trang khác" style={{ maxHeight: menu.height }}>
        <div className={styles.menuHeading}>
          <span>{computedTotalPages !== undefined ? "Chọn trang" : "Các trang đã tải"}</span>
          <button type="button" aria-label="Đóng chọn trang" onClick={() => { setMenu(null); trigger.current?.focus(); }}><X size={16} aria-hidden="true" /></button>
        </div>
        <div className={styles.pageGrid} onKeyDown={event => {
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
          const index = buttons.indexOf(event.target as HTMLButtonElement);
          const columns = getComputedStyle(event.currentTarget).gridTemplateColumns.split(' ').length;
          const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1
            : event.key === "ArrowDown" ? index + columns : event.key === "ArrowUp" ? index - columns
            : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : undefined;
          if (next !== undefined) { event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus(); }
        }}>
          {Array.from({ length: menu.to - menu.from + 1 }, (_, index) => menu.from + index).map(value =>
            <button key={value} type="button" className={`${styles.pageNumberBtn} ${value === safePage ? styles.pageActive : ""}`}
              tabIndex={value === menu.from ? 0 : -1} aria-label={`Trang ${value}`} aria-current={value === safePage ? "page" : undefined}
              disabled={isLoading} onClick={() => changePage(value)}>{value}</button>)}
        </div>
      </div>}
      {extraContent && <div className={styles.extraWrap}>{extraContent}</div>}
    </nav>
  );
}
