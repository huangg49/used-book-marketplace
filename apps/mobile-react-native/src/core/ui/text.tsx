import { createContext, useContext } from "react";
import { Text, type TextProps } from "react-native";
import { colors as c, typography as types } from "./theme";
export const TextScale = createContext(1);
export function AppText({
  kind = "body",
  color = c.ink,
  style,
  ...props
}: TextProps & { kind?: keyof typeof types; color?: string }) {
  const scale = useContext(TextScale);
  const [size, height, font] = types[kind];
  return (
    <Text
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
