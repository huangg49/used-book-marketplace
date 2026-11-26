import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router-dom";
import { ApiError, type CurrentUser } from "@used-books/session-client";
import { z } from "zod";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Clock,
  Coins,
  Cpu,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { canReview, session } from "../../core/session";
import { ErrorNotice } from "../../core/ui";
import { dateInputInHcm, subtractDays } from "./revenue";
import { formatBps } from "./finance";
import hubStyles from "./StatisticsHub.module.css";
import styles from "./AiAnalyticsPage.module.css";

const aiUsageSchema = z.object({
  from: z.string(),
  to: z.string(),
  timezone: z.literal("Asia/Ho_Chi_Minh"),
  serverTime: z.string(),
  budget: z.object({
    todayDate: z.string(),
    dailyBudgetMicroUsd: z.number().int().nonnegative(),
    todaySpentMicroUsd: z.number().int().nonnegative(),
    todayCalls: z.number().int().nonnegative(),
  }),
  totals: z.object({
    calls: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    costMicroUsd: z.number().int().nonnegative(),
    successRateBps: z.number().int().nullable(),
    avgLatencyMs: z.number().int().nullable(),
  }),
  features: z.array(
    z.object({
      key: z.enum(["autofill", "priceAssist", "priceLookup", "autoReview"]),
      label: z.string(),
      enabled: z.boolean(),
      provider: z.string(),
      calls: z.number().int().nonnegative(),
      succeeded: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      costMicroUsd: z.number().int().nonnegative(),
      avgLatencyMs: z.number().int().nullable(),
    }),
  ),
  quality: z.object({
    autoReview: z.object({
      policyVersion: z.string(),
      policyApproved: z.boolean(),
      approved: z.number().int().nonnegative(),
      escalated: z.number().int().nonnegative(),
      checksOpen: z.number().int().nonnegative(),
      staffReviewedChecks: z.number().int().nonnegative(),
      staffConfirmedProblems: z.number().int().nonnegative(),
      overturnRateBps: z.number().int().nullable(),
    }),
    priceAssist: z.object({
      suggested: z.number().int().nonnegative(),
      applied: z.number().int().nonnegative(),
      withinRange: z.number().int().nonnegative(),
      adoptionRateBps: z.number().int().nullable(),
    }),
    autofill: z.object({
      suggested: z.number().int().nonnegative(),
      needsMoreData: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    }),
    failures: z.object({
      timeout: z.number().int().nonnegative(),
      invalidOutput: z.number().int().nonnegative(),
      providerError: z.number().int().nonnegative(),
      refusal: z.number().int().nonnegative(),
    }),
  }),
  daily: z.array(
    z.object({
      date: z.string(),
      calls: z.number().int().nonnegative(),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      costMicroUsd: z.number().int().nonnegative(),
    }),
  ),
  models: z.array(
    z.object({
      model: z.string(),
      calls: z.number().int().nonnegative(),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      costMicroUsd: z.number().int().nonnegative(),
    }),
  ),
});

type AiUsageSummary = z.infer<typeof aiUsageSchema>;

function formatUsd(microUsd: number): string {
  const usd = microUsd / 1_000_000;
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("vi-VN").format(n);
}

function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

