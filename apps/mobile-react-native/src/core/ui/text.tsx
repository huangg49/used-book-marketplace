import { createContext, useContext } from "react";
import { Platform, Text, useWindowDimensions, type TextProps } from "react-native";
import { colors as c, typography as types } from "./theme";
export const TextScale = createContext(1);
export function AppText({
  kind = "body",
  color = c.ink,
  style,
  ...props
}: TextProps & { kind?: keyof typeof types; color?: string }) {
  const scale = useContext(TextScale);
  const { fontScale } = useWindowDimensions();
  const [size, height, font] = types[kind];
  return (
    <Text
      // Fabric can retain the old intrinsic text size after Android font changes.
      // Recreate only the text leaf; form state, inputs and navigation stay mounted.
      key={Platform.OS === "android" ? fontScale : undefined}
      {...props}
      style={[
        {
          fontFamily: font,
          fontSize: size * scale,
          lineHeight: height * scale,
          color,
        },
        style,
      ]}
    />
  );
}
