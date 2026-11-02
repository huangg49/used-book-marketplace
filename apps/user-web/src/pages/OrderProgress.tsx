import { Check } from "lucide-react";
import styles from "./DirectOrders.module.css";

const steps = ["Đặt đơn", "Thanh toán", "Chuẩn bị", "Vận chuyển", "Hoàn tất"];

export function OrderProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className={styles.stepperContainer} aria-label="Tiến trình thủ tục đơn hàng">
      {steps.map((label, index) => {
        const completed = currentStep > index + 1;
        const current = currentStep === index + 1;
        return (
          <div key={label} aria-current={current ? "step" : undefined}
            className={`${styles.stepItem} ${completed ? styles.stepCompleted : ""} ${current ? styles.stepCurrent : ""}`}>
            <div className={styles.stepCircle} aria-hidden="true">
              {completed ? <Check size={14} strokeWidth={3} /> : index + 1}
            </div>
            <span className={styles.stepLabel}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
