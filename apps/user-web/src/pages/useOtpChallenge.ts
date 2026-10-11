import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// This is only an opaque lookup ID, never a code, email or session credential.
// Keeping it in a fragment lets an unused OTP survive refresh without a token store.
export function useOtpChallenge(key: 'verify-otp' | 'reset-otp', completed: boolean) {
  const { pathname } = useLocation();
  const route = key === 'verify-otp' ? '/register' : '/forgot-password';
  const [challengeId, setChallengeId] = useState<string | null>(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get(key);
    return value && uuid.test(value) ? value : null;
  });
  useEffect(() => {
    if (pathname !== route) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (completed || !challengeId) {
      if (!params.has(key)) return;
      params.delete(key);
    } else {
      // The OTP replaces any legacy email-link fragment on this same paper.
      params.delete(key === 'verify-otp' ? 'verify' : 'reset');
      params.set(key, challengeId);
    }
    window.history.replaceState(window.history.state, '', pathname + window.location.search + (params.size ? '#' + params.toString() : ''));
  }, [challengeId, completed, key, pathname, route]);
  return [challengeId, setChallengeId] as const;
}
