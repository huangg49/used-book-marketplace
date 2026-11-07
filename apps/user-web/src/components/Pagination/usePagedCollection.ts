import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface PagedData<P> { pages: P[] }
interface PageResult<P> { data?: PagedData<P>; isFetchNextPageError: boolean; hasNextPage?: boolean }
interface CursorQuery<P> extends PageResult<P> {
  isFetching: boolean;
  fetchNextPage: (options: { cancelRefetch: false }) => Promise<PageResult<P>>;
}

/** Read-only paging over cached cursor data. A sparse client filter can scan
 * subsequent cursors; changing its scope cancels that scan without dropping cache. */
export function usePagedCollection<P extends { nextCursor?: string | null }, T>(query: CursorQuery<P>, scope: string,
  select: (pages: P[]) => T[], pageSize = 10) {
  const location = useLocation(), navigate = useNavigate();
  const state = location.state && typeof location.state === 'object' ? location.state : {};
  const saved = state.latlaiCollection as { scope?: string; page?: number } | undefined;
  const restoredPage = saved?.scope === scope && Number.isSafeInteger(saved.page) && saved.page! > 0 ? saved.page! : 1;
  const lastScope = useRef(scope);
  const [activity, setActivity] = useState<{ scope: string; busy?: boolean; error?: string }>();
  const operation = useRef(0);
  const lock = useRef(false);
  const reset = useCallback(() => {
    operation.current += 1;
    lock.current = false;
    setActivity(undefined);
  }, []);
  useEffect(() => {
    if (lastScope.current !== scope) {
      lastScope.current = scope;
      navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, {
        replace: true, state: { ...(location.state && typeof location.state === "object" ? location.state : {}), latlaiCollection: { scope, page: 1 } },
      });
    }
    lock.current = false;
    return () => { operation.current += 1; lock.current = false; };
  }, [scope, location, navigate]);
  const all = select(query.data?.pages ?? []);
  const loadedPages = Math.max(1, Math.ceil(all.length / pageSize));
  const page = Math.min(restoredPage, loadedPages);
  const busy = activity?.scope === scope && !!activity.busy;
  const items = all.slice((page - 1) * pageSize, page * pageSize);
  function commitPage(next: number) {
    if (next !== page) navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, {
      state: { ...state, latlaiCollection: { scope, page: next } },
    });
  }

  async function change(next: number) {
    if (lock.current || query.isFetching || next < 1) return;
    if (next <= loadedPages && all.length) {
      commitPage(next); setActivity(undefined); return;
    }
    if (!query.hasNextPage) return;
    const target = all.length ? next : 1;
    const id = ++operation.current;
    lock.current = true;
    setActivity({ scope, busy: true });
    let length = query.data?.pages.length ?? 0;
    let cursor = query.data?.pages.at(-1)?.nextCursor;
    const seen = new Set<string>();
    try {
      // Continue through sparse source pages until the requested filtered page
      // exists. Never report a globally empty result after reading only page 1.
      while (operation.current === id) {
        if (cursor && seen.has(cursor)) {
          setActivity({ scope, error: 'Máy chủ trả lại cursor đã đọc. Dừng tải để tránh lặp dữ liệu; vui lòng cập nhật danh sách.' }); return;
        }
        if (cursor) seen.add(cursor);
        const result = await query.fetchNextPage({ cancelRefetch: false });
        if (operation.current !== id) return;
        if (result.isFetchNextPageError || !result.data) {
          setActivity({ scope, error: 'Chưa tải được trang tiếp theo. Dữ liệu đang xem vẫn được giữ; bấm Sau để thử lại.' }); return;
        }
        const selected = select(result.data.pages);
        if (selected.length > (target - 1) * pageSize || !result.hasNextPage) {
          commitPage(Math.min(target, Math.max(1, Math.ceil(selected.length / pageSize))));
          setActivity(undefined); return;
        }
        if (result.data.pages.length <= length) {
          setActivity({ scope, error: 'Chưa nhận được trang mới. Bấm Sau để thử lại.' }); return;
        }
        length = result.data.pages.length;
        cursor = result.data.pages.at(-1)?.nextCursor;
      }
    } finally {
      if (operation.current === id) { lock.current = false; setActivity(current => current?.scope === scope ? { ...current, busy: false } : current); }
    }
  }

  return {
    reset,
    items, loadedCount: all.length, visible: !!all.length || !!query.hasNextPage,
    error: activity?.scope === scope ? activity.error : undefined,
    busy,
    props: {
      page, pageSize, itemCount: items.length, variant: 'simple' as const,
      reachablePages: loadedPages,
      totalItems: query.hasNextPage ? undefined : all.length,
      hasNext: page < loadedPages || !!query.hasNextPage,
      isLoading: query.isFetching || busy,
      onPageChange: (next: number) => { void change(next); },
    },
  };
}
