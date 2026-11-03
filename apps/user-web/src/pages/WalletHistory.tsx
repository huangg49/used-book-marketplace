import { useId, useRef, useState } from "react";
import { usePaginationFocus } from "../components/Pagination/usePaginationFocus";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  RefreshCw,
  Plus,
  AlertCircle,
  Receipt,
  RotateCcw,
} from "lucide-react";
import { Pagination } from "../components/Pagination";
import {
  getWalletHistory,
  walletHistoryLabels,
  type WalletHistoryType,
} from "../services/wallet";
import { formatVnd } from "../lib/routes";
import styles from "./WalletPage.module.css";

const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});

interface WalletHistoryProps {
  ownerId: string;
  onOpenTopup?: () => void;
}

const FILTER_TABS: { id: WalletHistoryType | ""; label: string }[] = [
  { id: "", label: "Tất cả" },
  { id: "Topup", label: "Nạp tiền" },
  { id: "OrderPayment", label: "Mua sách" },
  { id: "OrderSettlement", label: "Bán sách" },
  { id: "OrderRefund", label: "Hoàn tiền" },
];

const PAGE_SIZE = 10;

function getTransactionVisuals(type: WalletHistoryType, _amount: number) {
  if (type === "Topup") {
    return {
      Icon: ArrowDownLeft,
      circleClass: styles.iconInflow,
      amountClass: styles.amountInflow,
    };
  }
  if (type === "OrderSettlement") {
    return {
      Icon: Coins,
      circleClass: styles.iconInflow,
      amountClass: styles.amountInflow,
    };
  }
  if (type === "OrderRefund" || type === "ListingFeeRefund") {
    return {
      Icon: RotateCcw,
      circleClass: styles.iconInflow,
      amountClass: styles.amountInflow,
    };
  }
  return {
    Icon: ArrowUpRight,
    circleClass: styles.iconOutflow,
    amountClass: styles.amountOutflow,
  };
}

