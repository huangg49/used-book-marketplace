import { useEffect } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  useSaveWishlist,
  useRemoveWishlist,
  wishlistMembershipOptions,
} from "./wishlist-model";
import { Button, IconButton, Notice, presentError, space } from "../../core/ui";

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
  const active = useForeground();
  const query = useQuery({
    ...wishlistMembershipOptions(client, subjectType, subjectId),
    enabled: state.status === "authenticated" && active,
  });

  const saveMutation = useSaveWishlist(client);
  const removeMutation = useRemoveWishlist(client);

  const resetSave = saveMutation.reset;
  const resetRemove = removeMutation.reset;
  useEffect(() => {
    resetSave();
    resetRemove();
  }, [subjectType, subjectId, resetSave, resetRemove]);

  const isSaved = !!query.data;
  const busy =
    saveMutation.isPending || removeMutation.isPending || query.isFetching;
  const disabled = busy || !query.isSuccess || state.status !== "authenticated";
  const error = query.error ?? saveMutation.error ?? removeMutation.error;
  const title = isSaved ? "Bỏ lưu sách" : "Lưu sách";

  const handleToggle = () => {
    if (disabled) return;
    resetSave();
    resetRemove();
    if (isSaved) {
      removeMutation.mutate({ subjectType, subjectId });
    } else {
      saveMutation.mutate({
        subjectType,
        subjectId,
        wantsToExchange: false,
        receiveNotifications: true,
      });
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      {isSaved && <Notice tone="success">Đã lưu sách.</Notice>}
      {error && <Notice tone="error">{presentError(error).message}</Notice>}
      {query.isError ? (
        <Button
          secondary
          title="Kiểm tra lại sách đã lưu"
          busy={query.isFetching}
          onPress={() => {
            void query.refetch();
          }}
        />
      ) : compact ? (
        <IconButton
          name="bookmark"
          label={title}
          selected={isSaved}
          disabled={disabled}
          onPress={handleToggle}
        />
      ) : (
        <Button
          title={title}
          secondary={isSaved}
          busy={busy}
          disabled={disabled}
          onPress={handleToggle}
        />
      )}
    </View>
  );
}
