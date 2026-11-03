import { useEffect, useRef } from 'react';
import { getLenis } from '../../hooks/useSmoothScroll';

/** Move to the new results only after an explicit page command has rendered.
 * Filter/identity changes and failed reads must keep the user's current focus. */
export function usePaginationFocus(position: string | number, scope: string, anchorId?: string, busy = false, failed = false) {
  const pending = useRef<{ from: string | number; scope: string; waited: boolean } | undefined>(undefined);
  useEffect(() => {
    const request = pending.current;
    if (!request) return;
    if (request.scope !== scope || !anchorId) { pending.current = undefined; return; }
    if (busy) { request.waited = true; return; }
    if (failed) { pending.current = undefined; return; }
    if (position !== request.from) {
      pending.current = undefined;
      const start = document.getElementById(anchorId);
      if (!start) return;
      const lenis = getLenis();
      if (lenis) lenis.scrollTo(start, { offset: -112, duration: 0.65 });
      else start.scrollIntoView({ behavior: 'smooth', block: 'start' });
      (start.querySelector<HTMLElement>('a[href], button:not(:disabled)') ?? start).focus({ preventScroll: true });
    } else if (request.waited) pending.current = undefined;
  }, [position, scope, anchorId, busy, failed]);
  return () => { pending.current = { from: position, scope, waited: false }; };
}
