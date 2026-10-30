import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Sparkles, Clock, AlertCircle } from "lucide-react";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { session } from "../../../lib/session";
import { ConfirmDialog } from "../../ConfirmDialog";
import { ShipmentDialog } from "../ShipmentDialog";
import { ReceiveDialog } from "../ReceiveDialog";
import { CounterDialog, type CounterOfferData } from "../CounterDialog";
import { AcceptExchangeDialog } from "../AcceptExchangeDialog";
import { counterExchange } from "../../../services/exchangeDetail";
import { ROUTES, formatVnd } from "../../../lib/routes";
import { exchangeError, pendingExchange } from "../../../services/exchange";
import type { ShipmentData } from "../../../services/exchangeShipment";
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
  | "reject"
  | "counter"
  | "fund"
  | "sent"
  | "received"
  | "retry"
  | "complete"
  | "dispute";

interface Props {
  detail: ExchangeDetail;
  onCancel: () => Promise<void>;
  onAccept: (deliveryAddressId?: string, revisionOverride?: number) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onCounter?: (data: CounterOfferData) => Promise<void>;
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
  reject: "Từ chối đề nghị",
  counter: "Đề xuất lại điều khoản",
  fund: "Đặt cọc mô phỏng",
  sent: "Tạo đơn vận chuyển",
  received: "Xác nhận đã nhận sách",
  retry: "Thử lại thao tác trước",
  complete: "✨ Xác nhận hài lòng & Nghiệm thu sách",
  dispute: "Báo sự cố / Khiếu nại",
};

