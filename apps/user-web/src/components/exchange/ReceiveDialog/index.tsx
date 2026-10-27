import { useState } from 'react';
import { createPortal } from 'react-dom';
import { BookCheck, AlertTriangle } from 'lucide-react';
import styles from './ReceiveDialog.module.css';

interface ReceiveDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    isBusy: boolean;
    bookTitle?: string;
}

export function ReceiveDialog({ isOpen, onClose, onConfirm, isBusy, bookTitle }: ReceiveDialogProps) {
    const [checked, setChecked] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleConfirm = async () => {
        if (!checked) {
            setError('Vui lòng tích chọn xác nhận đã kiểm tra sách.');
            return;
        }
        setError('');
        try {
            await onConfirm();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi xác nhận nhận sách.');
        }
    };

    return createPortal(
        <div className={styles.overlay} onClick={isBusy ? undefined : onClose} role="dialog" aria-modal="true">
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.headerIcon}>
                        <BookCheck size={26} />
                    </div>
                    <div>
                        <h2 className={styles.title}>Xác nhận đã nhận sách</h2>
                        <p className={styles.subtitle}>Kiểm tra sách thực tế trước khi hoàn tất giao dịch</p>
                    </div>
                </div>

                <div className={styles.body}>
                    {bookTitle && (
                        <div className={styles.bookNotice}>
                            <span className={styles.bookLabel}>Cuốn sách bạn nhận:</span>
                            <span className={styles.bookName}>{bookTitle}</span>
                        </div>
                    )}

                    <div className={styles.warningBox}>
                        <AlertTriangle size={20} className={styles.warningIcon} />
                        <div className={styles.warningText}>
                            <strong>Lưu ý:</strong> Khi cả hai bên đều xác nhận đã nhận sách, giao dịch sẽ bước vào <strong>khoảng đệm kiểm tra 48 giờ</strong>. Bạn có 48 giờ để đọc thử và kiểm tra tình trạng thực tế của sách trước khi hệ thống hoàn tất và tất toán cọc.
                        </div>
                    </div>

                    <label className={styles.checkboxLabel}>
                        <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={checked}
                            onChange={(e) => setChecked(e.target.checked)}
                            disabled={isBusy}
                        />
                        <span>Tôi đã nhận bưu phẩm, mở kiểm tra và xác nhận sách khớp với tình trạng đã thỏa thuận.</span>
                    </label>

                    {error && (
                        <div className={styles.errorMessage} role="alert">
                            {error}
                        </div>
                    )}
                </div>

                <div className={styles.actions}>
                    <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={onClose}
                        disabled={isBusy}
                    >
                        Để sau
                    </button>
                    <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={handleConfirm}
                        disabled={isBusy || !checked}
                    >
                        {isBusy ? 'Đang hoàn tất...' : 'Xác nhận nhận sách'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
