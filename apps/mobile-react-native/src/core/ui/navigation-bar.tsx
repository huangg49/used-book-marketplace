import { useState } from "react";
import { Pressable, View } from "react-native";
import { Icon, type IconName } from "./icon";
import { AppText } from "./text";
import { colorRoles, metrics, radius, space } from "./theme";

import { stitchTokens } from "./theme";

type Destination<Key extends string> = {
  key: Key;
  title: string;
  accessibilityLabel?: string;
  icon: IconName;
  primaryAction?: boolean;
  badge?: boolean | string | number;
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
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.xs }}>
      {destinations.map((destination) => {
        const selected = destination.key === current;
        if (destination.primaryAction) {
          return (
            <Pressable
              key={destination.key}
              accessibilityRole="button"
              accessibilityLabel={
                destination.accessibilityLabel ?? destination.title
              }
              onPress={() => onSelect(destination.key)}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingBottom: space.xs,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 25,
                  backgroundColor: stitchTokens.gold,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.25,
                  shadowRadius: 5,
                  elevation: 6,
                  borderWidth: 3,
                  borderColor: stitchTokens.wineDark,
                  marginBottom: 2,
                }}
              >
                <Icon name={destination.icon} size={24} color={stitchTokens.wineDark} />
              </View>
              <AppText
                kind="navigationLabel"
                color={stitchTokens.wine}
                style={{ textAlign: "center", fontSize: 11 }}
              >
                {destination.title}
              </AppText>
            </Pressable>
          );
        }
        const foreground = selected
          ? colorRoles.navigationSelectedText
          : colorRoles.navigationText;

        return (
          <Pressable
            key={destination.key}
            accessibilityRole="tab"
            accessibilityLabel={
              destination.accessibilityLabel ?? destination.title
            }
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
              paddingHorizontal: space.xs,
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
            <View style={{ position: "relative" }}>
              <Icon name={destination.icon} size={22} color={foreground} />
              {destination.badge ? (
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: stitchTokens.flashRed,
                  }}
                />
              ) : null}
            </View>
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
