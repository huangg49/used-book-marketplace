import { useState } from "react";
import {
  acknowledgedExchangeAction,
  exchangeCommandInFlight,
  exchangeReadProblem,
} from "@used-books/session-client";
import { session } from "../../services/api";
import { useExchangeRecovery } from "../../hooks/useExchangeRecovery";
import {
  exchangeAcknowledged,
  exchangeError,
  exchangeIdentity,
  pendingExchange,
  retryExchange,
} from "../../services/exchange";
import styles from "./ActionCard/ActionCard.module.css";

const labels: Record<string, string> = {
  funding: "nộp tiền",
  accept: "phản hồi đề nghị",
  reject: "từ chối",
  counter: "thay sách",
  ship: "báo gửi sách",
  receive: "xác nhận nhận sách",
  complete: "xác nhận kiểm tra",
  cancel: "hủy",
  dispute: "báo sự cố",
  "demo-advance-shipping": "tua hạn gửi sách demo",
};
export function ExchangeRecoveryPanel({
  id,
  onRead,
}: {
  id: string;
  onRead: () => Promise<unknown>;
}) {
  const identity = useExchangeRecovery();
  const pending = pendingExchange(id),
    ack = exchangeAcknowledged(id);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!pending && !ack) return null;
  const action = pending?.path.split("/").pop() ?? "";
  const funded = acknowledgedExchangeAction(session, id) === "funding";
  const problem = exchangeReadProblem(session, id);
  const flying = exchangeCommandInFlight(session, id);
  const retry = async () => {
    if (busy || flying) return;
    setBusy(true);
    setError("");
    try {
      if (pending) await retryExchange(id);
      if (exchangeIdentity() === identity) await onRead();
    } catch (failure) {
      if (exchangeIdentity() === identity) setError(exchangeError(failure));
    } finally {
      if (exchangeIdentity() === identity) setBusy(false);
    }
  };
  return (
    <section
      aria-label="Khôi phục thao tác trao đổi"
      className={styles.calloutBox}
    >
      <p role="status">
        {pending
          ? `Chưa xác nhận được kết quả ${labels[action] ?? "thao tác trước"}. Hãy thử lại đúng thao tác này trước khi thực hiện việc khác.`
          : "Máy chủ đã xác nhận thao tác. Đang đối soát trạng thái hiện tại; bạn chỉ cần tải lại, không gửi lệnh lần nữa."}
      </p>
      {ack && funded && (
        <p>Máy chủ đã ghi nhận khoản nộp của bạn. Không cần nộp lại.</p>
      )}
      {ack && problem && (
        <p role="alert">
          {problem === "unavailable"
            ? "Chưa tải được trạng thái hiện tại. Kết quả đã xác nhận vẫn được giữ lại."
            : "Dữ liệu đọc lại chưa theo kịp kết quả đã xác nhận. Hãy tải lại sau một lát."}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className={styles.btnPrimary}
        disabled={busy || flying}
        onClick={() => void retry()}
      >
        {busy || flying
          ? "Đang xác minh…"
          : pending
            ? "Thử lại thao tác trước"
            : "Tải lại trạng thái"}
      </button>
    </section>
  );
}
