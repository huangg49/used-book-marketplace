import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Fragments never reach HTTP logs/referrers. Consume only after an explicit button press.
export function useAuthLink(key: 'verify' | 'reset', consumed: boolean) {
  const { hash } = useLocation();
  const [token] = useState(() => new URLSearchParams(hash.slice(1)).get(key));
  useEffect(() => {
    // Keep an unused fragment through reload; remove it after successful consumption.
    if (consumed && hash && new URLSearchParams(hash.slice(1)).has(key))
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }, [consumed, hash, key]);
  return token;
}
