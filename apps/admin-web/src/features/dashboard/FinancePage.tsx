import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { ApiError, type CurrentUser } from "@used-books/session-client";
import {
  BadgePercent,
  CircleAlert,
  Coins,
  RefreshCw,
  Repeat,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { canViewFinance, session } from "../../core/session";
import { ErrorNotice } from "../../core/ui";
import { dashboardFinanceQuery } from "./queries";
import { dateInputInHcm, formatVnd, subtractDays } from "./revenue";
import {
  formatBps,
  formatDelta,
  formatSignedVnd,
  type FinanceOverview,
} from "./finance";
import styles from "./StatisticsHub.module.css";

function FormulaTip({
  label,
  formula,
  note,
  align = "left",
}: {
  label: string;
  formula: string;
  note: string;
  align?: "left" | "right";
}) {
  return (
    <span className={styles.formulaTipWrap}>
      <button
        type="button"
        className={styles.formulaTipBtn}
        aria-label={`Xem công thức ${label}`}
      >
        <CircleAlert size={13} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className={`${styles.formulaTipBox} ${
          align === "right" ? styles.formulaTipRight : ""
        }`}
      >
        <strong className={styles.formulaTipTitle}>Công thức {label}</strong>
        <code className={styles.formulaTipFormula}>{formula}</code>
        <span className={styles.formulaTipNote}>{note}</span>
      </span>
    </span>
  );
}

function DeltaPill({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const { label, direction } = formatDelta(current, previous);
  const cls =
    direction === "up"
      ? styles.deltaUp
      : direction === "down"
        ? styles.deltaDown
        : styles.deltaFlat;
  return (
    <span className={`${styles.delta} ${cls}`}>
      {direction === "up" ? (
        <TrendingUp size={12} aria-hidden="true" />
      ) : direction === "down" ? (
        <TrendingDown size={12} aria-hidden="true" />
      ) : null}
      {label}
    </span>
  );
}

function ProfitChart({ daily }: { daily: FinanceOverview["daily"] }) {
  const width = 760;
  const height = 230;
  const padL = 62;
  const padR = 16;
  const padT = 18;
  const padB = 32;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxPositive = Math.max(
    1,
    ...daily.map((d) =>
      Math.max(
        d.directCommission +
          d.auctionCommission +
          Math.max(0, d.forfeitedDeposits - d.depositShare),
        d.profit,
      ),
    ),
  );
  const minVal = Math.min(0, ...daily.map((d) => d.profit));
  const range = Math.max(1, maxPositive - minVal);
  const yOf = (val: number) => padT + ((maxPositive - val) / range) * plotH;
  const zeroY = yOf(0);
  const step = plotW / Math.max(1, daily.length);
  const barW = Math.max(4, Math.min(22, step * 0.58));
  const labelStep = Math.max(1, Math.ceil(daily.length / 8));

  const profitPoints = daily
    .map((d, i) => `${(padL + i * step + step / 2).toFixed(1)},${yOf(d.profit).toFixed(1)}`)
    .join(" ");

  return (
    <div className={styles.chartWrap}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.chartSvg}
        role="img"
        aria-label={`Biểu đồ doanh thu và lợi nhuận theo ngày (${daily.length} ngày)`}
      >
        {[0, 0.5, 1].map((ratio) => {
          const val = Math.round(minVal + range * ratio);
          const y = yOf(val);
          return (
            <g key={ratio}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="#e5dacb"
                strokeDasharray={val === 0 ? undefined : "3 3"}
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#716157"
              >
                {val >= 1_000_000 || val <= -1_000_000
                  ? `${(val / 1_000_000).toFixed(1)}M`
                  : val >= 1000 || val <= -1000
                    ? `${Math.round(val / 1000)}k`
                    : `${val}`}
              </text>
            </g>
          );
        })}

        {daily.map((d, i) => {
          const cx = padL + i * step + step / 2;
          const x = cx - barW / 2;
          const netForfeit = Math.max(0, d.forfeitedDeposits - d.depositShare);

          const hDirect = (d.directCommission / range) * plotH;
          const hAuction = (d.auctionCommission / range) * plotH;
          const hForfeit = (netForfeit / range) * plotH;

          const yDirect = zeroY - hDirect;
          const yAuction = yDirect - hAuction;
          const yForfeit = yAuction - hForfeit;

          return (
            <g key={d.date}>
              <title>
                {`${d.date}: Doanh thu ròng ${formatVnd(d.netRevenue)}, Lợi nhuận ${formatSignedVnd(d.profit)}, ${d.settledOrders} đơn`}
              </title>
              {hDirect > 0 && (
                <rect
                  x={x}
                  y={yDirect}
                  width={barW}
                  height={hDirect}
                  rx="2"
                  fill="#5c0202"
                />
              )}
              {hAuction > 0 && (
                <rect
                  x={x}
                  y={yAuction}
                  width={barW}
                  height={hAuction}
                  rx="2"
                  fill="#f68b51"
                />
              )}
              {hForfeit > 0 && (
                <rect
                  x={x}
                  y={yForfeit}
                  width={barW}
                  height={hForfeit}
                  rx="2"
                  fill="#f4cb67"
                />
              )}
              {(i === daily.length - 1 ||
                (i % labelStep === 0 &&
                  daily.length - 1 - i >= Math.ceil(labelStep / 2))) && (
                <text
                  x={cx}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#716157"
                >
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}

        {daily.length > 1 && (
          <polyline
            fill="none"
            stroke="#255a43"
            strokeWidth="2.2"
            points={profitPoints}
          />
        )}
      </svg>
    </div>
  );
}

export function FinancePage() {
  const user = useOutletContext<CurrentUser>();
  const today = dateInputInHcm();
  const [fromDraft, setFromDraft] = useState(() => subtractDays(today, 29));
  const [toDraft, setToDraft] = useState(today);
  const [applied, setApplied] = useState({ from: subtractDays(today, 29), to: today });
  const [preset, setPreset] = useState<7 | 30 | 90 | null>(30);

  const query = useQuery(
    dashboardFinanceQuery(user, applied.from, applied.to, (path, schema) =>
      session.request(path, schema),
    ),
  );

  const denied =
    !canViewFinance(user) ||
    (query.error instanceof ApiError &&
      (query.error.status === 401 || query.error.status === 403));

  const applyPreset = (days: 7 | 30 | 90) => {
    const end = dateInputInHcm();
    const start = subtractDays(end, days - 1);
    setPreset(days);
    setFromDraft(start);
    setToDraft(end);
    setApplied({ from: start, to: end });
  };

  const canApply = fromDraft.length > 0 && toDraft.length > 0 && fromDraft <= toDraft;

  if (denied) {
    return (
      <div className={styles.page}>
        <section className={styles.denied} aria-labelledby="finance-denied">
          <h1 id="finance-denied">Không có quyền xem báo cáo tài chính</h1>
          <p className={styles.subtitle}>
            Báo cáo Tài chính & Lợi nhuận chỉ dành cho Quản trị viên (ADMIN).
          </p>
        </section>
      </div>
    );
  }

  const data = query.data;
  const cur = data?.current;
  const prev = data?.previous.totals;
  const isLoss = (cur?.profit ?? 0) < 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Tài chính & Lợi nhuận</h1>
        </div>

        <div className={styles.controls}>
          <div className={styles.presets} role="group" aria-label="Chọn nhanh khoảng thời gian">
            {([7, 30, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                className={`${styles.presetBtn} ${preset === days ? styles.presetBtnActive : ""}`}
                onClick={() => applyPreset(days)}
              >
                {days} ngày
              </button>
            ))}
          </div>

          <form
            className={styles.dateForm}
            onSubmit={(e) => {
              e.preventDefault();
              if (!canApply) return;
              setPreset(null);
              setApplied({ from: fromDraft, to: toDraft });
            }}
          >
            <label className={styles.dateField}>
              <span>Từ</span>
              <input
                type="date"
                aria-label="Từ ngày"
                value={fromDraft}
                max={toDraft}
                onChange={(e) => setFromDraft(e.target.value)}
              />
            </label>
            <label className={styles.dateField}>
              <span>Đến</span>
              <input
                type="date"
                aria-label="Đến ngày"
                value={toDraft}
                min={fromDraft}
                onChange={(e) => setToDraft(e.target.value)}
              />
            </label>
            <button type="submit" className={styles.primaryBtn} disabled={!canApply || query.isFetching}>
              Áp dụng
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              aria-label="Cập nhật báo cáo tài chính"
            >
              <RefreshCw size={15} />
            </button>
          </form>
        </div>
      </header>

      {query.isError && (
        <ErrorNotice
          error={query.error}
          retry={() => void query.refetch()}
          busy={query.isFetching}
        />
      )}
      {query.isError && data && (
        <p className={styles.stale}>Đang hiển thị số liệu lần cập nhật trước.</p>
      )}

      {query.isPending && !data ? (
        <div className={styles.statusBox} role="status">
          Đang tổng hợp sổ cái tài chính…
        </div>
      ) : data && cur && prev ? (
        <>
          {/* Row 1: 4 Executive KPI Cards */}
          <section className={styles.kpiGrid4} aria-label="Chỉ số tài chính trọng tâm">
            <article className={`${styles.kpiCard} ${isLoss ? styles.kpiCardLoss : styles.kpiCardHero}`}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiTitleRow}>
                  <span>{isLoss ? "Lợi nhuận ròng (Đang lỗ)" : "Lợi nhuận ròng"}</span>
                  <FormulaTip
                    label="Lợi nhuận ròng"
                    formula="Doanh thu ròng − Bồi thường Quỹ sự cố"
                    note="Phần lãi thực còn lại (hoặc lỗ nếu âm) sau khi trừ các khoản bồi thường sự cố phát sinh trong kỳ."
                  />
                </span>
                <Coins size={16} aria-hidden="true" />
              </div>
              <div className={`${styles.kpiValue} ${isLoss ? styles.kpiValueLoss : styles.kpiValuePositive}`}>
                {cur.profit < 0 ? `-${formatVnd(Math.abs(cur.profit))}` : formatVnd(cur.profit)}
              </div>
              <div className={styles.kpiFoot}>
                <span>Kỳ trước: {formatVnd(prev.profit)}</span>
                <DeltaPill current={cur.profit} previous={prev.profit} />
              </div>
            </article>

            <article className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiTitleRow}>
                  <span>Doanh thu ròng nền tảng</span>
                  <FormulaTip
                    label="Doanh thu ròng"
                    formula="Hoa hồng trực tiếp + Hoa hồng đấu giá + Cọc tịch thu − Chia 50% cọc người bán + Phí đăng lịch sử"
                    note="Không gồm phí ship thu hộ và giao dịch trao đổi sách (phí 0đ)."
                  />
                </span>
                <TrendingUp size={16} aria-hidden="true" />
              </div>
              <div className={styles.kpiValue}>{formatVnd(cur.netRevenue)}</div>
              <div className={styles.kpiFoot}>
                <span>Kỳ trước: {formatVnd(prev.netRevenue)}</span>
                <DeltaPill current={cur.netRevenue} previous={prev.netRevenue} />
              </div>
            </article>

            <article className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiTitleRow}>
                  <span>Tổng giá trị bán (GMV)</span>
                  <FormulaTip
                    label="GMV"
                    formula="Tổng giá sách (bookPrice) của các đơn bán trực tiếp & đấu giá đã tất toán"
                    note="Không gồm phí ship, đơn đang tạm giữ chưa hoàn tất và khối lượng trao đổi sách."
                    align="right"
                  />
                </span>
                <ShoppingBag size={16} aria-hidden="true" />
              </div>
              <div className={styles.kpiValue}>{formatVnd(cur.gmv)}</div>
              <div className={styles.kpiFoot}>
                <span>{cur.settledOrders} đơn đã tất toán</span>
                <DeltaPill current={cur.gmv} previous={prev.gmv} />
              </div>
            </article>

            <article className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiTitleRow}>
                  <span>Tỉ lệ hoa hồng (Take-rate)</span>
                  <FormulaTip
                    label="Take-rate"
                    formula="(Hoa hồng trực tiếp + Hoa hồng đấu giá) ÷ GMV × 100%"
                    note="Tỉ lệ hoa hồng thực thu trên mỗi đồng sách bán ra (mục tiêu chuẩn 5,00%)."
                    align="right"
                  />
                </span>
                <BadgePercent size={16} aria-hidden="true" />
              </div>
              <div className={styles.kpiValue}>{formatBps(cur.takeRateBps)}</div>
              <div className={styles.kpiFoot}>
                <span>Mục tiêu chuẩn: 5,00%</span>
                <span>Kỳ trước: {formatBps(prev.takeRateBps)}</span>
              </div>
            </article>
          </section>

          {/* Row 2: Daily Revenue & Profit Chart */}
          <section className={styles.panel} aria-labelledby="finance-chart-title">
            <div className={styles.panelHeader}>
              <div>
                <h2 id="finance-chart-title">Xu hướng doanh thu & lợi nhuận theo ngày</h2>
                <p className={styles.panelHint}>
                  Kỳ {data.from} – {data.to} (so sánh với kỳ trước {data.previous.from} – {data.previous.to})
                </p>
              </div>
              <div className={styles.legend}>
                <span className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: "#5c0202" }} />
                  Hoa hồng bán trực tiếp
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: "#f68b51" }} />
                  Hoa hồng đấu giá
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: "#f4cb67" }} />
                  Cọc tịch thu ròng
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: "#255a43" }} />
                  Đường lợi nhuận
                </span>
              </div>
            </div>
            <ProfitChart daily={data.daily} />
          </section>

          {/* Row 3: P&L Breakdown + Exchange Volume & Methodology */}
          <div className={styles.splitGrid}>
            <section className={styles.panel} aria-labelledby="pnl-table-title">
              <div className={styles.panelHeader}>
                <div>
                  <h2 id="pnl-table-title">Bảng cơ cấu Thu – Chi (P&L)</h2>
                  <p className={styles.panelHint}>
                    Tách bạch doanh thu thật, chi phí vận hành và khoản thu hộ vận chuyển.
                  </p>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Khoản mục</th>
                      <th>Kỳ này</th>
                      <th>Kỳ trước</th>
                      <th>Chênh lệch</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={styles.sectionRow}>
                      <td colSpan={4}>I. Doanh thu nền tảng</td>
                    </tr>
                    <tr>
                      <td>Hoa hồng bán trực tiếp (5%)</td>
                      <td>{formatVnd(cur.directCommission)}</td>
                      <td>{formatVnd(prev.directCommission)}</td>
                      <td>{formatSignedVnd(cur.directCommission - prev.directCommission)}</td>
                    </tr>
                    <tr>
                      <td>Hoa hồng đấu giá tại điểm (5%)</td>
                      <td>{formatVnd(cur.auctionCommission)}</td>
                      <td>{formatVnd(prev.auctionCommission)}</td>
                      <td>{formatSignedVnd(cur.auctionCommission - prev.auctionCommission)}</td>
                    </tr>
                    <tr>
                      <td>Cọc đấu giá bị tịch thu</td>
                      <td>{formatVnd(cur.forfeitedDeposits)}</td>
                      <td>{formatVnd(prev.forfeitedDeposits)}</td>
                      <td>{formatSignedVnd(cur.forfeitedDeposits - prev.forfeitedDeposits)}</td>
                    </tr>
                    <tr>
                      <td>Trừ: Chia 50% cọc cho người bán</td>
                      <td className={cur.depositShare > 0 ? styles.negativeAmt : undefined}>
                        {cur.depositShare > 0 ? `-${formatVnd(cur.depositShare)}` : formatVnd(0)}
                      </td>
                      <td>{prev.depositShare > 0 ? `-${formatVnd(prev.depositShare)}` : formatVnd(0)}</td>
                      <td>{formatSignedVnd(prev.depositShare - cur.depositShare)}</td>
                    </tr>
                    <tr>
                      <td>Phí đăng bán lịch sử</td>
                      <td>{formatVnd(cur.legacyListingFees)}</td>
                      <td>{formatVnd(prev.legacyListingFees)}</td>
                      <td>{formatSignedVnd(cur.legacyListingFees - prev.legacyListingFees)}</td>
                    </tr>
                    <tr className={styles.totalRow}>
                      <td>Tổng doanh thu ròng</td>
                      <td>{formatVnd(cur.netRevenue)}</td>
                      <td>{formatVnd(prev.netRevenue)}</td>
                      <td>{formatSignedVnd(cur.netRevenue - prev.netRevenue)}</td>
                    </tr>

                    <tr className={styles.sectionRow}>
                      <td colSpan={4}>II. Chi phí vận hành ghi nhận</td>
                    </tr>
                    <tr>
                      <td>Bồi thường từ Quỹ sự cố</td>
                      <td className={cur.incidentCompensation > 0 ? styles.negativeAmt : undefined}>
                        {cur.incidentCompensation > 0
                          ? `-${formatVnd(cur.incidentCompensation)}`
                          : formatVnd(0)}
                      </td>
                      <td>
                        {prev.incidentCompensation > 0
                          ? `-${formatVnd(prev.incidentCompensation)}`
                          : formatVnd(0)}
                      </td>
                      <td>{formatSignedVnd(prev.incidentCompensation - cur.incidentCompensation)}</td>
                    </tr>

                    <tr className={styles.totalRow}>
                      <td>III. Lợi nhuận ròng</td>
                      <td className={cur.profit < 0 ? styles.negativeAmt : styles.positiveAmt}>
                        {cur.profit < 0 ? `-${formatVnd(Math.abs(cur.profit))}` : formatVnd(cur.profit)}
                      </td>
                      <td>
                        {prev.profit < 0 ? `-${formatVnd(Math.abs(prev.profit))}` : formatVnd(prev.profit)}
                      </td>
                      <td>{formatSignedVnd(cur.profit - prev.profit)}</td>
                    </tr>

                    <tr className={styles.sectionRow}>
                      <td colSpan={4}>IV. Khoản thu hộ (Ngoài doanh thu)</td>
                    </tr>
                    <tr>
                      <td>
                        Phí ship chặng giao từ điểm
                        <span className={styles.passThroughBadge}>Thu hộ</span>
                      </td>
                      <td>{formatVnd(cur.passThroughShipping)}</td>
                      <td>{formatVnd(prev.passThroughShipping)}</td>
                      <td>{formatSignedVnd(cur.passThroughShipping - prev.passThroughShipping)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <div style={{ display: "grid", gap: "16px" }}>
              <section className={styles.panel} aria-labelledby="exchange-vol-title">
                <div className={styles.panelHeader}>
                  <div>
                    <h2 id="exchange-vol-title">Khối lượng Trao đổi sách</h2>
                    <p className={styles.panelHint}>
                      Phí đổi 0đ — báo cáo riêng, không cộng vào GMV bán hay doanh thu.
                    </p>
                  </div>
                  <Repeat size={18} aria-hidden="true" />
                </div>
                <ul className={styles.statList}>
                  <li className={styles.statRow}>
                    <span>Phiên trao đổi hoàn tất</span>
                    <strong>{data.exchange.completed}</strong>
                  </li>
                  <li className={styles.statRow}>
                    <span>Giá trị sách phía đề xuất (V_A)</span>
                    <strong>{formatVnd(data.exchange.initiatorValue)}</strong>
                  </li>
                  <li className={styles.statRow}>
                    <span>Giá trị sách phía nhận (V_B)</span>
                    <strong>{formatVnd(data.exchange.recipientValue)}</strong>
                  </li>
                  <li className={styles.statRow}>
                    <span>Tổng giá trị sách luân chuyển</span>
                    <strong>
                      {formatVnd(data.exchange.initiatorValue + data.exchange.recipientValue)}
                    </strong>
                  </li>
                </ul>
              </section>

              <details className={styles.details}>
                <summary>Định nghĩa & Nguyên tắc hạch toán</summary>
                <ul className={styles.notesList}>
                  {data.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

