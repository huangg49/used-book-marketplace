import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { session } from "../../../lib/session";
import { ConfirmDialog } from "../../ConfirmDialog";
import { ShipmentDialog } from "../ShipmentDialog";
import { ReceiveDialog } from "../ReceiveDialog";
import { CounterDialog, type CounterOfferData } from "../CounterDialog";
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
  | "complete";

interface Props {
  detail: ExchangeDetail;
  onCancel: () => Promise<void>;
  onAccept: (deliveryAddressId?: string) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onCounter?: (data: CounterOfferData) => Promise<void>;
  onFund: () => Promise<void>;
  onConfirmSent: (shipmentData?: ShipmentData) => Promise<void>;
  onConfirmReceived: () => Promise<void>;
  onRetry: () => Promise<void>;
  onComplete: () => Promise<void>;
}

const labels: Record<Action, string> = {
  cancel: "Hủy đề nghị",
  accept: "Chấp nhận đề nghị",
  reject: "Từ chối đề nghị",
  counter: "Đề xuất lại điều khoản",
  fund: "Đặt cọc mô phỏng",
  sent: "Xác nhận đã gửi sách",
  received: "Xác nhận đã nhận sách",
  retry: "Thử lại thao tác trước",
  complete: "Nghiệm thu hài lòng",
};

