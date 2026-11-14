import { CheckCircle2, ChevronDown, Clock } from "lucide-react";
import type { ReactNode } from "react";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
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
          <Clock size={19} aria-hidden="true" />
          <h3 id="exchange-inspection-deadline">
            Hạn kiểm tra sách của bạn
            {ownDeadline ? <InspectionTime value={ownDeadline} /> : <span>Chưa có thông tin hạn</span>}
          </h3>
        </div>
        <div className={styles.body}>
          {expired ? (
            <p className={styles.status} role="status">
              {awaitingResult ? "Đã hết hạn kiểm tra. Đang chờ kết quả." : "Đã hết hạn kiểm tra của bạn."}
            </p>
          ) : checked ? (
            <p className={styles.status} role="status"><CheckCircle2 size={17} aria-hidden="true" />Bạn đã xác nhận kiểm tra</p>
          ) : (
            <p className={styles.intro}>Đối chiếu sách với tình trạng đã ghi nhận trong phiếu.</p>
          )}
          {children}
          <p className={styles.note}>Mỗi bên có 72 giờ từ lúc nhận sách. Cọc được giữ đến khi cả hai hết hạn và giao dịch không có khiếu nại.</p>
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
