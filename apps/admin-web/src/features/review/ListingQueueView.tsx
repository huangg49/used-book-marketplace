import { Suspense, useLayoutEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import {
  Link,
  Outlet,
  useLocation,
  useMatch,
  useSearchParams,
} from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { canReviewCatalog, session } from "../../core/session";
import { dateText, money } from "../../core/format";
import { CursorPagination } from "../../core/ui";
import { ListFeedback } from "../../core/list-feedback";
import { EmptyArt } from "../../core/EmptyArt";
import { useListMotion } from "../../core/task-motion";
import { labels, listing, pageOf, type Listing } from "./contracts";
import { ListingTitle } from "./ListingTitle";
import { QueueCover } from "./QueueCover";
import {
  REVIEW_SEARCH_MAX_LENGTH,
  reviewQueuePath,
  reviewReturnPath,
  reviewSearchText,
} from "./review-navigation";
import styles from "./ListingReview.module.css";

const filters = ["PendingReview", "Approved", "Rejected"] as const;

const queueStamp = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

function catalogChipFor(status: Listing["catalogStatus"]) {
  if (status === "Confirmed") {
    return { state: "confirmed", label: "Đã xác nhận", Icon: CheckCircle2 };
  }
  if (status === "Rejected") {
    return { state: "rejected", label: "Đầu sách từ chối", Icon: XCircle };
  }
  return { state: "pending", label: "Chờ duyệt đầu sách", Icon: Clock3 };
}

function priceSummary(item: Listing) {
  const c = item.currentRevision.content;
  if (item.channel === "Auction") {
    return { primary: money(c.salePrice), secondary: "Đấu giá · Giá trị khai báo" };
  }
  if (c.mode === "Exchange") {
    return { primary: money(c.exchangeValue), secondary: "Đổi sách" };
  }
  if (c.mode === "Both") {
    return {
      primary: money(c.salePrice),
      secondary: `Bán hoặc đổi · Đổi ${money(c.exchangeValue)}`,
    };
  }
  return { primary: money(c.salePrice), secondary: c.bundle ? `Bộ ${c.bundle.items.length} cuốn` : "Bán sách" };
}

export function ListingQueueView({ user }: { user: CurrentUser }) {
  const location = useLocation();
  const selectedId = useMatch("/review/listings/:id")?.params.id;
  const rowsRef = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [params, setParams] = useSearchParams();

  const status = filters.includes((params.get("status") || "") as (typeof filters)[number])
    ? params.get("status")!
    : filters[0];
  const q = reviewSearchText(params.get("q"));
  const queuePath = reviewQueuePath("listings", status, { q });
  const queueQuery = queuePath.slice("/review/listings".length);

  useLayoutEffect(() => {
    if (searchInput.current) searchInput.current.value = q;
  }, [q]);

  function applyFilters(nextStatus: string, nextQuery: string) {
    const returnTo = reviewQueuePath("listings", nextStatus, { q: nextQuery });
    setParams(returnTo.slice(returnTo.indexOf("?")), {
      state: { reviewOverview: true },
    });
  }

  const result = useInfiniteQuery({
    queryKey: ["queue", "listings", status, user.id, ...(q ? [{ q }] : [])],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams({ moderation: status, limit: "20" });
      if (q) query.set("q", q);
      if (pageParam) query.set("cursor", pageParam);
      return session.request(`/operations/listings?${query}`, pageOf(listing));
    },
    getNextPageParam: (page) => page.nextCursor || undefined,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 4_000,
  });

  const items = result.data?.pages.flatMap((page) => page.items) || [];
  useListMotion(
    rowsRef,
    items.map((item) => `${item.id}:${item.version}`).join("/"),
  );

  const selectedIndex = selectedId
    ? items.findIndex((item) => item.id === selectedId)
    : -1;
  const itemPath = (id: string) => `/review/listings/${id}${queueQuery}`;
  const firstActionable = items.find((item) => item.ownerId !== user.id) || items[0];

  if (selectedId) {
    const returnTo = reviewReturnPath(
      "listings",
      location.state ?? { reviewReturnTo: queuePath },
    );
    return (
      <div className={styles.page}>
        <nav
          className={styles.focusBar}
          aria-label="Điều hướng hồ sơ bài đăng"
        >
          <div className={styles.focusBarLeft}>
            <Link
              className={styles.backBtn}
              to={returnTo}
              state={{ reviewOverview: true }}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              Hàng chờ bài đăng
            </Link>
            <span className={styles.focusPos}>
              {selectedIndex >= 0
                ? `Hồ sơ ${selectedIndex + 1} / ${items.length} đã tải · ${labels[status]}`
                : `Hồ sơ đang mở · ${labels[status]}`}
            </span>
          </div>
          <div className={styles.focusNav}>
            {selectedIndex > 0 && (
              <Link
                className={styles.seqLink}
                to={itemPath(items[selectedIndex - 1].id)}
                state={{ reviewReturnTo: queuePath }}
              >
                <ChevronLeft size={15} aria-hidden="true" />
                Trước
              </Link>
            )}
            {selectedIndex >= 0 && selectedIndex < items.length - 1 && (
              <Link
                className={styles.seqLink}
                to={itemPath(items[selectedIndex + 1].id)}
                state={{ reviewReturnTo: queuePath }}
              >
                Tiếp
                <ChevronRight size={15} aria-hidden="true" />
              </Link>
            )}
          </div>
        </nav>

        <Suspense
          fallback={
            <p role="status">Đang mở hồ sơ…</p>
          }
        >
          <Outlet context={user} />
        </Suspense>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.queueHeader}>
        <div>
          <h1>Bài đăng sách</h1>
          <p>
            Quét nhanh hàng chờ, chọn hồ sơ để soi ảnh thật, tình trạng và duyệt
            trong không gian tập trung.
          </p>
        </div>
        <div className={styles.queueHeaderActions}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Cập nhật danh sách"
            title="Cập nhật danh sách"
            disabled={result.isFetching}
            onClick={() => void result.refetch()}
          >
            <RefreshCw size={17} aria-hidden="true" />
          </button>
          {firstActionable && (
            <Link
              className={styles.startReviewBtn}
              to={itemPath(firstActionable.id)}
              state={{ reviewReturnTo: queuePath }}
            >
              {status === "PendingReview" ? "Bắt đầu duyệt" : "Mở hồ sơ đầu tiên"}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </div>
      </header>

      <section className={styles.filterBar} aria-label="Bộ lọc bài đăng sách">
        <div className={styles.statusTabs} role="group" aria-label="Lọc trạng thái">
          {filters.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => {
                if (status !== value) applyFilters(value, q);
              }}
            >
              {labels[value]}
            </button>
          ))}
        </div>

        <div className={styles.filterRight}>
          <form
            className={styles.searchForm}
            role="search"
            aria-label="Tìm hồ sơ bài đăng"
            onSubmit={(event) => {
              event.preventDefault();
              const next = reviewSearchText(
                String(new FormData(event.currentTarget).get("q") ?? ""),
              );
              if (next !== q) applyFilters(status, next);
            }}
          >
            <div className={styles.searchWrap}>
              <input
                ref={searchInput}
                type="search"
                name="q"
                defaultValue={q}
                maxLength={REVIEW_SEARCH_MAX_LENGTH}
                aria-label="Tên sách hoặc mã hồ sơ"
                placeholder="Tìm tên sách hoặc #mã"
              />
              {q && (
                <button
                  type="button"
                  className={styles.clearBtn}
                  aria-label="Xóa tìm kiếm"
                  onClick={() => {
                    searchInput.current?.focus();
                    applyFilters(status, "");
                  }}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className={styles.searchSubmit}
              aria-label="Tìm hồ sơ"
              title="Tìm hồ sơ"
            >
              <Search size={16} aria-hidden="true" />
            </button>
          </form>
          <span className={styles.queueCount}>
            {items.length} hồ sơ đã tải · Cũ nhất trước
          </span>
        </div>
      </section>

      <div className={styles.feedbackWrap}>
        <ListFeedback result={result} loadingText="Đang tải hồ sơ…" />
      </div>

      <section className={styles.tableCard} aria-label="Hàng chờ kiểm duyệt">
        {result.isSuccess && items.length === 0 && (
          <div className={styles.emptyBox}>
            <EmptyArt variant="review" />
            <h2>
              {q ? "Không tìm thấy hồ sơ phù hợp." : "Chưa có hồ sơ ở mục này."}
            </h2>
            <p>
              {q
                ? "Thử tên khác, mã hồ sơ hoặc đổi bộ lọc trạng thái."
                : "Danh sách sẽ tự cập nhật khi có bài gửi mới."}
            </p>
          </div>
        )}

        {items.length > 0 && (
          <>
            <div className={styles.tableHead} aria-hidden="true">
              <span>Bản sách</span>
              <span>Giá & hình thức</span>
              <span>Đầu sách</span>
              <span>Gửi lúc</span>
              <span>Thao tác</span>
            </div>

            <div
              className={styles.rows}
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
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                  return;
                if (!(event.target instanceof HTMLAnchorElement)) return;
                const links = Array.from(
                  event.currentTarget.querySelectorAll<HTMLAnchorElement>(
                    ".read-link",
                  ),
                );
                const row = event.target.closest("article");
                const current = links.findIndex(
                  (link) => link.closest("article") === row,
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
                const chip = catalogChipFor(item.catalogStatus);
                const ChipIcon = chip.Icon;
                const price = priceSummary(item);
                const cond = labels[item.currentRevision.content.condition || ""];
                const to = itemPath(item.id);
                return (
                  <article
                    key={item.id}
                    className={styles.row}
                    data-motion-key={item.id}
                    data-motion-revision={item.version}
                  >
                    <div className={styles.rowBook}>
                      <div className={styles.rowCover}>
                        <QueueCover value={item} />
                      </div>
                      <div className={styles.rowBookText}>
                        <h2 className={styles.rowTitle} id={`listing-row-${item.id}`}>
                          <Link to={to} state={{ reviewReturnTo: queuePath }}>
                            <ListingTitle
                              value={item}
                              canReadPendingCatalog={canReviewCatalog(user)}
                            />
                          </Link>
                        </h2>
                        <div className={styles.rowSub}>
                          <span className={styles.rowCode}>
                            #{item.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span>Bản gửi {item.currentRevision.number}</span>
                          {cond && <span className={styles.rowTag}>{cond}</span>}
                          {item.channel === "Auction" && (
                            <span className={styles.rowTag}>Đấu giá</span>
                          )}
                          {item.currentRevision.content.bundle && (
                            <span className={styles.rowTag}>
                              Bộ {item.currentRevision.content.bundle.items.length} cuốn
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={styles.rowPrice}>
                      <strong>{price.primary}</strong>
                      <span>{price.secondary}</span>
                    </div>

                    <div>
                      <span className={styles.catalogChip} data-state={chip.state}>
                        <ChipIcon size={14} aria-hidden="true" />
                        {chip.label}
                      </span>
                    </div>

                    <div className={styles.rowTime}>
                      {item.currentRevision.submittedAt ? (
                        <time
                          dateTime={item.currentRevision.submittedAt}
                          title={dateText(item.currentRevision.submittedAt)}
                        >
                          {queueStamp.format(
                            new Date(item.currentRevision.submittedAt),
                          )}
                        </time>
                      ) : (
                        "—"
                      )}
                    </div>

                    <Link
                      className={`read-link ${styles.rowAction}`}
                      to={to}
                      state={{ reviewReturnTo: queuePath }}
                      aria-label={`Kiểm tra hồ sơ ${index + 1}`}
                      aria-describedby={`listing-row-${item.id}`}
                    >
                      Kiểm tra
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </article>
                );
              })}
            </div>
          </>
        )}

        <div className={styles.tableFooter}>
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
          {result.data && (
            <span>
              Cập nhật {dateText(result.data.pages[0].serverTime)} · ↑ ↓ Chọn ·
              Enter Mở
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
