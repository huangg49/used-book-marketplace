import { useEffect, useRef } from 'react';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children?: React.ReactNode;
    confirmText: string;
    cancelText?: string;
    onConfirm: () => void;
    isBusy?: boolean;
    confirmDisabled?: boolean;
    isDanger?: boolean;
    maxWidth?: string;
}

export function ConfirmDialog({
    isOpen,
    onClose,
    title,
    description,
    children,
    confirmText,
    cancelText = 'Hủy',
    onConfirm,
    isBusy = false,
    confirmDisabled = false,
    isDanger = false,
    maxWidth,
}: ConfirmDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const triggerRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (isOpen) {
            triggerRef.current = document.activeElement as HTMLElement;
            dialog.showModal();
            // Focus dialog itself to prevent auto-scrolling down to first input
            dialog.focus();
            dialog.scrollLeft = 0;
            dialog.scrollTop = 0;
            const frame = requestAnimationFrame(() => {
                if (dialogRef.current) {
                    dialogRef.current.scrollTop = 0;
                    dialogRef.current.scrollLeft = 0;
                }
            });
            const timer = setTimeout(() => {
                if (dialogRef.current) {
                    dialogRef.current.scrollTop = 0;
                }
            }, 30);
            return () => {
                cancelAnimationFrame(frame);
                clearTimeout(timer);
                if (dialog.open) dialog.close();
                if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
            };
        }
    }, [isOpen]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const handleCancel = (e: Event) => {
            e.preventDefault();
            if (!isBusy) onClose();
        };

        const handleClick = (e: MouseEvent) => {
            if (e.target === dialog && !isBusy) {
                onClose();
            }
        };

        dialog.addEventListener('cancel', handleCancel);
        dialog.addEventListener('click', handleClick);
        
        return () => {
            dialog.removeEventListener('cancel', handleCancel);
            dialog.removeEventListener('click', handleClick);
        };
    }, [isBusy, onClose]);

    if (!isOpen) return null;

    return (
        <dialog 
            ref={dialogRef} 
            tabIndex={-1}
            style={maxWidth ? { maxWidth } : undefined}
            className={styles.dialog}
            role={isDanger ? "alertdialog" : "dialog"}
            aria-labelledby="dialog-title"
            aria-describedby={description ? "dialog-desc" : undefined}
        >
            <div className={styles.content}>
                <div className={styles.header}>
                    <h2 id="dialog-title" className={styles.title}>{title}</h2>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label="Đóng"
                        disabled={isBusy}
                    >
                        ✕
                    </button>
                </div>
                {description && <p id="dialog-desc" className={styles.description}>{description}</p>}
                
                {children && <div className={styles.body}>{children}</div>}

                <div className={styles.footer}>
                    <button 
                        type="button" 
                        className={styles.btnCancel} 
                        onClick={onClose} 
                        disabled={isBusy}
                    >
                        {cancelText}
                    </button>
                    <button 
                        type="button" 
                        className={`${styles.btnConfirm} ${isDanger ? styles.btnDanger : ''}`} 
                        onClick={onConfirm}
                        disabled={isBusy || confirmDisabled}
                        aria-busy={isBusy}
                    >
                        {isBusy ? 'Đang xử lý...' : confirmText}
                    </button>
                </div>
            </div>
        </dialog>
    );
}