export function ActionCard(props: Props) {
  const { detail } = props;
  const [action, setAction] = useState<Action>();
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
    instructions =
      detail.viewerRole === "proposer"
        ? "Đề nghị đã gửi. Bạn có thể nhắn tin thương lượng hoặc đề xuất lại điều khoản."
        : "Xem sách và khoản tiền bù trước khi chấp nhận, hoặc đề xuất lại điều khoản mới.";
    if (detail.viewerRole === "proposer") actions.push("counter", "cancel");
    else actions.push("accept", "counter", "reject");
  } else if (detail.status === "FUNDING") {
    instructions = detail.viewerFundedAt
      ? "Bạn đã đặt cọc. Đang chờ đối tác hoàn tất khoản cọc của họ."
      : `Khoản cần giữ từ ví mô phỏng: ${formatVnd(detail.viewerFundingAmount ?? 0)} (cọc và tiền bù nếu có).`;
    if (!detail.viewerFundedAt && !expired) actions.push("fund");
    actions.push("cancel");
  } else if (detail.status === "WAITING_YOU_SEND") {
    instructions = detail.viewerShipping.sentAt
      ? "Bạn đã xác nhận gửi. Đang chờ đối tác gửi sách."
      : "Hai bên đã đặt cọc. Hãy đóng gói sách cẩn thận và xác nhận sau khi gửi.";
    if (!detail.viewerShipping.sentAt) actions.push("sent");
  } else if (detail.status === "WAITING_YOU_CONFIRM") {
    instructions = detail.viewerShipping.receivedAt
      ? "Bạn đã xác nhận nhận sách. Đang chờ đối tác xác nhận nhận sách để bước vào giai đoạn kiểm tra sách (48 giờ)."
      : "Hai bên đã gửi sách. Chỉ xác nhận khi bạn đã nhận bưu phẩm và kiểm tra kỹ sách.";
    if (!detail.viewerShipping.receivedAt) actions.push("received");
  } else if (detail.status === "DELIVERING") {
    instructions = detail.viewerShipping.receivedAt
      ? "Bạn đã xác nhận nhận sách. Đang chờ đối tác xác nhận nhận sách để bước vào giai đoạn kiểm tra sách (48 giờ)."
      : "Sách đang được vận chuyển. Theo dõi bưu gửi tại thẻ Tiến trình giao nhận.";
    if (!detail.viewerShipping.receivedAt && detail.partnerShipping.sentAt) {
      actions.push("received");
    }
  } else if (detail.status === "INSPECTING") {
    if (detail.viewerCompletedAt) {
      instructions =
        "Bạn đã xác nhận nghiệm thu hài lòng. Đang chờ đối tác nghiệm thu sách hoặc hết 48 giờ kiểm tra để hoàn tất giao dịch.";
    } else if (detail.partnerCompletedAt) {
      instructions =
        "Đối tác đã nghiệm thu hài lòng! Bạn có thể kiểm tra sách kỹ lưỡng. Nếu hài lòng, hãy bấm 'Nghiệm thu hài lòng' để tất toán sớm và nhận lại cọc ngay.";
      actions.push("complete");
    } else {
      instructions =
        "Hai bên đều đã nhận được sách! Giao dịch đang trong khoảng đệm kiểm tra 48 giờ. Bạn có thể kiểm tra sách kỹ lưỡng. Nếu hài lòng, hãy bấm 'Nghiệm thu hài lòng' để tất toán sớm và giải phóng cọc ngay.";
      actions.push("complete");
    }
  } else if (detail.status === "COMPLETED") {
    instructions =
      "Trao đổi đã hoàn tất thành công. Khoản cọc bảo chứng và tiền bù đã được tất toán tự động.";
  } else if (detail.status === "RESOLUTION_PENDING") {
    instructions =
      "Trao đổi đang cần xử lý. Khoản tiền giữ chưa được coi là đã hoàn trả.";
  } else {
    instructions =
      detail.status === "REJECTED"
        ? `Đề nghị đã bị từ chối.${detail.rejectionReason ? ` Lý do: ${detail.rejectionReason}` : ""}`
        : detail.status === "EXPIRED"
          ? "Đề nghị hoặc thời hạn đặt cọc đã hết."
          : "Đề nghị đã bị hủy.";
  }

  const open = async (next: Action) => {
    setError("");
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
      action === "reject" &&
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
      <h2 className={styles.cardTitle}>Hành động của bạn</h2>
      <p className={styles.instructions}>{instructions}</p>
      {detail.status === "FUNDING" && detail.fundingDeadline && (
        <p>
          Hạn đặt cọc:{" "}
          <time dateTime={detail.fundingDeadline}>
            {new Date(detail.fundingDeadline).toLocaleString("vi-VN")}
          </time>
          {expired ? " · Đã hết hạn" : ""}
        </p>
      )}
      {detail.status === "INSPECTING" && detail.inspectionDeadline && (
        <p>
          Hạn kiểm tra sách (48h):{" "}
          <time dateTime={detail.inspectionDeadline}>
            {new Date(detail.inspectionDeadline).toLocaleString("vi-VN")}
          </time>
          {Date.parse(detail.inspectionDeadline) <= now
            ? " · Đã hết hạn (hệ thống sẽ tự động tất toán)"
            : ""}
        </p>
      )}
      {pending && (
        <p role="status">
          Có thao tác chưa rõ kết quả. Thử lại trước khi thực hiện việc khác.
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
                {labels[next]}
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

      {/* Generic Confirmation Modal for Reject/Cancel/Fund/Complete */}
      <ConfirmDialog
        isOpen={!!action}
        onClose={() => setAction(undefined)}
        title={action ? labels[action] : ""}
        confirmText={action ? labels[action] : "Xác nhận"}
        isBusy={busy}
        isDanger={action === "cancel"}
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
                  ? "Bạn xác nhận sách nhận được đúng tình trạng thỏa thuận và hài lòng với chất lượng? Khi cả hai bên cùng nghiệm thu hài lòng (hoặc hết hạn 48h kiểm tra), giao dịch sẽ hoàn tất và tiền cọc bảo chứng sẽ được giải phóng ngay."
                  : "Kiểm tra thông tin trước khi xác nhận thao tác này."}
        </p>
        {action === "reject" && (
          <>
            <label htmlFor="exchange-reason">Lý do từ chối</label>
            <textarea
              id="exchange-reason"
              className={styles.textarea}
              value={reason}
              maxLength={300}
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
