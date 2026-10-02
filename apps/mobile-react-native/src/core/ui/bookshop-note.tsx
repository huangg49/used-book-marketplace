import { useContext } from "react";
import { View, useWindowDimensions } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { AppText, TextScale } from "./text";
import { colors, radius, space } from "./theme";
import { useHydratedViewport } from "./hydration";

/** Editorial copy, not a promotion or a claim about any listing. */
export function BookshopNote() {
  const { width, fontScale } = useWindowDimensions();
  const scale = useContext(TextScale);
  const hydrated = useHydratedViewport();
  const showIllustration = hydrated && width >= 360 && fontScale * scale < 1.29;
  return (
    <View
      style={{
        backgroundColor: colors.forest,
        borderRadius: radius.small,
        padding: space.lg,
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: space.sm }}>
        <AppText
          kind="bookHeading"
          color={colors.paper}
          accessibilityRole="header"
        >
          Đọc xong. Chuyền tay.
        </AppText>
        <AppText kind="annotation" color={colors.paper}>
          Xem bìa, đọc tình trạng, chọn cuốn hợp mình.
        </AppText>
      </View>
      {showIllustration && (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Svg width={76} height={92} viewBox="0 0 76 92" aria-hidden>
            <Rect
              x={4}
              y={22}
              width={15}
              height={65}
              rx={2}
              fill={colors.paper}
            />
            <Rect
              x={23}
              y={8}
              width={22}
              height={79}
              rx={2}
              fill={colors.leaf}
            />
            <Rect
              x={49}
              y={30}
              width={22}
              height={57}
              rx={2}
              fill={colors.paper}
            />
            <Path
              d="M8 32h7M8 36h7M8 76h7M28 20h12M28 25h12M54 41h12M54 45h12M54 76h12"
              stroke={colors.forest}
              strokeWidth={1.5}
            />
            <Path d="M30 8h8v33l-4-4-4 4Z" fill={colors.terracotta} />
            <Path d="M1 90h74" stroke={colors.paper} strokeWidth={1.5} />
          </Svg>
        </View>
      )}
    </View>
  );
}
