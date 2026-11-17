import { ArrowLeft, Check, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { HandoverNavigation } from "../../../lib/exchange-handover";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { ShippingTrackingCard } from "../ShippingTrackingCard";
import { FundingHistory, ProposalHistory } from "./ExchangeHistory";
import styles from "./ExchangeSteps.module.css";

const steps = [
  { id: "proposal", label: "Đề nghị" },
  { id: "funding", label: "Đặt cọc" },
  { id: "handover", label: "Giao nhận" },
  { id: "inspection", label: "Kiểm tra" },
  { id: "result", label: "Kết quả" },
] as const;

type Step = (typeof steps)[number]["id"];

function currentStep(status: ExchangeDetail["status"]): Step {
  switch (status) {
    case "PENDING": return "proposal";
    case "FUNDING": return "funding";
    case "WAITING_YOU_SEND":
    case "WAITING_YOU_CONFIRM":
    case "DELIVERING": return "handover";
    case "INSPECTING": return "inspection";
    default: return "result";
  }
}

function hasStepFacts(step: Step, detail: ExchangeDetail) {
  const funded = Boolean(detail.viewerFundedAt && detail.partnerFundedAt);
  switch (step) {
    case "proposal": return true;
    case "funding": return funded || Boolean(detail.viewerFundedAt || detail.partnerFundedAt || detail.fundingDeadline);
    case "handover": return funded || Boolean(detail.viewerShipping.sentAt || detail.partnerShipping.sentAt);
    case "inspection": return Boolean(detail.viewerShipping.receivedAt && detail.partnerShipping.receivedAt);
    default: return false;
  }
}

function hasCompleted(step: Step, current: Step, detail: ExchangeDetail) {
  switch (step) {
    case "proposal":
      return current !== "result" || Boolean(detail.fundingDeadline || detail.viewerFundedAt || detail.partnerFundedAt);
    case "funding": return Boolean(detail.viewerFundedAt && detail.partnerFundedAt);
    case "handover": return Boolean(detail.viewerShipping.receivedAt && detail.partnerShipping.receivedAt);
    case "inspection": return detail.status === "COMPLETED" || detail.status === "NEED_REVIEW";
    default: return false;
  }
}

const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

function RecordedTime({ value, empty }: { value?: string; empty: string }) {
  return value ? <time dateTime={value}>{dateFormat.format(new Date(value))}</time> : empty;
}

function StepHistory({ step, detail, navigation }: {
  step: Step;
  detail: ExchangeDetail;
  navigation: HandoverNavigation;
}) {
  if (step === "proposal") return <ProposalHistory detail={detail} />;
  if (step === "handover") return <ShippingTrackingCard detail={detail} history {...navigation} />;
  if (step === "funding") return <FundingHistory detail={detail} />;
  return (
    <dl className={styles.record}>
      <div><dt>Hạn kiểm tra của bạn</dt><dd><RecordedTime value={detail.viewerInspectionDeadline} empty="Chưa ghi nhận" /></dd></div>
      <div><dt>Hạn kiểm tra của đối tác</dt><dd><RecordedTime value={detail.partnerInspectionDeadline} empty="Chưa ghi nhận" /></dd></div>
      <div><dt>Bạn xác nhận đã kiểm tra lúc</dt><dd><RecordedTime value={detail.viewerCompletedAt} empty="Chưa ghi nhận" /></dd></div>
      <div><dt>Đối tác xác nhận đã kiểm tra lúc</dt><dd><RecordedTime value={detail.partnerCompletedAt} empty="Chưa ghi nhận" /></dd></div>
    </dl>
  );
}

export function ExchangeSteps({ detail, children, navigation }: {
  detail: ExchangeDetail;
  children: ReactNode;
  navigation: HandoverNavigation;
}) {
  const current = currentStep(detail.status);
  const currentIndex = steps.findIndex(step => step.id === current);
  const [selection, setSelection] = useState<{ step: Step | null; navigationKey: string }>();
  const chosen = selection?.navigationKey === navigation.navigationKey ? selection.step : undefined;
  const followHandover = chosen === undefined && Boolean(navigation.target);
  const selectedStep = chosen ?? (followHandover ? "handover" : current);
  const viewing = selectedStep !== current &&
    steps.findIndex(step => step.id === selectedStep) < currentIndex &&
    hasStepFacts(selectedStep, detail) ? selectedStep : undefined;
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const currentButton = useRef<HTMLButtonElement>(null);
  const priorCurrent = useRef(current);

  useEffect(() => {
    if (viewing && !followHandover) historyHeading.current?.focus();
  }, [viewing, followHandover]);

  useEffect(() => {
    const changed = priorCurrent.current !== current;
    priorCurrent.current = current;
    if (changed && !viewing && !followHandover) currentButton.current?.focus();
  }, [current, viewing, followHandover]);

  const backToCurrent = () => {
    setSelection({ step: null, navigationKey: navigation.navigationKey });
    currentButton.current?.focus();
  };

  return (
    <>
      <nav className={styles.steps} aria-label="Các bước đổi sách">
        <ol>
          {steps.map(({ id, label }, index) => {
            const active = id === current;
            const available = index < currentIndex && hasStepFacts(id, detail);
            const selected = (viewing ?? current) === id;
            const completed = available && hasCompleted(id, current, detail);
            const marker = completed ? <Check size={15} strokeWidth={2.6} aria-hidden="true" /> : index + 1;
            const content = (
              <>
                <span className={styles.marker} aria-hidden="true">{marker}</span>
                <span className={styles.label}>{label}</span>
              </>
            );
            return (
              <li key={id} data-current={active || undefined} data-selected={selected || undefined}
                data-completed={completed || undefined}>
                {active || available ? (
                  <button className={styles.step} ref={active ? currentButton : undefined} type="button"
                    data-focus-inverse={active || undefined}
                    aria-current={active ? "step" : undefined} aria-pressed={selected}
                    aria-label={available ? `Xem lại ${label.toLowerCase()}` : undefined}
                    onClick={() => active ? backToCurrent() : setSelection({ step: id, navigationKey: navigation.navigationKey })}>
                    {content}
                  </button>
                ) : <span className={styles.step}>{content}<span className={styles.announcement}> · Chưa mở</span></span>}
              </li>
            );
          })}
        </ol>
      </nav>
      <p className={styles.announcement} role="status">Bước hiện tại {steps[currentIndex].label}</p>
      {viewing && (
        <section className={styles.history} data-viewing={viewing} aria-labelledby="exchange-history-heading">
          <header className={styles.historyHeader}>
            <div className={styles.historyHeadingGroup}>
              <span className={styles.archiveBadge}>
                <Clock size={13} aria-hidden="true" /> Bản lưu trữ đối chiếu
              </span>
              <h2 ref={historyHeading} id="exchange-history-heading" tabIndex={-1} className={styles.historyTitle}>
                Xem lại bước {steps.findIndex(s => s.id === viewing) + 1}: {steps.find(step => step.id === viewing)?.label}
              </h2>
              <p className={styles.historyNote}>
                Thông tin được lưu vết tự động từ thỏa thuận ban đầu để đối chiếu, không ảnh hưởng đến giao dịch hiện tại.
              </p>
            </div>
            <button type="button" className={styles.backButton} onClick={backToCurrent}>
              <ArrowLeft size={16} aria-hidden="true" /> Về bước {steps[currentIndex].label}
            </button>
          </header>
          <StepHistory step={viewing} detail={detail}
            navigation={followHandover ? navigation : { navigationKey: navigation.navigationKey }} />
        </section>
      )}
      <div hidden={Boolean(viewing)}>{children}</div>
    </>
  );
}
