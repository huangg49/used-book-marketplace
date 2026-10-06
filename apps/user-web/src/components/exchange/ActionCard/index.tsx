import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ExchangeDetail } from '../../../lib/mock/exchangeDetail';
import { ConfirmDialog } from '../../ConfirmDialog';
import { ROUTES } from '../../../lib/routes';
import styles from './ActionCard.module.css';

interface ActionCardProps {
    detail: ExchangeDetail;
    onCancel: () => Promise<void>;
    onAccept: () => Promise<void>;
    onReject: (reason?: string) => Promise<void>;
    onConfirmSent: () => Promise<void>;
    onConfirmReceived: () => Promise<void>;
    onReportIssue: (type: string, desc: string) => Promise<void>;
}

export function ActionCard({
    detail,
    onCancel,
    onAccept,
    onReject,
    onConfirmSent,
    onConfirmReceived,
    onReportIssue
}: ActionCardProps) {
    const navigate = useNavigate();
    const isProposer = detail.viewerRole === 'proposer';
    
    // Dialog states
    const [cancelOpen, setCancelOpen] = useState(false);
    const [acceptOpen, setAcceptOpen] = useState(false);
    const [rejectOpen, setRejectOpen] = useState(false);
    const [sentOpen, setSentOpen] = useState(false);
    const [receivedOpen, setReceivedOpen] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);

    // Reject Form State
    const [rejectReason, setRejectReason] = useState('');
    const [rejectError, setRejectError] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Report Form State
    const [reportType, setReportType] = useState('Không nhận được sách');
    const [reportDesc, setReportDesc] = useState('');
    const [reportError, setReportError] = useState('');

    const wrapAction = async (action: () => Promise<void>, closeFn: () => void, setErrorMsg: (msg: string) => void) => {
        setIsProcessing(true);
        setErrorMsg('');
        try {
            await action();
            closeFn();
        } catch (_e) {
            setErrorMsg('Đã có lỗi xảy ra. Vui lòng thử lại.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = () => {
        if (rejectReason.length > 300) {
            setRejectError('Lý do không được vượt quá 300 ký tự');
            return;
        }
        wrapAction(() => onReject(rejectReason), () => setRejectOpen(false), setRejectError);
    };

    const handleReport = () => {
        if (reportDesc.length < 20) {
            setReportError('Vui lòng nhập tối thiểu 20 ký tự mô tả chi tiết sự cố.');
            return;
        }
        wrapAction(() => onReportIssue(reportType, reportDesc), () => setReportOpen(false), setReportError);
    };

    let title = 'Hành động của bạn';
    let instructions = '';
    let buttons = null;

    if (detail.status === 'PENDING') {
        if (isProposer) {
            instructions = 'Bạn đã gửi đề nghị. Đang chờ đối tác phản hồi.';
            buttons = (
                <div className={styles.btnRow}>
                    <button className={styles.btnSecondary} onClick={() => setCancelOpen(true)}>Hủy đề nghị</button>
                    <button className={styles.btnSecondary} onClick={() => navigate(`${ROUTES.exchangeCompose}?from=${detail.id}`)}>Cập nhật đề nghị</button>
                </div>
            );
        } else {
            instructions = 'Bạn nhận được một đề nghị trao đổi. Vui lòng xem xét và phản hồi.';
            buttons = (
                <div className={styles.btnRow}>
                    <button className={styles.btnPrimary} onClick={() => setAcceptOpen(true)}>Chấp nhận</button>
                    <button className={styles.btnSecondary} onClick={() => setRejectOpen(true)}>Từ chối</button>
                    <button className={styles.btnSecondary} onClick={() => navigate(`${ROUTES.exchangeCompose}?from=${detail.id}`)}>Đề xuất lại</button>
                </div>
            );
        }
    } else if (detail.status === 'DELIVERING') {
        const viewerShipping = detail.viewerShipping;
        const partnerShipping = detail.partnerShipping;
        
        if (!viewerShipping?.sentAt) {
            instructions = 'Đề nghị đã được chấp nhận. Vui lòng gửi sách và xác nhận khi bạn đã hoàn tất việc gửi đi.';
            buttons = (
                <div className={styles.btnRow}>
                    <button className={styles.btnPrimary} onClick={() => setSentOpen(true)}>
                        <CheckCircle2 size={18} /> Xác nhận đã gửi sách
                    </button>
                    {!partnerShipping?.sentAt && (
                        <button className={styles.btnSecondary} onClick={() => navigate(`${ROUTES.exchangeCompose}?from=${detail.id}`)}>Đề xuất lại</button>
                    )}
                    <button className={styles.btnSecondary} onClick={() => setReportOpen(true)}>
                        <AlertTriangle size={18} /> Báo cáo sự cố
                    </button>
                </div>
            );
        } else {
            instructions = `Bạn đã xác nhận gửi lúc ${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date(viewerShipping.sentAt))}. Đang chờ quá trình giao nhận hoàn tất.`;
            buttons = (
                <div className={styles.btnRow}>
                    <button className={styles.btnSecondary} onClick={() => setReportOpen(true)}>
                        <AlertTriangle size={18} /> Báo cáo sự cố
                    </button>
                </div>
            );
        }
    } else if (detail.status === 'WAITING_YOU_CONFIRM') {
        const viewerShipping = detail.viewerShipping;
        
        if (!viewerShipping?.receivedAt) {
            instructions = 'Đối tác đã xác nhận gửi sách. Vui lòng xác nhận khi bạn đã nhận được sách.';
            buttons = (
                <div className={styles.btnRow}>
                    <button className={styles.btnPrimary} onClick={() => setReceivedOpen(true)}>
                        <CheckCircle2 size={18} /> Xác nhận đã nhận sách
                    </button>
                    <button className={styles.btnSecondary} onClick={() => setReportOpen(true)}>
                        <AlertTriangle size={18} /> Báo cáo sự cố
                    </button>
                </div>
            );
        } else {
            instructions = 'Bạn đã xác nhận nhận sách. Đang chờ đối tác xác nhận để hoàn tất giao dịch.';
            buttons = (
                <div className={styles.btnRow}>
                    <button className={styles.btnSecondary} onClick={() => setReportOpen(true)}>
                        <AlertTriangle size={18} /> Báo cáo sự cố
                    </button>
                </div>
            );
        }
    } else if (detail.status === 'COMPLETED') {
        instructions = 'Giao dịch trao đổi sách đã hoàn tất thành công. Bạn có thể để lại đánh giá cho đối tác.';
        buttons = (
            <div className={styles.btnRow}>
                <div className={styles.btnWrapper}>
                    <button className={styles.btnPrimary} disabled aria-describedby="review-todo">Để lại đánh giá</button>
                    <span id="review-todo" className={styles.todoMsg} role="status">Tính năng đánh giá sẽ sớm có</span>
                </div>
                <button className={styles.btnSecondary} onClick={() => navigate(ROUTES.exchangeMine)}>Xem lại trao đổi của tôi</button>
            </div>
        );
    } else {
        instructions = detail.status === 'REJECTED' ? 'Đề nghị trao đổi đã bị từ chối.' : 
                      detail.status === 'CANCELLED' ? 'Đề nghị trao đổi đã bị hủy.' : 
                      'Đề nghị trao đổi đã hết hạn do không có phản hồi.';
        buttons = (
            <div className={styles.btnRow}>
                <button className={styles.btnPrimary} onClick={() => navigate(ROUTES.exchangeMine)}>Quay lại Trao đổi của tôi</button>
                <button className={styles.btnSecondary} onClick={() => setReportOpen(true)}>Báo cáo sự cố</button>
            </div>
        );
    }

    return (
        <div className={styles.card}>
            <h2 className={styles.cardTitle}>{title}</h2>
            <p className={styles.instructions}>{instructions}</p>
            {buttons}

            {/* Dialogs */}
            <ConfirmDialog 
                isOpen={cancelOpen} 
                onClose={() => setCancelOpen(false)}
                onConfirm={() => wrapAction(onCancel, () => setCancelOpen(false), setRejectError)}
                title="Hủy đề nghị"
                confirmText="Hủy đề nghị"
                isBusy={isProcessing}
            >
                <p>Bạn có chắc chắn muốn hủy đề nghị trao đổi này không?</p>
            </ConfirmDialog>

            <ConfirmDialog 
                isOpen={acceptOpen} 
                onClose={() => setAcceptOpen(false)}
                onConfirm={() => wrapAction(onAccept, () => setAcceptOpen(false), setRejectError)}
                title="Chấp nhận đề nghị"
                confirmText="Chấp nhận"
                isBusy={isProcessing}
            >
                <p>Bằng việc chấp nhận, bạn đồng ý với các điều khoản trao đổi.</p>
            </ConfirmDialog>

            <ConfirmDialog 
                isOpen={sentOpen} 
                onClose={() => setSentOpen(false)}
                onConfirm={() => wrapAction(onConfirmSent, () => setSentOpen(false), setRejectError)}
                title="Xác nhận đã gửi"
                confirmText="Xác nhận"
                isBusy={isProcessing}
                isDanger
            >
                <p>Xác nhận bạn đã gửi sách cho đối tác? Hành động này không thể hoàn tác.</p>
            </ConfirmDialog>

            <ConfirmDialog 
                isOpen={receivedOpen} 
                onClose={() => setReceivedOpen(false)}
                onConfirm={() => wrapAction(onConfirmReceived, () => setReceivedOpen(false), setRejectError)}
                title="Xác nhận đã nhận"
                confirmText="Xác nhận"
                isBusy={isProcessing}
                isDanger
            >
                <p>Xác nhận bạn đã nhận được sách từ đối tác với tình trạng như thỏa thuận? Hành động này không thể hoàn tác.</p>
            </ConfirmDialog>

            <ConfirmDialog 
                isOpen={rejectOpen} 
                onClose={() => setRejectOpen(false)}
                onConfirm={handleReject}
                title="Từ chối đề nghị"
                confirmText="Từ chối"
                isBusy={isProcessing}
            >
                <p style={{ marginBottom: 16 }}>Bạn có thể cho đối tác biết lý do từ chối (tùy chọn).</p>
                <div className={styles.inputGroup}>
                    <textarea 
                        className={styles.textarea} 
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Nhập lý do từ chối (tối đa 300 ký tự)"
                        maxLength={300}
                        aria-invalid={!!rejectError}
                        aria-describedby={rejectError ? "reject-error" : undefined}
                    />
                    {rejectError && <p id="reject-error" className={styles.errorText}>{rejectError}</p>}
                </div>
            </ConfirmDialog>

            <ConfirmDialog 
                isOpen={reportOpen} 
                onClose={() => setReportOpen(false)}
                onConfirm={handleReport}
                title="Báo cáo sự cố"
                confirmText="Gửi báo cáo"
                isBusy={isProcessing}
            >
                <p style={{ marginBottom: 16 }}>Vui lòng cung cấp chi tiết sự cố để Lật lại hỗ trợ bạn.</p>
                <div className={styles.inputGroup}>
                    <select 
                        className={styles.select}
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value)}
                    >
                        <option value="Không nhận được sách">Không nhận được sách</option>
                        <option value="Sách không đúng mô tả">Sách không đúng mô tả</option>
                        <option value="Đối tác không phản hồi">Đối tác không phản hồi</option>
                        <option value="Khác">Khác</option>
                    </select>
                    <textarea 
                        className={styles.textarea} 
                        value={reportDesc}
                        onChange={(e) => setReportDesc(e.target.value)}
                        placeholder="Mô tả chi tiết sự cố (tối thiểu 20 ký tự)..."
                        aria-invalid={!!reportError}
                        aria-describedby={reportError ? "report-error" : undefined}
                    />
                    {reportError && <p id="report-error" className={styles.errorText}>{reportError}</p>}
                </div>
            </ConfirmDialog>
        </div>
    );
}
