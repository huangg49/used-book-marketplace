import React, { useEffect, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { stitchTokens } from "../../core/ui";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// SVG Paths for realistic autumn foliage
function MapleLeafSvg({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G fill={color}>
        {/* Intricate 5-lobe maple leaf silhouette */}
        <Path d="M50 5 L55 22 L67 15 L64 30 L80 28 L72 42 L88 48 L76 60 L85 70 L66 69 L63 80 L52 74 L50 95 L48 74 L37 80 L34 69 L15 70 L24 60 L12 48 L28 42 L20 28 L36 30 L33 15 L45 22 Z" />
        {/* Subtle leaf stem */}
        <Path
          d="M50 74 L50 98"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

function GinkgoLeafSvg({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G fill={color}>
        {/* Fan-shaped ginkgo biloba leaf */}
        <Path d="M50 78 C35 78 20 62 14 44 C8 26 26 12 48 18 C50 19 50 19 52 18 C74 12 92 26 86 44 C80 62 65 78 50 78 Z" />
        {/* Notch */}
        <Path
          d="M50 18 L50 42"
          stroke={stitchTokens.autumnSoftSun}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Stem */}
        <Path
          d="M50 78 C49 85 47 92 42 98"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </G>
    </Svg>
  );
}

function OakLeafSvg({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G fill={color}>
        {/* Wavy lobed oak leaf */}
        <Path d="M50 8 C58 14 62 20 59 27 C68 28 72 36 67 44 C76 47 77 56 70 64 C76 71 70 80 57 82 L52 96 L48 96 L43 82 C30 80 24 71 30 64 C23 56 24 47 33 44 C28 36 32 28 41 27 C38 20 42 14 50 8 Z" />
        <Path
          d="M50 18 L50 85"
          stroke={stitchTokens.autumnSoftSun}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

function ElmLeafSvg({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G fill={color}>
        {/* Slender serrated autumn leaf */}
        <Path d="M50 6 C66 22 74 48 64 74 C58 84 52 88 50 92 C48 88 42 84 36 74 C26 48 34 22 50 6 Z" />
        <Path
          d="M50 12 L50 92"
          stroke={stitchTokens.autumnSoftSun}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

interface LeafConfig {
  id: number;
  type: "maple" | "ginkgo" | "oak" | "elm";
  size: number;
  color: string;
  startX: number;
  swayDistance: number;
  rotateDeg: string;
  duration: number;
  delay: number;
  opacity: number;
}

const LEAVES_DATA: LeafConfig[] = [
  {
    id: 1,
    type: "maple",
    size: 32,
    color: stitchTokens.autumnMapleRed,
    startX: 0.12,
    swayDistance: 38,
    rotateDeg: "280deg",
    duration: 9500,
    delay: 0,
    opacity: 0.65,
  },
  {
    id: 2,
    type: "ginkgo",
    size: 26,
    color: stitchTokens.autumnGinkgoGold,
    startX: 0.32,
    swayDistance: -32,
    rotateDeg: "190deg",
    duration: 11000,
    delay: 1500,
    opacity: 0.7,
  },
  {
    id: 3,
    type: "elm",
    size: 20,
    color: stitchTokens.autumnWarmOrange,
    startX: 0.58,
    swayDistance: 28,
    rotateDeg: "320deg",
    duration: 8200,
    delay: 800,
    opacity: 0.6,
  },
  {
    id: 4,
    type: "oak",
    size: 30,
    color: stitchTokens.autumnLeafRust,
    startX: 0.82,
    swayDistance: -42,
    rotateDeg: "240deg",
    duration: 12500,
    delay: 2200,
    opacity: 0.65,
  },
  {
    id: 5,
    type: "maple",
    size: 24,
    color: stitchTokens.autumnWarmOrange,
    startX: 0.72,
    swayDistance: 34,
    rotateDeg: "360deg",
    duration: 10200,
    delay: 3500,
    opacity: 0.55,
  },
  {
    id: 6,
    type: "ginkgo",
    size: 30,
    color: stitchTokens.autumnLeafGold,
    startX: 0.05,
    swayDistance: 45,
    rotateDeg: "150deg",
    duration: 13000,
    delay: 4200,
    opacity: 0.6,
  },
  {
    id: 7,
    type: "elm",
    size: 18,
    color: stitchTokens.autumnMapleRed,
    startX: 0.44,
    swayDistance: -25,
    rotateDeg: "210deg",
    duration: 7800,
    delay: 2800,
    opacity: 0.5,
  },
  {
    id: 8,
    type: "oak",
    size: 25,
    color: stitchTokens.autumnChestnutBrown,
    startX: 0.22,
    swayDistance: 30,
    rotateDeg: "170deg",
    duration: 11500,
    delay: 5000,
    opacity: 0.55,
  },
  {
    id: 9,
    type: "maple",
    size: 28,
    color: stitchTokens.autumnLeafGold,
    startX: 0.92,
    swayDistance: -35,
    rotateDeg: "310deg",
    duration: 9800,
    delay: 4600,
    opacity: 0.65,
  },
  {
    id: 10,
    type: "ginkgo",
    size: 22,
    color: stitchTokens.autumnGinkgoGold,
    startX: 0.52,
    swayDistance: 36,
    rotateDeg: "270deg",
    duration: 10600,
    delay: 6000,
    opacity: 0.6,
  },
];

function AnimatedFallingLeaf({ leaf }: { leaf: LeafConfig }) {
  const [fallAnim] = useState(() => new Animated.Value(0));
  const [swayAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // Continuous falling animation
    const fallLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(leaf.delay),
        Animated.timing(fallAnim, {
          toValue: 1,
          duration: leaf.duration,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(fallAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ]),
    );

    // Side-to-side gentle wind sway
    const swayLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(swayAnim, {
          toValue: 1,
          duration: leaf.duration / 4,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(swayAnim, {
          toValue: -1,
          duration: leaf.duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(swayAnim, {
          toValue: 0,
          duration: leaf.duration / 4,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    );

    fallLoop.start();
    swayLoop.start();

    return () => {
      fallLoop.stop();
      swayLoop.stop();
    };
  }, [fallAnim, swayAnim, leaf]);

  const translateY = fallAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, SCREEN_HEIGHT + 60],
  });

  const translateX = swayAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-leaf.swayDistance, 0, leaf.swayDistance],
  });

  const rotate = swayAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-35deg", leaf.rotateDeg],
  });

  const baseLeft = leaf.startX * SCREEN_WIDTH;

  const renderLeafSvg = () => {
    switch (leaf.type) {
      case "maple":
        return <MapleLeafSvg size={leaf.size} color={leaf.color} />;
      case "ginkgo":
        return <GinkgoLeafSvg size={leaf.size} color={leaf.color} />;
      case "oak":
        return <OakLeafSvg size={leaf.size} color={leaf.color} />;
      case "elm":
        return <ElmLeafSvg size={leaf.size} color={leaf.color} />;
    }
  };

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: baseLeft,
        top: 0,
        opacity: leaf.opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
      pointerEvents="none"
    >
      {renderLeafSvg()}
    </Animated.View>
  );
}

export function AutumnThemeBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Warm Autumn Sunset Gradient Sky */}
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="autumnSkyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop
              offset="0%"
              stopColor={stitchTokens.autumnSkyPeach}
              stopOpacity="1"
            />
            <Stop
              offset="18%"
              stopColor={stitchTokens.autumnAmberGlow}
              stopOpacity="0.85"
            />
            <Stop
              offset="45%"
              stopColor={stitchTokens.amberBg}
              stopOpacity="0.6"
            />
            <Stop
              offset="75%"
              stopColor={stitchTokens.creamBg}
              stopOpacity="0.9"
            />
            <Stop
              offset="100%"
              stopColor={stitchTokens.autumnSoftSun}
              stopOpacity="1"
            />
          </LinearGradient>

          {/* Gentle Warm Sun Bokeh 1 */}
          <LinearGradient
            id="autumnSunGlow"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <Stop
              offset="0%"
              stopColor={stitchTokens.autumnWarmOrange}
              stopOpacity="0.22"
            />
            <Stop
              offset="100%"
              stopColor={stitchTokens.autumnGinkgoGold}
              stopOpacity="0"
            />
          </LinearGradient>

          {/* Ambient Warm Bokeh 2 */}
          <LinearGradient
            id="autumnPeachGlow"
            x1="100%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <Stop
              offset="0%"
              stopColor={stitchTokens.autumnLeafRust}
              stopOpacity="0.14"
            />
            <Stop
              offset="100%"
              stopColor={stitchTokens.peachLight}
              stopOpacity="0"
            />
          </LinearGradient>
        </Defs>

        {/* Base Atmospheric Canvas */}
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="url(#autumnSkyGrad)"
        />

        {/* Soft Golden Sun Orb in Top-Right */}
        <Circle
          cx="82%"
          cy="9%"
          r={120}
          fill="url(#autumnSunGlow)"
        />

        {/* Soft Peach Atmosphere in Mid-Left */}
        <Circle
          cx="12%"
          cy="48%"
          r={140}
          fill="url(#autumnPeachGlow)"
        />

        {/* Subtle Decorative Autumn Top Branch Silhouette (Left Corner) */}
        <G opacity="0.35">
          <Path
            d="M-20 -10 C20 15 60 20 110 12 C140 8 165 -5 180 -25"
            stroke={stitchTokens.autumnChestnutBrown}
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M35 16 C45 32 60 40 75 42"
            stroke={stitchTokens.autumnChestnutBrown}
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M80 14 C95 26 115 30 130 31"
            stroke={stitchTokens.autumnChestnutBrown}
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          {/* Branch Maple Leaf Clusters */}
          <G transform="translate(68, 36) rotate(35) scale(0.24)">
            <Path
              d="M50 5 L55 22 L67 15 L64 30 L80 28 L72 42 L88 48 L76 60 L85 70 L66 69 L63 80 L52 74 L50 95 L48 74 L37 80 L34 69 L15 70 L24 60 L12 48 L28 42 L20 28 L36 30 L33 15 L45 22 Z"
              fill={stitchTokens.autumnMapleRed}
            />
          </G>
          <G transform="translate(125, 26) rotate(-20) scale(0.22)">
            <Path
              d="M50 5 L55 22 L67 15 L64 30 L80 28 L72 42 L88 48 L76 60 L85 70 L66 69 L63 80 L52 74 L50 95 L48 74 L37 80 L34 69 L15 70 L24 60 L12 48 L28 42 L20 28 L36 30 L33 15 L45 22 Z"
              fill={stitchTokens.autumnWarmOrange}
            />
          </G>
          <G transform="translate(160, 4) rotate(45) scale(0.19)">
            <Path
              d="M50 5 L55 22 L67 15 L64 30 L80 28 L72 42 L88 48 L76 60 L85 70 L66 69 L63 80 L52 74 L50 95 L48 74 L37 80 L34 69 L15 70 L24 60 L12 48 L28 42 L20 28 L36 30 L33 15 L45 22 Z"
              fill={stitchTokens.autumnGinkgoGold}
            />
          </G>
        </G>
      </Svg>

      {/* Layer of Falling Autumn Leaves fluttering down with wind */}
      {LEAVES_DATA.map((leaf) => (
        <AnimatedFallingLeaf key={leaf.id} leaf={leaf} />
      ))}
    </View>
  );
}
