import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { ApiError, type CurrentUser } from "@used-books/session-client";
import { canReview, session } from "../../core/session";
import { ErrorNotice } from "../../core/ui";
import { dashboardKeys } from "../../core/dashboard-cache";
import { dashboardRevenueQuery } from "./queries";
import { dateInputInHcm, formatRevenueDate, formatVnd, subtractDays } from "./revenue";
import styles from "./StatisticsPage.module.css";
import { CalendarRange, RefreshCw } from "lucide-react";

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
  const revenue = useQuery(
    dashboardRevenueQuery(
      user,
      range.from,
      range.to,
      page,
      session.request.bind(session),
    ),
  );
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
          <p className={styles.kicker}>Bàn quản trị · Tài chính</p>
          <h1>Thống kê doanh thu</h1>
          <p className={styles.intro}>
            Theo dõi phần doanh thu nền tảng đã được ghi nhận theo từng ngày.
          </p>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={() => void revenue.refetch()}
          disabled={revenue.isFetching}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Cập nhật
        </button>
      </header>

      <section className={styles.report} aria-labelledby="revenue-report-title">
        <header className={styles.reportHeader}>
          <div>
            <h2 id="revenue-report-title">Doanh thu theo lịch</h2>
            <p>Chọn ngày bắt đầu và kết thúc để xem báo cáo.</p>
          </div>
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
        </header>

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
              <div className={styles.primaryMetric}>
                <span>Tổng doanh thu</span>
                <strong>{formatVnd(revenue.data.total)}</strong>
                <small>
                  {revenue.data.from} – {revenue.data.to}
                </small>
              </div>
              <div>
                <span>Đơn đã settlement</span>
                <strong>{revenue.data.orderSettlements}</strong>
                <small>Đơn đã hoàn tất ghi nhận</small>
              </div>
              <div>
                <span>Trạng thái dữ liệu</span>
                <strong>
                  {revenue.isFetching ? "Đang cập nhật" : revenue.isError ? "Dữ liệu lần trước" : "Đã cập nhật"}
                </strong>
                <small>Múi giờ TP.HCM</small>
              </div>
            </div>
            <div className={styles.chartShell}>
              <div className={styles.chartHeading}>
                <div>
                  <h3>Nhịp doanh thu</h3>
                  <p>Mỗi cột là tổng phí được ghi nhận trong ngày.</p>
                </div>
                <span>{revenue.data.daily.length} ngày</span>
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
              <p className={styles.chartNote}>
                Nguồn: ledger bất biến · cập nhật theo giờ TP.HCM
              </p>
            </div>
            <section className={styles.transactions} aria-labelledby="revenue-transactions-title">
              <div className={styles.transactionsHeader}>
                <div>
                  <h3 id="revenue-transactions-title">Chi tiết giao dịch</h3>
                  <p>Các khoản đã ghi nhận vào sổ cái trong khoảng thời gian này.</p>
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
    </main>
  );
}
