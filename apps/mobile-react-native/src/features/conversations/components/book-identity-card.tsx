import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { AppText, Icon, colors, radius, space, stitchTokens } from "../../../core/ui";
import { PublicPhoto } from "../../shelf/public-photo";
import type { Listing } from "../../shelf/contracts";
import { formatDateTimeVi, statusLabels } from "../purchase-conversation-service";
import type { PurchaseConversation } from "../contracts";

interface BookIdentityCardProps {
  listing?: Listing | null;
  room: PurchaseConversation;
  isExchange?: boolean;
}

function formatVnd(amount: number | null | undefined): string {
  if (amount == null) return "Thương lượng";
  return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
}

export function BookIdentityCard({
  listing,
  room,
  isExchange = false,
}: BookIdentityCardProps) {
  const router = useRouter();
  const title = listing?.book.title ?? "Đang tải thông tin ấn bản sách…";
  const authors = listing?.book.authors?.join(", ") ?? "";
  const primaryPhoto = listing?.photos?.[0];
  const revisionId = listing?.revisionId;

  const statusText =
    isExchange && room.status === "Active"
      ? "Đang trao đổi sách"
      : statusLabels[room.status] ?? room.status;

  const isOrderCreated = room.status === "OrderCreated";
  const isExpired = room.status === "Expired" || room.status === "Cancelled";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Xem chi tiết ấn bản ${title}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => {
        router.push({
          pathname: "/book",
          params: { id: room.listingId },
        });
      }}
    >
      {/* Book Cover Thumbnail */}
      <View style={styles.coverWrapper}>
        {primaryPhoto && revisionId ? (
          <PublicPhoto
            listingId={room.listingId}
            revisionId={revisionId}
            mediaId={primaryPhoto.id}
            label={title}
            active={true}
            compact
          />
        ) : (
          <View style={styles.coverFallback}>
            <Icon name="book" size={24} color={stitchTokens.wineDark} />
          </View>
        )}
      </View>

      {/* Book Info Column */}
      <View style={styles.infoCol}>
        <View style={styles.headerRow}>
          <View
            style={[
              styles.statusBadge,
              isOrderCreated
                ? styles.statusBadgeOrder
                : isExpired
                  ? styles.statusBadgeExpired
                  : styles.statusBadgeActive,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                isOrderCreated
                  ? styles.statusDotOrder
                  : isExpired
                    ? styles.statusDotExpired
                    : styles.statusDotActive,
              ]}
            />
            <AppText
              style={[
                styles.statusText,
                isOrderCreated
                  ? styles.statusTextOrder
                  : isExpired
                    ? styles.statusTextExpired
                    : styles.statusTextActive,
              ]}
              numberOfLines={1}
            >
              {statusText}
            </AppText>
          </View>

          <View style={styles.arrowIcon}>
            <Icon name="chevronRight" size={14} color={colors.muted} />
          </View>
        </View>

        <AppText numberOfLines={2} style={styles.bookTitle}>
          {title}
        </AppText>

        {Boolean(authors) && (
          <AppText numberOfLines={1} style={styles.bookAuthors}>
            {authors}
          </AppText>
        )}

        <View style={styles.metaRow}>
          <View style={styles.priceTag}>
            <AppText style={styles.priceLabel}>Niêm yết:</AppText>
            <AppText style={styles.priceValue}>
              {formatVnd(listing?.salePrice ?? listing?.exchangeValue)}
            </AppText>
          </View>

          {Boolean(room.expiresAt && !isExpired && !isOrderCreated) && (
            <AppText numberOfLines={1} style={styles.expiryText}>
              Hạn: {formatDateTimeVi(room.expiresAt)}
            </AppText>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
    gap: space.md,
    marginHorizontal: space.md,
    marginTop: space.sm,
    marginBottom: space.xs,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  pressed: {
    opacity: 0.92,
  },
  coverWrapper: {
    width: 62,
    height: 86,
    borderRadius: radius.small,
    overflow: "hidden",
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: colors.rule,
    justifyContent: "center",
    alignItems: "center",
  },
  coverFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  infoCol: {
    flex: 1,
    justifyContent: "center",
    gap: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    gap: 5,
    alignSelf: "flex-start",
  },
  statusBadgeActive: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderWidth: 1,
    borderColor: stitchTokens.mintGreen,
  },
  statusBadgeOrder: {
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1,
    borderColor: stitchTokens.amberBorder,
  },
  statusBadgeExpired: {
    backgroundColor: stitchTokens.canvasMuted,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotActive: {
    backgroundColor: stitchTokens.verifiedGreen,
  },
  statusDotOrder: {
    backgroundColor: stitchTokens.orangeDeep,
  },
  statusDotExpired: {
    backgroundColor: colors.muted,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusTextActive: {
    color: stitchTokens.likeNewGreen,
  },
  statusTextOrder: {
    color: stitchTokens.orangeDeep,
  },
  statusTextExpired: {
    color: colors.muted,
  },
  arrowIcon: {
    opacity: 0.6,
  },
  bookTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
    lineHeight: 18,
  },
  bookAuthors: {
    fontSize: 12,
    color: colors.muted,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  priceTag: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  priceLabel: {
    fontSize: 11,
    color: colors.muted,
  },
  priceValue: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  expiryText: {
    fontSize: 11,
    color: colors.muted,
  },
});
