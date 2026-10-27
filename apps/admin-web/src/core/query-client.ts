import { QueryClient } from "@tanstack/react-query";
import type { SessionClient } from "@used-books/session-client";
import { session } from "./session";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 15_000, gcTime: 120_000 },
    mutations: { retry: false },
  },
});

// This module can load after login. Start from the current identity rather
// than assuming the session is anonymous; every later identity loss/change
// clears both query and mutation data synchronously, even while UI is unmounted.
export function bindSessionCache(
  cache: Pick<QueryClient, "clear">,
  source: Pick<SessionClient, "getSnapshot" | "subscribe">,
) {
  const identity = () => {
    const state = source.getSnapshot();
    return state.status === "authenticated" ? state.user.id : undefined;
  };
  let previous = identity();
  return source.subscribe(() => {
    const next = identity();
    if (next !== previous) {
      cache.clear();
      previous = next;
    }
  });
}

const unbind = bindSessionCache(queryClient, session);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    unbind();
    queryClient.clear();
  });
