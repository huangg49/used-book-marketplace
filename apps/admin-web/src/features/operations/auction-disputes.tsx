import { useRef } from "react";
import {
  ArrowRight,
  Coins,
  FileText,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Link,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import {
  supportKinds,
  supportPageSchema,
  supportStates,
  type CurrentUser,
  type SupportCase,
  type SupportPage,
} from "@used-books/session-client";
import { dateText } from "../../core/format";
import { canResolve, session } from "../../core/session";
import { Button, CursorPagination, Notice } from "../../core/ui";
import { EmptyArt } from "../../core/EmptyArt";
import { ListFeedback } from "../../core/list-feedback";
import { Forbidden } from "./queue-frame";
// Owner request 18/11: the auction queue shares the exchange complaint styling.
import styles from "./exchange-disputes.module.css";

export const auctionDisputesPath = "/operations/auction-disputes";
// SupportDetailPage reads this to offer the way back to this queue.
export const auctionDisputesOrigin = "auction-disputes";

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("vi")
    .replaceAll("đ", "d")
    .trim();

// Support states reuse the exchange stage colours so the queue reads the same.
const phase: Record<SupportCase["state"], string | undefined> = {
  Open: "NeedsReview",
  InReview: "Evidence",
  AwaitingMember: "ReturnOrdered",
  Answered: "Settled",
  Closed: undefined,
};

const stateLabel = (state: SupportCase["state"]) =>
  state === "AwaitingMember"
    ? "Chờ thành viên bổ sung"
    : supportStates[state];

const code = (id: string) => "#" + id.slice(0, 8).toUpperCase();

const assigneeLabel = (item: SupportCase, owner: string) =>
  item.assigneeId
    ? item.assigneeId === owner
      ? "Bạn đang phụ trách"
      : "Admin khác đang phụ trách"
    : "Chưa có người phụ trách";

export function AuctionDisputesPage() {
  const user = useOutletContext<CurrentUser>();
  return canResolve(user) ? (
    <AuctionDisputesContent user={user} />
  ) : (
    <Forbidden />
  );
}

function AuctionDisputesContent({ user }: { user: CurrentUser }) {
  const [params, setParams] = useSearchParams();
  const query = params.get("q")?.trim() ?? "";
  // ADR 0078/0079: auction complaints are Admin support cases about an auction.
  // The queue never freezes or closes an auction by itself.
  const result = useInfiniteQuery({
    queryKey: ["operations", "auction-disputes", user.id],
    staleTime: 0,
    refetchOnMount: "always",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: SupportPage) => page.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      session.request(
        `/operations/support-cases?${new URLSearchParams({
          limit: "20",
          targetType: "Auction",
          ...(pageParam ? { cursor: pageParam } : {}),
        })}`,
        supportPageSchema,
      ),
    retry: false,
    refetchInterval: 6_000,
    refetchIntervalInBackground: false,
  });
  const rows = result.data?.pages.flatMap((page) => page.items) ?? [];
  const terms = normalizeSearch(query.replace(/^#/, ""))
    .split(/\s+/)
    .filter(Boolean);
  const filtered = rows.filter((item) => {
    if (!terms.length) return true;
    const searchable = normalizeSearch(
      [
        item.id,
        item.title,
        item.reporterName,
        item.target?.id ?? "",
        supportKinds[item.kind],
        stateLabel(item.state),
      ].join(" "),
    );
    return terms.every((term) => searchable.includes(term));
  });
  const waiting = rows.filter((item) => item.state === "AwaitingMember").length;
  const unassigned = rows.filter((item) => !item.assigneeId).length;
  const search = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div className="page-heading">
          <h1>Khiếu nại đấu giá</h1>
          <p className="intro">
            Đối chiếu báo cáo về phiên, người báo và tiền cọc đang giữ trước khi
            quyết định.
          </p>
        </div>
        <Button busy={result.isFetching} onClick={() => void result.refetch()}>
          {!result.isFetching && <RefreshCw size={16} aria-hidden="true" />}
          Cập nhật danh sách
        </Button>
      </header>

      <Notice tone="info">
        Hồ sơ khiếu nại không tự tạm dừng hay đóng phiên đấu giá, cũng không
        hoàn tiền. Mở hồ sơ để tạm dừng hoặc đóng phiên với lời nhắn gửi người
        bán và người tham gia.
      </Notice>

      {rows.length > 0 && (
        <section className={styles.metricsBar} aria-label="Tổng quan khiếu nại">
          <div className={styles.metricCard}>
            <div className={styles.metricIconWrap}>
              <FileText size={18} aria-hidden="true" />
            </div>
            <div className={styles.metricData}>
              <span className={styles.metricLabel}>Hồ sơ đã tải</span>
              <strong className={styles.metricValue}>{rows.length} hồ sơ</strong>
            </div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricIconWrap} data-tone="warning">
              <Coins size={18} aria-hidden="true" />
            </div>
            <div className={styles.metricData}>
              <span className={styles.metricLabel}>Chờ thành viên bổ sung</span>
              <strong className={styles.metricValue}>{waiting} hồ sơ</strong>
            </div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricIconWrap} data-tone="info">
              <ShieldAlert size={18} aria-hidden="true" />
            </div>
            <div className={styles.metricData}>
              <span className={styles.metricLabel}>Chưa có người phụ trách</span>
              <strong className={styles.metricValue}>{unassigned} hồ sơ</strong>
            </div>
          </div>
        </section>
      )}

      <section className={styles.queue} aria-labelledby="auction-queue-title">
        <header className={styles.queueHeader}>
          <div>
            <h2 id="auction-queue-title">Hồ sơ chờ xử lý</h2>
            <p>
              Giữ nguyên lượt trả giá, đăng ký và tiền cọc cho tới khi có quyết
              định.
            </p>
          </div>
          {rows.length > 0 && (
            <p className={styles.queueCount}>
              {filtered.length === rows.length
                ? `${rows.length} hồ sơ`
                : `${filtered.length} / ${rows.length} hồ sơ`}{" "}
              · Mới nhất trước
            </p>
          )}
        </header>
        {rows.length > 0 && (
          <form
            className={styles.queueSearch}
            role="search"
            aria-label="Tìm hồ sơ khiếu nại đấu giá"
            onSubmit={(event) => {
              event.preventDefault();
              const value = String(
                new FormData(event.currentTarget).get("query") ?? "",
              ).trim();
              setParams(value ? { q: value } : {});
            }}
          >
            <label>
              Tìm hồ sơ
              <input
                key={query}
                ref={search}
                type="search"
                name="query"
                defaultValue={query}
                placeholder="Mã hồ sơ, mã phiên, tên người báo hoặc tiêu đề"
              />
            </label>
            <Button type="submit">
              <Search size={16} aria-hidden="true" /> Tìm
            </Button>
            {query && <Button onClick={() => setParams({})}>Xóa tìm kiếm</Button>}
          </form>
        )}
        <ListFeedback result={result} loadingText="Đang tải hồ sơ…" />
        {result.isSuccess && !rows.length && (
          <div className="empty">
            <EmptyArt variant="inbox" />
            <h3>Chưa có khiếu nại đấu giá nào.</h3>
            <p>Chưa có hồ sơ về phiên đấu giá trong danh sách bạn được xem.</p>
          </div>
        )}
        {result.isSuccess && rows.length > 0 && !filtered.length && (
          <div className="empty">
            <h3>Không tìm thấy hồ sơ phù hợp.</h3>
            <p>Đổi từ khóa hoặc tải thêm hồ sơ rồi tìm lại.</p>
          </div>
        )}
        <ol className={styles.queueList}>
          {filtered.map((item) => (
            <li className={styles.queueRow} key={item.id}>
              <div className={styles.queueIdentity}>
                <span className={styles.avatar} aria-hidden="true">
                  {item.reporterName.slice(0, 1).toLocaleUpperCase("vi")}
                </span>
                <div>
                  <h3 className={styles.caseTitle}>{item.reporterName}</h3>
                  <span className={styles.muted}>
                    Phiên đấu giá · Hồ sơ {code(item.id)}
                  </span>
                </div>
              </div>
              <div className={styles.queueSummary}>
                <p>{item.title}</p>
                <span className={styles.muted}>
                  {supportKinds[item.kind]}
                  {item.target ? ` · Phiên ${code(item.target.id)}` : ""}
                </span>
                {item.otherOpenOnTarget ? (
                  <span className={styles.muted}>
                    Còn {item.otherOpenOnTarget} hồ sơ khác đang mở về cùng
                    phiên.
                  </span>
                ) : null}
              </div>
              <div className={styles.queueStage}>
                <span className={styles.stage} data-phase={phase[item.state]}>
                  {stateLabel(item.state)}
                </span>
                <time className={styles.muted} dateTime={item.createdAt}>
                  {dateText(item.createdAt)}
                </time>
              </div>
              <div className={styles.queueActions}>
                <span className={styles.muted}>
                  {assigneeLabel(item, user.id)}
                </span>
                <Link
                  className={styles.caseLink}
                  to={`/support/${item.id}?from=${auctionDisputesOrigin}`}
                >
                  Mở hồ sơ <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </li>
          ))}
        </ol>
        <CursorPagination
          pageCount={result.data?.pages.length ?? 0}
          hasNextPage={!!result.hasNextPage}
          isFetching={result.isFetching}
          isFetchingNextPage={result.isFetchingNextPage}
          error={result.isFetchNextPageError ? result.error : undefined}
          onNextPage={() => void result.fetchNextPage({ cancelRefetch: false })}
          nextLabel="Xem thêm hồ sơ"
        />
        {query && (
          <p className={styles.muted} role="status">
            Tìm kiếm chỉ áp dụng cho các hồ sơ đã tải.
          </p>
        )}
      </section>
    </div>
  );
}
