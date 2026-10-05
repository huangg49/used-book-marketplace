import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionClient } from "../../core/api/session-client";
import { wishlistPage, wishlistItem } from "./contracts";
import { z } from "zod";

export function wishlistOptions(client: SessionClient) {
  return {
    queryKey: ["wishlist"] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }: any) =>
      client.request(
        "/me/wishlist?limit=10" +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam as string) : ""),
        wishlistPage,
      ),
    getNextPageParam: (page: ReturnType<typeof wishlistPage.parse>) =>
      page.nextCursor ?? undefined,
  };
}

export function useSaveWishlist(client: SessionClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      subjectType,
      subjectId,
      wantsToExchange,
      receiveNotifications,
    }: {
      subjectType: "CATALOG_BOOK" | "LISTING";
      subjectId: string;
      wantsToExchange: boolean;
      receiveNotifications: boolean;
    }) => {
      const endpoint = subjectType === "CATALOG_BOOK"
        ? `/me/wishlist/catalog-books/${subjectId}`
        : `/me/wishlist/listings/${subjectId}`;
      return client.request(endpoint, wishlistItem, {
        method: "PUT",
        body: JSON.stringify({ wantsToExchange, receiveNotifications }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    },
  });
}

export function useRemoveWishlist(client: SessionClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      subjectType,
      subjectId,
    }: {
      subjectType: "CATALOG_BOOK" | "LISTING";
      subjectId: string;
    }) => {
      const endpoint = subjectType === "CATALOG_BOOK"
        ? `/me/wishlist/catalog-books/${subjectId}`
        : `/me/wishlist/listings/${subjectId}`;
      return client.request(endpoint, z.any(), {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    },
  });
}
