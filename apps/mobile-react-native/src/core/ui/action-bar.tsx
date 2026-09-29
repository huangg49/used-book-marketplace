import { Children, isValidElement, type PropsWithChildren } from "react";
import { View } from "react-native";
import { AppText } from "./text";
import { colors, space } from "./theme";

// Actions for Screen.footer: equal widths in reading order (secondary first, primary
// last, under the thumb) and an optional status line such as unsaved changes.
export function ActionBar({
  note,
  children,
}: PropsWithChildren<{ note?: string }>) {
  const actions = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ gap: space.sm }}>
      {note ? (
        <AppText kind="small" color={colors.muted}>
          {note}
        </AppText>
      ) : null}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {actions.map((action) => (
          <View key={action.key} style={{ flex: 1 }}>
            {action}
          </View>
        ))}
      </View>
    </View>
  );
}
