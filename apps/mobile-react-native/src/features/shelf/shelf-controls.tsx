import { View } from "react-native";
import {
  AppText,
  BrandLogo,
  Icon,
  colors,
  metrics,
  space,
} from "../../core/ui";

export function ShelfHeader({ inverse = false }: { inverse?: boolean }) {
  return (
    <View style={{ backgroundColor: inverse ? colors.forest : undefined }}>
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
        <BrandLogo inverse={inverse} />
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}
        >
          <Icon
            name="pin"
            size={16}
            color={inverse ? colors.paper : colors.forest}
          />
          <AppText kind="small" color={inverse ? colors.paper : colors.forest}>
            TP. Hồ Chí Minh
          </AppText>
        </View>
      </View>
    </View>
  );
}
