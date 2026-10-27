import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, RefreshCw } from "lucide-react";
import { ApiError } from "@used-books/session-client";
import { ROUTES } from "../../../lib/routes";
import { myListingsQuery } from "../../../lib/owner-listing-queries";
import {
  overviewShelfFocus,
  shelfFocusFilters,
  type ShelfSignal,
} from "../../../lib/overview-shelf-focus";

function accessDenied(error: unknown) {
  return error instanceof ApiError && error.status === 403;
}

export function DashboardShelfFocus({ ownerId }: { ownerId: string }) {
  const queries = useQueries({
    queries: shelfFocusFilters.map(({ moderation }) => ({
      ...myListingsQuery(ownerId, moderation, undefined, 1),
      refetchOnMount: "always",
    })),
  });

  const signals: ShelfSignal[] = queries.map((query) =>
    accessDenied(query.error)
      ? "forbidden"
      : query.isPending || query.isFetching
        ? "loading"
        : query.isError
          ? "error"
          : query.data?.items.length
            ? "present"
            : "empty"
  );

  const focus = overviewShelfFocus(signals);
  const labels = {
    present: "Có bài trên kệ",
    empty: "Chưa có bài",
    loading: "Đang kiểm tra…",
    error: "Chưa tải được",
    forbidden: "Chưa được phép xem",
  };

  return (
    <section
      className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-outline-variant/30"
      aria-labelledby="overview-focus"
    >
      <div
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg"
        aria-busy={signals.includes("loading")}
      >
        <div className="flex flex-col gap-1.5 max-w-2xl">
          <h2 id="overview-focus" className="text-xl md:text-2xl text-primary font-bold tracking-normal">
            {focus.title}
          </h2>
          <p
            className="font-body-md text-body-md text-on-surface-variant"
            role={focus.kind === "error" || focus.kind === "forbidden" ? "alert" : undefined}
          >
            {focus.description}
          </p>

          <div className="flex items-center gap-space-sm mt-1 flex-wrap">
            {focus.to && (
              <Link
                to={focus.to}
                className="inline-flex items-center gap-1.5 px-space-md py-2 rounded bg-secondary text-on-secondary font-title-md text-title-md hover:bg-on-secondary-container transition-colors shadow-sm text-sm"
              >
                <span>{focus.action}</span>
                <ArrowRight size={16} />
              </Link>
            )}

            {signals.includes("error") && (
              <button
                type="button"
                onClick={() => {
                  queries.forEach((query) => {
                    if (query.isError && !accessDenied(query.error)) void query.refetch();
                  });
                }}
                disabled={queries.some((query) => query.isFetching)}
                className="inline-flex items-center gap-1.5 px-space-md py-2 rounded bg-surface-container-high text-primary font-title-md text-title-md hover:bg-surface-dim transition-colors text-sm"
              >
                <RefreshCw size={14} />
                <span>Thử lại việc trên kệ</span>
              </button>
            )}
          </div>
        </div>

        {/* Status link pills */}
        <ul className="flex items-center gap-space-sm flex-wrap list-none p-0 m-0">
          {shelfFocusFilters.map(({ moderation, label }, index) => (
            <li key={moderation}>
              <Link
                to={`${ROUTES.myBooks}?moderation=${moderation}`}
                className="inline-flex items-center gap-2 px-space-md py-2 rounded-lg bg-surface-container-low border border-outline-variant/40 hover:bg-surface-container hover:border-outline transition-colors text-xs"
              >
                <div className="flex flex-col">
                  <strong className="text-primary font-semibold">{label}</strong>
                  <small className="text-on-surface-variant text-[11px]">{labels[signals[index]!]}</small>
                </div>
                <ArrowUpRight size={14} className="text-on-surface-variant" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
