import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  AppText,
  BrandLogo,
  Icon,
  colors,
  metrics,
  radius,
  space,
} from "../../core/ui";

export function ShelfHeader() {
  return (
    <View
      style={{
        paddingHorizontal: space.xl,
        paddingVertical: space.sm,
        maxWidth: metrics.content + space.xl * 2,
        width: "100%",
        alignSelf: "center",
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.sm,
      }}
    >
      <BrandLogo />
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}
      >
        <Icon name="pin" size={16} />
        <AppText kind="small" color={colors.forest}>
          TP. Hồ Chí Minh
        </AppText>
      </View>
    </View>
  );
}

// Brand illustration, not a cover, stock count or user-generated evidence.
export function PageTurn({ small = false }: { small?: boolean }) {
  return (
    <Svg
      width={small ? 64 : 96}
      height={small ? 72 : 108}
      viewBox="0 0 96 108"
      aria-hidden
    >
      <Path d="M8 27 43 34v64L8 88Z" fill={colors.paper} />
      <Path d="m48 34 39-8v63l-39 9Z" fill={colors.leaf} />
      <Path d="M48 34 72 8v65L48 98Z" fill={colors.terracotta} />
      <Path
        d="m16 43 19 4m-19 8 19 4m-19 8 19 4"
        stroke={colors.border}
        strokeWidth={2}
      />
    </Svg>
  );
}

export function ShelfStory() {
  return (
    <View
      style={{
        backgroundColor: colors.forest,
        borderRadius: radius.card,
        padding: space.lg,
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
      }}
    >
      <View style={{ flex: 1, gap: space.sm }}>
        <AppText kind="card" color={colors.paper}>
          Sách cũ. Chương mới.
        </AppText>
        <AppText kind="small" color={colors.leaf}>
          Đọc xong, chuyền tay.{"\n"}Để một câu chuyện đi tiếp.
        </AppText>
      </View>
      <PageTurn small />
    </View>
  );
}
