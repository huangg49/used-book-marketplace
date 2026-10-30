import { BundleManifest } from "../components/BookBundle";
import { ListingPhoto } from "../components/BookCard";
import { ApiError } from "@used-books/session-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { buyNowError } from "../lib/buy-now-error";
import { conditions } from "../lib/listing-labels";
import { formatVnd } from "../lib/routes";
import { addressDetailLabel } from "../lib/address-detail-label";
import { getPublicListing } from "../services/public-listings";
import {
  cancelOrder,
  getOrder,
  orderStates,
  orderTime,
  payOrder,
} from "../services/orders";
import { OrderShipping } from "./OrderShipping";
import { OrderResponse } from "../components/OrderResponse";
import {
  BookOpen,
  ClipboardCheck,
  CreditCard,
  XCircle,
  Truck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  ShieldCheck,
  ExternalLink,
  MapPin,
  Star,
  Package,
  Check,
} from "lucide-react";
import styles from "./DirectOrders.module.css";

const orderSteps = [
  { id: "create", label: "Đặt đơn" },
  { id: "payment", label: "Thanh toán" },
  { id: "preparing", label: "Chuẩn bị" },
  { id: "shipping", label: "Vận chuyển" },
  { id: "complete", label: "Hoàn tất" },
];

function getStepIndex(state: string): number {
  switch (state) {
    case "AwaitingPayment":
    case "PaymentExpired":
      return 1;
    case "PendingSellerConfirmation":
    case "Preparing":
      return 2;
    case "InTransit":
      return 3;
    case "Inspection":
    case "ResolutionPending":
      return 3;
    case "Completed":
      return 5;
    case "Cancelled":
    case "SettlementPending":
      return 1;
    default:
      return 1;
  }
}

function getStatusPillClass(state: string): string {
  switch (state) {
    case "Completed":
      return styles.statusPillCompleted;
    case "InTransit":
    case "Preparing":
      return styles.statusPillActive;
    case "AwaitingPayment":
    case "PendingSellerConfirmation":
      return styles.statusPillWarning;
    case "Cancelled":
    case "PaymentExpired":
      return styles.statusPillCancelled;
    case "ResolutionPending":
    case "Inspection":
      return styles.statusPillInspection;
    default:
      return styles.statusPillDefault;
  }
}

/** One order controller shared by the standalone page and the conversation sheet. */
export function OrderDetails({
  orderId,
  embedded = false,
}: {
  orderId: string;
  embedded?: boolean;
}) {
  const auth = useSession();
  if (auth.status !== "authenticated")
    return (
      <section className={styles.details} aria-label="Chi tiết đơn hàng">
        <h2>Đơn hàng</h2>
        <p role="status">
          {auth.status === "loading"
            ? "Đang kiểm tra đăng nhập…"
            : "Đăng nhập để xem đơn của bạn."}
        </p>
        {auth.status !== "loading" && (
          <Link to={`/login?returnUrl=${encodeURIComponent(`/orders/${orderId}`)}`}>
            Đăng nhập
          </Link>
        )}
      </section>
    );
  return (
    <AuthenticatedOrderDetails
      key={`${auth.user.id}:${orderId}`}
      orderId={orderId}
      ownerId={auth.user.id}
      embedded={embedded}
    />
  );
}

