import { useLocation, useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';

type Trail = { scope: string; cursors: string[]; index?: number };
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
  const candidateIndex = candidate?.index ?? ((candidate?.cursors?.length ?? 0) - 1);
  const valid = candidate?.scope === scope && Array.isArray(candidate.cursors)
    && candidate.cursors.every(value => typeof value === 'string')
    && Number.isSafeInteger(candidateIndex) && candidateIndex >= 0
    && candidate.cursors[candidateIndex] === cursor;
  const cursors = valid ? candidate.cursors : !cursor ? [''] : undefined;
  const index = valid ? candidateIndex : 0;
  const page = cursors ? index + 1 : 2;
  function go(nextCursor: string, trail?: string[], nextIndex?: number) {
    if (navigating.current === location.key || nextCursor === cursor) return;
    navigating.current = location.key;
    const next = new URLSearchParams(params);
    if (nextCursor) next.set('cursor', nextCursor); else next.delete('cursor');
    setParams(next, { state: { ...state, latlaiCursorTrail: trail ? { scope, cursors: trail, index: nextIndex } : undefined } });
  }
  return {
    page, knownPage: !!cursors, cursor, reachablePages: cursors?.length,
    jump: (target: number) => {
      if (cursors && Number.isSafeInteger(target) && target >= 1 && target <= cursors.length)
        go(cursors[target - 1]!, cursors, target - 1);
    },
    previous: () => go(cursors?.[index - 1] ?? '', cursors, Math.max(0, index - 1)),
    next: (value: string) => go(value,
      cursors ? cursors[index + 1] === value ? cursors : [...cursors.slice(0, index + 1), value] : undefined,
      cursors ? index + 1 : undefined),
    first: () => go('', cursors ?? [''], 0),
  };
}
