import { SupportLink } from '../support/SupportLink';
import type { MemberReputation, TransactionReview } from '@used-books/session-client';
import { ApiError, memberReputationSchema } from '@used-books/session-client';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  MessageSquare,
  RefreshCw,
  Star,
  CheckCircle2,
  ShieldCheck,
  Award,
  Bookmark,
} from 'lucide-react';
import { session } from '../../lib/session';
import { reviewDate } from './format';
import { useCurrentMemberAvatar } from '../../hooks/useCurrentMemberAvatar';
import { useSession } from '../../hooks/useSession';
import styles from '../../pages/MemberReputationPage.module.css';

const count = (value: number) => value.toLocaleString('vi-VN');
const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(-2).map((word) => word[0]).join('').toLocaleUpperCase('vi-VN');

const transactionLabels: Record<string, string> = {
  Exchange: 'Trao đổi sách',
  DirectOrder: 'Mua bán trực tiếp',
  PointOrder: 'Đơn đấu giá',
};

function Stars({ value }: { value: number }) {
  const icons = Array.from({ length: 5 }, (_, i) => <Star key={i} size={15} />);
  return (
    <span className={styles.stars} aria-hidden="true">
      <span>{icons}</span>
      <span
        className={styles.filledStars}
        style={{ clipPath: `inset(0 ${100 - value * 20}% 0 0)` }}
      >
        {icons}
      </span>
    </span>
  );
}

function PublicReview({
  review,
  memberName,
}: {
  review: TransactionReview;
  memberName: string;
}) {
  return (
    <article className={styles.review} aria-label={`Đánh giá của ${review.authorName}`}>
      <header className={styles.reviewHeader}>
        <div className={styles.authorLeft}>
          <span className={styles.authorInitial} aria-hidden="true">
            {initials(review.authorName)}
          </span>
          <div className={styles.authorMeta}>
            <div className={styles.authorTopRow}>
              <h3 className={styles.authorName}>
                <Link to={`/members/${review.authorId}`}>{review.authorName}</Link>
              </h3>
              <span className={styles.typeBadgePill}>
                {transactionLabels[review.transactionType] || 'Giao dịch'}
              </span>
            </div>
          </div>
        </div>

        <time dateTime={review.createdAt} className={styles.reviewDate}>
          {reviewDate(review.createdAt)}
        </time>
      </header>

      <div className={styles.reviewScoresStrip}>
        <div className={styles.scoreSegment}>
          <span className={styles.scoreSegmentLabel}>Đối tác:</span>
          <Stars value={review.partnerRating} />
          <strong>{review.partnerRating}/5</strong>
        </div>
        {review.bookRating !== null && (
          <>
            <span className={styles.scoreDivider} aria-hidden="true">•</span>
            <div className={styles.scoreSegment}>
              <span className={styles.scoreSegmentLabel}>Chất lượng sách:</span>
              <Stars value={review.bookRating} />
              <strong>{review.bookRating}/5</strong>
            </div>
          </>
        )}
      </div>

      {review.comment ? (
        <p className={styles.comment}>{review.comment}</p>
      ) : (
        <p className={styles.muted}>Người đọc chỉ chấm điểm, không để lại nhận xét.</p>
      )}

      {review.tags.length > 0 && (
        <ul className={styles.tags} aria-label="Nội dung được đánh giá">
          {review.tags.map((tag, i) => (
            <li key={`${tag}:${i}`}>{tag}</li>
          ))}
        </ul>
      )}

      <div className={styles.reportAction}><SupportLink type="Review" id={review.id} report /></div>
      {review.reply?.status === 'Approved' && (
        <section className={styles.reply} aria-label={`Phản hồi từ ${memberName}`}>
          <h4>Phản hồi từ {memberName}</h4>
          <p>{review.reply.text}</p>
          <time dateTime={review.reply.createdAt}>{reviewDate(review.reply.createdAt)}</time>
        </section>
      )}
    </article>
  );
}

export interface MemberReputationViewProps {
  memberId: string;
  isOwnerView?: boolean;
}

