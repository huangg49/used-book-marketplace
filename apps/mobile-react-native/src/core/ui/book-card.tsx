import { useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { AppText } from "./text";
import { Icon } from "./icon";
import { Button } from "./actions";
import { formatVnd } from "./format";
import { stitchTokens } from "./theme";

export interface BookCardItem {
  id: string;
  book?: {
    id?: string;
    title: string;
    authors?: string[];
    publicationYear?: number | null;
    publisher?: string | null;
    category?: string;
  };
  condition?: "LikeNew" | "Good" | "Fair" | "Worn" | string;
  mode?: "Sale" | "Exchange" | "Both" | string;
  salePrice?: number | null;
  exchangeValue?: number | null;
  coverUrl?: string;
  badgeLabel?: string;
  tags?: string[];
  salesCount?: number;
  location?: string;
  fulfillment?: { name?: string };
  moderation?: "Draft" | "PendingReview" | "Approved" | "Rejected" | string;
  mediaCount?: number;
}

export interface BookCardProps {
  readonly item: BookCardItem | any;
  readonly variant?: "shelf" | "search" | "management";
  readonly photoNode?: ReactNode;
  readonly titleNode?: ReactNode;
  readonly badgeNode?: ReactNode;
  readonly onOpen?: () => void;
  readonly isFavorite?: boolean;
  readonly onToggleFavorite?: () => void;
  readonly showFavorite?: boolean;
  readonly showAuthor?: boolean;
  readonly actionTitle?: string;
  readonly onActionPress?: () => void;
  readonly onDelete?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

// Condition styles
const conditionConfig: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  LikeNew: { label: "Như mới", bg: "#1B5E20", text: "#FFFFFF" },
  Good: { label: "Còn tốt", bg: "#C67D38", text: "#FFFFFF" },
  Fair: { label: "Đã dùng", bg: "#58685E", text: "#FFFFFF" },
  Worn: { label: "Cũ nhiều", bg: "#74520C", text: "#FFFFFF" },
};

// Moderation badge config for management variant
const moderationConfig: Record<
  string,
  { label: string; bg: string; text: string; dot?: string }
> = {
  PendingReview: {
    label: "Chờ duyệt",
    bg: "#FFF1ED",
    text: "#B08D2F",
    dot: "#EAC25F",
  },
  Rejected: {
    label: "Cần sửa",
    bg: "#FFDAD6",
    text: "#93000A",
    dot: "#A63A2E",
  },
  Approved: {
    label: "Đang bán",
    bg: "#E1DEC2",
    text: "#1D1C0B",
    dot: "#3D7A57",
  },
  Draft: {
    label: "Bản nháp",
    bg: "#FAF7F2",
    text: "#57423E",
  },
};

export function BookCard({
  item,
  variant = "shelf",
  photoNode,
  titleNode,
  badgeNode,
  onOpen,
  isFavorite: controlledFavorite,
  onToggleFavorite,
  showFavorite = false,
  showAuthor,
  actionTitle,
  onActionPress,
  onDelete,
  style,
}: BookCardProps) {
  const [internalFavorite, setInternalFavorite] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const favorite = controlledFavorite ?? internalFavorite;

  const handleFavoriteToggle = () => {
    setInternalFavorite(!internalFavorite);
    onToggleFavorite?.();
  };

  const bookTitle = item.book?.title || "Chưa chọn đầu sách";
  const authorAndYear = [
    item.book?.authors?.[0],
    item.book?.publicationYear || item.book?.publisher,
  ]
    .filter(Boolean)
    .join(" · ");

  // Condition info
  const condition = conditionConfig[item.condition] || {
    label: item.condition || "Đã dùng",
    bg: "#58685E",
    text: "#FFFFFF",
  };

  // Moderation info for management variant
  const moderation = moderationConfig[item.moderation || "Draft"] || {
    label: "Bản nháp",
    bg: "#FAF7F2",
    text: "#57423E",
  };

  // Mode badge / preferred badge
  const preferredBadge =
    item.badgeLabel ||
    (item.condition === "LikeNew"
      ? "Yêu thích+"
      : item.mode === "Both" || item.mode === "Exchange"
        ? "Đổi sách"
        : undefined);

  // Filter tags (excluding freeship)
  const candidateTags: (string | undefined)[] =
    item.tags && item.tags.length > 0
      ? item.tags
      : [
          item.mode === "Exchange" || item.mode === "Both"
            ? "Đổi sách"
            : undefined,
        ];

  const displayTags: string[] = candidateTags.filter(
    (tag: string | undefined): tag is string =>
      Boolean(tag && typeof tag === "string" && !tag.toLowerCase().includes("freeship")),
  );

  const locationText =
    item.location ||
    (item.fulfillment?.name ? `${item.fulfillment.name}` : "TP.HCM");

  const mediaCount =
    item.mediaCount ?? item.currentRevision?.content?.mediaIds?.length ?? 0;

  const priceValue = item.salePrice || item.exchangeValue;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Xem sách: ${bookTitle}. Giá: ${formatVnd(priceValue || 0)}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.cardContainer,
        pressed && styles.cardPressed,
        style,
      ]}
    >
      {/* 3:4 Aspect Ratio Cover Area */}
      <View style={styles.coverFrame}>
        {photoNode ? (
          <View style={styles.photoContainer}>{photoNode}</View>
        ) : item.coverUrl ? (
          <Image
            source={{ uri: item.coverUrl }}
            style={styles.coverImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholderCover}>
            <Icon name="book" size={28} color="#9E928E" />
          </View>
        )}

        {/* Book Spine Crease Effect */}
        <View style={styles.spineCrease} />

        {/* Top-Left Badge */}
        {variant === "management" ? (
          <View
            style={[
              styles.moderationBadge,
              { backgroundColor: moderation.bg },
            ]}
          >
            {moderation.dot ? (
              <View
                style={[styles.statusDot, { backgroundColor: moderation.dot }]}
              />
            ) : null}
            <AppText
              kind="small"
              style={[styles.moderationText, { color: moderation.text }]}
            >
              {moderation.label}
            </AppText>
          </View>
        ) : (
          <View
            style={[
              styles.conditionBadge,
              { backgroundColor: condition.bg },
            ]}
          >
            <Icon name="check" size={10} color="#FFFFFF" />
            <AppText kind="small" style={styles.conditionText}>
              {condition.label}
            </AppText>
          </View>
        )}

        {/* Top-Right Favorite Button */}
        {variant !== "management" && (onToggleFavorite || showFavorite) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favorite ? "Bỏ yêu thích" : "Lưu vào yêu thích"}
            onPress={handleFavoriteToggle}
            hitSlop={6}
            style={styles.heartButton}
          >
            <Icon
              name="heart"
              size={16}
              color={favorite ? stitchTokens.flashRed : "#FFFFFF"}
              filled={favorite}
            />
          </Pressable>
        ) : null}

        {/* Top-Right 3-Dots Button & Quick Delete Popover for Management */}
        {variant === "management" && onDelete ? (
          <View style={styles.menuContainer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tùy chọn bản nháp"
              onPress={(e) => {
                e.stopPropagation();
                setMenuVisible((prev) => !prev);
              }}
              hitSlop={6}
              style={[styles.moreButton, menuVisible && styles.moreButtonActive]}
            >
              <Icon
                name="dotsVertical"
                size={16}
                color={menuVisible ? stitchTokens.wineDark : "#5C0202"}
                strokeWidth={2.8}
              />
            </Pressable>

            {menuVisible ? (
              <View style={styles.menuPopover}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Xóa bài đăng"
                  onPress={(e) => {
                    e.stopPropagation();
                    setMenuVisible(false);
                    onDelete();
                  }}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && styles.menuItemPressed,
                  ]}
                >
                  <Icon name="trash" size={14} color="#B71C1C" />
                  <AppText kind="small" style={styles.menuItemText}>
                    Xóa
                  </AppText>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Bottom-Left Preferred Badge */}
        {variant !== "management" && preferredBadge ? (
          <View style={styles.preferredBadge}>
            <AppText kind="small" style={styles.preferredText}>
              {preferredBadge}
            </AppText>
          </View>
        ) : null}

        {/* Bottom-Right Media Count (for management or when photos exist) */}
        {variant === "management" && mediaCount > 0 ? (
          <View style={styles.mediaCountBadge}>
            <AppText kind="small" style={styles.mediaCountText}>
              {`${mediaCount} ảnh`}
            </AppText>
          </View>
        ) : null}
      </View>

      {/* Book Metadata Content */}
      <View style={styles.contentArea}>
        <View style={styles.titleBlock}>
          {titleNode ? (
            titleNode
          ) : (
            <>
              <AppText kind="small" style={styles.bookTitle} numberOfLines={2}>
                {bookTitle}
              </AppText>

              {/* Subtitle / Author text for Search or when specified */}
              {(variant === "search" || showAuthor) && authorAndYear ? (
                <AppText kind="small" style={styles.authorText} numberOfLines={1}>
                  {authorAndYear}
                </AppText>
              ) : null}
            </>
          )}
        </View>

        {/* Feature Tags (only if any exist) */}
        {variant !== "management" && displayTags.length > 0 ? (
          <View style={styles.tagsRow}>
            {displayTags.map((tag) => (
              <View
                key={tag}
                style={[
                  styles.tagPill,
                  tag.includes("Freeship")
                    ? styles.freeshipPill
                    : styles.exchangePill,
                ]}
              >
                <AppText
                  kind="small"
                  style={[
                    styles.tagText,
                    tag.includes("Freeship")
                      ? styles.freeshipText
                      : styles.exchangeText,
                  ]}
                >
                  {tag}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {/* Price & Footnote */}
        <View style={styles.bottomBlock}>
          {priceValue ? (
            <AppText kind="shelfPrice" style={styles.priceText}>
              {formatVnd(priceValue)}
            </AppText>
          ) : (
            <AppText kind="small" style={styles.noPriceText}>
              Chưa đặt giá
            </AppText>
          )}

          {/* Management Action Button */}
          {variant === "management" && (actionTitle || onActionPress) ? (
            <View style={styles.managementActionRow}>
              <Button
                wine
                secondary={item.moderation !== "Rejected"}
                title={actionTitle || "Chi tiết"}
                onPress={onActionPress || onOpen || (() => {})}
              />
            </View>
          ) : locationText ? (
            /* Footnote (Location) */
            <View style={styles.metaRow}>
              <AppText kind="small" style={styles.metaText} numberOfLines={1}>
                {locationText}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: "48.5%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EBE6DE",
    overflow: "hidden",
    elevation: 2,
    shadowColor: "rgba(40, 25, 20, 0.08)",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    marginBottom: 8,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  coverFrame: {
    width: "100%",
    aspectRatio: 3 / 4,
    backgroundColor: "#F7F4EE",
    position: "relative",
    overflow: "hidden",
  },
  photoContainer: {
    width: "100%",
    height: "100%",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  placeholderCover: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAF7F2",
  },
  spineCrease: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 6,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  conditionBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    elevation: 2,
  },
  conditionText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 11,
  },
  moderationBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  moderationText: {
    fontSize: 9,
    fontWeight: "700",
  },
  heartButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuContainer: {
    position: "absolute",
    top: 6,
    right: 6,
    zIndex: 30,
    elevation: 6,
  },
  moreButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderWidth: 1,
    borderColor: "#DEC0BB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },
  moreButtonActive: {
    backgroundColor: "#FCEEEB",
    borderColor: stitchTokens.wine,
  },
  menuPopover: {
    position: "absolute",
    top: 30,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DEC0BB",
    minWidth: 84,
    paddingVertical: 3,
    paddingHorizontal: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 40,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  menuItemPressed: {
    backgroundColor: "#FFEBEE",
  },
  menuItemText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B71C1C",
  },
  preferredBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  preferredText: {
    color: stitchTokens.gold,
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 11,
  },
  mediaCountBadge: {
    position: "absolute",
    bottom: 4,
    right: 6,
    backgroundColor: "rgba(92, 2, 2, 0.75)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  mediaCountText: {
    color: "#FFFDF8",
    fontSize: 9,
    fontWeight: "600",
  },
  contentArea: {
    padding: 8,
    flex: 1,
    justifyContent: "space-between",
  },
  titleBlock: {
    gap: 2,
  },
  bookTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#271813",
    lineHeight: 16,
    fontFamily: "BeBold",
  },
  authorText: {
    fontSize: 10,
    color: "#786B67",
    lineHeight: 13,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    marginBottom: 4,
  },
  tagPill: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 0.5,
  },
  tagText: {
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 11,
  },
  freeshipPill: {
    backgroundColor: "#FFEBEE",
    borderColor: "#FFCDD2",
  },
  freeshipText: {
    color: "#C62828",
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 11,
  },
  exchangePill: {
    backgroundColor: "#FFF8E1",
    borderColor: "#FFE082",
  },
  exchangeText: {
    color: "#E65100",
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 11,
  },
  bottomBlock: {
    marginTop: 4,
  },
  priceText: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wine,
    fontFamily: "BeBold",
  },
  noPriceText: {
    fontSize: 10,
    fontStyle: "italic",
    color: "#8B716D",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  metaText: {
    fontSize: 10,
    color: "#8C807C",
  },
  managementActionRow: {
    marginTop: 6,
  },
});
