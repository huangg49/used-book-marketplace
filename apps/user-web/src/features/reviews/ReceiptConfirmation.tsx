import { useState } from "react";
import {
  pendingOrderResponse,
  sendOrderResponse,
} from "@used-books/session-client";
import { session } from "../../lib/session";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import styles from "./ReviewEntry.module.css";

export function ReceiptConfirmation({
  order,
  onChanged,
}: {
  order: { id: string; version: number; canConfirmReceipt: boolean };
  onChanged: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = pendingOrderResponse(session, order.id);
  const ours = pending === "confirm-receipt";
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await sendOrderResponse(
        session,
        order.id,
        "confirm-receipt",
        order.version,
        () => crypto.randomUUID(),
      );
      setOpen(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Chưa xác nhận được kết quả. Thử lại đúng yêu cầu nhận sách.",
      );
    } finally {
      setOpen(false);
      try {
        await onChanged();
      } finally {
        setBusy(false);
      }
    }
  }
  if (!order.canConfirmReceipt && !ours) return null;
  return (
    <section className={styles.entry} aria-label="Xác nhận nhận sách">
      <div>
        <h3>Bạn đã nhận được sách?</h3>
        <p>
          Xác nhận để bắt đầu 72 giờ kiểm tra và viết đánh giá ngay. Tiền tiếp
          tục được giữ theo quy trình.
        </p>
      </div>
      <button
        type="button"
        disabled={busy || (!!pending && !ours)}
        onClick={() => (ours ? void confirm() : setOpen(true))}
      >
        {busy
          ? "Đang xác nhận…"
          : ours
            ? "Thử lại xác nhận nhận sách"
            : "Tôi đã nhận được sách"}
      </button>
      {error && <p role="alert">{error}</p>}
      <ConfirmDialog
        isOpen={open}
        title="Xác nhận đã nhận sách?"
        description="Chỉ xác nhận khi bạn đã nhận sách thực tế. Bạn có 72 giờ kiểm tra; thao tác này không hoàn tất đơn hoặc giải ngân tiền."
        confirmText="Xác nhận đã nhận sách"
        onConfirm={() => void confirm()}
        isBusy={busy}
        onClose={() => !busy && setOpen(false)}
      />
    </section>
  );
}
