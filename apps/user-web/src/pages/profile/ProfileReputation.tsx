import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BookOpen, Star } from 'lucide-react';
import { ApiError, memberReputationSchema } from '@used-books/session-client';
import { session } from '../../lib/session';
import { useSession } from '../../hooks/useSession';
import styles from './ProfileReputation.module.css';

export function ProfileReputation({ ownerId, tone = 'paper', compact = false }: { ownerId: string; tone?: 'paper' | 'wine'; compact?: boolean }) {
  const auth = useSession();
  const current = auth.status === 'authenticated' && auth.user.id === ownerId;
  const result = useQuery({
    // The public profile uses an InfiniteQuery; never share its cache shape.
    queryKey: ['memberReputation', 'summary', ownerId],
    queryFn: () => session.publicRequest(`/members/${encodeURIComponent(ownerId)}/reputation?limit=1`, memberReputationSchema),
    enabled: current,
    retry: false,
  });
  if (!current) return null;
  const inaccessible = result.error instanceof ApiError && [401, 403, 404].includes(result.error.status);
  const data = inaccessible ? undefined : result.data;
  const count = (value: number) => value.toLocaleString('vi-VN');
  const sharedCount = compact && data?.partnerRatingCount === data?.bookRatingCount;
  const profileLink = <Link className={styles.profileLink} to={`/members/${ownerId}`}>Xem hồ sơ uy tín<ArrowUpRight size={15} aria-hidden="true" /></Link>;

  return <section className={styles.reputation} data-tone={tone} data-compact={compact} aria-label="Uy tín và đánh giá của bạn">
    {!compact && <header className={styles.header}>
      <h3><Star size={15} aria-hidden="true" />Uy tín của bạn</h3>
      {profileLink}
    </header>}
    {!data && result.isPending && <p className={styles.message} role="status">Đang tải điểm và đánh giá…</p>}
    {!data && result.isError && <div className={styles.feedback} role="alert">
      <p>{inaccessible ? 'Hồ sơ uy tín hiện chưa sẵn sàng.' : 'Chưa tải được điểm uy tín. Kiểm tra kết nối rồi thử lại.'}</p>
      <button type="button" disabled={result.isFetching} onClick={() => void result.refetch()}>{result.isFetching ? 'Đang tải…' : 'Thử tải lại uy tín'}</button>
    </div>}
    {data && <>
      <dl className={styles.scores}>
        <div>
          <dt>Điểm đối tác</dt>
          <dd>
            {data.partnerRating === null ? <strong className={styles.unrated}>Chưa có điểm</strong>
              : <span className={styles.score}><Star size={15} aria-hidden="true" /><strong>{data.partnerRating.toFixed(1)}</strong><span>/5</span></span>}
            {!sharedCount && <span className={styles.samples}>{count(data.partnerRatingCount)} lượt đánh giá</span>}
          </dd>
        </div>
        <div>
          <dt>Chất lượng sách</dt>
          <dd>
            {data.bookRating === null ? <strong className={styles.unrated}>Chưa có điểm</strong>
              : <span className={styles.score}><BookOpen size={15} aria-hidden="true" /><strong>{data.bookRating.toFixed(1)}</strong><span>/5</span></span>}
            {!sharedCount && <span className={styles.samples}>{count(data.bookRatingCount)} lượt đánh giá</span>}
          </dd>
        </div>
      </dl>
      {!compact && <p className={styles.history}>
        <span><strong>{count(data.completedTransactions)}</strong> giao dịch hoàn tất</span>
        <span><strong>{count(data.verifiedViolations)}</strong> vi phạm đã xác minh</span>
      </p>}
      {compact && data.verifiedViolations > 0 && <p className={styles.message}>{count(data.verifiedViolations)} vi phạm đã xác minh</p>}
      {!compact && data.reviewCount === 0 && <p className={styles.message}>Chưa có đánh giá công khai. Điểm sẽ xuất hiện khi có nhận xét được công bố.</p>}
      {result.isError && <div className={styles.feedback} role="alert">
        <p>Chưa cập nhật được uy tín. Đang giữ số liệu đã tải.</p>
        <button type="button" disabled={result.isFetching} onClick={() => void result.refetch()}>Tải lại uy tín</button>
      </div>}
    </>}
    {compact && <footer className={styles.compactFooter}>
      {data && sharedCount && <span className={styles.samples}>{data.reviewCount ? `${count(data.partnerRatingCount)} đánh giá công khai` : 'Chưa có đánh giá công khai'}</span>}
      {profileLink}
    </footer>}
  </section>;
}
