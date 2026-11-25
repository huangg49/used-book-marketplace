import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { History, Lock, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { session } from "../../core/session";
import { ErrorNotice } from "../../core/ui";
import {
  dashboardHoldHistoryQuery,
  dashboardHoldLocksQuery,
  dashboardHoldsQuery,
} from "./queries";
import { formatRevenueDate, formatVnd } from "./revenue";
import type { FinanceHoldHistoryKind, FinanceHoldKind } from "./finance";
import styles from "./StatisticsHub.module.css";

const KIND_STYLE: Record<FinanceHoldKind, string> = {
  Exchange: styles.kindExchange,
  AuctionBid: styles.kindAuctionBid,
  DirectOrder: styles.kindDirectOrder,
  PointOrder: styles.kindPointOrder,
  Withdrawal: styles.kindWithdrawal,
};

const HISTORY_KIND_STYLE: Record<FinanceHoldHistoryKind, string> = {
  AuctionRelease: styles.kindDirectOrder,
  AuctionForfeit: styles.kindWithdrawal,
  OrderRefund: styles.kindPointOrder,
  WithdrawalRefund: styles.kindExchange,
  ExchangeCompensation: styles.kindExchange,
};

const STATUS_VI: Record<string, string> = {
  Proposed: "Đề xuất",
  AcceptedAwaitingFunding: "Chờ đặt cọc",
  Preparing: "Đang chuẩn bị",
  InTransit: "Đang vận chuyển",
  Delivered: "Đang đồng kiểm 72h",
  ResolutionPending: "Đang khiếu nại",
  Active: "Đang diễn ra",
  BuyNowPending: "Chờ mua ngay",
  AwaitingWinnerPayment: "Chờ người thắng trả",
  OnHold: "Tạm giữ",
  Paid: "Đã thanh toán",
  ReadyForCollection: "Chờ nhận tại điểm",
  Inspection: "Đang đồng kiểm",
  Requested: "Chờ Admin duyệt",
  Approved: "Đã duyệt",
  Processing: "Đang chi trả",
  Held: "Đang giữ",
};

function resolveActionLink(
  kind: FinanceHoldKind,
  referenceId: string | null,
  status: string,
): { to: string; label: string } | null {
  if (!referenceId) return null;
  if (kind === "Withdrawal") {
    return { to: `/withdrawals/${referenceId}`, label: "Duyệt rút →" };
  }
  if (kind === "Exchange" && status === "ResolutionPending") {
    return {
      to: `/operations/exchange-disputes/${referenceId}`,
      label: "Xử lý khiếu nại →",
    };
  }
  if (kind === "AuctionBid") {
    return { to: "/operations/auctions", label: "Xem phiên →" };
  }
  if (kind === "PointOrder") {
    return { to: "/operations/resolutions", label: "Đơn tại điểm →" };
  }
  return null;
}

export function HoldsExplorer({ user }: { user: CurrentUser }) {
  const [tab, setTab] = useState<"active" | "locks" | "history">("active");

  // Active holds state
  const [kind, setKind] = useState<string>("All");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Hold locks history state
  const [locksKind, setLocksKind] = useState<string>("All");
  const [locksSearchDraft, setLocksSearchDraft] = useState("");
  const [locksSearch, setLocksSearch] = useState("");
  const [locksPage, setLocksPage] = useState(1);

  // Release/refund history state
  const [historyKind, setHistoryKind] = useState<string>("All");
  const [historySearchDraft, setHistorySearchDraft] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  const activeQuery = useQuery({
    ...dashboardHoldsQuery(user, kind, search, page, (path, schema) =>
      session.request(path, schema),
    ),
    placeholderData: keepPreviousData,
  });

  const locksQuery = useQuery({
    ...dashboardHoldLocksQuery(
      user,
      locksKind,
      locksSearch,
      locksPage,
      (path, schema) => session.request(path, schema),
      tab === "locks",
    ),
    placeholderData: keepPreviousData,
  });

  const historyQuery = useQuery({
    ...dashboardHoldHistoryQuery(
      user,
      historyKind,
      historySearch,
      historyPage,
      (path, schema) => session.request(path, schema),
      tab === "history",
    ),
    placeholderData: keepPreviousData,
  });

  const activeData = activeQuery.data;
  const locksData = locksQuery.data;
  const historyData = historyQuery.data;
  const activeTotalPages = activeData
    ? Math.max(1, Math.ceil(activeData.totalItems / activeData.pageSize))
    : 1;
  const locksTotalPages = locksData
    ? Math.max(1, Math.ceil(locksData.totalItems / locksData.pageSize))
    : 1;
  const historyTotalPages = historyData
    ? Math.max(1, Math.ceil(historyData.totalItems / historyData.pageSize))
    : 1;

  const isFetching =
    tab === "active"
      ? activeQuery.isFetching
      : tab === "locks"
        ? locksQuery.isFetching
        : historyQuery.isFetching;

  return (
    <section className={styles.panel} aria-labelledby="holds-explorer-title">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="holds-explorer-title">
            Chi tiết tiền cọc & tiền đang giữ trên toàn hệ thống
          </h2>
          <p className={styles.panelHint}>
            {tab === "active"
              ? "Liệt kê trực tiếp mọi tài khoản hold còn số dư lớn hơn 0đ trên sổ cái (cọc trao đổi, cọc đấu giá, đơn mua và lệnh rút chờ duyệt)."
              : tab === "locks"
                ? "Lịch sử mọi lần hệ thống tạm giữ / khóa tiền cọc từ ví người dùng (đặt cọc đấu giá, cọc trao đổi, thanh toán đơn mua và yêu cầu rút tiền)."
                : "Tra cứu hoàn tiền, tịch thu cọc và tiền chuyển qua đối tác để xử lý tranh chấp đổi sách."}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {tab === "active" && activeData && (
            <span className={`${styles.statusPill} ${styles.statusOk}`}>
              <Lock size={13} aria-hidden="true" />
              {activeData.summary.totalAccounts} khoản ·{" "}
              {formatVnd(activeData.summary.totalHeld)}
            </span>
          )}
          {tab === "locks" && locksData && (
            <span className={`${styles.statusPill} ${styles.statusOk}`}>
              <History size={13} aria-hidden="true" />
              {locksData.summary.totalEvents} lượt giữ ·{" "}
              {formatVnd(locksData.summary.totalLocked)}
            </span>
          )}
          {tab === "history" && historyData && (
            <span className={`${styles.statusPill} ${styles.statusOk}`}>
              <RotateCcw size={13} aria-hidden="true" />
              Đã hoàn ví: {formatVnd(historyData.summary.totalRefunded)}
            </span>
          )}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() =>
              void (tab === "active"
                ? activeQuery.refetch()
                : tab === "locks"
                  ? locksQuery.refetch()
                  : historyQuery.refetch())
            }
            disabled={isFetching}
            aria-label={
              tab === "active"
                ? "Cập nhật danh sách tiền đang giữ"
                : tab === "locks"
                  ? "Cập nhật lịch sử giữ cọc"
                  : "Cập nhật lịch sử hoàn cọc"
            }
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className={styles.holdModeTabs} role="tablist" aria-label="Chế độ xem tiền cọc">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "active"}
          className={`${styles.holdModeTab} ${tab === "active" ? styles.holdModeTabActive : ""}`}
          onClick={() => setTab("active")}
        >
          <Lock size={14} aria-hidden="true" />
          Đang tạm giữ
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "locks"}
          className={`${styles.holdModeTab} ${tab === "locks" ? styles.holdModeTabActive : ""}`}
          onClick={() => setTab("locks")}
        >
          <History size={14} aria-hidden="true" />
          Lịch sử giữ cọc
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          className={`${styles.holdModeTab} ${tab === "history" ? styles.holdModeTabActive : ""}`}
          onClick={() => setTab("history")}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Lịch sử hoàn & giải tỏa cọc
        </button>
      </div>

      {tab === "active" ? (
        <>
          {activeData && (
            <>
              <div
                className={styles.holdFilterGrid}
                role="group"
                aria-label="Lọc theo loại tiền giữ"
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
                    <span className={styles.holdCardLabel}>Tất cả</span>
                    <span className={styles.holdCardBadge}>
                      {activeData.summary.totalAccounts}
                    </span>
                  </div>
                  <div className={styles.holdCardAmount}>
                    {formatVnd(activeData.summary.totalHeld)}
                  </div>
                </button>

                {activeData.summary.byKind.map((bucket) => {
                  const isActive = kind === bucket.kind;
                  return (
                    <button
                      key={bucket.kind}
                      type="button"
                      className={`${styles.holdCard} ${isActive ? styles.holdCardActive : ""}`}
                      onClick={() => {
                        setKind(bucket.kind);
                        setPage(1);
                      }}
                    >
                      <div className={styles.holdCardHeader}>
                        <span className={styles.holdCardLabel} title={bucket.label}>
                          {bucket.label}
                        </span>
                        <span className={styles.holdCardBadge}>{bucket.count}</span>
                      </div>
                      <div className={styles.holdCardAmount}>
                        {formatVnd(bucket.amount)}
                      </div>
                    </button>
                  );
                })}
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
                      placeholder="Tìm tên người dùng, email hoặc mã giao dịch…"
                      value={searchDraft}
                      onChange={(e) => setSearchDraft(e.target.value)}
                      aria-label="Tìm khoản tiền đang giữ"
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
                      {activeData.totalItems} khoản
                    </span>
                  ) : (
                    <span>
                      Hiển thị <strong>{activeData.items.length}</strong> /{" "}
                      <strong>{activeData.totalItems}</strong> khoản
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {activeQuery.isError && (
            <ErrorNotice
              error={activeQuery.error}
              retry={() => void activeQuery.refetch()}
              busy={activeQuery.isFetching}
            />
          )}

          {activeQuery.isPending && !activeData ? (
            <div className={styles.statusBox} role="status">
              Đang tải danh sách tiền cọc & tiền đang giữ…
            </div>
          ) : activeData && activeData.items.length === 0 ? (
            <div className={styles.statusBox}>
              Hiện không có khoản tiền cọc hoặc tiền giữ nào khớp bộ lọc.
            </div>
          ) : activeData ? (
            <>
              <div
                className={`${styles.tableWrap} ${activeQuery.isFetching ? styles.tableWrapLoading : ""}`}
              >
                {activeQuery.isFetching && (
                  <div className={styles.tableLoadingBar} aria-hidden="true" />
                )}
                <table className={`${styles.table} ${styles.stripedTable}`}>
                  <thead>
                    <tr>
                      <th>Loại tiền giữ</th>
                      <th style={{ textAlign: "left" }}>Người bị giữ tiền</th>
                      <th style={{ textAlign: "left" }}>Mã giao dịch</th>
                      <th style={{ textAlign: "left" }}>Trạng thái</th>
                      <th>Số tiền đang giữ</th>
                      <th>Cập nhật</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeData.items.map((item) => {
                      const action = resolveActionLink(
                        item.kind,
                        item.referenceId,
                        item.status,
                      );
                      return (
                        <tr key={item.accountId}>
                          <td>
                            <span
                              className={`${styles.kindTag} ${KIND_STYLE[item.kind]}`}
                            >
                              {item.kindLabel}
                            </span>
                          </td>
                          <td style={{ textAlign: "left" }}>
                            <div className={styles.holderCell}>
                              {item.holderId ? (
                                <Link
                                  to={`/users/${item.holderId}`}
                                  style={{
                                    color: "var(--shop-ink)",
                                    fontWeight: 700,
                                    textDecoration: "none",
                                  }}
                                >
                                  {item.holderName}
                                </Link>
                              ) : (
                                <strong>{item.holderName}</strong>
                              )}
                              {item.holderEmail && (
                                <span className={styles.holderEmail}>
                                  {item.holderEmail}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: "left" }}>
                            <span
                              className={styles.monoCode}
                              title={item.referenceId ?? item.accountId}
                            >
                              #{(item.referenceId ?? item.accountId).slice(0, 8).toUpperCase()}
                            </span>
                          </td>
                          <td style={{ textAlign: "left" }}>
                            {STATUS_VI[item.status] ?? item.status}
                          </td>
                          <td>
                            <strong>{formatVnd(item.amount)}</strong>
                          </td>
                          <td>
                            {item.updatedAt
                              ? formatRevenueDate(item.updatedAt)
                              : "—"}
                          </td>
                          <td>
                            {action ? (
                              <Link className={styles.actionLink} to={action.to}>
                                {action.label}
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
                  Hiển thị {activeData.items.length} / {activeData.totalItems}{" "}
                  khoản · Trang {activeData.page}/{activeTotalPages}
                </span>
                <div className={styles.paginationBtns}>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={page <= 1 || activeQuery.isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Trang trước
                  </button>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={page >= activeTotalPages || activeQuery.isFetching}
                    onClick={() =>
                      setPage((p) => Math.min(activeTotalPages, p + 1))
                    }
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : tab === "locks" ? (
        <>
          {locksData && (
            <>
              <div
                className={styles.holdFilterGrid}
                role="group"
                aria-label="Lọc theo loại giữ cọc"
              >
                <button
                  type="button"
                  className={`${styles.holdCard} ${locksKind === "All" ? styles.holdCardActive : ""}`}
                  onClick={() => {
                    setLocksKind("All");
                    setLocksPage(1);
                  }}
                >
                  <div className={styles.holdCardHeader}>
                    <span className={styles.holdCardLabel}>Tất cả</span>
                    <span className={styles.holdCardBadge}>
                      {locksData.summary.totalEvents}
                    </span>
                  </div>
                  <div className={styles.holdCardAmount}>
                    {formatVnd(locksData.summary.totalLocked)}
                  </div>
                </button>

                {locksData.summary.byKind.map((bucket) => {
                  const isActive = locksKind === bucket.kind;
                  return (
                    <button
                      key={bucket.kind}
                      type="button"
                      className={`${styles.holdCard} ${isActive ? styles.holdCardActive : ""}`}
                      onClick={() => {
                        setLocksKind(bucket.kind);
                        setLocksPage(1);
                      }}
                    >
                      <div className={styles.holdCardHeader}>
                        <span className={styles.holdCardLabel} title={bucket.label}>
                          {bucket.label}
                        </span>
                        <span className={styles.holdCardBadge}>{bucket.count}</span>
                      </div>
                      <div className={styles.holdCardAmount}>
                        {formatVnd(bucket.amount)}
                      </div>
                    </button>
                  );
                })}
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
                    setLocksSearch(locksSearchDraft.trim());
                    setLocksPage(1);
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
                      placeholder="Tìm người dùng, email hoặc mã phiên / đơn…"
                      value={locksSearchDraft}
                      onChange={(e) => setLocksSearchDraft(e.target.value)}
                      aria-label="Tìm lịch sử giữ cọc"
                    />
                    {locksSearchDraft && (
                      <button
                        type="button"
                        className={styles.clearSearchBtn}
                        onClick={() => {
                          setLocksSearchDraft("");
                          setLocksSearch("");
                          setLocksPage(1);
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
                  {locksSearch ? (
                    <span>
                      Kết quả cho <strong>&ldquo;{locksSearch}&rdquo;</strong>:{" "}
                      {locksData.totalItems} bút toán
                    </span>
                  ) : (
                    <span>
                      Hiển thị <strong>{locksData.items.length}</strong> /{" "}
                      <strong>{locksData.totalItems}</strong> bút toán
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {locksQuery.isError && (
            <ErrorNotice
              error={locksQuery.error}
              retry={() => void locksQuery.refetch()}
              busy={locksQuery.isFetching}
            />
          )}

          {locksQuery.isPending && !locksData ? (
            <div className={styles.statusBox} role="status">
              Đang tải lịch sử giữ cọc & khóa tiền…
            </div>
          ) : locksData && locksData.items.length === 0 ? (
            <div className={styles.statusBox}>
              Chưa có bút toán giữ cọc nào khớp bộ lọc.
            </div>
          ) : locksData ? (
            <>
              <div
                className={`${styles.tableWrap} ${locksQuery.isFetching ? styles.tableWrapLoading : ""}`}
              >
                {locksQuery.isFetching && (
                  <div className={styles.tableLoadingBar} aria-hidden="true" />
                )}
                <table className={`${styles.table} ${styles.stripedTable}`}>
                  <thead>
                    <tr>
                      <th>Loại giữ cọc</th>
                      <th style={{ textAlign: "left" }}>Người bị giữ tiền</th>
                      <th style={{ textAlign: "left" }}>Mã giao dịch</th>
                      <th style={{ textAlign: "left" }}>Nội dung tạm giữ</th>
                      <th>Số tiền giữ</th>
                      <th>Thời điểm giữ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locksData.items.map((item) => (
                      <tr key={item.journalId}>
                        <td>
                          <span
                            className={`${styles.kindTag} ${KIND_STYLE[item.kind]}`}
                          >
                            {item.kindLabel}
                          </span>
                        </td>
                        <td style={{ textAlign: "left" }}>
                          <div className={styles.holderCell}>
                            {item.holderId ? (
                              <Link
                                to={`/users/${item.holderId}`}
                                style={{
                                  color: "var(--shop-ink)",
                                  fontWeight: 700,
                                  textDecoration: "none",
                                }}
                              >
                                {item.holderName}
                              </Link>
                            ) : (
                              <strong>{item.holderName}</strong>
                            )}
                            {item.holderEmail && (
                              <span className={styles.holderEmail}>
                                {item.holderEmail}
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
                          <span
                            className={`${styles.outcomePill} ${styles.outcomeLocked}`}
                          >
                            Đã tạm giữ cọc
                          </span>
                          <span className={styles.outcomeDetail}>
                            {item.detail}
                          </span>
                        </td>
                        <td>
                          <strong className={styles.lockedAmt}>
                            {formatVnd(item.amount)}
                          </strong>
                        </td>
                        <td>{formatRevenueDate(item.postedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.paginationRow}>
                <span>
                  Hiển thị {locksData.items.length} / {locksData.totalItems}{" "}
                  bút toán · Trang {locksData.page}/{locksTotalPages}
                </span>
                <div className={styles.paginationBtns}>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={locksPage <= 1 || locksQuery.isFetching}
                    onClick={() => setLocksPage((p) => Math.max(1, p - 1))}
                  >
                    Trang trước
                  </button>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={
                      locksPage >= locksTotalPages || locksQuery.isFetching
                    }
                    onClick={() =>
                      setLocksPage((p) => Math.min(locksTotalPages, p + 1))
                    }
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : (
        <>
          {historyData && (
            <>
              <div
                className={styles.holdFilterGrid}
                role="group"
                aria-label="Lọc theo loại lịch sử hoàn cọc"
              >
                <button
                  type="button"
                  className={`${styles.holdCard} ${historyKind === "All" ? styles.holdCardActive : ""}`}
                  onClick={() => {
                    setHistoryKind("All");
                    setHistoryPage(1);
                  }}
                >
                  <div className={styles.holdCardHeader}>
                    <span className={styles.holdCardLabel}>Tất cả</span>
                    <span className={styles.holdCardBadge}>
                      {historyData.summary.totalEvents}
                    </span>
                  </div>
                  <div className={styles.holdCardAmount}>
                    {formatVnd(
                      historyData.summary.totalRefunded +
                        historyData.summary.totalForfeited + (historyData.summary.totalCompensated ?? 0),
                    )}
                  </div>
                </button>

                {historyData.summary.byKind.map((bucket) => {
                  const isActive = historyKind === bucket.kind;
                  return (
                    <button
                      key={bucket.kind}
                      type="button"
                      className={`${styles.holdCard} ${isActive ? styles.holdCardActive : ""}`}
                      onClick={() => {
                        setHistoryKind(bucket.kind);
                        setHistoryPage(1);
                      }}
                    >
                      <div className={styles.holdCardHeader}>
                        <span className={styles.holdCardLabel} title={bucket.label}>
                          {bucket.label}
                        </span>
                        <span className={styles.holdCardBadge}>{bucket.count}</span>
                      </div>
                      <div className={styles.holdCardAmount}>
                        {formatVnd(bucket.amount)}
                      </div>
                    </button>
                  );
                })}
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
                    setHistorySearch(historySearchDraft.trim());
                    setHistoryPage(1);
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
                      placeholder="Tìm người dùng, email hoặc mã phiên / đơn…"
                      value={historySearchDraft}
                      onChange={(e) => setHistorySearchDraft(e.target.value)}
                      aria-label="Tìm lịch sử hoàn cọc"
                    />
                    {historySearchDraft && (
                      <button
                        type="button"
                        className={styles.clearSearchBtn}
                        onClick={() => {
                          setHistorySearchDraft("");
                          setHistorySearch("");
                          setHistoryPage(1);
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
                  {historySearch ? (
                    <span>
                      Kết quả cho <strong>&ldquo;{historySearch}&rdquo;</strong>:{" "}
                      {historyData.totalItems} bút toán
                    </span>
                  ) : (
                    <span>
                      Hiển thị <strong>{historyData.items.length}</strong> /{" "}
                      <strong>{historyData.totalItems}</strong> bút toán
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {historyQuery.isError && (
            <ErrorNotice
              error={historyQuery.error}
              retry={() => void historyQuery.refetch()}
              busy={historyQuery.isFetching}
            />
          )}

          {historyQuery.isPending && !historyData ? (
            <div className={styles.statusBox} role="status">
              Đang tải lịch sử hoàn & giải tỏa cọc…
            </div>
          ) : historyData && historyData.items.length === 0 ? (
            <div className={styles.statusBox}>
              Chưa có bút toán hoàn hoặc giải tỏa cọc nào khớp bộ lọc.
            </div>
          ) : historyData ? (
            <>
              <div
                className={`${styles.tableWrap} ${historyQuery.isFetching ? styles.tableWrapLoading : ""}`}
              >
                {historyQuery.isFetching && (
                  <div className={styles.tableLoadingBar} aria-hidden="true" />
                )}
                <table className={`${styles.table} ${styles.stripedTable}`}>
                  <thead>
                    <tr>
                      <th>Loại biến động</th>
                      <th style={{ textAlign: "left" }}>Người dùng</th>
                      <th style={{ textAlign: "left" }}>Mã phiên / đơn</th>
                      <th style={{ textAlign: "left" }}>Kết quả xử lý</th>
                      <th>Số tiền</th>
                      <th>Thời gian ghi sổ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.items.map((item) => {
                      const forfeited = item.outcome === "Forfeited";
                      const outcomeLabel = forfeited ? "Đã tịch thu"
                        : item.outcome === "TransferredToCounterparty" ? "Đã chuyển qua đối tác" : "Đã trả về ví";
                      return (
                        <tr key={item.journalId}>
                          <td>
                            <span
                              className={`${styles.kindTag} ${HISTORY_KIND_STYLE[item.kind]}`}
                            >
                              {item.kindLabel}
                            </span>
                          </td>
                          <td style={{ textAlign: "left" }}>
                            <div className={styles.holderCell}>
                              {item.holderId ? (
                                <Link
                                  to={`/users/${item.holderId}`}
                                  style={{
                                    color: "var(--shop-ink)",
                                    fontWeight: 700,
                                    textDecoration: "none",
                                  }}
                                >
                                  {item.holderName}
                                </Link>
                              ) : (
                                <strong>{item.holderName}</strong>
                              )}
                              {item.holderEmail && (
                                <span className={styles.holderEmail}>
                                  {item.holderEmail}
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
                            <span
                              className={`${styles.outcomePill} ${
                                forfeited ? styles.outcomeForfeited : styles.outcomeReturned
                              }`}
                            >
                              {outcomeLabel}
                            </span>
                            <span className={styles.outcomeDetail}>
                              {item.detail}
                            </span>
                          </td>
                          <td>
                            <strong
                              className={
                                forfeited ? styles.negativeAmt : styles.positiveAmt
                              }
                            >
                              {forfeited ? "-" : "+"}
                              {formatVnd(item.amount)}
                            </strong>
                          </td>
                          <td>{formatRevenueDate(item.postedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={styles.paginationRow}>
                <span>
                  Hiển thị {historyData.items.length} / {historyData.totalItems}{" "}
                  bút toán · Trang {historyData.page}/{historyTotalPages}
                </span>
                <div className={styles.paginationBtns}>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={historyPage <= 1 || historyQuery.isFetching}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  >
                    Trang trước
                  </button>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={
                      historyPage >= historyTotalPages ||
                      historyQuery.isFetching
                    }
                    onClick={() =>
                      setHistoryPage((p) => Math.min(historyTotalPages, p + 1))
                    }
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
