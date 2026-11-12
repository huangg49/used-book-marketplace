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
import {
  ELM_PATH,
  GINKGO_FAN_PATH,
  MAPLE_PATH,
  OAK_PATH,
} from "./autumn-theme-background";

/**
 * Autumn Draft Background (Style 2 - "Gió Thu Cuốn Lá & Bụi Nắng")
 *
 * Designed specifically for the book creation flow (DraftEditor):
 * - Atmospheric autumn breeze curves replacing the branch from Style 1
 * - Golden Ginkgo and Scarlet Maple flurries drifting gracefully down margins
 * - Gentle corner leaf drifts anchoring the top and footer without obscuring form fields
 * - Warm honey-amber sunlight gradient with subtle floating dust specks
 */
export function AutumnDraftBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        preserveAspectRatio="none"
      >
        <Defs>
          {/* Main Autumn Sky Gradient (Soft Honey & Sunset Peach) */}
          <LinearGradient
            id="draftSkyGrad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <Stop
              offset="0%"
              stopColor={stitchTokens.autumnSkyPeach}
              stopOpacity="0.95"
            />
            <Stop
              offset="22%"
              stopColor={stitchTokens.autumnAmberGlow}
              stopOpacity="0.75"
            />
            <Stop
              offset="50%"
              stopColor={stitchTokens.creamBg}
              stopOpacity="0.9"
            />
            <Stop
              offset="80%"
              stopColor={stitchTokens.autumnSoftSun}
              stopOpacity="0.8"
            />
            <Stop
              offset="100%"
              stopColor={stitchTokens.autumnSkyPeach}
              stopOpacity="1"
            />
          </LinearGradient>

          {/* Golden Sunbeam Glow (Top-Left) */}
          <LinearGradient
            id="draftSunbeamGlow"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <Stop
              offset="0%"
              stopColor={stitchTokens.autumnGinkgoGold}
              stopOpacity="0.22"
            />
            <Stop
              offset="100%"
              stopColor={stitchTokens.autumnWarmOrange}
              stopOpacity="0"
            />
          </LinearGradient>

          {/* Warm Rose Amber Glow (Bottom-Right) */}
          <LinearGradient
            id="draftSunsetGlow"
            x1="100%"
            y1="100%"
            x2="0%"
            y2="0%"
          >
            <Stop
              offset="0%"
              stopColor={stitchTokens.autumnMapleRed}
              stopOpacity="0.16"
            />
            <Stop
              offset="100%"
              stopColor={stitchTokens.autumnAmberGlow}
              stopOpacity="0"
            />
          </LinearGradient>
        </Defs>

        {/* Base Gradient Canvas */}
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="url(#draftSkyGrad)"
        />

        {/* Soft Golden Sunbeam in Top-Left */}
        <Circle
          cx="12%"
          cy="8%"
          r={130}
          fill="url(#draftSunbeamGlow)"
        />

        {/* Soft Sunset Warmth in Bottom-Right */}
        <Circle
          cx="88%"
          cy="92%"
          r={150}
          fill="url(#draftSunsetGlow)"
        />

        {/* === FLOWING BREEZE CURVES (GIÓ THU LƯỚT NHẸ) === */}
        {/* Top Breeze Line Sweeping across upper margin */}
        <Path
          d="M-30 65 C60 95 130 45 220 70 C310 95 365 55 435 80"
          stroke={stitchTokens.autumnWarmOrange}
          strokeWidth="1.4"
          strokeDasharray="6 8"
          strokeLinecap="round"
          fill="none"
          opacity="0.22"
        />

        {/* Secondary Upper Wind Gust */}
        <Path
          d="M-20 120 C50 145 110 110 180 130 C250 150 320 125 420 145"
          stroke={stitchTokens.autumnGinkgoGold}
          strokeWidth="1.0"
          strokeDasharray="4 6"
          strokeLinecap="round"
          fill="none"
          opacity="0.18"
        />

        {/* Left Margin Descending Breeze */}
        <Path
          d="M-15 240 C35 290 30 380 -10 440 C-30 490 35 560 -5 630"
          stroke={stitchTokens.autumnGinkgoGold}
          strokeWidth="1.3"
          strokeDasharray="5 7"
          strokeLinecap="round"
          fill="none"
          opacity="0.22"
        />

        {/* Right Margin Flowing Breeze */}
        <Path
          d="M410 180 C345 260 365 370 330 470 C300 560 360 670 335 770"
          stroke={stitchTokens.autumnLeafRust}
          strokeWidth="1.2"
          strokeDasharray="6 8"
          strokeLinecap="round"
          fill="none"
          opacity="0.2"
        />

        {/* Bottom Ambient Ground Breeze */}
        <Path
          d="M-30 780 C80 810 170 765 270 795 C360 820 405 780 440 805"
          stroke={stitchTokens.autumnAmberGlow}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.28"
        />

        {/* === FLOATING AUTUMN LEAVES ALONG BREEZE TRAILS === */}

        {/* Top-Right Swirling Leaf Cluster (Entering with breeze) */}
        <G transform="translate(325, 45) rotate(42) scale(0.28)" opacity="0.42">
          <Path d={GINKGO_FAN_PATH} fill={stitchTokens.autumnGinkgoGold} />
        </G>
        <G transform="translate(365, 80) rotate(-28) scale(0.22)" opacity="0.36">
          <Path d={MAPLE_PATH} fill={stitchTokens.autumnWarmOrange} />
        </G>
        <G transform="translate(345, 125) rotate(65) scale(0.19)" opacity="0.3">
          <Path d={ELM_PATH} fill={stitchTokens.autumnMapleRed} />
        </G>

        {/* Top-Left Gentle Leaf Flutter (Near back button / header) */}
        <G transform="translate(18, 55) rotate(-32) scale(0.25)" opacity="0.4">
          <Path d={MAPLE_PATH} fill={stitchTokens.autumnMapleRed} />
        </G>
        <G transform="translate(48, 25) rotate(18) scale(0.20)" opacity="0.32">
          <Path d={GINKGO_FAN_PATH} fill={stitchTokens.autumnLeafGold} />
        </G>

        {/* Left Margin Drifting Leaves (Along content borders) */}
        <G transform="translate(8, 260) rotate(38) scale(0.24)" opacity="0.35">
          <Path d={OAK_PATH} fill={stitchTokens.autumnLeafRust} />
        </G>
        <G transform="translate(14, 430) rotate(-42) scale(0.22)" opacity="0.32">
          <Path d={MAPLE_PATH} fill={stitchTokens.autumnWarmOrange} />
        </G>
        <G transform="translate(6, 610) rotate(22) scale(0.24)" opacity="0.3">
          <Path d={GINKGO_FAN_PATH} fill={stitchTokens.autumnGinkgoGold} />
        </G>

        {/* Right Margin Drifting Leaves */}
        <G transform="translate(340, 270) rotate(-36) scale(0.26)" opacity="0.35">
          <Path d={GINKGO_FAN_PATH} fill={stitchTokens.autumnGinkgoGold} />
        </G>
        <G transform="translate(348, 450) rotate(52) scale(0.23)" opacity="0.32">
          <Path d={ELM_PATH} fill={stitchTokens.autumnMapleRed} />
        </G>
        <G transform="translate(335, 630) rotate(-18) scale(0.25)" opacity="0.28">
          <Path d={OAK_PATH} fill={stitchTokens.autumnLeafRust} />
        </G>

        {/* Bottom-Left Resting Leaves Cluster */}
        <G transform="translate(10, 770) rotate(24) scale(0.28)" opacity="0.36">
          <Path d={MAPLE_PATH} fill={stitchTokens.autumnMapleRed} />
        </G>
        <G transform="translate(38, 800) rotate(-35) scale(0.23)" opacity="0.32">
          <Path d={GINKGO_FAN_PATH} fill={stitchTokens.autumnGinkgoGold} />
        </G>
        <G transform="translate(68, 825) rotate(60) scale(0.18)" opacity="0.26">
          <Path d={OAK_PATH} fill={stitchTokens.autumnChestnutBrown} />
        </G>

        {/* Bottom-Right Resting Leaves Cluster */}
        <G transform="translate(315, 785) rotate(32) scale(0.27)" opacity="0.36">
          <Path d={GINKGO_FAN_PATH} fill={stitchTokens.autumnGinkgoGold} />
        </G>
        <G transform="translate(345, 815) rotate(-16) scale(0.23)" opacity="0.32">
          <Path d={MAPLE_PATH} fill={stitchTokens.autumnWarmOrange} />
        </G>

        {/* === AMBIENT FLOATING SUNLIGHT PARTICLES (BỤI NẮNG THU) === */}
        <Circle cx="78" cy="85" r={2.5} fill={stitchTokens.autumnGinkgoGold} opacity="0.35" />
        <Circle cx="310" cy="110" r={2} fill={stitchTokens.autumnWarmOrange} opacity="0.3" />
        <Circle cx="35" cy="210" r={1.8} fill={stitchTokens.autumnGinkgoGold} opacity="0.28" />
        <Circle cx="345" cy="360" r={2.2} fill={stitchTokens.autumnAmberGlow} opacity="0.32" />
        <Circle cx="22" cy="510" r={2} fill={stitchTokens.autumnGinkgoGold} opacity="0.25" />
        <Circle cx="355" cy="560" r={1.6} fill={stitchTokens.autumnWarmOrange} opacity="0.25" />
        <Circle cx="45" cy="710" r={2.4} fill={stitchTokens.autumnAmberGlow} opacity="0.3" />
        <Circle cx="320" cy="740" r={2} fill={stitchTokens.autumnGinkgoGold} opacity="0.3" />
      </Svg>
    </View>
  );
}

