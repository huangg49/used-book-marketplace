import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
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

export function WalletHistory({ ownerId }: { ownerId: string }) {
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
    <section
      id="wallet-history"
      aria-labelledby="wallet-history-heading"
      className={styles.transactions}
    >
      <div className={styles.sectionHeading}>
        <h2 id="wallet-history-heading">Lịch sử giao dịch</h2>
        <div className={styles.historyFilter}>
          <label htmlFor="wallet-history-type">Loại giao dịch</label>
          <select
            id="wallet-history-type"
            value={type}
            onChange={(event) =>
              setType(event.target.value as WalletHistoryType | "")
            }
          >
            <option value="">Tất cả giao dịch</option>
            {Object.entries(walletHistoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {history.isPending ? (
        <p role="status">Đang tải lịch sử giao dịch…</p>
      ) : (
        <>
          {history.isError && !history.isFetchNextPageError && (
            <p role="alert">
              {items.length
                ? "Lịch sử giao dịch chưa cập nhật."
                : "Chưa tải được lịch sử giao dịch."}{" "}
              <button
                type="button"
                disabled={history.isFetching}
                onClick={() => void history.refetch()}
              >
                Thử lại lịch sử
              </button>
            </p>
          )}
          {!items.length && !history.isError && (
            <p className={styles.empty}>
              {type
                ? "Chưa có giao dịch thuộc loại này."
                : "Chưa có giao dịch ví. Các khoản nạp, thanh toán và hoàn tiền sẽ xuất hiện tại đây."}
            </p>
          )}
          {items.length > 0 && (
            <ul className={styles.transactionList}>
              {items.map((item) => (
                <li key={item.journalId}>
                  <div>
                    <strong>{walletHistoryLabels[item.type]}</strong>
                    <time dateTime={item.postedAt}>
                      {dateFormat.format(new Date(item.postedAt))}
                    </time>
                    <small
                      title={item.orderId ?? item.topupId ?? item.journalId}
                    >
                      {item.orderId ? "Đơn hàng" : "Giao dịch"} #
                      {(item.orderId ?? item.topupId ?? item.journalId).slice(
                        0,
                        8,
                      )}
                    </small>
                  </div>
                  <div className={styles.transactionAmount}>
                    <strong data-credit={item.amount > 0}>
                      {item.amount > 0 ? "+" : item.amount < 0 ? "−" : ""}
                      {formatVnd(Math.abs(item.amount))}
                    </strong>
                    <small>Số dư sau giao dịch</small>
                    <span>{formatVnd(item.balanceAfter)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {history.isFetchNextPageError && (
            <p role="alert">
              Chưa tải được các giao dịch tiếp theo. Các giao dịch đã tải vẫn
              được giữ nguyên.
            </p>
          )}
          {history.hasNextPage && (
            <button
              type="button"
              disabled={history.isFetching}
              onClick={() => void history.fetchNextPage()}
            >
              {history.isFetchingNextPage
                ? "Đang tải…"
                : history.isFetchNextPageError
                  ? "Thử tải thêm giao dịch"
                  : "Xem thêm giao dịch"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
