import React from "react";
import { Share, View, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  isScrolled?: boolean;
}

export function BookDetailHeader({
  listingId,
  bookTitle,
  isScrolled = false,
}: BookDetailHeaderProps) {
  const insets = useSafeAreaInsets();
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
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          height: 52 + insets.top,
          backgroundColor: isScrolled ? stitchTokens.wineDark : "transparent",
          borderBottomWidth: isScrolled ? 1 : 0,
          borderBottomColor: stitchTokens.peachBorderAlpha40,
        },
      ]}
    >
      {/* Left: Back to Shelf */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Về kệ sách"
        style={({ pressed }) => [
          styles.backButton,
          !isScrolled && styles.backButtonFloating,
          pressed && styles.pressed,
        ]}
        onPress={handleBack}
      >
        <Icon
          name="back"
          size={18}
          color={isScrolled ? stitchTokens.white : stitchTokens.wineDark}
        />
        <AppText
          style={[
            styles.backLabel,
            { color: isScrolled ? stitchTokens.white : stitchTokens.wineDark },
          ]}
        >
          Về kệ sách
        </AppText>
      </Pressable>

      {/* Center: Book Title appears when scrolled down */}
      {isScrolled ? (
        <View style={styles.titleCenter}>
          <AppText style={styles.navBookTitle} numberOfLines={1}>
            {bookTitle}
          </AppText>
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {/* Right: Actions (Bookmark & Share) */}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSaved ? "Bỏ lưu sách" : "Lưu vào danh sách yêu thích"}
          style={({ pressed }) => [
            styles.iconButton,
            !isScrolled && styles.iconButtonFloating,
            isScrolled && styles.iconButtonScrolled,
            pressed && styles.pressed,
          ]}
          onPress={handleToggleWishlist}
          disabled={isBusy}
        >
          <Icon
            name="bookmark"
            size={18}
            color={
              isScrolled
                ? isSaved
                  ? stitchTokens.amberBg
                  : stitchTokens.white
                : isSaved
                  ? stitchTokens.wineDark
                  : stitchTokens.wineMid
            }
            filled={isSaved}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chia sẻ cuốn sách này"
          style={({ pressed }) => [
            styles.iconButton,
            !isScrolled && styles.iconButtonFloating,
            isScrolled && styles.iconButtonScrolled,
            pressed && styles.pressed,
          ]}
          onPress={handleShare}
        >
          <Icon
            name="explore"
            size={19}
            color={isScrolled ? stitchTokens.white : stitchTokens.wineMid}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  backButtonFloating: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  backLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  titleCenter: {
    flex: 1,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  navBookTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.white,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonFloating: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  iconButtonScrolled: {
    backgroundColor: stitchTokens.whiteAlpha14,
  },
  pressed: {
    opacity: 0.75,
  },
});
