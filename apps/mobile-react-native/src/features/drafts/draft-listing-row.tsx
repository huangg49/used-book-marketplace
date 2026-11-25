import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, IconButton, colorRoles, formatVnd, space, stitchTokens } from "../../core/ui";
import { useCatalogBook } from "./catalog-picker";
import type { Draft } from "./contracts";
import { DraftCoverPhoto } from "./draft-cover-photo";
import { editableListing, listingSummary } from "./listing-form";

const modeLabels = { Sale: "Bán", Exchange: "Đổi", Both: "Bán hoặc đổi" } as const;

export function DraftListingRow({ listing, position, onOpen, onDelete }: {
  listing: Draft;
  position: number;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const { bundle, bookId, mode, salePrice, exchangeValue, mediaIds } = listing.currentRevision.content;
  const [focused, setFocused] = useState(false);
  const book = useCatalogBook(bundle ? null : bookId);
  const summary = listingSummary(listing, position);
  const title = bundle?.title || book.data?.title || (
    bookId ? (book.isPending ? "Đang tải tên sách…" : "Chưa tải được tên sách") : "Chưa chọn đầu sách"
  );
  const moderation = listing.state.moderation;
  const action = editableListing(listing)
    ? (moderation === "Draft" ? "Hoàn thiện" : "Sửa bài")
    : "Xem chi tiết";
  const amounts = [
    mode !== "Exchange" && salePrice != null ? `Giá bán ${formatVnd(salePrice)}` : null,
    mode !== "Sale" && exchangeValue != null ? `Giá trị đổi ${formatVnd(exchangeValue)}` : null,
  ].filter(Boolean).join(" · ");
  const format = [mode && modeLabels[mode], bundle && `Bộ ${bundle.items.length} cuốn`].filter(Boolean).join(" · ");

  return (
    <View style={styles.row}>
      <View style={styles.cover}>
        <DraftCoverPhoto listingId={listing.id} mediaId={mediaIds[0]} resizeMode="contain" compact />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${action}: ${title}. ${[summary.status, format, amounts].filter(Boolean).join(". ")}`}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={onOpen}
        style={({ pressed }) => [styles.body, focused && styles.focused, pressed && styles.pressed]}
      >
        <AppText kind="bold" color={stitchTokens.wineDark} numberOfLines={3}>{title}</AppText>
        {format ? <AppText kind="small" color={stitchTokens.roseBrown}>{format}</AppText> : null}
        <View style={[
          styles.badge,
          moderation === "Rejected" && styles.badgeError,
          moderation === "PendingReview" && styles.badgePending,
        ]}>
          <AppText kind="small" color={stitchTokens.wineDark}>{summary.status}</AppText>
        </View>
        {amounts ? <AppText kind="small" color={stitchTokens.deepCocoa}>{amounts}</AppText> : null}
        {moderation === "Rejected" && summary.note ? (
          <AppText kind="small" color={stitchTokens.roseBrown} numberOfLines={2}>{summary.note}</AppText>
        ) : null}
        <View style={styles.action}>
          <AppText kind="bold" color={stitchTokens.wine}>{action}</AppText>
          <Icon name="chevronRight" size={15} color={stitchTokens.wine} />
        </View>
      </Pressable>
      {onDelete ? (
        <IconButton name="trash" label={`Xóa bài đăng: ${title}`} onPress={onDelete} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    padding: space.md,
    backgroundColor: stitchTokens.white,
    borderColor: stitchTokens.borderParchmentSoft,
    borderWidth: 1,
    borderRadius: 12,
  },
  cover: {
    width: 64,
    height: 88,
    borderRadius: 6,
    backgroundColor: stitchTokens.parchment,
    overflow: "hidden",
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
    borderRadius: 6,
  },
  pressed: { opacity: 0.76 },
  focused: { boxShadow: `inset 0 0 0 2px ${colorRoles.focus}` },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  badgePending: { backgroundColor: stitchTokens.goldAlpha20 },
  badgeError: { backgroundColor: stitchTokens.roseParchment },
  action: { flexDirection: "row", alignItems: "center", gap: space.xs },
});
