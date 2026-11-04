import { withdrawalLabels } from "@used-books/session-client";
import { useState } from "react";
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
  { id: "WithdrawalHold", label: "Rút tiền" },
  { id: "OrderPayment", label: "Mua sách" },
  { id: "OrderSettlement", label: "Bán sách" },
  { id: "OrderRefund", label: "Hoàn tiền" },
];

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
  if (type === "WithdrawalRefund" || type === "OrderRefund" || type === "ListingFeeRefund") {
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
  const history = useInfiniteQuery({
    queryKey: ["wallet-history", ownerId, type],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getWalletHistory({ type: type || undefined, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className={styles.receiptSlip} role="region" aria-label="Lịch sử giao dịch">
      <div className={styles.receiptBody}>
        {/* History Header */}
        <header className={styles.receiptHeader}>
          <div className={styles.historyTitleRow}>
            <h2 className={styles.receiptStoreTitle}>Lịch sử giao dịch</h2>
            <span className={styles.historyBadge}>Ví mô phỏng</span>
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
                onClick={() => setType(tab.id)}
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
            {items.length > 0 && (
              <ul className={styles.receiptItemList}>
                {items.map((item) => {
                  const { Icon, circleClass, amountClass } = getTransactionVisuals(
                    item.type,
                    item.amount,
                  );
                  const isPositive = item.amount > 0;
                  const rawRef = item.withdrawalId ?? item.orderId ?? item.topupId ?? item.journalId;
                  const prefix = item.withdrawalId ? "RÚT" : item.orderId
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
                          {item.type === "WithdrawalHold" && item.withdrawalState && <span className={styles.withdrawalHistoryState} data-state={item.withdrawalState}>{withdrawalLabels[item.withdrawalState]}</span>}
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
                <span>Chưa tải được các giao dịch tiếp theo.</span>
              </div>
            )}

            {history.hasNextPage && (
              <button
                type="button"
                className={styles.loadMoreBtn}
                disabled={history.isFetching}
                onClick={() => void history.fetchNextPage()}
              >
                {history.isFetchingNextPage
                  ? "Đang tải thêm giao dịch…"
                  : history.isFetchNextPageError
                    ? "Thử tải lại các giao dịch cũ hơn"
                    : "Xem thêm các giao dịch cũ hơn"}
              </button>
            )}

            {/* Clean Minimal Footer */}
            {items.length > 0 && (
              <footer className={styles.receiptFooter}>
                <span className={styles.historyCountNote}>
                  Hiển thị {items.length} giao dịch gần nhất
                </span>
              </footer>
            )}
          </>
        )}
      </div>
    </div>
  );
}