export function ActionCard(props: Props) {
  const { detail } = props;
  const [action, setAction] = useState<Action>();
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const pending = pendingExchange(detail.id);
  const [now, setNow] = useState(() => Date.now());

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

  useEffect(() => {
    if (!detail.fundingDeadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [detail.fundingDeadline]);

  const expired =
    detail.fundingDeadline && Date.parse(detail.fundingDeadline) <= now;

  let instructions = "Theo dõi trạng thái trao đổi tại đây.";
  const actions: Action[] = [];

  if (detail.status === "PENDING") {
    const canAccept = detail.canViewerAccept ?? (detail.viewerRole !== "proposer");
    if (canAccept) {
      instructions =
        detail.viewerRole === "proposer"
          ? "Đối tác đã gửi lại điều khoản chốt mới theo thương lượng. Hãy kiểm tra hợp đồng và bấm chấp nhận để khóa giao dịch."
          : "Xem thông tin sách và các điều khoản trước khi chấp nhận trao đổi.";
      actions.push("accept", "reject");
      if (detail.viewerRole === "proposer") {
        actions.push("cancel");
      }
    } else {
      instructions =
        detail.viewerRole === "proposer"
          ? "Đề nghị đã gửi. Bạn có thể nhắn tin thương lượng trong khung chat hoặc hủy đề nghị nếu đổi ý."
          : "Bạn đã gửi điều khoản chốt cho đối tác. Đang chờ đối tác đồng ý để chính thức khóa giao dịch.";
      actions.push("cancel");
    }
  } else if (detail.status === "FUNDING") {
    instructions = detail.viewerFundedAt
      ? "Bạn đã đặt cọc. Đang chờ đối tác hoàn tất khoản cọc của họ."
      : `Khoản cần giữ từ ví mô phỏng: ${formatVnd(detail.viewerFundingAmount ?? 0)} (cọc và tiền bù nếu có).`;
    if (!detail.viewerFundedAt && !expired) actions.push("fund");
    actions.push("cancel");
  } else if (detail.status === "WAITING_YOU_SEND") {
    const deadlineStr = detail.shippingDeadline
      ? new Date(detail.shippingDeadline).toLocaleString("vi-VN")
      : null;
    const myRole = detail.viewerRole === "proposer" ? "Initiator" : "Recipient";
    const partnerRole = detail.viewerRole === "proposer" ? "Recipient" : "Initiator";

    if (detail.viewerShipping.sentAt) {
      instructions = `Bạn đã tạo đơn vận chuyển thành công. Đang chờ đối tác tạo đơn để bưu tá cùng đến lấy sách ở cả hai đầu.${deadlineStr ? ` Hạn gửi: ${deadlineStr}.` : ""}`;
    } else {
      if (!detail.cancellationRequestedBy) {
        instructions = `Hai bên đã đặt cọc. Hãy đóng gói sách cẩn thận và bấm tạo đơn vận chuyển.${deadlineStr ? ` Hạn chót gửi sách: ${deadlineStr} (72 giờ).` : ""}`;
        actions.push("sent");
        if (!detail.partnerShipping.sentAt) {
          actions.push("cancel");
        }
      } else if (detail.cancellationRequestedBy === myRole) {
        instructions = `Bạn đã gửi yêu cầu hủy trao đổi trước khi gửi sách. Đang chờ đối tác phản hồi. Nếu đối tác đồng thuận, 100% tiền cọc và tiền bù sẽ được hoàn lại về ví của cả hai bên.${deadlineStr ? ` Hạn gửi: ${deadlineStr}.` : ""}`;
        actions.push("sent");
      } else if (detail.cancellationRequestedBy === partnerRole) {
        instructions = `Đối tác đã đề nghị hủy trao đổi trước khi gửi sách. Nếu bạn đồng ý hủy, toàn bộ tiền cọc và tiền bù của cả hai bên sẽ được hoàn trả 100% về ví. Nếu bạn muốn tiếp tục giao dịch, hãy từ chối yêu cầu hủy hoặc tạo đơn gửi sách.${deadlineStr ? ` Hạn gửi: ${deadlineStr}.` : ""}`;
        actions.push("sent", "cancel", "reject");
      }
    }
  } else if (detail.status === "WAITING_YOU_CONFIRM") {
    instructions = detail.viewerShipping.receivedAt
      ? "Bạn đã xác nhận nhận sách. Đang chờ đối tác xác nhận nhận sách để bước vào giai đoạn kiểm tra sách (48 giờ)."
      : "Hai bên đã gửi sách. Chỉ xác nhận khi bạn đã nhận bưu phẩm và kiểm tra kỹ sách.";
    if (!detail.viewerShipping.receivedAt) actions.push("received");
    actions.push("dispute");
  } else if (detail.status === "DELIVERING") {
    instructions = detail.viewerShipping.receivedAt
      ? "Bạn đã xác nhận nhận sách. Đang chờ đối tác xác nhận nhận sách để bước vào giai đoạn kiểm tra sách (48 giờ)."
      : "Sách đang được vận chuyển. Theo dõi bưu gửi tại thẻ Tiến trình giao nhận.";
    if (!detail.viewerShipping.receivedAt && detail.partnerShipping.sentAt) {
      actions.push("received");
    }
    actions.push("dispute");
  } else if (detail.status === "INSPECTING") {
    const deadlineStr = detail.inspectionDeadline
      ? new Date(detail.inspectionDeadline).toLocaleString("vi-VN")
      : null;
    if (detail.viewerCompletedAt) {
      instructions =
        `Bạn đã xác nhận nghiệm thu sách đạt yêu cầu. Đang chờ đối tác xác nhận hoặc hết 48 giờ kiểm tra để hoàn tất giao dịch.${deadlineStr ? ` Hạn kiểm tra: ${deadlineStr}.` : ""}`;
    } else if (detail.partnerCompletedAt) {
      instructions =
        `Đối tác đã bấm xác nhận nghiệm thu sách! Bạn có thể kiểm tra sách kỹ lưỡng. Nếu hoàn toàn hài lòng, hãy bấm 'Xác nhận hài lòng & Nghiệm thu sách' để tất toán sớm và giải phóng cọc ngay.${deadlineStr ? ` Hạn kiểm tra: ${deadlineStr}.` : ""}`;
      actions.push("complete");
    } else {
      instructions =
        `Hai bên đều đã nhận được sách! Giao dịch đang trong khoảng đệm kiểm tra 48 giờ.${deadlineStr ? ` Hạn kiểm tra: ${deadlineStr}.` : ""} Bạn có thể kiểm tra sách kỹ lưỡng. Nếu hoàn toàn hài lòng, hãy bấm 'Xác nhận hài lòng & Nghiệm thu sách' để tất toán sớm và giải phóng cọc ngay.`;
      actions.push("complete");
    }
    actions.push("dispute");
  } else if (detail.status === "COMPLETED") {
    instructions =
      detail.resolutionDecision === "CompleteExchange" && detail.resolutionReason
        ? `Trao đổi đã hoàn tất theo phán quyết của Quản trị viên: "${detail.resolutionReason}". Khoản cọc bảo chứng và tiền bù đã được tất toán.`
        : "Trao đổi đã hoàn tất thành công. Khoản cọc bảo chứng và tiền bù đã được tất toán tự động.";
  } else if (detail.status === "RESOLUTION_PENDING") {
    instructions = detail.disputeReason
      ? `Giao dịch đang có tranh chấp / báo sự cố: "${detail.disputeReason}". Toàn bộ tiền cọc bảo chứng và tiền bù đang được tạm khóa an toàn trên Ledger để bảo vệ quyền lợi của hai bên.`
      : "Trao đổi đang chờ giải quyết tranh chấp. Khoản tiền cọc đang được tạm khóa an toàn.";
  } else {
    instructions =
      detail.cancelReason === "DisputeResolvedRefund" && detail.resolutionReason
        ? `Giao dịch đã hủy theo phán quyết của Quản trị viên: "${detail.resolutionReason}". Toàn bộ tiền cọc và tiền bù đã được hoàn lại 100% về ví của bạn.`
        : detail.cancelReason === "MutualAgreement"
          ? "Hai bên đã đồng thuận hủy giao dịch trước khi gửi sách. Toàn bộ 100% tiền cọc và tiền bù đã được hoàn lại về ví của hai bên và sách đã được mở lại trên kệ."
          : detail.status === "REJECTED"
            ? `Đề nghị đã bị từ chối.${detail.rejectionReason ? ` Lý do: ${detail.rejectionReason}` : ""}`
            : detail.status === "EXPIRED"
              ? "Đề nghị hoặc thời hạn đặt cọc đã hết."
              : "Đề nghị đã bị hủy.";
  }

  const open = async (next: Action) => {
    setError("");
    if (next === "accept") {
      setAcceptOpen(true);
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
    if (next === "counter") {
      setCounterOpen(true);
      return;
    }
    setAction(next);
  };

  async function handleCounterSubmit(data: CounterOfferData) {
    if (!props.onCounter) return;
    setBusy(true);
    try {
      await props.onCounter(data);
      setCounterOpen(false);
    } catch (failure) {
      throw new Error(exchangeError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function handleShipmentSubmit(shipmentData: ShipmentData) {
    setBusy(true);
    try {
      await props.onConfirmSent(shipmentData);
      setShipmentOpen(false);
    } catch (failure) {
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
      throw new Error(exchangeError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!action || busy || action === "counter") return;
    if (
      (action === "reject" || action === "dispute") &&
      (reason.trim().length < 5 || reason.trim().length > 300)
    ) {
      setError("Nhập lý do từ 5 đến 300 ký tự.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const run: Record<Exclude<Action, "counter">, () => Promise<void>> = {
        accept: () => props.onAccept(selectedAddressId || undefined),
        cancel: props.onCancel,
        reject: () => props.onReject(reason.trim()),
        fund: props.onFund,
        sent: () => props.onConfirmSent(),
        received: props.onConfirmReceived,
        retry: props.onRetry,
        complete: props.onComplete,
        dispute: () => (props.onDispute ? props.onDispute(reason.trim()) : Promise.resolve()),
      };
      await run[action]();
      setAction(undefined);
    } catch (failure) {
      setError(exchangeError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <h2 className={styles.cardTitle}>
          <Sparkles className={styles.iconGold} size={18} />
          <span>Hành động tiếp theo</span>
        </h2>
        <span className={styles.roleBadge}>
          {detail.status === "PENDING"
            ? (detail.viewerRole === "proposer" ? "Đã gửi đề nghị" : "Chờ bạn phản hồi")
            : detail.status === "FUNDING"
            ? "Đặt cọc bảo chứng"
            : detail.status === "WAITING_YOU_SEND"
            ? "Chuẩn bị gửi sách"
            : "Đang tiến hành"}
        </span>
      </div>
      <div className={styles.calloutBox}>
        <p className={styles.instructions}>{instructions}</p>
      </div>
      {detail.status === "FUNDING" && detail.fundingDeadline && (
        <p className={styles.deadlineRow}>
          <Clock size={14} className={styles.iconGold} />
          <span>
            Hạn đặt cọc:{" "}
            <time dateTime={detail.fundingDeadline}>
              {new Date(detail.fundingDeadline).toLocaleString("vi-VN")}
            </time>
            {expired ? " · Đã hết hạn" : ""}
          </span>
        </p>
      )}
      {detail.status === "WAITING_YOU_SEND" && detail.shippingDeadline && (
        <p className={styles.deadlineRow}>
          <Clock size={14} className={styles.iconGold} />
          <span>
            Hạn gửi sách (72h):{" "}
            <time dateTime={detail.shippingDeadline}>
              {new Date(detail.shippingDeadline).toLocaleString("vi-VN")}
            </time>
            {Date.parse(detail.shippingDeadline) <= now
              ? " · Đã hết hạn (hệ thống sẽ tự động quét hoàn tiền hoặc chuyển giải quyết)"
              : ""}
          </span>
        </p>
      )}
      {detail.status === "INSPECTING" && detail.inspectionDeadline && (
        <p className={styles.deadlineRow}>
          <Clock size={14} className={styles.iconGold} />
          <span>
            Hạn kiểm tra sách (48h):{" "}
            <time dateTime={detail.inspectionDeadline}>
              {new Date(detail.inspectionDeadline).toLocaleString("vi-VN")}
            </time>
            {Date.parse(detail.inspectionDeadline) <= now
              ? " · Đã hết hạn (hệ thống sẽ tự động tất toán)"
              : ""}
          </span>
        </p>
      )}
      {pending && (
        <p role="status" className={styles.pendingRow}>
          <AlertCircle size={15} />
          <span>Có thao tác chưa rõ kết quả. Thử lại trước khi thực hiện việc khác.</span>
        </p>
      )}
      <div className={styles.btnGrid}>
        {pending ? (
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={busy}
            onClick={() => void open("retry")}
          >
            {busy ? "Đang xử lý..." : labels.retry}
          </button>
        ) : (
          actions.map((next, index) => {
            const isPrimary = index === 0 && next !== "cancel" && next !== "reject";
            const isDanger = next === "cancel" || next === "reject";
            const partnerRole = detail.viewerRole === "proposer" ? "Recipient" : "Initiator";
            let label = labels[next];
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
                {label}
              </button>
            );
          })
        )}
        <Link className={styles.btnSecondary} to={ROUTES.exchangeMine}>
          Trao đổi của tôi
        </Link>
      </div>

      {error && !action && (
        <p role="alert" className={styles.errorText} style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {/* Counter-Offer Negotiation Modal */}
      <CounterDialog
        isOpen={counterOpen}
        onClose={() => setCounterOpen(false)}
        onSubmit={handleCounterSubmit}
        isBusy={busy}
        viewerRole={detail.viewerRole}
        partnerName={detail.partner.username}
        currentCompensationType={detail.moneyCompensationType}
        currentAmount={detail.moneyAmount ?? 0}
        currentAddressId={selectedAddressId}
      />

      {/* Accept Exchange Contract Review Modal */}
      <AcceptExchangeDialog
        isOpen={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        onConfirm={async ({ deliveryAddressId, customTerms }) => {
          setBusy(true);
          try {
            const rev = detail.revision!;
            if (customTerms) {
              // Phương án B: Gửi đề xuất điều khoản mới cho đối tác chốt
              if (props.onCounter) {
                await props.onCounter({
                  diffAmount: customTerms.diffAmount,
                  diffPayer: customTerms.diffPayer,
                  deliveryAddressId,
                  note: "Đề xuất chốt hợp đồng trao đổi theo thỏa thuận trong chat",
                });
              } else {
                await counterExchange(detail.id, rev, {
                  diffAmount: customTerms.diffAmount,
                  diffPayer: customTerms.diffPayer,
                  deliveryAddressId,
                  note: "Đề xuất chốt hợp đồng trao đổi theo thỏa thuận trong chat",
                });
              }
              setAcceptOpen(false);
            } else {
              // Chấp nhận điều khoản ban đầu -> Khóa giao dịch & chuyển sang đặt cọc ngay!
              await props.onAccept(deliveryAddressId, rev);
              setAcceptOpen(false);
            }
          } catch (failure) {
            throw new Error(exchangeError(failure));
          } finally {
            setBusy(false);
          }
        }}
        isBusy={busy}
        detail={detail}
      />

      {/* Shipment Modal */}
      <ShipmentDialog
        isOpen={shipmentOpen}
        onClose={() => setShipmentOpen(false)}
        onSubmit={handleShipmentSubmit}
        isBusy={busy}
        exchangeId={detail.id}
        senderAddress={detail.viewerAddress}
        receiverAddress={detail.partnerAddress}
        bookTitle={detail.giveBooks[0]?.title}
      />

      {/* Receive Modal */}
      <ReceiveDialog
        isOpen={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        onConfirm={handleReceiveConfirm}
        isBusy={busy}
        bookTitle={detail.receiveBooks[0]?.title}
      />

      {/* Generic Confirmation Modal for Reject/Cancel/Fund/Complete/Dispute */}
      <ConfirmDialog
        isOpen={!!action}
        onClose={() => setAction(undefined)}
        title={
          action === "cancel" && detail.status === "WAITING_YOU_SEND"
            ? (detail.cancellationRequestedBy ? "Xác nhận đồng ý hủy" : "Đề nghị hủy giao dịch")
            : action === "reject" && detail.status === "WAITING_YOU_SEND"
              ? "Từ chối yêu cầu hủy"
              : action ? labels[action] : ""
        }
        confirmText={
          action === "dispute"
            ? "Gửi khiếu nại"
            : action === "complete"
              ? "Xác nhận nghiệm thu"
              : action === "cancel" && detail.status === "WAITING_YOU_SEND" && detail.cancellationRequestedBy
                ? "Đồng ý hủy"
                : action === "reject" && detail.status === "WAITING_YOU_SEND"
                  ? "Từ chối hủy"
                  : action ? labels[action] : "Xác nhận"
        }
        isBusy={busy}
        isDanger={action === "cancel" || action === "reject" || action === "dispute"}
        onConfirm={() => void confirm()}
      >
        <p>
          {action === "accept"
            ? "Bằng việc chấp nhận, bạn đồng ý với các điều khoản trao đổi."
            : action === "fund"
              ? `Giữ ${formatVnd(detail.viewerFundingAmount ?? 0)} từ ví mô phỏng. Kiểm tra khoản tiền trước khi xác nhận.`
              : action === "retry"
                ? "Gửi lại đúng mã và nội dung của thao tác trước để xác nhận kết quả."
                : action === "complete"
                  ? "Bạn xác nhận sách nhận được đúng tình trạng thỏa thuận và hoàn toàn hài lòng với chất lượng? Khi cả hai bên cùng xác nhận nghiệm thu (hoặc hết hạn 48h kiểm tra), giao dịch sẽ hoàn tất và tiền cọc bảo chứng sẽ được giải phóng ngay."
                  : action === "dispute"
                    ? "Nếu sách có vấn đề nghiêm trọng (hư hỏng nặng, rách nát, sách giả, không đúng cam kết hoặc đối tác không gửi hàng), bạn có thể gửi khiếu nại để tạm dừng tất toán tự động và chuyển sang trạng thái chờ giải quyết để bảo vệ quyền lợi."
                    : action === "cancel" && detail.status === "WAITING_YOU_SEND"
                      ? (detail.cancellationRequestedBy
                          ? "Đối tác đã đề nghị hủy giao dịch này trước khi gửi sách. Bằng việc đồng ý, giao dịch sẽ hủy an toàn và toàn bộ 100% tiền cọc cùng tiền bù của cả hai bên sẽ được hoàn trả về ví mô phỏng. Sách sẽ được mở lại trên kệ."
                          : "Bạn có chắc muốn gửi yêu cầu hủy giao dịch trao đổi này trước khi gửi sách? Hệ thống sẽ gửi thông báo đến đối tác. Khi đối tác xác nhận đồng thuận, giao dịch sẽ hủy và hoàn trả 100% tiền cọc cho cả hai bên.")
                      : action === "reject" && detail.status === "WAITING_YOU_SEND"
                        ? "Bạn có chắc muốn từ chối yêu cầu hủy của đối tác để tiếp tục giao dịch? Hãy nhập lý do để đối tác yên tâm chuẩn bị và gửi sách đúng hạn."
                        : "Kiểm tra thông tin trước khi xác nhận thao tác này."}
        </p>
        {(action === "reject" || action === "dispute") && (
          <>
            <label htmlFor="exchange-reason">
              {action === "dispute"
                ? "Lý do khiếu nại / mô tả sự cố (từ 5 đến 300 ký tự)"
                : detail.status === "WAITING_YOU_SEND"
                  ? "Lý do từ chối hủy (từ 5 đến 300 ký tự)"
                  : "Lý do từ chối"}
            </label>
            <textarea
              id="exchange-reason"
              className={styles.textarea}
              value={reason}
              maxLength={300}
              placeholder={
                action === "dispute"
                  ? "Mô tả chi tiết vấn đề bạn gặp phải để đối chiếu..."
                  : detail.status === "WAITING_YOU_SEND"
                    ? "Ví dụ: Tôi đã đóng gói sách cẩn thận và sẽ gửi đi ngay hôm nay..."
                    : ""
              }
              disabled={busy || !!pending}
              onChange={(e) => setReason(e.target.value)}
            />
          </>
        )}
        {error && (
          <p role="alert" className={styles.errorText}>
            {error}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
