import { queryOptions } from "@tanstack/react-query";
import type { CurrentUser } from "@used-books/session-client";
import { dashboardKeys, dashboardRefresh } from "../../core/dashboard-cache";
import { canReview } from "../../core/session";
import type { Request } from "../../core/command";
import type { DashboardSource } from "./sources";
import { moderationOverview } from "./overview";

export function dashboardSourceQuery(
  user: CurrentUser,
  source: DashboardSource,
  request: Request,
) {
  return queryOptions({
    ...dashboardRefresh,
    queryKey: dashboardKeys.source(user, source.id),
    queryFn: () => source.load(request),
  });
}
export function dashboardOverviewQuery(
  user: CurrentUser,
  days: 7 | 30,
  request: Request,
) {
  return queryOptions({
    ...dashboardRefresh,
    queryKey: dashboardKeys.overview(user, days),
    queryFn: () =>
      request(
        "/operations/moderation-overview?days=" + days,
        moderationOverview,
      ),
    enabled: canReview(user),
  });
}
