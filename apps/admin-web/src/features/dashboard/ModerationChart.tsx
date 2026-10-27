import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { overviewSeries, type Overview } from "./overview";
import styles from "./DashboardPage.module.css";
import { chartPoints, playChartTransition, type ChartShape } from "./chart-motion";
import { ScopeFilter, type ChartScope } from "./ScopeFilter";
const dateLabel = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;

export function ModerationChart({ data }: { data: Overview }) {
  const [scope, setScope] = useState<ChartScope>("all");
  const rows = useMemo(() => overviewSeries(data, scope), [data, scope]);
  const [day, setDay] = useState(rows.length - 1);
  const index = Math.min(day, rows.length - 1);
  const selected = rows[index];
  const id = useId();
  const figure = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(680);
  useEffect(() => {
    const element = figure.current;
    if (!element) return;
    if (typeof ResizeObserver !== "function") return;
    const resize = new ResizeObserver((entries) =>
      setWidth(Math.max(200, entries[0].contentRect.width)),
    );
    resize.observe(element);
    return () => {
      resize.disconnect();
    };
  }, []);
  const top = Math.max(
    4,
    Math.ceil(
      Math.max(...rows.flatMap((row) => [row.submitted, row.processed])) / 4,
    ) * 4,
  );
  const chartWidth = width - 70;
  const x = (i: number) => 38 + (i * chartWidth) / (rows.length - 1);
  const y = (value: number) => 170 - (value / top) * 140;
  const shape = useMemo<ChartShape>(() => ({
    dates: rows.map(row => row.date), width, top,
    submitted: rows.map((row, i) => [38 + i * (width - 70) / (rows.length - 1), 170 - row.submitted / top * 140]),
    processed: rows.map((row, i) => [38 + i * (width - 70) / (rows.length - 1), 170 - row.processed / top * 140]),
  }), [rows, width, top]);
  const transition = useRef<{ shape: ChartShape; from: ChartShape | null } | null>(null);
  const ink = useRef<SVGGElement>(null);
  const sent = useRef<SVGPolylineElement>(null);
  const done = useRef<SVGPolylineElement>(null);
  useLayoutEffect(() => {
    if (figure.current) {
      const css = getComputedStyle(figure.current);
      const actualWidth = Math.max(200, figure.current.getBoundingClientRect().width -
        parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) -
        parseFloat(css.borderLeftWidth) - parseFloat(css.borderRightWidth));
      // ResizeObserver supplies content width afterwards; avoid starting an
      // entrance using the server-render fallback coordinate system.
      if (Math.abs(actualWidth - shape.width) > .5) { setWidth(actualWidth); return; }
    }
    // StrictMode may clean up and replay this effect with the same shape.
    // Retain its origin so replay does not mistake a cancelled entrance for
    // an unchanged server poll. New shape identities still compare geometry.
    if (transition.current?.shape !== shape) transition.current = {
      shape, from: transition.current?.shape ?? null,
    };
    if (ink.current && sent.current && done.current)
      return playChartTransition(ink.current, sent.current, done.current, transition.current.from, shape);
  }, [shape]);
  const ticks = [
    ...new Set([
      0,
      ...rows.flatMap((_, i) =>
        i % Math.ceil((rows.length - 1) / (width < 420 ? 3 : 6)) === 0
          ? [i]
          : [],
      ),
      rows.length - 1,
    ]),
  ];
  const total = rows.reduce(
    (sum, row) => sum + row.submitted + row.processed,
    0,
  );
  return (
    <figure className={styles.chart} ref={figure}>
      <header className={styles.chartHeader}>
        <div>
          <h2 id={`${id}-title`}>Nhịp kiểm duyệt</h2>
          <p>Lượt gửi và quyết định theo ngày · giờ TP.HCM</p>
        </div>
        {data.pending.catalog !== null && (
          <ScopeFilter value={scope} onChange={setScope} />
        )}
      </header>
      <div className={styles.legend}>
        <span>
          <i className={styles.sentSwatch} />
          Gửi duyệt
        </span>
        <span>
          <i className={styles.doneSwatch} />
          Đã xử lý
        </span>
      </div>
      <svg
        className={styles.plot}
        viewBox={`0 0 ${width} 210`}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        onPointerMove={(event) => {
          const r = event.currentTarget.getBoundingClientRect();
          setDay(
            Math.max(
              0,
              Math.min(
                rows.length - 1,
                Math.round(
                  ((((event.clientX - r.left) / r.width) * width - 38) /
                    chartWidth) *
                    (rows.length - 1),
                ),
              ),
            ),
          );
        }}
      >
        <desc id={`${id}-desc`}>
          Biểu đồ {data.days} ngày. Gửi duyệt là từng lần gửi; đã xử lý là từng
          quyết định. Bảng số liệu đầy đủ ở bên dưới.
        </desc>
        {[0, 1, 2, 3, 4].map((tick) => (
          <g key={tick}>
            <line
              className={styles.gridline}
              x1="38"
              x2={width - 32}
              y1={y((top * tick) / 4)}
              y2={y((top * tick) / 4)}
            />
            <text
              className={styles.axisText}
              x="27"
              y={y((top * tick) / 4) + 4}
              textAnchor="end"
            >
              {(top * tick) / 4}
            </text>
          </g>
        ))}
        {ticks.map((i) => (
          <text
            key={i}
            className={styles.axisText}
            x={x(i)}
            y="198"
            textAnchor="middle"
          >
            {dateLabel(rows[i].date)}
          </text>
        ))}
        <g ref={ink} className={styles.ink}>
        <polyline
          ref={sent}
          className={styles.sentLine}
          points={chartPoints(shape.submitted)}
        />
        <polyline
          ref={done}
          className={styles.doneLine}
          points={chartPoints(shape.processed)}
        />
        </g>
        {total > 0 && (
          <>
            <line
              className={styles.cursor}
              x1={x(index)}
              x2={x(index)}
              y1="25"
              y2="170"
            />
            <circle data-chart-dot
              className={styles.sentDot}
              cx={x(index)}
              cy={y(selected.submitted)}
              r="4"
            />
            <circle data-chart-dot
              className={styles.doneDot}
              cx={x(index)}
              cy={y(selected.processed)}
              r="4"
            />
          </>
        )}
      </svg>
      {total === 0 && (
        <p className={styles.zeroChart}>
          Chưa có lượt gửi hoặc quyết định trong {data.days} ngày này.
        </p>
      )}
      <figcaption className={styles.chartReadout}>
        <div aria-live="polite" aria-atomic="true">
          <strong>{dateLabel(selected.date)}</strong>
          <span>{selected.submitted} gửi duyệt</span>
          <span>{selected.processed} đã xử lý</span>
        </div>
        <div className={styles.dayButtons}>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setDay(index - 1)}
            aria-label="Xem ngày trước"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            disabled={index === rows.length - 1}
            onClick={() => setDay(index + 1)}
            aria-label="Xem ngày sau"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </figcaption>
      <details className={styles.dataTable}>
        <summary>Xem bảng số liệu</summary>
        <p className={styles.chartFootnote}>Gửi lại là lượt mới; ngày gửi và ngày xử lý có thể khác nhau.</p>
        <div>
          <table>
            <caption>
              Lượt kiểm duyệt · {data.days} ngày ·{" "}
              {scope === "all"
                ? "Tất cả"
                : scope === "listings"
                  ? "Bài đăng"
                  : "Đầu sách"}
            </caption>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Gửi duyệt</th>
                <th>Chấp thuận</th>
                <th>Từ chối</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <th>{dateLabel(row.date)}</th>
                  <td>{row.submitted}</td>
                  <td>{row.approved}</td>
                  <td>{row.rejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
