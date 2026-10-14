import { useState } from 'react';
import { Star, X } from 'lucide-react';
import type { CreateExchangeReviewInput } from '../../../services/reviews';
import styles from './ReviewDialog.module.css';

interface ReviewDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: CreateExchangeReviewInput) => Promise<void>;
    partnerName: string;
    isBusy: boolean;
}

const RATING_LABELS = ['', 'Rất tệ', 'Tạm được', 'Hài lòng', 'Rất tốt', 'Xuất sắc'];

const SUGGESTED_TAGS = [
    'Sách đúng mô tả',
    'Đóng gói cẩn thận',
    'Giao sách đúng hẹn',
    'Giao tiếp lịch sự',
    'Rất đáng tin cậy',
    'Sách sạch đẹp',
];

export function ReviewDialog({
    isOpen,
    onClose,
    onSubmit,
    partnerName,
    isBusy,
}: ReviewDialogProps) {
    const [bookRating, setBookRating] = useState(5);
    const [partnerRating, setPartnerRating] = useState(5);
    const [selectedTags, setSelectedTags] = useState<string[]>([
        'Sách đúng mô tả',
        'Đóng gói cẩn thận',
    ]);
    const [comment, setComment] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const toggleTag = (tag: string) => {
        if (selectedTags.includes(tag)) {
            setSelectedTags(selectedTags.filter((t) => t !== tag));
        } else {
            setSelectedTags([...selectedTags, tag]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await onSubmit({
                bookRating,
                partnerRating,
                tags: selectedTags,
                comment: comment.trim() || undefined,
            });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Có lỗi khi gửi đánh giá.');
        }
    };

    return (
        <div className={styles.overlay} onClick={isBusy ? undefined : onClose} role="dialog" aria-modal="true">
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.headerIcon}>
                            <Star size={20} />
                        </div>
                        <div>
                            <h2 className={styles.title}>Đánh giá giao dịch</h2>
                            <p className={styles.subtitle}>Gửi phản hồi cho @{partnerName}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        disabled={isBusy}
                        aria-label="Đóng"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    {/* Book Condition Rating */}
                    <div className={styles.ratingGroup}>
                        <div className={styles.ratingHeader}>
                            <span className={styles.ratingLabel}>Chất lượng sách nhận được</span>
                            <span className={styles.ratingHint}>{RATING_LABELS[bookRating]}</span>
                        </div>
                        <div className={styles.starsRow}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    className={`${styles.starBtn} ${star <= bookRating ? styles.starActive : ''}`}
                                    onClick={() => setBookRating(star)}
                                    disabled={isBusy}
                                    title={`${star} sao`}
                                >
                                    <Star size={26} fill={star <= bookRating ? 'currentColor' : 'none'} />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Partner Attitude Rating */}
                    <div className={styles.ratingGroup}>
                        <div className={styles.ratingHeader}>
                            <span className={styles.ratingLabel}>Độ uy tín & thái độ của đối tác</span>
                            <span className={styles.ratingHint}>{RATING_LABELS[partnerRating]}</span>
                        </div>
                        <div className={styles.starsRow}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    className={`${styles.starBtn} ${star <= partnerRating ? styles.starActive : ''}`}
                                    onClick={() => setPartnerRating(star)}
                                    disabled={isBusy}
                                    title={`${star} sao`}
                                >
                                    <Star size={26} fill={star <= partnerRating ? 'currentColor' : 'none'} />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tags selector */}
                    <div className={styles.tagsGroup}>
                        <label className={styles.fieldLabel}>Điểm nổi bật của giao dịch</label>
                        <div className={styles.tagsGrid}>
                            {SUGGESTED_TAGS.map((tag) => {
                                const active = selectedTags.includes(tag);
                                return (
                                    <button
                                        key={tag}
                                        type="button"
                                        className={`${styles.tagPill} ${active ? styles.tagPillActive : ''}`}
                                        onClick={() => toggleTag(tag)}
                                        disabled={isBusy}
                                    >
                                        {active ? '✓ ' : '+ '}
                                        {tag}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Comment */}
                    <div className={styles.commentGroup}>
                        <label htmlFor="reviewComment" className={styles.fieldLabel}>
                            Nhận xét chi tiết (tùy chọn)
                        </label>
                        <textarea
                            id="reviewComment"
                            rows={3}
                            maxLength={1000}
                            className={styles.textarea}
                            placeholder="Ví dụ: Đối tác gửi sách rất nhanh, sách được bọc xốp cẩn thận không bị gập mép. Rất mong có dịp trao đổi thêm lần sau!"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            disabled={isBusy}
                        />
                        <span className={styles.charCount}>{comment.length}/1000</span>
                    </div>

                    {error && (
                        <div className={styles.errorMessage} role="alert">
                            {error}
                        </div>
                    )}

                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.btnCancel}
                            onClick={onClose}
                            disabled={isBusy}
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            className={styles.btnSubmit}
                            disabled={isBusy}
                        >
                            {isBusy ? 'Đang gửi...' : 'Gửi đánh giá'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
