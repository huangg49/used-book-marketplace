import { useSyncExternalStore } from 'react';
import { session } from '../lib/session';

/** Trả về SessionState hiện tại, reactive với mọi thay đổi phiên. */
export function useSession() {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

/** Trả về true nếu user đã đăng nhập thành công. */
export function useIsAuthenticated(): boolean {
  const state = useSession();
  return state.status === 'authenticated';
}
