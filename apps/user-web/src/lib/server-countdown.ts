import { createServerNow, serverClock, type ServerClock } from '@used-books/session-client';

/**
 * Display clock only; new server data can start a new countdown after expiry.
 * Time comes from the shared server clock (round-trip corrected, monotonic);
 * before its first sample, by advancing the supplied `serverTime`. Without
 * `serverTime` it is a local countdown on the device date.
 */
export function startServerCountdown(
  endAt: string,
  serverTime: string | undefined,
  update: (remaining: number) => void,
  clock: ServerClock = serverClock,
) {
  const deadline = Date.parse(endAt);
  const now = createServerNow(serverTime, clock);
  const remaining = () => Math.max(0, deadline - now());
  const initial = remaining();
  update(initial);
  if (!(initial > 0)) return () => {};

  const timer = setInterval(() => {
    const ms = remaining();
    update(ms);
    if (ms === 0) clearInterval(timer);
  }, 1000);
  return () => clearInterval(timer);
}
