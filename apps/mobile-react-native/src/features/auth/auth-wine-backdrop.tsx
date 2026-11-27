import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { stitchTokens } from "../../core/ui";

/**
 * Full-bleed luxury wine-red editorial backdrop for Login & Register screens.
 * Uses a deep Bordeaux-to-wine gradient with a soft champagne-gold radial glow
 * and subtle embossed gold bookplate rings.
 */
export function AuthWineBackdrop() {
  return (
    <View style={styles.container} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 390 844"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient id="wineBase" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={stitchTokens.wineBackdropLight} />
            <Stop offset="48%" stopColor={stitchTokens.wine} />
            <Stop offset="100%" stopColor={stitchTokens.wineDark} />
          </LinearGradient>
          <RadialGradient id="goldGlow" cx="50%" cy="14%" r="52%">
            <Stop offset="0%" stopColor={stitchTokens.gold} stopOpacity="0.18" />
            <Stop offset="55%" stopColor={stitchTokens.goldAccent} stopOpacity="0.05" />
            <Stop offset="100%" stopColor={stitchTokens.wineDark} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="bottomGlow" cx="85%" cy="92%" r="48%">
            <Stop offset="0%" stopColor={stitchTokens.gold} stopOpacity="0.1" />
            <Stop offset="100%" stopColor={stitchTokens.wineDark} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Base velvet wine gradient */}
        <Rect x="0" y="0" width="390" height="844" fill="url(#wineBase)" />
        {/* Warm champagne glow behind logo */}
        <Rect x="0" y="0" width="390" height="844" fill="url(#goldGlow)" />
        {/* Subtle bottom warmth */}
        <Rect x="0" y="0" width="390" height="844" fill="url(#bottomGlow)" />

        {/* Embossed gold bookplate hairline arcs */}
        <Circle
          cx="350"
          cy="72"
          r="138"
          fill="none"
          stroke={stitchTokens.gold}
          strokeOpacity="0.11"
          strokeWidth="1"
        />
        <Circle
          cx="350"
          cy="72"
          r="104"
          fill="none"
          stroke={stitchTokens.gold}
          strokeOpacity="0.07"
          strokeWidth="1"
        />
        <Circle
          cx="24"
          cy="760"
          r="150"
          fill="none"
          stroke={stitchTokens.gold}
          strokeOpacity="0.09"
          strokeWidth="1"
        />
        <Circle
          cx="24"
          cy="760"
          r="112"
          fill="none"
          stroke={stitchTokens.gold}
          strokeOpacity="0.05"
          strokeWidth="1"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: stitchTokens.wineDark,
  },
});
