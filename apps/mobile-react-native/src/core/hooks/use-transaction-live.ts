import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { io } from 'socket.io-client';
import { sessionSocketOptions, watchSessionResource, type TransactionWatch } from '@used-books/session-client';
import { apiBaseUrl } from '../api/api-base-url';
import { useSession } from '../session/session-provider';

export function useTransactionLive(kind: TransactionWatch, id: string, enabled: boolean, refresh: () => void) {
  const { client, state } = useSession();
  const userId = state.status === 'authenticated' ? state.user.id : undefined;
  const [subscribed, setSubscribed] = useState<string>();
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  const target = enabled && userId && id ? `${userId}:${kind}:${id}` : undefined;

  useEffect(() => {
    if (!target) return;
    let origin: string;
    try {
      origin = apiBaseUrl(Platform.OS, {
        shared: process.env.EXPO_PUBLIC_API_BASE_URL,
        android: process.env.EXPO_PUBLIC_API_BASE_URL_ANDROID,
        web: process.env.EXPO_PUBLIC_API_BASE_URL_WEB,
        ios: process.env.EXPO_PUBLIC_API_BASE_URL_IOS,
      }).replace(/\/api\/v1\/?$/, '');
    } catch {
      return;
    }
    const namespace = kind === 'point-order' ? 'point-orders' : 'transactions';
    const socket = io(`${origin}/${namespace}`, {
      ...sessionSocketOptions,
      auth: callback => callback({ token: client.getAccessToken() }),
    });
    const stop = watchSessionResource({
      client, socket, kind, id,
      refresh: () => refreshRef.current(),
      onWatching: active => setSubscribed(active ? target : undefined),
    });
    return () => {
      stop();
      setSubscribed(undefined);
    };
  }, [client, id, kind, target]);

  return Boolean(target && target === subscribed);
}
