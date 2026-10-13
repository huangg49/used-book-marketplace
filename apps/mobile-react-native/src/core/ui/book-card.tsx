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
import { colors, space, stitchTokens } from "./theme";

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
  mode?: "Sale" | "Exchange" | "Both" | "Auction" | string;
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
  photos?: { id: string }[];
  revisionId?: string;
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

// Condition styles matching Home shelf
const conditionConfig: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  LikeNew: { label: "Như mới", bg: stitchTokens.likeNewGreen, text: stitchTokens.white },
  Good: { label: "Còn tốt", bg: stitchTokens.goldBronze, text: stitchTokens.white },
  Fair: { label: "Đã dùng nhiều", bg: stitchTokens.darkTaupe, text: stitchTokens.white },
  Worn: { label: "Cũ nhiều", bg: stitchTokens.darkTaupe, text: stitchTokens.white },
};

const modeConfig: Record<string, { label: string; bg: string }> = {
  Sale: { label: "Bán", bg: stitchTokens.wine },
  Exchange: { label: "Đổi", bg: stitchTokens.orangeDeep },
  Both: { label: "Bán hoặc đổi", bg: stitchTokens.darkRed },
  Auction: { label: "Đấu giá", bg: stitchTokens.darkRed },
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
  onOpen,
  actionTitle,
  onActionPress,
  onDelete,
  style,
}: BookCardProps) {
  const [menuVisible, setMenuVisible] = useState(false);

  const bookTitle = item.book?.title || "Chưa chọn đầu sách";
  const authorText =
    Array.isArray(item.book?.authors) && item.book.authors.length > 0
      ? item.book.authors.join(" · ")
      : typeof item.book?.authors === "string"
        ? item.book.authors
        : [
            item.book?.authors?.[0],
            item.book?.publicationYear || item.book?.publisher,
          ]
            .filter(Boolean)
            .join(" · ");

  // Condition info
  const condition = (item.condition && conditionConfig[item.condition]) || {
    label: item.condition || "Còn tốt",
    bg: stitchTokens.goldBronze,
    text: stitchTokens.white,
  };

  // Moderation info for management variant
  const moderation = moderationConfig[item.moderation || "Draft"] || {
    label: "Bản nháp",
    bg: "#FAF7F2",
    text: "#57423E",
  };

  // Mode badge
  const modeInfo = item.mode ? modeConfig[item.mode] || { label: item.mode, bg: stitchTokens.wine } : null;

  const locationText =
    item.fulfillment?.name ?? item.location ?? "TP.HCM";

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
            <AppText kind="small" style={styles.conditionText}>
              {condition.label}
            </AppText>
          </View>
        )}

        {/* Top-Right Mode Tag (Bán / Đổi / Bán hoặc đổi) */}
        {variant !== "management" && modeInfo ? (
          <View
            style={[
              styles.modeBadge,
              { backgroundColor: modeInfo.bg },
            ]}
          >
            <AppText kind="small" style={styles.modeText}>
              {modeInfo.label}
            </AppText>
          </View>
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

        {/* Bottom-Right Media Count (for management) */}
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
              <AppText
                kind="shelfTitle"
                style={styles.bookTitle}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {bookTitle}
              </AppText>

              {authorText ? (
                <AppText
                  kind="annotation"
                  color={colors.muted}
                  numberOfLines={1}
                  style={styles.authorText}
                >
                  {authorText}
                </AppText>
              ) : null}
            </>
          )}
        </View>

        {/* Price & Footnote */}
        <View style={styles.bottomBlock}>
          {item.salePrice != null && (
            <AppText kind="shelfPrice" style={styles.priceText}>
              {formatVnd(item.salePrice)}
            </AppText>
          )}
          {item.exchangeValue != null && (
            <AppText kind="annotation" style={styles.exchangeText}>
              Giá trị đổi {formatVnd(item.exchangeValue)}
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
            /* Footnote (Location with Pin icon) */
            <View style={styles.metaRow}>
              <Icon name="pin" size={11} color={colors.muted} />
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
    backgroundColor: stitchTokens.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.creamParchment,
    overflow: "hidden",
    elevation: 2,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    marginBottom: 10,
  },
  cardPressed: {
    opacity: 0.9,
  },
  coverFrame: {
    width: "100%",
    aspectRatio: 3 / 4,
    backgroundColor: stitchTokens.offWhiteWarm,
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
    backgroundColor: stitchTokens.parchment,
  },
  conditionBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    elevation: 2,
  },
  conditionText: {
    color: stitchTokens.white,
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 11,
  },
  modeBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    elevation: 2,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  modeText: {
    color: stitchTokens.white,
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
    shadowColor: stitchTokens.black,
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
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },
  moreButtonActive: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderColor: stitchTokens.wine,
  },
  menuPopover: {
    position: "absolute",
    top: 30,
    right: 0,
    backgroundColor: stitchTokens.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    minWidth: 84,
    paddingVertical: 3,
    paddingHorizontal: 4,
    shadowColor: stitchTokens.black,
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
    backgroundColor: stitchTokens.flashRedBg,
  },
  menuItemText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.darkRed,
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
    color: stitchTokens.warmIvory,
    fontSize: 9,
    fontWeight: "600",
  },
  contentArea: {
    padding: 10,
    gap: space.xs,
    justifyContent: "space-between",
    flex: 1,
  },
  titleBlock: {
    gap: 2,
  },
  bookTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.darkWood,
    lineHeight: 17,
  },
  authorText: {
    fontSize: 11,
    color: colors.muted,
  },
  bottomBlock: {
    marginTop: 4,
    gap: 2,
  },
  priceText: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  exchangeText: {
    fontSize: 11,
    color: stitchTokens.warmUmber,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
  metaText: {
    fontSize: 10,
    color: colors.muted,
  },
  managementActionRow: {
    marginTop: 6,
  },
});
