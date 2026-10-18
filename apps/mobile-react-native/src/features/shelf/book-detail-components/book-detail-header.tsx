import React from "react";
import { Share, View, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../../core/session/session-provider";
import { Icon, AppText, stitchTokens, space } from "../../../core/ui";
import {
  useSaveWishlist,
  useRemoveWishlist,
  wishlistMembershipOptions,
} from "../../wishlist/wishlist-model";
import { useQuery } from "@tanstack/react-query";

interface BookDetailHeaderProps {
  listingId: string;
  bookTitle: string;
}

export function BookDetailHeader({ listingId, bookTitle }: BookDetailHeaderProps) {
  const { client, state } = useSession();
  const isAuthenticated = state.status === "authenticated";

  const wishlistQuery = useQuery({
    ...wishlistMembershipOptions(client, "LISTING", listingId),
    enabled: isAuthenticated && Boolean(listingId),
  });

  const saveMutation = useSaveWishlist(client);
  const removeMutation = useRemoveWishlist(client);

  const isSaved = Boolean(wishlistQuery.data);
  const isBusy =
    wishlistQuery.isFetching ||
    saveMutation.isPending ||
    removeMutation.isPending;

  const handleToggleWishlist = () => {
    if (!isAuthenticated) {
      router.push({
        pathname: "/account",
        params: { returnBook: listingId },
      });
      return;
    }
    if (isBusy) return;

    if (isSaved) {
      removeMutation.mutate({ subjectType: "LISTING", subjectId: listingId });
    } else {
      saveMutation.mutate({
        subjectType: "LISTING",
        subjectId: listingId,
        wantsToExchange: false,
        receiveNotifications: true,
      });
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: bookTitle,
        message: `Khám phá cuốn sách "${bookTitle}" trên sàn sách cũ Lật lại!`,
      });
    } catch {
      // Ignore user cancellation
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Về kệ sách"
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        onPress={handleBack}
      >
        <Icon name="back" size={20} color={stitchTokens.wineDark} />
        <AppText style={styles.backLabel}>Về kệ sách</AppText>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSaved ? "Bỏ lưu sách" : "Lưu vào danh sách yêu thích"}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          onPress={handleToggleWishlist}
          disabled={isBusy}
        >
          <Icon
            name="bookmark"
            size={20}
            color={isSaved ? stitchTokens.wineDark : stitchTokens.roseBrown}
            filled={isSaved}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chia sẻ cuốn sách này"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          onPress={handleShare}
        >
          <Icon name="explore" size={21} color={stitchTokens.roseBrown} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 54,
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.roseWarmBlur,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardBorder,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  backLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
});
