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
  async function act(action: "accept" | "reject" | "cancel" | "pay" | "confirm-receipt") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await sendOrderResponse(session, order.id, action, order.version, () =>
        crypto.randomUUID(),
      );
      setConfirming(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Chưa xác minh được kết quả. Thử lại đúng quyết định này.",
      );
    } finally {
      setBusy(false);
      void onChanged();
      void cache.invalidateQueries({ queryKey: ["work-inbox"] });
    }
  }
  if (pending === "confirm-receipt") return null;
  if (!order.sellerAcceptanceEnabled && !order.canReject && !pending)
    return null;
  return (
    <section className={styles.section} aria-label="Trả lời đơn bán">
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
              : pending === "pay" ? "thanh toán" : "hủy"}
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
        onClose={() => {
          if (busy) return;
          setConfirming(null);
          setError("");
        }}
        title={
          confirming === "accept"
            ? "Xác nhận nhận chuẩn bị sách?"
            : "Từ chối đơn đã thanh toán?"
        }
        description={
          confirming === "accept"
            ? "Khi xác nhận, bạn cam kết đóng gói và gửi sách đúng hạn (trong 48 giờ). Sau khi nhận đơn, bạn không thể tự ý hủy."
            : "Đơn hàng sẽ đóng vĩnh viễn và toàn bộ tiền người mua đã thanh toán sẽ được hoàn về Ví của họ. Thao tác này không thể hoàn tác."
        }
        confirmText={
          confirming === "accept" ? "Xác nhận bán" : "Từ chối và hoàn tiền"
        }
        isBusy={busy}
        isDanger={confirming === "reject"}
        error={error || null}
        onConfirm={() => confirming && void act(confirming)}
      />
    </section>
  );
}
