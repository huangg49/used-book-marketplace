import { TransactionDisclosure } from "../components/conversation/TransactionFrame";
import { ExchangeFinanceSummary } from "../components/conversation/ExchangeFinanceSummary";
import { useExchangeRecovery } from "../hooks/useExchangeRecovery";
import { createdExchange, pendingProposal } from "../services/exchange";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@used-books/session-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { session } from "../lib/session";
import { PurchaseDialog } from "../components/PurchaseDialog";
import {
  PurchaseAddressFields,
  type PurchaseAddressForm,
} from "../components/PurchaseAddressFields";
import {
  attachPurchaseQuote,
  changeConversationTerms,
  type PurchaseConversation,
  type TermsProposalBody,
  type TermsResponseBody,
} from "../services/purchase-conversations";
import {
  getOrder,
  payOrder,
  cancelOrder,
  orderTime,
  orderStates,
  startDemoOrderCompletion,
} from "../services/orders";
import { invalidateMemberWalletViews } from "../lib/wallet-cache";
import { buyNowError } from "../lib/buy-now-error";
import { addressDetailLabel } from "../lib/address-detail-label";
import { OrderResponse } from "../components/OrderResponse";
import { OrderShipping } from "./OrderShipping";
import { DirectShipmentDialog } from "../components/DirectShipmentDialog";
import { useOrderShipment } from "../hooks/useOrderShipment";
import { ReceiptConfirmation } from "../features/reviews/ReceiptConfirmation";
import { ReviewEntry } from "../features/reviews/ReviewEntry";
import { purchaseListingKey } from "../lib/purchase-listing";
import {
  Check,
  ExternalLink,
  MapPin,
  Package,
  Clock,
  AlertCircle,
  Tag,
  ChevronDown,
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  PencilLine,
  X,
  CreditCard,
  XCircle,
  Truck,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { PublicListing } from "../services/public-listings";
import { ListingPhoto } from "../components/BookCard";
import { BundleManifest, BundleAcknowledgment } from "../components/BookBundle";
import { SupportLink } from "../features/support/SupportLink";
import { conditions } from "../lib/listing-labels";
import { formatVnd } from "../lib/routes";
import { purchaseChatGuidance } from "../lib/purchase-chat-guidance";
import { ExchangeOffer } from "../components/conversation/ExchangeOffer";
import { ExchangeDetailPage } from "./ExchangeDetailPage";
import styles from "./DirectOrders.module.css";
import exchangeStyles from "./ExchangeDetailPage.module.css";
import stepStyles from "../components/exchange/ExchangeSteps/ExchangeSteps.module.css";
import flow from "./PurchaseFlow.module.css";
import sheetStyles from "../components/conversation/Conversation.module.css";

const addressBookSchema = z.object({
  version: z.number().int(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      recipientName: z.string(),
      phone: z.string(),
      serviceAreaCode: z.string(),
      localityCode: z.string(),
      detail: z.string(),
      isDefault: z.boolean(),
      version: z.number().int(),
    }),
  ),
});
const serviceAreasSchema = z.object({
  code: z.literal("HCM-DEMO-v1"),
  name: z.literal("TP.HCM"),
  demoOnly: z.literal(true),
  localities: z.array(z.object({ code: z.string(), label: z.string() })),
});
const quoteReceiptSchema = z.object({ entityId: z.string().uuid() });
const quoteDetailSchema = z.object({
  id: z.string().uuid(),
  version: z.literal(1),
  listingVersion: z.number().int(),
  listingRevisionId: z.string().uuid(),
  expiresAt: z.string(),
  amounts: z.object({
    buyerTotal: z.number().int(),
    shippingFee: z.number().int(),
    sellerProceedsOnCompletion: z.number().int(),
  }),
});

function quoteErrorText(error: unknown, phase: "address" | "quote" | "attach") {
  if (!(error instanceof ApiError))
    return error instanceof Error ? error.message : "Chưa kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  if (error.status === 401)
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.status === 403) return "Tài khoản chưa có quyền gửi báo giá.";
  if (error.status === 409)
    return "Thông tin sách hoặc báo giá vừa thay đổi. Hãy tải lại và thử lại.";
  if (error.status === 422 && phase === "address")
    return "Địa chỉ chưa hợp lệ. Hãy chọn một khu vực phục vụ trong danh sách.";
  if (error.status === 422 && phase === "quote")
    return "Chưa thể báo giá cho địa chỉ này hoặc sách vừa thay đổi. Hãy kiểm tra lại.";
  if (error.status === 429)
    return "Bạn đã thử nhiều lần. Vui lòng đợi một lúc rồi thử lại.";
  return phase === "attach"
    ? "Chưa thể gửi báo giá cho người bán. Vui lòng thử lại."
    : "Máy chủ chưa thể tạo báo giá. Vui lòng thử lại sau.";
}

const NEGOTIATION_STEPS = [
  { id: "proposal", label: "Đề nghị" },
  { id: "payment", label: "Thanh toán" },
  { id: "handover", label: "Giao nhận" },
  { id: "inspection", label: "Kiểm tra" },
  { id: "result", label: "Kết quả" },
] as const;

