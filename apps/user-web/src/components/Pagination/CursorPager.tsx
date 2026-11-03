import { Pagination } from './Pagination';
import type { useCursorNavigation } from './useCursorNavigation';
import styles from './CollectionPager.module.css';
import { usePaginationFocus } from './usePaginationFocus';

export function CursorPager({ navigation, nextCursor, busy, failed, count, label, itemLabel = 'mục', onDirection, anchorId }: {
  navigation: ReturnType<typeof useCursorNavigation>;
  nextCursor?: string | null;
  busy: boolean;
  failed?: boolean;
  count?: number;
  label: string;
  itemLabel?: string;
  onDirection?: (direction: number) => void;
  anchorId?: string;
}) {
  const requestFocus = usePaginationFocus(navigation.cursor, navigation.scope, anchorId, busy, failed);
  if (!navigation.cursor && !nextCursor) return null;
  return <div className={styles.footer}><Pagination
    page={navigation.page} variant="simple" ariaLabel={label}
    reachablePages={navigation.reachablePages}
    pageLabel={navigation.knownPage ? undefined : 'Trang hiện tại'}
    showSummary={count !== undefined}
    summaryOverride={count !== undefined ? `${count} ${itemLabel} trên trang này` : undefined}
    hasPrev={!!navigation.cursor} hasNext={!!nextCursor} isLoading={busy}
    previousLabel={navigation.knownPage ? undefined : 'Về đầu'}
    onPageChange={next => {
      requestFocus();
      onDirection?.(next < navigation.page ? -1 : 1);
      if (!navigation.knownPage && next < navigation.page) navigation.previous();
      else if (next === navigation.page + 1 && nextCursor) navigation.next(nextCursor);
      else navigation.jump(next);
    }}
  /></div>;
}
