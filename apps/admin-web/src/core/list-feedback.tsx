import { ErrorNotice } from "./ui";

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
  return (
    <>
      {result.isPending && (
        <p className="empty" role="status">{loadingText}</p>
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
      {retained && result.isFetching && !result.isFetchingNextPage && (
        <p className="muted" role="status">Đang cập nhật danh sách…</p>
      )}
    </>
  );
}
