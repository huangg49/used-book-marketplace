import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { ApiError, type CurrentUser } from "@used-books/session-client";
import { canReview, session } from "../../core/session";
import { ErrorNotice } from "../../core/ui";
import { dashboardKeys } from "../../core/dashboard-cache";
import { dashboardRevenueQuery } from "./queries";
import {
  dateInputInHcm,
  formatRevenueDate,
  formatVnd,
  signedImage,
  subtractDays,
  type SignedImage,
  type RevenueOverview,
} from "./revenue";
import styles from "./StatisticsPage.module.css";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  CalendarRange,
  Database,
  Gavel,
  RefreshCw,
  Repeat2,
  Star,
  Trophy,
  UserRound,
  X,
} from "lucide-react";

type DetailView =
  | { kind: "account" }
  | { kind: "book"; book: RevenueOverview["highestPricedBooks"][number] }
  | { kind: "period" };

const insightBookTypes = [
  { type: "Sale", label: "Mua bán" },
  { type: "Exchange", label: "Trao đổi" },
  { type: "Auction", label: "Đấu giá" },
] as const;

export function StatisticsPage() {
  const user = useOutletContext<CurrentUser>();
  const queryClient = useQueryClient();
  const today = dateInputInHcm();
  const [range, setRange] = useState({
    from: subtractDays(today, 6),
    to: today,
  });
  const [draft, setDraft] = useState(range);
  const [page, setPage] = useState(1);
  const [detailView, setDetailView] = useState<DetailView | null>(null);
  const closeDetailRef = useRef<HTMLButtonElement>(null);
  const revenue = useQuery(
    dashboardRevenueQuery(
      user,
      range.from,
      range.to,
      page,
      session.request.bind(session),
    ),
  );
  const avatar = useQuery({
    queryKey: ["revenue-avatar", revenue.data?.topRevenueAccount?.accountId],
    enabled: Boolean(revenue.data?.topRevenueAccount?.avatarId),
    queryFn: () =>
      session.request(
        `/operations/users/${revenue.data!.topRevenueAccount!.accountId}/avatar/read`,
        signedImage,
      ),
    staleTime: 300_000,
  });
  const coverQueries = useQuery({
    queryKey: [
      "revenue-covers",
      ...(revenue.data?.highestPricedBooks.map((book) => `${book.listingId}:${book.mediaId}`) ?? []),
    ],
    enabled: Boolean(revenue.data?.highestPricedBooks.some((book) => book.mediaId)),
    queryFn: async () => {
      const entries = await Promise.all(
        (revenue.data?.highestPricedBooks ?? [])
          .filter((book) => book.mediaId)
          .map(async (book) => [
            book.mediaId!,
            await session.request(
              `/operations/listings/${book.listingId}/media/${book.mediaId}/read`,
              signedImage,
            ),
          ] as const),
      );
      return Object.fromEntries(entries) as Record<string, SignedImage>;
    },
    staleTime: 300_000,
  });
  const denied =
    revenue.error instanceof ApiError && [401, 403].includes(revenue.error.status);
  useEffect(() => {
    if (denied) {
      queryClient.removeQueries({
        queryKey: dashboardKeys.revenueScope(user),
        type: "inactive",
      });
    }
  }, [denied, queryClient, user]);
  useEffect(() => {
    if (!detailView) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeDetailRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailView(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [detailView]);
  const canApply =
    draft.from.length === 10 &&
    draft.to.length === 10 &&
    draft.from <= draft.to;
  const maxAmount = Math.max(
    1,
    ...(revenue.data?.daily.map((day) => day.amount) ?? []),
  );
  const chartWidth = 1000;
  const chartHeight = 260;
  const chartPadding = { top: 24, right: 12, bottom: 34, left: 12 };
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const daily = revenue.data?.daily ?? [];
  const chartPoints = daily
    .map((day, index) => {
      const x =
        chartPadding.left +
        (daily.length > 1 ? (index / (daily.length - 1)) * plotWidth : plotWidth / 2);
      const y =
        chartPadding.top + plotHeight - (day.amount / maxAmount) * plotHeight;
      return { day, x, y };
    });
  const labelStep = Math.max(1, Math.ceil(daily.length / 12));
  const booksByType = new Map(
    (revenue.data?.highestPricedBooks ?? []).map((book) => [book.type, book]),
  );

  if (!canReview(user) || denied) {
    return (
      <main className={styles.page}>
        <section className={styles.denied} aria-labelledby="statistics-denied">
          <h1 id="statistics-denied">Không có quyền xem thống kê</h1>
          <p>
            {revenue.error instanceof ApiError && revenue.error.status === 401
              ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
              : "Khu vực này chỉ dành cho nhân viên và quản trị viên."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Doanh thu theo kỳ</h1>
          <p className={styles.intro}>
            Theo dõi doanh thu nền tảng đã được ghi nhận theo từng ngày.
          </p>
        </div>
        <div className={styles.headerActions}>
          <form
            className={styles.dateForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (canApply) {
                setRange(draft);
                setPage(1);
              }
            }}
          >
            <label>
              <span>Từ ngày</span>
              <input
                type="date"
                value={draft.from}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, from: event.target.value }))
                }
              />
            </label>
            <span className={styles.rangeArrow} aria-hidden="true">
              →
            </span>
            <label>
              <span>Đến ngày</span>
              <input
                type="date"
                value={draft.to}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, to: event.target.value }))
                }
              />
            </label>
            <button type="submit" disabled={!canApply || revenue.isFetching}>
              <CalendarRange size={16} aria-hidden="true" />
              Xem báo cáo
            </button>
          </form>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void revenue.refetch()}
            disabled={revenue.isFetching}
            aria-label="Cập nhật báo cáo"
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className={styles.report} aria-labelledby="revenue-report-title">
        <h2 id="revenue-report-title" className={styles.srOnly}>
          Báo cáo doanh thu
        </h2>
        {revenue.isError && (
          <ErrorNotice
            error={revenue.error}
            retry={() => void revenue.refetch()}
            busy={revenue.isFetching}
          />
        )}
        {revenue.isError && revenue.data && (
          <p className={styles.stale}>Đang hiển thị dữ liệu lần trước.</p>
        )}

        {revenue.isPending && !revenue.data ? (
          <p className={styles.status} role="status">
            Đang tải báo cáo doanh thu…
          </p>
        ) : revenue.data ? (
          <>
            <div className={styles.summary}>
              <div className={`${styles.primaryMetric} ${styles.metricCard}`}>
                <div className={styles.metricHeader}>
                  <span>Tổng doanh thu</span>
                  <span className={styles.metricIcon} aria-hidden="true">
                    <BarChart3 size={18} />
                  </span>
                </div>
                <strong>{formatVnd(revenue.data.total)}</strong>
                <small>
                  {revenue.data.from} – {revenue.data.to}
                </small>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <span>Đơn đã settlement</span>
                  <span className={styles.metricIcon} aria-hidden="true">
                    <BadgeCheck size={18} />
                  </span>
                </div>
                <strong>{revenue.data.orderSettlements}</strong>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <span>Trạng thái dữ liệu</span>
                  <span className={styles.metricIcon} aria-hidden="true">
                    <Database size={18} />
                  </span>
                </div>
                <strong>
                  {revenue.isFetching ? "Đang cập nhật" : revenue.isError ? "Dữ liệu lần trước" : "Đã cập nhật"}
                </strong>
              </div>
            </div>
            <section className={styles.featuredGrid} aria-label="Điểm nổi bật chính">
              <button
                type="button"
                className={`${styles.featuredCard} ${styles.featuredAccount}`}
                onClick={() =>
                  revenue.data.topRevenueAccount &&
                  setDetailView({ kind: "account" })
                }
                disabled={!revenue.data.topRevenueAccount}
              >
                <span className={styles.featuredBar}>
                  <Trophy size={17} aria-hidden="true" />
                  Người có doanh thu cao nhất
                </span>
                <span className={styles.featuredContent}>
                  {avatar.data?.url ? (
                    <img className={styles.avatarImage} src={avatar.data.url} alt="" />
                  ) : (
                    <span className={styles.avatar} aria-hidden="true">
                      <UserRound size={28} />
                    </span>
                  )}
                  <span className={styles.featuredIdentity}>
                    <strong>
                      {revenue.data.topRevenueAccount?.displayName ?? "Chưa có dữ liệu"}
                    </strong>
                    <span>
                      Tổng doanh thu:{" "}
                      <b>
                        {formatVnd(revenue.data.topRevenueAccount?.revenue ?? 0)}
                      </b>
                    </span>
                  </span>
                  <span className={styles.featuredAside}>
                    <ArrowUpRight size={18} aria-hidden="true" />
                    <span>
                      <b>
                        {revenue.data.total
                          ? `${Math.round(
                              ((revenue.data.topRevenueAccount?.revenue ?? 0) /
                                revenue.data.total) *
                                1000,
                            ) / 10}%`
                          : "—"}
                      </b>
                      <small>tổng doanh thu</small>
                    </span>
                  </span>
                </span>
              </button>
              {revenue.data.highestPricedBooks[0] && (
                <button
                  type="button"
                  className={`${styles.featuredCard} ${styles.featuredBook}`}
                  onClick={() =>
                    setDetailView({
                      kind: "book",
                      book: revenue.data.highestPricedBooks[0],
                    })
                  }
                >
                  <span className={styles.featuredBar}>
                    <BookOpen size={17} aria-hidden="true" />
                    Cuốn sách có giá cao nhất
                  </span>
                  <span className={styles.featuredContent}>
                    {coverQueries.data?.[revenue.data.highestPricedBooks[0].mediaId ?? ""]?.url ? (
                      <img
                        className={styles.featuredBookImage}
                        src={
                          coverQueries.data[
                            revenue.data.highestPricedBooks[0].mediaId!
                          ].url
                        }
                        alt=""
                      />
                    ) : (
                      <span className={styles.bookCover} aria-hidden="true">
                        <BookOpen size={23} />
                      </span>
                    )}
                    <span className={styles.featuredIdentity}>
                      <strong>{revenue.data.highestPricedBooks[0].title}</strong>
                      <span>
                        Loại: {revenue.data.highestPricedBooks[0].label}
                      </span>
                      <span>
                        Giá cao nhất:{" "}
                        <b>{formatVnd(revenue.data.highestPricedBooks[0].amount)}</b>
                      </span>
                    </span>
                    <span className={styles.featuredAside}>
                      <Trophy size={19} aria-hidden="true" />
                      <span>Giá cao nhất<small>trong kỳ</small></span>
                    </span>
                  </span>
                </button>
              )}
            </section>
            <section className={styles.insights} aria-labelledby="revenue-insights-title">
              <div className={styles.insightsHeader}>
                <div>
                  <h3 id="revenue-insights-title">Điểm nổi bật trong kỳ</h3>
                  <p>Tài khoản có doanh thu cao nhất và sách có giá trị cao nhất theo từng hình thức.</p>
                </div>
                <button
                  type="button"
                  className={styles.detailLink}
                  onClick={() => setDetailView({ kind: "period" })}
                >
                  Xem chi tiết
                  <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.insightGrid}>
                <button
                  type="button"
                  className={`${styles.topAccount} ${styles.insightButton}`}
                  onClick={() =>
                    revenue.data.topRevenueAccount &&
                    setDetailView({ kind: "account" })
                  }
                  disabled={!revenue.data.topRevenueAccount}
                  aria-label="Xem chi tiết tài khoản có doanh thu cao nhất"
                >
                  {avatar.data?.url ? (
                    <img className={styles.insightAvatar} src={avatar.data.url} alt="" />
                  ) : (
                    <span className={styles.insightIcon} aria-hidden="true">
                      <Trophy size={18} />
                    </span>
                  )}
                  <span className={styles.insightLabel}>Tài khoản doanh thu cao nhất</span>
                  {revenue.data.topRevenueAccount ? (
                    <>
                      <strong>{revenue.data.topRevenueAccount.displayName}</strong>
                      <span>{formatVnd(revenue.data.topRevenueAccount.revenue)}</span>
                    </>
                  ) : (
                    <p className={styles.insightEmpty}>Chưa có giao dịch bán đã hoàn tất.</p>
                  )}
                </button>
                {insightBookTypes.map(({ type, label }) => {
                  const book = booksByType.get(type);
                  return (
                    <button
                      type="button"
                      className={`${styles.bookInsight} ${styles.insightButton} ${
                        type === "Exchange"
                          ? styles.exchangeInsight
                          : type === "Auction"
                            ? styles.auctionInsight
                            : ""
                      }`}
                      key={type}
                      onClick={() => book && setDetailView({ kind: "book", book })}
                      disabled={!book}
                      aria-label={
                        book
                          ? `Xem chi tiết ${label}: ${book.title}`
                          : `${label}: chưa có giao dịch`
                      }
                    >
                      {book && coverQueries.data?.[book.mediaId ?? ""]?.url ? (
                        <img
                          className={styles.insightCover}
                          src={coverQueries.data[book.mediaId!].url}
                          alt=""
                        />
                      ) : (
                        <span className={styles.insightIcon} aria-hidden="true">
                          {type === "Exchange" ? (
                            <Repeat2 size={18} />
                          ) : type === "Auction" ? (
                            <Gavel size={18} />
                          ) : (
                            <BookOpen size={18} />
                          )}
                        </span>
                      )}
                      <span className={styles.insightLabel}>{label}</span>
                      <strong>{book?.title ?? "Chưa có dữ liệu"}</strong>
                      <span>{formatVnd(book?.amount ?? 0)}</span>
                      <small>{book?.sellerName ?? "Chưa phát sinh trong kỳ"}</small>
                    </button>
                  );
                })}
              </div>
            </section>
            <div className={styles.chartShell}>
              <div className={styles.chartHeading}>
                <div>
                  <h3>Nhịp doanh thu</h3>
                  <p>Mỗi cột là tổng phí được ghi nhận trong ngày.</p>
                </div>
                <div className={styles.chartActions}>
                  {[7, 30, 90].map((days) => {
                    const active =
                      revenue.data?.daily.length === days ||
                      (days === 7 && revenue.data?.daily.length < 8);
                    return (
                      <button
                        key={days}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          const next = {
                            from: subtractDays(today, days - 1),
                            to: today,
                          };
                          setDraft(next);
                          setRange(next);
                          setPage(1);
                        }}
                      >
                        {days} ngày
                      </button>
                    );
                  })}
                </div>
              </div>
              <div
                className={styles.chart}
                role="img"
                aria-label={`Biểu đồ xu hướng doanh thu từ ${revenue.data.from} đến ${revenue.data.to}`}
              >
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <line
                    className={styles.chartGrid}
                    x1={chartPadding.left}
                    x2={chartWidth - chartPadding.right}
                    y1={chartPadding.top + plotHeight}
                    y2={chartPadding.top + plotHeight}
                  />
                  <polyline
                    className={styles.chartLine}
                    points={chartPoints.map(({ x, y }) => `${x},${y}`).join(" ")}
                  />
                  {chartPoints.map(({ day, x, y }, index) => (
                    <g key={day.date}>
                      <circle
                        className={styles.chartPoint}
                        cx={x}
                        cy={y}
                        r={daily.length > 45 ? 3 : 4}
                      >
                        <title>{`${day.date}: ${formatVnd(day.amount)}`}</title>
                      </circle>
                      {(index % labelStep === 0 || index === daily.length - 1) && (
                        <text
                          className={styles.chartDate}
                          x={x}
                          y={chartHeight - 8}
                          textAnchor="middle"
                        >
                          {day.date.slice(8)}/{day.date.slice(5, 7)}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
              </div>
            </div>
            <section className={styles.transactions} aria-labelledby="revenue-transactions-title">
              <div className={styles.transactionsHeader}>
                <div>
                  <h3 id="revenue-transactions-title">Chi tiết giao dịch</h3>
                </div>
                <span>
                  {revenue.data.totalTransactions} giao dịch · trang{" "}
                  {revenue.data.page}
                </span>
              </div>
              {revenue.data.transactions.length > 0 ? (
                <div className={styles.tableWrap}>
                  <table>
                    <caption className={styles.srOnly}>
                      Danh sách giao dịch tạo nên tổng doanh thu
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Thời gian</th>
                        <th scope="col">Loại giao dịch</th>
                        <th scope="col">Mã tham chiếu</th>
                        <th scope="col">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenue.data.transactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td>{formatRevenueDate(transaction.postedAt)}</td>
                          <td>{transaction.label}</td>
                          <td>
                            <code>{transaction.referenceId ?? transaction.id}</code>
                          </td>
                          <td className={styles.amount}>{formatVnd(transaction.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.status}>Chưa có giao dịch tạo doanh thu trong khoảng đã chọn.</p>
              )}
              {revenue.data.totalTransactions > 10 && (
                <div className={styles.pagination} aria-label="Phân trang giao dịch">
                  <button
                    type="button"
                    onClick={() => setPage((current) => current - 1)}
                    disabled={page === 1 || revenue.isFetching}
                  >
                    Trước
                  </button>
                  <span>
                    Trang {revenue.data.page} /{" "}
                    {Math.ceil(revenue.data.totalTransactions / revenue.data.pageSize)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((current) => current + 1)}
                    disabled={
                      page >=
                        Math.ceil(
                          revenue.data.totalTransactions / revenue.data.pageSize,
                        ) || revenue.isFetching
                    }
                  >
                    Sau
                  </button>
                </div>
              )}
            </section>
          </>
        ) : (
          <p className={styles.status}>Chưa có dữ liệu trong khoảng đã chọn.</p>
        )}
      </section>
      {detailView &&
        revenue.data &&
        createPortal(
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailView(null);
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="revenue-detail-title"
          >
            <header className={styles.modalHeader}>
              <div>
                {detailView.kind !== "period" && (
                  <button
                    type="button"
                    className={styles.modalBack}
                    onClick={() => setDetailView({ kind: "period" })}
                    aria-label="Quay lại điểm nổi bật trong kỳ"
                  >
                    <ArrowLeft size={20} aria-hidden="true" />
                  </button>
                )}
                <span className={styles.modalIcon} aria-hidden="true">
                  {detailView.kind === "account" ? (
                    <UserRound size={20} />
                  ) : detailView.kind === "book" ? (
                    <BookOpen size={20} />
                  ) : (
                    <Star size={20} />
                  )}
                </span>
                <h2 id="revenue-detail-title">
                  {detailView.kind === "account"
                    ? "Tài khoản doanh thu cao nhất"
                    : detailView.kind === "book"
                      ? detailView.book.title
                      : "Điểm nổi bật trong kỳ"}
                </h2>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                ref={closeDetailRef}
                onClick={() => setDetailView(null)}
                aria-label="Đóng chi tiết"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className={styles.modalBody}>
              {detailView.kind === "account" && revenue.data.topRevenueAccount ? (
                <>
                  <div className={styles.accountSummary}>
                    <div className={styles.modalSummary}>
                      {avatar.data?.url ? (
                        <img
                          className={styles.profileImage}
                          src={avatar.data.url}
                          alt=""
                        />
                      ) : (
                        <div className={styles.profileMark} aria-hidden="true">
                          <UserRound size={28} />
                        </div>
                      )}
                      <div>
                        <div className={styles.nameLine}>
                          <h3>{revenue.data.topRevenueAccount.displayName}</h3>
                          <span className={styles.rankBadge}>Top 1</span>
                        </div>
                        <p className={styles.modalEyebrow}>
                          Tài khoản dẫn đầu doanh thu trong kỳ
                        </p>
                      </div>
                      <div className={styles.modalMetric}>
                        <strong>{formatVnd(revenue.data.topRevenueAccount.revenue)}</strong>
                        <span>Tổng doanh thu</span>
                      </div>
                      <div className={styles.modalMetric}>
                        <strong>
                          {revenue.data.total
                            ? `${Math.round(
                                (revenue.data.topRevenueAccount.revenue /
                                  revenue.data.total) *
                                  1000,
                              ) / 10}%`
                            : "—"}
                        </strong>
                        <span>Tỷ lệ đóng góp</span>
                      </div>
                    </div>
                  </div>
                  <section className={styles.modalTransactions} aria-labelledby="account-detail-title">
                    <h3 id="account-detail-title">
                      <BarChart3 size={18} aria-hidden="true" />
                      Giao dịch doanh thu trong kỳ
                    </h3>
                    {revenue.data.transactions.length > 0 ? (
                      <div className={styles.modalTableWrap}>
                        <table>
                          <caption className={styles.srOnly}>
                            Các giao dịch doanh thu được ghi nhận trong kỳ báo cáo
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Thời gian</th>
                              <th scope="col">Hình thức giao dịch</th>
                              <th scope="col">Mã tham chiếu</th>
                              <th scope="col">Giá trị</th>
                            </tr>
                          </thead>
                          <tbody>
                            {revenue.data.transactions.slice(0, 5).map((transaction) => (
                              <tr key={transaction.id}>
                                <td>{formatRevenueDate(transaction.postedAt)}</td>
                                <td>
                                  <span
                                    className={`${styles.transactionBadge} ${
                                      transaction.type === "OrderSettlement"
                                        ? styles.saleBadge
                                        : styles.feeBadge
                                    }`}
                                  >
                                    {transaction.label}
                                  </span>
                                </td>
                                <td>
                                  <code>
                                    {transaction.referenceId ?? transaction.id}
                                  </code>
                                </td>
                                <td className={styles.amount}>
                                  {formatVnd(transaction.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className={styles.status}>Chưa có giao dịch trong kỳ đã chọn.</p>
                    )}
                  </section>
                  <p className={styles.modalCallout}>
                    <Star size={16} aria-hidden="true" />
                    {revenue.data.topRevenueAccount.displayName} hiện là người có doanh
                    thu cao nhất trong khoảng thời gian từ {revenue.data.from} đến{" "}
                    {revenue.data.to}.
                  </p>
                </>
              ) : detailView.kind === "book" ? (
                <div className={styles.modalSummary}>
                  {coverQueries.data?.[detailView.book.mediaId ?? ""]?.url ? (
                    <img
                      className={styles.bookImage}
                      src={coverQueries.data[detailView.book.mediaId!].url}
                      alt=""
                    />
                  ) : (
                    <div className={styles.bookMark} aria-hidden="true">
                      <BookOpen size={28} />
                    </div>
                  )}
                  <div>
                    <p className={styles.modalEyebrow}>{detailView.book.label}</p>
                    <h3>{detailView.book.title}</h3>
                    <p>Người bán: {detailView.book.sellerName}</p>
                  </div>
                  <strong>{formatVnd(detailView.book.amount)}</strong>
                </div>
              ) : (
                <div className={styles.modalOverview}>
                  <p>
                    Tổng hợp số liệu trong khoảng thời gian{" "}
                    <strong>
                      {revenue.data.from} – {revenue.data.to}
                    </strong>
                    .
                  </p>
                  <div className={styles.modalStats}>
                    <div>
                      <span>Tổng doanh thu</span>
                      <strong>{formatVnd(revenue.data.total)}</strong>
                    </div>
                    <div>
                      <span>Tổng số giao dịch</span>
                      <strong>{revenue.data.totalTransactions}</strong>
                    </div>
                    <div>
                      <span>Đơn đã bán</span>
                      <strong>{revenue.data.orderSettlements}</strong>
                    </div>
                  </div>
                  <div className={styles.modalHighlights}>
                    <button
                      type="button"
                      className={styles.modalHighlightCard}
                      onClick={() =>
                        revenue.data.topRevenueAccount &&
                        setDetailView({ kind: "account" })
                      }
                      disabled={!revenue.data.topRevenueAccount}
                    >
                      <span className={styles.modalHighlightBar}>
                        <Trophy size={16} aria-hidden="true" />
                        Người có doanh thu cao nhất
                      </span>
                      <span className={styles.modalHighlightBody}>
                        {avatar.data?.url ? (
                          <img
                            className={styles.profileImage}
                            src={avatar.data.url}
                            alt=""
                          />
                        ) : (
                          <span className={styles.profileMark} aria-hidden="true">
                            <UserRound size={23} />
                          </span>
                        )}
                        <span>
                          <strong>
                            {revenue.data.topRevenueAccount?.displayName ??
                              "Chưa có dữ liệu"}
                          </strong>
                          <small>
                            {formatVnd(
                              revenue.data.topRevenueAccount?.revenue ?? 0,
                            )}
                          </small>
                        </span>
                      </span>
                    </button>
                    {insightBookTypes.map(({ type, label }) => {
                      const book = booksByType.get(type);
                      return (
                      <button
                        type="button"
                        className={styles.modalHighlightCard}
                        onClick={() =>
                          book && setDetailView({ kind: "book", book })
                        }
                        disabled={!book}
                        key={type}
                      >
                        <span className={styles.modalHighlightBar}>
                          {type === "Exchange" ? (
                            <Repeat2 size={16} aria-hidden="true" />
                          ) : type === "Auction" ? (
                            <Gavel size={16} aria-hidden="true" />
                          ) : (
                            <BookOpen size={16} aria-hidden="true" />
                          )}
                          Sách {label.toLowerCase()} cao nhất
                        </span>
                        <span className={styles.modalHighlightBody}>
                          {book && coverQueries.data?.[book.mediaId ?? ""]?.url ? (
                            <img
                              className={styles.bookImage}
                              src={coverQueries.data[book.mediaId!].url}
                              alt=""
                            />
                          ) : (
                            <span className={styles.bookMark} aria-hidden="true">
                              <BookOpen size={21} />
                            </span>
                          )}
                          <span>
                            <strong>{book?.title ?? "Chưa có dữ liệu"}</strong>
                            <small>
                              {formatVnd(book?.amount ?? 0)}
                            </small>
                          </span>
                        </span>
                      </button>
                      );
                    })}
                  </div>
                  <section className={styles.modalBreakdown} aria-labelledby="revenue-breakdown-title">
                    <h3 id="revenue-breakdown-title">
                      <BarChart3 size={17} aria-hidden="true" />
                      Cơ cấu giao dịch
                    </h3>
                    <div className={styles.breakdownRows}>
                      <div>
                        <span>Đơn đã bán</span>
                        <strong>{revenue.data.orderSettlements}</strong>
                        <small>
                          {revenue.data.totalTransactions
                            ? `${Math.round(
                                (revenue.data.orderSettlements /
                                  revenue.data.totalTransactions) *
                                  1000,
                              ) / 10}% tổng giao dịch`
                            : "Chưa có giao dịch"}
                        </small>
                        <span className={styles.breakdownTrack}>
                          <span
                            style={{
                              width: `${
                                revenue.data.totalTransactions
                                  ? Math.min(
                                      100,
                                      (revenue.data.orderSettlements /
                                        revenue.data.totalTransactions) *
                                        100,
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </span>
                      </div>
                      <div>
                        <span>Phí đăng bán</span>
                        <strong>
                          {Math.max(
                            0,
                            revenue.data.totalTransactions -
                              revenue.data.orderSettlements,
                          )}
                        </strong>
                        <small>
                          {revenue.data.totalTransactions
                            ? `${Math.round(
                                ((revenue.data.totalTransactions -
                                  revenue.data.orderSettlements) /
                                  revenue.data.totalTransactions) *
                                  1000,
                              ) / 10}% tổng giao dịch`
                            : "Chưa có giao dịch"}
                        </small>
                        <span className={styles.breakdownTrack}>
                          <span
                            style={{
                              width: `${
                                revenue.data.totalTransactions
                                  ? Math.min(
                                      100,
                                      ((revenue.data.totalTransactions -
                                        revenue.data.orderSettlements) /
                                        revenue.data.totalTransactions) *
                                        100,
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </span>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body
      )}
    </main>
  );
}
