import { useState } from "react";
import { Pressable, View } from "react-native";
import { Icon, type IconName } from "./icon";
import { AppText } from "./text";
import { colorRoles, metrics, radius, space } from "./theme";

type Destination<Key extends string> = {
  key: Key;
  title: string;
  icon: IconName;
};

// Presentation only: the caller owns routes, permissions and selection.
// Screen owns the safe area; adding a bottom inset here would count it twice.
export function NavigationBar<Key extends string>({
  destinations,
  current,
  onSelect,
}: {
  destinations: readonly Destination<Key>[];
  current: Key;
  onSelect: (key: Key) => void;
}) {
  const [focused, setFocused] = useState<Key>();
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      {destinations.map((destination) => {
        const selected = destination.key === current;
        const foreground = selected
          ? colorRoles.navigationSelectedText
          : colorRoles.navigationText;
        return (
          <Pressable
            key={destination.key}
            accessibilityRole="tab"
            accessibilityLabel={destination.title}
            accessibilityState={{ selected }}
            aria-selected={selected}
            onFocus={() => setFocused(destination.key)}
            onBlur={() => setFocused(undefined)}
            onPress={() => {
              if (!selected) onSelect(destination.key);
            }}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              minHeight: metrics.control,
              alignItems: "center",
              justifyContent: "center",
              gap: space.xs,
              paddingHorizontal: space.sm,
              paddingVertical: space.sm,
              borderRadius: radius.control,
              borderWidth: 2,
              borderColor:
                focused === destination.key
                  ? selected
                    ? colorRoles.navigationSelectedText
                    : colorRoles.navigationFocus
                  : "transparent",
              backgroundColor: selected
                ? colorRoles.navigationSelected
                : "transparent",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name={destination.icon} size={22} color={foreground} />
            <AppText
              kind="navigationLabel"
              color={foreground}
              style={{ textAlign: "center", alignSelf: "stretch" }}
            >
              {destination.title}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
