import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROUTES } from '../lib/routes';
import { useSession } from '../hooks/useSession';
import {
    getExchangeDetail,
    getMessages,
    sendMessage,
    cancelExchange,
    acceptExchange,
    rejectExchange,
    confirmSent,
    confirmReceived,
    reportIssue
} from '../services/exchangeDetail';
import { ProgressStepper } from '../components/exchange/ProgressStepper';
import { BookInfoCard } from '../components/exchange/BookInfoCard';
import { ActionCard } from '../components/exchange/ActionCard';
import { ChatPanel } from '../components/exchange/ChatPanel';
import { SafetyTipsCard } from '../components/exchange/SafetyTipsCard';
import styles from './ExchangeDetailPage.module.css';

export function ExchangeDetailPage() {
    const { id } = useParams<{ id: string }>();
    const sessionState = useSession();
    const queryClient = useQueryClient();

    const {
        data: detail,
        isLoading: isDetailLoading,
        isError: isDetailError,
        refetch: refetchDetail
    } = useQuery({
        queryKey: ['exchangeDetail', id],
        queryFn: () => getExchangeDetail(id!),
        enabled: !!id,
        refetchInterval: 10000,
        refetchIntervalInBackground: false
    });

    const { data: messages = [] } = useQuery({
        queryKey: ['exchangeMessages', id],
        queryFn: () => getMessages(id!),
        enabled: !!id,
        refetchInterval: 10000,
        refetchIntervalInBackground: false
    });

    // Mutations
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['exchangeDetail', id] });
        queryClient.invalidateQueries({ queryKey: ['exchangeMessages', id] });
    };

    const handleSendMessage = async (text: string) => {
        await sendMessage(id!, text);
        invalidate();
    };

    const handleCancel = async () => {
        await cancelExchange(id!);
        invalidate();
    };

    const handleAccept = async () => {
        await acceptExchange(id!);
        invalidate();
    };

    const handleReject = async (reason?: string) => {
        await rejectExchange(id!, reason);
        invalidate();
    };

    const handleConfirmSent = async () => {
        await confirmSent(id!);
        invalidate();
    };

    const handleConfirmReceived = async () => {
        await confirmReceived(id!);
        invalidate();
    };

    const handleReportIssue = async (type: string, desc: string) => {
        await reportIssue(id!, type, desc);
        invalidate();
    };

    // Tạm tắt để test UI
    // if (sessionState.status === 'anonymous') {
    //     return (
    //         <div className={styles.authContainer}>
    //             <h2>Vui lòng đăng nhập để xem giao dịch</h2>
    //             <Link to={ROUTES.login} className={styles.loginBtn}>Đăng nhập</Link>
    //         </div>
    //     );
    // }

    if (isDetailLoading) {
        return <div className={styles.loadingContainer}>Đang tải...</div>;
    }

    if (isDetailError) {
        return (
            <div className={styles.errorContainer}>
                <h2>Đã có lỗi xảy ra khi tải dữ liệu</h2>
                <button className={styles.retryBtn} onClick={() => refetchDetail()}>Thử lại</button>
            </div>
        );
    }

    if (!detail) {
        return (
            <div className={styles.notFoundContainer}>
                <h2>Không tìm thấy giao dịch</h2>
                <p style={{ marginBottom: 16 }}>Giao dịch bạn tìm kiếm không tồn tại hoặc bạn không có quyền truy cập.</p>
                <Link to={ROUTES.exchangeMine} className={styles.backBtn}>Quay lại Trao đổi của tôi</Link>
            </div>
        );
    }

    const isReadOnly = ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(detail.status);

    let statusText = String(detail.status);
    if (detail.status === 'PENDING') statusText = 'Chờ phản hồi';
    else if (detail.status === 'DELIVERING') statusText = 'Đang giao nhận';
    else if (detail.status === 'WAITING_YOU_CONFIRM') statusText = 'Chờ xác nhận';
    else if (detail.status === 'COMPLETED') statusText = 'Hoàn tất';
    else if (detail.status === 'REJECTED') {
        statusText = detail.closedBy === 'viewer' ? 'Bạn đã từ chối đề nghị này' : `@${detail.partner.username} đã từ chối đề nghị của bạn`;
    }
    else if (detail.status === 'CANCELLED') statusText = 'Bạn đã hủy đề nghị';
    else if (detail.status === 'EXPIRED') statusText = 'Hết hạn';

    return (
        <div className={styles.container}>
            <div className={styles.pageHeader}>
                <div>
                    <span className={styles.transactionCode}>Mã Giao Dịch: #{detail.transactionCode}</span>
                    <h1 className={styles.pageTitle}>Chi Tiết Trao Đổi</h1>
                </div>
                <div className={styles.headerStatus}>
                    Trạng thái: <span className={styles.statusValue}>{statusText}</span>
                </div>
            </div>

            <div className={styles.stepperCard}>
                <ProgressStepper status={detail.status} failedAtStep={detail.failedAtStep} closedBy={detail.closedBy} partnerUsername={detail.partner.username} />
            </div>

            <div className={styles.gridContainer}>
                <div className={styles.mainCol}>
                    <BookInfoCard detail={detail} />
                    <ActionCard 
                        detail={detail} 
                        onCancel={handleCancel}
                        onAccept={handleAccept}
                        onReject={handleReject}
                        onConfirmSent={handleConfirmSent}
                        onConfirmReceived={handleConfirmReceived}
                        onReportIssue={handleReportIssue}
                    />
                    <SafetyTipsCard />
                </div>
                
                <div className={styles.sideCol}>
                    <ChatPanel 
                        messages={messages} 
                        partner={detail.partner} 
                        onSendMessage={handleSendMessage}
                        isReadOnly={isReadOnly}
                    />
                </div>
            </div>
        </div>
    );
}