export function WalletHistory({ ownerId, onOpenTopup }: WalletHistoryProps) {
  const [type, setType] = useState<WalletHistoryType | "">("");
  const scope = `${ownerId}:${type}`;
  const [position, setPosition] = useState({ scope, page: 1 });
  const currentPage = position.scope === scope ? position.page : 1;
  const changingPage = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const history = useInfiniteQuery({
    queryKey: ["wallet-history", ownerId, type],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getWalletHistory({ type: type || undefined, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const loadedPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, loadedPages);
  const historyAnchor = useId();
  const requestPageFocus = usePaginationFocus(safePage, scope, historyAnchor, history.isFetching, history.isError);
  const pagedItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function changePage(next: number) {
    if (changingPage.current === scope || history.isFetching || next < 1) return;
    if (next <= loadedPages) {
      setPosition({ scope, page: next });
      return;
    }
    if (!history.hasNextPage || next !== safePage + 1) return;
    changingPage.current = scope;
    const generation = ++requestGeneration.current;
    setPosition({ scope, page: safePage });
    try {
      const result = await history.fetchNextPage({ cancelRefetch: false });
      // Keep the displayed page on failure; the same Next button retries its cursor.
      if (!result.isFetchNextPageError && result.data) {
        const length = result.data.pages.reduce((sum, page) => sum + page.items.length, 0);
        if (requestGeneration.current === generation) {
          setPosition((current) => current.scope === scope
            ? { scope, page: Math.min(next, Math.max(1, Math.ceil(length / PAGE_SIZE))) }
            : current);
        }
      }
    } finally {
      if (requestGeneration.current === generation) changingPage.current = null;
    }
  }

  return (
    <div className={styles.historyContainer}>
      <div className={styles.receiptSlip} role="region" aria-label="Lịch sử giao dịch">
        <div className={styles.receiptBody}>
          {/* History Header */}
          <header className={styles.receiptHeader}>
            <div className={styles.historyTitleRow}>
              <h2 id={historyAnchor} tabIndex={-1} className={styles.receiptStoreTitle}>Lịch sử giao dịch</h2>
              <span className={styles.historyBadge}>VNPay Sandbox</span>
            </div>
            <p className={styles.receiptSubTitle}>
              Theo dõi chi tiết các khoản nạp ví, tiền bán sách và cọc ký quỹ đơn hàng
            </p>
          </header>

          {/* Filter Tabs */}
          <div
            className={styles.receiptFilters}
            role="tablist"
            aria-label="Lọc giao dịch"
          >
            {FILTER_TABS.map((tab) => {
              const isActive = type === tab.id;
              return (
                <button
                  key={tab.id || "all"}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`${styles.stampTab} ${
                    isActive ? styles.stampTabActive : ""
                  }`}
                  onClick={() => {
                    if (type !== tab.id) {
                      requestGeneration.current += 1;
                      changingPage.current = null;
                      setType(tab.id);
                      setPosition({ scope: `${ownerId}:${tab.id}`, page: 1 });
                    }
                  }}
                >
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Loading State */}
          {history.isPending ? (
            <div className={styles.emptyReceipt} role="status">
              <div className={styles.emptyReceiptIcon}>
                <RefreshCw size={24} className={styles.spinIcon} aria-hidden="true" />
              </div>
              <h3 className={styles.emptyReceiptTitle}>Đang tải lịch sử giao dịch…</h3>
              <p className={styles.emptyReceiptSub}>
                Hệ thống đang truy xuất các bút toán mới nhất của bạn.
              </p>
            </div>
          ) : (
            <>
              {/* Error State */}
              {history.isError && !history.isFetchNextPageError && (
                <div className={styles.alertBox} role="alert" style={{ marginBottom: 16 }}>
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>
                    {items.length
                      ? "Biên lai chưa thể cập nhật thêm giao dịch."
                      : "Chưa tải được dữ liệu sổ cái lúc này."}{" "}
                  </span>
                  <button
                    type="button"
                    className={styles.btnSecondaryWithdraw}
                    style={{ marginLeft: 8, padding: "2px 10px", minHeight: 30 }}
                    disabled={history.isFetching}
                    onClick={() => void history.refetch()}
                  >
                    Thử lại
                  </button>
                </div>
              )}

              {/* Empty State */}
              {!items.length && !history.isError && (
                <div className={styles.emptyReceipt} aria-label="Chưa có giao dịch">
                  <div className={styles.emptyReceiptIcon}>
                    <Receipt size={26} aria-hidden="true" />
                  </div>
                  <h3 className={styles.emptyReceiptTitle}>
                    {type
                      ? "Chưa có giao dịch thuộc nhóm này"
                      : "Chưa có biến động số dư"}
                  </h3>
                  <p className={styles.emptyReceiptSub}>
                    {type
                      ? "Hãy chọn 'Tất cả giao dịch' để xem toàn bộ lịch sử."
                      : "Mọi khoản nạp tiền, tiền bán sách nhận được và cọc ký quỹ sách sẽ hiển thị tại đây."}
                  </p>
                  {onOpenTopup && !type && (
                    <button
                      type="button"
                      className={styles.btnEmptyTopup}
                      onClick={onOpenTopup}
                    >
                      <Plus size={16} aria-hidden="true" />
                      <span>Nạp tiền trải nghiệm ngay</span>
                    </button>
                  )}
                </div>
              )}

              {/* Receipt Rows List */}
              {pagedItems.length > 0 && (
                <ul className={styles.receiptItemList}>
                  {pagedItems.map((item) => {
                    const { Icon, circleClass, amountClass } = getTransactionVisuals(
                      item.type,
                      item.amount,
                    );
                    const isPositive = item.amount > 0;
                    const rawRef = item.orderId ?? item.topupId ?? item.journalId;
                    const prefix = item.orderId
                      ? "ĐƠN"
                      : item.topupId
                        ? "NẠP"
                        : "SỔ";
                    const displayCode = `${prefix}-${rawRef.slice(0, 6).toUpperCase()}`;

                    return (
                      <li key={item.journalId} className={styles.receiptRow}>
                        <div className={`${styles.receiptIconCircle} ${circleClass}`} aria-hidden="true">
                          <Icon size={18} />
                        </div>

                        <div className={styles.receiptItemMeta}>
                          <span className={styles.receiptItemTitle}>
                            {walletHistoryLabels[item.type] || item.type}
                            {item.type === "Topup" && (
                              <span className={styles.vnpayReceiptBadge} style={{ marginLeft: 6 }}>
                                VNPAY
                              </span>
                            )}
                          </span>
                          <div className={styles.receiptItemSub}>
                            <time dateTime={item.postedAt}>
                              {dateFormat.format(new Date(item.postedAt))}
                            </time>
                            <span>•</span>
                            <span className={styles.receiptCode} title={rawRef}>
                              #{displayCode}
                            </span>
                          </div>
                        </div>

                        <div className={styles.receiptAmountCol}>
                          <span className={`${styles.receiptAmountText} ${amountClass}`}>
                            {isPositive ? "+" : item.amount < 0 ? "−" : ""}
                            {formatVnd(Math.abs(item.amount))}
                          </span>
                          <span className={styles.receiptBalanceAfter}>
                            Số dư sau: {formatVnd(item.balanceAfter)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {history.isFetchNextPageError && (
                <div className={styles.alertBox} role="alert" style={{ marginTop: 14 }}>
                  <span>Chưa tải được trang tiếp theo. Các giao dịch hiện tại vẫn được giữ. Bấm “Sau” để thử lại.</span>
                </div>
              )}

            </>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className={styles.historyPagination}>
          <Pagination
            page={safePage}
            variant="simple"
            reachablePages={loadedPages}
            itemCount={pagedItems.length}
            totalItems={history.hasNextPage ? undefined : items.length}
            pageSize={PAGE_SIZE}
            itemLabel="giao dịch"
            hasNext={safePage < loadedPages || history.hasNextPage}
            onPageChange={(next) => { requestPageFocus(); void changePage(next); }}
            isLoading={history.isFetching}
          />
        </div>
      )}
    </div>
  );
}
