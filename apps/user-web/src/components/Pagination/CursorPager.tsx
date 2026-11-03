import { Pagination } from './Pagination';
import type { useCursorNavigation } from './useCursorNavigation';
import styles from './CollectionPager.module.css';

export function CursorPager({ navigation, nextCursor, busy, count, label, itemLabel = 'mục', onDirection }: {
  navigation: ReturnType<typeof useCursorNavigation>;
  nextCursor?: string | null;
  busy: boolean;
  count?: number;
  label: string;
  itemLabel?: string;
  onDirection?: (direction: number) => void;
}) {
  if (!navigation.cursor && !nextCursor) return null;
  return <div className={styles.footer}><Pagination
    page={navigation.page} variant="simple" ariaLabel={label}
    pageLabel={navigation.knownPage ? undefined : 'Trang hiện tại'}
    showSummary={count !== undefined}
    summaryOverride={count !== undefined ? `${count} ${itemLabel} trên trang này` : undefined}
    hasPrev={!!navigation.cursor} hasNext={!!nextCursor} isLoading={busy}
    previousLabel={navigation.knownPage ? undefined : 'Về đầu'}
    onPageChange={next => {
      if (next < navigation.page) { onDirection?.(-1); navigation.previous(); }
      else if (nextCursor) { onDirection?.(1); navigation.next(nextCursor); }
    }}
  /></div>;
}
