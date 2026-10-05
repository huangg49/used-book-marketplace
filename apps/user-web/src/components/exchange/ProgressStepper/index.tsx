import { Check, Truck, X } from 'lucide-react';
import type { ExchangeStatus } from '../../../lib/mock/exchangeMine';
import styles from './ProgressStepper.module.css';

export interface ProgressStepperProps {
    status: ExchangeStatus;
    failedAtStep?: number;
    closedBy?: 'viewer' | 'partner';
    partnerUsername?: string;
}

export function ProgressStepper({ status, failedAtStep, closedBy, partnerUsername: _partnerUsername }: ProgressStepperProps) {
    const steps = [
        { id: 1, label: 'Đã gửi đề nghị' },
        { id: 2, label: 'Đã chấp nhận' },
        { id: 3, label: 'Đang giao nhận' },
        { id: 4, label: 'Đã nhận sách' },
        { id: 5, label: 'Hoàn tất' }
    ];

    let currentStepIndex = 0;
    if (status === 'PENDING') currentStepIndex = 2; // Waiting for accept
    else if (status === 'DELIVERING') currentStepIndex = 3;
    else if (status === 'WAITING_YOU_CONFIRM') currentStepIndex = 4;
    else if (status === 'COMPLETED' || status === 'NEED_REVIEW') currentStepIndex = 5;

    // For failure states
    if (failedAtStep) {
        currentStepIndex = failedAtStep;
    }

    return (
        <div className={styles.stepperContainer}>
            <div className={styles.lineBg} aria-hidden="true" />
            <div 
                className={styles.lineProgress} 
                style={{ width: `${(Math.max(0, currentStepIndex - 1) / (steps.length - 1)) * 100}%` }} 
                aria-hidden="true" 
            />

            <ol className={styles.stepList} aria-label="Tiến trình giao dịch">
                {steps.map((step, index) => {
                    const stepNumber = index + 1;
                    const isFailedHere = failedAtStep === stepNumber;
                    
                    let state: 'completed' | 'current' | 'upcoming' | 'failed' = 'upcoming';
                    if (isFailedHere) state = 'failed';
                    else if (stepNumber < currentStepIndex || status === 'COMPLETED' || status === 'NEED_REVIEW') state = 'completed';
                    else if (stepNumber === currentStepIndex) state = 'current';

                    let ariaCurrent = undefined;
                    let hiddenStatus = 'chưa tới';
                    
                    if (state === 'current') {
                        ariaCurrent = 'step' as const;
                        hiddenStatus = 'đang diễn ra';
                    } else if (state === 'completed') {
                        hiddenStatus = 'đã hoàn thành';
                    } else if (state === 'failed') {
                        hiddenStatus = 'không thành công';
                    }

                    return (
                        <li key={step.id} className={styles.stepItem} aria-current={ariaCurrent}>
                            <span className="sr-only">Bước {stepNumber}: {step.label} - {hiddenStatus}</span>
                            
                            <div className={`${styles.circle} ${styles[`circle_${state}`]}`}>
                                {state === 'completed' && <Check className={styles.iconCheck} />}
                                {state === 'current' && stepNumber === 3 && <Truck className={styles.iconTruck} />}
                                {state === 'failed' && <X className={styles.iconFailed} />}
                                {state !== 'completed' && state !== 'failed' && !(state === 'current' && stepNumber === 3) && (
                                    <span className={styles.stepNum}>{stepNumber}</span>
                                )}
                            </div>
                            
                            <span className={`${styles.stepLabel} ${styles[`label_${state}`]}`}>
                                {isFailedHere ? (
                                    status === 'EXPIRED' ? 'Hết hạn' :
                                    status === 'CANCELLED' ? 'Đã hủy' :
                                    status === 'REJECTED' ? (closedBy === 'viewer' ? 'Từ chối' : 'Bị từ chối') : step.label
                                ) : step.label}
                            </span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
