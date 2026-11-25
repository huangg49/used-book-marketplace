import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { z } from "zod";
import { session } from "../lib/session";
import { useSession } from "./useSession";
import { useTransactionLive } from "./useTransactionLive";

const shipmentSchema = z.object({
  trackingCode: z.string(),
  pickupConfirmed: z.boolean(),
  state: z.string(),
});

/** Share the confirmed shipment between the progress indicator and shipping form. */
export function useOrderShipment(orderId: string, enabled = true) {
  const auth = useSession();
  const cache = useQueryClient();
  const key = ["order-shipment", auth.status === "authenticated" ? auth.user.id : null, orderId] as const;
  // Shipment and carrier commits push on the order watch.
  const live = useTransactionLive("order", enabled ? orderId : undefined, () => {
    void cache.invalidateQueries({ queryKey: key });
  });
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      try {
        return await session.request(`/me/orders/${orderId}/shipment`, shipmentSchema);
      } catch (cause) {
        // An unregistered shipment is a stable empty result; keep forms mounted.
        if (cause instanceof ApiError && cause.status === 404) return null;
        throw cause;
      }
    },
    enabled: enabled && auth.status === "authenticated",
    retry: false,
    refetchInterval: live ? 30_000 : 5_000,
  });
}
