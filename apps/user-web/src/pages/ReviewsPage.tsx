import { reviewDate } from "../features/reviews/format";
import type { ReviewTransactionsPage } from "@used-books/session-client";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  reviewTransactionsSchema,
  memberReputationSchema,
  reviewTypes,
  ApiError,
  type ReviewType,
} from "@used-books/session-client";
import { session } from "../lib/session";
import { useSession } from "../hooks/useSession";
import { TransactionReviewPanel } from "../features/reviews/TransactionReviewPanel";
import { MemberReputationView } from "../features/reviews/MemberReputationView";
import styles from "../features/reviews/reviews.module.css";
import {
  Star,
  Repeat,
  Package,
  Gavel,
  User,
  Clock,
  ShieldCheck,
  BookOpen,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

export function ReviewsPage() {
  const auth = useSession(),
    [params] = useSearchParams();

  const type: ReviewType = reviewTypes.some(([t]) => t === params.get("type"))
    ? (params.get("type") as ReviewType)
    : "Exchange";

  const selected = params.get("transaction");
  const tabParam = params.get("tab");
  const activeTab: "reputation" | "pending" =
    tabParam === "pending" || !!selected ? "pending" : "reputation";

  const owner = auth.status === "authenticated" ? auth.user.id : undefined;

  // Member reputation summary for the tab badge
  const reputationQuery = useQuery({
    queryKey: ["memberReputation", owner],
    queryFn: () =>
      session.publicRequest(
        `/members/${encodeURIComponent(owner ?? "")}/reputation?limit=1`,
        memberReputationSchema,
      ),
    enabled: !!owner,
    staleTime: 60_000,
  });
  const reputation = reputationQuery.data;

  // Reviewable transactions query
  const result = useInfiniteQuery({
    queryKey: ["reviewTransactions", owner, type],
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p: ReviewTransactionsPage) => p.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      session.request(
        `/me/review-transactions?limit=10&type=${type}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        reviewTransactionsSchema,
      ),
    enabled: !!owner && activeTab === "pending",
    retry: false,
  });

  if (
    result.error instanceof ApiError &&
    [401, 403].includes(result.error.status)
  )
    return (
      <div role="alert" className={styles.errorCard}>
        <div className={styles.errorIconWrap}>
          <AlertCircle size={24} />
        </div>
        <div className={styles.errorContent}>
          <h3>Phiên làm việc đã thay đổi</h3>
          <p>Quyền truy cập hoặc phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để xem giao dịch.</p>
        </div>
      </div>
    );

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerTitleRow}>
          <div>
            <h1>Đánh giá của tôi</h1>
            <p className={styles.intro}>
              Nơi ghi dấu từng cuốn sách đã trao gửi và niềm tin của cộng đồng bạn đọc Lật Lại.
            </p>
          </div>
        </div>

        {/* Master Navigation Tabs: Hồ sơ uy tín vs Giao dịch cần đánh giá */}
        <nav className={styles.masterTabNav} role="tablist" aria-label="Chế độ xem đánh giá">
          <Link
            to="/reviews?tab=reputation"
            role="tab"
            aria-selected={activeTab === "reputation"}
            className={`${styles.masterTabItem} ${activeTab === "reputation" ? styles.masterTabActive : ""}`}
          >
            <ShieldCheck size={18} />
            <span>Hồ sơ uy tín của tôi</span>
            {reputation && (
              <span className={styles.tabBadge}>
                {reputation.partnerRating !== null
                  ? `${reputation.partnerRating.toFixed(1)} ★`
                  : "Mới"}
              </span>
            )}
          </Link>
          <Link
            to={`/reviews?tab=pending&type=${type}`}
            role="tab"
            aria-selected={activeTab === "pending"}
            className={`${styles.masterTabItem} ${activeTab === "pending" ? styles.masterTabActive : ""}`}
          >
            <Star size={18} />
            <span>Giao dịch cần đánh giá</span>
          </Link>
        </nav>
      </header>

      {/* Tab 1: Hồ sơ uy tín (Tích hợp trọn vẹn trong Dashboard) */}
      {activeTab === "reputation" && (
        owner ? (
          <MemberReputationView memberId={owner} isOwnerView={true} />
        ) : (
          <div className={styles.emptyCard}>
            <p className={styles.emptyText}>Đang chuẩn bị hồ sơ uy tín của bạn…</p>
          </div>
        )
      )}

      {/* Tab 2: Danh sách giao dịch cần đánh giá */}
      {activeTab === "pending" && (
        selected ? (
          <TransactionReviewPanel
            key={`${type}:${selected}`}
            type={type}
            id={selected}
          />
        ) : (
          <>
            {/* Thanh phân loại loại giao dịch */}
            <nav className={styles.tabNav} aria-label="Loại giao dịch đánh giá">
              <div className={styles.tabTrack}>
                {reviewTypes.map(([t, label]) => {
                  const isActive = type === t;
                  const Icon =
                    t === "Exchange"
                      ? Repeat
                      : t === "DirectOrder"
                      ? Package
                      : Gavel;

                  return (
                    <Link
                      key={t}
                      to={`/reviews?tab=pending&type=${t}`}
                      className={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ""}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon size={16} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            {/* Skeletons khi đang nạp */}
            {result.isPending && (
              <div className={styles.skeletonList} aria-busy="true" aria-label="Đang tải giao dịch">
                {[1, 2, 3].map((n) => (
                  <div key={n} className={styles.skeletonCard}>
                    <div className={styles.skeletonAvatar} />
                    <div className={styles.skeletonInfo}>
                      <div className={styles.skeletonTitle} />
                      <div className={styles.skeletonMeta} />
                    </div>
                    <div className={styles.skeletonAction} />
                  </div>
                ))}
              </div>
            )}

            {/* Lỗi tải */}
            {result.isError && (
              <div className={styles.errorCard} role="alert">
                <div className={styles.errorIconWrap}>
                  <AlertCircle size={24} />
                </div>
                <div className={styles.errorContent}>
                  <h3>Chưa tải được danh sách giao dịch</h3>
                  <p>Kiểm tra kết nối mạng và thử lại.</p>
                  <button
                    type="button"
                    disabled={result.isFetching}
                    onClick={() => void result.refetch()}
                    className={styles.retryBtn}
                  >
                    <RefreshCw size={14} className={result.isFetching ? styles.spin : ""} />
                    <span>Thử lại</span>
                  </button>
                </div>
              </div>
            )}

            {/* Trạng thái trống */}
            {result.isSuccess && result.data.pages[0].items.length === 0 && (
              <div className={styles.emptyCard}>
                <div className={styles.emptyIconWrap}>
                  <BookOpen size={32} />
                </div>
                <h2 className={styles.emptyTitle}>Chưa có giao dịch hoàn tất ở mục này</h2>
                <p className={styles.emptyText}>
                  Giao dịch đang vận chuyển hoặc đang xử lý sự cố chưa đủ điều kiện
                  đánh giá. Sau khi nhận sách thành công, các giao dịch sẽ hiển thị tại đây để bạn gửi phản hồi.
                </p>
                <Link to="/orders" className={styles.emptyBtn}>
                  <Package size={16} />
                  <span>Xem đơn hàng của tôi</span>
                </Link>
              </div>
            )}

            {/* Danh sách thẻ giao dịch */}
            {result.isSuccess && result.data.pages[0].items.length > 0 && (
              <div className={styles.cardList}>
                {result.data.pages
                  .flatMap((p) => p.items)
                  .map((item) => {
                    const initial = item.partnerName.trim().charAt(0).toUpperCase() || "B";
                    const typeLabel =
                      item.transactionType === "Exchange"
                        ? "Trao đổi sách"
                        : item.transactionType === "DirectOrder"
                        ? "Đơn mua trực tiếp"
                        : "Đơn đấu giá";

                    return (
                      <article
                        key={item.transactionId}
                        data-transaction-id={item.transactionId}
                        className={styles.transactionCard}
                      >
                        <div className={styles.cardMain}>
                          <div className={styles.avatarCircle} aria-hidden="true">
                            {initial}
                          </div>

                          <div className={styles.partnerInfo}>
                            <div className={styles.partnerHeader}>
                              <h2 className={styles.partnerName}>
                                Giao dịch với {item.partnerName}
                              </h2>
                              <span className={styles.typeBadge}>{typeLabel}</span>
                            </div>

                            <div className={styles.metaRow}>
                              <span className={styles.codePill}>
                                Mã #{item.transactionId.slice(0, 8).toUpperCase()}
                              </span>
                              <span className={styles.metaTime}>
                                <Clock size={13} />
                                <span>Hoàn tất {reviewDate(item.completedAt)}</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className={styles.cardActions}>
                          <Link
                            to={`/reviews?tab=pending&type=${type}&transaction=${item.transactionId}`}
                            className={styles.primaryAction}
                          >
                            <Star size={15} />
                            <span>Xem và viết đánh giá</span>
                          </Link>
                          <Link
                            to={`/members/${item.partnerId}`}
                            className={styles.secondaryAction}
                          >
                            <User size={15} />
                            <span>Hồ sơ đối tác</span>
                          </Link>
                        </div>
                      </article>
                    );
                  })}
              </div>
            )}

            {/* Phân trang / Xem thêm */}
            {result.hasNextPage && (
              <div className={styles.loadMoreWrap}>
                <button
                  type="button"
                  disabled={result.isFetchingNextPage}
                  onClick={() => void result.fetchNextPage()}
                  className={styles.loadMoreBtn}
                >
                  {result.isFetchingNextPage ? (
                    <>
                      <RefreshCw size={14} className={styles.spin} />
                      <span>Đang tải thêm…</span>
                    </>
                  ) : (
                    <span>Xem thêm giao dịch</span>
                  )}
                </button>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
