import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { wishlistPage } from "./contracts";
import { useSaveWishlist, useRemoveWishlist } from "./wishlist-model";

export function useListingWishlist() {
  const { client, state } = useSession();
  const active = useForeground();
  const isAuthenticated = state.status === "authenticated";
  const qc = useQueryClient();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["wishlist", "listings-set"],
    queryFn: async (): Promise<Set<string>> => {
      const page = await client.request(
        "/me/wishlist?limit=50&subjectType=LISTING",
        wishlistPage,
      );
      return new Set(
        page.items
          .filter((item) => item.subjectType === "LISTING")
          .map((item) => item.subjectId),
      );
    },
    enabled: isAuthenticated && active,
    staleTime: 30_000,
  });

  const saveMutation = useSaveWishlist(client);
  const removeMutation = useRemoveWishlist(client);

  const isSaved = (listingId: string): boolean => {
    return query.data ? query.data.has(listingId) : false;
  };

  const toggle = async (listingId: string) => {
    if (!isAuthenticated) {
      router.navigate("/account");
      return;
    }
    const currentSaved = isSaved(listingId);

    // Optimistically update the set in TanStack Query
    qc.setQueryData(
      ["wishlist", "listings-set"],
      (prev: Set<string> | undefined) => {
        const next = new Set(prev ?? []);
        if (currentSaved) {
          next.delete(listingId);
        } else {
          next.add(listingId);
        }
        return next;
      },
    );

    // Show small popup immediately
    setToastMessage(currentSaved ? "Đã bỏ lưu bài đăng" : "Bài đã được lưu");

    try {
      if (currentSaved) {
        await removeMutation.mutateAsync({
          subjectType: "LISTING",
          subjectId: listingId,
        });
      } else {
        await saveMutation.mutateAsync({
          subjectType: "LISTING",
          subjectId: listingId,
          wantsToExchange: false,
          receiveNotifications: true,
        });
      }
    } catch (err) {
      void qc.invalidateQueries({ queryKey: ["wishlist"] });
      throw err;
    }
  };

  return {
    isSaved,
    toggle,
    isAuthenticated,
    isPending: saveMutation.isPending || removeMutation.isPending,
    toastMessage,
    clearToast: () => setToastMessage(null),
  };
}

