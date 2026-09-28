import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionClient } from "../api/session-client";
import { tokenStorage } from "./token-storage";

const SessionContext = createContext<SessionClient | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const [session] = useState(() => {
    const url = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
    if (!url)
      throw new Error(
        "Set EXPO_PUBLIC_API_BASE_URL in apps/mobile-react-native/.env. See README.",
      );
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