export function NegotiationWorkspace({
  room,
  userId,
  book,
  refresh,
  frozen = false,
  guidance,
  onOpenOrderDialog,
  historyExchange,
  setHistoryExchange,
  now,
}: {
  room: PurchaseConversation;
  userId: string;
  book?: PublicListing;
  refresh: () => void;
  frozen?: boolean;
  guidance: ReturnType<typeof purchaseChatGuidance>;
  onOpenOrderDialog: () => void;
  historyExchange: string | null;
  setHistoryExchange: (id: string | null) => void;
  now: number;
  expired?: boolean;
}) {
  const identity = useExchangeRecovery();
  const retainedExchange = pendingProposal();
  const exchangeBlocked =
    retainedExchange?.conversationId === room.id ||
    Boolean(createdExchange(room.listingId));
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{
    body: TermsProposalBody | TermsResponseBody;
    key: string;
  } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);

  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressForm, setAddressForm] = useState<PurchaseAddressForm>({
    recipientName: "",
    phone: "",
    localityCode: "",
    detail: "",
  });
  const [acknowledgedRevision, setAcknowledgedRevision] = useState<string>();
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const seller = room.seller.id === userId;
  const isBuyer = room.buyer.id === userId;
  const terms = room.terms;
  const proposal = terms?.pendingProposal;
  const isExchange = terms?.mode === "Exchange";

  const bundleAcknowledged =
    !!book && acknowledgedRevision === purchaseListingKey(book);

  const addresses = useQuery({
    queryKey: ["address-book"],
    queryFn: () => session.request("/me/addresses", addressBookSchema),
    enabled: isBuyer && addressDialogOpen,
  });

  const areas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => session.request("/service-areas", serviceAreasSchema),
    enabled: isBuyer && addressDialogOpen,
  });

  const queryClient = useQueryClient();
  const order = useQuery({
    queryKey: ["direct-order", room.orderId],
    queryFn: () => getOrder(room.orderId!),
    enabled: !!room.orderId,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "AwaitingPayment" ||
        state === "Preparing" ||
        state === "InTransit"
        ? 5000
        : false;
    },
  });
  const orderData = order.data;
  const shipment = useOrderShipment(room.orderId ?? "", !!room.orderId);
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false);

  const [orderBusy, setOrderBusy] = useState(false);
  const [orderActionError, setOrderActionError] = useState<string>();
  const [pendingAction, setPendingAction] = useState<"pay" | "cancel">();
  const orderAttempt = useRef<
    { action: "pay" | "cancel"; key: string; version: number } | undefined
  >(undefined);

  async function handleOrderAct(action: "pay" | "cancel") {
    if (orderBusy || !orderData || !room.orderId) return;
    const intent = orderAttempt.current ?? {
      action,
      key: crypto.randomUUID(),
      version: orderData.version,
    };
    if (intent.action !== action) return;
    orderAttempt.current = intent;
    setPendingAction(action);
    setOrderBusy(true);
    setOrderActionError(undefined);
    try {
      await (action === "pay" ? payOrder : cancelOrder)(
        room.orderId,
        intent.version,
        intent.key,
      );
      invalidateMemberWalletViews(queryClient, userId);
      orderAttempt.current = undefined;
      setPendingAction(undefined);
      await order.refetch();
      for (const key of [
        "direct-orders",
        "public-listing",
        "home-shelves",
        "catalog-search",
        "exchange-public-listings",
        "notifications",
        "purchase-conversation",
        "purchase-conversations",
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      refresh();
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [400, 403, 404, 409, 422, 429].includes(cause.status)
      ) {
        orderAttempt.current = undefined;
        setPendingAction(undefined);
        void order.refetch();
      }
      setOrderActionError(
        action === "pay" && cause instanceof ApiError && cause.status === 409
          ? "Chưa thể thanh toán. Kiểm tra số dư ví và trạng thái đơn rồi thử lại."
          : buyNowError(cause),
      );
    } finally {
      setOrderBusy(false);
    }
  }

  const [demoBusy, setDemoBusy] = useState(false);
  const [demoPending, setDemoPending] = useState(false);
  const demoAttempt = useRef<{ key: string; version: number } | undefined>(
    undefined,
  );

  async function handleDemoCompletion() {
    if (
      demoBusy ||
      orderBusy ||
      pendingAction ||
      !orderData ||
      !room.orderId ||
      (!orderData.demoCompletionEnabled && !demoAttempt.current)
    )
      return;
    const intent = demoAttempt.current ?? {
      key: crypto.randomUUID(),
      version: orderData.version,
    };
    demoAttempt.current = intent;
    setDemoPending(true);
    setDemoBusy(true);
    setOrderActionError(undefined);
    try {
      await startDemoOrderCompletion(room.orderId, intent.version, intent.key);
      demoAttempt.current = undefined;
      setDemoPending(false);
      await order.refetch();
      refresh();
    } catch (cause) {
      const known =
        cause instanceof ApiError &&
        [400, 401, 403, 404, 409, 422].includes(cause.status);
      if (known) {
        demoAttempt.current = undefined;
        setDemoPending(false);
        await order.refetch();
      }
      setOrderActionError(
        known
          ? "Chưa bắt đầu được hoàn tất demo. Kiểm tra quyền và trạng thái đơn."
          : "Chưa xác nhận được kết quả. Thử lại để xác nhận đúng yêu cầu hoàn tất ban đầu.",
      );
    } finally {
      setDemoBusy(false);
    }
  }

  async function submitAddressAndQuote(event: React.FormEvent) {
    event.preventDefault();
    if (!book || !addresses.data || !areas.data || addressBusy) return;
    if (!book.fulfillment) {
      setAddressError(
        "Người bán chưa hoàn thiện nơi gửi cho bài đăng này nên chưa thể báo giá. Hãy trao đổi để người bán cập nhật trước.",
      );
      return;
    }
    if (book.bundle && !bundleAcknowledged) {
      setAddressError("Xem danh sách và xác nhận mua toàn bộ các cuốn trong bộ.");
      return;
    }
    setAddressBusy(true);
    setAddressError(null);
    let phase: "address" | "quote" | "attach" = "address";
    try {
      const activeAddressId =
        selectedAddressId ||
        (addresses.data.items.find((item) => item.isDefault)?.id ??
          addresses.data.items[0]?.id ??
          "new");
      let address =
        activeAddressId === "new"
          ? undefined
          : addresses.data.items.find((item) => item.id === activeAddressId);

      if (!address) {
        if (
          !areas.data.localities.some(
            (item) => item.code === addressForm.localityCode,
          )
        ) {
          setAddressError("Hãy chọn một khu vực phục vụ trong danh sách.");
          setAddressBusy(false);
          return;
        }
        const saved = await session.request(
          "/me/addresses",
          z.object({
            addressId: z.string().uuid(),
            version: z.number().int(),
          }),
          {
            method: "POST",
            headers: { "Idempotency-Key": crypto.randomUUID() },
            body: JSON.stringify({
              expectedBookVersion: addresses.data.version,
              address: { ...addressForm, serviceAreaCode: "HCM-DEMO-v1" },
              makeDefault: true,
            }),
          },
        );
        const refreshed = await addresses.refetch();
        address = refreshed.data?.items.find((item) => item.id === saved.addressId);
        if (!address) {
          throw new Error("Địa chỉ vừa lưu chưa thể xác nhận. Hãy thử lại.");
        }
        setSelectedAddressId(address.id);
      }

      phase = "quote";
      const quoteBody = {
        expectedListingVersion: book.version,
        expectedListingRevisionId: book.revisionId,
        ...(book.bundle ? { acknowledgeWholeBundle: true } : {}),
        destinationAddressId: address.id,
        expectedDestinationAddressVersion: address.version,
        method: "DirectDelivery",
      };
      const quoted = await session.request(
        `/listings/${room.listingId}/quotes`,
        quoteReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(quoteBody),
        },
      );
      const currentQuote = await session.request(
        `/me/quotes/${quoted.entityId}`,
        quoteDetailSchema,
      );

      phase = "attach";
      await attachPurchaseQuote(
        room.id,
        {
          quoteId: currentQuote.id,
          expectedQuoteVersion: currentQuote.version,
          expectedListingVersion: currentQuote.listingVersion,
          expectedListingRevisionId: currentQuote.listingRevisionId,
          expectedVersion: room.version,
        },
        crypto.randomUUID(),
      );

      setAddressDialogOpen(false);
      refresh();
    } catch (cause) {
      setAddressError(quoteErrorText(cause, phase));
    } finally {
      setAddressBusy(false);
    }
  }

  const locked =
    terms?.locked ||
    room.status !== "Active" ||
    !book ||
    book.purchaseAvailability.status !== "Available";

  async function command(body: TermsProposalBody | TermsResponseBody) {
    if (busy || exchangeBlocked) return;
    pending.current ??= { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await changeConversationTerms(
        room.id,
        pending.current.body,
        pending.current.key,
      );
      pending.current = null;
      setUncertain(false);
      setAmount("");
      setEditingPrice(false);
      refresh();
    } catch (e) {
      const terminal =
        e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status);
      if (terminal) {
        pending.current = null;
        setUncertain(false);
        refresh();
      } else {
        setUncertain(true);
      }
      setError(
        terminal
          ? "Điều kiện hoặc phiếu vừa thay đổi. Kiểm tra nội dung mới trước khi gửi lại."
          : "Chưa xác nhận được kết quả. Thử lại sẽ giữ đúng đề nghị vừa gửi.",
      );
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || uncertain || locked || frozen || exchangeBlocked;
  const mode = terms?.mode ?? "Negotiation";
  const exchangeSummaryId =
    historyExchange ??
    terms?.activeExchangeId ??
    createdExchange(room.listingId);
  const exchangeSheetId = "exchange-sheet-" + room.id;
  const conditionLabel = book ? conditions[book.condition] : undefined;
  const quoteCurrent = Boolean(
    room.hasQuote &&
      room.quotePreview &&
      Date.parse(room.quotePreview.expiresAt) > now,
  );

  const latestExchangeId =
    room.terms?.activeExchangeId ??
    (room.terms?.exchangeIds?.length
      ? room.terms.exchangeIds[room.terms.exchangeIds.length - 1]
      : null);
  const currentExchangeId =
    historyExchange === "new" ? null : (historyExchange ?? latestExchangeId);

  if (mode === "Exchange" && currentExchangeId) {
    const navigation = (
      <TransactionDisclosure
        title={`Lịch sử các đề nghị đổi sách (${room.terms?.exchangeIds?.length ?? 0} lần)`}
      >
        {room.terms?.exchangeIds?.map((id, i) => (
          <button
            type="button"
            className={styles.secondaryActionBtn}
            key={id}
            onClick={() =>
              setHistoryExchange(id === latestExchangeId ? null : id)
            }
          >
            Xem đề nghị lần {i + 1}
            {id === latestExchangeId ? " — mới nhất" : ""}
          </button>
        ))}
        {Boolean(latestExchangeId && !room.terms?.activeExchangeId) && (
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={() => setHistoryExchange("new")}
            style={{ marginTop: 6, display: "block" }}
          >
            + Mở đề xuất trao đổi mới
          </button>
        )}
      </TransactionDisclosure>
    );

    return (
      <ExchangeDetailPage
        key={currentExchangeId}
        exchangeId={currentExchangeId}
        embedded
        workspaceNavigation={navigation}
        workspaceNotice={
          historyExchange &&
          historyExchange !== "new" &&
          historyExchange !== latestExchangeId ? (
            <p role="status">
              Đang xem đề nghị trước đó.{" "}
              <button
                type="button"
                className={styles.secondaryActionBtn}
                onClick={() => setHistoryExchange(null)}
              >
                Về đề nghị mới nhất
              </button>
            </p>
          ) : undefined
        }
      />
    );
  }

  const activeStepIndex = (() => {
    if (!room.orderId || !orderData) return 0;
    switch (orderData.state) {
      case "AwaitingPayment":
      case "PaymentExpired":
        return 1;
      case "PendingSellerConfirmation":
      case "Preparing":
      case "InTransit":
        return 2;
      case "Inspection":
      case "ResolutionPending":
        return 3;
      case "Completed":
      case "Cancelled":
      case "SettlementPending":
        return 4;
      default:
        return 1;
    }
  })();

  const effectiveBookPrice = orderData
    ? orderData.amounts.bookPrice
    : terms?.agreedPrice ??
      (proposal?.kind === "Price" ? proposal.amount : null) ??
      book?.salePrice ??
      0;
  const shippingFee = orderData
    ? orderData.amounts.shippingFee
    : room.quotePreview?.shippingFee ?? 0;
  const buyerTotal = orderData
    ? orderData.amounts.buyerTotal
    : effectiveBookPrice + shippingFee;
  const shippingAddress = orderData?.shippingAddress ?? orderData?.ownAddress;

  return (
    <div id={exchangeSheetId} tabIndex={-1} data-transaction-page>
      {historyExchange === "new" && (
        <div
          className={styles.procedureNoticeInfo}
          style={{ marginBottom: 14 }}
        >
          <p>
            Bạn đang tạo một đề xuất trao đổi mới.{" "}
            <button
              type="button"
              className={styles.secondaryActionBtn}
              onClick={() => setHistoryExchange(null)}
            >
              Quay lại xem giao dịch trước đó
            </button>
          </p>
        </div>
      )}

      {/* 5-Step Horizontal Pill Bar (Matching ExchangeSteps) */}
      <nav className={stepStyles.steps} aria-label="Các bước mua sách">
        <ol>
          {NEGOTIATION_STEPS.map(({ id, label }, index) => {
            const isCurrent = index === activeStepIndex;
            const isCompleted = index < activeStepIndex;
            return (
              <li
                key={id}
                data-current={isCurrent || undefined}
                data-selected={isCurrent || undefined}
                data-completed={isCompleted || undefined}
              >
                <span
                  className={stepStyles.step}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span className={stepStyles.marker} aria-hidden="true">
                    {isCompleted ? (
                      <Check size={14} strokeWidth={2.8} aria-hidden="true" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className={stepStyles.label}>{label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* 2-Column Workspace (Matching ExchangeDetailPage) */}
      <div className={`${exchangeStyles.proposalWorkspace} ${styles.negotiationGrid}`}>
        {/* RIGHT COLUMN TOP: ACTION BOX */}
        <div className={exchangeStyles.proposalControls}>
          <div className={exchangeStyles.proposalActions}>
            {orderData ? (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <strong style={{ fontSize: "1rem" }}>
                    {orderData.state === "AwaitingPayment"
                      ? isBuyer
                        ? "Chờ bạn thanh toán"
                        : "Chờ người mua thanh toán"
                      : orderData.state === "PendingSellerConfirmation"
                        ? seller
                          ? "Xác nhận nhận đơn"
                          : "Chờ người bán xác nhận"
                        : orderData.state === "Preparing"
                          ? seller
                            ? "Chuẩn bị và bàn giao sách"
                            : "Người bán đang chuẩn bị sách"
                          : orderData.state === "InTransit"
                            ? "Đang vận chuyển sách"
                            : orderData.state === "Inspection" ||
                                orderData.state === "ResolutionPending"
                              ? "Kiểm tra sách (72 giờ)"
                              : orderData.state === "Completed"
                                ? "Giao dịch hoàn tất"
                                : "Đơn hàng đã kết thúc"}
                  </strong>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background:
                        orderData.state === "Completed"
                          ? "#eaf8ed"
                          : orderData.state === "AwaitingPayment"
                            ? "#fff2e0"
                            : orderData.state === "Cancelled" ||
                                orderData.state === "PaymentExpired"
                              ? "#fde8e8"
                              : "#fffcf5",
                      color:
                        orderData.state === "Completed"
                          ? "#156633"
                          : orderData.state === "AwaitingPayment"
                            ? "#875109"
                            : orderData.state === "Cancelled" ||
                                orderData.state === "PaymentExpired"
                              ? "#9b1c1c"
                              : "#5c0202",
                      border: "1px solid rgba(92, 2, 2, 0.14)",
                    }}
                  >
                    {orderStates[orderData.state] ?? "Đang xử lý"}
                  </span>
                </div>

                {/* BƯỚC 2: CHỜ THANH TOÁN (AwaitingPayment) */}
                {orderData.state === "AwaitingPayment" && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className={styles.procedureNoticeWarning}>
                      <Clock size={20} aria-hidden="true" />
                      <div>
                        <h4>Chờ thanh toán đơn hàng</h4>
                        <p>
                          Vui lòng thanh toán trước{" "}
                          <strong>{orderTime(orderData.paymentDeadline)}</strong>.
                          Quá hạn, đơn hàng sẽ tự động hủy và sách được mở lại cho người khác.
                        </p>
                      </div>
                    </div>

                    {isBuyer ? (
                      <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                        {(orderData.paymentEnabled || pendingAction === "pay") && (
                          <button
                            type="button"
                            className={styles.primaryActionBtn}
                            style={{
                              justifyContent: "center",
                              fontSize: "0.9375rem",
                              minHeight: 44,
                            }}
                            disabled={orderBusy || pendingAction === "cancel"}
                            onClick={() => void handleOrderAct("pay")}
                          >
                            <CreditCard size={18} aria-hidden="true" />
                            <span>
                              {orderBusy && pendingAction === "pay"
                                ? "Đang xác nhận thanh toán…"
                                : pendingAction === "pay"
                                  ? "Thử lại thanh toán"
                                  : `Thanh toán ngay ${formatVnd(orderData.amounts.buyerTotal)}`}
                            </span>
                          </button>
                        )}

                        {(orderData.canCancel || pendingAction === "cancel") && (
                          <button
                            type="button"
                            className={styles.secondaryActionBtn}
                            style={{
                              justifyContent: "center",
                              minHeight: 38,
                            }}
                            disabled={orderBusy || pendingAction === "pay"}
                            onClick={() => void handleOrderAct("cancel")}
                          >
                            <XCircle size={16} aria-hidden="true" />
                            <span>
                              {orderBusy && pendingAction === "cancel"
                                ? "Đang hủy đơn…"
                                : pendingAction === "cancel"
                                  ? "Thử lại hủy đơn"
                                  : "Hủy đơn chưa thanh toán"}
                            </span>
                          </button>
                        )}

                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: "0.8125rem",
                            color: "var(--shop-muted)",
                          }}
                        >
                          Số dư ví không đủ?{" "}
                          <Link
                            to="/wallet"
                            style={{
                              color: "var(--shop-wine)",
                              fontWeight: 600,
                              textDecoration: "underline",
                            }}
                          >
                            Mở Ví Lật Lại để nạp tiền
                          </Link>{" "}
                          rồi quay lại đơn này để thanh toán.
                        </p>
                      </div>
                    ) : (
                      <div className={styles.procedureNoticeInfo}>
                        <Clock size={18} aria-hidden="true" />
                        <div>
                          <h4>Đang chờ người mua thanh toán</h4>
                          <p>
                            Người mua đang tiến hành chuyển tiền qua ví. Sách đang được
                            giữ tạm thời cho đơn này đến hạn chót {orderTime(orderData.paymentDeadline)}.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* BƯỚC 3: NGƯỜI BÁN XÁC NHẬN (PendingSellerConfirmation) */}
                {orderData.state === "PendingSellerConfirmation" && (
                  <div style={{ display: "grid", gap: 10 }}>
                    {seller ? (
                      <OrderResponse
                        key={orderData.id}
                        order={orderData}
                        onChanged={() => order.refetch()}
                      />
                    ) : (
                      <div className={styles.procedureNoticeInfo}>
                        <Clock size={18} aria-hidden="true" />
                        <div>
                          <h4>Đã thanh toán · Chờ người bán xác nhận</h4>
                          <p>
                            Tiền đã được giữ an toàn trong quỹ bảo chứng. Đang chờ người bán xác
                            nhận nhận đơn để tiến hành chuẩn bị sách.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* BƯỚC 3: CHUẨN BỊ SÁCH (Preparing) */}
                {orderData.state === "Preparing" && (
                  <div style={{ display: "grid", gap: 10 }}>
                    {orderData.preparation && (
                      <div className={styles.deadlineBadge} style={{ marginBottom: 4 }}>
                        <Clock size={16} aria-hidden="true" />
                        <span>
                          Hạn bàn giao vận chuyển:{" "}
                          <strong>{orderTime(orderData.preparation.pickupDeadline)}</strong>
                        </span>
                      </div>
                    )}

                    {seller ? (
                      shipment.data ? (
                        <div className={styles.procedureNoticeSuccess}>
                          <Package size={20} aria-hidden="true" />
                          <div>
                            <h4>Đã đăng ký vận đơn giao sách</h4>
                            <p style={{ margin: "2px 0 0", fontSize: "0.875rem" }}>
                              Mã vận đơn: <strong>{shipment.data.trackingCode}</strong>
                              <br />
                              {shipment.data.pickupConfirmed
                                ? "Đơn vị vận chuyển đã xác nhận nhận sách."
                                : "Đang chờ shipper tới nhận sách theo lịch hẹn."}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gap: 10 }}>
                          <p
                            style={{
                              margin: 0,
                              fontSize: "0.875rem",
                              color: "var(--shop-muted)",
                              lineHeight: 1.5,
                            }}
                          >
                            Đơn hàng đã được thanh toán an toàn qua quỹ bảo chứng. Vui lòng đóng gói sách và gửi cho đơn vị vận chuyển trước thời hạn.
                          </p>

                          <button
                            type="button"
                            className={styles.primaryActionBtn}
                            style={{
                              justifyContent: "center",
                              minHeight: 44,
                              fontSize: "0.9375rem",
                            }}
                            onClick={() => setShipmentDialogOpen(true)}
                          >
                            <Truck size={18} aria-hidden="true" />
                            <span>Xác nhận gửi sách</span>
                          </button>
                        </div>
                      )
                    ) : (
                      <div className={styles.procedureNoticeSuccess}>
                        <Package size={20} aria-hidden="true" />
                        <div>
                          <h4>Người bán đang chuẩn bị sách</h4>
                          <p style={{ margin: "2px 0 0", fontSize: "0.875rem" }}>
                            {shipment.data
                              ? `Mã vận đơn: ${shipment.data.trackingCode}. Người bán đã đăng ký vận đơn và đang bàn giao sách.`
                              : "Đơn hàng đã được xác nhận. Người bán đang tiến hành đóng gói sách và sẽ bàn giao cho shipper trước thời hạn."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* BƯỚC 3: VẬN CHUYỂN (InTransit) */}
                {orderData.state === "InTransit" && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className={styles.procedureNoticeInfo}>
                      <Truck size={22} aria-hidden="true" />
                      <div>
                        <h4>
                          {orderData.demoCompletionAt
                            ? "Đang hoàn tất và giải ngân đơn demo"
                            : "Kiện hàng đang được giao"}
                        </h4>
                        <p>
                          {orderData.demoCompletionAt
                            ? "Hệ thống xử lý mốc 5 giây tại máy chủ. Khi hoàn tất, tiền đang giữ sẽ chuyển vào ví người bán."
                            : "Đơn vị vận chuyển đã nhận sách và đang trên đường giao đến địa chỉ nhận."}
                        </p>
                      </div>
                    </div>

                    {!orderData.demoCompletionAt && (
                      <OrderShipping
                        key={orderData.id}
                        order={orderData}
                        onChange={() => void order.refetch()}
                      />
                    )}
                  </div>
                )}

                {/* BƯỚC 4: KIỂM TRA SÁCH 72H (Inspection) */}
                {(orderData.state === "Inspection" ||
                  orderData.state === "ResolutionPending") && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className={styles.procedureNoticeInfo}>
                      <ShieldCheck size={22} aria-hidden="true" />
                      <div>
                        <h4>Kiểm tra sách 72 giờ</h4>
                        <p>
                          Sách đã được giao tới bạn. Vui lòng kiểm tra sách trong vòng 72h. Nếu hài lòng, hãy bấm Xác nhận đã nhận để giải ngân tiền cho người bán.
                        </p>
                      </div>
                    </div>

                    <ReceiptConfirmation
                      order={orderData}
                      onChanged={() => order.refetch()}
                    />
                  </div>
                )}

                {/* BƯỚC 5: KẾT QUẢ / HOÀN TẤT (Completed) */}
                {orderData.state === "Completed" && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className={styles.completedCard}>
                      <CheckCircle2 size={30} className={styles.completedIcon} aria-hidden="true" />
                      <div>
                        <h4>Đơn hàng đã hoàn tất thành công</h4>
                        <p>
                          Giao dịch đã kết thúc tốt đẹp! Khoản tiền thanh toán đã được giải ngân an toàn vào Ví Lật Lại của người bán.
                        </p>
                      </div>
                    </div>

                    <ReviewEntry type="DirectOrder" id={orderData.id} version={orderData.version} />
                  </div>
                )}

                {/* ĐÃ HỦY HOẶC HẾT HẠN */}
                {(orderData.state === "Cancelled" ||
                  orderData.state === "PaymentExpired" ||
                  orderData.state === "SettlementPending") && (
                  <div className={styles.cancelledCard}>
                    <AlertTriangle size={24} className={styles.cancelledIcon} aria-hidden="true" />
                    <div>
                      <h4>{orderStates[orderData.state] ?? "Đơn hàng đã kết thúc"}</h4>
                      <p>
                        {orderData.state === "PaymentExpired"
                          ? "Đơn hàng tự động hủy do người mua không thanh toán trong thời hạn quy định."
                          : orderData.state === "SettlementPending"
                            ? "Đơn đang trong quá trình xử lý hoàn tiền về ví cho người mua."
                            : "Đơn hàng đã được hủy. Mọi khoản tiền ký quỹ đã được xử lý hoàn lại theo quy định."}
                      </p>
                    </div>
                  </div>
                )}

                {/* DEMO COMPLETION */}
                {(orderData.demoCompletionEnabled || demoPending) && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className={styles.secondaryActionBtn}
                      disabled={demoBusy || orderBusy || !!pendingAction}
                      onClick={() => void handleDemoCompletion()}
                      style={{ width: "100%", justifyContent: "center" }}
                    >
                      {demoBusy
                        ? "Đang xác nhận yêu cầu…"
                        : demoPending
                          ? "Thử lại hoàn tất demo"
                          : "⚡ Hoàn tất và giải ngân sau 5 giây (Demo)"}
                    </button>
                  </div>
                )}

                {orderActionError && (
                  <div className={styles.procedureNoticeWarning} style={{ marginTop: 8 }}>
                    <AlertCircle size={16} />
                    <p style={{ margin: 0 }}>{orderActionError}</p>
                  </div>
                )}
              </>
            ) : (
              <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <strong style={{ fontSize: "1rem" }}>
                {proposal
                  ? proposal.proposedById === userId
                    ? "Chờ đối tác phản hồi"
                    : "Đối tác vừa gửi đề nghị"
                  : terms?.agreedPrice != null
                    ? "Đã thống nhất giá sách"
                    : "Thỏa thuận giá mua"}
              </strong>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: proposal
                    ? "#fff2e0"
                    : terms?.agreedPrice != null
                      ? "#eaf8ed"
                      : "#fffcf5",
                  color: proposal
                    ? "#875109"
                    : terms?.agreedPrice != null
                      ? "#156633"
                      : "#5c0202",
                  border: "1px solid rgba(92, 2, 2, 0.14)",
                }}
              >
                {proposal
                  ? "Chờ phản hồi"
                  : isExchange
                    ? "Đổi sách"
                    : terms?.agreedPrice != null
                      ? "Đã chốt giá"
                      : "Đang thương lượng"}
              </span>
            </div>

            {frozen && seller && (
              <div
                className={styles.procedureNoticeWarning}
                role="status"
                style={{ marginBottom: 10 }}
              >
                <div>
                  <p>
                    Chưa xác nhận được yêu cầu tạo đơn trước đó. Tiếp tục để
                    kiểm tra đúng yêu cầu đã gửi.
                  </p>
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    onClick={onOpenOrderDialog}
                  >
                    Tiếp tục yêu cầu tạo đơn
                  </button>
                </div>
              </div>
            )}

            {/* Mode Switcher */}
            {seller && (
              <div
                className={styles.modeSwitchGroup}
                role="group"
                aria-label="Người bán chọn hình thức"
                style={{ marginBottom: 12 }}
              >
                {(["Negotiation", "Exchange"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={styles.modeSwitchBtn}
                    aria-pressed={mode === value}
                    disabled={
                      disabled ||
                      !!proposal ||
                      mode === value ||
                      (value === "Exchange" && book?.mode === "Sale") ||
                      (value === "Negotiation" && book?.mode === "Exchange")
                    }
                    onClick={() =>
                      void command({
                        expectedVersion: room.version,
                        kind: "Mode",
                        mode: value,
                      })
                    }
                  >
                    {mode === value && <Check size={14} aria-hidden="true" />}
                    <span>
                      {value === "Negotiation"
                        ? "Thương lượng mua"
                        : "Đổi sách"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {!seller &&
              mode === "Negotiation" &&
              book?.mode === "Both" &&
              !proposal &&
              !locked && (
                <button
                  type="button"
                  className={styles.secondaryActionBtn}
                  style={{
                    minHeight: 36,
                    fontSize: "0.8125rem",
                    marginBottom: 10,
                    width: "100%",
                  }}
                  disabled={disabled}
                  onClick={() =>
                    void command({
                      expectedVersion: room.version,
                      kind: "RequestExchange",
                    })
                  }
                >
                  <ArrowLeftRight size={14} />
                  <span>Đề nghị đổi sách với người bán</span>
                </button>
              )}

            {/* Active Proposal Banner */}
            {proposal && (
              <div className={styles.proposalCard} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Tag size={16} color="#875109" />
                  <p className={styles.proposalText} style={{ margin: 0 }}>
                    <strong>
                      {proposal.proposedById === userId
                        ? "Bạn vừa đề nghị"
                        : "Đối tác đề nghị"}
                    </strong>{" "}
                    {proposal.kind === "Price" ? (
                      <>
                        giá sách{" "}
                        <strong style={{ color: "#5c0202", fontSize: "1rem" }}>
                          {formatVnd(proposal.amount!)}
                        </strong>
                      </>
                    ) : (
                      <>
                        chuyển sang hình thức{" "}
                        <strong>
                          {proposal.mode === "Exchange"
                            ? "Đổi sách"
                            : "Thương lượng mua"}
                        </strong>
                      </>
                    )}
                  </p>
                </div>

                {proposal.proposedById !== userId ? (
                  <div
                    className={styles.proposalActions}
                    style={{ marginTop: 10 }}
                  >
                    <button
                      type="button"
                      className={styles.primaryActionBtn}
                      style={{ minHeight: 38, fontSize: "0.8125rem" }}
                      disabled={disabled}
                      onClick={() =>
                        void command({
                          expectedVersion: room.version,
                          proposalId: proposal.id,
                          accept: true,
                        })
                      }
                    >
                      <Check size={15} />
                      <span>
                        Chấp nhận{" "}
                        {proposal.kind === "Price" ? "giá này" : "hình thức"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryActionBtn}
                      style={{ minHeight: 38, fontSize: "0.8125rem" }}
                      disabled={disabled}
                      onClick={() =>
                        void command({
                          expectedVersion: room.version,
                          proposalId: proposal.id,
                          accept: false,
                        })
                      }
                    >
                      <X size={15} />
                      <span>Từ chối</span>
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 8,
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#875109" }}>
                      Chưa giữ sách hay trừ tiền.
                    </span>
                    <button
                      type="button"
                      style={{
                        background: "none",
                        border: 0,
                        color: "#912b0e",
                        textDecoration: "underline",
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      disabled={disabled}
                      onClick={() =>
                        void command({
                          expectedVersion: room.version,
                          proposalId: proposal.id,
                          accept: false,
                        })
                      }
                    >
                      Hủy đề nghị
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Negotiation Controls */}
            {mode === "Negotiation" && (
              <div style={{ display: "grid", gap: 10 }}>
                {proposal && guidance.action === "address" && !room.terms?.locked && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddressError(null);
                      setAddressDialogOpen(true);
                    }}
                    className={styles.primaryActionBtn}
                    style={{
                      justifyContent: "center",
                    }}
                  >
                    <MapPin size={16} />
                    <span>{guidance.actionLabel || "Gửi thông tin nhận sách"}</span>
                  </button>
                )}

                {!proposal && (
                  <>
                    {/* 1. Khung Giá & Giao nhận chính (Duy nhất 1 nút hành động) */}
                    <div className={styles.purchaseMainCard}>
                      <div className={styles.purchaseMainCardHeader}>
                        <div>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--shop-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              fontWeight: 700,
                            }}
                          >
                            {terms?.agreedPrice != null
                              ? "Giá đã thống nhất"
                              : "Giá mua bài đăng"}
                          </span>
                          <div className={styles.purchaseMainCardTitle}>
                            {terms?.agreedPrice != null
                              ? "Thương lượng hoàn tất"
                              : "Mua theo giá niêm yết"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span className={styles.purchaseMainCardPrice}>
                            {formatVnd(terms?.agreedPrice ?? book?.salePrice ?? 0)}
                          </span>
                        </div>
                      </div>

                      <p className={styles.purchaseMainCardDesc}>
                        {terms?.agreedPrice != null
                          ? quoteCurrent
                            ? "Hai bên đã thống nhất giá và đã có địa chỉ nhận sách. Người bán đang chuẩn bị tạo đơn."
                            : isBuyer
                              ? "Giá đã được hai bên đồng ý. Vui lòng gửi thông tin nhận sách để người bán tạo đơn."
                              : "Giá đã được hai bên đồng ý. Chờ người mua gửi thông tin nhận sách để tạo đơn."
                          : quoteCurrent
                            ? "Đã gửi thông tin nhận sách. Người bán có thể tạo đơn giao dịch theo giá này."
                            : isBuyer
                              ? "Không cần trả giá nếu bạn đồng ý mức giá này. Gửi thông tin nhận sách để người bán tạo đơn ngay."
                              : "Chờ người mua gửi thông tin nhận sách hoặc đề nghị mức giá mong muốn."}
                      </p>

                      {/* Nút hành động giao nhận chính */}
                      {guidance.action === "address" && !room.terms?.locked && (
                        <button
                          type="button"
                          onClick={() => {
                            setAddressError(null);
                            setAddressDialogOpen(true);
                          }}
                          className={styles.primaryActionBtn}
                          style={{
                            justifyContent: "center",
                            marginTop: 2,
                          }}
                        >
                          <MapPin size={16} />
                          <span>{guidance.actionLabel || "Gửi thông tin nhận sách"}</span>
                        </button>
                      )}

                      {guidance.action === "create-order" && !frozen && (
                        <button
                          className={styles.primaryActionBtn}
                          type="button"
                          onClick={onOpenOrderDialog}
                          style={{
                            justifyContent: "center",
                            marginTop: 2,
                          }}
                        >
                          <Package size={16} />
                          <span>Tạo đơn cho người mua này</span>
                        </button>
                      )}

                      {guidance.action === "edit-listing" && (
                        <Link
                          className={styles.primaryActionBtn}
                          to={`/my-books/${room.listingId}/edit`}
                          style={{
                            justifyContent: "center",
                            textDecoration: "none",
                            marginTop: 2,
                          }}
                        >
                          <PencilLine size={16} />
                          <span>{guidance.actionLabel || "Cập nhật nơi gửi sách"}</span>
                        </Link>
                      )}
                    </div>

                    {/* 2. Dropdown Đề nghị giá (mặc định đóng, mở khi cần) */}
                    {!locked && (
                      <details
                        className={styles.priceOfferDropdown}
                        open={editingPrice}
                        onToggle={(e) =>
                          setEditingPrice((e.target as HTMLDetailsElement).open)
                        }
                      >
                        <summary>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Tag size={14} aria-hidden="true" />
                            <span>
                              {terms?.agreedPrice != null
                                ? "Đề nghị mức giá mới"
                                : "Thương lượng / đề nghị giá khác"}
                            </span>
                          </div>
                          <ChevronDown
                            size={14}
                            className={styles.dropdownChevron}
                            aria-hidden="true"
                          />
                        </summary>

                        <form
                          className={styles.negotiationOfferForm}
                          onSubmit={(e) => {
                            e.preventDefault();
                            const value = Number(amount);
                            if (
                              !Number.isInteger(value) ||
                              value < 10000 ||
                              value > 1000000
                            ) {
                              setError("Nhập giá từ 10.000đ đến 1.000.000đ.");
                              return;
                            }
                            void command({
                              expectedVersion: room.version,
                              kind: "Price",
                              amount: value,
                            });
                          }}
                        >
                          <label
                            htmlFor={`offer-${room.id}`}
                            style={{
                              fontSize: "0.8125rem",
                              fontWeight: 600,
                              color: "#4a3b32",
                            }}
                          >
                            {terms?.agreedPrice != null
                              ? "Đề nghị mức giá mới (₫):"
                              : "Đề nghị giá sách mong muốn (₫):"}
                          </label>
                          <div className={styles.negotiationOfferRow}>
                            <input
                              id={`offer-${room.id}`}
                              inputMode="numeric"
                              type="text"
                              pattern="[0-9]+"
                              value={amount}
                              disabled={disabled}
                              onChange={(e) => setAmount(e.target.value)}
                              placeholder="Ví dụ: 75000"
                              required
                            />
                            <button
                              type="submit"
                              disabled={disabled || !amount}
                            >
                              {busy ? "Đang gửi…" : "Gửi đề nghị"}
                            </button>
                          </div>
                          {terms?.agreedPrice != null && (
                            <button
                              type="button"
                              style={{
                                alignSelf: "flex-start",
                                background: "none",
                                border: 0,
                                color: "#716157",
                                textDecoration: "underline",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                                marginTop: 2,
                              }}
                              disabled={disabled}
                              onClick={() => setEditingPrice(false)}
                            >
                              Giữ nguyên giá đã thống nhất
                            </button>
                          )}
                        </form>
                      </details>
                    )}

                    {/* Cảnh báo bài đăng đã cập nhật nội dung */}
                    {terms?.agreedPrice != null &&
                      book &&
                      terms.agreedListingRevisionId !== book.revisionId && (
                        <div className={styles.procedureNoticeWarning}>
                          <AlertCircle size={18} />
                          <div>
                            <h4>Bài đăng đã cập nhật nội dung</h4>
                            <p>
                              Thông tin bài đăng đã thay đổi kể từ lần chốt giá.
                              Hai bên cần thống nhất lại giá trước khi tạo đơn.
                            </p>
                          </div>
                        </div>
                      )}
                  </>
                )}
              </div>
            )}

            {/* Exchange Mode inside Conversation */}
            {mode === "Exchange" && (
              <div style={{ display: "grid", gap: 10 }}>
                {book && !room.terms?.pendingProposal && !room.terms?.locked ? (
                  <ExchangeOffer
                    key={identity + ":" + room.id}
                    room={room}
                    userId={userId}
                    book={book}
                    refresh={refresh}
                  />
                ) : (
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.875rem",
                      color: "var(--shop-muted)",
                    }}
                  >
                    {seller
                      ? "Chế độ Đổi sách đang hoạt động. Chờ người mua chọn sách từ tủ sách để gửi đề nghị đổi."
                      : "Chưa có đề nghị đổi sách nào đang hoạt động."}
                  </p>
                )}

                {!!room.terms?.exchangeIds.length &&
                  (room.terms.exchangeIds.length > 1 ||
                    !room.terms.activeExchangeId) && (
                    <details
                      className={sheetStyles.exchangeHistory}
                      style={{ marginTop: 4 }}
                    >
                      <summary>
                        Lịch sử các đề nghị đổi sách (
                        {room.terms.exchangeIds.length} lần)
                      </summary>
                      {room.terms.exchangeIds.map((id, i) => (
                        <button
                          type="button"
                          key={id}
                          className={sheetStyles.textButton}
                          onClick={() => setHistoryExchange(id)}
                          style={{ display: "block", margin: "4px 0" }}
                        >
                          Xem đề nghị lần {i + 1}
                          {id === room.terms?.activeExchangeId
                            ? " — hiện tại"
                            : ""}
                        </button>
                      ))}
                    </details>
                  )}
              </div>
            )}

            {error && (
              <div
                className={styles.procedureNoticeWarning}
                style={{ marginTop: 8 }}
              >
                <AlertCircle size={16} />
                <p style={{ margin: 0 }}>{error}</p>
              </div>
            )}

            {uncertain && (
              <button
                type="button"
                className={styles.secondaryActionBtn}
                style={{ marginTop: 8, width: "100%" }}
                disabled={busy}
                onClick={() =>
                  pending.current && void command(pending.current.body)
                }
              >
                Thử lại thao tác trước
              </button>
            )}
              </>
            )}
          </div>

          <div className={exchangeStyles.proposalContact}>
            <SupportLink type="Listing" id={room.listingId} />
          </div>
        </div>

        {/* LEFT COLUMN (FACTS) + RIGHT COLUMN BOTTOM (AMOUNTS) */}
        <div className={exchangeStyles.proposalLayout}>
          <section
            aria-labelledby="negotiation-facts"
            className={`${exchangeStyles.fundingBooks} ${styles.negotiationFactsCol}`}
          >
            <h2 id="negotiation-facts">
              {orderData ? "Phiếu đặt mua sách" : "Phiếu thương lượng mua sách"}
            </h2>

            {/* Card 1: Book Card */}
            <div
              className={exchangeStyles.proposalBooks}
              data-receive={isBuyer ? "true" : undefined}
            >
              <h3>
                {isBuyer ? (
                  <ArrowDownLeft size={18} aria-hidden="true" />
                ) : (
                  <ArrowUpRight size={18} aria-hidden="true" />
                )}
                {isBuyer ? "Sách bạn nhận" : "Sách bạn gửi"}
              </h3>
              <div className={exchangeStyles.proposalBook}>
                <div aria-hidden="true" data-conversation-cover>
                  <div>
                    {book ? (
                      <ListingPhoto book={book} eager fallbackCover />
                    ) : (
                      <div
                        style={{
                          width: 90,
                          height: 120,
                          background: "#efe6d5",
                        }}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <strong className={exchangeStyles.proposalBookTitle}>
                    {book?.bundle?.title ||
                      book?.book.title ||
                      orderData?.item.bundle?.title ||
                      orderData?.item.metadata.title ||
                      "Đang tải thông tin sách…"}
                  </strong>
                  <span className={exchangeStyles.proposalBookAuthor}>
                    {book?.book.authors?.join(", ") ||
                      (orderData
                        ? `Người bán: ${seller ? "Bạn" : room.seller.displayName}`
                        : "Tác giả")}
                  </span>
                  {(isExchange
                    ? book?.exchangeValue ?? book?.salePrice
                    : orderData
                      ? orderData.amounts.bookPrice
                      : book?.salePrice) != null && (
                    <span className={exchangeStyles.proposalBookPrice}>
                      {formatVnd(
                        (isExchange
                          ? book?.exchangeValue ?? book?.salePrice
                          : orderData
                            ? orderData.amounts.bookPrice
                            : book?.salePrice)!,
                      )}
                    </span>
                  )}
                  <details>
                    <summary>Tình trạng sách</summary>
                    <p>
                      {conditionLabel || orderData?.item.condition
                        ? `Tình trạng: ${conditionLabel || orderData?.item.condition}. `
                        : ""}
                      {book?.description ||
                        orderData?.item.description ||
                        "Chưa có mô tả chi tiết."}
                    </p>
                    <p>
                      Bìa & gáy:{" "}
                      {book?.coverNote ||
                        orderData?.item.coverNote ||
                        "Chưa có dữ liệu"}{" "}
                      · Số trang:{" "}
                      {book?.pages ||
                        orderData?.item.pages ||
                        "Chưa có dữ liệu"}
                    </p>
                  </details>
                </div>
              </div>
              {book?.bundle && (
                <div style={{ marginTop: 8 }}>
                  <BundleManifest bundle={book.bundle} />
                </div>
              )}
            </div>

            {/* Card 2: Delivery & Listing Info Card */}
            <div className={exchangeStyles.proposalBooks}>
              <h3>
                <MapPin size={18} aria-hidden="true" />
                Địa chỉ & Giao nhận
              </h3>
              <div
                className={exchangeStyles.proposalBook}
                style={{ paddingBlock: 12 }}
              >
                <div style={{ display: "none" }} aria-hidden="true" />
                <div style={{ gridColumn: "1 / -1", gap: 6 }}>
                  {isExchange ? (
                    <>
                      <strong>Trao đổi sách hai chiều</strong>
                      <span>
                        Hai bên tự chọn địa chỉ giao nhận hoặc điểm hẹn khi gửi
                        và chấp nhận đề nghị đổi sách.
                      </span>
                    </>
                  ) : orderData ? (
                    <>
                      <strong>
                        {shippingAddress?.recipientName} ·{" "}
                        {shippingAddress?.phone}
                      </strong>
                      <span>
                        {addressDetailLabel(shippingAddress?.detail || "")}
                      </span>
                      <span style={{ color: "#156633", fontWeight: 600 }}>
                        {orderData.state === "AwaitingPayment"
                          ? "Đơn hàng đã được tạo. Chờ thanh toán."
                          : `Đơn hàng #${orderData.id.slice(0, 8).toUpperCase()}`}
                      </span>
                    </>
                  ) : room.quotePreview ? (
                    <>
                      <strong>
                        {room.quotePreview.destination.recipientName} ·{" "}
                        {room.quotePreview.destination.phone}
                      </strong>
                      <span>{room.quotePreview.destination.detail}</span>
                      <span style={{ color: "#156633", fontWeight: 600 }}>
                        Đã có báo giá vận chuyển hiệu lực
                      </span>
                      {isBuyer && !room.terms?.locked && !frozen && (
                        <button
                          type="button"
                          onClick={() => {
                            setAddressError(null);
                            setAddressDialogOpen(true);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            color: "var(--shop-wine)",
                            textDecoration: "underline",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            textAlign: "left",
                            marginTop: 4,
                          }}
                        >
                          Thay đổi địa chỉ nhận sách
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <strong>Chưa đính kèm địa chỉ nhận sách</strong>
                      <span>
                        {isBuyer
                          ? "Sau khi thống nhất giá, bạn chọn địa chỉ nhận sách để người bán tạo đơn."
                          : "Người mua sẽ gửi địa chỉ nhận sách để bạn xác nhận tạo đơn."}
                      </span>
                      {isBuyer && !room.terms?.locked && !frozen && (
                        <button
                          type="button"
                          onClick={() => {
                            setAddressError(null);
                            setAddressDialogOpen(true);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            color: "var(--shop-wine)",
                            textDecoration: "underline",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            textAlign: "left",
                            marginTop: 4,
                          }}
                        >
                          Chọn địa chỉ nhận sách ngay
                        </button>
                      )}
                    </>
                  )}
                  <span style={{ marginTop: 4 }}>
                    Khu vực:{" "}
                    {book?.fulfillment?.name ?? "TP.HCM · Giao trực tiếp"}
                  </span>
                  <Link
                    to={`/books/${room.listingId}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      marginTop: 6,
                      color: "var(--shop-wine)",
                      fontWeight: 650,
                      fontSize: "0.85rem",
                    }}
                  >
                    <span>Xem bài đăng gốc</span>
                    <ExternalLink size={13} aria-hidden="true" />
                  </Link>
                  <details>
                    <summary>Quy trình bảo chứng Lật Lại</summary>
                    <p>
                      Sau khi hai bên thống nhất giá và người bán tạo đơn, tiền
                      thanh toán được giữ an toàn trong Quỹ bảo chứng và chỉ
                      giải ngân sau 72h kiểm tra sách.
                    </p>
                  </details>
                </div>
              </div>
            </div>
          </section>

          {isExchange ? (
            <div className={exchangeStyles.proposalAmounts}>
              <ExchangeFinanceSummary
                id={exchangeSummaryId}
                userId={userId}
                referenceValue={book?.exchangeValue}
                sheetId={exchangeSheetId}
                historical={Boolean(historyExchange)}
                now={now}
              />
            </div>
          ) : (
            <section
              className={exchangeStyles.proposalAmounts}
              aria-labelledby="negotiation-amounts"
            >
              <h2 id="negotiation-amounts">
                {orderData ? "Chi tiết thanh toán" : "Nếu hai bên đồng ý"}
              </h2>
              <dl>
                {book?.salePrice != null && (
                  <div>
                    <dt>Giá niêm yết</dt>
                    <dd>{formatVnd(book.salePrice)}</dd>
                  </div>
                )}
                <div>
                  <dt>Tiền sách</dt>
                  <dd>{formatVnd(effectiveBookPrice)}</dd>
                </div>
                <div>
                  <dt>Phí giao hàng</dt>
                  <dd>
                    {shippingFee > 0
                      ? formatVnd(shippingFee)
                      : "Miễn phí"}
                  </dd>
                </div>
                <div>
                  <dt>{isBuyer ? "Bạn cần nộp" : "Người mua thanh toán"}</dt>
                  <dd>
                    <strong>{formatVnd(buyerTotal)}</strong>
                  </dd>
                </div>
              </dl>
              <p className={exchangeStyles.proposalAmountNote}>
                <Clock
                  size={13}
                  style={{ verticalAlign: "-2px", marginRight: 4 }}
                  aria-hidden="true"
                />
                {orderData
                  ? orderData.paidAt
                    ? `Đã thanh toán lúc ${orderTime(orderData.paidAt)}. Tiền đang giữ an toàn trong quỹ bảo chứng.`
                    : `Chưa trừ tiền từ ví. Cần thanh toán trước ${orderTime(orderData.paymentDeadline)} để giữ sách.`
                  : quoteCurrent
                    ? "Đã có địa chỉ nhận sách. Chờ người bán tạo đơn."
                    : "Chưa giữ sách hay trừ tiền."}
              </p>
            </section>
          )}
        </div>
      </div>

      {/* Modal gửi / thay đổi địa chỉ nhận sách ngay trên trang thương lượng */}
      <PurchaseDialog
        open={addressDialogOpen}
        onClose={() => !addressBusy && setAddressDialogOpen(false)}
        title="Địa chỉ nhận sách"
        description="Chọn nơi người bán giao sách cho bạn và lấy báo giá giao hàng"
        busy={addressBusy}
      >
        <form onSubmit={submitAddressAndQuote} className={flow.formSection}>
          {book?.bundle && (
            <BundleAcknowledgment
              bundle={book.bundle}
              checked={bundleAcknowledged}
              onChange={(checked) =>
                setAcknowledgedRevision(
                  checked ? purchaseListingKey(book) : undefined,
                )
              }
            />
          )}

          {addresses.isLoading || areas.isLoading ? (
            <p
              style={{
                padding: 16,
                textAlign: "center",
                color: "var(--shop-muted)",
              }}
            >
              Đang tải danh sách địa chỉ…
            </p>
          ) : (
            <PurchaseAddressFields
              addresses={addresses.data?.items ?? []}
              selected={
                selectedAddressId ||
                (addresses.data?.items.find((item) => item.isDefault)?.id ??
                  addresses.data?.items[0]?.id ??
                  "new")
              }
              onSelect={setSelectedAddressId}
              form={addressForm}
              onChange={setAddressForm}
              localities={areas.data?.localities ?? []}
            />
          )}

          {addressError && (
            <p role="alert" className={flow.error} style={{ marginTop: 12 }}>
              {addressError}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              marginTop: 20,
            }}
          >
            <button
              type="button"
              className={styles.secondaryActionBtn}
              onClick={() => setAddressDialogOpen(false)}
              disabled={addressBusy}
            >
              Hủy
            </button>
            <button
              type="submit"
              className={styles.primaryActionBtn}
              disabled={addressBusy || addresses.isLoading || areas.isLoading}
            >
              {addressBusy ? "Đang xử lý…" : "Xác nhận & đính kèm báo giá"}
            </button>
          </div>
        </form>
      </PurchaseDialog>

      {orderData && (
        <DirectShipmentDialog
          open={shipmentDialogOpen}
          onClose={() => setShipmentDialogOpen(false)}
          order={orderData}
          onSuccess={() => {
            void order.refetch();
            void shipment.refetch();
            refresh();
          }}
        />
      )}
    </div>
  );
}