export function MemberReputationView({
  memberId,
  isOwnerView = false,
}: MemberReputationViewProps) {
  const auth = useSession();
  const currentAvatar = useCurrentMemberAvatar();
  const isSelf = auth.status === 'authenticated' && auth.user.id === memberId;

  const result = useInfiniteQuery({
    queryKey: ['memberReputation', 'public', memberId],
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p: MemberReputation) => p.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      session.publicRequest(
        `/members/${encodeURIComponent(memberId)}/reputation?limit=10${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        memberReputationSchema,
      ),
    enabled: !!memberId,
    retry: false,
  });

  const unavailable =
    result.error instanceof ApiError && [403, 404].includes(result.error.status);
  const data = unavailable ? undefined : result.data?.pages[0];
  const reviews = result.data?.pages.flatMap((page) => page.items) ?? [];

  const showAvatar = isOwnerView && currentAvatar.avatarUrl;

  return (
    <div className={`${styles.page} ${isOwnerView ? styles.dashboardView : ''}`}>
      {!isOwnerView && (
        <nav className={styles.breadcrumb} aria-label="Điều hướng hồ sơ">
          {isSelf ? (
            <Link to="/reviews">
              <ArrowLeft size={16} aria-hidden="true" />
              Quay lại Đánh giá của tôi
            </Link>
          ) : (
            <Link to="/books">
              <ArrowLeft size={16} aria-hidden="true" />
              Quay lại Sàn sách
            </Link>
          )}
          <span>Hồ sơ uy tín</span>
        </nav>
      )}

      {!data && result.isPending && (
        <section
          className={styles.loading}
          role="status"
          aria-label="Đang tải hồ sơ uy tín"
        >
          <h1>Đang mở hồ sơ người đọc…</h1>
          <div className={styles.skeletonIdentity} />
          <div className={styles.skeletonSummary} />
          <div className={styles.skeletonReview} />
        </section>
      )}

      {!data && result.isError && (
        <section className={styles.state} role="alert">
          <BookOpen size={30} aria-hidden="true" />
          <h1>
            {unavailable
              ? 'Chưa tìm thấy hồ sơ này'
              : 'Chưa tải được hồ sơ uy tín'}
          </h1>
          <p>
            {unavailable
              ? 'Hồ sơ hiện không công khai hoặc không còn tồn tại.'
              : 'Kết nối đang gặp sự cố. Thử tải lại để xem đúng điểm và nhận xét của người đọc.'}
          </p>
          {!unavailable && (
            <button
              type="button"
              className={styles.button}
              disabled={result.isFetching}
              onClick={() => void result.refetch()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              {result.isFetching ? 'Đang tải lại…' : 'Thử lại'}
            </button>
          )}
        </section>
      )}

      {data && (
        <>
          <section
            className={styles.profile}
            aria-label={`Hồ sơ uy tín của ${data.displayName}`}
          >
            {/* Vintage Watermark Medallion */}
            <div className={styles.passportSeal} aria-hidden="true">
              <div className={styles.sealRing}>
                <div className={styles.sealInner}>
                  <Award size={22} className={styles.sealMedal} />
                  <span className={styles.sealLabel}>LẬT LẠI</span>
                  <span className={styles.sealStatus}>BẠN ĐỌC</span>
                </div>
              </div>
            </div>

            <div className={styles.profileMain}>
              <div className={styles.profileHeaderRow}>
                <div className={styles.identity}>
                  <div className={styles.avatarWrap}>
                    {showAvatar ? (
                      <img
                        src={currentAvatar.avatarUrl!}
                        alt={data.displayName}
                        className={styles.avatarImg}
                        onError={currentAvatar.onImageError}
                      />
                    ) : (
                      <span className={styles.initial} aria-hidden="true">
                        {initials(data.displayName)}
                      </span>
                    )}
                  </div>
                  <div className={styles.identityText}>
                    <div className={styles.nameRow}>
                      <h1>{data.displayName}</h1>
                    </div>
                    <div className={styles.badgesRow}>
                      <span className={styles.badgeGold}>
                        <Award size={12} aria-hidden="true" />
                        Thành viên Lật lại
                      </span>
                      {data.verifiedViolations === 0 && (
                        <span className={styles.badgeEmerald}>
                          <ShieldCheck size={12} aria-hidden="true" />
                          0 vi phạm đã xác minh
                        </span>
                      )}
                      <span className={styles.memberTag}>Thành viên Bạn đọc</span>
                    </div>
                    <p className={styles.identitySub}>
                      {isOwnerView
                        ? 'Hồ sơ uy tín của bạn trên cộng đồng Lật Lại'
                        : 'Hồ sơ uy tín công khai của bạn đọc'}
                    </p>
                  </div>
                </div>

                {isOwnerView && (
                  <Link
                    to={`/members/${encodeURIComponent(memberId)}`}
                    className={styles.publicLinkBtn}
                    title="Xem hồ sơ công khai dưới góc nhìn của bạn đọc"
                  >
                    <span>Xem trang công khai</span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                )}
              </div>

              <div className={styles.scoresGrid}>
                <div className={styles.scoreCard}>
                  <div className={styles.scoreCardHeader}>
                    <div className={styles.scoreHeaderLeft}>
                      <div className={styles.scoreIconCircle}>
                        <Star size={16} className={styles.goldStarIcon} fill="currentColor" />
                      </div>
                      <dt>Điểm đối tác</dt>
                    </div>
                    {data.partnerRating !== null && data.partnerRating >= 4.5 && (
                      <span className={styles.scorePillRating}>Xuất sắc ✦</span>
                    )}
                  </div>
                  <dd>
                    {data.partnerRating === null ? (
                      <strong className={styles.noScore}>Chưa có điểm</strong>
                    ) : (
                      <div className={styles.scoreNumber}>
                        <strong>{data.partnerRating.toFixed(1)}</strong>
                        <span className={styles.maxScore}>/5</span>
                        <div className={styles.starsWrapper}>
                          <Stars value={data.partnerRating} />
                        </div>
                      </div>
                    )}
                    <span className={styles.samples}>
                      {data.partnerRatingCount
                        ? `Từ ${count(data.partnerRatingCount)} đánh giá đã công bố`
                        : 'Chưa có lượt đánh giá'}
                    </span>
                  </dd>
                </div>

                <div className={styles.scoreCard}>
                  <div className={styles.scoreCardHeader}>
                    <div className={styles.scoreHeaderLeft}>
                      <div className={`${styles.scoreIconCircle} ${styles.bookIconCircle}`}>
                        <BookOpen size={16} className={styles.bookIcon} />
                      </div>
                      <dt>Chất lượng sách đã cung cấp</dt>
                    </div>
                    {data.bookRating !== null && data.bookRating >= 4.0 && (
                      <span className={styles.scorePillRating}>Giữ sách tốt ✦</span>
                    )}
                  </div>
                  <dd>
                    {data.bookRating === null ? (
                      <strong className={styles.noScore}>Chưa có điểm</strong>
                    ) : (
                      <div className={styles.scoreNumber}>
                        <strong>{data.bookRating.toFixed(1)}</strong>
                        <span className={styles.maxScore}>/5</span>
                        <div className={styles.starsWrapper}>
                          <Stars value={data.bookRating} />
                        </div>
                      </div>
                    )}
                    <span className={styles.samples}>
                      {data.bookRatingCount
                        ? `Từ ${count(data.bookRatingCount)} đánh giá đã công bố`
                        : 'Chưa có lượt đánh giá'}
                    </span>
                  </dd>
                </div>
              </div>
            </div>

            <div className={styles.profileFoot}>
              <dl className={styles.facts}>
                <div className={styles.factItem}>
                  <CheckCircle2 size={16} className={styles.factCheckIcon} />
                  <dt>Giao dịch hoàn tất</dt>
                  <dd>{count(data.completedTransactions)}</dd>
                </div>
                <div className={styles.factDivider} />
                <div className={styles.factItem}>
                  <ShieldCheck size={16} className={styles.factShieldIcon} />
                  <dt>Vi phạm xác minh</dt>
                  <dd className={styles.factClean}>
                    {data.verifiedViolations === 0
                      ? '0'
                      : `${count(data.verifiedViolations)} vi phạm`}
                  </dd>
                </div>
              </dl>
              <p className={styles.trustMotto}>
                Uy tín được ghi nhận minh bạch qua từng lần giao dịch trên hệ thống.
              </p>
            </div>
          </section>

          {result.isRefetchError && (
            <div className={styles.notice} role="alert">
              <p>Chưa cập nhật được hồ sơ. Bạn đang xem thông tin đã tải trước đó.</p>
              <button
                type="button"
                className={styles.textButton}
                disabled={result.isFetching}
                onClick={() => void result.refetch()}
              >
                Tải lại hồ sơ
              </button>
            </div>
          )}

          <div className={styles.content}>
            <section
              className={styles.reviews}
              aria-labelledby="public-reviews-title"
            >
              <div className={styles.sectionHeader}>
                <div>
                  <h2 id="public-reviews-title">
                    Nhận xét từ người đọc{' '}
                    <span className={styles.reviewCounter}>
                      {count(data.reviewCount)}
                    </span>
                  </h2>
                  <p>Trải nghiệm thực tế từ các giao dịch đã hoàn tất.</p>
                </div>
                {reviews.length > 0 && (
                  <span className={styles.order}>Mới nhất trước</span>
                )}
              </div>

              {data.reviewCount === 0 && (
                <div className={styles.empty}>
                  <MessageSquare size={28} aria-hidden="true" />
                  <h3>Chưa có nhận xét công khai</h3>
                  <p>
                    Điểm và nhận xét sẽ xuất hiện khi đánh giá đủ điều kiện công
                    bố. Giao dịch hoàn tất chưa đồng nghĩa đã có đánh giá.
                  </p>
                </div>
              )}

              <div className={styles.reviewList}>
                {reviews.map((review) => (
                  <PublicReview
                    key={review.id}
                    review={review}
                    memberName={data.displayName}
                  />
                ))}
              </div>

              {result.isFetchNextPageError && (
                <p className={styles.notice} role="alert">
                  Chưa tải được các nhận xét tiếp theo. Những nhận xét đã mở vẫn
                  được giữ bên trên.
                </p>
              )}

              {result.hasNextPage && (
                <div className={styles.loadMore}>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={result.isFetching}
                    aria-busy={result.isFetchingNextPage}
                    onClick={() => void result.fetchNextPage()}
                  >
                    {result.isFetchingNextPage
                      ? 'Đang tải thêm…'
                      : result.isFetchNextPageError
                        ? 'Thử tải thêm lần nữa'
                        : 'Xem thêm đánh giá'}
                  </button>
                </div>
              )}
            </section>

            <aside className={styles.guideCard} aria-labelledby="reputation-guide-title">
              <div className={styles.guideHeader}>
                <Bookmark size={18} className={styles.guideIcon} aria-hidden="true" />
                <h2 id="reputation-guide-title">Quy ước uy tín Bạn đọc</h2>
              </div>
              <div className={styles.guideBody}>
                <dl className={styles.guideList}>
                  <div className={styles.guideItem}>
                    <dt>
                      <span className={styles.guideBullet} aria-hidden="true" />
                      Điểm đối tác
                    </dt>
                    <dd>Phản ánh mức độ tin cậy, giao tiếp văn minh và đúng hẹn trong quá trình giao dịch.</dd>
                  </div>
                  <div className={styles.guideItem}>
                    <dt>
                      <span className={styles.guideBullet} aria-hidden="true" />
                      Chất lượng sách
                    </dt>
                    <dd>
                      Phản ánh độ trung thực khi mô tả tình trạng sách (gáy, bìa, trang ruột), không chấm nội dung văn học.
                    </dd>
                  </div>
                </dl>
                <details className={styles.guideDetails}>
                  <summary>Quy chế tính điểm & minh bạch ✦</summary>
                  <p>
                    Điểm số là trung bình cộng số học của các đánh giá hợp lệ từ đối tác đã hoàn tất giao dịch.
                  </p>
                  <p>
                    Chỉ tính đánh giá đã công bố, chưa bị ẩn hoặc xóa. Khiếu nại chưa kết luận không được tính là vi phạm.
                  </p>
                </details>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
