import { queryOptions } from "@tanstack/react-query";
import type { CurrentUser } from "@used-books/session-client";
import { dashboardKeys, dashboardRefresh } from "../../core/dashboard-cache";
import { canReview, canViewFinance } from "../../core/session";
import type { Request } from "../../core/command";
import type { DashboardSource } from "./sources";
import { moderationOverview } from "./overview";
import { revenueOverview } from "./revenue";
import {
  financeCashflow,
  financeOverview,
  operationsAnalytics,
} from "./finance";

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
export function dashboardRevenueQuery(
  user: CurrentUser,
  from: string,
  to: string,
  page: number,
  request: Request,
) {
  return queryOptions({
    ...dashboardRefresh,
    queryKey: dashboardKeys.revenue(user, from, to, page),
    queryFn: () =>
      request(
        `/operations/revenue-overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&page=${page}`,
        revenueOverview,
      ),
    enabled: canReview(user) && from.length > 0 && to.length > 0 && from <= to,
  });
}
export function dashboardFinanceQuery(
  user: CurrentUser,
  from: string,
  to: string,
  request: Request,
) {
  return queryOptions({
    ...dashboardRefresh,
    queryKey: dashboardKeys.finance(user, from, to),
    queryFn: () =>
      request(
        `/operations/finance-overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        financeOverview,
      ),
    enabled:
      canViewFinance(user) && from.length > 0 && to.length > 0 && from <= to,
  });
}
export function dashboardCashflowQuery(
  user: CurrentUser,
  from: string,
  to: string,
  request: Request,
) {
  return queryOptions({
    ...dashboardRefresh,
    queryKey: dashboardKeys.cashflow(user, from, to),
    queryFn: () =>
      request(
        `/operations/finance-cashflow?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        financeCashflow,
      ),
    enabled:
      canViewFinance(user) && from.length > 0 && to.length > 0 && from <= to,
  });
}
export function dashboardAnalyticsQuery(
  user: CurrentUser,
  from: string,
  to: string,
  request: Request,
) {
  return queryOptions({
    ...dashboardRefresh,
    queryKey: dashboardKeys.analytics(user, from, to),
    queryFn: () =>
      request(
        `/operations/operations-analytics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        operationsAnalytics,
      ),
    enabled: canReview(user) && from.length > 0 && to.length > 0 && from <= to,
  });
}
