import { QueryClient } from "@tanstack/react-query";
import { SessionClient, type CurrentUser } from "@used-books/session-client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 15_000, gcTime: 120_000 },
    mutations: { retry: false },
  },
});
// Memory only, including refresh tokens. Reloading the browser requires sign-in.
let refreshToken: string | null = null;
export const session = new SessionClient(
  (import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1").replace(
    /\/$/,
    "",
  ),
  {
    read: async () => refreshToken,
    write: async (token) => {
      refreshToken = token;
    },
    clear: async () => {
      refreshToken = null;
    },
  },
);
let identity: string | undefined;
session.subscribe(() => {
  const state = session.getSnapshot();
  const next = state.status === "authenticated" ? state.user.id : undefined;
  if (next !== identity) {
    queryClient.clear();
    identity = next;
  }
});
export const canReview = (user: CurrentUser) =>
  user.status === "ACTIVE" &&
  user.roles.some((role) => role === "STAFF" || role === "ADMIN");
export const canReviewCatalog = (user: CurrentUser) =>
  user.status === "ACTIVE" && user.roles.includes("ADMIN");
// Point desks need STAFF itself: the API refuses an Admin without it. Whether the
// Staff member is assigned to a point is checked only on the server.
export const canOperatePoint = (user: CurrentUser) =>
  user.status === "ACTIVE" && user.roles.includes("STAFF");
// Independent decisions on point Orders and auctions belong to ADMIN.
export const canResolve = (user: CurrentUser) =>
  user.status === "ACTIVE" && user.roles.includes("ADMIN");
// ADR 0044: simulated carrier outcomes belong to TEST_OPERATOR only.
export const canSimulate = (user: CurrentUser) =>
  user.status === "ACTIVE" && user.roles.includes("TEST_OPERATOR");
export const canEnterWorkspace = (user: CurrentUser) =>
  canReview(user) || canSimulate(user);
