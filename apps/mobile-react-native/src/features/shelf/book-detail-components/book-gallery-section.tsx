import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

  const totalPhotos = item.photos.length;
  const insets = useSafeAreaInsets();
  const topInsetOffset = insets.top + 52 + 10;

  return (
    <View style={styles.container}>
      {/* 1. Edge-to-Edge Hero Photo Display */}
      <View style={styles.mainPhotoWrapper}>
        <View style={styles.mainPhotoContainer}>
          {currentPhoto ? (
            <View
              style={[
                styles.photoContainer,
                { paddingTop: insets.top + 20, height: 430 + insets.top },
              ]}
            >
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
        <View style={[styles.topLeftBadges, { top: topInsetOffset }]}>
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

        {/* Bottom Left Watermark Badge */}
        <View style={styles.watermarkPill}>
          <Icon name="camera" size={13} color={stitchTokens.white} />
          <AppText style={styles.watermarkText}>
            Ảnh chụp thật (4 góc + ruột)
          </AppText>
        </View>

        {/* Bottom Right Actions & Photo Counter */}
        <View style={styles.bottomRightGroup}>
          {totalPhotos > 1 && (
            <View style={styles.counterPill}>
              <AppText style={styles.counterText}>
                {selectedIndex + 1}/{totalPhotos}
              </AppText>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chạm để phóng to ảnh"
            style={({ pressed }) => [styles.zoomPill, pressed && styles.pressed]}
            onPress={() => setZoomVisible(true)}
          >
            <Icon name="search" size={14} color={stitchTokens.wineDark} />
            <AppText style={styles.zoomText}>Phóng to</AppText>
          </Pressable>
        </View>
      </View>

      {/* 2. Edge-to-Edge Horizontal Thumbnails Strip */}
      {totalPhotos > 1 && (
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

      {/* Fullscreen Photo Modal Sheet */}
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
              label={`Ảnh phóng to của ${item.book.title}`}
              active={active}
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
    width: "100%",
    backgroundColor: stitchTokens.parchment,
  },
  mainPhotoWrapper: {
    position: "relative",
    width: "100%",
    overflow: "hidden",
    backgroundColor: stitchTokens.warmCard,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
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
    top: 14,
    left: 16,
    gap: 6,
    zIndex: 10,
    alignItems: "flex-start",
  },
  conditionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.likeNewGreenBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
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
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  modeText: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.white,
    letterSpacing: 0.5,
  },
  watermarkPill: {
    position: "absolute",
    bottom: 14,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.scrimDark,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    zIndex: 10,
  },
  watermarkText: {
    fontSize: 10,
    color: stitchTokens.white,
    fontWeight: "600",
  },
  bottomRightGroup: {
    position: "absolute",
    bottom: 14,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 10,
  },
  counterPill: {
    backgroundColor: stitchTokens.scrimDark,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
  },
  counterText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  zoomPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.whiteSurface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  zoomText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  thumbnailScroll: {
    gap: 10,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
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
    borderColor: stitchTokens.wineDark,
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
