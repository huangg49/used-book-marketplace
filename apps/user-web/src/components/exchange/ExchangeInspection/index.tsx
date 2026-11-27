import { CheckCircle2, ChevronDown, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { formatVnd } from "../../../lib/routes";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { InfoTip } from "../../InfoTip";
import { ExchangeBookList } from "../ExchangeSteps/ExchangeHistory";
import styles from "./ExchangeInspection.module.css";

const day = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const clock = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });

function InspectionTime({ value }: { value: string }) {
  const date = new Date(value);
  return <time dateTime={value}>{clock.format(date)} <span>·</span> {day.format(date)}</time>;
}

export function ExchangeInspection({ detail, expired, awaitingResult, children }: {
  detail: ExchangeDetail;
  expired: boolean;
  awaitingResult: boolean;
  children: ReactNode;
}) {
  const checked = Boolean(detail.viewerCompletedAt);
  const ownDeadline = detail.viewerInspectionDeadline;
  const receivedAt = detail.viewerShipping.receivedAt;

  return (
    <div className={styles.workspace}>
      <section className={styles.panel} aria-labelledby="exchange-inspection-deadline">
        <div className={styles.deadline} data-expired={expired || undefined}>
          <span className={styles.clockBadge} aria-hidden="true">
            <Clock size={18} />
          </span>
          <div className={styles.deadlineCopy}>
            <div className={styles.deadlineHeadRow}>
              <h3 id="exchange-inspection-deadline">
                Hạn kiểm tra sách của bạn
                {ownDeadline ? <InspectionTime value={ownDeadline} /> : <span>Chưa có thông tin hạn</span>}
              </h3>
              <InfoTip label="Quy định 72 giờ kiểm tra">
                <ul>
                  <li>
                    Mỗi bên có <strong>72 giờ</strong> kể từ lúc nhận sách để đối chiếu và báo sự cố.
                  </li>
                  <li>
                    Ví đang giữ <strong>{detail.viewerFundingAmount == null ? "khoản đã nộp" : formatVnd(detail.viewerFundingAmount)}</strong> cho đến khi hết hạn kiểm tra của cả hai bên và không có tranh chấp.
                  </li>
                </ul>
              </InfoTip>
            </div>
          </div>
        </div>
        <div className={styles.body}>
          {expired ? !awaitingResult && (
            <p className={styles.status} role="status">
              Đã hết hạn kiểm tra của bạn.
            </p>
          ) : checked ? (
            <p className={styles.status} data-ok="true" role="status">
              <CheckCircle2 size={17} aria-hidden="true" />
              {detail.partnerCompletedAt
                ? "Cả hai bên đã xác nhận kiểm tra"
                : "Bạn đã xác nhận kiểm tra"}
            </p>
          ) : detail.partnerCompletedAt ? (
            <p className={styles.status} data-ok="true" role="status">
              <CheckCircle2 size={17} aria-hidden="true" />
              Đối tác đã xác nhận kiểm tra
            </p>
          ) : (
            <p className={styles.intro}>Đối chiếu sách với tình trạng đã ghi nhận trong phiếu.</p>
          )}
          {children}
          <p className={styles.note} role={awaitingResult ? "status" : undefined}>
            {awaitingResult
              ? "Cả hai hạn đã qua. Đang chờ hệ thống tất toán về Ví."
              : <>Mỗi bên có <strong>72 giờ</strong> từ lúc nhận sách. Ví đang giữ {detail.viewerFundingAmount == null ? "khoản đã nộp" : <strong>{formatVnd(detail.viewerFundingAmount)}</strong>}.{detail.inspectionDeadline && <> Dự kiến xử lý tiền sau <strong><InspectionTime value={detail.inspectionDeadline} /></strong> nếu không có tranh chấp.</>}</>}
          </p>
          {(receivedAt || detail.partnerInspectionDeadline) && (
            <details className={styles.times}>
              <summary>Các mốc kiểm tra <ChevronDown size={15} aria-hidden="true" /></summary>
              <dl>
                {receivedAt && <div><dt>Bạn nhận sách</dt><dd><InspectionTime value={receivedAt} /></dd></div>}
                {detail.partnerInspectionDeadline && <div><dt>Hạn kiểm tra của đối tác</dt><dd><InspectionTime value={detail.partnerInspectionDeadline} /></dd></div>}
              </dl>
            </details>
          )}
        </div>
      </section>
      <ExchangeBookList books={detail.receiveBooks} incoming heading="Sách bạn đã nhận" />
    </div>
  );
}
