import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, MessageSquarePlus, Clock, CheckCircle2 } from 'lucide-react';
import type { ExchangeDetail } from '../../../lib/mock/exchangeDetail';
import {
    getExchangeReviews,
    createExchangeReview,
    type CreateExchangeReviewInput,
    type ExchangeReviewItem,
} from '../../../services/reviews';
import { ReviewDialog } from '../ReviewDialog';
import styles from './ReviewCard.module.css';

interface ReviewCardProps {
    detail: ExchangeDetail;
}

function formatDate(isoString: string): string {
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    } catch {
        return isoString;
    }
}

function StarsRating({ score }: { score: number }) {
    return (
        <span className={styles.stars}>
            {[1, 2, 3, 4, 5].map((s) => (
                <Star
                    key={s}
                    size={14}
                    fill={s <= score ? 'currentColor' : 'none'}
                    stroke="currentColor"
                />
            ))}
        </span>
    );
}

function ReviewItemBox({
    review,
    isSelf,
    fallbackAuthorName,
}: {
    review: ExchangeReviewItem;
    isSelf: boolean;
    fallbackAuthorName: string;
}) {
    return (
        <div className={styles.reviewItem}>
            <div className={styles.reviewHeader}>
                <div>
                    <h4 className={styles.authorName}>
                        {isSelf ? 'Đánh giá của bạn' : review.authorName || `@${fallbackAuthorName}`}
                    </h4>
                    <span className={styles.reviewDate}>{formatDate(review.createdAt)}</span>
                </div>
                <span className={styles.authorRole}>{isSelf ? 'Bạn' : 'Đối tác'}</span>
            </div>

            <div className={styles.ratingsRow}>
                <div className={styles.ratingScore}>
                    <span>Chất lượng sách:</span>
                    <StarsRating score={review.bookRating} />
                    <strong>{review.bookRating}/5</strong>
                </div>
                <div className={styles.ratingScore}>
                    <span>Đối tác:</span>
                    <StarsRating score={review.partnerRating} />
                    <strong>{review.partnerRating}/5</strong>
                </div>
            </div>

            {review.tags && review.tags.length > 0 && (
                <div className={styles.tagsList}>
                    {review.tags.map((tag) => (
                        <span key={tag} className={styles.tagBadge}>
                            ✓ {tag}
                        </span>
                    ))}
                </div>
            )}

            {review.comment && <p className={styles.commentText}>"{review.comment}"</p>}
        </div>
    );
}

export function ReviewCard({ detail }: ReviewCardProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const queryClient = useQueryClient();

    const {
        data: reviewsData,
        isLoading,
        isError,
    } = useQuery({
        queryKey: ['exchangeReviews', detail.id],
        queryFn: () => getExchangeReviews(detail.id),
        enabled: !!detail.id && detail.status === 'COMPLETED',
        staleTime: 10000,
    });

    const mutation = useMutation({
        mutationFn: (input: CreateExchangeReviewInput) => createExchangeReview(detail.id, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['exchangeReviews', detail.id] });
        },
    });

    if (isLoading) {
        return (
            <div className={styles.card}>
                <p className={styles.subtitle}>Đang tải thông tin đánh giá...</p>
            </div>
        );
    }

    if (isError || !reviewsData) {
        return null;
    }

    const { canReview, deadline, myReview, partnerReview } = reviewsData;

    return (
        <div className={styles.card}>
            <div className={styles.cardHeader}>
                <div className={styles.headerLeft}>
                    <div className={styles.iconCircle}>
                        <Star size={20} />
                    </div>
                    <div>
                        <h3 className={styles.title}>Đánh giá & Nhận xét</h3>
                        <p className={styles.subtitle}>
                            Phản hồi về chất lượng sách và mức độ tin cậy giữa hai bên trao đổi
                        </p>
                    </div>
                </div>

                {canReview && (
                    <button
                        type="button"
                        className={styles.btnWriteReview}
                        onClick={() => setDialogOpen(true)}
                    >
                        <MessageSquarePlus size={16} />
                        Đánh giá đối tác
                    </button>
                )}
            </div>

            {/* Prompt banner if eligible and hasn't reviewed yet */}
            {canReview && (
                <div className={styles.promptBanner}>
                    <div className={styles.promptText}>
                        <strong>Giao dịch trao đổi đã hoàn tất thành công!</strong>
                        <br />
                        Hãy dành chút thời gian chia sẻ cảm nhận về sách nhận được và đối tác @{detail.partner.username}.
                        Đánh giá của bạn sẽ giúp xây dựng cộng đồng bạn đọc uy tín, minh bạch.
                    </div>
                    <button
                        type="button"
                        className={styles.btnWriteReview}
                        onClick={() => setDialogOpen(true)}
                    >
                        Viết đánh giá
                    </button>
                </div>
            )}

            {/* Reviews display grid */}
            <div className={styles.reviewsGrid}>
                {myReview ? (
                    <ReviewItemBox
                        review={myReview}
                        isSelf={true}
                        fallbackAuthorName={detail.viewer.username}
                    />
                ) : (
                    <div className={styles.pendingPartnerBox}>
                        <Clock size={24} />
                        <strong>Bạn chưa gửi đánh giá</strong>
                        <span>
                            {canReview
                                ? 'Bấm "Viết đánh giá" để gửi nhận xét cho đối tác.'
                                : 'Đã quá hạn 7 ngày gửi đánh giá theo quy định.'}
                        </span>
                    </div>
                )}

                {partnerReview ? (
                    <ReviewItemBox
                        review={partnerReview}
                        isSelf={false}
                        fallbackAuthorName={detail.partner.username}
                    />
                ) : (
                    <div className={styles.pendingPartnerBox}>
                        <CheckCircle2 size={24} />
                        <strong>Chưa hiển thị đánh giá từ @{detail.partner.username}</strong>
                        <span>
                            Theo quy tắc bảo mật FR-R03, nhận xét của đối tác chỉ được tiết lộ sau khi cả 2 bên
                            cùng gửi đánh giá hoặc sau 7 ngày kết thúc giao dịch.
                        </span>
                    </div>
                )}
            </div>

            {deadline && (
                <div className={styles.deadlineNote}>
                    Thời hạn đánh giá (POL-18): trước {formatDate(deadline)} (168 giờ kể từ khi hoàn tất).
                </div>
            )}

            <ReviewDialog
                isOpen={dialogOpen}
                onClose={() => setDialogOpen(false)}
                onSubmit={async (data) => {
                    await mutation.mutateAsync(data);
                }}
                partnerName={detail.partner.username}
                isBusy={mutation.isPending}
            />
        </div>
    );
}
