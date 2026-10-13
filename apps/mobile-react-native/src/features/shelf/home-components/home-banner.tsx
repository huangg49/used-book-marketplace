import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, stitchTokens } from "../../../core/ui";

export interface HomeBannerProps {
  readonly onExplorePress: () => void;
}

const BANNERS = [
  {
    id: "banner-1",
    tag: "Cuối Tuần Hoài Niệm",
    title: "Phiên Chợ Sách Cũ TP.HCM",
    subtitle: "Đồng giá từ 29k • Giảm đến 50% kỳ thư",
    cta: "Khám phá ngay",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBCPA40o2VI0MCvsnyEV7Am43FaD_aFuiE45kzUCm0zjLairQk9p2v5sY6LfjBT4nCLG6LMTXTCidRV2mCel1P-eaMUs-MMGffh4Ot0tC7KlSFEmie2qW5VQ75WdFKe2ppy6OCFh5bBiRbuhx8r5fGPZf-okPvoCvK-l7eYUcgL5uZVTP4emnNilUKCUJ3AmCTFbZcfHMQP6AbiKMoMj8HRISzh_QgY-Sol4XJUSxCsxWjpvVi92JNZzA",
  },
  {
    id: "banner-2",
    tag: "Đấu Giá Kỳ Thư",
    title: "Bản In Đầu Tiên 1930 - 1954",
    subtitle: "Thẩm định 100% tại ViaPoint Quận 1",
    cta: "Xem danh sách",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAxeQlbXMk95s5TrwA3De-vaAu7UE6qefn1VRGBinxuGMr_IGdfQ2Z5x2RG2V2jAs2QWkLO_hGdU-jk__XTMFRoa0G9eMD3rpvbkfJShYIaKTw902TrOH4wWQv71-A9sNa37dV123cvj_PONJa8NoK3ZDZc3uxZHV-7pNzW7ohFUeTvqJah_OCxSlmZM-lLVufIOfz-I7Lo6vyiNPZvVY4Ye3NE85zOrCO2J7Zau1G73QilI-s878kqwA",
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
            <AppText kind="heading" style={styles.bannerTitle} numberOfLines={1}>
              {currentBanner.title}
            </AppText>

            {/* Subtitle */}
            <AppText kind="small" style={styles.bannerSubtitle} numberOfLines={1}>
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
            <Image
              source={{ uri: currentBanner.image }}
              style={styles.bookCoverImage}
              resizeMode="cover"
              accessibilityLabel="Hình ảnh bìa sách nổi bật"
            />
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
