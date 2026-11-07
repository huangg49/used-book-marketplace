import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@used-books/session-client';
import { getMyListing, listingActions } from '../services/my-listings';
import { useListingActions } from '../hooks/useListingActions';
import { useSession } from '../hooks/useSession';
import styles from './BookJourneyStates.module.css';

export function OwnerListingRecovery({ listingId, onArchived }: { listingId?: string; onArchived?: () => void }) {
  const auth = useSession();
  const owner = auth.status === 'authenticated' ? auth.user.id : undefined;
  const pending = useListingActions(listingId);
  const cache = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [feedback, setFeedback] = useState<{ identity: string; text: string; error?: boolean }>();
  const identity = listingActions.getIdentity();
  const visibleFeedback = feedback?.identity === identity ? feedback : undefined;
  const recoverable = pending.some(action => !action.busy);
  useEffect(() => {
    if (!recoverable || document.hidden) return;
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [recoverable]);
  async function retry(id: string, archive: boolean) {
    const original = listingActions.getIdentity();
    setFeedback(undefined);
    try {
      await listingActions.retry(id);
      await Promise.all(['my-listings', 'my-listing', 'listings'].map(key => cache.invalidateQueries({ queryKey: [key] })));
      if (!alive.current || listingActions.getIdentity() !== original) return;
      setFeedback({ identity: original, text: archive ? 'Đã xác minh bài đăng được gỡ khỏi kệ.' : 'Đã xác minh trạng thái hiển thị của bài đăng.' });
      if (archive) onArchived?.();
    } catch (error) {
      if (!alive.current || listingActions.getIdentity() !== original) return;
      setFeedback({ identity: original, error: true, text: error instanceof ApiError ? error.message
        : 'Chưa xác minh được kết quả. Kiểm tra kết nối rồi thử lại đúng thao tác đang chờ.' });
      if (error instanceof ApiError && error.status === 409)
        await cache.invalidateQueries({ queryKey: ['my-listings'] });
    }
  }
  async function reconcile(id: string) {
    const original = listingActions.getIdentity();
    setFeedback(undefined);
    let missing = false;
    try {
      await listingActions.reconcile(id, async () => {
        try { await getMyListing(id); }
        catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          missing = true;
        }
      });
      await Promise.all(['my-listings', 'my-listing', 'listings'].map(key => cache.invalidateQueries({ queryKey: [key] })));
      if (!alive.current || listingActions.getIdentity() !== original) return;
      setFeedback({ identity: original, text: missing
        ? 'Yêu cầu đã bị từ chối. Đã đối chiếu: bài đăng không còn truy cập được. Về kệ sách để kiểm tra.'
        : 'Yêu cầu đã bị từ chối. Đã tải lại trạng thái hiện tại; kiểm tra bài đăng trước khi chọn thao tác khác.' });
    } catch {
      if (!alive.current || listingActions.getIdentity() !== original) return;
      setFeedback({ identity: original, error: true, text: 'Chưa đọc lại được trạng thái bài đăng. Thao tác vẫn được giữ để đối chiếu; hãy thử lại khi kết nối ổn định.' });
    }
  }
  if (!owner || (!pending.length && !visibleFeedback)) return null;
  return (
    <section className={styles.filteredEmpty} aria-label="Xác minh thao tác bài đăng">
      <div className={styles.emptyMessage}>
        <h2 ref={heading} tabIndex={-1}>{pending.length ? 'Thao tác bài đăng đang chờ xác nhận' : 'Kết quả thao tác bài đăng'}</h2>
        {visibleFeedback && <p role={visibleFeedback.error ? 'alert' : 'status'}>{visibleFeedback.text}</p>}
        {pending.length > 0 && <p role="status">Xác minh hoặc đối chiếu thao tác trước khi đổi quyết định.</p>}
        {pending.map(action => {
          const label = action.kind === 'archive' ? 'Gỡ bài đăng' : action.visibility === 'Hidden' ? 'Tạm ẩn bài đăng' : 'Hiện lại bài đăng';
          return <div key={action.listingId}>
            <p>{label} · Mã {action.listingId.slice(0, 8).toUpperCase()}</p>
            {action.refused && <p role="status">Yêu cầu đã bị từ chối. Cần đọc lại trạng thái hiện tại; hệ thống không tự gửi một yêu cầu mới.</p>}
            <button type="button" disabled={action.busy} onClick={() => void (action.refused
              ? reconcile(action.listingId) : retry(action.listingId, action.kind === 'archive'))}>
              {action.busy ? 'Đang xác minh…' : action.refused ? 'Đối chiếu lại bài đăng' : 'Xác minh thao tác bài đăng'}
            </button>
          </div>;
        })}
        {visibleFeedback && !pending.length && <Link to="/my-books">Về kệ sách của tôi</Link>}
      </div>
    </section>
  );
}
