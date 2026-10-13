import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText as T } from "./text";
import { Icon, type IconName } from "./icon";
import { colors as c, metrics, space } from "./theme";
import { layout as s } from "./styles";

// Navigation supplied by the screen; keep it visually distinct from a form action.
export function BackAction({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        {
          alignSelf: "flex-start",
          maxWidth: "100%",
          minHeight: metrics.touch,
          minWidth: metrics.touch,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          paddingVertical: space.sm,
          paddingRight: space.md,
        },
        focused && s.focus,
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.8 },
      ]}
    >
      <View style={{ width: 20, flexShrink: 0 }}>
        <Icon name="back" size={20} color="#5C0202" />
      </View>
      <T kind="bold" color="#5C0202" style={{ flexShrink: 1 }}>
        {title}
      </T>
    </Pressable>
  );
}
export function ActionRow({
  title,
  description,
  icon,
  onPress,
}: {
  title: string;
  description: string;
  icon: IconName;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        s.row,
        {
          minHeight: metrics.control,
          paddingVertical: space.lg,
          borderBottomWidth: 1,
          borderColor: c.rule,
          opacity: pressed ? 0.7 : 1,
        },
        focused && s.focus,
      ]}
    >
      <View
        style={{
          backgroundColor: c.successSurface,
          padding: space.md,
          borderRadius: 8,
        }}
      >
        <Icon name={icon} />
      </View>
      <View style={{ flex: 1, gap: space.xs }}>
        <T kind="bold" color={c.forest}>
          {title}
        </T>
        <T kind="small" color={c.muted}>
          {description}
        </T>
      </View>
      <Icon name="arrow" size={18} />
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  selected = false,
  disabled = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        s.iconButton,
        focused && s.focus,
        disabled && { opacity: 0.5 },
        { backgroundColor: pressed ? c.leaf : c.surface },
      ]}
    >
      <Icon name={name} filled={selected} />
    </Pressable>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
  destructive = false,
  selected,
  wine = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  destructive?: boolean;
  selected?: boolean;
  wine?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? `${title}, đang xử lý` : title}
      accessibilityState={{ disabled: disabled || busy, busy, selected }}
      aria-pressed={selected}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        wine && { backgroundColor: "#5C0202" },
        secondary && s.secondary,
        destructive && { backgroundColor: c.error, borderColor: c.error },
        focused && s.focus,
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {busy ? (
          <ActivityIndicator
            color={
              secondary && !destructive
                ? "#5C0202"
                : wine
                  ? "#FFDF97"
                  : c.paper
            }
          />
        ) : null}
        <T
          kind="bold"
          color={
            secondary && !destructive
              ? "#5C0202"
              : wine
                ? "#FFDF97"
                : "#FFFFFF"
          }
          style={{ textAlign: "center", flexShrink: 1 }}
        >
          {title}
        </T>
      </View>
    </Pressable>
  );
}
export function Chip({
  title,
  selected,
  onPress,
  disabled = false,
  wine = false,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  wine?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const activeBg = wine ? "#5C0202" : c.forest;
  const activeColor = wine ? "#FFFFFF" : c.paper;
  const inactiveColor = wine ? "#57423E" : c.forest;
  const inactiveBorder = wine ? "#DEC0BB" : c.border;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        focused && s.focus,
        pressed && { opacity: 0.8 },
        {
          borderColor: selected ? activeBg : inactiveBorder,
          backgroundColor: selected ? activeBg : "#FAF7F2",
        },
        disabled && { opacity: 0.5 },
      ]}
    >
      <T
        kind="small"
        color={selected ? activeColor : inactiveColor}
        style={{ fontWeight: selected ? "700" : "500" }}
      >
        {title}
      </T>
    </Pressable>
  );
}
