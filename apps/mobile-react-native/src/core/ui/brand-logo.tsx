import { Image } from "expo-image";
export function BrandLogo() {
  return (
    <Image
      source={require("../../../../../packages/brand/logos/lat-lai-horizontal-primary.png")}
      style={{ width: 142, height: 46 }}
      contentFit="contain"
      accessible
      accessibilityLabel="Lật lại"
    />
  );
}
