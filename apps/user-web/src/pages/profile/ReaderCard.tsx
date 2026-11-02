import type { ReactNode } from 'react';
import { useSession } from '../../hooks/useSession';
import { ProfileReputation } from './ProfileReputation';
import styles from './ReaderCard.module.css';

const statusLabels = { ACTIVE: 'Đang hoạt động', RESTRICTED: 'Hạn chế giao dịch', LOCKED: 'Đang khóa giao dịch' };

export function ReaderCard({ ownerId, name, avatar, status }: {
  ownerId: string; name: string; avatar?: ReactNode; status?: ReactNode;
}) {
  const auth = useSession();
  if (auth.status !== 'authenticated' || auth.user.id !== ownerId) return null;
  return <section className={styles.card} aria-label="Thẻ bạn đọc Lật Lại">
    <div className={styles.avatar}>{avatar ?? <span className={styles.initial} aria-hidden="true">{Array.from(name.trim())[0]?.toLocaleUpperCase('vi-VN') || 'L'}</span>}</div>
    <div className={styles.identity}>
      <h2 id="profile-display-name">{name}</h2>
      {status ?? <span className={styles.status} data-status={auth.user.status}>{statusLabels[auth.user.status]}</span>}
    </div>
    <div className={styles.trust}><ProfileReputation ownerId={ownerId} tone="wine" compact /></div>
  </section>;
}
