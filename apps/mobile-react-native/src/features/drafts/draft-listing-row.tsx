import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  AppText,
  Icon,
  IconButton,
  colorRoles,
  formatVnd,
  radius,
  stitchTokens,
} from "../../core/ui";
import { conditions } from "../shelf/contracts";
import { useCatalogBook } from "./catalog-picker";
import type { Draft } from "./contracts";
import { DraftCoverPhoto } from "./draft-cover-photo";
import { editableListing, listingSummary } from "./listing-form";

const modeLabels = { Sale: "Bán", Exchange: "Đổi", Both: "Bán & Đổi" } as const;

export function DraftListingRow({ listing, position, onOpen, onDelete }: {
  listing: Draft;
  position: number;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const { bundle, bookId, mode, condition, salePrice, exchangeValue, mediaIds } =
    listing.currentRevision.content;
  const [focused, setFocused] = useState(false);
  const book = useCatalogBook(bundle ? null : bookId);
  const summary = listingSummary(listing, position);
  const title =
    bundle?.title ||
    book.data?.title ||
    (bookId ? (book.isPending ? "Đang tải tên sách…" : "Chưa tải được tên sách") : "Chưa chọn đầu sách");
  const authorsText = !bundle ? book.data?.authors?.filter(Boolean).join(", ") : "";
  const conditionText = condition ? (conditions[condition] ?? condition) : "";
  const subtitleParts = [authorsText, conditionText].filter(Boolean).join(" · ");

  const moderation = listing.state.moderation;
  const isLiveAvailable =
    moderation === "Approved" &&
    listing.state.visibility === "Visible" &&
    listing.state.trade === "Available";
  const isPending = moderation === "PendingReview";
  const isRejected = moderation === "Rejected";

  const action = editableListing(listing)
    ? moderation === "Draft"
      ? "Hoàn thiện bản nháp"
      : "Chỉnh sửa bài đăng"
    : "Xem chi tiết";
  const auction = listing.channel === "Auction";
  const priceLabel = auction ? "Giá khai báo" : "Giá bán";

  const priceEntries: { label: string; value: string }[] = [];
  if (mode !== "Exchange" && salePrice != null) {
    priceEntries.push({ label: priceLabel, value: formatVnd(salePrice) });
  }
  if (!auction && mode !== "Sale" && exchangeValue != null) {
    priceEntries.push({ label: "Giá trị đổi", value: formatVnd(exchangeValue) });
  }

  const modeTag = auction
    ? "Đấu giá"
    : [mode && modeLabels[mode], bundle && `Bộ ${bundle.items.length} cuốn`]
        .filter(Boolean)
        .join(" · ");

  const amountsLabel = priceEntries.map((p) => `${p.label} ${p.value}`).join(" · ");

  return (
    <View style={[styles.card, focused && styles.focused]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${action}: ${title}. ${[summary.status, modeTag, amountsLabel].filter(Boolean).join(". ")}`}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={onOpen}
        style={({ pressed }) => [styles.topPressable, pressed && styles.pressed]}
      >
        <View style={styles.cover}>
          <DraftCoverPhoto
            listingId={listing.id}
            mediaId={mediaIds[0]}
            label={`Ảnh bìa ${title}`}
            resizeMode="cover"
            compact
          />
        </View>

        <View style={styles.body}>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.statusBadge,
                isLiveAvailable && styles.badgeSuccess,
                isPending && styles.badgePending,
                isRejected && styles.badgeError,
              ]}
            >
              {isLiveAvailable || isPending || isRejected ? (
                <Icon
                  name={isLiveAvailable ? "check" : isRejected ? "info" : "clock"}
                  size={11}
                  color={
                    isLiveAvailable
                      ? stitchTokens.likeNewGreen
                      : isRejected
                        ? stitchTokens.flashRed
                        : stitchTokens.wineDark
                  }
                />
              ) : null}
              <AppText
                style={[
                  styles.statusText,
                  isLiveAvailable && styles.statusTextSuccess,
                  isRejected && styles.statusTextError,
                ]}
                numberOfLines={1}
              >
                {summary.status}
              </AppText>
            </View>

            {modeTag ? (
              <View style={styles.modePill}>
                <AppText style={styles.modePillText} numberOfLines={1}>
                  {modeTag}
                </AppText>
              </View>
            ) : null}
          </View>

          <AppText kind="bold" style={styles.title} numberOfLines={2}>
            {title}
          </AppText>

          {subtitleParts ? (
            <AppText kind="small" color={stitchTokens.brownMuted} style={styles.subtitle} numberOfLines={1}>
              {subtitleParts}
            </AppText>
          ) : null}

          {priceEntries.length > 0 ? (
            <View style={styles.priceRow}>
              {priceEntries.map((entry, idx) => (
                <AppText key={entry.label} kind="small" color={stitchTokens.brownMuted} style={styles.priceItem}>
                  {idx > 0 ? " · " : ""}
                  {entry.label}{" "}
                  <AppText kind="bold" color={stitchTokens.wine} style={styles.priceValue}>
                    {entry.value}
                  </AppText>
                </AppText>
              ))}
            </View>
          ) : null}

          {isRejected && summary.note ? (
            <View style={styles.rejectBox}>
              <AppText kind="small" color={stitchTokens.flashRed} style={styles.rejectText} numberOfLines={2}>
                {summary.note}
              </AppText>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${action}: ${title}`}
          onPress={onOpen}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
        >
          <AppText kind="bold" style={styles.actionText}>
            {action}
          </AppText>
          <Icon name="chevronRight" size={15} color={stitchTokens.wine} />
        </Pressable>

        {onDelete ? (
          <IconButton name="trash" label={`Xóa bài đăng: ${title}`} onPress={onDelete} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderColor: stitchTokens.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  focused: { boxShadow: `inset 0 0 0 2px ${colorRoles.focus}` },
  topPressable: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  pressed: { opacity: 0.78 },
  cover: {
    width: 76,
    height: 104,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    overflow: "hidden",
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: "100%",
  },
  badgeSuccess: { backgroundColor: stitchTokens.likeNewGreenBg },
  badgePending: { backgroundColor: stitchTokens.amberBg },
  badgeError: { backgroundColor: stitchTokens.flashRedBg },
  statusText: {
    flexShrink: 1,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  statusTextSuccess: { color: stitchTokens.likeNewGreen },
  statusTextError: { color: stitchTokens.flashRed },
  modePill: {
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.roseWarmSurface,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modePillText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  title: {
    fontSize: 15.5,
    lineHeight: 21,
    color: stitchTokens.wineDark,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  priceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    marginTop: 1,
  },
  priceItem: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  priceValue: {
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  rejectBox: {
    backgroundColor: stitchTokens.flashRedBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 2,
  },
  rejectText: {
    fontSize: 12,
    lineHeight: 16,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
    paddingTop: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 32,
    paddingVertical: 4,
  },
  actionText: {
    fontSize: 13.5,
    color: stitchTokens.wine,
  },
});
