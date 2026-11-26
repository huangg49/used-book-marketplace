import { ArrowRight, ArrowUpRight, Check, CheckCircle2, Clock3, FlaskConical, PackageCheck, Truck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "./ConfirmDialog";
import { useDirectDeliveryAction } from "../hooks/useDirectDeliveryAction";
import { type DirectDeliveryAction, type DirectOrder } from "../services/orders";
import styles from "./DirectDeliveryJourney.module.css";

type IssueAction = "ReportNonReceipt" | "ReportCondition";
const issueLabels: Record<IssueAction, string> = {
  ReportNonReceipt: "Chưa nhận được sách",
  ReportCondition: "Sách có vấn đề",
};
const journeyTime = (time: string) => new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
}).format(new Date(time));

const driverActions: DirectDeliveryAction[] = ["Pickup", "OutForDelivery", "Deliver"];

function directDriverUrl(trackingCode: string) {
  return `/driver?${new URLSearchParams({ kind: "direct", trackingCode })}`;
}

export function DirectDeliveryTimeline({ order }: { order: DirectOrder }) {
  const tracking = order.deliveryJourney!;
  const steps = [
    { label: "Đã đăng ký vận đơn", at: tracking.trackingCode, showTime: false },
    { label: "Đã lấy kiện", at: tracking.pickedUpAt, showTime: true },
    { label: "Đang giao", at: tracking.outForDeliveryAt, showTime: true },
    { label: "Giao thành công", at: order.deliveredAt, showTime: true },
  ];
  const current = steps.reduce((last, step, index) => step.at ? index : last, -1);
  return (
    <ol className={styles.timeline} aria-label="Các mốc giao sách">
      {steps.map((step, index) => (
        <li key={step.label} aria-current={index === current ? "step" : undefined} data-done={!!step.at}>
          <span className={styles.marker} aria-hidden="true">{step.at ? <Check size={13} /> : index + 1}</span>
          <span>
            <strong>{step.label}</strong>
            {step.at && <small>{step.showTime ? journeyTime(step.at) : step.at}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function DirectDeliveryJourney({ order, onChanged }: { order: DirectOrder; onChanged: () => Promise<unknown> }) {
  const { deliveryJourney: tracking } = order;
  const command = useDirectDeliveryAction(order, onChanged);
  const [issue, setIssue] = useState<IssueAction>();
  const [description, setDescription] = useState("");
  const [skip, setSkip] = useState(false);
  if (!tracking) return null;
  const inspection = order.state === "Inspection";
  const canDrive = tracking.actions.some((action) => driverActions.includes(action));
  const canAct = (action: DirectDeliveryAction) =>
    command.pending ? command.pending === action : tracking.actions.includes(action);
  const issueActions = (["ReportCondition"] as IssueAction[]).filter(canAct);
  const waitNote = order.role === "Seller"
    ? "Người mua có thể kiểm tra sách và báo sự cố trong thời hạn hiển thị."
    : "Bạn có thể báo sự cố trong 72 giờ kể từ mốc giao hoặc nhận sách đã ghi nhận.";

  return (
    <section className={styles.panel} aria-label={inspection ? "Kiểm tra sách" : "Tiến độ giao nhận"}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.titleIcon} aria-hidden="true">
            {inspection ? <PackageCheck size={16} /> : <Truck size={16} />}
          </span>
          <h3>{tracking.issue ? "Đang xử lý sự cố" : inspection ? "Kiểm tra sách bạn nhận" : "Theo dõi kiện sách"}</h3>
        </div>
        <p>{tracking.issue ? "Tiền thanh toán đang được giữ trong lúc hồ sơ được xem xét." : inspection ? waitNote : "Các mốc được cập nhật theo vận đơn của giao dịch này."}</p>
      </header>
      {tracking.issue ? (
        <div className={styles.issue}>
          <strong>{issueLabels[tracking.issue.kind]}</strong>
          <small>{journeyTime(tracking.issue.openedAt)}</small>
          {order.role === "Buyer" && <Link className={styles.link} to={`/support/${tracking.issue.supportCaseId}`}>Mở hồ sơ hỗ trợ <ArrowUpRight size={15} /></Link>}
        </div>
      ) : inspection ? (
        <>
          {(order.inspectionDeadline || tracking.acknowledgedAt) && (
            <div className={styles.statusStrip}>
              {order.inspectionDeadline && (
                <div className={styles.deadlineRow}>
                  <Clock3 size={15} aria-hidden="true" />
                  <span>Hạn kiểm tra</span>
                  <strong>{journeyTime(order.inspectionDeadline)}</strong>
                </div>
              )}
              {tracking.acknowledgedAt && (
                <div className={styles.receivedRow}>
                  <CheckCircle2 size={14} aria-hidden="true" />
                  <span>Đã xác nhận nhận sách lúc {journeyTime(tracking.acknowledgedAt)}</span>
                </div>
              )}
            </div>
          )}

          {(canAct("Acknowledge") || issueActions.length > 0) && (
            <div className={styles.actionGroup}>
              {canAct("Acknowledge") && (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={command.busy}
                  onClick={() => void command.run("Acknowledge")}
                >
                  {command.pending ? "Thử lại xác nhận" : "Tôi đã nhận được sách"}
                </button>
              )}
              {issueActions.length > 0 && (
                <div className={styles.issueActions} data-count={issueActions.length}>
                  {issueActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      className={styles.secondary}
                      disabled={command.busy}
                      onClick={() => setIssue(action)}
                    >
                      {issueLabels[action]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {canAct("SkipInspection") && (
            <div className={styles.demoSection}>
              <span className={styles.demoCaption}>
                <FlaskConical size={12} aria-hidden="true" />
                Tiện ích kiểm thử nhanh
              </span>
              <button
                type="button"
                className={styles.demo}
                disabled={command.busy}
                onClick={() => setSkip(true)}
              >
                Tua hạn kiểm tra và giải ngân · Demo
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <DirectDeliveryTimeline order={order} />
          {tracking.trackingCode && <Link className={canDrive ? styles.primary : styles.link} to={directDriverUrl(tracking.trackingCode)}>
            {canDrive ? "Mở Driver Simulator · Demo" : "Theo dõi vận đơn"} <ArrowRight size={16} aria-hidden="true" />
          </Link>}
        </>
      )}
      {command.error && !issue && !skip && <p role="alert" className={styles.error}>{command.error}</p>}
      <ConfirmDialog isOpen={!!issue} onClose={() => !command.busy && setIssue(undefined)}
        title={issue ? issueLabels[issue] : "Báo sự cố"} description="Tiền được giữ trong lúc hồ sơ được xem xét. Bạn có thể bổ sung ảnh hoặc video sau khi gửi báo cáo."
        confirmText={command.pending === issue ? "Thử lại gửi báo cáo" : "Gửi báo cáo"}
        isBusy={command.busy} confirmDisabled={!command.pending && description.trim().length < 10}
        onConfirm={async () => {
          if (issue && await command.run(issue, description.trim())) setIssue(undefined);
        }}>
        <label className={styles.field}>Mô tả sự cố
          <textarea value={description} onChange={(event) => setDescription(event.target.value)}
            disabled={!!command.pending} maxLength={1000} rows={4}
            placeholder="Mô tả điều đã xảy ra để người phụ trách kiểm tra…" />
        </label>
        {command.error && <p role="alert" className={styles.error}>{command.error}</p>}
      </ConfirmDialog>
      <ConfirmDialog isOpen={skip} onClose={() => !command.busy && setSkip(false)}
        title="Tua qua thời gian kiểm tra?" description="Đơn demo sẽ hoàn tất và tiền đang giữ sẽ được giải ngân vào ví người bán."
        confirmText={command.pending ? "Thử lại giải ngân" : "Hoàn tất đơn demo"} isBusy={command.busy}
        onConfirm={async () => { if (await command.run("SkipInspection")) setSkip(false); }}>
        {command.error && <p role="alert" className={styles.error}>{command.error}</p>}
      </ConfirmDialog>
    </section>
  );
}
