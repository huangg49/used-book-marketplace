import { dateText, money } from "../../core/format";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  PanelLeft,
  RefreshCw,
} from "lucide-react";
import {
  Link,
  Outlet,
  useMatch,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { canReview, canReviewCatalog, session } from "../../core/session";
import { Button, CursorPagination } from "../../core/ui";
import { ListFeedback } from "../../core/list-feedback";
import { useListMotion } from "../../core/task-motion";
import {
  catalog,
  labels,
  listing,
  pageOf,
  type Kind,
  type Listing,
  type Catalog,
} from "./contracts";
import { ListingTitle } from "./ListingTitle";
import { QueueCover } from "./QueueCover";
import { reviewQueuePath } from "./review-navigation";
import styles from "./ReviewWorkspace.module.css";
import { EmptyArt } from "../../core/EmptyArt";

const aiFiltersFor = (status: string) =>
  status === "PendingReview"
    ? ["Escalated", "None"]
    : status === "Approved"
      ? ["Approved"]
      : [];
const aiFilterLabels: Record<string, string> = {
  Approved: "AI đã duyệt",
  Escalated: "AI chuyển người duyệt",
  None: "AI chưa xem",
};
// Only numeric positions live here. Dossiers, private URLs and decisions never do.
const queueScroll = new Map<string, number>();

export function Queue() {
  const { kind = "listings" } = useParams();
  const user = useOutletContext<CurrentUser>();
  if (
    (kind !== "listings" && kind !== "catalog-requests") ||
    (kind === "catalog-requests" && !canReviewCatalog(user)) ||
    (kind === "listings" && !canReview(user))
  )
    return <p>Không có quyền xem khu vực này.</p>;
  return <QueueContent key={kind} kind={kind} user={user} />;
}
function QueueContent({ kind, user }: { kind: Kind; user: CurrentUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedId = useMatch("/review/:kind/:id")?.params.id;
  const [showQueue, setShowQueue] = useState(false);
  const listRef = useRef<HTMLElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const filters =
    kind === "listings"
      ? ["PendingReview", "Approved", "Rejected"]
      : ["Pending", "Confirmed", "Rejected"];
  const status = filters.includes(params.get("status") || "")
    ? params.get("status")!
    : filters[0];
  const aiFilters = kind === "listings" ? aiFiltersFor(status) : [];
  const ai = aiFilters.includes(params.get("ai") || "")
    ? params.get("ai")!
    : "";
  const positionKey = `${user.id}/${kind}/${status}/${ai}`;
  const queuePath = `${reviewQueuePath(kind, status)}${ai ? `&ai=${ai}` : ""}`;
  const result = useInfiniteQuery({
    queryKey: ["queue", kind, status, user.id, ...(ai ? [ai] : [])],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const path = `/operations/${kind}?${kind === "listings" ? "moderation" : "status"}=${status}${ai ? `&aiOutcome=${ai}` : ""}&limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`;
      return kind === "listings"
        ? session.request(path, pageOf(listing))
        : session.request(path, pageOf(catalog));
    },
    getNextPageParam: (page) => page.nextCursor || undefined,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
  const items =
    result.data?.pages.flatMap<Listing | Catalog>((page) => page.items) || [];
  useListMotion(
    rowsRef,
    items.map((item) => `${item.id}:${item.version}`).join("/"),
  );
  useLayoutEffect(() => {
    if (listRef.current)
      listRef.current.scrollTop = queueScroll.get(positionKey) ?? 0;
  }, [positionKey, selectedId, items.length]);
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const itemPath = (id: string) =>
    `/review/${kind}/${id}?status=${status}${ai ? `&ai=${ai}` : ""}`;
  const firstId = items[0]?.id;
  // Start with actual work, once. An explicit Back keeps the list open; an open
  // dossier is never switched by polling or by a new first item in the queue.
  useEffect(() => {
    if (
      kind !== "listings" ||
      selectedId ||
      !firstId ||
      !result.isSuccess ||
      (location.state as { reviewOverview?: boolean } | null)?.reviewOverview
    )
      return;
    navigate(
      `/review/${kind}/${firstId}?status=${status}${ai ? `&ai=${ai}` : ""}`,
      {
        replace: true,
        state: { reviewReturnTo: queuePath },
      },
    );
  }, [
    kind,
    selectedId,
    firstId,
    result.isSuccess,
    location.state,
    navigate,
    status,
    ai,
    queuePath,
  ]);
  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <div>
          <h1>{kind === "listings" ? "Bài đăng sách" : "Yêu cầu đầu sách"}</h1>
          <p>
            {kind === "listings"
              ? "Kiểm tra từng bản sách trước khi đến tay người đọc mới."
              : "Kiểm tra tên sách, tác giả và thông tin xuất bản trước khi đưa vào danh mục dùng chung."}
          </p>
        </div>
        <div className={styles.headerMeta}>
          <span>Không gian kiểm duyệt</span>
          <strong>{labels[status]}</strong>
        </div>
      </header>
      {selectedId && (
        <Button
          className={styles.queueToggle}
          aria-expanded={showQueue}
          aria-controls="review-queue"
          onClick={() => setShowQueue(!showQueue)}
        >
          <PanelLeft size={18} aria-hidden="true" />
          {showQueue ? "Ẩn hàng chờ" : "Mở hàng chờ"}
        </Button>
      )}
      <div className={styles.desk}>
        <section
          id="review-queue"
          aria-label="Hàng chờ kiểm duyệt"
          ref={listRef}
          tabIndex={0}
          onScroll={(event) => {
            if (queueScroll.size > 40) queueScroll.clear();
            queueScroll.set(positionKey, event.currentTarget.scrollTop);
          }}
          className={`${styles.queue} ${selectedId && !showQueue ? styles.mobileHidden : ""}`}
        >
          <div className={styles.queueHead}>
            <h2>Danh sách bài gửi</h2>
            <Button
              aria-label="Cập nhật danh sách"
              title="Cập nhật danh sách"
              busy={result.isFetching}
              onClick={() => void result.refetch()}
            >
              <RefreshCw size={17} aria-hidden="true" />
            </Button>
          </div>
          <div className={styles.filters}>
            <div className="tabs" aria-label="Lọc trạng thái">
              {filters.map((value) => (
                <Button
                  key={value}
                  aria-pressed={status === value}
                  onClick={() => {
                    if (status !== value) setParams({ status: value });
                  }}
                >
                  {labels[value]}
                </Button>
              ))}
            </div>
            {aiFilters.length > 0 && (
              <div className="tabs" aria-label="Lọc theo kết quả của AI">
                <Button
                  aria-pressed={!ai}
                  onClick={() => {
                    if (ai) setParams({ status });
                  }}
                >
                  Tất cả
                </Button>
                {aiFilters.map((value) => (
                  <Button
                    key={value}
                    aria-pressed={ai === value}
                    onClick={() => {
                      if (ai !== value) setParams({ status, ai: value });
                    }}
                  >
                    {aiFilterLabels[value]}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <p className={styles.queueSummary}>
            {items.length} hồ sơ đã tải · Cũ nhất trước
          </p>
          <div
            className={styles.queueScroll}
            role="region"
            aria-label="Danh sách hồ sơ"
          >
            <ListFeedback result={result} loadingText="Đang tải hồ sơ…" />
            {result.isSuccess && items.length === 0 && (
              <div className="empty">
                <EmptyArt variant="review" />
                <h2>Chưa có hồ sơ ở mục này.</h2>
                <p>Danh sách sẽ cập nhật khi có lần gửi phù hợp.</p>
              </div>
            )}
            <div
              className="queue-list"
              ref={rowsRef}
              onKeyDown={(event) => {
                if (
                  event.altKey ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.shiftKey ||
                  event.nativeEvent.isComposing
                )
                  return;
                if (
                  !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                )
                  return;
                if (!(event.target instanceof HTMLAnchorElement)) return;
                const links = Array.from(
                  event.currentTarget.querySelectorAll<HTMLAnchorElement>(
                    ".read-link",
                  ),
                );
                const row = event.target.closest(".queue-row");
                const current = links.findIndex(
                  (link) => link.closest(".queue-row") === row,
                );
                if (current < 0) return;
                const index =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? links.length - 1
                      : Math.max(
                          0,
                          Math.min(
                            links.length - 1,
                            current + (event.key === "ArrowDown" ? 1 : -1),
                          ),
                        );
                event.preventDefault();
                links[index]?.focus();
              }}
            >
              {items.map((item, index) => (
                <article
                  className={`queue-row ${selectedId === item.id ? styles.selected : ""}`}
                  key={item.id}
                  data-motion-key={item.id}
                  data-motion-revision={item.version}
                >
                  {"state" in item && <QueueCover value={item} />}
                  <div className={styles.queueIdentity}>
                    <div className="row-meta">
                      <span>
                        {
                          labels[
                            "state" in item
                              ? item.state.moderation
                              : item.status
                          ]
                        }
                      </span>
                      <span>Bản {item.currentRevision.number}</span>
                      {"state" in item && item.autoReview && (
                        <span>{aiFilterLabels[item.autoReview.outcome]}</span>
                      )}
                    </div>
                    <h2>
                      <Link
                        to={itemPath(item.id)}
                        aria-current={
                          selectedId === item.id ? "page" : undefined
                        }
                        state={{
                          reviewReturnTo: queuePath,
                        }}
                      >
                        {"state" in item ? (
                          <ListingTitle value={item} canReadPendingCatalog={canReviewCatalog(user)} />
                        ) : (
                          item.currentRevision.metadata.title
                        )}
                      </Link>
                    </h2>
                    {"state" in item ? (
                      <div className="queue-prices muted">
                        {item.currentRevision.content.salePrice != null && (
                          <span>
                            Giá bán:{" "}
                            {money(item.currentRevision.content.salePrice)}
                          </span>
                        )}
                        {item.currentRevision.content.exchangeValue != null && (
                          <span>
                            Giá trị đổi:{" "}
                            {money(item.currentRevision.content.exchangeValue)}
                          </span>
                        )}
                        <span>
                          {item.currentRevision.content.mediaIds.length} ảnh
                        </span>
                      </div>
                    ) : (
                      <p className="muted">
                        {item.currentRevision.metadata.authors.join(" · ")} ·{" "}
                        {item.currentRevision.metadata.publisher ||
                          "Chưa có nhà xuất bản"}
                      </p>
                    )}
                    <p className={styles.submittedTime}>
                      {dateText(item.currentRevision.submittedAt)}
                    </p>
                  </div>
                  <Link
                    className="read-link"
                    to={itemPath(item.id)}
                    state={{ reviewReturnTo: queuePath }}
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
              isFetching={result.isFetching}
              error={result.isFetchNextPageError ? result.error : undefined}
              onNextPage={() =>
                void result.fetchNextPage({ cancelRefetch: false })
              }
              nextLabel="Xem thêm hồ sơ"
            />
          </div>
          {result.data && (
            <p className={styles.queueTime}>
              Cập nhật {dateText(result.data.pages[0].serverTime)}
              <span>↑ ↓ Chọn hồ sơ · Enter Mở</span>
            </p>
          )}
        </section>
        <section
          className={styles.dossier}
          aria-label="Bàn đọc hồ sơ"
          data-review-dossier
          tabIndex={0}
        >
          {selectedId ? (
            <>
              <nav
                className={styles.sequence}
                aria-label="Chuyển hồ sơ trong danh sách đã tải"
              >
                <span>
                  {selectedIndex >= 0
                    ? `Hồ sơ ${selectedIndex + 1} / ${items.length} đã tải`
                    : "Hồ sơ đang mở"}
                </span>
                <div>
                  {selectedIndex > 0 && (
                    <Link
                      to={itemPath(items[selectedIndex - 1].id)}
                      state={{ reviewReturnTo: queuePath }}
                    >
                      <ArrowUp size={15} aria-hidden="true" />
                      Trước
                    </Link>
                  )}
                  {selectedIndex >= 0 && selectedIndex < items.length - 1 && (
                    <Link
                      to={itemPath(items[selectedIndex + 1].id)}
                      state={{ reviewReturnTo: queuePath }}
                    >
                      Tiếp
                      <ArrowDown size={15} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </nav>
              <Suspense
                fallback={
                  <p role="status" className={styles.welcome}>
                    Đang mở hồ sơ…
                  </p>
                }
              >
                <Outlet context={user} />
              </Suspense>
            </>
          ) : (
            <div className={styles.welcome}>
              <BookOpen size={32} strokeWidth={1.4} aria-hidden="true" />
              {!items.length && !result.isPending ? (
                <>
                  <h2>
                    {result.isError
                      ? "Chưa tải được hàng hồ sơ."
                      : "Chưa có bài gửi trong mục này."}
                  </h2>
                  <p>
                    {result.isError
                      ? "Thử cập nhật danh sách ở bên trái. Hồ sơ sẽ xuất hiện khi tải thành công."
                      : `Chưa có hồ sơ ${labels[status].toLowerCase()} trong lần tải này. Bạn có thể đổi trạng thái hoặc cập nhật danh sách.`}
                  </p>
                </>
              ) : (
                <>
                  <h2>Chọn bài để kiểm duyệt</h2>
                  <p>
                    Ảnh bản sách, thông tin người đăng khai báo và phiếu quyết
                    định sẽ xuất hiện tại đây.
                  </p>
                </>
              )}
              {items[0] && (
                <Link
                  className="button primary"
                  to={itemPath(items[0].id)}
                  state={{ reviewReturnTo: queuePath }}
                >
                  Mở hồ sơ đầu tiên <ArrowDown size={17} aria-hidden="true" />
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
