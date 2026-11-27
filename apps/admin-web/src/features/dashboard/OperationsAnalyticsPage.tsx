import { PageHeading, PageTitle } from "../../core/PageHeading";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router-dom";
import { ApiError, type CurrentUser } from "@used-books/session-client";
import {
  Gavel,
  RefreshCw,
  Repeat,
  ShieldAlert,
  ShoppingBag,
  Users,
} from "lucide-react";
import { canResolve, canReview, session } from "../../core/session";
import { ErrorNotice } from "../../core/ui";
import { dashboardAnalyticsQuery } from "./queries";
import { dateInputInHcm, formatVnd, subtractDays } from "./revenue";
import { formatBps } from "./finance";
import styles from "./StatisticsHub.module.css";

function RateBar({ bps }: { bps: number | null }) {
  const pct = bps === null ? 0 : Math.min(100, Math.max(0, bps / 100));
  return (
    <div className={styles.progressTrack} aria-hidden="true">
      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function OperationsAnalyticsPage() {
  const user = useOutletContext<CurrentUser>();
  const today = dateInputInHcm();
  const [fromDraft, setFromDraft] = useState(() => subtractDays(today, 29));
  const [toDraft, setToDraft] = useState(today);
  const [applied, setApplied] = useState({ from: subtractDays(today, 29), to: today });
  const [preset, setPreset] = useState<7 | 30 | 90 | null>(30);

  const query = useQuery(
    dashboardAnalyticsQuery(user, applied.from, applied.to, (path, schema) =>
      session.request(path, schema),
    ),
  );

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

  const canApply = fromDraft.length > 0 && toDraft.length > 0 && fromDraft <= toDraft;

  if (denied) {
    return (
      <div className={styles.page}>
        <section className={styles.denied} aria-labelledby="ops-denied">
          <PageTitle id="ops-denied">Không có quyền xem thống kê vận hành</PageTitle>
        </section>
      </div>
    );
  }

  const data = query.data;

  return (
    <div className={styles.page}>
      <PageHeading title="Giao dịch & Rủi ro">
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
              aria-label="Cập nhật thống kê giao dịch"
            >
              <RefreshCw size={15} />
            </button>
          </form>
        </div>
      </PageHeading>

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
          Đang tổng hợp hiệu suất giao dịch…
        </div>
      ) : data ? (
        <>
          {/* Section 1: 3 Channel Cards */}
          <section className={styles.kpiGrid3} aria-label="Hiệu suất 3 kênh giao dịch">
            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Mua bán trực tiếp</h2>
                  <p className={styles.panelHint}>
                    Tỉ lệ hoàn tất: <strong>{formatBps(data.sales.completionRateBps)}</strong>
                  </p>
                </div>
                <ShoppingBag size={18} aria-hidden="true" />
              </div>
              <RateBar bps={data.sales.completionRateBps} />
              <ul className={styles.statList}>
                <li className={styles.statRow}>
                  <span>Đơn tạo mới trong kỳ</span>
                  <strong>{data.sales.created}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Đã hoàn tất</span>
                  <strong className={styles.positiveAmt}>{data.sales.completed}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Đang xử lý</span>
                  <strong>{data.sales.active}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Hủy / hết hạn / hoàn</span>
                  <strong className={data.sales.cancelled > 0 ? styles.negativeAmt : undefined}>
                    {data.sales.cancelled}
                  </strong>
                </li>
              </ul>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Trao đổi sách</h2>
                  <p className={styles.panelHint}>
                    Tỉ lệ hoàn tất: <strong>{formatBps(data.exchanges.completionRateBps)}</strong>
                  </p>
                </div>
                <Repeat size={18} aria-hidden="true" />
              </div>
              <RateBar bps={data.exchanges.completionRateBps} />
              <ul className={styles.statList}>
                <li className={styles.statRow}>
                  <span>Đề xuất trong kỳ</span>
                  <strong>{data.exchanges.proposed}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Đã hoàn tất</span>
                  <strong className={styles.positiveAmt}>{data.exchanges.completed}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Đang tiến hành</span>
                  <strong>{data.exchanges.active}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Đang tranh chấp / Hủy</span>
                  <strong>
                    {data.exchanges.disputed} / {data.exchanges.cancelled}
                  </strong>
                </li>
              </ul>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Đấu giá tại điểm</h2>
                  <p className={styles.panelHint}>
                    Sell-through: <strong>{formatBps(data.auctions.sellThroughRateBps)}</strong>
                  </p>
                </div>
                <Gavel size={18} aria-hidden="true" />
              </div>
              <RateBar bps={data.auctions.sellThroughRateBps} />
              <ul className={styles.statList}>
                <li className={styles.statRow}>
                  <span>Phiên tạo trong kỳ</span>
                  <strong>{data.auctions.created}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Bán thành công</span>
                  <strong className={styles.positiveAmt}>{data.auctions.sold}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Đang diễn ra / chờ</span>
                  <strong>{data.auctions.active}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Thắng quá hạn / Hủy</span>
                  <strong>
                    {data.auctions.paymentExpired} / {data.auctions.cancelled}
                  </strong>
                </li>
              </ul>
            </article>
          </section>

          {/* Section 2: Risk & Users */}
          <div className={styles.splitEqual}>
            <section className={styles.panel} aria-labelledby="risk-title">
              <div className={styles.panelHeader}>
                <div>
                  <h2 id="risk-title">Rủi ro, tranh chấp & Quỹ sự cố</h2>
                  <p className={styles.panelHint}>Các vụ việc mở hiện tại và mức chi quỹ trong kỳ.</p>
                </div>
                <ShieldAlert size={18} aria-hidden="true" />
              </div>
              <ul className={styles.statList}>
                <li className={styles.statRow}>
                  <span>Khiếu nại trao đổi đang mở</span>
                  <strong className={data.risk.openExchangeDisputes > 0 ? styles.negativeAmt : undefined}>
                    {data.risk.openExchangeDisputes}
                  </strong>
                </li>
                <li className={styles.statRow}>
                  <span>Sự cố tại điểm đang mở</span>
                  <strong className={data.risk.openPointIncidents > 0 ? styles.negativeAmt : undefined}>
                    {data.risk.openPointIncidents}
                  </strong>
                </li>
                <li className={styles.statRow}>
                  <span>Sự cố thiếu quỹ bồi thường</span>
                  <strong className={data.risk.underfundedIncidents > 0 ? styles.negativeAmt : undefined}>
                    {data.risk.underfundedIncidents}
                  </strong>
                </li>
                <li className={styles.statRow}>
                  <span>Bồi thường đã duyệt trong kỳ</span>
                  <strong>{formatVnd(data.risk.incidentCompensationInPeriod)}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Số dư Quỹ sự cố còn lại</span>
                  <strong>{formatVnd(data.risk.incidentFundBalance)}</strong>
                </li>
              </ul>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Link to="/operations/exchange-disputes" className={styles.actionLink}>
                  Khiếu nại trao đổi →
                </Link>
                {canResolve(user) && (
                  <Link to="/operations/incidents" className={styles.actionLink}>
                    Sự cố tại điểm →
                  </Link>
                )}
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="users-title">
              <div className={styles.panelHeader}>
                <div>
                  <h2 id="users-title">Thành viên toàn hệ thống</h2>
                  <p className={styles.panelHint}>Tổng hợp trực tiếp toàn bộ tài khoản Member.</p>
                </div>
                <Users size={18} aria-hidden="true" />
              </div>
              <ul className={styles.statList}>
                <li className={styles.statRow}>
                  <span>Tổng thành viên (Member)</span>
                  <strong>{data.users.totalMembers}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Đăng ký mới trong kỳ</span>
                  <strong className={styles.positiveAmt}>+{data.users.newInPeriod}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Đang hoạt động bình thường</span>
                  <strong>{data.users.activeMembers}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Đang bị hạn chế (RESTRICTED)</span>
                  <strong>{data.users.restrictedMembers}</strong>
                </li>
                <li className={styles.statRow}>
                  <span>Đang bị khóa / vô hiệu hóa</span>
                  <strong className={data.users.lockedMembers > 0 ? styles.negativeAmt : undefined}>
                    {data.users.lockedMembers}
                  </strong>
                </li>
              </ul>
              {canResolve(user) && (
                <div>
                  <Link to="/users" className={styles.actionLink}>
                    Mở quản lý người dùng →
                  </Link>
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

