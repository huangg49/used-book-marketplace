import { ErrorNotice } from "./ui";
import { useRef } from "react";
import { useVisibleMotion } from "./task-motion";

type ListResult = {
  data: unknown;
  error: unknown;
  isPending: boolean;
  isFetching: boolean;
  isFetchingNextPage?: boolean;
  isFetchNextPageError?: boolean;
  refetch: () => Promise<unknown>;
};

// A failed next page is recovered at the pagination control, without reloading
// the pages already read. Refetch errors keep the last successful list visible.
export function ListFeedback({
  result,
  loadingText,
  retryDisabled = false,
}: {
  result: ListResult;
  loadingText: string;
  retryDisabled?: boolean;
}) {
  const retained = result.data !== undefined;
  const root = useRef<HTMLDivElement>(null);
  useVisibleMotion(
    root,
    result.isPending ||
      (retained && result.isFetching && !result.isFetchingNextPage),
  );
  return (
    <div ref={root} className="list-feedback">
      {result.isPending && (
        <div className="list-loading" role="status">
          <p>{loadingText}</p>
          <div className="list-skeleton" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <div key={n}>
                <i />
                <span />
                <span />
              </div>
            ))}
          </div>
        </div>
      )}
      {result.error != null && !result.isFetchNextPageError && (
        <>
          <ErrorNotice
            error={result.error}
            retry={() => void result.refetch()}
            busy={result.isFetching || retryDisabled}
          />
          {retained && (
            <p className="muted" role="status">
              Đang giữ danh sách lần tải trước; chưa cập nhật được trạng thái
              mới nhất.
            </p>
          )}
        </>
      )}
      {retained && (
        <div
          className="refresh-status"
          data-busy={result.isFetching && !result.isFetchingNextPage}
        >
          <p className="muted" role="status">
            {result.isFetching && !result.isFetchingNextPage
              ? "Đang cập nhật danh sách…"
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}
