import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { apiBaseUrl } from "../../core/api/api-base-url";
import type { SessionClient } from "../../core/api/session-client";
import { useSession } from "../../core/session/session-provider";
import { NOTIFICATIONS_QUERY_KEY } from "../notifications/notifications-model";
import { LIVE_SOCKET_OPTIONS, newerPointOrder } from "./auction-live-model";
import { pointOrderKey } from "./auctions-model";
import { pointOrder, type PointOrder } from "./contracts";

// Authenticated, read-only live channel for ViaPoint auction orders.
// Pushes committed state/delivery updates (handover, dispatch, carrier events,
// receipt decisions, settlement) immediately without polling. REST remains the
// source of truth on initial load and reconnect.

function socketOrigin() {
  try {
    return apiBaseUrl(Platform.OS, {
      shared: process.env.EXPO_PUBLIC_API_BASE_URL,
      android: process.env.EXPO_PUBLIC_API_BASE_URL_ANDROID,
      web: process.env.EXPO_PUBLIC_API_BASE_URL_WEB,
      ios: process.env.EXPO_PUBLIC_API_BASE_URL_IOS,
    }).replace(/\/api\/v1\/?$/, "");
  } catch {
    return null;
  }
}

/** REST read for ['point-order', id] that never steps back behind a newer push. */
export async function readPointOrderNewest(
  client: SessionClient,
  queryClient: QueryClient,
  id: string,
) {
  const next = await client.request(`/me/point-orders/${id}`, pointOrder);
  return newerPointOrder(queryClient.getQueryData<PointOrder>(pointOrderKey(id)), next);
}

/** Keeps ['point-order', orderId] live over authenticated WebSocket while enabled. */
export function usePointOrderLive(orderId: string, enabled: boolean): boolean {
  const { client, state } = useSession();
  const queryClient = useQueryClient();
  const [watching, setWatching] = useState(false);
  const userId = state.status === "authenticated" ? state.user.id : null;
  const active = enabled && Boolean(orderId) && Boolean(userId);

  useEffect(() => {
    if (!active) return;
    const origin = socketOrigin();
    if (!origin) return;

    let disposed = false;
    let lastToken = client.getAccessToken();

    const applySnapshot = (raw: unknown) => {
      const parsed = pointOrder.safeParse(raw);
      if (!parsed.success || parsed.data.id !== orderId) return;
      let prevState: PointOrder["state"] | undefined;
      let prevVersion = -1;
      queryClient.setQueryData<PointOrder>(pointOrderKey(orderId), (prev) => {
        prevState = prev?.state;
        prevVersion = prev?.version ?? -1;
        return newerPointOrder(prev, parsed.data);
      });
      if (parsed.data.version > prevVersion && prevState && prevState !== parsed.data.state) {
        void queryClient.invalidateQueries({ queryKey: ["wallet"] });
        void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: ["my-auctions"] });
      }
    };

    const socket: Socket = io(`${origin}/point-orders`, {
      ...LIVE_SOCKET_OPTIONS,
      auth: (cb) => cb({ token: client.getAccessToken() ?? "" }),
    });

    const subscribe = () => {
      if (disposed || !client.getAccessToken()) return;
      socket.emit("point-order:watch", orderId, (ack?: { ok?: boolean; order?: unknown }) => {
        if (disposed) return;
        if (ack?.ok) {
          applySnapshot(ack.order);
          setWatching(true);
        } else {
          setWatching(false);
        }
      });
    };

    const onUpdate = (payload: unknown) => {
      if (disposed) return;
      applySnapshot(payload);
    };

    const onDisconnect = () => {
      if (!disposed) setWatching(false);
    };

    const onConnectError = () => {
      if (!disposed) setWatching(false);
    };

    socket.on("connect", subscribe);
    socket.on("point-order:update", onUpdate);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    // If SessionClient rotates the access token (e.g., after a 15m refresh) or
    // signs out, immediately reconnect with the fresh token or disconnect.
    const unsubscribeSession = client.subscribe(() => {
      if (disposed) return;
      const nextToken = client.getAccessToken();
      if (!nextToken) {
        setWatching(false);
        socket.disconnect();
        return;
      }
      if (nextToken !== lastToken) {
        lastToken = nextToken;
        setWatching(false);
        socket.disconnect().connect();
      }
    });

    return () => {
      disposed = true;
      unsubscribeSession();
      if (socket.connected) socket.emit("point-order:unwatch", orderId);
      socket.off("connect", subscribe);
      socket.off("point-order:update", onUpdate);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.disconnect();
    };
  }, [active, client, orderId, queryClient, userId]);

  return active && watching;
}
