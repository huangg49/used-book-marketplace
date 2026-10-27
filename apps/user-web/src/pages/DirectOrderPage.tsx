import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState, useMemo } from "react";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  MessageCircle,
  Package,
  ShoppingBag,
  Store,
  XCircle,
} from "lucide-react";
import { useSession } from "../hooks/useSession";
import { listOrders, orderStates, orderTime } from "../services/orders";
import { OrderDetails } from "./OrderDetails";
import { ROUTES } from "../lib/routes";
import styles from "./DirectOrders.module.css";

export function DirectOrderPage() {
  const { orderId = "" } = useParams<{ orderId: string }>();
  return (
    <section className={styles.page} aria-labelledby="order-title">
      <Link className={styles.back} to="/orders">
        ← Đơn hàng của tôi
      </Link>
      <h1 id="order-title">Đơn hàng</h1>
      <OrderDetails orderId={orderId} />
    </section>
  );
}

type RoleFilter = "all" | "Buyer" | "Seller";
type StatusFilter = "all" | "in_progress" | "completed" | "cancelled";

const IN_PROGRESS_STATES = [
  "AwaitingPayment",
  "PendingSellerConfirmation",
  "Preparing",
  "InTransit",
  "ResolutionPending",
  "SettlementPending",
  "Inspection",
];

