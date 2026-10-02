import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Platform } from "react-native";
import { SessionClient } from "../api/session-client";
import { apiBaseUrl } from "../api/api-base-url";
import { tokenStorage } from "./token-storage";

const SessionContext = createContext<SessionClient | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const [session] = useState(() => {
    const url = apiBaseUrl(Platform.OS, {
      shared: process.env.EXPO_PUBLIC_API_BASE_URL,
      android: process.env.EXPO_PUBLIC_API_BASE_URL_ANDROID,
      web: process.env.EXPO_PUBLIC_API_BASE_URL_WEB,
      ios: process.env.EXPO_PUBLIC_API_BASE_URL_IOS,
    });
    return new SessionClient(url, tokenStorage);
  });
  useEffect(() => {
    let previousUser: string | null = null;
    const unsubscribe = session.subscribe(() => {
      const state = session.getSnapshot();
      const userId = state.status === "authenticated" ? state.user.id : null;
      if (previousUser !== userId) queryClient.clear();
      previousUser = userId;
    });
    void session.restore();
    return unsubscribe;
  }, [session, queryClient]);
  return (
    <SessionContext.Provider value={session}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionContext.Provider>
  );
}

export function useSession() {
  const client = useContext(SessionContext);
  if (!client) throw new Error("SessionProvider is missing.");
  const state = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  return { client, state };
}
