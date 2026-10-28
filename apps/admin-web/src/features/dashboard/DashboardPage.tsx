import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { refreshDashboard } from "../../core/dashboard-cache";
import { Link, useOutletContext } from "react-router-dom";
import {
  ArrowRight,
  RefreshCw,
  Clock3,
  Handshake,
  PackageCheck,
  Scale,
  Truck,
} from "lucide-react";
import type { CurrentUser } from "@used-books/session-client";
import { Button, ErrorNotice } from "../../core/ui";
import { canReview, canReviewCatalog, session } from "../../core/session";
import { dateText } from "../../core/format";
import { dashboardSources } from "./sources";
import styles from "./DashboardPage.module.css";
import { PendingShelf } from "./PendingShelf";
import { overviewSeries } from "./overview";
import { dashboardSourceQuery, dashboardOverviewQuery } from "./queries";
import { ModerationChart } from "./ModerationChart";
import { PointCapacity } from "./PointCapacity";
import { AquariumMetric } from "./AquariumMetric";
import { ForestMetric } from "./ForestMetric";
import { SkyMetric } from "./SkyMetric";

const taskIcons = {
  intakes: PackageCheck,
  collections: Handshake,
  resolutions: Scale,
  escalations: Clock3,
  deliveries: Truck,
};