export function DirectOrderListPage() {
  const auth = useSession();
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const pages = useInfiniteQuery({
    queryKey: [
      "direct-orders",
      auth.status === "authenticated" ? auth.user.id : undefined,
    ],
    queryFn: ({ pageParam }) => listOrders(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: auth.status === "authenticated",
    retry: false,
  });

  const allItems = useMemo(
    () => pages.data?.pages.flatMap((p) => p.items) ?? [],
    [pages.data],
  );

  const filteredItems = useMemo(() => {
    return allItems.filter((o) => {
      if (roleFilter !== "all" && o.role !== roleFilter) return false;
      if (statusFilter === "in_progress") {
        if (!IN_PROGRESS_STATES.includes(o.state)) return false;
      } else if (statusFilter === "completed") {
        if (o.state !== "Completed") return false;
      } else if (statusFilter === "cancelled") {
        if (o.state !== "Cancelled" && o.state !== "PaymentExpired") return false;
      }
      return true;
    });
  }, [allItems, roleFilter, statusFilter]);

  const buyerCount = useMemo(
    () => allItems.filter((o) => o.role === "Buyer").length,
    [allItems],
  );
  const sellerCount = useMemo(
    () => allItems.filter((o) => o.role === "Seller").length,
    [allItems],
  );

  return (
    <div className={styles.container}>
      {/* Page Header */}
      <header className={styles.dashboardHeader}>
        <div>
          <h1 className={styles.dashboardTitle}>Đơn hàng của tôi</h1>
          <p className={styles.dashboardSubtitle}>
            Theo dõi tiến trình các đơn mua và đơn bán sách, phương thức giao nhận và xác minh hoàn tất.
          </p>
        </div>

        {allItems.length > 0 && (
          <div className={styles.statsBadge}>
            <span className={styles.statsNum}>{allItems.length}</span>
            <span className={styles.statsLabel}>Tổng số đơn</span>
          </div>
        )}
      </header>

      {auth.status !== "authenticated" ? (
        <div className={styles.loginCard}>
          <ShoppingBag size={40} aria-hidden="true" />
          <h2>Vui lòng đăng nhập</h2>
          <p>Đăng nhập vào tài khoản Lật Lại để xem lịch sử đơn hàng của bạn.</p>
          <Link className={styles.primaryBtn} to="/login?returnUrl=%2Forders">
            Đăng nhập ngay
          </Link>
        </div>
      ) : (
        <>
          {/* Filter Bar */}
          <div className={styles.filterBar}>
            {/* Role Tabs */}
            <div className={styles.roleTabs} role="tablist" aria-label="Lọc theo vai trò">
              <button
                type="button"
                role="tab"
                aria-selected={roleFilter === "all"}
                className={`${styles.roleTab} ${roleFilter === "all" ? styles.roleTabActive : ""}`}
                onClick={() => setRoleFilter("all")}
              >
                <span>Tất cả</span>
                <span className={styles.tabBadge}>{allItems.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={roleFilter === "Buyer"}
                className={`${styles.roleTab} ${roleFilter === "Buyer" ? styles.roleTabActive : ""}`}
                onClick={() => setRoleFilter("Buyer")}
              >
                <ShoppingBag size={14} aria-hidden="true" />
                <span>Đơn mua</span>
                <span className={styles.tabBadge}>{buyerCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={roleFilter === "Seller"}
                className={`${styles.roleTab} ${roleFilter === "Seller" ? styles.roleTabActive : ""}`}
                onClick={() => setRoleFilter("Seller")}
              >
                <Store size={14} aria-hidden="true" />
                <span>Đơn bán</span>
                <span className={styles.tabBadge}>{sellerCount}</span>
              </button>
            </div>

            {/* Status Filter Chips */}
            <div className={styles.statusChips} role="group" aria-label="Lọc theo trạng thái">
              <span className={styles.filterIconLabel}>
                <Filter size={13} aria-hidden="true" />
              </span>
              {(
                [
                  { value: "all", label: "Tất cả trạng thái" },
                  { value: "in_progress", label: "Đang xử lý" },
                  { value: "completed", label: "Đã hoàn tất" },
                  { value: "cancelled", label: "Đã hủy / hết hạn" },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  className={`${styles.chip} ${statusFilter === chip.value ? styles.chipActive : ""}`}
                  onClick={() => setStatusFilter(chip.value)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Loading Skeleton */}
          {pages.isPending && (
            <div className={styles.skeletonList} aria-busy="true" aria-label="Đang tải đơn hàng">
              {[0, 1, 2].map((i) => (
                <div key={i} className={styles.orderSkeleton} />
              ))}
            </div>
          )}

          {/* Error State */}
          {pages.isError && (
            <div className={styles.errorBox} role="alert">
              <XCircle size={28} aria-hidden="true" />
              <div>
                <h3>Chưa tải được danh sách đơn hàng</h3>
                <p>Máy chủ tạm thời gián đoạn. Vui lòng bấm thử lại.</p>
              </div>
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => void pages.refetch()}
              >
                Thử lại
              </button>
            </div>
          )}

          {/* Empty State */}
          {!pages.isPending && !pages.isError && filteredItems.length === 0 && (
            <div className={styles.emptyCard}>
              <div className={styles.emptyIconWrap}>
                <BookOpen size={36} aria-hidden="true" />
              </div>
              <h3>
                {allItems.length === 0
                  ? "Bạn chưa có đơn hàng nào"
                  : "Không có đơn hàng phù hợp bộ lọc"}
              </h3>
              <p>
                {allItems.length === 0
                  ? "Khám phá hàng ngàn bản sách cũ trên kệ hoặc đăng cuốn sách của bạn để kết nối với người đọc khác."
                  : "Thử thay đổi bộ lọc vai trò hoặc trạng thái để xem các đơn hàng khác."}
              </p>
              <div className={styles.emptyActions}>
                <Link className={styles.primaryBtn} to={ROUTES.search}>
                  <BookOpen size={16} aria-hidden="true" />
                  <span>Tìm sách để mua</span>
                </Link>
                <Link className={styles.secondaryBtn} to={ROUTES.sell}>
                  <Package size={16} aria-hidden="true" />
                  <span>Đăng bán sách của bạn</span>
                </Link>
              </div>
            </div>
          )}

          {/* Order Cards List */}
          <div className={styles.orderList}>
            {filteredItems.map((o) => {
              const isBuyer = o.role === "Buyer";
              const isCompleted = o.state === "Completed";
              const isCancelled = o.state === "Cancelled" || o.state === "PaymentExpired";

              return (
                <article key={o.id} className={styles.orderCard}>
                  {/* Card Header: Role badge, Order ID, Date & Status */}
                  <div className={styles.cardTop}>
                    <div className={styles.cardTopLeft}>
                      <span
                        className={`${styles.roleBadge} ${isBuyer ? styles.buyerBadge : styles.sellerBadge}`}
                      >
                        {isBuyer ? (
                          <>
                            <ShoppingBag size={13} aria-hidden="true" />
                            <span>Bạn mua</span>
                          </>
                        ) : (
                          <>
                            <Store size={13} aria-hidden="true" />
                            <span>Bạn bán</span>
                          </>
                        )}
                      </span>

                      <span className={styles.orderIdTag} title={`Mã đơn: ${o.id}`}>
                        #{o.id.slice(0, 8)}
                      </span>

                      <span className={styles.orderDate}>
                        <Calendar size={13} aria-hidden="true" />
                        <span>{orderTime(o.createdAt)}</span>
                      </span>
                    </div>

                    <div className={styles.cardTopRight}>
                      <span
                        className={`${styles.statusBadge} ${
                          isCompleted
                            ? styles.statusCompleted
                            : isCancelled
                            ? styles.statusCancelled
                            : styles.statusInProgress
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 size={13} aria-hidden="true" />
                        ) : isCancelled ? (
                          <XCircle size={13} aria-hidden="true" />
                        ) : (
                          <Clock size={13} aria-hidden="true" />
                        )}
                        <span>{orderStates[o.state] ?? o.state}</span>
                      </span>
                    </div>
                  </div>

                  {/* Card Body: Book details & status guidance */}
                  <div className={styles.cardBody}>
                    <div className={styles.bookThumb}>
                      <BookOpen size={22} className={styles.bookThumbIcon} aria-hidden="true" />
                    </div>

                    <div className={styles.bookInfo}>
                      <h2 className={styles.bookTitle}>
                        {o.title || "Bản sách Lật Lại"}
                      </h2>
                      <p className={styles.bookGuidance}>
                        {o.state === "ResolutionPending"
                          ? "Đang xác minh giao nhận giữa hai bên. Vui lòng xác nhận khi đã nhận đúng sách."
                          : o.state === "Preparing"
                          ? isBuyer
                            ? "Người bán đang chuẩn bị đóng gói và gửi sách cho bạn."
                            : "Vui lòng đóng gói và gửi sách theo đúng lịch hẹn."
                          : o.state === "InTransit"
                          ? "Sách đang trên đường vận chuyển tới địa chỉ nhận."
                          : o.state === "AwaitingPayment"
                          ? "Đơn hàng đang chờ thanh toán qua ví."
                          : isCompleted
                          ? "Giao dịch đã hoàn tất thành công. Cảm ơn bạn đã đồng hành cùng Lật Lại!"
                          : "Đơn hàng đã kết thúc."}
                      </p>
                    </div>

                    <div className={styles.cardActions}>
                      <Link
                        className={styles.viewDetailsBtn}
                        to={`/chat/orders/${o.id}`}
                        aria-label={`Xem chi tiết đơn hàng ${o.title || o.id.slice(0, 8)}`}
                      >
                        <MessageCircle size={15} aria-hidden="true" />
                        <span>Chi tiết & Hội thoại</span>
                        <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Load More Button */}
          {pages.hasNextPage && (
            <div className={styles.loadMoreWrap}>
              <button
                type="button"
                className={styles.loadMoreBtn}
                disabled={pages.isFetchingNextPage}
                onClick={() => void pages.fetchNextPage()}
              >
                {pages.isFetchingNextPage ? "Đang tải thêm…" : "Xem thêm đơn hàng cũ hơn"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
