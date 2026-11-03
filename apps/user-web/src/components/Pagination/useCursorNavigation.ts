import { useLocation, useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';

type Trail = { scope: string; cursors: string[] };
/** Each browser history entry carries its own cursor trail. Back/Forward and
 * detail→Back restore the page; a pasted opaque cursor has no invented ordinal. */
export function useCursorNavigation(identity: string) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigating = useRef<string | null>(null);
  useEffect(() => { navigating.current = null; }, [location.key]);
  const cursor = params.get('cursor') ?? '';
  const filters = new URLSearchParams(params); filters.delete('cursor'); filters.sort();
  const scope = `${identity}:${filters}`;
  const state = location.state && typeof location.state === 'object' ? location.state : {};
  const candidate = state.latlaiCursorTrail as Trail | undefined;
  const valid = candidate?.scope === scope && Array.isArray(candidate.cursors)
    && candidate.cursors.every(value => typeof value === 'string')
    && candidate.cursors.at(-1) === cursor;
  const cursors = !cursor ? [''] : valid ? candidate.cursors : undefined;
  const page = cursors?.length ?? 2;
  function go(nextCursor: string, trail?: string[]) {
    if (navigating.current === location.key || nextCursor === cursor) return;
    navigating.current = location.key;
    const next = new URLSearchParams(params);
    if (nextCursor) next.set('cursor', nextCursor); else next.delete('cursor');
    setParams(next, { state: { ...state, latlaiCursorTrail: trail ? { scope, cursors: trail } : undefined } });
  }
  return {
    page, knownPage: !!cursors, cursor,
    previous: () => go(cursors?.at(-2) ?? '', cursors?.slice(0, -1)),
    next: (value: string) => go(value, cursors ? [...cursors, value] : undefined),
    first: () => go('', ['']),
  };
}
