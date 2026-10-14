import { Link } from 'react-router-dom';
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

    return (
        <div className={styles.card}>
            <div className={styles.banner}>
                <div className={styles.iconCircle}>
                    <CheckCircle2 size={32} />
                </div>
                <div className={styles.bannerText}>
                    <h3 className={styles.title}>Giao dịch Trao đổi Hoàn tất Thành công!</h3>
                    <p className={styles.subtitle}>
                        Cả hai bên đã nhận và nghiệm thu sách. Hệ thống đã tự động tất toán ký quỹ và dòng tiền.
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
                        +{formatVnd(detail.viewerFundingAmount ?? 0)}
                    </p>
                    <span className={styles.itemSubtext}>Đã hoàn lại 100% vào Ví mô phỏng</span>
                </div>

                <div className={styles.summaryItem}>
                    <div className={styles.itemHeader}>
                        <Wallet size={16} className={styles.itemIcon} />
                        <span className={styles.itemLabel}>Khoản bù chênh lệch</span>
                    </div>
                    <p className={styles.itemValue}>
                        {isCompensation
                            ? (detail.moneyCompensationType === 'user_pays'
                                ? `-${formatVnd(moneyAmount)} (Bạn bù)`
                                : `+${formatVnd(moneyAmount)} (Đối tác bù)`)
                            : '0 đ (Ngang giá)'}
                    </p>
                    <span className={styles.itemSubtext}>Đã kết chuyển hoàn tất</span>
                </div>

                <div className={styles.summaryItem}>
                    <div className={styles.itemHeader}>
                        <BookCheck size={16} className={styles.itemIcon} />
                        <span className={styles.itemLabel}>Trạng thái sách</span>
                    </div>
                    <p className={styles.itemValue}>Đã trao đổi</p>
                    <span className={styles.itemSubtext}>Cả 2 sách chuyển sang Exchanged</span>
                </div>
            </div>

            <div className={styles.actions}>
                <Link to={ROUTES.account} className={styles.btnWallet}>
                    <Wallet size={16} /> Kiểm tra số dư Tài khoản
                </Link>
                <Link to={ROUTES.search} className={styles.btnExplore}>
                    Khám phá sách khác <ArrowRight size={16} />
                </Link>
            </div>
        </div>
    );
}
