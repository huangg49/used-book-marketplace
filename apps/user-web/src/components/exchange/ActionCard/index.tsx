import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { ConfirmDialog } from "../../ConfirmDialog";
import { ROUTES, formatVnd } from "../../../lib/routes";
import { exchangeError, pendingExchange } from "../../../services/exchange";
import styles from "./ActionCard.module.css";

type Action =
  "cancel" | "accept" | "reject" | "fund" | "sent" | "received" | "retry";
interface Props {
  detail: ExchangeDetail;
  onCancel: () => Promise<void>;
  onAccept: () => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onFund: () => Promise<void>;
  onConfirmSent: () => Promise<void>;
  onConfirmReceived: () => Promise<void>;
  onRetry: () => Promise<void>;
}
const labels: Record<Action, string> = {
  cancel: "Hủy đề nghị",
  accept: "Chấp nhận đề nghị",
  reject: "Từ chối đề nghị",
  fund: "Đặt cọc mô phỏng",
  sent: "Xác nhận đã gửi sách",
  received: "Xác nhận đã nhận sách",
  retry: "Thử lại thao tác trước",
};

export function ActionCard(props: Props) {
  const { detail } = props;
  const [action, setAction] = useState<Action>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const pending = pendingExchange(detail.id);
  const [now, setNow] = useState(() => Date.now());
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
        ? "Đề nghị đã gửi. Đang chờ đối tác phản hồi."
        : "Xem sách và khoản tiền bù trước khi chấp nhận.";
    if (detail.viewerRole === "proposer") actions.push("cancel");
    else actions.push("accept", "reject");
  } else if (detail.status === "FUNDING") {
    instructions = detail.viewerFundedAt
      ? "Bạn đã đặt cọc. Đang chờ đối tác hoàn tất khoản cọc của họ."
      : `Khoản cần giữ từ ví mô phỏng: ${formatVnd(detail.viewerFundingAmount ?? 0)} (cọc và tiền bù nếu có).`;
    if (!detail.viewerFundedAt && !expired) actions.push("fund");
    actions.push("cancel");
  } else if (detail.status === "WAITING_YOU_SEND") {
    instructions = detail.viewerShipping.sentAt
      ? "Bạn đã xác nhận gửi. Đang chờ đối tác gửi sách."
      : "Hai bên đã đặt cọc. Chỉ xác nhận sau khi bạn thực sự gửi sách.";
    if (!detail.viewerShipping.sentAt) actions.push("sent");
  } else if (detail.status === "WAITING_YOU_CONFIRM") {
    instructions =
      "Hai bên đã gửi sách. Chỉ xác nhận khi bạn đã nhận và kiểm tra bản sách.";
    if (!detail.viewerShipping.receivedAt) actions.push("received");
  } else if (detail.status === "DELIVERING") {
    instructions = "Bạn đã xác nhận nhận sách. Đang chờ đối tác xác nhận.";
  } else if (detail.status === "COMPLETED") {
    instructions =
      "Trao đổi đã hoàn tất. Khoản cọc và tiền bù được xử lý theo kết quả máy chủ.";
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
  const open = (next: Action) => {
    setError("");
    setAction(next);
  };
  async function confirm() {
    if (!action || busy) return;
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
      const run = {
        cancel: props.onCancel,
        accept: props.onAccept,
        reject: () => props.onReject(reason.trim()),
        fund: props.onFund,
        sent: props.onConfirmSent,
        received: props.onConfirmReceived,
        retry: props.onRetry,
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
      {pending && (
        <p role="status">
          Có thao tác chưa rõ kết quả. Thử lại trước khi thực hiện việc khác.
        </p>
      )}
      <div className={styles.btnRow}>
        {pending ? (
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => open("retry")}
          >
            {labels.retry}
          </button>
        ) : (
          actions.map((next, index) => (
            <button
              type="button"
              key={next}
              className={
                index === 0 && next !== "cancel"
                  ? styles.btnPrimary
                  : styles.btnSecondary
              }
              onClick={() => open(next)}
            >
              {labels[next]}
            </button>
          ))
        )}
        <Link className={styles.btnSecondary} to={ROUTES.exchangeMine}>
          Trao đổi của tôi
        </Link>
      </div>
      <p className={styles.todoMsg}>
        Nhắn tin, đề xuất lại, báo cáo và đánh giá trao đổi chưa khả dụng.
      </p>
      <ConfirmDialog
        isOpen={!!action}
        onClose={() => setAction(undefined)}
        title={action ? labels[action] : ""}
        confirmText={action ? labels[action] : "Xác nhận"}
        isBusy={busy}
        isDanger={action === "received" || action === "cancel"}
        onConfirm={() => void confirm()}
      >
        <p>
          {action === "fund"
            ? `Giữ ${formatVnd(detail.viewerFundingAmount ?? 0)} từ ví mô phỏng. Kiểm tra khoản tiền trước khi xác nhận.`
            : action === "received"
              ? "Chỉ xác nhận khi đã nhận đúng sách. Khi cả hai bên xác nhận, máy chủ sẽ hoàn tất trao đổi và xử lý tiền cọc, tiền bù."
              : action === "retry"
                ? "Gửi lại đúng mã và nội dung của thao tác trước để xác nhận kết quả."
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
