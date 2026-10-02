import { dateText, money } from "../../core/format";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  Link,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { canReviewCatalog, session } from "../../core/session";
import { Button, CursorPagination, ErrorNotice } from "../../core/ui";
import {
  book,
  catalog,
  labels,
  listing,
  pageOf,
  type Kind,
  type Listing,
  type Catalog,
} from "./contracts";

export function Queue() {
  const { kind = "listings" } = useParams();
  const user = useOutletContext<CurrentUser>();
  if (
    (kind !== "listings" && kind !== "catalog-requests") ||
    (kind === "catalog-requests" && !canReviewCatalog(user))
  )
    return <p>Không có quyền xem khu vực này.</p>;
  return <QueueContent key={kind} kind={kind} />;
}
function QueueContent({ kind }: { kind: Kind }) {
  const [params, setParams] = useSearchParams();
  const filters =
    kind === "listings"
      ? ["PendingReview", "Approved", "Rejected"]
      : ["Pending", "Confirmed", "Rejected"];
  const status = filters.includes(params.get("status") || "")
    ? params.get("status")!
    : filters[0];
  const result = useInfiniteQuery({
    queryKey: ["queue", kind, status],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const path = `/operations/${kind}?${kind === "listings" ? "moderation" : "status"}=${status}&limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`;
      return kind === "listings"
        ? session.request(path, pageOf(listing))
        : session.request(path, pageOf(catalog));
    },
    getNextPageParam: (page) => page.nextCursor || undefined,
    refetchInterval: 30_000,
  });
  const items =
    result.data?.pages.flatMap<Listing | Catalog>((page) => page.items) || [];
  return (
    <>
      <div className="queue-toolbar">
        <div className="tabs" aria-label="Lọc trạng thái">
          {filters.map((value) => (
            <Button
              key={value}
              aria-pressed={status === value}
              onClick={() => setParams({ status: value })}
            >
              {labels[value]}
            </Button>
          ))}
        </div>
        <Button busy={result.isFetching} onClick={() => void result.refetch()}>
          Cập nhật danh sách
        </Button>
      </div>
      <p className="muted">
        Xếp theo lần gửi, cũ nhất trước.{" "}
        {result.data &&
          `Đang hiển thị ${items.length} hồ sơ. Cập nhật ${dateText(result.data.pages[0].serverTime)}.`}
      </p>
      {result.isLoading && (
        <p className="empty" role="status">
          Đang tải hồ sơ…
        </p>
      )}
      {result.error && (
        <ErrorNotice
          error={result.error}
          retry={() => void result.refetch()}
          busy={result.isFetching}
        />
      )}
      {result.isSuccess && items.length === 0 && (
        <div className="empty">
          <span className="folio">—</span>
          <h2>Chưa có hồ sơ ở mục này.</h2>
          <p>Danh sách sẽ cập nhật khi có lần gửi phù hợp.</p>
        </div>
      )}
      <div className="queue-list">
        {items.map((item, index) => (
          <article className="queue-row" key={item.id}>
            <span className="row-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <div className="row-meta">
                <span>
                  {
                    labels[
                      "state" in item ? item.state.moderation : item.status
                    ]
                  }
                </span>
                <span>
                  Bản gửi {item.currentRevision.number} ·{" "}
                  {dateText(item.currentRevision.submittedAt)}
                </span>
              </div>
              <h2>
                <Link to={`/review/${kind}/${item.id}`}>
                  {"state" in item ? (
                    <ListingTitle value={item} />
                  ) : (
                    item.currentRevision.metadata.title
                  )}
                </Link>
              </h2>
              {"state" in item ? (
                <div className="queue-prices muted">
                  {item.currentRevision.content.salePrice != null && (
                    <span>
                      Giá bán: {money(item.currentRevision.content.salePrice)}
                    </span>
                  )}
                  {item.currentRevision.content.exchangeValue != null && (
                    <span>
                      Giá trị đổi: {money(item.currentRevision.content.exchangeValue)}
                    </span>
                  )}
                  <span>{item.currentRevision.content.mediaIds.length} ảnh</span>
                </div>
              ) : (
                <p className="muted">
                  {item.currentRevision.metadata.authors.join(" · ")} ·{" "}
                  {item.currentRevision.metadata.publisher ||
                    "Chưa có nhà xuất bản"}
                </p>
              )}
            </div>
            <Link
              className="read-link"
              to={`/review/${kind}/${item.id}`}
              aria-label={`Đọc hồ sơ ${index + 1}`}
            >
              Đọc hồ sơ <span aria-hidden="true">↗</span>
            </Link>
          </article>
        ))}
      </div>
      <CursorPagination
        pageCount={result.data?.pages.length ?? 0}
        hasNextPage={result.hasNextPage}
        isFetchingNextPage={result.isFetchingNextPage}
        onNextPage={() => void result.fetchNextPage()}
        nextLabel="Xem thêm hồ sơ"
      />
    </>
  );
}
function ListingTitle({ value }: { value: Listing }) {
  const result = useQuery({
    queryKey: ["book-title", value.currentRevision.content.bookId],
    enabled:
      value.catalogStatus === "Confirmed" &&
      !!value.currentRevision.content.bookId,
    queryFn: () =>
      session.request(
        `/catalog/books/${value.currentRevision.content.bookId}`,
        book,
      ),
    staleTime: Infinity,
  });
  return (
    <>
      {result.data?.title ||
        (value.catalogStatus === "Confirmed"
          ? "Bài đăng sách"
          : "Sách chờ xác nhận đầu sách")}{" "}
      <span className="short-id">/ {value.id.slice(0, 8)}</span>
    </>
  );
}
