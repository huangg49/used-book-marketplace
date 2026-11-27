import { Link } from 'react-router-dom';
import { exchangeServiceFeeText } from "@used-books/session-client";
import { CheckCircle2, Wallet, BookCheck, ArrowRight } from 'lucide-react';
import type { ExchangeDetail } from '../../../lib/mock/exchangeDetail';
import { ROUTES, formatVnd } from '../../../lib/routes';
import { InfoTip } from '../../InfoTip';
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
        <section className={styles.card} aria-label="Kết quả tất toán trao đổi">
            <div className={styles.banner}>
                <div className={styles.iconCircle} aria-hidden="true">
                    <CheckCircle2 size={28} />
                </div>
                <div className={styles.bannerText}>
                    <div className={styles.titleRow}>
                        <h2 className={styles.title}>Giao dịch trao đổi đã hoàn tất</h2>
                        <InfoTip label="Thông tin phí và tất toán">
                            {exchangeServiceFeeText}
                        </InfoTip>
                    </div>
                    <p className={styles.subtitle}>
                        {isPartialDeduction
                            ? <>Hoàn tất theo phán quyết kèm khấu trừ thiệt hại <strong>{formatVnd(partialDamage)}</strong>. Hệ thống đã tất toán ký quỹ về ví.</>
                            : 'Hạn kiểm tra của cả hai bên đã kết thúc. Hệ thống đã hoàn cọc và tất toán dòng tiền.'}
                    </p>
                </div>
            </div>

            <div className={styles.summaryGrid}>
                <div className={styles.summaryItem}>
                    <div className={styles.itemHeader}>
                        <Wallet size={15} className={styles.itemIcon} aria-hidden="true" />
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
                        <Wallet size={15} className={styles.itemIcon} aria-hidden="true" />
                        <span className={styles.itemLabel}>
                            {isPartialDeduction ? 'Khấu trừ thiệt hại' : 'Khoản bù chênh lệch'}
                        </span>
                    </div>
                    <p className={styles.itemValue}>
                        {isPartialDeduction
                            ? viewerWonDeduction
                                ? `+${formatVnd(partialDamage)} (Bạn nhận)`
                                : `-${formatVnd(partialDamage)} (Khấu trừ)`
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
                        <BookCheck size={15} className={styles.itemIcon} aria-hidden="true" />
                        <span className={styles.itemLabel}>Trạng thái sách</span>
                    </div>
                    <p className={styles.itemValue}>Đã trao đổi</p>
                    <span className={styles.itemSubtext}>Cập nhật hoàn tất trên kệ sách</span>
                </div>
            </div>

            <div className={styles.footerRow}>
                <p className={styles.feeLine}>{exchangeServiceFeeText}</p>
                <div className={styles.actions}>
                    <Link to={`${ROUTES.wallet}#lich-su-giao-dich`} className={styles.btnWallet}>
                        <Wallet size={15} aria-hidden="true" /> Lịch sử giao dịch Ví
                    </Link>
                    <Link data-focus-inverse to={ROUTES.search} className={styles.btnExplore}>
                        Khám phá sách khác <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                </div>
            </div>
        </section>
    );
}
