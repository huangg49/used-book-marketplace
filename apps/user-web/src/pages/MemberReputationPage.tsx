import type { MemberReputation, TransactionReview } from '@used-books/session-client';
import { ApiError, memberReputationSchema } from '@used-books/session-client';
import { Link, useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, BookOpen, MessageSquare, RefreshCw, Star } from 'lucide-react';
import { session } from '../lib/session';
import { reviewDate } from '../features/reviews/format';
import { SupportLink } from '../features/support/SupportLink';
import styles from './MemberReputationPage.module.css';

const count = (value: number) => value.toLocaleString('vi-VN');
const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(-2).map(word => word[0]).join('').toLocaleUpperCase('vi-VN');
const transactionLabels = { Exchange: 'Trao đổi sách', DirectOrder: 'Mua bán trực tiếp', PointOrder: 'Đơn đấu giá' };

function Stars({ value }: { value: number }) {
  const icons = Array.from({ length: 5 }, (_, i) => <Star key={i} size={16} />);
  return <span className={styles.stars} aria-hidden="true">
    <span>{icons}</span>
    <span className={styles.filledStars} style={{ clipPath: `inset(0 ${100 - value * 20}% 0 0)` }}>{icons}</span>
  </span>;
}

function Score({ title, value, samples }: { title: string; value: number | null; samples: number }) {
  return <div className={styles.score}>
    <dt>{title}</dt>
    <dd>
      {value === null ? <strong className={styles.noScore}>Chưa có điểm</strong> : <>
        <div className={styles.scoreNumber}><strong>{value.toFixed(1)}</strong><span>/5</span></div>
        <Stars value={value} />
      </>}
      <span className={styles.samples}>{samples ? `Từ ${count(samples)} đánh giá` : 'Chưa có lượt đánh giá'}</span>
    </dd>
  </div>;
}

function PublicReview({ review, memberName }: { review: TransactionReview; memberName: string }) {
  return <article className={styles.review} aria-label={`Đánh giá của ${review.authorName}`}>
    <header className={styles.reviewHeader}>
      <span className={styles.authorInitial} aria-hidden="true">{initials(review.authorName)}</span>
      <div className={styles.author}>
        <h3><Link to={`/members/${review.authorId}`}>{review.authorName}</Link></h3>
        <p>{transactionLabels[review.transactionType]}<span aria-hidden="true"> · </span><time dateTime={review.createdAt}>{reviewDate(review.createdAt)}</time></p>
      </div>
    </header>
    <dl className={styles.reviewScores}>
      <div><dt>Đối tác</dt><dd><Stars value={review.partnerRating} /><strong>{review.partnerRating}/5</strong></dd></div>
      {review.bookRating !== null && <div><dt>Chất lượng sách</dt><dd><Stars value={review.bookRating} /><strong>{review.bookRating}/5</strong></dd></div>}
    </dl>
    {review.comment ? <p className={styles.comment}>{review.comment}</p> : <p className={styles.muted}>Người đọc chỉ chấm điểm, không để lại nhận xét.</p>}
    {review.tags.length > 0 && <ul className={styles.tags} aria-label="Nội dung được đánh giá">{review.tags.map((tag, i) => <li key={`${tag}:${i}`}>{tag}</li>)}</ul>}
    {review.reply?.status === 'Approved' && <section className={styles.reply} aria-label={`Phản hồi từ ${memberName}`}>
      <h4>Phản hồi từ {memberName}</h4>
      <p>{review.reply.text}</p>
      <time dateTime={review.reply.createdAt}>{reviewDate(review.reply.createdAt)}</time>
    </section>}
    <div className={styles.reportAction}><SupportLink type="Review" id={review.id} report /></div>
  </article>;
}

