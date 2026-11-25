import { useEffect, useState } from "react";
import { createServerNow } from "../../core/api/session-client";

export function useAuctionNow(serverTime: string | undefined, foreground: boolean, tickMs = 1000) {
  const [now, setNow] = useState(() => serverTime ? createServerNow(serverTime)() : 0);
  useEffect(() => {
    if (!serverTime || !foreground) return;
    const readNow = createServerNow(serverTime);
    const tick = () => setNow(readNow());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, tickMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [serverTime, foreground, tickMs]);
  return now;
}
