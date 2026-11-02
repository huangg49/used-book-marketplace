import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText } from "../../core/format";
import { ListFeedback } from "../../core/list-feedback";
import { canReview, session } from "../../core/session";
import { CursorPagination, ErrorNotice, Notice } from "../../core/ui";
import { autoReviewCheck, autoReviewReport, pageOf } from "./contracts";
import { reasonLabel } from "./auto-review-view";
import styles from "./AutoReview.module.css";

export function AutoReviewChecksPage() {
  const user = useOutletContext<CurrentUser | undefined>();
  if (user && !canReview(user)) return <p>Không có quyền xem khu vực này.</p>;
  return <ChecksContent />;
}

// Only AI approvals a person still has to look at. Listings the AI sent to a
// person are already in the review queue and are not counted again here.
function ChecksContent() {
  const report = useQuery({
    queryKey: ["auto-review-report"],
    queryFn: () => session.request("/operations/auto-review/report", autoReviewReport),
  });
  const checks = useInfiniteQuery({
    queryKey: ["auto-review-checks", "Open"],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      session.request(
        `/operations/auto-review/checks?status=Open&limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        pageOf(autoReviewCheck),
      ),
    getNextPageParam: (page) => page.nextCursor || undefined,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
  const items = checks.data?.pages.flatMap((page) => page.items) ?? [];
  const r = report.data;
  return (
    <div className={styles.page}>
      <header>
        <h1>Hậu kiểm AI</h1>
        <p>
          Các bài AI đã duyệt cần người xem lại: lấy mẫu ngẫu nhiên hoặc bị đánh
          dấu khi kiểm tra lại. Cảnh báo không tự gỡ bài.
        </p>
      </header>
      {report.error && (
        <ErrorNotice
          error={report.error}
          retry={() => void report.refetch()}
          busy={report.isFetching}
        />
      )}
      {r && !(r.enabled && r.policyApproved) && (
        <Notice tone="warning">
          AI đang tắt: {r.enabled ? `phiên bản ${r.policyVersion} chưa được phê duyệt` : "cờ tính năng chưa bật"}.
          Mọi bài mới do người kiểm duyệt quyết định.
        </Notice>
      )}
      {r && (
        <dl className={styles.stats} aria-label={`Số liệu ${r.windowDays} ngày`}>
          <div>
            <dt>AI đã duyệt</dt>
            <dd>{r.approved}</dd>
          </div>
          <div>
            <dt>AI chuyển người duyệt</dt>
            <dd>{r.escalated}</dd>
          </div>
          <div>
            <dt>Người duyệt sau khi chuyển</dt>
            <dd>
              {r.escalatedThenApproved} duyệt · {r.escalatedThenRejected} từ chối
            </dd>
          </div>
          <div>
            <dt>Chờ người xem</dt>
            <dd>{r.checksOpen}</dd>
          </div>
          <div>
            <dt>Người xác nhận có vấn đề</dt>
            <dd>
              {r.staffConfirmedProblems} / {r.staffReviewedChecks}
              {r.overturnRate === null
                ? " · chưa có số liệu"
                : ` · ${Math.round(r.overturnRate * 100)}%`}
            </dd>
          </div>
          <div>
            <dt>Chi phí mô hình</dt>
            <dd>{(r.costMicroUsd / 1e6).toFixed(2)} USD</dd>
          </div>
        </dl>
      )}
      <section aria-label="Cảnh báo chờ xem">
        <h2>Chờ người xem</h2>
        <ListFeedback result={checks} loadingText="Đang tải cảnh báo…" />
        {checks.isSuccess && items.length === 0 && (
          <div className="empty">
            <span className="folio">—</span>
            <h2>Không có cảnh báo nào.</h2>
            <p>Danh sách cập nhật khi có bài cần xem lại.</p>
          </div>
        )}
        <ul className={styles.checks}>
          {items.map((check) => (
            <li key={check.id}>
              <Link to={`/review/listings/${check.listingId}?status=Approved`}>
                Hồ sơ #{check.listingId.slice(0, 8)}
              </Link>
              {" · "}
              {dateText(check.createdAt)}
              <ul>
                {check.reasons.map((code) => (
                  <li key={code}>{reasonLabel(code)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <CursorPagination
          pageCount={checks.data?.pages.length ?? 0}
          hasNextPage={checks.hasNextPage}
          isFetchingNextPage={checks.isFetchingNextPage}
          isFetching={checks.isFetching}
          error={checks.isFetchNextPageError ? checks.error : undefined}
          onNextPage={() => void checks.fetchNextPage({ cancelRefetch: false })}
          nextLabel="Xem thêm cảnh báo"
        />
      </section>
    </div>
  );
}
