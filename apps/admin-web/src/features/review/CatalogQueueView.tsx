import { useInfiniteQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  Link,
  Outlet,
  useLocation,
  useMatch,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import {
  categoryPath,
  languageLabel,
} from "@used-books/api-contract/catalog-taxonomy";
import { dateText } from "../../core/format";
import { session } from "../../core/session";
import { Button, CursorPagination } from "../../core/ui";
import { ListFeedback } from "../../core/list-feedback";
import { EmptyArt } from "../../core/EmptyArt";
import { useListMotion } from "../../core/task-motion";
import { catalog, labels, pageOf, type Catalog } from "./contracts";
import { reviewQueuePath, reviewReturnPath } from "./review-navigation";
import styles from "./CatalogReview.module.css";

const FILTERS = ["Pending", "Confirmed", "Rejected"] as const;

const queueStamp = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

function categorySummary(item: Catalog): string {
  const m = item.currentRevision.metadata;
  if (m.categoryId) {
    const trail = categoryPath(m.categoryId)
      .map((c) => c.label)
      .join(" / ");
    if (trail) return trail;
  }
  return m.category;
}

function matchesFilter(item: Catalog, needle: string): boolean {
  const m = item.currentRevision.metadata;
  const hay = [
    m.title,
    ...m.authors,
    m.publisher ?? "",
    m.isbn ?? "",
    m.category,
    m.series ?? "",
    item.id,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export function CatalogQueueView({ user }: { user: CurrentUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedId = useMatch("/review/catalog-requests/:id")?.params.id;
  const rowsRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const [filterText, setFilterText] = useState("");

  const status = (FILTERS as readonly string[]).includes(
    params.get("status") || "",
  )
    ? params.get("status")!
    : "Pending";

  const queuePath = reviewQueuePath("catalog-requests", status);
  const queueQuery = queuePath.slice("/review/catalog-requests".length);
  const returnTo = reviewReturnPath(
    "catalog-requests",
    location.state ?? { reviewReturnTo: queuePath },
  );

  const result = useInfiniteQuery({
    queryKey: ["queue", "catalog-requests", status, user.id],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams({ status, limit: "20" });
      if (pageParam) query.set("cursor", pageParam);
      return session.request(
        `/operations/catalog-requests?${query}`,
        pageOf(catalog),
      );
    },
    getNextPageParam: (page) => page.nextCursor || undefined,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 4_000,
  });

  const items = useMemo(
    () => result.data?.pages.flatMap((page) => page.items) ?? [],
    [result.data],
  );

  const needle = filterText.trim().toLowerCase();
  const visibleItems = useMemo(
    () => (needle ? items.filter((item) => matchesFilter(item, needle)) : items),
    [items, needle],
  );

  useListMotion(
    rowsRef,
    visibleItems.map((item) => `${item.id}:${item.version}`).join("/"),
  );

  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const itemPath = (id: string) =>
    `/review/catalog-requests/${id}${queueQuery}`;

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      navigate(returnTo, { state: { reviewOverview: true } });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, returnTo, navigate]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Yêu cầu đầu sách</h1>
          <p>
            Rà soát tên sách, tác giả, nhà xuất bản và mã ISBN trước khi đưa đầu
            sách vào danh mục dùng chung.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.iconBtn}
            aria-label="Cập nhật danh sách"
            title="Cập nhật danh sách"
            busy={result.isFetching}
            onClick={() => void result.refetch()}
          >
            <RefreshCw size={17} aria-hidden="true" />
          </Button>
          {!selectedId && items[0] && (
            <Link
              className={styles.primaryBtn}
              to={itemPath(items[0].id)}
              state={{ reviewReturnTo: queuePath }}
            >
              Mở hồ sơ đầu tiên
              <ChevronRight size={17} aria-hidden="true" />
            </Link>
          )}
        </div>
      </header>

      <div className={styles.filterBar}>
        <div
          className={styles.statusTabs}
          role="group"
          aria-label="Lọc trạng thái"
        >
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => {
                if (status !== value) {
                  setFilterText("");
                  setParams({ status: value });
                }
              }}
            >
              {labels[value]}
            </button>
          ))}
        </div>

        <div className={styles.filterRight}>
          <div className={styles.searchWrap}>
            <Search
              size={15}
              className={styles.searchIcon}
              aria-hidden="true"
            />
            <input
              type="search"
              className={styles.searchInput}
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              aria-label="Lọc nhanh theo tên sách, tác giả, NXB hoặc ISBN"
              placeholder="Lọc tên sách, tác giả, ISBN…"
            />
            {filterText && (
              <button
                type="button"
                className={styles.clearBtn}
                aria-label="Xóa từ khóa lọc"
                onClick={() => setFilterText("")}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          <span className={styles.queueCount}>
            {needle
              ? `${visibleItems.length} / ${items.length} hồ sơ đã tải`
              : `${items.length} hồ sơ đã tải · Cũ nhất trước`}
          </span>
        </div>
      </div>

      <div className={styles.feedbackWrap}>
        <ListFeedback result={result} loadingText="Đang tải hồ sơ…" />
      </div>

      {(items.length > 0 || result.isSuccess) && (
        <section
          id="review-queue"
          aria-label="Danh sách yêu cầu đầu sách"
          className={styles.tableCard}
        >
        {visibleItems.length > 0 && (
          <div className={styles.tableHead} aria-hidden="true">
            <span>Đầu sách & tác giả</span>
            <span>Nhà xuất bản · Năm</span>
            <span>Danh mục · Ngôn ngữ</span>
            <span>ISBN</span>
            <span>Gửi lúc</span>
            <span>Thao tác</span>
          </div>
        )}

        {result.isSuccess && items.length === 0 && (
          <div className={styles.emptyBox}>
            <EmptyArt variant="review" />
            <h2>Chưa có yêu cầu ở mục này.</h2>
            <p>
              Chưa có hồ sơ {labels[status].toLowerCase()} trong lần tải này.
              Bạn có thể đổi trạng thái hoặc cập nhật danh sách.
            </p>
          </div>
        )}

        {result.isSuccess && items.length > 0 && visibleItems.length === 0 && (
          <div className={styles.emptyBox}>
            <EmptyArt variant="review" />
            <h2>Không có đầu sách khớp từ khóa lọc.</h2>
            <p>
              Thử tên sách, tác giả, nhà xuất bản khác hoặc xóa từ khóa để xem
              toàn bộ {items.length} hồ sơ đã tải.
            </p>
            <Button onClick={() => setFilterText("")}>Xóa từ khóa lọc</Button>
          </div>
        )}

        <div
          className={`queue-list ${styles.rows}`}
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
          {visibleItems.map((item, index) => {
            const selected = selectedId === item.id;
            const m = item.currentRevision.metadata;
            const to = itemPath(item.id);
            const linkProps = {
              to,
              state: { reviewReturnTo: queuePath },
              "aria-current": selected ? ("page" as const) : undefined,
            };

            return (
              <article
                key={item.id}
                className={`queue-row ${styles.row} ${selected ? styles.rowSelected : ""}`}
                data-motion-key={item.id}
                data-motion-revision={item.version}
              >
                <div className={styles.rowIdentity}>
                  <h2 className={styles.rowTitle}>
                    <Link {...linkProps}>{m.title}</Link>
                  </h2>
                  <p className={styles.rowAuthors}>
                    {m.authors.join(" · ") || "Chưa ghi tác giả"}
                  </p>
                  <div className={styles.rowMetaRow}>
                    <span className={styles.rowCode}>
                      #{item.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className={styles.revTag}>
                      Bản {item.currentRevision.number}
                    </span>
                    {m.edition && <span>Ấn bản: {m.edition}</span>}
                  </div>
                </div>

                <div className={styles.cellPrimary}>
                  <strong className={!m.publisher ? styles.cellMuted : undefined}>
                    {m.publisher || "Chưa có NXB"}
                  </strong>
                  <span>
                    {m.publicationYear
                      ? `Năm ${m.publicationYear}`
                      : "Chưa rõ năm"}
                  </span>
                </div>

                <div className={styles.cellPrimary}>
                  <strong>{categorySummary(item)}</strong>
                  <span>{languageLabel(m.language)}</span>
                </div>

                <div
                  className={`${styles.isbnCell} ${!m.isbn ? styles.cellMuted : ""}`}
                >
                  {m.isbn || "Không có ISBN"}
                </div>

                <time
                  className={styles.timeCell}
                  dateTime={item.currentRevision.submittedAt}
                  title={dateText(item.currentRevision.submittedAt)}
                >
                  {queueStamp.format(new Date(item.currentRevision.submittedAt))}
                </time>

                <Link
                  {...linkProps}
                  className={`read-link ${styles.rowAction}`}
                  aria-label={`Đọc hồ sơ ${index + 1}: ${m.title}`}
                >
                  {selected
                    ? "Đang mở"
                    : item.status === "Pending"
                      ? "Kiểm tra"
                      : "Xem hồ sơ"}
                  <ChevronRight size={15} aria-hidden="true" />
                </Link>
              </article>
            );
          })}
        </div>

        {(result.data || result.hasNextPage) && (
          <footer className={styles.tableFooter}>
            <span>
              {result.data
                ? `Cập nhật ${dateText(result.data.pages[0].serverTime)} · ↑ ↓ Chọn dòng · Enter Mở`
                : ""}
            </span>
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
          </footer>
        )}
        </section>
      )}

      {selectedId && (() => {
        const drawer = (
          <div className={styles.drawerLayer}>
            <div
              className={styles.drawerBackdrop}
              aria-hidden="true"
              onClick={() =>
                navigate(returnTo, { state: { reviewOverview: true } })
              }
            />
            <aside
              className={styles.drawer}
              role="region"
              aria-label="Bàn đọc hồ sơ"
              data-review-dossier
            >
              <nav
                className={styles.drawerBar}
                aria-label="Chuyển hồ sơ trong danh sách đã tải"
              >
                <span className={styles.drawerPos}>
                  {selectedIndex >= 0
                    ? `Hồ sơ ${selectedIndex + 1} / ${items.length} đã tải`
                    : "Hồ sơ đang mở"}
                </span>
                <div className={styles.drawerBarActions}>
                  {selectedIndex > 0 && (
                    <Link
                      className={styles.drawerNavBtn}
                      to={itemPath(items[selectedIndex - 1].id)}
                      state={{ reviewReturnTo: queuePath }}
                    >
                      <ArrowUp size={15} aria-hidden="true" />
                      Trước
                    </Link>
                  )}
                  {selectedIndex >= 0 && selectedIndex < items.length - 1 && (
                    <Link
                      className={styles.drawerNavBtn}
                      to={itemPath(items[selectedIndex + 1].id)}
                      state={{ reviewReturnTo: queuePath }}
                    >
                      Tiếp
                      <ArrowDown size={15} aria-hidden="true" />
                    </Link>
                  )}
                  <Link
                    className={styles.drawerClose}
                    to={returnTo}
                    state={{ reviewOverview: true }}
                    aria-label="Đóng hồ sơ"
                    title="Đóng hồ sơ (Esc)"
                  >
                    <X size={17} aria-hidden="true" />
                  </Link>
                </div>
              </nav>
              <div className={styles.drawerBody}>
                <Suspense fallback={<p role="status">Đang mở hồ sơ…</p>}>
                  <Outlet context={user} />
                </Suspense>
              </div>
            </aside>
          </div>
        );
        return typeof document !== "undefined"
          ? createPortal(drawer, document.body)
          : drawer;
      })()}
    </div>
  );
}
