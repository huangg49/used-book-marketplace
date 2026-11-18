import { useRef, useState } from "react";
import { commandOutcomeUnknown } from "./useAuctionClock";
import { advanceDirectDelivery, type DirectDeliveryAction, type DirectDeliveryCommand, type DirectOrder } from "../services/orders";

export function useDirectDeliveryAction(order: DirectOrder, onChanged: () => Promise<unknown>) {
  const attempt = useRef<{ body: DirectDeliveryCommand; key: string } | null>(null);
  const sending = useRef(false);
  const [pending, setPending] = useState<DirectDeliveryAction>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function run(action: DirectDeliveryAction, description?: string) {
    if (sending.current || (attempt.current && attempt.current.body.action !== action)) return false;
    const request = attempt.current ?? {
      key: crypto.randomUUID(),
      body: { expectedVersion: order.version, action, ...(description ? { description } : {}) },
    };
    attempt.current = request;
    sending.current = true;
    setPending(action);
    setBusy(true);
    setError(undefined);
    try {
      await advanceDirectDelivery(order.id, request.body, request.key);
      attempt.current = null;
      setPending(undefined);
      await onChanged();
      return true;
    } catch (cause) {
      if (commandOutcomeUnknown(cause)) {
        setError("Chưa xác nhận được kết quả. Thử lại để gửi đúng yêu cầu trước.");
      } else {
        attempt.current = null;
        setPending(undefined);
        setError(cause instanceof Error ? cause.message : "Chưa ghi nhận được thao tác.");
        await onChanged();
      }
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return { run, busy, pending, error };
}
