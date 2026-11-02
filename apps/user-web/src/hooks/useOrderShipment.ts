import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { z } from "zod";
import { session } from "../lib/session";
import { useSession } from "./useSession";

const shipmentSchema = z.object({
  trackingCode: z.string(),
  pickupConfirmed: z.boolean(),
  state: z.string(),
});

/** Share the confirmed shipment between the progress indicator and shipping form. */
export function useOrderShipment(orderId: string, enabled = true) {
  const auth = useSession();
  return useQuery({
    queryKey: ["order-shipment", auth.status === "authenticated" ? auth.user.id : null, orderId],
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
    refetchInterval: 5000,
  });
}
