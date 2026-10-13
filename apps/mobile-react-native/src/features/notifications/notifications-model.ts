import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import type { SessionClient } from "../../core/api/session-client";
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
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => {
      if (!client) throw new Error("Client not available");
      return client.request("/me/notifications?limit=20", memberNotificationPage);
    },
    enabled: Boolean(client && isAuthenticated),
    staleTime: 15_000,
    refetchInterval: isAuthenticated ? 30_000 : false,
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
    onSuccess: (result) => {
      queryClient.setQueryData<MemberNotificationPage | undefined>(
        NOTIFICATIONS_QUERY_KEY,
        (old) => {
          if (!old) return old;
          const nowIso = new Date().toISOString();
          return {
            ...old,
            unreadCount: result.unreadCount,
            items: old.items.map((it) => ({
              ...it,
              readAt: it.readAt ?? nowIso,
            })),
          };
        },
      );
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}
