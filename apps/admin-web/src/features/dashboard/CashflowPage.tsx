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
  Coins,
  Gavel,
  Landmark,
  Layers,
  Lock,
  RefreshCw,
  Scale,
  ShieldAlert,
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
import { HoldsExplorer } from "./HoldsExplorer";
import { TransfersExplorer } from "./TransfersExplorer";
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

  const circulatingSum = cons
    ? cons.memberAvailable + totalHeld + cons.platformCommission
    : 0;

  const circulatingSegments =
    cons && circulatingSum > 0
      ? [
          {
            label: "Ví khả dụng thành viên",
            value: cons.memberAvailable,
            color: "#255a43",
            pct: ((cons.memberAvailable / circulatingSum) * 100).toFixed(1).replace(".", ","),
          },
          {
            label: "Tiền đang giữ (Escrow / Hold)",
            value: totalHeld,
            color: "#f68b51",
            pct: ((totalHeld / circulatingSum) * 100).toFixed(1).replace(".", ","),
          },
          {
            label: "Doanh thu sàn (hoa hồng)",
            value: cons.platformNetRevenueBalance,
            color: "#5c0202",
            pct: ((cons.platformNetRevenueBalance / circulatingSum) * 100)
              .toFixed(1)
              .replace(".", ","),
          },
          ...(cons.platformShippingPassThrough > 0
            ? [
                {
                  label: "Thu hộ phí vận chuyển",
                  value: cons.platformShippingPassThrough,
                  color: "#164b56",
                  pct: ((cons.platformShippingPassThrough / circulatingSum) * 100)
                    .toFixed(1)
                    .replace(".", ","),
                },
              ]
            : []),
        ]
      : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Dòng tiền & Đối soát</h1>
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
              aria-label="Cập nhật dòng tiền"
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
                  Tổng các tài khoản sổ cái phải cân bằng chính xác với tổng nguồn vốn hệ thống ({formatVnd(cons.capitalTarget)}).
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

            {/* Conservation Equation Card */}
            <div className={styles.equationCard} role="region" aria-label="Phương trình cân đối vốn">
              <div className={styles.equationPart}>
                <span className={styles.equationSub}>Tổng nguồn vốn hệ thống</span>
                <strong className={styles.equationValPrimary}>{formatVnd(cons.capitalTarget)}</strong>
                <span className={styles.equationTag}>Mục tiêu bảo toàn</span>
              </div>
              <div className={styles.equationOperator} aria-hidden="true">=</div>
              <div className={styles.equationPart}>
                <span className={styles.equationSub}>Vốn đang lưu thông</span>
                <strong className={styles.equationValGreen}>{formatVnd(circulatingSum)}</strong>
                <span className={styles.equationTag}>Ví thành viên, Tiền giữ & Nền tảng</span>
              </div>
              <div className={styles.equationOperator} aria-hidden="true">+</div>
              <div className={styles.equationPart}>
                <span className={styles.equationSub}>Nguồn vốn còn lại</span>
                <strong className={styles.equationValMuted}>{formatVnd(cons.sourceRemaining)}</strong>
                <span className={styles.equationTag}>Kho đệm chưa cấp</span>
              </div>
            </div>

            {/* Circulating Capital Breakdown */}
            {circulatingSum > 0 && (
              <div className={styles.circulatingSection}>
                <div className={styles.circulatingHeader}>
                  <span>Cơ cấu phân bổ vốn đang lưu thông trên hệ thống</span>
                  <span className={styles.circulatingTotal}>{formatVnd(circulatingSum)}</span>
                </div>

                <div
                  className={styles.segmentBar}
                  role="img"
                  aria-label="Tỷ trọng vốn đang lưu thông"
                >
                  {circulatingSegments.map((seg) => (
                    <div
                      key={seg.label}
                      style={{
                        width: `${(seg.value / circulatingSum) * 100}%`,
                        background: seg.color,
                      }}
                      title={`${seg.label}: ${formatVnd(seg.value)} (${seg.pct}%)`}
                    />
                  ))}
                </div>

                <div className={styles.circulatingLegend}>
                  {circulatingSegments.map((seg) => (
                    <div key={seg.label} className={styles.circulatingLegendItem}>
                      <div className={styles.circulatingLegendTop}>
                        <span className={styles.circulatingLabelWrap}>
                          <span className={styles.swatch} style={{ background: seg.color }} />
                          <span className={styles.circulatingLabel}>{seg.label}</span>
                        </span>
                        <span className={styles.circulatingPct}>{seg.pct}%</span>
                      </div>
                      <strong className={styles.circulatingAmount}>{formatVnd(seg.value)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 8 Ledger Accounts Grid (4 cols x 2 rows) */}
            <div className={styles.accountGrid}>
              <div className={styles.accountCard}>
                <div className={styles.accountCardTop}>
                  <span className={`${styles.accountBadge} ${styles.badgeGreen}`}>Ví thành viên</span>
                  <Wallet size={15} className={styles.accountIconGreen} aria-hidden="true" />
                </div>
                <div className={styles.accountLabel}>Ví khả dụng thành viên</div>
                <strong className={styles.accountValue}>{formatVnd(cons.memberAvailable)}</strong>
                <span className={styles.accountHint}>Số dư sẵn sàng rút hoặc mua hàng</span>
              </div>

              <div className={styles.accountCard}>
                <div className={styles.accountCardTop}>
                  <span className={`${styles.accountBadge} ${styles.badgeAmber}`}>Tạm giữ giao dịch</span>
                  <Lock size={15} className={styles.accountIconAmber} aria-hidden="true" />
                </div>
                <div className={styles.accountLabel}>Đang giữ đơn & trao đổi</div>
                <strong className={styles.accountValue}>{formatVnd(cons.transactionHeld)}</strong>
                <span className={styles.accountHint}>Ký quỹ mua hàng và cọc trao đổi</span>
              </div>

              <div className={styles.accountCard}>
                <div className={styles.accountCardTop}>
                  <span className={`${styles.accountBadge} ${styles.badgeAmber}`}>Cọc đấu giá</span>
                  <Gavel size={15} className={styles.accountIconAmber} aria-hidden="true" />
                </div>
                <div className={styles.accountLabel}>Đang giữ cọc đấu giá</div>
                <strong className={styles.accountValue}>{formatVnd(cons.auctionHeld)}</strong>
                <span className={styles.accountHint}>Cọc phiên đang diễn ra chờ kết quả</span>
              </div>

              <div className={styles.accountCard}>
                <div className={styles.accountCardTop}>
                  <span className={`${styles.accountBadge} ${styles.badgeAmber}`}>Chờ rút tiền</span>
                  <ArrowUpRight size={15} className={styles.accountIconAmber} aria-hidden="true" />
                </div>
                <div className={styles.accountLabel}>Đang giữ chờ rút</div>
                <strong className={styles.accountValue}>{formatVnd(cons.withdrawalHeld)}</strong>
                <span className={styles.accountHint}>Lệnh rút đã trừ ví, chờ chuyển khoản</span>
              </div>

              <div className={styles.accountCard}>
                <div className={styles.accountCardTop}>
                  <span className={`${styles.accountBadge} ${styles.badgeWine}`}>Tài khoản sàn</span>
                  <Coins size={15} className={styles.accountIconWine} aria-hidden="true" />
                </div>
                <div className={styles.accountLabel}>Tài khoản nền tảng</div>
                <strong className={styles.accountValue}>{formatVnd(cons.platformCommission)}</strong>
                <span className={styles.accountHint}>
                  {cons.platformShippingPassThrough > 0
                    ? `Doanh thu sàn ${formatVnd(cons.platformNetRevenueBalance)} · Thu hộ ship ${formatVnd(cons.platformShippingPassThrough)}`
                    : "Hoa hồng & doanh thu dịch vụ đã tất toán"}
                </span>
              </div>

              <div className={styles.accountCard}>
                <div className={styles.accountCardTop}>
                  <span className={`${styles.accountBadge} ${styles.badgeWine}`}>Quỹ dự phòng</span>
                  <ShieldAlert size={15} className={styles.accountIconWine} aria-hidden="true" />
                </div>
                <div className={styles.accountLabel}>Quỹ sự cố độc lập</div>
                <strong className={styles.accountValue}>{formatVnd(cons.incidentFundBalance)}</strong>
                <span className={styles.accountHint}>Sổ quỹ riêng tách khỏi nguồn vốn 1.000 tỷ</span>
              </div>

              <div className={styles.accountCard}>
                <div className={styles.accountCardTop}>
                  <span className={`${styles.accountBadge} ${styles.badgeNeutral}`}>Phí niêm yết</span>
                  <Layers size={15} className={styles.accountIconNeutral} aria-hidden="true" />
                </div>
                <div className={styles.accountLabel}>Phí đăng đang giữ</div>
                <strong className={styles.accountValue}>{formatVnd(cons.listingFeeHeld)}</strong>
                <span className={styles.accountHint}>Phí đăng sách giữ theo kỳ/phiên</span>
              </div>

              <div className={styles.accountCard}>
                <div className={styles.accountCardTop}>
                  <span className={`${styles.accountBadge} ${styles.badgeNeutral}`}>Kho vốn gốc</span>
                  <Landmark size={15} className={styles.accountIconNeutral} aria-hidden="true" />
                </div>
                <div className={styles.accountLabel}>Nguồn vốn còn lại</div>
                <strong className={styles.accountValue}>{formatVnd(cons.sourceRemaining)}</strong>
                <span className={styles.accountHint}>Nguồn vốn dự trữ chưa cấp ra thị trường</span>
              </div>
            </div>
          </section>

          {/* Section 2: Period Cashflow KPIs */}
          <section className={styles.kpiGrid3} aria-label="Dòng tiền trong kỳ">
            <article className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span>Tổng nạp ví trong kỳ</span>
                <ArrowDownLeft size={16} aria-hidden="true" />
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
                <ArrowUpRight size={16} aria-hidden="true" />
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
                <Wallet size={18} aria-hidden="true" />
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

          {/* Section 4: Comprehensive Active Holds & Deposits Explorer */}
          <HoldsExplorer user={user} />

          {/* Section 5: External Cashflow In/Out (Topup & Withdrawal Payouts) */}
          <TransfersExplorer user={user} />
        </>
      ) : null}
    </div>
  );
}

