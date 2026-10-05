import { View } from "react-native";
import { useSession } from "../../core/session/session-provider";
import { useSaveWishlist, useRemoveWishlist, wishlistOptions } from "./wishlist-model";
import { ActionButton, IconButton, colors } from "../../core/ui";
import { useInfiniteQuery } from "@tanstack/react-query";

export function WishlistButton({
  subjectType,
  subjectId,
  compact = false,
}: {
  subjectType: "CATALOG_BOOK" | "LISTING";
  subjectId: string;
  compact?: boolean;
}) {
  const { client, state } = useSession();
  
  // Find if this item is in the wishlist
  const query = useInfiniteQuery({
    ...wishlistOptions(client),
    enabled: state.status === "authenticated",
  });

  const saveMutation = useSaveWishlist(client);
  const removeMutation = useRemoveWishlist(client);

  const pages = query.data?.pages ?? [];
  const items = pages.flatMap((p: any) => p.items);
  const wishlistItem = items.find((i: any) => i.subjectType === subjectType && i.subjectId === subjectId);
  const isSaved = !!wishlistItem;

  const busy = saveMutation.isPending || removeMutation.isPending;

  const handleToggle = () => {
    if (isSaved) {
      removeMutation.mutate({ subjectType, subjectId });
    } else {
      saveMutation.mutate({ subjectType, subjectId, wantsToExchange: false, receiveNotifications: true });
    }
  };

  if (compact) {
    return (
      <IconButton
        name={isSaved ? "bookmark" : "bookmark"} // In reality, maybe a filled heart for isSaved. For now just bookmark.
        onPress={handleToggle}
        disabled={busy}
        label={isSaved ? "Đã lưu" : "Lưu sách"}
      />
    );
  }

  return (
    <ActionButton
      title={isSaved ? "Đã lưu" : "Lưu vào danh sách"}
      onPress={handleToggle}
      disabled={busy || state.status !== "authenticated"}
    />
  );
}
