import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { AppText, Icon, Sheet, space, stitchTokens } from "../../../core/ui";
import { conditions, type Listing } from "../contracts";
import { PublicPhoto } from "../public-photo";

interface BookGallerySectionProps {
  item: Listing;
  selectedIndex: number;
  onSelectPhoto: (index: number) => void;
  active: boolean;
}

const photoLabels = [
  "Bìa trước",
  "Mép giấy",
  "Bìa sau & gáy",
  "Ghi chú",
  "Gáy sách",
  "Trang tiêu đề",
  "Khuyết điểm",
  "Ảnh thêm",
];

function formatListingDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function BookGallerySection({
  item,
  selectedIndex,
  onSelectPhoto,
  active,
}: BookGallerySectionProps) {
  const [zoomVisible, setZoomVisible] = useState(false);
  const currentPhoto = item.photos[selectedIndex] || item.photos[0];

  const conditionText = conditions[item.condition] || "Rất tốt";
  const modeText =
    item.mode === "Both"
      ? "ĐĂNG BÁN & TRAO ĐỔI"
      : item.mode === "Sale"
        ? "ĐĂNG BÁN"
        : "TRAO ĐỔI";

  const isAvailable = item.purchaseAvailability?.status === "Available";
  const listingStatusLabel = isAvailable ? "Đang mở bán" : "Đang giao dịch";
  const listingCode = `#TIN-${item.id.slice(0, 8).toUpperCase()}`;
  const publishedDateText = item.publishedAt
    ? formatListingDate(item.publishedAt)
    : "";
  const areaText = item.fulfillment?.name || "TP.HCM";

  return (
    <View style={styles.container}>
      {/* Main Book Photo Frame */}
      <View style={styles.mainPhotoWrapper}>
        <View style={styles.mainPhotoContainer}>
          {currentPhoto ? (
            <View style={styles.photoContainer}>
              <PublicPhoto
                key={`${item.revisionId}/${selectedIndex}`}
                listingId={item.id}
                revisionId={item.revisionId}
                mediaId={currentPhoto.id}
                label={`Ảnh ${selectedIndex + 1} của ${item.book.title}`}
                active={active}
                expanded
              />
            </View>
          ) : null}
        </View>

        {/* Top Left Floating Badges */}
        <View style={styles.topLeftBadges}>
          <View style={styles.conditionPill}>
            <View style={styles.conditionDot} />
            <AppText style={styles.conditionText}>
              Tình trạng: {conditionText}
            </AppText>
          </View>

          <View style={styles.modeBadge}>
            <AppText style={styles.modeText}>{modeText}</AppText>
          </View>
        </View>

        {/* Top Right Verification Seal */}
        <View style={styles.verifiedSeal}>
          <Icon name="verified" size={18} color={stitchTokens.wineDark} />
        </View>

        {/* Bottom Right Magnifier Pill */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chạm để phóng to ảnh"
          style={({ pressed }) => [styles.zoomPill, pressed && styles.pressed]}
          onPress={() => setZoomVisible(true)}
        >
          <Icon name="search" size={15} color={stitchTokens.wineDark} />
          <AppText style={styles.zoomText}>Chạm để phóng to</AppText>
        </Pressable>

        {/* Bottom Edge Watermark */}
        <View style={styles.watermarkBanner}>
          <AppText style={styles.watermarkText}>
            Ảnh chụp thật của người bán (4 góc + ruột sách)
          </AppText>
        </View>
      </View>

      {/* Thumbnails Scrollbar */}
      {item.photos.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbnailScroll}
        >
          {item.photos.map((photo, idx) => {
            const isSelected = idx === selectedIndex;
            const label = photoLabels[idx] || `Ảnh ${idx + 1}`;
            return (
              <Pressable
                key={photo.id}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={[
                  styles.thumbnailItem,
                  isSelected && styles.thumbnailSelected,
                ]}
                onPress={() => onSelectPhoto(idx)}
              >
                <View style={styles.thumbPhotoWrapper}>
                  <PublicPhoto
                    listingId={item.id}
                    revisionId={item.revisionId}
                    mediaId={photo.id}
                    label={label}
                    active={active}
                    compact
                  />
                </View>
                <View style={styles.thumbLabelBox}>
                  <AppText style={styles.thumbLabel}>{label}</AppText>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Official Listing Metadata Card */}
      <View style={styles.certCard}>
        <View style={styles.certInfo}>
          <Icon name="tag" size={19} color={stitchTokens.wineDark} />
          <View style={styles.certTextCol}>
            <AppText style={styles.certTitle}>
              Mã tin: <AppText style={styles.certCode}>{listingCode}</AppText>
            </AppText>
            <AppText style={styles.certSubtitle}>
              {publishedDateText ? `Đăng ngày ${publishedDateText}` : "Đang niêm yết"}
              {areaText ? ` · ${areaText}` : ""}
            </AppText>
          </View>
        </View>
        <View
          style={[
            styles.certActionBadge,
            !isAvailable && styles.certActionBadgeBusy,
          ]}
        >
          <AppText style={styles.certActionText}>{listingStatusLabel}</AppText>
        </View>
      </View>

      {/* Fullscreen Photo Sheet */}
      <Sheet
        title={`${photoLabels[selectedIndex] || `Ảnh ${selectedIndex + 1}`} · ${item.book.title}`}
        visible={zoomVisible}
        onClose={() => setZoomVisible(false)}
        motion="photo"
      >
        <View style={styles.sheetPhotoWrapper}>
          {currentPhoto && (
            <PublicPhoto
              listingId={item.id}
              revisionId={item.revisionId}
              mediaId={currentPhoto.id}
              label={`Ảnh lớn ${item.book.title}`}
              active={active && zoomVisible}
              expanded
            />
          )}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
  },
  mainPhotoWrapper: {
    position: "relative",
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  mainPhotoContainer: {
    width: "100%",
    minHeight: 400,
    backgroundColor: stitchTokens.warmCard,
    justifyContent: "center",
  },
  photoContainer: {
    width: "100%",
    height: 420,
    alignItems: "center",
    justifyContent: "center",
  },
  topLeftBadges: {
    position: "absolute",
    top: 12,
    left: 12,
    gap: 6,
    zIndex: 10,
    alignItems: "flex-start",
  },
  conditionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.likeNewGreenBg,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  conditionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.likeNewGreen,
  },
  conditionText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
    letterSpacing: 0.2,
  },
  modeBadge: {
    backgroundColor: stitchTokens.wineDark,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  modeText: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.white,
    letterSpacing: 0.5,
  },
  verifiedSeal: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  zoomPill: {
    position: "absolute",
    bottom: 34,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.whiteSurface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  zoomText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.wineDark,
  },
  watermarkBanner: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: stitchTokens.scrimDark,
  },
  watermarkText: {
    fontSize: 10,
    color: stitchTokens.white,
    fontWeight: "500",
    textAlign: "center",
  },
  thumbnailScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  thumbnailItem: {
    width: 76,
    height: 98,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1.5,
    borderColor: stitchTokens.cardBorder,
    opacity: 0.72,
  },
  thumbnailSelected: {
    borderColor: stitchTokens.wineLight,
    borderWidth: 2,
    opacity: 1,
  },
  thumbPhotoWrapper: {
    flex: 1,
    backgroundColor: stitchTokens.warmCard,
  },
  thumbLabelBox: {
    backgroundColor: stitchTokens.scrimDark,
    paddingVertical: 2,
  },
  thumbLabel: {
    fontSize: 9,
    color: stitchTokens.white,
    textAlign: "center",
    fontWeight: "600",
  },
  certCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1.5,
    borderColor: stitchTokens.goldBorder,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  certInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  certTextCol: {
    flex: 1,
  },
  certTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  certSubtitle: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    marginTop: 2,
  },
  certCode: {
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  certActionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: stitchTokens.likeNewGreen,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  certActionBadgeBusy: {
    backgroundColor: stitchTokens.wineLight,
  },
  certActionText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  sheetPhotoWrapper: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    minHeight: 360,
    backgroundColor: stitchTokens.warmCard,
  },
  pressed: {
    opacity: 0.8,
  },
});
