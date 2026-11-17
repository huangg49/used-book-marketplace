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
import { stitchTokens } from "../../../core/ui";

export function MyAuctionsBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        preserveAspectRatio="none"
      >
        <Defs>
          {/* Main Royal Parchment & Warm Amber Sky Gradient */}
          <LinearGradient id="myAuctionsBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop
              offset="0%"
              stopColor={stitchTokens.autumnSkyPeach}
              stopOpacity="1"
            />
            <Stop
              offset="22%"
              stopColor={stitchTokens.autumnAmberGlow}
              stopOpacity="0.75"
            />
            <Stop
              offset="50%"
              stopColor={stitchTokens.creamBg}
              stopOpacity="0.85"
            />
            <Stop
              offset="100%"
              stopColor={stitchTokens.parchment}
              stopOpacity="0.95"
            />
          </LinearGradient>

          {/* Golden Auction Spotlight Glow (Top-Right) */}
          <LinearGradient
            id="spotlightGlow"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <Stop
              offset="0%"
              stopColor={stitchTokens.goldAccent}
              stopOpacity="0.25"
            />
            <Stop
              offset="100%"
              stopColor={stitchTokens.autumnGinkgoGold}
              stopOpacity="0"
            />
          </LinearGradient>

          {/* Crimson Velvet Atmosphere (Mid-Left) */}
          <LinearGradient
            id="crimsonVelvetGlow"
            x1="100%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <Stop
              offset="0%"
              stopColor={stitchTokens.wine}
              stopOpacity="0.08"
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
          fill="url(#myAuctionsBgGrad)"
        />

        {/* Top-Right Golden Auction Spotlight Orb */}
        <Circle
          cx="88%"
          cy="12%"
          r={130}
          fill="url(#spotlightGlow)"
        />

        {/* Mid-Left Soft Wine Glow */}
        <Circle
          cx="10%"
          cy="42%"
          r={160}
          fill="url(#crimsonVelvetGlow)"
        />

        {/* Decorative Heraldic Book & Gavel Stamp Silhouette (Top-Right) */}
        <G transform="translate(300, 30) scale(0.7)" opacity="0.12">
          {/* Circular Seal */}
          <Circle
            cx="50"
            cy="50"
            r="42"
            stroke={stitchTokens.wine}
            strokeWidth="2"
            strokeDasharray="4,3"
            fill="none"
          />
          {/* Inner Seal Circle */}
          <Circle
            cx="50"
            cy="50"
            r="36"
            stroke={stitchTokens.wine}
            strokeWidth="1.2"
            fill="none"
          />
          {/* Crossed Gavel & Quill Silhouette */}
          <Path
            d="M32 68 L68 32 M44 26 L56 38 M26 44 L38 56 M48 48 L65 31"
            stroke={stitchTokens.wine}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </G>

        {/* Decorative Watermark Waves at Bottom */}
        <G opacity="0.15">
          <Path
            d="M0 680 C100 660, 200 700, 300 675 C350 662, 400 670, 450 665 L450 900 L0 900 Z"
            fill={stitchTokens.peachBorder}
          />
        </G>
      </Svg>
    </View>
  );
}