function TokenTrendChart({ daily }: { daily: AiUsageSummary["daily"] }) {
  const width = 760;
  const height = 220;
  const padL = 56;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxTokens = Math.max(
    1,
    ...daily.map((d) => d.inputTokens + d.outputTokens),
  );
  const step = plotW / Math.max(1, daily.length);
  const barW = Math.max(4, Math.min(22, step * 0.62));
  const labelStep = Math.max(1, Math.ceil(daily.length / 8));
  const gridLevels = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className={styles.chartWrap}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.chartSvg}
        role="img"
        aria-label="Biểu đồ token AI theo ngày"
      >
        {gridLevels.map((ratio) => {
          const y = padT + plotH * (1 - ratio);
          const val = Math.round(maxTokens * ratio);
          return (
            <g key={ratio}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="rgba(110, 22, 22, 0.08)"
                strokeDasharray={ratio === 0 ? undefined : "3 3"}
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#7a6f66"
              >
                {formatTokens(val)}
              </text>
            </g>
          );
        })}

        {daily.map((d, idx) => {
          const total = d.inputTokens + d.outputTokens;
          const totalH = (total / maxTokens) * plotH;
          const outH = (d.outputTokens / maxTokens) * plotH;
          const inH = Math.max(0, totalH - outH);
          const x = padL + idx * step + (step - barW) / 2;
          const yIn = padT + plotH - inH;
          const yOut = yIn - outH;
          const showLabel = idx % labelStep === 0 || idx === daily.length - 1;
          return (
            <g key={d.date}>
              <title>
                {`${d.date}: ${d.calls} lượt · Input ${formatTokens(d.inputTokens)} · Output ${formatTokens(d.outputTokens)} · ${formatUsd(d.costMicroUsd)}`}
              </title>
              {inH > 0 && (
                <rect
                  x={x}
                  y={yIn}
                  width={barW}
                  height={inH}
                  rx={2}
                  fill="#6e1616"
                />
              )}
              {outH > 0 && (
                <rect
                  x={x}
                  y={yOut}
                  width={barW}
                  height={outH}
                  rx={2}
                  fill="#d4a359"
                />
              )}
              {showLabel && (
                <text
                  x={x + barW / 2}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#7a6f66"
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

export function AiAnalyticsPage() {
  const user = useOutletContext<CurrentUser>();
  const today = dateInputInHcm();
  const [fromDraft, setFromDraft] = useState(() => subtractDays(today, 29));
  const [toDraft, setToDraft] = useState(today);
  const [applied, setApplied] = useState({
    from: subtractDays(today, 29),
    to: today,
  });
  const [preset, setPreset] = useState<7 | 30 | 90 | null>(30);

  const query = useQuery({
    queryKey: ["operations-ai-usage", user.id, applied.from, applied.to],
    enabled: canReview(user),
    queryFn: () =>
      session.request(
        `/operations/ai-usage?from=${encodeURIComponent(applied.from)}&to=${encodeURIComponent(applied.to)}`,
        aiUsageSchema,
      ),
    staleTime: 15_000,
  });

  const denied =
    !canReview(user) ||
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

  const canApply =
    fromDraft.length > 0 && toDraft.length > 0 && fromDraft <= toDraft;

  if (denied) {
    return (
      <div className={hubStyles.page}>
        <section className={hubStyles.denied} aria-labelledby="ai-stats-denied">
          <h1 id="ai-stats-denied">Không có quyền xem thống kê AI & Token</h1>
        </section>
      </div>
    );
  }

  const data = query.data;
  const budgetPct =
    data && data.budget.dailyBudgetMicroUsd > 0
      ? Math.min(
          100,
          (data.budget.todaySpentMicroUsd / data.budget.dailyBudgetMicroUsd) *
            100,
        )
      : 0;
  const budgetFillClass =
    budgetPct >= 90
      ? styles.budgetBarFillDanger
      : budgetPct >= 70
        ? styles.budgetBarFillWarn
        : "";

  return (
    <div className={hubStyles.page}>
      <header className={hubStyles.header}>
        <div className={hubStyles.headerTitle}>
          <h1>AI & Token</h1>
        </div>

        <div className={hubStyles.controls}>
          <div
            className={hubStyles.presets}
            role="group"
            aria-label="Chọn nhanh khoảng thời gian"
          >
            {([7, 30, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                className={`${hubStyles.presetBtn} ${preset === days ? hubStyles.presetBtnActive : ""}`}
                onClick={() => applyPreset(days)}
              >
                {days} ngày
              </button>
            ))}
          </div>

          <form
            className={hubStyles.dateForm}
            onSubmit={(e) => {
              e.preventDefault();
              if (!canApply) return;
              setPreset(null);
              setApplied({ from: fromDraft, to: toDraft });
            }}
          >
            <input
              type="date"
              aria-label="Từ ngày"
              value={fromDraft}
              onChange={(e) => setFromDraft(e.target.value)}
            />
            <span aria-hidden="true">→</span>
            <input
              type="date"
              aria-label="Đến ngày"
              value={toDraft}
              onChange={(e) => setToDraft(e.target.value)}
            />
            <button
              type="submit"
              className={hubStyles.applyBtn}
              disabled={!canApply}
            >
              Áp dụng
            </button>
          </form>

          <button
            type="button"
            className={hubStyles.refreshBtn}
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Tải lại thống kê AI"
          >
            <RefreshCw size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      {query.error && (
        <ErrorNotice
          error={query.error}
          retry={() => void query.refetch()}
          busy={query.isFetching}
        />
      )}

      {query.isPending && !data && (
        <p role="status" className={styles.emptyNote}>
          Đang tổng hợp dữ liệu token, chi phí và chất lượng AI…
        </p>
      )}

      {data && (
        <div className={styles.aiGrid}>
          {/* 1. Daily Shared Budget Hero */}
          <section className={styles.budgetCard} aria-label="Ngân sách AI hôm nay">
            <div className={styles.budgetTop}>
              <div className={styles.budgetTitleWrap}>
                <div className={styles.budgetIcon}>
                  <Sparkles size={20} aria-hidden="true" />
                </div>
                <div>
                  <h2 className={styles.budgetHeading}>
                    Trần ngân sách AI dùng chung hôm nay ({data.budget.todayDate} UTC)
                  </h2>
                  <p className={styles.budgetSub}>
                    Áp dụng chung cho Đọc ảnh, Gợi ý giá, Tra cứu giá mới và Tự động duyệt bài.
                  </p>
                </div>
              </div>

              <div className={styles.budgetNumbers}>
                <span className={styles.budgetSpent}>
                  {formatUsd(data.budget.todaySpentMicroUsd)}
                </span>
                <span className={styles.budgetLimit}>
                  / {formatUsd(data.budget.dailyBudgetMicroUsd)}
                </span>
              </div>
            </div>

            <div className={styles.budgetBarTrack} aria-hidden="true">
              <div
                className={`${styles.budgetBarFill} ${budgetFillClass}`}
                style={{ width: `${Math.max(budgetPct, data.budget.todaySpentMicroUsd > 0 ? 2 : 0)}%` }}
              />
            </div>

            <div className={styles.budgetMeta}>
              <span>Đã sử dụng {budgetPct.toFixed(1)}% trần ngày</span>
              <span>Hôm nay: {data.budget.todayCalls} lượt gọi provider</span>
            </div>
          </section>

          {/* 2. 4 KPI Summary Cards */}
          <section className={styles.kpiGrid} aria-label="Chỉ số AI trong kỳ">
            <article className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Tổng Token tiêu thụ</span>
                <span className={styles.kpiIcon}>
                  <Cpu size={16} aria-hidden="true" />
                </span>
              </div>
              <div className={styles.kpiValue}>
                {formatTokens(data.totals.totalTokens)}
              </div>
              <div className={styles.kpiSub}>
                Input {formatTokens(data.totals.inputTokens)} · Output{" "}
                {formatTokens(data.totals.outputTokens)}
              </div>
            </article>

            <article className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Chi phí ước tính trong kỳ</span>
                <span className={styles.kpiIcon}>
                  <Coins size={16} aria-hidden="true" />
                </span>
              </div>
              <div className={styles.kpiValue}>
                {formatUsd(data.totals.costMicroUsd)}
              </div>
              <div className={styles.kpiSub}>
                Kỳ {data.from} → {data.to}
              </div>
            </article>

            <article className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Tổng lượt gọi & Tỉ lệ đạt</span>
                <span className={styles.kpiIcon}>
                  <Activity size={16} aria-hidden="true" />
                </span>
              </div>
              <div className={styles.kpiValue}>
                {new Intl.NumberFormat("vi-VN").format(data.totals.calls)}
              </div>
              <div className={styles.kpiSub}>
                Thành công:{" "}
                {data.totals.successRateBps !== null
                  ? formatBps(data.totals.successRateBps)
                  : "—"}
              </div>
            </article>

            <article className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Độ trễ phản hồi trung bình</span>
                <span className={styles.kpiIcon}>
                  <Clock size={16} aria-hidden="true" />
                </span>
              </div>
              <div className={styles.kpiValue}>
                {formatLatency(data.totals.avgLatencyMs)}
              </div>
              <div className={styles.kpiSub}>
                Hậu kiểm AI đang mở: {data.quality.autoReview.checksOpen} bài
              </div>
            </article>
          </section>

          {/* 3. Daily Token Stacked Chart */}
          <section className={styles.panel} aria-labelledby="ai-trend-heading">
            <div className={styles.panelHeader}>
              <div>
                <h2 id="ai-trend-heading" className={styles.panelTitle}>
                  Xu hướng tiêu thụ Token theo ngày
                </h2>
                <p className={styles.panelSub}>
                  Di chuột vào từng cột để xem số lượt gọi, Input/Output token và chi phí USD.
                </p>
              </div>
              <div className={styles.legendRow}>
                <span className={styles.legendItem}>
                  <span className={styles.legendDotInput} />
                  Input tokens
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDotOutput} />
                  Output tokens
                </span>
              </div>
            </div>

            {data.totals.totalTokens === 0 ? (
              <p className={styles.emptyNote}>
                Chưa có lượt gọi AI nào ghi nhận token trong khoảng thời gian {data.from} → {data.to}.
              </p>
            ) : (
              <TokenTrendChart daily={data.daily} />
            )}
          </section>

          {/* 4. 4 AI Features Breakdown */}
          <section className={styles.featureGrid} aria-label="Chi tiết 4 tính năng AI">
            {data.features.map((f) => (
              <article key={f.key} className={styles.featureCard}>
                <div className={styles.featureTop}>
                  <div>
                    <h3 className={styles.featureName}>{f.label}</h3>
                    <p className={styles.featureProvider}>{f.provider}</p>
                  </div>
                  <span
                    className={f.enabled ? styles.statusPillOn : styles.statusPillOff}
                  >
                    <Bot size={12} aria-hidden="true" />
                    {f.enabled ? "Đang bật" : "Đang tắt"}
                  </span>
                </div>

                <div className={styles.featureMetrics}>
                  <div>
                    <span className={styles.featureMetricLabel}>Lượt gọi</span>
                    <span className={styles.featureMetricVal}>
                      {f.calls} ({f.failed > 0 ? `${f.failed} lỗi` : "0 lỗi"})
                    </span>
                  </div>
                  <div>
                    <span className={styles.featureMetricLabel}>Chi phí</span>
                    <span className={styles.featureMetricVal}>
                      {formatUsd(f.costMicroUsd)}
                    </span>
                  </div>
                  <div>
                    <span className={styles.featureMetricLabel}>Token (In / Out)</span>
                    <span className={styles.featureMetricVal}>
                      {formatTokens(f.inputTokens)} / {formatTokens(f.outputTokens)}
                    </span>
                  </div>
                  <div>
                    <span className={styles.featureMetricLabel}>Độ trễ TB</span>
                    <span className={styles.featureMetricVal}>
                      {formatLatency(f.avgLatencyMs)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </section>

          {/* 5. Quality & Models 2-column section */}
          <div className={styles.twoCol}>
            <section className={styles.panel} aria-labelledby="ai-quality-heading">
              <div className={styles.panelHeader}>
                <div>
                  <h2 id="ai-quality-heading" className={styles.panelTitle}>
                    Chất lượng câu trả lời & Hậu kiểm AI
                  </h2>
                  <p className={styles.panelSub}>
                    Chính sách tự duyệt: <code>{data.quality.autoReview.policyVersion}</code>{" "}
                    ({data.quality.autoReview.policyApproved ? "đã phê duyệt" : "chưa phê duyệt"})
                  </p>
                </div>
                <Link to="/ai-review-checks" className={styles.auditLink}>
                  <ShieldCheck size={14} aria-hidden="true" />
                  Mở hậu kiểm AI
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </div>

              <div className={styles.qualityList}>
                <div className={styles.qualityRow}>
                  <div>
                    <strong>Tỉ lệ lật quyết định Tự duyệt (Overturn Rate)</strong>
                    <span>
                      AI duyệt {data.quality.autoReview.approved} · Chuyển Staff{" "}
                      {data.quality.autoReview.escalated} · Staff phát hiện lỗi{" "}
                      {data.quality.autoReview.staffConfirmedProblems}/
                      {data.quality.autoReview.staffReviewedChecks}
                    </span>
                  </div>
                  <div className={styles.qualityStat}>
                    <b>
                      {data.quality.autoReview.overturnRateBps !== null
                        ? formatBps(data.quality.autoReview.overturnRateBps)
                        : "—"}
                    </b>
                  </div>
                </div>

                <div className={styles.qualityRow}>
                  <div>
                    <strong>Mức độ tin dùng Trợ lý giá (Adoption Rate)</strong>
                    <span>
                      Gợi ý {data.quality.priceAssist.suggested} · Áp dụng{" "}
                      {data.quality.priceAssist.applied} · Giá bán nằm trong khoảng gợi ý{" "}
                      {data.quality.priceAssist.withinRange}
                    </span>
                  </div>
                  <div className={styles.qualityStat}>
                    <b>
                      {data.quality.priceAssist.adoptionRateBps !== null
                        ? formatBps(data.quality.priceAssist.adoptionRateBps)
                        : "—"}
                    </b>
                  </div>
                </div>

                <div className={styles.qualityRow}>
                  <div>
                    <strong>Kết quả Đọc ảnh tự điền tin</strong>
                    <span>
                      Đọc đủ thông tin: {data.quality.autofill.suggested} · Thiếu ảnh/mờ:{" "}
                      {data.quality.autofill.needsMoreData} · Lỗi:{" "}
                      {data.quality.autofill.failed}
                    </span>
                  </div>
                  <div className={styles.qualityStat}>
                    <b>{data.quality.autofill.suggested}</b>
                  </div>
                </div>
              </div>

              <div className={styles.failureStrip} aria-label="Phân loại lỗi AI">
                <div className={styles.failureChip}>
                  <b>{data.quality.failures.timeout}</b>
                  <span>Timeout</span>
                </div>
                <div className={styles.failureChip}>
                  <b>{data.quality.failures.invalidOutput}</b>
                  <span>Sai định dạng</span>
                </div>
                <div className={styles.failureChip}>
                  <b>{data.quality.failures.providerError}</b>
                  <span>Lỗi Provider</span>
                </div>
                <div className={styles.failureChip}>
                  <b>{data.quality.failures.refusal}</b>
                  <span>Từ chối</span>
                </div>
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="ai-models-heading">
              <div className={styles.panelHeader}>
                <div>
                  <h2 id="ai-models-heading" className={styles.panelTitle}>
                    Phân bổ Token theo Model
                  </h2>
                  <p className={styles.panelSub}>
                    Xếp theo chi phí giảm dần trong kỳ đã chọn.
                  </p>
                </div>
              </div>

              {data.models.length === 0 ? (
                <p className={styles.emptyNote}>
                  Chưa có model nào được gọi trong khoảng thời gian này.
                </p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.modelTable}>
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Lượt</th>
                        <th>Input</th>
                        <th>Output</th>
                        <th>Chi phí</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.models.map((m) => (
                        <tr key={m.model}>
                          <td className={styles.modelCode}>{m.model}</td>
                          <td>{m.calls}</td>
                          <td>{formatTokens(m.inputTokens)}</td>
                          <td>{formatTokens(m.outputTokens)}</td>
                          <td>{formatUsd(m.costMicroUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

