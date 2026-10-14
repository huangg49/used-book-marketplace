import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROUTES } from '../lib/routes';
import { useSession } from '../hooks/useSession';
import { retryExchange } from '../services/exchange';
import {
    getExchangeDetail,
    getMessages,
    sendMessage,
    cancelExchange,
    acceptExchange,
    fundExchange,
    rejectExchange,
    confirmSent,
    confirmReceived,
    completeExchange,
    counterExchange
} from '../services/exchangeDetail';
import type { CounterOfferData } from '../components/exchange/CounterDialog';
import { saveExchangeShipment, type ShipmentData } from '../services/exchangeShipment';
import { ProgressStepper } from '../components/exchange/ProgressStepper';
import { SettlementCard } from '../components/exchange/SettlementCard';
import { ReviewCard } from '../components/exchange/ReviewCard';
import { ShippingTrackingCard } from '../components/exchange/ShippingTrackingCard';
import { BookInfoCard } from '../components/exchange/BookInfoCard';
import { ActionCard } from '../components/exchange/ActionCard';
import { ChatPanel } from '../components/exchange/ChatPanel';
import { SafetyTipsCard } from '../components/exchange/SafetyTipsCard';
import styles from './ExchangeDetailPage.module.css';

export function ExchangeDetailPage() {
    const { id } = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    const auth = useSession();

    const {
        data: detail,
        isLoading: isDetailLoading,
        isError: isDetailError,
        refetch: refetchDetail
    } = useQuery({
        queryKey: ['exchangeDetail', auth.status === 'authenticated' ? auth.user.id : undefined, id],
        queryFn: () => getExchangeDetail(id!),
        enabled: !!id && auth.status === 'authenticated',
        refetchInterval: 5000,
        refetchIntervalInBackground: false
    });

    const { data: messages = [] } = useQuery({
        queryKey: ['exchangeMessages', id],
        queryFn: () => getMessages(id!),
        enabled: !!id && auth.status === 'authenticated',
        refetchInterval: 3000,
        refetchIntervalInBackground: false
    });

    // Mutations
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['exchangeDetail'] });
        queryClient.invalidateQueries({ queryKey: ['exchangeTransactions'] });
        queryClient.invalidateQueries({ queryKey: ['exchangeCounts'] });
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
        queryClient.invalidateQueries({ queryKey: ['exchangeMessages', id] });
    };

    const handleSendMessage = async (text: string) => {
        await sendMessage(id!, text);
        invalidate();
    };

    const handleCancel = async () => {
        await cancelExchange(id!, detail!.revision!);
        invalidate();
    };

    const handleAccept = async (deliveryAddressId?: string) => {
        await acceptExchange(id!, detail!.revision!, deliveryAddressId);
        invalidate();
    };

    const handleReject = async (reason?: string) => {
        await rejectExchange(id!, detail!.revision!, reason ?? 'Không phù hợp');
        invalidate();
    };

    const handleCounter = async (data: CounterOfferData) => {
        await counterExchange(id!, detail!.revision!, data);
        invalidate();
    };

    const handleConfirmSent = async (shipmentData?: ShipmentData) => {
        if (shipmentData && detail) {
            const role = detail.viewerRole === 'proposer' ? 'initiator' : 'recipient';
            saveExchangeShipment(id!, role, shipmentData);
        }
        await confirmSent(id!, detail!.revision!, shipmentData);
        invalidate();
    };

    const handleConfirmReceived = async () => {
        await confirmReceived(id!, detail!.revision!);
        invalidate();
    };

    const handleComplete = async () => {
        await completeExchange(id!, detail!.revision!);
        invalidate();
    };


    if (auth.status !== 'authenticated') {
        return <div className={styles.authContainer}><h2>{auth.status === 'loading' ? 'Đang kiểm tra đăng nhập…' : 'Đăng nhập để xem trao đổi'}</h2>{auth.status !== 'loading' && <Link className={styles.loginBtn} to={`/login?returnUrl=${encodeURIComponent(`/exchange/${id ?? ''}`)}`}>Đăng nhập</Link>}</div>;
    }
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


    let statusText = String(detail.status);
    if (detail.status === 'PENDING') statusText = 'Chờ phản hồi';
    else if (detail.status === 'FUNDING') statusText = 'Chờ đặt cọc';
    else if (detail.status === 'WAITING_YOU_SEND') statusText = 'Chuẩn bị gửi sách';
    else if (detail.status === 'RESOLUTION_PENDING') statusText = 'Đang cần xử lý';
    else if (detail.status === 'DELIVERING') {
        statusText = detail.viewerShipping.receivedAt ? 'Đang chờ đối tác nhận sách' : 'Đang giao nhận';
    }
    else if (detail.status === 'WAITING_YOU_CONFIRM') {
        statusText = detail.viewerShipping.receivedAt ? 'Đang chờ đối tác nhận sách' : 'Chờ xác nhận nhận sách';
    }
    else if (detail.status === 'INSPECTING') statusText = 'Đang kiểm tra sách (48h)';
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
                <ProgressStepper 
                    status={detail.status} 
                    failedAtStep={detail.failedAtStep} 
                    closedBy={detail.closedBy} 
                    partnerUsername={detail.partner.username}
                    hasReceived={Boolean(detail.viewerShipping.receivedAt)}
                />
            </div>

            {detail.status === 'COMPLETED' && (
                <>
                    <SettlementCard detail={detail} />
                    <ReviewCard detail={detail} />
                </>
            )}

            <div className={styles.gridContainer}>
                <div className={styles.mainCol}>
                    <BookInfoCard detail={detail} />
                    <ShippingTrackingCard detail={detail} onRefresh={invalidate} />
                    <ActionCard 
                        detail={detail} 
                        onCancel={handleCancel}
                        onAccept={handleAccept}
                        onCounter={handleCounter}
                        onFund={async () => { await fundExchange(id!); invalidate(); }}
                        onRetry={async () => { await retryExchange(id!); invalidate(); }}
                        onReject={handleReject}
                        onConfirmSent={handleConfirmSent}
                        onConfirmReceived={handleConfirmReceived}
                        onComplete={handleComplete}
                    />
                    <SafetyTipsCard />
                </div>
                
                <div className={styles.sideCol}>
                    <ChatPanel 
                        messages={messages} 
                        partner={detail.partner} 
                        onSendMessage={handleSendMessage}
                        isReadOnly={['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(detail.status)}
                        unavailable={false}
                    />
                </div>
            </div>
        </div>
    );
}
