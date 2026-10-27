import type { QueryClient } from "@tanstack/react-query";
import type { CurrentUser } from "@used-books/session-client";

export const dashboardRoot = ["dashboard"] as const;
const refreshMs = 30_000;
export function dashboardInterval(query: { state: { dataUpdatedAt: number } }) {
  const remaining = refreshMs - (Date.now() - query.state.dataUpdatedAt);
  // A fresh remount keeps the original next-poll deadline. An overdue/failed
  // read retains the normal retry cadence rather than creating a hot loop.
  return remaining > 0 ? Math.min(refreshMs, remaining) : refreshMs;
}
export const dashboardRefresh = {
  staleTime: refreshMs,
  refetchInterval: dashboardInterval,
  refetchIntervalInBackground: false,
} as const;

const scope = (user: CurrentUser) =>
  [
    ...dashboardRoot,
    user.id,
    user.status,
    [...new Set(user.roles)].sort().join(","),
  ] as const;
export const dashboardKeys = {
  source: (user: CurrentUser, source: string) =>
    [...scope(user), "source", source] as const,
  overview: (user: CurrentUser, days: 7 | 30) =>
    [...scope(user), "overview", days] as const,
};

// Reconciliation calls this after ACK (or when re-reading a definite refusal).
// Mark every period/source stale without extra GETs or coupling dashboard
// availability to the command's own receipt/recovery flow.
export function invalidateDashboard(client: QueryClient) {
  return client.invalidateQueries({
    queryKey: dashboardRoot,
    refetchType: "none",
  });
}

// A user refresh also expires cached, currently unselected periods. Only
// active queries fetch now; an in-flight GET is reused rather than restarted.
export function refreshDashboard(client: QueryClient) {
  return client.invalidateQueries(
    { queryKey: dashboardRoot, refetchType: "active" },
    { cancelRefetch: false },
  );
}