function AuthenticatedOrderDetails({
  orderId,
  ownerId,
  embedded,
}: {
  orderId: string;
  ownerId: string;
  embedded: boolean;
}) {
  const cache = useQueryClient();
  const order = useQuery({
    queryKey: ["direct-order", ownerId, orderId],
    queryFn: () => getOrder(orderId),
    retry: false,
    refetchInterval: 5000,
  });

  const listingId = order.data?.item.listingId;
  const listing = useQuery({
    queryKey: ["public-listing", listingId],
    queryFn: () => getPublicListing(listingId!),
    enabled: !!listingId,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pendingAction, setPendingAction] = useState<"pay" | "cancel">();
  const attempt = useRef<
    { action: "pay" | "cancel"; key: string; version: number } | undefined
  >(undefined);
  const inaccessible =
    order.error instanceof ApiError &&
    [401, 403, 404].includes(order.error.status);

  async function act(action: "pay" | "cancel") {
    if (busy || !order.data || inaccessible) return;
    const intent = attempt.current ?? {
      action,
      key: crypto.randomUUID(),
      version: order.data.version,
    };
    if (intent.action !== action) return;
    attempt.current = intent;
    setPendingAction(action);
    setBusy(true);
    setError(undefined);
    try {
      await (action === "pay" ? payOrder : cancelOrder)(
        orderId,
        intent.version,
        intent.key,
      );
      attempt.current = undefined;
      setPendingAction(undefined);
      await order.refetch();
      for (const key of [
        "direct-orders",
        "public-listing",
        "home-shelves",
        "catalog-search",
        "exchange-public-listings",
        "wallet",
        "wallet-summary",
        "wallet-history",
        "notifications",
        "purchase-conversation",
        "purchase-conversations",
      ])
        void cache.invalidateQueries({ queryKey: [key] });
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [400, 403, 404, 409, 422, 429].includes(cause.status)
      ) {
        attempt.current = undefined;
        setPendingAction(undefined);
        void order.refetch();
      }
      setError(
        action === "pay" && cause instanceof ApiError && cause.status === 409
          ? "Chưa thể thanh toán. Kiểm tra số dư ví và trạng thái đơn rồi thử lại."
          : buyNowError(cause),
      );
    } finally {
      setBusy(false);
    }
  }

  const className = `${styles.details} ${embedded ? styles.embedded : ""}`;
  if (!order.data || inaccessible)
    return (
      <section className={className} aria-label="Chi tiết đơn hàng">
        <h2>Đơn hàng</h2>
        {order.isPending ? (
          <p role="status">Đang tải đơn…</p>
        ) : (
          <div role="alert" className={styles.errorAlert}>
            <p>
              Chưa tải được đơn. Đơn có thể không thuộc tài khoản này hoặc kết
              nối đang gián đoạn.
            </p>
            <button
              type="button"
              disabled={order.isFetching}
              onClick={() => void order.refetch()}
            >
              Thử lại
            </button>
          </div>
        )}
      </section>
    );

  const o = order.data;
  const condition = conditions[o.item.condition as keyof typeof conditions];
  const currentStepIndex = getStepIndex(o.state);

  return (
    <section className={className} aria-label="Chi tiết đơn hàng">
      {!embedded && (
        <header className={styles.dashboardHeader}>
          <div>
            <Link to="/orders" className={styles.back}>&larr; Đơn hàng của tôi</Link>
            <h1 className={styles.dashboardTitle}>
              {o.purchaseMode === "BuyNow" ? "Đơn Mua ngay" : "Đơn mua sách"}
            </h1>
            <p className={styles.dashboardSubtitle}>
              Mã đơn: #{o.id.slice(0, 8).toUpperCase()} · Đặt lúc {orderTime(o.createdAt)} · {o.role === "Buyer" ? "Bạn mua" : "Bạn bán"}
            </p>
          </div>
        </header>
      )}

      {order.isError && (
        <div role="alert" className={styles.errorAlert} style={{ marginBottom: 16 }}>
          <AlertCircle size={16} />
          <span>Chưa cập nhật được trạng thái mới nhất.</span>
          <button
            type="button"
            disabled={order.isFetching}
            onClick={() => void order.refetch()}
            style={{ marginLeft: 8, textDecoration: "underline", background: "none", border: 0, cursor: "pointer", color: "inherit", fontWeight: 700 }}
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 2 KHUNG THEO YÊU CẦU: KHUNG TRÁI (THÔNG TIN SÁCH) & KHUNG PHẢI (THỦ TỤC ĐƠN HÀNG) */}
      <div className={styles.orderTwoColumns}>
        {/* ========================================================
            KHUNG 1 (BÊN TRÁI): THÔNG TIN SÁCH
            ======================================================== */}
        <article className={styles.bookInfoCard} aria-labelledby="book-info-heading">
          {/* Header của Khung Thông tin sách */}
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderIcon} aria-hidden="true">
              <BookOpen size={20} />
            </div>
            <div>
              <h3 id="book-info-heading" className={styles.cardTitle}>Thông tin sách</h3>
              <p className={styles.cardSubtitle}>Chi tiết ấn bản và thanh toán</p>
            </div>
          </div>

          <div className={styles.cardContent}>
            {/* Ảnh và thông tin bìa sách */}
            <div className={styles.bookProfileRow}>
              <div className={styles.bookCoverWrapper}>
                {listing.data ? (
                  <ListingPhoto book={listing.data} eager />
                ) : (
                  <div className={styles.placeholderCover} aria-hidden="true">
                    <BookOpen size={28} />
                  </div>
                )}
              </div>
              <div className={styles.bookProfileMeta}>
                <h4 className={styles.bookTitle}>
                  {o.item.bundle?.title || o.item.metadata.title}
                </h4>
                <p className={styles.bookAuthor}>
                  {listing.data?.book.authors?.join(", ") || (listing.isLoading ? "Đang tải thông tin tác giả…" : "Tác giả")}
                </p>
                {condition && (
                  <div className={styles.conditionRow}>
                    <span className={styles.conditionTag}>Tình trạng: {condition}</span>
                  </div>
                )}
                <Link
                  to={`/books/${o.item.listingId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.viewListingLink}
                >
                  <span>Xem bài đăng gốc</span>
                  <ExternalLink size={13} aria-hidden="true" />
                </Link>
              </div>
            </div>

            {/* Nếu là bộ sách, hiển thị danh mục tập */}
            {o.item.bundle && (
              <div className={styles.bundleSection}>
                <BundleManifest bundle={o.item.bundle} />
              </div>
            )}

            {/* Chi tiết tình trạng & số trang */}
            <div className={styles.specList}>
              {o.item.coverNote && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>Bìa & gáy:</span>
                  <span className={styles.specVal}>{o.item.coverNote}</span>
                </div>
              )}
              {o.item.pages && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>Số trang:</span>
                  <span className={styles.specVal}>{o.item.pages}</span>
                </div>
              )}
              {o.item.description && (
                <div className={styles.descriptionBlock}>
                  <span className={styles.specLabel}>Ghi chú người bán:</span>
                  <p className={styles.descriptionText}>{o.item.description}</p>
                </div>
              )}
            </div>

            {/* Khối thanh toán & Ký quỹ bảo chứng */}
            <div className={styles.paymentCard}>
              <div className={styles.paymentCardHeader}>
                <span className={styles.paymentHeading}>Chi tiết thanh toán</span>
                <span className={styles.paymentModeBadge}>
                  {o.purchaseMode === "BuyNow" ? "Mua ngay" : "Thương lượng"}
                </span>
              </div>

              <dl className={styles.paymentDl}>
                <div className={styles.paymentRow}>
                  <dt>Tiền sách</dt>
                  <dd>{formatVnd(o.amounts.bookPrice)}</dd>
                </div>
                <div className={styles.paymentRow}>
                  <dt>Phí giao hàng</dt>
                  <dd>{formatVnd(o.amounts.shippingFee)}</dd>
                </div>
                <div className={`${styles.paymentRow} ${styles.paymentTotalRow}`}>
                  <dt>Tổng thanh toán</dt>
                  <dd>{formatVnd(o.amounts.buyerTotal)}</dd>
                </div>
              </dl>

              {/* Thông báo ký quỹ bảo chứng an toàn */}
              <div className={styles.escrowNotice}>
                {o.paidAt ? (
                  <div className={styles.escrowPaid}>
                    <ShieldCheck size={18} className={styles.escrowIconPaid} aria-hidden="true" />
                    <div>
                      <p className={styles.escrowTitle}>Đã thanh toán lúc {orderTime(o.paidAt)}</p>
                      <p className={styles.escrowSubtitle}>
                        Khoản tiền <strong>{formatVnd(o.moneyHeld)}</strong> đang được giữ an toàn trong quỹ bảo chứng của Lật Lại.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className={styles.escrowUnpaid}>
                    <Clock size={18} className={styles.escrowIconUnpaid} aria-hidden="true" />
                    <div>
                      <p className={styles.escrowTitle}>Chưa trừ tiền từ ví</p>
                      <p className={styles.escrowSubtitle}>
                        Cần thanh toán trước {orderTime(o.paymentDeadline)} để giữ sách cho đơn này.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Địa chỉ giao / nhận */}
            <div className={styles.addressBox}>
              <div className={styles.addressBoxHeader}>
                <MapPin size={16} aria-hidden="true" />
                <span>{o.role === "Buyer" ? "Địa chỉ nhận sách của bạn" : "Nơi gửi hàng của bạn"}</span>
              </div>
              <p className={styles.addressContact}>
                <strong>{o.ownAddress.recipientName}</strong> · {o.ownAddress.phone}
              </p>
              <p className={styles.addressDetail}>
                {addressDetailLabel(o.ownAddress.detail)}
              </p>
            </div>
          </div>
        </article>

        {/* ========================================================
            KHUNG 2 (BÊN PHẢI): THỦ TỤC ĐƠN HÀNG (MỌI BƯỚC HOẠT ĐỘNG TẠI ĐÂY)
            ======================================================== */}
        <article className={styles.orderProceduresCard} aria-labelledby="order-procedures-heading">
          {/* Header của Khung Thủ tục */}
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderIcon} aria-hidden="true">
              <ClipboardCheck size={20} />
            </div>
            <div className={styles.proceduresHeaderInfo}>
              <div className={styles.proceduresTitleRow}>
                <h3 id="order-procedures-heading" className={styles.cardTitle}>Thủ tục đơn hàng</h3>
                <span className={`${styles.orderStatusPill} ${getStatusPillClass(o.state)}`}>
                  {orderStates[o.state] ?? "Đang cập nhật"}
                </span>
              </div>
              <p className={styles.cardSubtitle}>
                Mã đơn: <span className={styles.orderCodeBadge}>#{o.id.slice(0, 8).toUpperCase()}</span> · {o.role === "Buyer" ? "Bạn là Người mua" : "Bạn là Người bán"}
              </p>
            </div>
          </div>

          <div className={styles.cardContent}>
            {/* Thanh tiến trình Stepper 5 bước */}
            <div className={styles.stepperContainer} aria-label="Tiến trình thủ tục đơn hàng">
              {orderSteps.map((step, idx) => {
                const isCompleted = currentStepIndex > idx + 1;
                const isCurrent = currentStepIndex === idx + 1;
                return (
                  <div
                    key={step.id}
                    className={`${styles.stepItem} ${isCompleted ? styles.stepCompleted : ""} ${isCurrent ? styles.stepCurrent : ""}`}
                  >
                    <div className={styles.stepCircle} aria-hidden="true">
                      {isCompleted ? <Check size={14} strokeWidth={3} /> : idx + 1}
                    </div>
                    <span className={styles.stepLabel}>{step.label}</span>
                  </div>
                );
              })}
            </div>

            {/* KHU VỰC THAO TÁC CÁC BƯỚC THỦ TỤC */}
            <div className={styles.activeProcedureBox}>
              {/* BƯỚC 1: CHỜ THANH TOÁN (AwaitingPayment) */}
              {o.state === "AwaitingPayment" && (
                <div className={styles.procedureSection}>
                  <div className={styles.procedureNoticeWarning}>
                    <Clock size={20} aria-hidden="true" />
                    <div>
                      <h4>Chờ thanh toán đơn hàng</h4>
                      <p>
                        Vui lòng thanh toán trước <strong>{orderTime(o.paymentDeadline)}</strong>. Quá hạn, đơn hàng sẽ tự động hủy và sách được mở lại cho người khác.
                      </p>
                    </div>
                  </div>

                  {o.role === "Buyer" ? (
                    <div className={styles.actionButtonGroup}>
                      {(o.paymentEnabled || pendingAction === "pay") && (
                        <button
                          type="button"
                          className={styles.primaryActionBtn}
                          disabled={busy || pendingAction === "cancel"}
                          onClick={() => void act("pay")}
                        >
                          <CreditCard size={18} aria-hidden="true" />
                          <span>
                            {busy && pendingAction === "pay"
                              ? "Đang xác nhận thanh toán…"
                              : pendingAction === "pay"
                                ? "Thử lại thanh toán"
                                : `Thanh toán ngay ${formatVnd(o.amounts.buyerTotal)}`}
                          </span>
                        </button>
                      )}

                      {(o.canCancel || pendingAction === "cancel") && (
                        <button
                          type="button"
                          className={styles.secondaryActionBtn}
                          disabled={busy || pendingAction === "pay"}
                          onClick={() => void act("cancel")}
                        >
                          <XCircle size={18} aria-hidden="true" />
                          <span>
                            {busy && pendingAction === "cancel"
                              ? "Đang hủy đơn…"
                              : pendingAction === "cancel"
                                ? "Thử lại hủy đơn"
                                : "Hủy đơn chưa thanh toán"}
                          </span>
                        </button>
                      )}

                      <p className={styles.walletHint}>
                        Số dư ví không đủ? <Link to="/wallet">Mở Ví Lật Lại để nạp tiền</Link> rồi quay lại đơn này để thanh toán.
                      </p>
                    </div>
                  ) : (
                    <div className={styles.procedureNoticeInfo}>
                      <Clock size={18} aria-hidden="true" />
                      <div>
                        <h4>Đang chờ người mua thanh toán</h4>
                        <p>Người mua đang tiến hành chuyển tiền qua ví. Sách đang được giữ tạm thời cho đơn này đến hạn chót.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* BƯỚC 2: NGƯỜI BÁN XÁC NHẬN ĐƠN (PendingSellerConfirmation) */}
              {o.state === "PendingSellerConfirmation" && (
                <div className={styles.procedureSection}>
                  {o.role === "Seller" ? (
                    <div className={styles.sellerConfirmCard}>
                      <OrderResponse key={o.id} order={o} onChanged={() => order.refetch()} />
                    </div>
                  ) : (
                    <div className={styles.procedureNoticeInfo}>
                      <Clock size={18} aria-hidden="true" />
                      <div>
                        <h4>Đã thanh toán · Chờ người bán xác nhận</h4>
                        <p>Tiền đã được giữ an toàn trong quỹ bảo chứng. Đang chờ người bán xác nhận nhận đơn để tiến hành chuẩn bị sách.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* BƯỚC 3: CHUẨN BỊ VÀ ĐÓNG GÓI SÁCH (Preparing) */}
              {o.state === "Preparing" && (
                <div className={styles.procedureSection}>
                  {o.preparation && (
                    <div className={styles.preparationBox}>
                      <div className={styles.deadlineBadge}>
                        <Clock size={16} aria-hidden="true" />
                        <span>Hạn bàn giao vận chuyển: <strong>{orderTime(o.preparation.pickupDeadline)}</strong></span>
                      </div>

                      {o.shippingAddress && (
                        <div className={styles.shippingAddressPreview}>
                          <p className={styles.shippingAddressLabel}>Địa chỉ giao hàng cho người mua:</p>
                          <p className={styles.shippingAddressValue}>
                            <strong>{o.shippingAddress.recipientName}</strong> · {o.shippingAddress.phone}
                            <br />
                            {addressDetailLabel(o.shippingAddress.detail)}
                          </p>
                        </div>
                      )}

                      {/* Công cụ vận chuyển cho Người bán */}
                      {o.role === "Seller" && (
                        <div className={styles.sellerShippingTools}>
                          <OrderShipping key={o.id} order={o} onChange={() => void order.refetch()} />
                        </div>
                      )}

                      {/* Thông báo cho Người mua */}
                      {o.role === "Buyer" && (
                        <div className={styles.procedureNoticeSuccess}>
                          <Package size={20} aria-hidden="true" />
                          <div>
                            <h4>Người bán đang chuẩn bị sách</h4>
                            <p>
                              Đơn hàng đã được xác nhận. Người bán đang tiến hành đóng gói sách theo đúng quy chuẩn và sẽ bàn giao cho shipper trước thời hạn.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* BƯỚC 4: ĐANG VẬN CHUYỂN (InTransit) */}
              {o.state === "InTransit" && (
                <div className={styles.procedureSection}>
                  <div className={styles.procedureNoticeInfo}>
                    <Truck size={22} aria-hidden="true" />
                    <div>
                      <h4>Kiện hàng đang được giao</h4>
                      <p>Đơn vị vận chuyển đã nhận sách và đang trên đường giao đến địa chỉ nhận.</p>
                    </div>
                  </div>

                  <div className={styles.shippingFollowUp}>
                    <OrderShipping key={o.id} order={o} onChange={() => void order.refetch()} />
                  </div>
                </div>
              )}

              {/* BƯỚC 5: XÁC MINH & KIỂM TRA SÁCH 72H (ResolutionPending / Inspection) */}
              {(o.state === "ResolutionPending" || o.state === "Inspection") && (
                <div className={styles.procedureSection}>
                  <div className={styles.inspectionCard}>
                    <ShieldCheck size={24} className={styles.inspectionIcon} aria-hidden="true" />
                    <div>
                      <h4>Đang xác minh & Kiểm tra sách (Chính sách 72h)</h4>
                      <p>
                        Sách đã được giao đến nơi. Người mua có 72 giờ để kiểm tra tình trạng sách thực tế. Tiền thanh toán tiếp tục được giữ an toàn trong quỹ bảo chứng.
                      </p>
                    </div>
                  </div>

                  <OrderShipping key={o.id} order={o} onChange={() => void order.refetch()} />
                </div>
              )}

              {/* BƯỚC 6: HOÀN TẤT ĐƠN HÀNG (Completed) */}
              {o.state === "Completed" && (
                <div className={styles.procedureSection}>
                  <div className={styles.completedCard}>
                    <CheckCircle2 size={30} className={styles.completedIcon} aria-hidden="true" />
                    <div>
                      <h4>Đơn hàng đã hoàn tất thành công</h4>
                      <p>
                        Giao dịch đã kết thúc tốt đẹp! Khoản tiền thanh toán đã được giải ngân an toàn vào Ví Lật Lại của người bán.
                      </p>
                    </div>
                  </div>

                  <div className={styles.reviewPrompt}>
                    <Link to="/reviews" className={styles.reviewActionBtn}>
                      <Star size={18} aria-hidden="true" />
                      <span>Đánh giá giao dịch & Người bán</span>
                    </Link>
                  </div>
                </div>
              )}

              {/* BƯỚC 7: ĐƠN HÀNG ĐÃ HỦY HOẶC HẾT HẠN */}
              {(o.state === "Cancelled" || o.state === "PaymentExpired" || o.state === "SettlementPending") && (
                <div className={styles.procedureSection}>
                  <div className={styles.cancelledCard}>
                    <AlertTriangle size={24} className={styles.cancelledIcon} aria-hidden="true" />
                    <div>
                      <h4>{orderStates[o.state] ?? "Đơn hàng đã kết thúc"}</h4>
                      <p>
                        {o.state === "PaymentExpired"
                          ? "Đơn hàng tự động hủy do người mua không thanh toán trong thời hạn quy định."
                          : o.state === "SettlementPending"
                            ? "Đơn đang trong quá trình xử lý hoàn tiền về ví cho người mua."
                            : "Đơn hàng đã được hủy. Mọi khoản tiền ký quỹ đã được xử lý hoàn lại theo quy định."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Thông báo lỗi thao tác (nếu có) */}
              {error && (
                <div className={styles.errorAlert} role="alert">
                  <AlertCircle size={18} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Ghi chú chính sách ở chân khung thủ tục */}
            <div className={styles.policyFooterNote}>
              <ShieldCheck size={16} aria-hidden="true" />
              <span>Mọi giao dịch trên Lật Lại được bảo đảm an toàn qua quỹ ký quỹ & quy trình kiểm định 72h.</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

