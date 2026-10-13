import { Image as ExpoImage } from "expo-image";
import { Image, StyleSheet, View } from "react-native";

export interface BrandLogoProps {
  readonly inverse?: boolean;
  readonly stacked?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly style?: any;
}

export function BrandLogo({
  inverse = false,
  stacked = false,
  width,
  height,
  style,
}: BrandLogoProps) {
  const defaultWidth = stacked ? 96 : 142;
  const defaultHeight = stacked ? 82 : 46;
  const source = stacked
    ? require("../../../../../packages/brand/logos/lat-lai-stacked.png")
    : inverse
      ? require("../../../../../packages/brand/logos/lat-lai-horizontal-white.png")
      : require("../../../../../packages/brand/logos/lat-lai-horizontal-primary.png");

  return (
    <ExpoImage
      source={source}
      style={[{ width: width ?? defaultWidth, height: height ?? defaultHeight }, style]}
      contentFit="contain"
      accessible
      accessibilityLabel="Lật lại"
    />
  );
}

export interface WebBrandLogoProps {
  readonly scale?: number;
}

/**
 * Official Web Logo (10/10/2026) matching apps/user-web
 * Crops the owl and wordmark from logo-original.png seamlessly onto wine backgrounds.
 */
export function WebBrandLogo({ scale = 0.75 }: WebBrandLogoProps) {
  const owlWidth = Math.round(52 * scale);
  const owlHeight = Math.round(42 * scale);
  const owlImgSize = Math.round(240 * scale);
  const owlLeft = Math.round(-94 * scale);
  const owlTop = Math.round(-72 * scale);

  const wordWidth = Math.round(126 * scale);
  const wordHeight = Math.round(43 * scale);
  const wordImgSize = Math.round(400 * scale);
  const wordLeft = Math.round(-137 * scale);
  const wordTop = Math.round(-198 * scale);
  const gap = Math.round(10 * scale);

  return (
    <View
      style={[styles.logoContainer, { gap }]}
      accessible
      accessibilityLabel="Lật Lại - Tiệm Sách Cũ"
    >
      <View style={[styles.cropBox, { width: owlWidth, height: owlHeight }]}>
        <Image
          source={require("../../../assets/brand/logo-original.png")}
          style={[
            styles.absoluteImg,
            {
              width: owlImgSize,
              height: owlImgSize,
              left: owlLeft,
              top: owlTop,
            },
          ]}
          resizeMode="cover"
        />
      </View>
      <View style={[styles.cropBox, { width: wordWidth, height: wordHeight }]}>
        <Image
          source={require("../../../assets/brand/logo-original.png")}
          style={[
            styles.absoluteImg,
            {
              width: wordImgSize,
              height: wordImgSize,
              left: wordLeft,
              top: wordTop,
            },
          ]}
          resizeMode="cover"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  cropBox: {
    overflow: "hidden",
    position: "relative",
  },
  absoluteImg: {
    position: "absolute",
  },
});

