import { useExchangeRecovery } from "../../../hooks/useExchangeRecovery";
import { ExchangeRecoveryPanel } from "../ExchangeRecoveryPanel";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeftRight, ArrowUpRight, Check, ChevronUp, Clock, AlertCircle } from "lucide-react";
import { BrandIcon } from "../../BrandIcon";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { session } from "../../../lib/session";
import { ConfirmDialog } from "../../ConfirmDialog";
import { ShipmentDialog } from "../ShipmentDialog";
import { ReceiveDialog } from "../ReceiveDialog";
import { CounterDialog, type CounterOfferData } from "../CounterDialog";
import { AcceptExchangeDialog } from "../AcceptExchangeDialog";
import { ROUTES, formatVnd } from "../../../lib/routes";
import { getWalletSummary } from "../../../services/wallet";
import {
  exchangeError,
  pendingExchange,
  exchangeAcknowledged,
} from "../../../services/exchange";
import type { ShipmentData } from "../../../services/exchangeShipment";
import type { HandoverNavigation } from "../../../lib/exchange-handover";
import { ExchangeInspection } from "../ExchangeInspection";
import { ShippingTrackingCard } from "../ShippingTrackingCard";
import styles from "./ActionCard.module.css";

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

type Action =
  | "cancel"
  | "accept"
  | "counter"
  | "reject"
  | "fund"
  | "sent"
  | "received"
  | "retry"
  | "complete"
  | "dispute";

interface Props {
  compact?: boolean;
  standaloneSheet?: boolean;
  handover?: HandoverNavigation;
  handoverSupport?: React.ReactNode;
  detail: ExchangeDetail;
  onCancel: () => Promise<void>;
  onAccept: (
    deliveryAddressId?: string,
    revisionOverride?: number,
  ) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onCounter?: (data: CounterOfferData, revision: number) => Promise<void>;
  onFund: () => Promise<void>;
  onConfirmSent: (shipmentData?: ShipmentData) => Promise<void>;
  onConfirmReceived: () => Promise<void>;
  onRetry: () => Promise<void>;
  onComplete: () => Promise<void>;
  onDispute?: (reason: string) => Promise<void>;
}

const labels: Record<Action, string> = {
  cancel: "Hủy đề nghị",
  accept: "Chấp nhận đề nghị",
  counter: "Đề xuất sách thay thế",
  reject: "Từ chối đề nghị",
  fund: "Đặt cọc mô phỏng",
  sent: "Tạo đơn gửi sách",
  received: "Xác nhận đã nhận sách",
  retry: "Thử lại thao tác trước",
  complete: "Xác nhận đã kiểm tra",
  dispute: "Báo sự cố / Khiếu nại",
};

