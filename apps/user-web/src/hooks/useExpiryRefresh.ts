import { useEffect, useReducer } from 'react';

/** Refresh at a deadline or on returning to a suspended tab, without polling. */
export function useExpiryRefresh(expiresAt: string | undefined) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const deadline = Date.parse(expiresAt ?? '');
    if (!Number.isFinite(deadline) || deadline <= Date.now()) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) refresh();
      else timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
    };
    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      check();
    };
    check();
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [expiresAt]);
  return refresh;
}
