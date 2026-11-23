import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Search, X } from "lucide-react";
import { session } from "../../core/session";
import { ErrorNotice } from "../../core/ui";
import { dashboardTransfersQuery } from "./queries";
import { formatRevenueDate, formatVnd } from "./revenue";
import { formatSignedVnd } from "./finance";
import styles from "./StatisticsHub.module.css";

export function TransfersExplorer({ user }: { user: CurrentUser }) {
  const [kind, setKind] = useState<string>("All");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    ...dashboardTransfersQuery(user, kind, search, page, (path, schema) =>
      session.request(path, schema),
    ),
    placeholderData: keepPreviousData,
  });

  const data = query.data;
  const totalPages = data
    ? Math.max(1, Math.ceil(data.totalItems / data.pageSize))
    : 1;

  return (
    <section className={styles.panel} aria-labelledby="transfers-explorer-title">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="transfers-explorer-title">
            Lịch sử Nạp & Rút tiền trên toàn hệ thống
          </h2>
          <p className={styles.panelHint}>
            Tra cứu chi tiết mọi giao dịch nạp ví thành công và lệnh rút tiền đã chi trả ra khỏi hệ thống trên sổ cái.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {data && (
            <span className={`${styles.statusPill} ${styles.statusOk}`}>
              {data.summary.topupCount + data.summary.withdrawalCount} giao dịch ·{" "}
              Ròng {formatSignedVnd(data.summary.netFlow)}
            </span>
          )}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Cập nhật lịch sử nạp và rút tiền"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {data && (
        <>
          <div
            className={styles.holdFilterGrid3}
            role="group"
            aria-label="Lọc theo loại dòng tiền nạp hoặc rút"
          >
            <button
              type="button"
              className={`${styles.holdCard} ${kind === "All" ? styles.holdCardActive : ""}`}
              onClick={() => {
                setKind("All");
                setPage(1);
              }}
            >
              <div className={styles.holdCardHeader}>
                <span className={styles.holdCardLabel}>Tất cả (Nạp & Rút)</span>
                <span className={styles.holdCardBadge}>
                  {data.summary.topupCount + data.summary.withdrawalCount}
                </span>
              </div>
              <div className={styles.holdCardAmount}>
                {formatSignedVnd(data.summary.netFlow)}
              </div>
            </button>

            <button
              type="button"
              className={`${styles.holdCard} ${kind === "Topup" ? styles.holdCardActive : ""}`}
              onClick={() => {
                setKind("Topup");
                setPage(1);
              }}
            >
              <div className={styles.holdCardHeader}>
                <span className={styles.holdCardLabel}>Nạp tiền vào ví</span>
                <span className={styles.holdCardBadge}>
                  {data.summary.topupCount}
                </span>
              </div>
              <div className={styles.holdCardAmount}>
                +{formatVnd(data.summary.totalTopup)}
              </div>
            </button>

            <button
              type="button"
              className={`${styles.holdCard} ${kind === "WithdrawalPayout" ? styles.holdCardActive : ""}`}
              onClick={() => {
                setKind("WithdrawalPayout");
                setPage(1);
              }}
            >
              <div className={styles.holdCardHeader}>
                <span className={styles.holdCardLabel}>Rút tiền hoàn tất</span>
                <span className={styles.holdCardBadge}>
                  {data.summary.withdrawalCount}
                </span>
              </div>
              <div className={styles.holdCardAmount}>
                -{formatVnd(data.summary.totalWithdrawal)}
              </div>
            </button>
          </div>

          <div className={styles.holdSearchDivider} role="separator" aria-hidden="true">
            <span className={styles.holdSearchDividerLine} />
            <span className={styles.holdSearchDividerGem} />
            <span className={styles.holdSearchDividerLine} />
          </div>

          <div className={styles.holdSearchRow}>
            <form
              className={styles.holdSearchForm}
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(searchDraft.trim());
                setPage(1);
              }}
            >
              <div className={styles.searchFieldWrap}>
                <Search
                  size={15}
                  className={styles.searchIcon}
                  aria-hidden="true"
                />
                <input
                  type="search"
                  className={styles.searchInput}
                  placeholder="Tìm tên thành viên, email hoặc mã nạp / rút…"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  aria-label="Tìm giao dịch nạp hoặc rút tiền"
                />
                {searchDraft && (
                  <button
                    type="button"
                    className={styles.clearSearchBtn}
                    onClick={() => {
                      setSearchDraft("");
                      setSearch("");
                      setPage(1);
                    }}
                    aria-label="Xóa nội dung tìm kiếm"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button type="submit" className={styles.primaryBtn}>
                Tìm kiếm
              </button>
            </form>

            <div className={styles.searchMetaText}>
              {search ? (
                <span>
                  Kết quả cho <strong>&ldquo;{search}&rdquo;</strong>:{" "}
                  {data.totalItems} giao dịch
                </span>
              ) : (
                <span>
                  Hiển thị <strong>{data.items.length}</strong> /{" "}
                  <strong>{data.totalItems}</strong> giao dịch
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {query.isError && (
        <ErrorNotice
          error={query.error}
          retry={() => void query.refetch()}
          busy={query.isFetching}
        />
      )}

      {query.isPending && !data ? (
        <div className={styles.statusBox} role="status">
          Đang tải lịch sử nạp & rút tiền…
        </div>
      ) : data && data.items.length === 0 ? (
        <div className={styles.statusBox}>
          Chưa có giao dịch nạp hoặc rút tiền nào khớp bộ lọc.
        </div>
      ) : data ? (
        <>
          <div
            className={`${styles.tableWrap} ${query.isFetching ? styles.tableWrapLoading : ""}`}
          >
            {query.isFetching && (
              <div className={styles.tableLoadingBar} aria-hidden="true" />
            )}
            <table className={`${styles.table} ${styles.stripedTable}`}>
              <thead>
                <tr>
                  <th>Loại dòng tiền</th>
                  <th style={{ textAlign: "left" }}>Thành viên</th>
                  <th style={{ textAlign: "left" }}>Mã giao dịch</th>
                  <th style={{ textAlign: "left" }}>Nội dung</th>
                  <th>Số tiền</th>
                  <th>Thời gian ghi sổ</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const isTopup = item.kind === "Topup";
                  return (
                    <tr key={item.journalId}>
                      <td>
                        <span
                          className={`${styles.outcomePill} ${
                            isTopup
                              ? styles.outcomeReturned
                              : styles.outcomeForfeited
                          }`}
                        >
                          {isTopup ? (
                            <ArrowDownLeft size={12} aria-hidden="true" />
                          ) : (
                            <ArrowUpRight size={12} aria-hidden="true" />
                          )}{" "}
                          {item.kindLabel}
                        </span>
                      </td>
                      <td style={{ textAlign: "left" }}>
                        <div className={styles.holderCell}>
                          {item.userId ? (
                            <Link
                              to={`/users/${item.userId}`}
                              style={{
                                color: "var(--shop-ink)",
                                fontWeight: 700,
                                textDecoration: "none",
                              }}
                            >
                              {item.userName}
                            </Link>
                          ) : (
                            <strong>{item.userName}</strong>
                          )}
                          {item.userEmail && (
                            <span className={styles.holderEmail}>
                              {item.userEmail}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: "left" }}>
                        <span
                          className={styles.monoCode}
                          title={item.referenceId ?? item.journalId}
                        >
                          #{(item.referenceId ?? item.journalId).slice(0, 8).toUpperCase()}
                        </span>
                      </td>
                      <td style={{ textAlign: "left" }}>
                        <span className={styles.outcomeDetail} style={{ marginTop: 0 }}>
                          {item.detail}
                        </span>
                      </td>
                      <td>
                        <strong
                          className={
                            isTopup ? styles.positiveAmt : styles.negativeAmt
                          }
                        >
                          {isTopup ? "+" : "-"}
                          {formatVnd(item.amount)}
                        </strong>
                      </td>
                      <td>{formatRevenueDate(item.postedAt)}</td>
                      <td>
                        {!isTopup && item.referenceId ? (
                          <Link
                            className={styles.actionLink}
                            to={`/withdrawals/${item.referenceId}`}
                          >
                            Xem lệnh rút →
                          </Link>
                        ) : (
                          <span style={{ color: "var(--shop-muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.paginationRow}>
            <span>
              Hiển thị {data.items.length} / {data.totalItems} giao dịch · Trang{" "}
              {data.page}/{totalPages}
            </span>
            <div className={styles.paginationBtns}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Trang trước
              </button>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page >= totalPages || query.isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Trang sau
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

