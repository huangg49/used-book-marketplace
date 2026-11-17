import { dateText } from "../../core/format";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  ChevronRight,
  PanelLeft,
  RefreshCw,
  Search,
  X,
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
import { PaperSelect } from "../../core/PaperSelect";
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
import {
  REVIEW_SEARCH_MAX_LENGTH,
  reviewQueuePath,
  reviewReturnPath,
  reviewSearchText,
} from "./review-navigation";
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
const queueStamp = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

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
  const listRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<HTMLElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
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
  const q = kind === "listings" ? reviewSearchText(params.get("q")) : "";
  useLayoutEffect(() => {
    if (searchInput.current) searchInput.current.value = q;
  }, [q]);
  const positionKey = JSON.stringify([user.id, kind, status, ai, q]);
  const queuePath = reviewQueuePath(kind, status, { ai, q });
  const queueQuery = queuePath.slice(`/review/${kind}`.length);
  function applyFilters(nextStatus: string, nextAi: string, nextQuery: string) {
    if (kind === "catalog-requests") {
      setParams({ status: nextStatus });
      return;
    }
    const returnTo = reviewQueuePath(kind, nextStatus, { ai: nextAi, q: nextQuery });
    setParams(returnTo.slice(returnTo.indexOf("?")), {
      state: selectedId
        ? { reviewReturnTo: returnTo }
        : q || nextQuery ? { reviewOverview: true } : undefined,
    });
  }
  function rememberScroll(event: UIEvent<HTMLElement>) {
    if (queueScroll.size > 40) queueScroll.clear();
    queueScroll.set(positionKey, event.currentTarget.scrollTop);
  }
  const result = useInfiniteQuery({
    queryKey: ["queue", kind, status, user.id, ...(ai ? [ai] : []), ...(q ? [{ q }] : [])],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams({ [kind === "listings" ? "moderation" : "status"]: status, limit: "20" });
      if (ai) query.set("aiOutcome", ai);
      if (q) query.set("q", q);
      if (pageParam) query.set("cursor", pageParam);
      const path = `/operations/${kind}?${query}`;
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
    const scroller = kind === "listings" ? listRef.current : queueRef.current;
    if (scroller) scroller.scrollTop = queueScroll.get(positionKey) ?? 0;
  }, [kind, positionKey, selectedId, items.length, showQueue]);
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const itemPath = (id: string) => `/review/${kind}/${id}${queueQuery}`;
  const firstId = items[0]?.id;
  // Start with actual work, once. An explicit Back keeps the list open; an open
  // dossier is never switched by polling or by a new first item in the queue.
  useEffect(() => {
    if (
      kind !== "listings" ||
      selectedId ||
      !firstId ||
      q ||
      !result.isSuccess ||
      (location.state as { reviewOverview?: boolean } | null)?.reviewOverview
    )
      return;
    navigate(
      `/review/${kind}/${firstId}${queueQuery}`,
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
    q,
    queueQuery,
    queuePath,
  ]);
  const queueToggle = selectedId && (
    <Button
      className={styles.queueToggle}
      aria-expanded={showQueue}
      aria-controls="review-queue"
      onClick={() => setShowQueue(!showQueue)}
    >
      <PanelLeft size={18} aria-hidden="true" />
      {showQueue ? "Ẩn hàng chờ" : "Mở hàng chờ"}
    </Button>
  );
  return (
    <div className={styles.workspace}>
      <header className={`${styles.heading} ${kind === "listings" && selectedId ? styles.listingPageHeading : ""}`}>
        <div>
          <h1>{kind === "listings" ? "Bài đăng sách" : "Yêu cầu đầu sách"}</h1>
          {(!selectedId || kind !== "listings") && (
            <p>
              {kind === "listings"
                ? "Kiểm tra tình trạng và ảnh của từng bản sách."
                : "Kiểm tra tên sách, tác giả và thông tin xuất bản trước khi đưa vào danh mục dùng chung."}
            </p>
          )}
        </div>
        <div className={styles.headerMeta}>
          <span>Không gian kiểm duyệt</span>
          <strong>{labels[status]}</strong>
        </div>
        {kind === "listings" && queueToggle}
      </header>
      {kind !== "listings" && queueToggle}
      <div className={`${styles.desk} ${kind === "listings" ? styles.listingDesk : ""}`}>
        <section
          id="review-queue"
          aria-label="Hàng chờ kiểm duyệt"
          ref={queueRef}
          tabIndex={0}
          onScroll={kind === "catalog-requests" ? rememberScroll : undefined}
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
            <div
              className={kind === "listings" ? styles.statusFilters : "tabs"}
              role="group"
              aria-label="Lọc trạng thái"
            >
              {filters.map((value) => (
                <Button
                  key={value}
                  aria-pressed={status === value}
                  onClick={() => {
                    if (status !== value) applyFilters(value, "", q);
                  }}
                >
                  {labels[value]}
                </Button>
              ))}
            </div>
            {aiFilters.length > 0 && (
              <div className={styles.aiFilter}>
                <PaperSelect
                  label="Lọc theo AI"
                  value={ai}
                  choices={[
                    ["", "Tất cả"],
                    ...aiFilters.map((value) => [value, aiFilterLabels[value]] as const),
                  ]}
                  onChange={(value) => {
                    if (ai !== value) applyFilters(status, value, q);
                  }}
                />
              </div>
            )}
          </div>
          {kind === "listings" && (
            <form
              className={styles.queueSearch}
              role="search"
              aria-label="Tìm hồ sơ bài đăng"
              onSubmit={(event) => {
                event.preventDefault();
                const next = reviewSearchText(String(new FormData(event.currentTarget).get("q") ?? ""));
                if (next !== q) applyFilters(status, ai, next);
              }}
            >
              <div className={styles.searchField}>
                <input
                  ref={searchInput}
                  type="search"
                  name="q"
                  defaultValue={q}
                  maxLength={REVIEW_SEARCH_MAX_LENGTH}
                  aria-label="Tên sách hoặc mã hồ sơ"
                  placeholder="Tên sách hoặc #mã"
                />
                {q && (
                  <Button
                    className={styles.clearSearch}
                    aria-label="Xóa tìm kiếm"
                    onClick={() => {
                      searchInput.current?.focus();
                      applyFilters(status, ai, "");
                    }}
                  >
                    <X size={15} aria-hidden="true" />
                  </Button>
                )}
              </div>
              <Button type="submit" aria-label="Tìm hồ sơ" title="Tìm hồ sơ">
                <Search size={17} aria-hidden="true" />
              </Button>
            </form>
          )}
          <p className={styles.queueSummary}>
            {items.length} hồ sơ đã tải · Cũ nhất trước
          </p>
          <div
            className={styles.queueScroll}
            ref={kind === "listings" ? listRef : undefined}
            onScroll={kind === "listings" ? rememberScroll : undefined}
            role="region"
            aria-label="Danh sách hồ sơ"
          >
            <ListFeedback result={result} loadingText="Đang tải hồ sơ…" />
            {result.isSuccess && items.length === 0 && (
              <div className="empty">
                <EmptyArt variant="review" />
                <h2>{q ? "Không tìm thấy hồ sơ phù hợp." : "Chưa có hồ sơ ở mục này."}</h2>
                <p>{q ? "Thử tên khác, mã hồ sơ hoặc đổi bộ lọc." : "Danh sách sẽ cập nhật khi có lần gửi phù hợp."}</p>
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
              {items.map((item, index) => {
                const selected = selectedId === item.id;
                const link = {
                  to: itemPath(item.id),
                  state: { reviewReturnTo: queuePath },
                  "aria-current": selected ? "page" as const : undefined,
                };
                return (
                  <article
                    className={`queue-row ${selected ? styles.selected : ""}`}
                    key={item.id}
                    data-motion-key={item.id}
                    data-motion-revision={item.version}
                  >
                    {"state" in item ? (
                      <>
                        <QueueCover value={item} />
                        <Link
                          {...link}
                          className={`read-link ${styles.listingRowLink}`}
                          aria-label={`Đọc hồ sơ ${index + 1}`}
                          aria-describedby={`queue-title-${item.id}`}
                        >
                          <div className={styles.queueIdentity}>
                            <h2 id={`queue-title-${item.id}`}>
                              <ListingTitle value={item} canReadPendingCatalog={canReviewCatalog(user)} />
                            </h2>
                            <div className={styles.listingRowMeta}>
                              <span>#{item.id.slice(0, 8).toUpperCase()}</span>
                              {item.currentRevision.submittedAt && (
                                <time
                                  dateTime={item.currentRevision.submittedAt}
                                  title={dateText(item.currentRevision.submittedAt)}
                                >
                                  {queueStamp.format(new Date(item.currentRevision.submittedAt))}
                                </time>
                              )}
                            </div>
                            {item.autoReview && (
                              <span className={styles.listingRowAi}>{aiFilterLabels[item.autoReview.outcome]}</span>
                            )}
                          </div>
                          <ChevronRight size={16} aria-hidden="true" />
                        </Link>
                      </>
                    ) : (
                      <>
                        <div className={styles.queueIdentity}>
                          <div className="row-meta">
                            <span>{labels[item.status]}</span>
                            <span>Bản {item.currentRevision.number}</span>
                          </div>
                          <h2><Link {...link}>{item.currentRevision.metadata.title}</Link></h2>
                          <p className="muted">
                            {item.currentRevision.metadata.authors.join(" · ")} ·{" "}
                            {item.currentRevision.metadata.publisher || "Chưa có nhà xuất bản"}
                          </p>
                          <p className={styles.submittedTime}>{dateText(item.currentRevision.submittedAt)}</p>
                        </div>
                        <Link {...link} className="read-link" aria-label={`Đọc hồ sơ ${index + 1}`}>
                          Đọc hồ sơ <span aria-hidden="true">↗</span>
                        </Link>
                      </>
                    )}
                  </article>
                );
              })}
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
                {kind === "listings" && (
                  <Link
                    className={styles.sequenceBack}
                    to={reviewReturnPath(kind, location.state ?? { reviewReturnTo: queuePath })}
                    state={{ reviewOverview: true }}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Về danh sách
                  </Link>
                )}
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
