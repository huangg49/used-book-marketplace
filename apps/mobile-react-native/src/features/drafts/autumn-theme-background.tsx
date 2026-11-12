import React from "react";
import { StyleSheet, View } from "react-native";
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

// Reusable SVG Leaf Shapes (viewBox 0 0 100 100)
const MAPLE_PATH =
  "M50 5 L55 22 L67 15 L64 30 L80 28 L72 42 L88 48 L76 60 L85 70 L66 69 L63 80 L52 74 L50 95 L48 74 L37 80 L34 69 L15 70 L24 60 L12 48 L28 42 L20 28 L36 30 L33 15 L45 22 Z";

const GINKGO_FAN_PATH =
  "M50 78 C35 78 20 62 14 44 C8 26 26 12 48 18 C50 19 50 19 52 18 C74 12 92 26 86 44 C80 62 65 78 50 78 Z";

const OAK_PATH =
  "M50 8 C58 14 62 20 59 27 C68 28 72 36 67 44 C76 47 77 56 70 64 C76 71 70 80 57 82 L52 96 L48 96 L43 82 C30 80 24 71 30 64 C23 56 24 47 33 44 C28 36 32 28 41 27 C38 20 42 14 50 8 Z";

const ELM_PATH =
  "M50 6 C66 22 74 48 64 74 C58 84 52 88 50 92 C48 88 42 84 36 74 C26 48 34 22 50 6 Z";

export function AutumnThemeBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Warm Autumn Sunset Gradient Sky & Static Autumn Leaf Scenery */}
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        preserveAspectRatio="none"
      >
        <Defs>
          {/* Main Autumn Sky Gradient */}
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

          {/* Gentle Warm Sun Bokeh (Top-Right) */}
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

          {/* Soft Peach Atmosphere (Mid-Left) */}
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

        {/* === STATIC AUTUMN FOLIAGE (NO ANIMATION) === */}

        {/* Top-Left Autumn Branch & Leaf Cluster */}
        <G opacity="0.45">
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
          {/* Leaves on Branch */}
          <G transform="translate(68, 36) rotate(35) scale(0.26)">
            <Path d={MAPLE_PATH} fill={stitchTokens.autumnMapleRed} />
          </G>
          <G transform="translate(125, 26) rotate(-20) scale(0.24)">
            <Path d={MAPLE_PATH} fill={stitchTokens.autumnWarmOrange} />
          </G>
          <G transform="translate(160, 4) rotate(45) scale(0.20)">
            <Path d={GINKGO_FAN_PATH} fill={stitchTokens.autumnGinkgoGold} />
          </G>
          <G transform="translate(25, 22) rotate(-15) scale(0.22)">
            <Path d={OAK_PATH} fill={stitchTokens.autumnLeafRust} />
          </G>
        </G>

        {/* Top-Right Ambient Ginkgo Leaf */}
        <G transform="translate(320, 20) rotate(25) scale(0.28)" opacity="0.38">
          <Path d={GINKGO_FAN_PATH} fill={stitchTokens.autumnGinkgoGold} />
        </G>
        <G transform="translate(355, 55) rotate(-35) scale(0.22)" opacity="0.32">
          <Path d={MAPLE_PATH} fill={stitchTokens.autumnWarmOrange} />
        </G>

        {/* Left Margin Static Leaves (positioned outside main content flow) */}
        <G transform="translate(10, 210) rotate(-28) scale(0.28)" opacity="0.35">
          <Path d={MAPLE_PATH} fill={stitchTokens.autumnWarmOrange} />
        </G>
        <G transform="translate(18, 380) rotate(42) scale(0.24)" opacity="0.30">
          <Path d={GINKGO_FAN_PATH} fill={stitchTokens.autumnLeafGold} />
        </G>
        <G transform="translate(8, 560) rotate(-18) scale(0.26)" opacity="0.28">
          <Path d={OAK_PATH} fill={stitchTokens.autumnLeafRust} />
        </G>

        {/* Right Margin Static Leaves */}
        <G transform="translate(340, 260) rotate(32) scale(0.26)" opacity="0.35">
          <Path d={GINKGO_FAN_PATH} fill={stitchTokens.autumnGinkgoGold} />
        </G>
        <G transform="translate(330, 440) rotate(-40) scale(0.25)" opacity="0.30">
          <Path d={MAPLE_PATH} fill={stitchTokens.autumnMapleRed} />
        </G>
        <G transform="translate(345, 620) rotate(15) scale(0.24)" opacity="0.25">
          <Path d={ELM_PATH} fill={stitchTokens.autumnWarmOrange} />
        </G>

        {/* Subtle Bottom Ambient Leaf Accent */}
        <G transform="translate(280, 750) rotate(-22) scale(0.22)" opacity="0.22">
          <Path d={GINKGO_FAN_PATH} fill={stitchTokens.autumnLeafGold} />
        </G>
      </Svg>
    </View>
  );
}
