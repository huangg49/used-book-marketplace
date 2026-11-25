import { usePagedCollection } from "../components/Pagination/usePagedCollection";
import { CollectionPager } from "../components/Pagination/CollectionPager";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTransactionLive } from "../hooks/useTransactionLive";
import { Link, useParams } from "react-router-dom";
import { useState, useMemo, useEffect, useRef } from "react";
import { ApiError } from "@used-books/session-client";
import {
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Gavel,
  List,
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

const STATUS_FILTERS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "in_progress", label: "Đang xử lý" },
  { value: "completed", label: "Đã hoàn tất" },
  { value: "cancelled", label: "Đã hủy / hết hạn" },
] as const;

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
  const ownerId = auth.status === "authenticated" ? auth.user.id : undefined;
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const allOrdersFilter = useRef<HTMLButtonElement>(null);

  const pages = useInfiniteQuery({
    queryKey: ["direct-orders", ownerId],
    queryFn: ({ pageParam }) => listOrders(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: auth.status === "authenticated",
    retry: false,
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  });
  useTransactionLive("inbox", ownerId, () => { void pages.refetch(); });

  const inaccessible = pages.error instanceof ApiError && [401, 403].includes(pages.error.status);
  const allItems = useMemo(
    () => inaccessible ? [] : pages.data?.pages.flatMap((p) => p.items) ?? [],
    [pages.data, inaccessible],
  );

  const filterItems = (items: typeof allItems) => items.filter((o) => {
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
  const collection = usePagedCollection(pages, JSON.stringify([auth.status === "authenticated" ? auth.user.id : "guest", roleFilter, statusFilter]), source => inaccessible ? [] : filterItems(source.flatMap(p => p.items)), 8);
  const resetPagination = collection.reset;
  useEffect(() => {
    // A denied cursor read recovers through refetch, not the obsolete Next action.
    if (inaccessible) resetPagination();
  }, [inaccessible, resetPagination]);
  const filteredItems = collection.items;

  const buyerCount = allItems.filter((order) => order.role === "Buyer").length;
  const sellerCount = allItems.filter((order) => order.role === "Seller").length;
  const roleOptions = [
    { value: "all", label: "Tất cả", count: allItems.length, icon: List },
    { value: "Buyer", label: "Đơn mua", count: buyerCount, icon: ShoppingBag },
    { value: "Seller", label: "Đơn bán", count: sellerCount, icon: Store },
  ] as const;

  return (
    <div className={styles.container}>
      <header className={`${styles.dashboardHeader} ${styles.listHeader}`}>
        <div>
          <h1 className={styles.dashboardTitle}>Đơn hàng của tôi</h1>
          <p className={styles.dashboardSubtitle}>
            Theo dõi đơn mua và bán trực tiếp.
          </p>
        </div>
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
          <div className={styles.orderControls}>
            <div className={styles.filterBar}>
              <div className={styles.roleTabs} role="group" aria-label="Lọc theo vai trò">
                {roleOptions.map(({ value, label, count, icon: Icon }) => (
                  <button
                    key={value}
                    ref={value === "all" ? allOrdersFilter : undefined}
                    type="button"
                    aria-pressed={roleFilter === value}
                    className={styles.roleTab}
                    onClick={() => setRoleFilter(value)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span>{label}</span>
                    {!inaccessible && pages.data && !pages.hasNextPage && (
                      <span className={styles.tabBadge}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className={styles.statusChips} role="group" aria-label="Lọc theo trạng thái">
                {STATUS_FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={statusFilter === value}
                    className={styles.chip}
                    onClick={() => setStatusFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <nav className={styles.relatedLinks} aria-label="Giao dịch và hướng dẫn liên quan">
              <Link to={ROUTES.myAuctions}>
                <Gavel size={16} aria-hidden="true" /> Đơn thắng đấu giá
              </Link>
              <Link to={ROUTES.exchangeMine}>
                <ArrowLeftRight size={16} aria-hidden="true" /> Trao đổi của tôi
              </Link>
              <Link to="/guide?task=buy">
                <BookOpen size={16} aria-hidden="true" /> Cách mua sách
              </Link>
            </nav>
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
          {pages.isError && (!pages.isFetchNextPageError || inaccessible) && (
            <div className={styles.errorBox} role="alert">
              <XCircle size={28} aria-hidden="true" />
              <div>
                <h3>Chưa tải được danh sách đơn hàng</h3>
                <p>{inaccessible
                  ? "Quyền xem đơn hàng đã thay đổi. Kiểm tra phiên đăng nhập và thử lại."
                  : allItems.length
                    ? "Chưa cập nhật được đơn hàng. Thông tin bên dưới là lần tải trước; vui lòng thử lại."
                    : "Chưa kết nối được để tải đơn hàng. Vui lòng bấm thử lại."}</p>
              </div>
              <button
                type="button"
                className={styles.retryButton}
                disabled={pages.isFetching}
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
                <ShoppingBag size={29} aria-hidden="true" />
              </div>
              <h3>
                {pages.hasNextPage
                  ? "Chưa thấy đơn phù hợp trong dữ liệu đã tải"
                  : allItems.length === 0
                  ? "Bạn chưa có đơn hàng nào"
                  : "Không có đơn hàng phù hợp bộ lọc"}
              </h3>
              <p>
                {pages.hasNextPage
                  ? "Bấm Sau để tìm tiếp trong những đơn cũ hơn, hoặc đổi bộ lọc."
                  : allItems.length === 0
                  ? "Tìm một bản sách để mua hoặc đăng sách bạn muốn bán."
                  : "Thử thay đổi bộ lọc vai trò hoặc trạng thái để xem các đơn hàng khác."}
              </p>
              {(roleFilter !== "all" || statusFilter !== "all") ? (
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    allOrdersFilter.current?.focus();
                    setRoleFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  Xóa bộ lọc
                </button>
              ) : allItems.length === 0 && !pages.hasNextPage ? (
                <div className={styles.emptyActions}>
                  <Link className={styles.primaryBtn} to={ROUTES.search}>
                    <BookOpen size={16} aria-hidden="true" />
                    Tìm sách để mua
                  </Link>
                  <Link className={styles.secondaryBtn} to={ROUTES.sell}>
                    <Package size={16} aria-hidden="true" />
                    Đăng bán sách
                  </Link>
                </div>
              ) : null}
            </div>
          )}

          {/* Order Cards List */}
          <div className={styles.orderList} id="direct-order-results">
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
                        {o.state==='AwaitingPayment' ? (isBuyer?'Kiểm tra tổng tiền và hạn trong chi tiết rồi thanh toán bằng ví.':'Đang chờ người mua thanh toán; mở chi tiết để xem thời hạn.')
                          :o.state==='PendingSellerConfirmation'?(isBuyer?'Đã thanh toán, đang chờ người bán xác nhận. Theo dõi hạn trong chi tiết.':'Người mua đã thanh toán. Mở chi tiết để xem và phản hồi đơn.')
                          :o.state==='Preparing'?(isBuyer?'Người bán đang chuẩn bị sách. Theo dõi tiến trình trong chi tiết.':'Chuẩn bị sách và làm theo bước được phép trong chi tiết đơn.')
                          :o.state==='InTransit'?'Theo dõi thông tin vận chuyển trong chi tiết đơn.'
                          :['Inspection','Delivered'].includes(o.state)?'Đọc thời hạn kiểm tra và hướng dẫn xử lý nếu sách có vấn đề trong chi tiết.'
                          :o.state==='ResolutionPending'?'Đang xử lý vướng mắc. Mở hồ sơ để xem yêu cầu bổ sung; không tạo thanh toán mới thay thế.'
                          :o.state==='SettlementPending'?'Đang xử lý quyết toán. Theo dõi trạng thái, chưa tự kết luận tiền đã được giải phóng.'
                          :isCompleted?'Đã hoàn tất. Bạn có thể xem hoặc viết đánh giá nếu còn đủ điều kiện.'
                          :['Cancelled','PaymentExpired','ClosedAfterResolution'].includes(o.state)?'Đơn đã kết thúc. Mở chi tiết để xem lý do và kết quả.'
                          :'Mở chi tiết để xem trạng thái hiện tại và thao tác được phép.'}
                      </p>
                    </div>

                    <div className={styles.cardActions}>{isCompleted&&<Link className={styles.viewDetailsBtn} to={`/reviews?type=DirectOrder&transaction=${o.id}`}>Xem hoặc viết đánh giá</Link>}
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

          {!inaccessible && <CollectionPager model={collection} anchorId="direct-order-results" itemLabel="đơn hàng" />}
        </>
      )}
    </div>
  );
}