export function MemberReputationPage() {
  const { id } = useParams();
  const result = useInfiniteQuery({
    queryKey: ['memberReputation', 'public', id],
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p: MemberReputation) => p.nextCursor ?? undefined,
    queryFn: ({ pageParam }) => session.publicRequest(
      `/members/${encodeURIComponent(id ?? '')}/reputation?limit=10${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      memberReputationSchema,
    ),
    enabled: !!id,
    retry: false,
  });
  const unavailable = result.error instanceof ApiError && [403, 404].includes(result.error.status);
  const data = unavailable ? undefined : result.data?.pages[0];
  const reviews = result.data?.pages.flatMap(page => page.items) ?? [];

  return <div className={styles.page}>
    <nav className={styles.breadcrumb} aria-label="Điều hướng hồ sơ">
      <Link to="/books"><ArrowLeft size={16} aria-hidden="true" />Về kệ sách</Link>
      <span>Hồ sơ uy tín</span>
    </nav>

    {!data && result.isPending && <section className={styles.loading} role="status" aria-label="Đang tải hồ sơ uy tín">
      <h1>Đang mở hồ sơ người đọc…</h1>
      <div className={styles.skeletonIdentity} /><div className={styles.skeletonSummary} /><div className={styles.skeletonReview} />
    </section>}

    {!data && result.isError && <section className={styles.state} role="alert">
      <BookOpen size={30} aria-hidden="true" />
      <h1>{unavailable ? 'Chưa tìm thấy hồ sơ này' : 'Chưa tải được hồ sơ uy tín'}</h1>
      <p>{unavailable ? 'Hồ sơ hiện không công khai hoặc không còn tồn tại. Bạn có thể trở về kệ sách để tiếp tục tìm đọc.' : 'Kết nối đang gặp sự cố. Thử tải lại để xem đúng điểm và nhận xét của người đọc.'}</p>
      {!unavailable && <button type="button" className={styles.button} disabled={result.isFetching} onClick={() => void result.refetch()}><RefreshCw size={16} aria-hidden="true" />{result.isFetching ? 'Đang tải lại…' : 'Thử lại'}</button>}
      <Link to="/books">Tìm sách trên kệ<ArrowUpRight size={16} aria-hidden="true" /></Link>
    </section>}

    {data && <>
      <section className={styles.profile} aria-label={`Hồ sơ uy tín của ${data.displayName}`}>
        <div className={styles.profileMain}>
          <div className={styles.identity}>
            <span className={styles.initial} aria-hidden="true">{initials(data.displayName)}</span>
            <div><h1>{data.displayName}</h1><p>Hồ sơ uy tín công khai</p></div>
          </div>
          <dl className={styles.scores}>
            <Score title="Điểm đối tác" value={data.partnerRating} samples={data.partnerRatingCount} />
            <Score title="Chất lượng sách đã cung cấp" value={data.bookRating} samples={data.bookRatingCount} />
          </dl>
        </div>
        <div className={styles.profileFoot}>
          <dl className={styles.facts}>
            <div><dt>Giao dịch hoàn tất</dt><dd>{count(data.completedTransactions)}</dd></div>
            <div><dt>Vi phạm đã xác minh</dt><dd>{count(data.verifiedViolations)}</dd></div>
          </dl>
          <p>Uy tín được ghi lại qua từng lần chuyền sách.</p>
        </div>
      </section>

      {result.isRefetchError && <div className={styles.notice} role="alert">
        <p>Chưa cập nhật được hồ sơ. Bạn đang xem thông tin đã tải trước đó.</p>
        <button type="button" className={styles.textButton} disabled={result.isFetching} onClick={() => void result.refetch()}>Tải lại hồ sơ</button>
      </div>}

      <div className={styles.content}>
        <section className={styles.reviews} aria-labelledby="public-reviews-title">
          <div className={styles.sectionHeader}>
            <div><h2 id="public-reviews-title">Nhận xét từ người đọc <span>{count(data.reviewCount)}</span></h2><p>Trải nghiệm từ những giao dịch đã hoàn tất.</p></div>
            {reviews.length > 0 && <span className={styles.order}>Mới nhất trước</span>}
          </div>
          {data.reviewCount === 0 && <div className={styles.empty}>
            <MessageSquare size={28} aria-hidden="true" />
            <h3>Chưa có nhận xét công khai</h3>
            <p>Điểm và nhận xét sẽ xuất hiện khi đánh giá đủ điều kiện công bố. Giao dịch hoàn tất chưa đồng nghĩa đã có đánh giá.</p>
          </div>}
          <div className={styles.reviewList}>{reviews.map(review => <PublicReview key={review.id} review={review} memberName={data.displayName} />)}</div>
          {result.isFetchNextPageError && <p className={styles.notice} role="alert">Chưa tải được các nhận xét tiếp theo. Những nhận xét đã mở vẫn được giữ bên trên.</p>}
          {result.hasNextPage && <div className={styles.loadMore}>
            <button type="button" className={styles.button} disabled={result.isFetching} aria-busy={result.isFetchingNextPage} onClick={() => void result.fetchNextPage()}>
              {result.isFetchingNextPage ? 'Đang tải thêm…' : result.isFetchNextPageError ? 'Thử tải thêm lần nữa' : 'Xem thêm đánh giá'}
            </button>
          </div>}
        </section>

        <aside className={styles.guide} aria-labelledby="reputation-guide-title">
          <BookOpen size={24} aria-hidden="true" />
          <h2 id="reputation-guide-title">Hiểu đúng về uy tín</h2>
          <dl>
            <div><dt>Điểm đối tác</dt><dd>Phản ánh trải nghiệm giao dịch với người đọc này.</dd></div>
            <div><dt>Chất lượng sách</dt><dd>Phản ánh bản sách đã nhận, không chấm nội dung tác phẩm. Số lượt chấm sách có thể ít hơn số lượt chấm đối tác.</dd></div>
          </dl>
          <details><summary>Cách tính điểm và công bố</summary><p>Điểm là trung bình cộng của các đánh giá đã công bố, chưa bị ẩn hoặc xóa. Mỗi đánh giá chỉ được tính một lần.</p><p>Đánh giá không hài lòng và khiếu nại chưa kết luận không tự trở thành vi phạm đã xác minh.</p></details>
          <div className={styles.guideAction}><SupportLink type="Member" id={id!} report /></div>
        </aside>
      </div>
    </>}
  </div>;
}
