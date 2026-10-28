import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, stitchTokens } from "../../../core/ui";

export interface HomeBannerProps {
  readonly onExplorePress: () => void;
}

const BANNERS = [
  {
    id: "discover",
    tag: "Chuyền tay sách cũ",
    title: "Tìm cuốn sách tiếp theo",
    subtitle: "Xem ảnh và mô tả của từng bản sách",
    cta: "Khám phá sách",
  },
  {
    id: "circulation",
    tag: "Sách còn một hành trình",
    title: "Mua bán hoặc trao đổi",
    subtitle: "Chọn hình thức phù hợp với bản sách",
    cta: "Xem kệ sách",
  },
];

export function HomeBanner({ onExplorePress }: HomeBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const currentBanner = BANNERS[activeIndex];

  const handleNextBanner = () => {
    setActiveIndex((prev) => (prev + 1) % BANNERS.length);
  };

  return (
    <View style={styles.bannerSection}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${currentBanner.tag}: ${currentBanner.title}. ${currentBanner.cta}`}
        onPress={() => {
          onExplorePress();
          handleNextBanner();
        }}
        style={styles.bannerCard}
      >
        <View style={styles.bannerContent}>
          <View style={styles.textContainer}>
            {/* Tag Badge */}
            <View style={styles.tagBadge}>
              <Icon name="celebration" size={12} color={stitchTokens.wineDark} />
              <AppText kind="small" style={styles.tagText}>
                {currentBanner.tag}
              </AppText>
            </View>

            {/* Title */}
            <AppText kind="heading" style={styles.bannerTitle}>
              {currentBanner.title}
            </AppText>

            {/* Subtitle */}
            <AppText kind="small" style={styles.bannerSubtitle}>
              {currentBanner.subtitle}
            </AppText>

            {/* CTA Button */}
            <View style={styles.ctaButtonWrapper}>
              <View style={styles.ctaButton}>
                <AppText kind="small" style={styles.ctaText}>
                  {currentBanner.cta}
                </AppText>
              </View>
            </View>
          </View>

          {/* Book Image Showcase */}
          <View style={styles.imageContainer}>
            <View style={styles.glowAura} />
            <Icon name="book" size={64} color={stitchTokens.wineDark} />
          </View>
        </View>

        {/* Carousel Dots */}
        <View style={styles.dotsRow}>
          {BANNERS.map((banner, idx) => (
            <Pressable
              key={banner.id}
              onPress={() => setActiveIndex(idx)}
              style={[
                styles.dot,
                idx === activeIndex ? styles.dotActive : styles.dotInactive,
              ]}
              accessibilityLabel={`Chuyển sang biểu ngữ ${idx + 1}`}
            />
          ))}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerSection: {
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
  },
  bannerCard: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: stitchTokens.wineDeep,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha20,
    elevation: 4,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textContainer: {
    flex: 1,
    paddingRight: 10,
    justifyContent: "center",
  },
  tagBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: stitchTokens.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    alignSelf: "flex-start",
    gap: 4,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    textTransform: "uppercase",
  },
  bannerTitle: {
    color: stitchTokens.gold,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    fontFamily: "BeBold",
  },
  bannerSubtitle: {
    color: stitchTokens.goldVeryLight,
    fontSize: 11,
    marginTop: 2,
  },
  ctaButtonWrapper: {
    marginTop: 8,
  },
  ctaButton: {
    backgroundColor: stitchTokens.gold,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  ctaText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  imageContainer: {
    width: 80,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  glowAura: {
    position: "absolute",
    width: 86,
    height: 96,
    borderRadius: 43,
    backgroundColor: stitchTokens.goldAlpha20,
  },
  bookCoverImage: {
    width: 68,
    height: 90,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
    transform: [{ rotate: "-4deg" }],
  },
  dotsRow: {
    position: "absolute",
    bottom: 6,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    height: 5,
    borderRadius: 2.5,
  },
  dotActive: {
    width: 14,
    backgroundColor: stitchTokens.gold,
  },
  dotInactive: {
    width: 5,
    backgroundColor: stitchTokens.whiteAlpha40,
  },
});
