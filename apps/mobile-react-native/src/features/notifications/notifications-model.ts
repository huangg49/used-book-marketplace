import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import type { SessionClient } from "../../core/api/session-client";
import { useForeground } from "../../core/hooks/use-foreground";
import { useTransactionLive } from "../../core/hooks/use-transaction-live";
import { useSession } from "../../core/session/session-provider";
import {
  memberNotificationPage,
  markNotificationsReadResult,
  type MemberNotificationPage,
} from "./contracts";

export const NOTIFICATIONS_QUERY_KEY = ["member-notifications"] as const;

export function notificationsOptions(
  client: SessionClient,
  cursor?: string,
  limit = 20,
) {
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  if (cursor) query.set("cursor", cursor);

  return {
    queryKey: [...NOTIFICATIONS_QUERY_KEY, cursor, limit] as const,
    queryFn: () =>
      client.request(
        `/me/notifications?${query.toString()}`,
        memberNotificationPage,
      ),
  };
}

export function useNotifications(
  client: SessionClient | null,
  isAuthenticated: boolean,
): UseQueryResult<MemberNotificationPage, Error> {
  const queryClient = useQueryClient();
  const { state } = useSession();
  const foreground = useForeground();
  const userId = state.status === "authenticated" ? state.user.id : "";
  // Hidden tabs neither watch nor poll; the visible screen shares one socket
  // watch, and the poll only backs up a dropped socket.
  const live = useTransactionLive("inbox", userId, foreground && isAuthenticated, () => {
    void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
  });
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => {
      if (!client) throw new Error("Client not available");
      return client.request("/me/notifications?limit=20", memberNotificationPage);
    },
    enabled: Boolean(client && isAuthenticated),
    staleTime: 4_000,
    refetchInterval: !isAuthenticated || !foreground ? false : live ? 60_000 : 6_000,
  });
}

export function useMarkNotificationsRead(client: SessionClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { ids?: string[]; all?: boolean }) => {
      if (!client) throw new Error("Client not available");
      return client.request(
        "/me/notifications/read",
        markNotificationsReadResult,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": Crypto.randomUUID(),
          },
          body: JSON.stringify(
            payload.all ? { all: true } : { ids: payload.ids ?? [] },
          ),
        },
      );
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData<MemberNotificationPage | undefined>(
        NOTIFICATIONS_QUERY_KEY,
        (old) => {
          if (!old) return old;
          const nowIso = new Date().toISOString();
          const targetIds = new Set(variables.ids ?? []);
          return {
            ...old,
            unreadCount: result.unreadCount,
            items: old.items.map((it) =>
              variables.all || targetIds.has(it.id)
                ? { ...it, readAt: it.readAt ?? nowIso }
                : it,
            ),
          };
        },
      );
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}
