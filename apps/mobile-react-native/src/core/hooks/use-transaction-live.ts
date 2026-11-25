import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { io } from 'socket.io-client';
import {
  createLiveWatcher,
  sessionSocketOptions,
  type LiveWatcher,
  type SessionClient,
  type TransactionWatch,
} from '@used-books/session-client';
import { apiBaseUrl } from '../api/api-base-url';
import { useSession } from '../session/session-provider';

function socketOrigin() {
  try {
    return apiBaseUrl(Platform.OS, {
      shared: process.env.EXPO_PUBLIC_API_BASE_URL,
      android: process.env.EXPO_PUBLIC_API_BASE_URL_ANDROID,
      web: process.env.EXPO_PUBLIC_API_BASE_URL_WEB,
      ios: process.env.EXPO_PUBLIC_API_BASE_URL_IOS,
    }).replace(/\/api\/v1\/?$/, '');
  } catch {
    return undefined;
  }
}

// One socket per namespace for each session client; every screen shares it.
// Screens pass `enabled: foreground`, so the last background screen releasing
// its watch closes the socket and returning to the app re-watches and refreshes.
const watchers = new WeakMap<SessionClient, LiveWatcher>();
function liveFor(client: SessionClient, origin: string) {
  let live = watchers.get(client);
  if (!live) {
    live = createLiveWatcher({
      client,
      open: namespace => io(`${origin}/${namespace}`, {
        ...sessionSocketOptions,
        auth: callback => callback({ token: client.getAccessToken() }),
      }),
    });
    watchers.set(client, live);
  }
  return live;
}

export function useTransactionLive(kind: TransactionWatch, id: string, enabled: boolean, refresh: () => void) {
  const { client, state } = useSession();
  const userId = state.status === 'authenticated' ? state.user.id : undefined;
  const [subscribed, setSubscribed] = useState<string>();
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  const target = enabled && userId && id ? `${userId}:${kind}:${id}` : undefined;

  useEffect(() => {
    if (!target) return;
    const origin = socketOrigin();
    if (origin === undefined) return;
    const stop = liveFor(client, origin).watch(kind, id, {
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
