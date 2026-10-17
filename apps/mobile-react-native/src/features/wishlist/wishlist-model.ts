import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionClient } from "../../core/api/session-client";
import { wishlistPage, wishlistItem, type WishlistItem } from "./contracts";
import { z } from "zod";

export function wishlistOptions(client: SessionClient) {
  return {
    queryKey: ["wishlist"] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }: any) =>
      client.request(
        "/me/wishlist?limit=10" +
          (pageParam
            ? "&cursor=" + encodeURIComponent(pageParam as string)
            : ""),
        wishlistPage,
      ),
    getNextPageParam: (page: ReturnType<typeof wishlistPage.parse>) =>
      page.nextCursor ?? undefined,
  };
}

type SubjectType = WishlistItem["subjectType"];
export const membershipKey = (subjectType: SubjectType, subjectId: string) =>
  ["wishlist", "membership", subjectType, subjectId] as const;

// A missing item on page one does not mean it has not been saved.
export function wishlistMembershipOptions(
  client: Pick<SessionClient, "request">,
  subjectType: SubjectType,
  subjectId: string,
) {
  return {
    queryKey: membershipKey(subjectType, subjectId),
    queryFn: async (): Promise<WishlistItem | null> => {
      let cursor: string | null = null;
      const visited = new Set<string>();
      do {
        const page: ReturnType<typeof wishlistPage.parse> =
          await client.request(
            `/me/wishlist?limit=50&subjectType=${subjectType}` +
              (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""),
            wishlistPage,
          );
        const found = page.items.find(
          (item) =>
            item.subjectType === subjectType && item.subjectId === subjectId,
        );
        if (found) return found;
        cursor = page.nextCursor;
        if (cursor) {
          if (visited.has(cursor))
            throw new Error("Wishlist cursor did not advance");
          visited.add(cursor);
        }
      } while (cursor);
      return null;
    },
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
      const endpoint =
        subjectType === "CATALOG_BOOK"
          ? `/me/wishlist/catalog-books/${subjectId}`
          : `/me/wishlist/listings/${subjectId}`;
      return client.request(endpoint, wishlistItem, {
        method: "PUT",
        body: JSON.stringify({ wantsToExchange, receiveNotifications }),
      });
    },
    onSuccess: (saved, subject) => {
      qc.setQueryData(
        membershipKey(subject.subjectType, subject.subjectId),
        saved,
      );
      void qc.invalidateQueries({ queryKey: ["wishlist"] });
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
      const endpoint =
        subjectType === "CATALOG_BOOK"
          ? `/me/wishlist/catalog-books/${subjectId}`
          : `/me/wishlist/listings/${subjectId}`;
      return client.request(endpoint, z.any(), {
        method: "DELETE",
      });
    },
    onSuccess: (_removed, subject) => {
      qc.setQueryData(
        membershipKey(subject.subjectType, subject.subjectId),
        null,
      );
      void qc.invalidateQueries({ queryKey: ["wishlist"] });
    },
  });
}

