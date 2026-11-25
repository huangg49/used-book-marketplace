import { Link } from 'react-router-dom';
import { exchangeServiceFeeText } from "@used-books/session-client";
import { CheckCircle2, Wallet, BookCheck, ArrowRight } from 'lucide-react';
import type { ExchangeDetail } from '../../../lib/mock/exchangeDetail';
import { ROUTES, formatVnd } from '../../../lib/routes';
import styles from './SettlementCard.module.css';

interface SettlementCardProps {
    detail: ExchangeDetail;
}

export function SettlementCard({ detail }: SettlementCardProps) {
    if (detail.status !== 'COMPLETED') return null;

    const moneyAmount = detail.moneyAmount || 0;
    const isCompensation = detail.moneyCompensationType !== 'none' && moneyAmount > 0;
    const refundedDeposit = detail.viewerDeposit ?? detail.viewerFundingAmount ?? 0;
    const partialDamage = detail.resolutionCompensationAmount ?? 0;
    const isPartialDeduction =
        partialDamage > 0 &&
        (detail.resolutionDecision === 'CompensateInitiator' ||
            detail.resolutionDecision === 'CompensateRecipient');
    const viewerWonDeduction =
        isPartialDeduction &&
        ((detail.resolutionDecision === 'CompensateInitiator' && detail.viewerRole === 'proposer') ||
            (detail.resolutionDecision === 'CompensateRecipient' && detail.viewerRole === 'recipient'));

    return (
        <div className={styles.card}>
            <div className={styles.banner}>
                <div className={styles.iconCircle}>
                    <CheckCircle2 size={32} />
                </div>
                <div className={styles.bannerText}>
                    <h3 className={styles.title}>Giao dịch Trao đổi Hoàn tất Thành công!</h3>
                    <p className={styles.subtitle}>
                        {isPartialDeduction
                            ? `Giao dịch hoàn tất theo phán quyết kèm khấu trừ thiệt hại ${formatVnd(partialDamage)}. Hệ thống đã tất toán ký quỹ về ví.`
                            : 'Thời hạn kiểm tra của cả hai bên đã kết thúc. Hệ thống đã tất toán ký quỹ và dòng tiền.'}
                    </p>
                </div>
            </div>

            <div className={styles.summaryGrid}>
                <div className={styles.summaryItem}>
                    <div className={styles.itemHeader}>
                        <Wallet size={16} className={styles.itemIcon} />
                        <span className={styles.itemLabel}>Ký quỹ bảo chứng</span>
                    </div>
                    <p className={styles.itemValuePositive}>
                        +{formatVnd(refundedDeposit)}
                    </p>
                    <span className={styles.itemSubtext}>
                        {isPartialDeduction
                            ? 'Khoản cọc gốc đã tất toán theo phán quyết'
                            : 'Đã hoàn lại 100% cọc vào Ví mô phỏng'}
                    </span>
                </div>

                <div className={styles.summaryItem}>
                    <div className={styles.itemHeader}>
                        <Wallet size={16} className={styles.itemIcon} />
                        <span className={styles.itemLabel}>
                            {isPartialDeduction ? 'Khấu trừ thiệt hại' : 'Khoản bù chênh lệch'}
                        </span>
                    </div>
                    <p className={styles.itemValue}>
                        {isPartialDeduction
                            ? viewerWonDeduction
                                ? `+${formatVnd(partialDamage)} (Bạn nhận bồi hoàn)`
                                : `-${formatVnd(partialDamage)} (Khấu trừ thiệt hại)`
                            : isCompensation
                                ? (detail.moneyCompensationType === 'user_pays'
                                    ? `-${formatVnd(moneyAmount)} (Bạn bù)`
                                    : `+${formatVnd(moneyAmount)} (Đối tác bù)`)
                                : '0 đ (Ngang giá)'}
                    </p>
                    <span className={styles.itemSubtext}>
                        {isPartialDeduction && isCompensation
                            ? `Tiền bù thỏa thuận: ${formatVnd(moneyAmount)} · Đã tất toán`
                            : 'Đã kết chuyển hoàn tất'}
                    </span>
                </div>

                <div className={styles.summaryItem}>
                    <div className={styles.itemHeader}>
                        <BookCheck size={16} className={styles.itemIcon} />
                        <span className={styles.itemLabel}>Trạng thái sách</span>
                    </div>
                    <p className={styles.itemValue}>Đã trao đổi</p>
                    <span className={styles.itemSubtext}>Các sách trong phiếu chuyển sang Exchanged</span>
                </div>
            </div>

            <p>{exchangeServiceFeeText}</p>
            <div className={styles.actions}>
                <Link to={`${ROUTES.wallet}#lich-su-giao-dich`} className={styles.btnWallet}>
                    <Wallet size={16} /> Xem lịch sử giao dịch Ví
                </Link>
                <Link to={ROUTES.search} className={styles.btnExplore}>
                    Khám phá sách khác <ArrowRight size={16} />
                </Link>
            </div>
        </div>
    );
}
