import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router-dom";
import { ApiError, type CurrentUser } from "@used-books/session-client";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Info,
  RefreshCw,
  Scale,
  Wallet,
} from "lucide-react";
import { canViewFinance, session } from "../../core/session";
import { ErrorNotice } from "../../core/ui";
import { dashboardCashflowQuery } from "./queries";
import {
  dateInputInHcm,
  formatRevenueDate,
  formatVnd,
  subtractDays,
} from "./revenue";
import { formatSignedVnd, type FinanceCashflow } from "./finance";
import { StatisticsSubNav } from "./StatisticsSubNav";
import styles from "./StatisticsHub.module.css";

function CashflowChart({ daily }: { daily: FinanceCashflow["daily"] }) {
  const width = 760;
  const height = 220;
  const padL = 62;
  const padR = 16;
  const padT = 18;
  const padB = 32;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal = Math.max(
    1,
    ...daily.map((d) => Math.max(d.topupAmount, d.withdrawalAmount)),
  );
  const yOf = (val: number) => padT + ((maxVal - val) / maxVal) * plotH;
  const step = plotW / Math.max(1, daily.length);
  const barW = Math.max(3, Math.min(12, step * 0.34));
  const labelStep = Math.max(1, Math.ceil(daily.length / 8));

  return (
    <div className={styles.chartWrap}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.chartSvg}
        role="img"
        aria-label={`Biểu đồ nạp và rút tiền theo ngày (${daily.length} ngày)`}
      >
        {[0, 0.5, 1].map((ratio) => {
          const val = Math.round(maxVal * ratio);
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
                {val >= 1_000_000
                  ? `${(val / 1_000_000).toFixed(1)}M`
                  : val >= 1000
                    ? `${Math.round(val / 1000)}k`
                    : `${val}`}
              </text>
            </g>
          );
        })}

        {daily.map((d, i) => {
          const cx = padL + i * step + step / 2;
          const hIn = (d.topupAmount / maxVal) * plotH;
          const hOut = (d.withdrawalAmount / maxVal) * plotH;
          return (
            <g key={d.date}>
              <title>
                {`${d.date}: Nạp ${formatVnd(d.topupAmount)} (${d.topupCount}), Rút ${formatVnd(d.withdrawalAmount)} (${d.withdrawalCount}), Ròng ${formatSignedVnd(d.netCashflow)}`}
              </title>
              {hIn > 0 && (
                <rect
                  x={cx - barW - 1}
                  y={padT + plotH - hIn}
                  width={barW}
                  height={hIn}
                  rx="2"
                  fill="#255a43"
                />
              )}
              {hOut > 0 && (
                <rect
                  x={cx + 1}
                  y={padT + plotH - hOut}
                  width={barW}
                  height={hOut}
                  rx="2"
                  fill="#f68b51"
                />
              )}
              {(i % labelStep === 0 || i === daily.length - 1) && (
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
      </svg>
    </div>
  );
}

export function CashflowPage() {
  const user = useOutletContext<CurrentUser>();
  const today = dateInputInHcm();
  const [fromDraft, setFromDraft] = useState(() => subtractDays(today, 29));
  const [toDraft, setToDraft] = useState(today);
  const [applied, setApplied] = useState({ from: subtractDays(today, 29), to: today });
  const [preset, setPreset] = useState<7 | 30 | 90 | null>(30);

  const query = useQuery(
    dashboardCashflowQuery(user, applied.from, applied.to, (path, schema) =>
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
        <StatisticsSubNav user={user} />
        <section className={styles.denied} aria-labelledby="cashflow-denied">
          <h1 id="cashflow-denied">Không có quyền xem dòng tiền & đối soát</h1>
          <p className={styles.subtitle}>
            Báo cáo Dòng tiền & Đối soát chỉ dành cho Quản trị viên (ADMIN).
          </p>
        </section>
      </div>
    );
  }

  const data = query.data;
  const cons = data?.conservation;
  const totalHeld = cons
    ? cons.transactionHeld +
      cons.auctionHeld +
      cons.withdrawalHeld +
      cons.listingFeeHeld
    : 0;

  const segments = cons
    ? [
        { label: "Ví khả dụng thành viên", value: cons.memberAvailable, color: "#255a43" },
        { label: "Tiền đang giữ (Escrow / Hold)", value: totalHeld, color: "#f68b51" },
        { label: "Tài khoản nền tảng", value: cons.platformCommission, color: "#5c0202" },
        { label: "Nguồn vốn còn lại", value: cons.sourceRemaining, color: "#d9cbbd" },
      ]
    : [];
  const segSum = Math.max(1, segments.reduce((s, x) => s + x.value, 0));

  return (
    <div className={styles.page}>
      <StatisticsSubNav user={user} />

      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Dòng tiền & Đối soát</h1>
          <p className={styles.subtitle}>
            Kiểm tra bảo toàn vốn sổ cái, tiền đang giữ (float), nhịp nạp/rút và hàng chờ duyệt rút.
          </p>
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
              Từ ngày
              <input
                type="date"
                value={fromDraft}
                max={toDraft}
                onChange={(e) => setFromDraft(e.target.value)}
              />
            </label>
            <label className={styles.dateField}>
              Đến ngày
              <input
                type="date"
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
              aria-label="Cập nhật dòng tiền"
            >
              <RefreshCw size={15} />
            </button>
          </form>
        </div>
      </header>

      <div className={styles.simBanner} role="note">
        <Info size={15} aria-hidden="true" />
        Dòng tiền nạp/rút và số dư đang giữ không phải doanh thu (AC-47).
      </div>

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
          Đang đối soát sổ cái & dòng tiền…
        </div>
      ) : data && cons ? (
        <>
          {/* Section 1: Ledger Capital Conservation */}
          <section className={styles.panel} aria-labelledby="conservation-title">
            <div className={styles.panelHeader}>
              <div>
                <h2 id="conservation-title">Đối soát bảo toàn vốn sổ cái</h2>
                <p className={styles.panelHint}>
                  Tổng các tài khoản sổ cái phải bằng chính xác nguồn vốn mô phỏng ({formatVnd(cons.capitalTarget)}).
                </p>
              </div>
              <span
                className={`${styles.statusPill} ${cons.balanced ? styles.statusOk : styles.statusAlert}`}
              >
                {cons.balanced ? (
                  <>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    Sổ cái cân đối (Chênh lệch 0đ)
                  </>
                ) : (
                  <>
                    <AlertTriangle size={15} aria-hidden="true" />
                    Chênh lệch {formatSignedVnd(cons.discrepancy)}
                  </>
                )}
              </span>
            </div>

            <div className={styles.segmentBar} role="img" aria-label="Tỷ trọng phân bổ vốn sổ cái">
              {segments.map((seg) => (
                <div
                  key={seg.label}
                  style={{
                    width: `${(seg.value / segSum) * 100}%`,
                    background: seg.color,
                  }}
                  title={`${seg.label}: ${formatVnd(seg.value)}`}
                />
              ))}
            </div>

            <div className={styles.legend}>
              {segments.map((seg) => (
                <span key={seg.label} className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: seg.color }} />
                  {seg.label}
                </span>
              ))}
            </div>

            <div className={styles.accountGrid}>
              <div className={styles.accountCell}>
                <span>Ví khả dụng thành viên</span>
                <strong>{formatVnd(cons.memberAvailable)}</strong>
              </div>
              <div className={styles.accountCell}>
                <span>Đang giữ đơn & trao đổi</span>
                <strong>{formatVnd(cons.transactionHeld)}</strong>
              </div>
              <div className={styles.accountCell}>
                <span>Đang giữ cọc đấu giá</span>
                <strong>{formatVnd(cons.auctionHeld)}</strong>
              </div>
              <div className={styles.accountCell}>
                <span>Đang giữ chờ rút</span>
                <strong>{formatVnd(cons.withdrawalHeld)}</strong>
              </div>
              <div className={styles.accountCell}>
                <span>Tài khoản nền tảng</span>
                <strong>{formatVnd(cons.platformCommission)}</strong>
              </div>
              <div className={styles.accountCell}>
                <span>Phí đăng đang giữ</span>
                <strong>{formatVnd(cons.listingFeeHeld)}</strong>
              </div>
              <div className={styles.accountCell}>
                <span>Nguồn vốn còn lại</span>
                <strong>{formatVnd(cons.sourceRemaining)}</strong>
              </div>
              <div className={styles.accountCell}>
                <span>Quỹ sự cố độc lập (POL-42)</span>
                <strong>{formatVnd(cons.incidentFundBalance)}</strong>
              </div>
            </div>
          </section>

          {/* Section 2: Period Cashflow KPIs */}
          <section className={styles.kpiGrid3} aria-label="Dòng tiền trong kỳ">
            <article className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span>Tổng nạp ví trong kỳ</span>
                <ArrowDownLeft size={16} color="#255a43" aria-hidden="true" />
              </div>
              <div className={`${styles.kpiValue} ${styles.kpiValuePositive}`}>
                {formatVnd(data.period.topupTotal)}
              </div>
              <div className={styles.kpiFoot}>
                <span>{data.period.topupCount} giao dịch nạp thành công</span>
              </div>
            </article>

            <article className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span>Tổng rút hoàn tất trong kỳ</span>
                <ArrowUpRight size={16} color="#912b0e" aria-hidden="true" />
              </div>
              <div className={styles.kpiValue}>{formatVnd(data.period.withdrawalTotal)}</div>
              <div className={styles.kpiFoot}>
                <span>{data.period.withdrawalCount} yêu cầu đã chi trả</span>
              </div>
            </article>

            <article className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span>Dòng tiền ròng (Nạp − Rút)</span>
                <Scale size={16} aria-hidden="true" />
              </div>
              <div
                className={`${styles.kpiValue} ${
                  data.period.netCashflow < 0 ? styles.kpiValueLoss : styles.kpiValuePositive
                }`}
              >
                {formatSignedVnd(data.period.netCashflow)}
              </div>
              <div className={styles.kpiFoot}>
                <span>Kỳ {data.from} – {data.to}</span>
              </div>
            </article>
          </section>

          {/* Section 3: Chart + Withdrawal Queue */}
          <div className={styles.splitGrid}>
            <section className={styles.panel} aria-labelledby="cashflow-chart-title">
              <div className={styles.panelHeader}>
                <div>
                  <h2 id="cashflow-chart-title">Nhịp nạp & rút tiền theo ngày</h2>
                  <p className={styles.panelHint}>So sánh lượng tiền vào ví và tiền rút ra mỗi ngày.</p>
                </div>
                <div className={styles.legend}>
                  <span className={styles.legendItem}>
                    <span className={styles.swatch} style={{ background: "#255a43" }} />
                    Nạp ví
                  </span>
                  <span className={styles.legendItem}>
                    <span className={styles.swatch} style={{ background: "#f68b51" }} />
                    Rút hoàn tất
                  </span>
                </div>
              </div>
              <CashflowChart daily={data.daily} />
            </section>

            <section className={styles.panel} aria-labelledby="withdrawal-queue-title">
              <div className={styles.panelHeader}>
                <div>
                  <h2 id="withdrawal-queue-title">Hàng chờ duyệt rút tiền</h2>
                  <p className={styles.panelHint}>Các yêu cầu ở trạng thái chờ Admin xác nhận.</p>
                </div>
                <Wallet size={18} color="#5c0202" aria-hidden="true" />
              </div>
              <ul className={styles.statList}>
                <li className={styles.statRow}>
                  <span>Số yêu cầu đang chờ</span>
                  <strong>{data.withdrawalQueue.pendingCount}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Tổng tiền chờ duyệt</span>
                  <strong>{formatVnd(data.withdrawalQueue.pendingAmount)}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>
                    <Clock size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} aria-hidden="true" />
                    Yêu cầu cũ nhất
                  </span>
                  <strong>
                    {data.withdrawalQueue.oldestRequestedAt
                      ? formatRevenueDate(data.withdrawalQueue.oldestRequestedAt)
                      : "Không có"}
                  </strong>
                </li>
              </ul>
              <div>
                <Link to="/withdrawals" className={styles.actionLink}>
                  Mở hàng đợi rút tiền →
                </Link>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

