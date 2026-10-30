import { Check, Truck, X, Clock, ShieldCheck, Sparkles, Send } from 'lucide-react';
import type { ExchangeStatus } from '../../../lib/mock/exchangeMine';
import styles from './ProgressStepper.module.css';

export interface ProgressStepperProps {
    status: ExchangeStatus;
    compact?: boolean;
    failedAtStep?: number;
    closedBy?: 'viewer' | 'partner' | 'both';
    partnerUsername?: string;
    hasReceived?: boolean;
}

export function ProgressStepper({ status, compact = false, failedAtStep, closedBy, partnerUsername: _partnerUsername, hasReceived }: ProgressStepperProps) {
    const steps = [
        { id: 1, label: 'Gửi đề nghị', shortLabel: 'Đề nghị' },
        { id: 2, label: 'Phản hồi và đặt cọc', shortLabel: 'Phản hồi' },
        { id: 3, label: 'Giao nhận', shortLabel: 'Giao nhận' },
        { id: 4, label: 'Kiểm tra sách', shortLabel: 'Kiểm tra' },
        { id: 5, label: 'Hoàn tất', shortLabel: 'Hoàn tất' }
    ];

    let currentStepIndex = 1;
    if (status === 'PENDING') currentStepIndex = 2; // Waiting for accept
    else if (status === 'FUNDING') currentStepIndex = 2;
    else if (status === 'WAITING_YOU_SEND') currentStepIndex = 3;
    else if (status === 'RESOLUTION_PENDING') currentStepIndex = hasReceived ? 4 : 3;
    else if (status === 'DELIVERING') currentStepIndex = hasReceived ? 4 : 3;
    else if (status === 'WAITING_YOU_CONFIRM') currentStepIndex = hasReceived ? 4 : 3;
    else if (status === 'INSPECTING') currentStepIndex = 4;
    else if (status === 'COMPLETED' || status === 'NEED_REVIEW') currentStepIndex = 5;

    // For failure states
    if (failedAtStep) {
        currentStepIndex = failedAtStep;
    }

    const currentStep = steps[currentStepIndex - 1] || steps[0];
    const progressPct = (Math.max(0, currentStepIndex - 1) / (steps.length - 1)) * 100;

    let statusBadgeText = 'Đang tiến hành';
    let statusBadgeType: 'pending' | 'funding' | 'active' | 'success' | 'failed' = 'active';

    if (status === 'PENDING') {
        statusBadgeText = 'Chờ phản hồi';
        statusBadgeType = 'pending';
    } else if (status === 'FUNDING') {
        statusBadgeText = 'Chờ đặt cọc';
        statusBadgeType = 'funding';
    } else if (status === 'WAITING_YOU_SEND' || status === 'DELIVERING' || status === 'WAITING_YOU_CONFIRM') {
        statusBadgeText = 'Đang giao nhận';
        statusBadgeType = 'active';
    } else if (status === 'INSPECTING') {
        statusBadgeText = '72h kiểm tra';
        statusBadgeType = 'active';
    } else if (status === 'COMPLETED') {
        statusBadgeText = 'Đã hoàn tất';
        statusBadgeType = 'success';
    } else if (status === 'RESOLUTION_PENDING') {
        statusBadgeText = 'Đang khiếu nại / sự cố';
        statusBadgeType = 'failed';
    } else if (status === 'CANCELLED') {
        statusBadgeText = 'Đã hủy';
        statusBadgeType = 'failed';
    } else if (status === 'REJECTED') {
        statusBadgeText = 'Từ chối';
        statusBadgeType = 'failed';
    } else if (status === 'EXPIRED') {
        statusBadgeText = 'Hết hạn';
        statusBadgeType = 'failed';
    }

    return (
        <div className={compact ? `${styles.stepperContainer} ${styles.compact}` : styles.stepperContainer}>
            {compact && (
                <div className={styles.compactHeader}>
                    <div className={styles.compactStepInfo}>
                        <span className={styles.compactStepBadge}>Bước {currentStepIndex}/5</span>
                        <span className={styles.compactStepTitle}>{currentStep.label}</span>
                    </div>
                    <span className={`${styles.compactStatusPill} ${styles[`status_${statusBadgeType}`]}`}>
                        {statusBadgeText}
                    </span>
                </div>
            )}

            <div className={styles.trackWrapper}>
                <div className={styles.lineBg} aria-hidden="true" />
                <div 
                    className={styles.lineProgress} 
                    style={{ 
                        ['--progress-pct' as string]: `${progressPct}%`,
                        width: `${progressPct}%`
                    } as React.CSSProperties} 
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
                                    {state === 'current' && (
                                        <>
                                            {stepNumber === 1 && <Send className={styles.iconStep} />}
                                            {stepNumber === 2 && <Clock className={styles.iconStep} />}
                                            {stepNumber === 3 && <Truck className={styles.iconTruck} />}
                                            {stepNumber === 4 && <ShieldCheck className={styles.iconStep} />}
                                            {stepNumber === 5 && <Sparkles className={styles.iconStep} />}
                                        </>
                                    )}
                                    {state === 'failed' && <X className={styles.iconFailed} />}
                                    {state === 'upcoming' && (
                                        <span className={styles.stepNum}>{stepNumber}</span>
                                    )}
                                </div>
                                
                                <span className={`${styles.stepLabel} ${styles[`label_${state}`]}`}>
                                    {compact ? step.shortLabel : (
                                        isFailedHere ? (
                                            status === 'EXPIRED' ? 'Hết hạn' :
                                            status === 'CANCELLED' ? (closedBy === 'both' ? 'Đồng thuận hủy' : 'Đã hủy') :
                                            status === 'REJECTED' ? (closedBy === 'viewer' ? 'Từ chối' : 'Bị từ chối') : step.label
                                        ) : step.label
                                    )}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </div>
    );
}
