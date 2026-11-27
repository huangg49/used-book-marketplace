import { useEffect, useId, useRef } from 'react';
import { lockPageScroll } from '../../lib/page-scroll';
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
    error?: string | null;
    maxWidth?: string;
    stickyFooter?: boolean;
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
    error,
    maxWidth,
    stickyFooter,
}: ConfirmDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const triggerRef = useRef<HTMLElement | null>(null);
    const uid = useId();
    const titleId = `${uid}-title`;
    const descId = `${uid}-desc`;

    useEffect(() => (isOpen ? lockPageScroll() : undefined), [isOpen]);

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
            if (e.target !== dialog || isBusy) return;
            const rect = dialog.getBoundingClientRect();
            if (
                e.clientX < rect.left ||
                e.clientX > rect.right ||
                e.clientY < rect.top ||
                e.clientY > rect.bottom
            ) {
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
            data-lenis-prevent="true"
            style={maxWidth ? { maxWidth } : undefined}
            className={styles.dialog}
            data-sticky-footer={stickyFooter || undefined}
            data-danger={isDanger || undefined}
            role={isDanger ? "alertdialog" : "dialog"}
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
        >
            <div className={styles.content}>
                <div className={styles.header}>
                    <h2 id={titleId} className={`${styles.title} ${isDanger ? styles.titleDanger : ''}`}>{title}</h2>
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
                {description && <p id={descId} className={styles.description}>{description}</p>}
                
                {children && <div className={styles.body}>{children}</div>}

                {error && (
                    <p role="alert" className={styles.errorBanner}>
                        {error}
                    </p>
                )}

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
                        data-focus-inverse
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