/** The card shows an expiry flag, so it only needs to update at the deadline. */
function useDeadlineExpired(deadline: string | undefined) {
  const at = deadline ? Date.parse(deadline) : NaN;
  const expired = useCallback(() => at <= Date.now(), [at]);
  const subscribe = useCallback((notify: () => void) => {
    if (!Number.isFinite(at)) return () => {};
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      const remaining = at - Date.now();
      if (remaining > 0) {
        // Browser timers accept at most a signed 32-bit delay.
        timer = window.setTimeout(schedule, Math.min(remaining, 2_147_483_647));
      }
      notify();
    };
    schedule();
    window.addEventListener("focus", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [at]);
  return useSyncExternalStore(subscribe, expired, expired);
}

export function ActionCard(props: Props) {
  const { detail } = props;
  const [action, setAction] = useState<Exclude<Action, "counter">>();
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [counterRevision, setCounterRevision] = useState<number>();
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const sendTrigger = useRef<HTMLButtonElement>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [disputeCategory, setDisputeCategory] = useState("Sách rách nát / hư hỏng nặng");
  const [disputeDetail, setDisputeDetail] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  useExchangeRecovery();
  const pending = pendingExchange(detail.id);
  const acknowledged = exchangeAcknowledged(detail.id);
  const blocked = Boolean(pending || acknowledged);
  const inspecting = detail.status === "INSPECTING";
  const deadline =
    detail.status === "PENDING" ? detail.proposalExpiresAt :
    detail.status === "FUNDING" ? detail.fundingDeadline :
    detail.status === "WAITING_YOU_SEND" ? detail.shippingDeadline :
    inspecting ? detail.inspectionDeadline :
    undefined;
  const expired = useDeadlineExpired(deadline);
  const inspectionExpired = useDeadlineExpired(
    inspecting || detail.status === "DELIVERING" || detail.status === "WAITING_YOU_CONFIRM"
      ? detail.viewerInspectionDeadline : undefined,
  );
  const canAccept = detail.canViewerAccept ?? detail.viewerRole === "recipient";
  const canReplace = detail.status === "PENDING" && canAccept && !expired &&
    detail.hasAgreementSnapshot && detail.revision != null && Boolean(props.onCounter);
  const fundingAmount = detail.viewerFundingAmount;
  const fundingDialog = action === "fund";
  const fundLabel = fundingAmount == null ? labels.fund : `Đặt cọc ${formatVnd(fundingAmount)}`;
  const wallet = useQuery({
    queryKey: ["wallet-summary", detail.viewer.id],
    queryFn: getWalletSummary,
    enabled: fundingDialog,
    staleTime: 0,
    retry: false,
  });
  const available = wallet.isSuccess ? wallet.data.available : undefined;
  const shortfall = fundingAmount != null && available != null ? Math.max(0, fundingAmount - available) : 0;
  const fundDisabled = expired || fundingAmount == null || !!detail.viewerFundedAt ||
    detail.status !== "FUNDING" || !wallet.isSuccess || wallet.isFetching || shortfall > 0 ||
    !wallet.data?.paymentsEnabled;

  const addresses = useQuery({
    queryKey: ["address-book"],
    queryFn: () => session.request("/me/addresses", addressBookSchema),
    enabled: detail.status === "PENDING",
  });

  useEffect(() => {
    if (addresses.data?.items?.length && !selectedAddressId) {
      const def = addresses.data.items.find((a) => a.isDefault);
      setSelectedAddressId(def ? def.id : addresses.data.items[0].id);
    }
  }, [addresses.data, selectedAddressId]);

  let instructions = "Theo dõi trạng thái trao đổi tại đây.";
  const actions: Action[] = [];

  if (detail.status === "PENDING") {
    if (expired) {
      instructions = "Đề nghị đã hết hạn. Đang chờ cập nhật trạng thái.";
    } else if (canAccept) {
      instructions =
        detail.viewerRole === "proposer"
          ? "Đối tác đã điều chỉnh điều khoản. Hãy kiểm tra sách, cọc và tiền bù trước khi chấp nhận."
          : "Bạn có thể đồng ý hoặc từ chối đề nghị.";
      actions.push("accept");
      if (canReplace) actions.push("counter");
      if (detail.viewerRole === "proposer") {
        actions.push("cancel");
      } else {
        actions.push("reject");
      }
    } else {
      instructions =
        detail.viewerRole === "proposer"
          ? "Bạn có thể hủy trong lúc chờ phản hồi."
          : "Bạn đã gửi đề xuất điều chỉnh. Đang chờ đối tác phản hồi; sách chưa được giữ.";
      if (detail.viewerRole === "proposer") {
        actions.push("cancel");
      }
    }
  } else if (detail.status === "FUNDING") {
    instructions = detail.viewerFundedAt
      ? "Bạn đã đặt cọc. Đang chờ đối tác hoàn tất khoản cọc của họ."
      : `Khoản cần giữ từ ví mô phỏng: ${formatVnd(detail.viewerFundingAmount ?? 0)} (cọc và tiền bù nếu có).`;
    if (!expired) {
      if (!detail.viewerFundedAt && fundingAmount != null) actions.push("fund");
      actions.push("cancel");
    }
  } else if (detail.status === "WAITING_YOU_SEND") {
    const deadlineStr = detail.shippingDeadline
      ? new Date(detail.shippingDeadline).toLocaleString("vi-VN")
      : null;
    const myRole = detail.viewerRole === "proposer" ? "Initiator" : "Recipient";
    const partnerRole =
      detail.viewerRole === "proposer" ? "Recipient" : "Initiator";

    if (detail.partnerShipping.sentAt && !detail.viewerShipping.receivedAt) actions.push("received");
    if (expired && props.onDispute && Boolean(detail.viewerShipping.sentAt) !== Boolean(detail.partnerShipping.sentAt)) {
      actions.push("dispute");
    }
    if (detail.viewerShipping.sentAt) {
      instructions = expired
        ? "Đối tác đã quá hạn gửi. Bạn có thể báo sự cố để hệ thống giữ tiền và kiểm tra chặng giao."
        : "Đã ghi nhận bạn gửi sách. Đối tác có thể xác nhận khi nhận được cuốn của bạn.";
    } else {
      if (!detail.cancellationRequestedBy) {
        instructions = expired
          ? "Đã hết hạn gửi sách. Hệ thống đang cập nhật phiếu."
          : "Hai bên đã đặt cọc. Bạn có thể chuẩn bị gửi sách.";
        if (!expired) actions.push("sent");
        if (!expired && !detail.partnerShipping.sentAt) {
          actions.push("cancel");
        }
      } else if (detail.cancellationRequestedBy === myRole) {
        instructions = `Bạn đã gửi yêu cầu hủy trao đổi trước khi gửi sách. Đang chờ đối tác phản hồi. Nếu đối tác đồng thuận, 100% tiền cọc và tiền bù sẽ được hoàn lại về ví của cả hai bên.${deadlineStr ? ` Hạn gửi: ${deadlineStr}.` : ""}`;
        if (!expired) actions.push("sent");
      } else if (detail.cancellationRequestedBy === partnerRole) {
        instructions = `Đối tác đã đề nghị hủy trao đổi trước khi gửi sách. Nếu bạn đồng ý hủy, toàn bộ tiền cọc và tiền bù của cả hai bên sẽ được hoàn trả 100% về ví. Nếu bạn muốn tiếp tục giao dịch, hãy từ chối yêu cầu hủy hoặc tạo đơn gửi sách.${deadlineStr ? ` Hạn gửi: ${deadlineStr}.` : ""}`;
        if (!expired) actions.push("sent", "cancel", "reject");
      }
    }
  } else if (detail.status === "WAITING_YOU_CONFIRM") {
    instructions = detail.viewerShipping.receivedAt
      ? "Bạn đã xác nhận nhận sách. Đang chờ đối tác xác nhận nhận sách để cùng bước vào giai đoạn kiểm tra sách (72 giờ)."
      : "Hai bên đã gửi sách. Chỉ xác nhận khi bạn đã nhận bưu phẩm và kiểm tra kỹ sách.";
    if (!detail.viewerShipping.receivedAt && detail.partnerShipping.sentAt) actions.push("received");
    if (!inspectionExpired && props.onDispute) actions.push("dispute");
  } else if (detail.status === "DELIVERING") {
    instructions = detail.viewerShipping.receivedAt
      ? "Bạn đã nhận được sách từ bưu tá! Hãy kiểm tra kỹ sách. Nếu sách bị hỏng hóc hoặc không đúng mô tả, bạn có thể bấm 'Báo sự cố / Khiếu nại'. Đang chờ đối tác nhận được kiện sách còn lại để cùng bước vào giai đoạn nghiệm thu (72 giờ đồng kiểm)."
      : "Sách đang được vận chuyển. Theo dõi bưu gửi tại thẻ Tiến trình giao nhận.";
    if (!detail.viewerShipping.receivedAt && detail.partnerShipping.sentAt) {
      actions.push("received");
    }
    if (!inspectionExpired && props.onDispute) actions.push("dispute");
  } else if (inspecting) {
    if (!detail.viewerCompletedAt && !expired) actions.push("complete");
    if (!inspectionExpired && props.onDispute) actions.push("dispute");
  } else if (detail.status === "COMPLETED") {
    instructions =
      detail.resolutionDecision === "CompleteExchange" &&
      detail.resolutionReason
        ? `Trao đổi đã hoàn tất theo phán quyết của Quản trị viên: "${detail.resolutionReason}". Khoản cọc bảo chứng và tiền bù đã được tất toán.`
        : "Trao đổi đã hoàn tất thành công. Khoản cọc bảo chứng và tiền bù đã được tất toán tự động.";
  } else if (detail.status === "RESOLUTION_PENDING") {
    instructions = detail.disputeReason
      ? `Giao dịch đang có tranh chấp / báo sự cố: "${detail.disputeReason}". Toàn bộ tiền cọc bảo chứng và tiền bù đang được tạm khóa an toàn trên Ledger để bảo vệ quyền lợi của hai bên.`
      : "Trao đổi đang chờ giải quyết tranh chấp. Khoản tiền cọc đang được tạm khóa an toàn.";
    if (!detail.returnResolution && detail.partnerShipping.sentAt && !detail.viewerShipping.sentAt &&
      !detail.viewerShipping.receivedAt) actions.push("received");
  } else {
    instructions =
      detail.returnResolution?.outcome
        ? "Hồ sơ trả sách đã xử lý xong. Xem từng khoản đã ghi vào ví bên dưới."
        : detail.cancelReason === "DisputeResolvedRefund" && detail.resolutionReason
        ? `Giao dịch đã hủy theo phán quyết của Quản trị viên: "${detail.resolutionReason}". Toàn bộ tiền cọc và tiền bù đã được hoàn lại 100% về ví của bạn.`
        : detail.cancelReason === "MutualAgreement"
          ? "Hai bên đã đồng thuận hủy giao dịch trước khi gửi sách. Toàn bộ 100% tiền cọc và tiền bù đã được hoàn lại về ví của hai bên và sách đã được mở lại trên kệ."
          : detail.status === "REJECTED"
            ? `Đề nghị đã bị từ chối.${detail.rejectionReason ? ` Lý do: ${detail.rejectionReason}` : ""}`
            : detail.status === "EXPIRED"
              ? "Đề nghị hoặc thời hạn đặt cọc đã hết."
              : detail.cancelReason === "ListingUnavailable"
                ? "Thỏa thuận không còn hợp lệ hoặc thiếu bản chụp sách gốc. Chưa giữ sách hay thu tiền từ đề xuất này. Hãy tạo đề xuất mới từ sách đủ điều kiện."
                : "Đề nghị đã bị hủy.";
  }

  const open = async (next: Action) => {
    setError("");
    if (next === "accept") {
      setAcceptOpen(true);
      return;
    }
    if (next === "counter") {
      setCounterRevision(detail.revision);
      return;
    }
    if (next === "sent") {
      setShipmentOpen(true);
      return;
    }
    if (next === "received") {
      setReceiveOpen(true);
      return;
    }
    if (next === "dispute" && detail.status === "WAITING_YOU_SEND") {
      setDisputeCategory("Đối tác chưa gửi sách");
    }
    setAction(next);
  };

  async function handleCounterSubmit(data: CounterOfferData, revision = detail.revision!) {
    if (!props.onCounter) return;
    setBusy(true);
    try {
      await props.onCounter(data, revision);
      setCounterRevision(undefined);
    } catch (failure) {
      if (pendingExchange(detail.id)) {
        setCounterRevision(undefined);
        setShipmentOpen(false);
        setReceiveOpen(false);
        setAcceptOpen(false);
      }
      throw new Error(exchangeError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function handleShipmentSubmit(shipmentData: ShipmentData) {
    setBusy(true);
    try {
      await props.onConfirmSent(shipmentData);
      if (document.activeElement?.closest("#exchange-shipment-form"))
        document.getElementById("gui-sach")?.focus({ preventScroll: true });
      setShipmentOpen(false);
    } catch (failure) {
      if (pendingExchange(detail.id)) {
        setShipmentOpen(false);
        setReceiveOpen(false);
        setAcceptOpen(false);
      }
      throw new Error(exchangeError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function handleReceiveConfirm() {
    setBusy(true);
    try {
      await props.onConfirmReceived();
      setReceiveOpen(false);
    } catch (failure) {
      if (pendingExchange(detail.id)) {
        setShipmentOpen(false);
        setReceiveOpen(false);
        setAcceptOpen(false);
      }
      throw new Error(exchangeError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!action || busy) return;
    if ((action === "dispute" || action === "complete") && !actions.includes(action)) return;
    if (action === "fund" && fundDisabled) return;
    if (action === "reject") {
      if (reason.trim().length < 5 || reason.trim().length > 300) {
        setError("Nhập lý do từ 5 đến 300 ký tự.");
        return;
      }
    } else if (action === "dispute") {
      const currentDetail = disputeDetail.trim();
      if (currentDetail.length < 5) {
        setError(
          "Nhập mô tả sự cố từ 5 ký tự.",
        );
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      let finalDisputeReason = reason.trim();
      if (action === "dispute") {
        const detailText = disputeDetail.trim();
        finalDisputeReason = `[Sự cố]: ${disputeCategory}\n[Chi tiết]: ${detailText}`;
      }
      const run: Record<Exclude<Action, "counter">, () => Promise<void>> = {
        accept: () => props.onAccept(selectedAddressId || undefined),
        cancel: props.onCancel,
        reject: () => props.onReject(reason.trim()),
        fund: props.onFund,
        sent: () => props.onConfirmSent(),
        received: props.onConfirmReceived,
        retry: props.onRetry,
        complete: props.onComplete,
        dispute: () =>
          props.onDispute
            ? props.onDispute(finalDisputeReason)
            : Promise.resolve(),
      };
      await run[action]();
      setAction(undefined);
    } catch (failure) {
      if (pendingExchange(detail.id)) setAction(undefined);
      setError(exchangeError(failure));
      if (action === "fund" && !pendingExchange(detail.id)) {
        void wallet.refetch();
        void props.onRetry();
      }
    } finally {
      setBusy(false);
    }
  }

  const preparing = detail.status === "WAITING_YOU_SEND";
  const shippingDeadline = preparing && detail.shippingDeadline ? (
    <p className={styles.deadlineRow}>
      <span>
        {detail.viewerShipping.sentAt ? "Hạn gửi của đối tác" : "Hạn gửi sách"}{" "}
        <time dateTime={detail.shippingDeadline}>
          {new Date(detail.shippingDeadline).toLocaleString("vi-VN", {
            hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
          })}
        </time>
        {expired && " · Đã hết hạn, đang chờ cập nhật"}
      </span>
    </p>
  ) : undefined;
  const otherRequestedCancellation = Boolean(detail.cancellationRequestedBy &&
    detail.cancellationRequestedBy !== (detail.viewerRole === "proposer" ? "Initiator" : "Recipient"));
  const visibleActions = props.handover ? actions.filter(next => next !== "sent" && next !== "received") : actions;
  const handoverAction = (next: "sent" | "received") => {
    if (blocked || !actions.includes(next)) return null;
    const expanded = next === "sent" && shipmentOpen;
    const Icon = next === "received" ? Check : expanded ? ChevronUp : ArrowUpRight;
    return (
      <button type="button" className={styles.btnPrimary} disabled={busy}
        ref={next === "sent" ? sendTrigger : undefined}
        aria-expanded={next === "sent" ? shipmentOpen : undefined}
        aria-controls={next === "sent" ? "exchange-shipment-form" : undefined}
        onClick={() => expanded ? setShipmentOpen(false) : void open(next)}>
        <Icon size={17} aria-hidden="true" /> {expanded ? "Thu gọn form" : labels[next]}
      </button>
    );
  };
  return (
    <div className={styles.card} data-compact={props.compact || undefined} data-sheet={props.standaloneSheet || undefined} data-handover={Boolean(props.handover) || undefined} data-funding={detail.status === "FUNDING" || undefined} data-proposal-actions={detail.status === "PENDING" || undefined}>
      {!props.compact && <div className={styles.headerRow}>
        <h2 className={styles.cardTitle}>
          <BrandIcon size={18} />
          <span>Hành động tiếp theo</span>
        </h2>
        <span className={styles.roleBadge}>
          {detail.status === "PENDING"
            ? (detail.canViewerAccept ?? detail.viewerRole !== "proposer")
              ? "Chờ bạn phản hồi"
              : "Chờ đối tác phản hồi"
            : detail.status === "FUNDING"
              ? "Đặt cọc bảo chứng"
              : detail.status === "WAITING_YOU_SEND"
                ? "Chuẩn bị gửi sách"
                : ["CANCELLED", "REJECTED", "EXPIRED"].includes(detail.status)
                  ? "Đã đóng"
                  : ["COMPLETED", "NEED_REVIEW"].includes(detail.status)
                    ? "Đã hoàn tất"
                    : detail.status === 'INSPECTING' ? 'Đang kiểm tra sách' : detail.viewerShipping.receivedAt ? 'Bạn đã nhận sách' : 'Đang giao nhận'}
        </span>
      </div>
      }
      {!inspecting && !props.handover && (!props.standaloneSheet || (expired && detail.status === "PENDING")) && (
        <div className={styles.calloutBox}>
          <p className={styles.instructions}>{instructions}</p>
        </div>
      )}
      {props.standaloneSheet && detail.status === "FUNDING" && (
        <>
          <dl className={styles.fundingAmounts}>
            {fundingAmount != null && (
              <div className={styles.fundingTotal}>
                <dt>{detail.viewerFundedAt ? "Đã giữ từ ví mô phỏng" : expired ? "Khoản theo thỏa thuận" : "Cần nộp từ ví mô phỏng"}</dt>
                <dd>{formatVnd(fundingAmount)}</dd>
              </div>
            )}
            {detail.viewerDeposit != null && <div><dt>Cọc của bạn</dt><dd>{formatVnd(detail.viewerDeposit)}</dd></div>}
            {detail.moneyCompensationType !== "none" && detail.moneyAmount != null && (
              <div>
                <dt>{detail.moneyCompensationType === "user_pays" ? "Tiền bù bạn trả" : "Tiền bù bạn nhận"}</dt>
                <dd>{formatVnd(detail.moneyAmount)}</dd>
              </div>
            )}
          </dl>
          <p className={styles.fundingFee}>Phí giao nhận tính riêng.</p>
          <p className={styles.fundingStatus} role="status">
            {expired ? "Hệ thống đang cập nhật phiếu."
              : detail.viewerFundedAt ? "Chờ đối tác đặt cọc."
              : detail.partnerFundedAt ? "Đối tác đã đặt cọc."
              : "Cả hai cần đặt cọc trước khi gửi sách."}
          </p>
        </>
      )}
      {props.standaloneSheet && detail.status === "PENDING" && !canAccept && !expired && (
        <p className={styles.proposalWaiting}>Chờ đối tác phản hồi</p>
      )}
      {detail.status === "PENDING" && detail.proposalExpiresAt && !expired && (
        <p className={styles.deadlineRow}>
          Hạn phản hồi{" "}
          <time dateTime={detail.proposalExpiresAt}>
            {new Date(detail.proposalExpiresAt).toLocaleString("vi-VN", {
              hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
            })}
          </time>
        </p>
      )}
      {detail.status === "FUNDING" && detail.fundingDeadline && (
        <p className={styles.deadlineRow}>
          <Clock size={14} className={styles.iconGold} />
          <span>
            Hạn đặt cọc:{" "}
            <time dateTime={detail.fundingDeadline}>
              {new Date(detail.fundingDeadline).toLocaleString("vi-VN", {
                hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
              })}
            </time>
            {expired ? " · Đã hết hạn" : ""}
          </span>
        </p>
      )}
      {!props.handover && shippingDeadline}
      {props.handover && (
        <ShippingTrackingCard detail={detail} {...props.handover}
          canSend={!blocked && actions.includes("sent")} shippingExpired={preparing && expired}
          sendDeadline={shippingDeadline}
          sendAction={handoverAction("sent")} receiveAction={handoverAction("received")}
          sendForm={preparing && (
            <ShipmentDialog
              isOpen={shipmentOpen && !blocked && actions.includes("sent")}
              onClose={() => {
                setShipmentOpen(false);
                sendTrigger.current?.focus();
              }}
              onSubmit={handleShipmentSubmit}
              isBusy={busy}
              exchangeId={detail.id}
              senderAddress={detail.viewerAddress}
              receiverAddress={detail.partnerAddress}
              bookTitle={detail.giveBooks[0]?.title}
            />
          )} />
      )}
      {props.handover && preparing && detail.cancellationRequestedBy && (
        <p className={styles.cancellationNotice} role="status">
          {otherRequestedCancellation ? "Đối tác đã đề nghị hủy." : "Bạn đã đề nghị hủy. Đang chờ đối tác trả lời."}
        </p>
      )}
      {(!inspecting && !props.handover && (detail.viewerInspectionDeadline || detail.partnerInspectionDeadline)) && <details className={styles.inspectionDetails}>
        <summary>Hạn kiểm tra của từng bên</summary>
      {detail.viewerInspectionDeadline && (
        <p className={styles.deadlineRow}>
          Hạn kiểm tra sách của bạn:{" "}
          <time dateTime={detail.viewerInspectionDeadline}>
            {new Date(detail.viewerInspectionDeadline).toLocaleString("vi-VN")}
          </time>
        </p>
      )}
      {detail.partnerInspectionDeadline && (
        <p className={styles.deadlineRow}>
          Hạn kiểm tra của đối tác:{" "}
          <time dateTime={detail.partnerInspectionDeadline}>
            {new Date(detail.partnerInspectionDeadline).toLocaleString("vi-VN")}
          </time>
        </p>
      )}
      </details>}
      {inspecting && (
        <ExchangeInspection detail={detail} expired={inspectionExpired} awaitingResult={expired}>
          {!blocked && actions.length > 0 && (
            <div className={styles.inspectionActions}>
              {actions.includes("complete") && <button type="button" className={styles.btnPrimary}
                disabled={busy} onClick={() => void open("complete")}>{labels.complete}</button>}
              {actions.includes("dispute") && <button type="button" className={styles.btnSecondary}
                disabled={busy} onClick={() => void open("dispute")}>Báo sự cố</button>}
            </div>
          )}
        </ExchangeInspection>
      )}
      {pending && !props.standaloneSheet && !props.handover && (
        <p role="status" className={styles.pendingRow}>
          <AlertCircle size={15} />
          <span>
            Có thao tác chưa rõ kết quả. Thử lại trước khi thực hiện việc khác.
          </span>
        </p>
      )}

      {blocked ? (
        <div className={styles.recoverySection}>
          <ExchangeRecoveryPanel id={detail.id} onRead={props.onRetry} />
          <Link className={styles.btnSecondary} to={ROUTES.exchangeMine}>
            Quay lại Trao đổi của tôi
          </Link>
          {props.handoverSupport && <div className={styles.handoverSupport}>{props.handoverSupport}</div>}
        </div>
      ) : !inspecting && (visibleActions.length > 0 || props.handoverSupport || (!props.standaloneSheet && !props.handover)) && (
        <div className={styles.btnGrid}>
          {visibleActions.map((next, index) => {
            const isPrimary =
              !props.handover && index === 0 && next !== "cancel" && next !== "reject";
            const isDanger = next === "cancel" || next === "reject";
            const partnerRole =
              detail.viewerRole === "proposer" ? "Recipient" : "Initiator";
            let label = next === "fund" && props.standaloneSheet ? fundLabel
              : next === "cancel" && detail.status === "FUNDING" ? "Hủy trao đổi"
              : next === "dispute" && props.handover ? "Báo sự cố" : labels[next];
            if (detail.status === "WAITING_YOU_SEND") {
              if (next === "cancel") {
                label =
                  detail.cancellationRequestedBy === partnerRole
                    ? "Đồng ý hủy giao dịch"
                    : "Đề nghị hủy giao dịch";
              } else if (next === "reject") {
                label = "Từ chối yêu cầu hủy";
              }
            }
            return (
              <button
                type="button"
                key={next}
                disabled={busy}
                className={
                  isPrimary
                    ? styles.btnPrimary
                    : isDanger
                      ? styles.btnDanger
                      : styles.btnSecondary
                }
                onClick={() => void open(next)}
              >
                {next === "counter" && <ArrowLeftRight size={16} aria-hidden="true" />}
                {label}
              </button>
            );
          })}
          {!props.standaloneSheet && !props.handover && <Link className={styles.btnSecondary} to={ROUTES.exchangeMine}>
            Trao đổi của tôi
          </Link>}
          {props.handoverSupport && <div className={styles.handoverSupport}>{props.handoverSupport}</div>}
        </div>
      )}

      {error && !action && (
        <p role="alert" className={styles.errorText} style={{ marginTop: 12 }}>
          {error}
        </p>
      )}


      {/* Accept Exchange Contract Review Modal */}
      <AcceptExchangeDialog
        isOpen={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        onConfirm={async ({ deliveryAddressId }) => {
          setBusy(true);
          try {
            await props.onAccept(deliveryAddressId, detail.revision!);
            setAcceptOpen(false);
          } catch (failure) {
            if (pendingExchange(detail.id)) setAcceptOpen(false);
            throw new Error(exchangeError(failure));
          } finally {
            setBusy(false);
          }
        }}
        onCounter={handleCounterSubmit}
        isBusy={busy}
        detail={detail}
      />

      {canReplace && !blocked && counterRevision != null && counterRevision === detail.revision && (
        <CounterDialog
          key={`${detail.id}:${counterRevision}`}
          detail={detail}
          onClose={() => setCounterRevision(undefined)}
          onSubmit={data => handleCounterSubmit(data, counterRevision)}
          isBusy={busy}
        />
      )}

      {/* Receive Modal */}
      {receiveOpen && <ReceiveDialog
        onClose={() => setReceiveOpen(false)}
        onConfirm={handleReceiveConfirm}
        isBusy={busy}
        books={detail.receiveBooks}
      />}

      {/* Generic Confirmation Modal for Reject/Cancel/Fund/Complete/Dispute */}
      <ConfirmDialog
        isOpen={!!action}
        onClose={() => setAction(undefined)}
        maxWidth={action === "dispute" ? "640px" : undefined}
        title={
          action === "cancel" && detail.status === "FUNDING"
            ? "Hủy trao đổi"
            : action === "cancel" && detail.status === "WAITING_YOU_SEND"
            ? detail.cancellationRequestedBy
              ? "Xác nhận đồng ý hủy"
              : "Đề nghị hủy giao dịch"
            : action === "reject" && detail.status === "WAITING_YOU_SEND"
              ? "Từ chối yêu cầu hủy"
              : action
                ? labels[action]
                : ""
        }
        confirmText={
          action === "dispute"
            ? "Gửi biên bản khiếu nại"
            : action === "complete"
              ? "Xác nhận nghiệm thu"
              : action === "cancel" &&
                  detail.status === "WAITING_YOU_SEND" &&
                  detail.cancellationRequestedBy
                ? "Đồng ý hủy"
                : action === "cancel" && detail.status === "FUNDING"
                  ? "Hủy trao đổi"
                : action === "reject" && detail.status === "WAITING_YOU_SEND"
                  ? "Từ chối hủy"
                  : action
                    ? labels[action]
                    : "Xác nhận"
        }
        isBusy={busy}
        isDanger={
          action === "cancel" || action === "reject" || action === "dispute"
        }
        confirmDisabled={(fundingDialog && fundDisabled) ||
          ((action === "dispute" || action === "complete") && !actions.includes(action))}
        onConfirm={() => void confirm()}
      >
        {fundingDialog && (
          <>
            <dl className={styles.fundingAmounts}>
              <div><dt>Ví mô phỏng khả dụng</dt><dd>
                {wallet.isPending || wallet.isFetching ? "Đang tải…" : available == null ? "Chưa tải được" : formatVnd(available)}
              </dd></div>
              <div className={styles.fundingTotal}><dt>Số tiền sẽ giữ</dt><dd>{fundingAmount == null ? "Chưa có dữ liệu" : formatVnd(fundingAmount)}</dd></div>
            </dl>
            {wallet.isError && (
              <p role="status">Chưa kiểm tra được số dư. <button className={styles.inlineButton} type="button" onClick={() => void wallet.refetch()}>Tải lại số dư</button></p>
            )}
            {shortfall > 0 && (
              <p role="alert">Ví còn thiếu {formatVnd(shortfall)}. <Link to={ROUTES.wallet}>Mở ví</Link></p>
            )}
            {wallet.isSuccess && !wallet.data.paymentsEnabled && <p role="status">Ví hiện chưa thể thanh toán.</p>}
            {expired && <p role="status">Đã hết hạn đặt cọc.</p>}
          </>
        )}
        {action !== "dispute" && !fundingDialog && (
          <p className={styles.dialogText}>
            {action === "accept"
              ? "Bằng việc chấp nhận, bạn đồng ý với các điều khoản trao đổi."
                : action === "retry"
                  ? "Gửi lại đúng mã và nội dung của thao tác trước để xác nhận kết quả."
                  : action === "complete"
                    ? "Bạn vẫn có thể báo sự cố đến hết hạn của mình. Tiền cọc tiếp tục được giữ đến khi cả hai hết hạn kiểm tra và giao dịch không có khiếu nại."
                    : action === "cancel" && detail.status === "FUNDING"
                      ? "Sách sẽ được mở lại. Khoản đã nộp sẽ được hoàn về ví của người đã nộp."
                    : action === "cancel" &&
                        detail.status === "WAITING_YOU_SEND"
                      ? detail.cancellationRequestedBy
                        ? "Đối tác đã đề nghị hủy giao dịch này trước khi gửi sách. Bằng việc đồng ý, giao dịch sẽ hủy an toàn và toàn bộ 100% tiền cọc cùng tiền bù của cả hai bên sẽ được hoàn trả về ví mô phỏng. Sách sẽ được mở lại trên kệ."
                        : "Bạn có chắc muốn gửi yêu cầu hủy giao dịch trao đổi này trước khi gửi sách? Hệ thống sẽ gửi thông báo đến đối tác. Khi đối tác xác nhận đồng thuận, giao dịch sẽ hủy và hoàn trả 100% tiền cọc cho cả hai bên."
                      : action === "reject" &&
                          detail.status === "WAITING_YOU_SEND"
                        ? "Bạn có chắc muốn từ chối yêu cầu hủy của đối tác để tiếp tục giao dịch? Hãy nhập lý do để đối tác yên tâm chuẩn bị và gửi sách đúng hạn."
                        : "Kiểm tra thông tin trước khi xác nhận thao tác này."}
          </p>
        )}
        {action === "dispute" ? (
          <div className={styles.disputeContainer}>
            <p className={styles.dialogText}>Khi sự cố được ghi nhận, giao dịch sẽ tạm dừng tất toán.</p>
            {inspectionExpired && <p role="alert" className={styles.errorText}>Hạn báo sự cố của bạn đã qua.</p>}

            <div className={styles.disputeForm}>
              <div className={styles.formGroup}>
                <label htmlFor="dispute-category" className={styles.inputLabel}>
                  <span>Phân loại sự cố</span>
                  <span className={styles.reqStar}>*</span>
                </label>
                <div className={styles.selectWrap}>
                  <select
                    id="dispute-category"
                    className={styles.select}
                    value={disputeCategory}
                    onChange={(e) => setDisputeCategory(e.target.value)}
                    disabled={busy || !!pending}
                  >
                    <option value="Đối tác chưa gửi sách">Đối tác chưa gửi sách</option>
                    <option value="Sách rách nát / hư hỏng nặng">Sách hư hỏng</option>
                    <option value="Giao sai sách / Không đúng cam kết">Sai sách hoặc sai mô tả</option>
                    <option value="Thiếu sách / Bưu kiện rỗng">Thiếu sách hoặc kiện rỗng</option>
                    <option value="Sách nghi vấn bản in lậu / photo">Nghi sách in lậu</option>
                    <option value="Sự cố giao nhận khác">
                      Sự cố giao nhận khác
                    </option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <div className={styles.labelWithCounter}>
                  <label htmlFor="dispute-detail" className={styles.inputLabel}>
                    <span>Mô tả sự cố</span>
                    <span className={styles.reqStar}>*</span>
                  </label>
                  <span className={styles.charCounter}>
                    {disputeDetail.length}/220 ký tự
                  </span>
                </div>
                <textarea
                  id="dispute-detail"
                  className={styles.textarea}
                  value={disputeDetail}
                  maxLength={220}
                  placeholder="Ví dụ: Sách thiếu trang 45 đến 52."
                  disabled={busy || !!pending}
                  onChange={(e) => setDisputeDetail(e.target.value)}
                />
              </div>

              {/* Bằng chứng thẩm định */}
              <p>
                Gửi báo cáo trước hạn. Sau đó bạn có thể bổ sung ảnh, PDF hoặc video trong mục Bằng chứng sự cố.
              </p>
            </div>
          </div>
        ) : action === "reject" ? (
          <>
            <label htmlFor="exchange-reason">
              {detail.status === "WAITING_YOU_SEND"
                ? "Lý do từ chối hủy (từ 5 đến 300 ký tự)"
                : "Lý do từ chối"}
            </label>
            <textarea
              id="exchange-reason"
              className={styles.textarea}
              value={reason}
              maxLength={300}
              placeholder={
                detail.status === "WAITING_YOU_SEND"
                  ? "Ví dụ: Tôi đã đóng gói sách cẩn thận và sẽ gửi đi ngay hôm nay..."
                  : ""
              }
              disabled={busy || !!pending}
              onChange={(e) => setReason(e.target.value)}
            />
          </>
        ) : null}
        {error && (
          <p role="alert" className={styles.errorText}>
            {error}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
