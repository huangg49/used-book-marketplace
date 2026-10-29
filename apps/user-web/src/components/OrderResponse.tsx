import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  pendingOrderResponse,
  sendOrderResponse,
} from "@used-books/session-client";
import { session } from "../lib/session";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "../pages/DirectOrders.module.css";

export function OrderResponse({
  order,
  onChanged,
}: {
  order: {
    id: string;
    version: number;
    sellerAcceptanceEnabled: boolean;
    canReject: boolean;
    sellerConfirmationDeadline: string | null;
  };
  onChanged: () => Promise<unknown>;
}) {
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirming, setConfirming] = useState<"accept" | "reject" | null>(
    null,
  );
  const pending = pendingOrderResponse(session, order.id);
  async function act(action: "accept" | "reject" | "cancel") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await sendOrderResponse(session, order.id, action, order.version, () =>
        crypto.randomUUID(),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Chưa xác minh được kết quả. Thử lại đúng quyết định này.",
      );
    } finally {
      setBusy(false);
      setConfirming(null);
      void onChanged();
      void cache.invalidateQueries({ queryKey: ["work-inbox"] });
    }
  }
  if (!order.sellerAcceptanceEnabled && !order.canReject && !pending)
    return null;
  return (
    <section className={styles.section} aria-label="Trả lời đơn bán">
      <h3>Xác nhận đơn bán</h3>
      <p>
        Người mua đã thanh toán. Xác nhận nghĩa là bạn nhận chuẩn bị sách; từ
        chối chuyển đơn sang xử lý hoàn tiền theo quy trình.
      </p>
      {order.sellerConfirmationDeadline && (
        <p>
          Hạn trả lời:{" "}
          {new Date(order.sellerConfirmationDeadline).toLocaleString("vi-VN")}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {pending ? (
        <button
          className={styles.primary}
          type="button"
          disabled={busy}
          onClick={() => void act(pending)}
        >
          Thử lại quyết định{" "}
          {pending === "accept"
            ? "xác nhận"
            : pending === "reject"
              ? "từ chối"
              : "hủy"}
        </button>
      ) : (
        <>
          {order.sellerAcceptanceEnabled && (
            <button
              className={styles.primary}
              type="button"
              disabled={busy}
              onClick={() => setConfirming("accept")}
            >
              Xác nhận bán
            </button>
          )}
          {order.canReject && (
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() => setConfirming("reject")}
            >
              Từ chối đơn
            </button>
          )}
        </>
      )}
      <ConfirmDialog
        isOpen={!!confirming}
        onClose={() => !busy && setConfirming(null)}
        title={
          confirming === "accept"
            ? "Xác nhận nhận chuẩn bị sách?"
            : "Từ chối đơn đã thanh toán?"
        }
        description="Trạng thái và phiên bản sẽ được kiểm tra lại trước khi ghi quyết định."
        confirmText="Ghi quyết định"
        isBusy={busy}
        isDanger={confirming === "reject"}
        onConfirm={() => confirming && void act(confirming)}
      />
    </section>
  );
}
