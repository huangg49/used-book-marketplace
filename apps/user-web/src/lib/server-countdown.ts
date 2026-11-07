/** Display clock only; new server data can start a new countdown after expiry. */
export function startServerCountdown(endAt: string, serverTime: string | undefined, update: (remaining: number) => void) {
  const deadline = Date.parse(endAt);
  const offset = serverTime ? Date.parse(serverTime) - Date.now() : 0;
  const remaining = () => Math.max(0, deadline - (Date.now() + offset));
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
