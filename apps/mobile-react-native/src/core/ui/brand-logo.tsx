import { Image } from "expo-image";
export function BrandLogo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Image
      source={
        inverse
          ? require("../../../../../packages/brand/logos/lat-lai-horizontal-white.png")
          : require("../../../../../packages/brand/logos/lat-lai-horizontal-primary.png")
      }
      style={{ width: 142, height: 46 }}
      contentFit="contain"
      accessible
      accessibilityLabel="Lật lại"
    />
  );
}