const desks = new Set([
  "listings",
  "points",
  "escalations",
  "resolutions",
  "intakes",
  "collections",
  "deliveries",
]);
export function DashboardPage() {
  const queryClient = useQueryClient();
  const user = useOutletContext<CurrentUser>();
  const [days, setDays] = useState<7 | 30>(7);
  const sources = dashboardSources(user).filter((source) =>
    desks.has(source.id),
  );
  const results = useQueries({
    queries: sources.map((source) =>
      dashboardSourceQuery(user, source, session.request.bind(session)),
    ),
  });
  const overview = useQuery(
    dashboardOverviewQuery(user, days, session.request.bind(session)),
  );
  const find = (id: string) =>
    results[sources.findIndex((source) => source.id === id)];
  const shelf = find("listings"),
    points = find("points");
  const data = overview.data;
  const emptyQueue =
    data && data.pending.listings === 0 && (data.pending.catalog ?? 0) === 0;
  const totals = data
    ? overviewSeries(data, "all").reduce(
        (sum, row) => ({
          submitted: sum.submitted + row.submitted,
          processed: sum.processed + row.processed,
        }),
        { submitted: 0, processed: 0 },
      )
    : null;
  const fetching =
    results.some((result) => result.isFetching) || overview.isFetching;
  const attention = sources.filter(
    (source) => !["listings", "points"].includes(source.id),
  );
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1>
            Tổng quan<span aria-hidden="true">.</span>
          </h1>
          <p>
            {data
              ? new Intl.DateTimeFormat("vi-VN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "Asia/Ho_Chi_Minh",
                }).format(new Date(data.serverTime))
              : "Bàn vận hành Lật lại"}
          </p>
        </div>
        <div className={styles.headerActions}>
          {canReview(user) && (
            <div
              className={styles.period}
              role="group"
              aria-label="Khoảng thời gian thống kê"
            >
              {([7, 30] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={days === value}
                  onClick={() => setDays(value)}
                >
                  {value} ngày
                </button>
              ))}
            </div>
          )}
          <Button
            className={styles.refreshButton}
            busy={fetching}
            onClick={() => void refreshDashboard(queryClient)}
            aria-label="Cập nhật tổng quan"
          >
            {!fetching && (
              <RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" />
            )}
            <span>Cập nhật</span>
          </Button>
        </div>
      </header>
      {canReview(user) && (
        <>
          {overview.isError && (
            <ErrorNotice
              error={overview.error}
              retry={() => void overview.refetch()}
              busy={overview.isFetching}
            />
          )}
          {overview.isError && data && (
            <p className={styles.notice}>
              Đang giữ thống kê lần trước; chưa cập nhật được.
            </p>
          )}
          <dl className={styles.metrics} aria-label="Số liệu kiểm duyệt">
            <SkyMetric value={totals?.submitted ?? null} days={days} />
            <ForestMetric value={totals?.processed ?? null} days={days} />
            <AquariumMetric
              value={
                data
                  ? data.pending.listings + (data.pending.catalog ?? 0)
                  : null
              }
              catalog={canReviewCatalog(user)}
            />
          </dl>
          <div className={styles.overviewLayout}>
            {data ? (
              <ModerationChart key={days} data={data} />
            ) : (
              <section
                className={styles.chartLoading}
                aria-label="Nhịp kiểm duyệt"
              >
                <h2>Nhịp kiểm duyệt</h2>
                <p role="status">
                  {overview.isPending
                    ? "Đang lấy thống kê…"
                    : "Chưa tải được biểu đồ."}
                </p>
              </section>
            )}
            <aside
              className={styles.workboard}
              aria-labelledby="workboard-title"
            >
              <svg
                className={`${styles.workOrnament} ${styles.workCornerTop}`}
                viewBox="0 0 96 96"
                fill="none"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M8 10h54c14 0 24 10 24 24v52M28 18h34c10 0 16 6 16 16v32M48 26h14c6 0 8 2 8 8v12" />
              </svg>
              <svg
                className={`${styles.workOrnament} ${styles.workCornerBottom}`}
                viewBox="0 0 88 88"
                fill="none"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M10 76c36 0 66-30 66-66M30 76c25 0 46-21 46-46M50 76c14 0 26-12 26-26" />
              </svg>
              <header>
                <ArrowRight
                  className={styles.workMark}
                  size={28}
                  aria-hidden="true"
                />
                <h2 id="workboard-title">
                  {emptyQueue ? (
                    <>
                      Hàng chờ <br />
                      đã trống.
                    </>
                  ) : (
                    <>
                      Đến lượt <br />
                      xử lý.
                    </>
                  )}
                </h2>
                <p>
                  {emptyQueue
                    ? "Hiện chưa có hồ sơ chờ kiểm duyệt."
                    : "Mở một hàng chờ để tiếp tục công việc."}
                </p>
              </header>
              <div className={styles.workLinks}>
                <Link to="/review/listings?status=PendingReview">
                  <span className={styles.actionFace}>
                    <span className={styles.workLabel}>
                      Bài đăng sách
                      <strong>{data?.pending.listings ?? "—"}</strong>
                    </span>
                    <ArrowRight size={19} aria-hidden="true" />
                  </span>
                </Link>
                {canReviewCatalog(user) && (
                  <Link to="/review/catalog-requests?status=Pending">
                    <span className={styles.actionFace}>
                      <span className={styles.workLabel}>
                        Đầu sách<strong>{data?.pending.catalog ?? "—"}</strong>
                      </span>
                      <ArrowRight size={19} aria-hidden="true" />
                    </span>
                  </Link>
                )}
              </div>
              <p className={styles.workboardFoot}>
                {data
                  ? "Số hồ sơ hiện tại · " +
                    new Intl.DateTimeFormat("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Ho_Chi_Minh",
                    }).format(new Date(data.serverTime))
                  : "Chờ dữ liệu thống kê"}
              </p>
            </aside>
          </div>
        </>
      )}
      {shelf && (
        <PendingShelf
          snapshot={shelf.data}
          pending={shelf.isPending}
          fetching={shelf.isFetching}
          error={shelf.error}
          admin={canReviewCatalog(user)}
          retry={() => void shelf.refetch()}
        />
      )}
      <div className={points ? styles.bottomGrid : styles.singleBottom}>
        <section className={styles.attention} aria-labelledby="attention-title">
          <header className={styles.sectionHeader}>
            <h2 id="attention-title">
              {canReview(user) ? "Việc tại điểm" : "Vận hành mô phỏng"}
            </h2>
            <span>Theo quyền của bạn</span>
          </header>
          {attention.map((source) => {
            const result = find(source.id);
            const TaskIcon =
              taskIcons[source.id as keyof typeof taskIcons] ?? PackageCheck;
            return (
              <div
                className={styles.task}
                key={source.id}
                data-empty={result.data?.value === 0 && !result.isError}
              >
                <Link to={source.to}>
                  <span className={styles.actionFace}>
                    <TaskIcon
                      className={styles.taskIcon}
                      size={20}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <span className={styles.taskLabel}>
                      {source.title}
                      <small>{source.note}</small>
                    </span>
                    <strong>
                      {result.data
                        ? String(result.data.value) +
                          (result.data.more ? "+" : "")
                        : "—"}
                    </strong>
                    <ArrowRight size={16} aria-hidden="true" />
                  </span>
                </Link>
                {result.isPending && <p role="status">Đang tải…</p>}
                {result.isError && (
                  <>
                    <ErrorNotice
                      error={result.error}
                      retry={() => void result.refetch()}
                      busy={result.isFetching}
                    />
                    {result.data && (
                      <p>Dữ liệu lần trước; chưa cập nhật được.</p>
                    )}
                  </>
                )}
                {result.data &&
                  result.data.value > 0 &&
                  result.data.rows.slice(0, 2).map((row) => (
                    <p key={row.id}>
                      {row.title} · {row.detail}
                    </p>
                  ))}
              </div>
            );
          })}
          <p className={styles.chartFootnote}>
            Số hồ sơ trong danh sách đã tải. Mở từng khu vực để xem điều kiện và
            xử lý.
          </p>
        </section>
        {points && (
          <section className={styles.capacity} aria-labelledby="capacity-title">
            <header className={styles.sectionHeader}>
              <h2 id="capacity-title">Sức chứa điểm giao nhận</h2>
            </header>
            <p className={styles.capacityIntro}>
              Chỗ đang được giữ trên sức chứa hiện tại.
            </p>
            {points.isPending && <p role="status">Đang tải các điểm…</p>}
            {points.isError && (
              <>
                <ErrorNotice
                  error={points.error}
                  retry={() => void points.refetch()}
                  busy={points.isFetching}
                />
                {points.data && <p>Dữ liệu lần trước; chưa cập nhật được.</p>}
              </>
            )}
            {points.data?.points?.map((point) => (
              <PointCapacity key={point.id} point={point} />
            ))}
            {points.data?.points?.length === 0 && (
              <p>Chưa có điểm giao nhận.</p>
            )}
            <Link className={styles.open} to="/operations/points">
              <span className={styles.actionFace}>
                <span>Quản lý điểm</span>
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
          </section>
        )}
      </div>
      {data && (
        <p className={styles.freshness}>
          Cập nhật {dateText(data.serverTime)} · Thống kê theo ngày TP.HCM
        </p>
      )}
    </div>
  );
}
