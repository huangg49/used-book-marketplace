import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText, Icon, colors, layout, metrics, space } from "../../core/ui";

export type StepState = "done" | "missing" | "review";

// Jumps between editor groups; status text comes from entered data, not visits.
export function StepNav({
  labels,
  current,
  states,
  disabled,
  onSelect,
}: {
  labels: readonly string[];
  current: number;
  states: readonly StepState[];
  disabled: boolean;
  onSelect: (step: number) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: "row", gap: space.sm }}
    >
      {labels.map((label, i) => (
        <Step
          key={label}
          index={i}
          label={label}
          selected={i === current}
          state={states[i]}
          disabled={disabled}
          onPress={() => onSelect(i)}
        />
      ))}
    </View>
  );
}

const status: Record<StepState, string> = {
  done: "Đã đủ",
  missing: "Còn thiếu",
  review: "Xem lại",
};

function Step({
  index,
  label,
  selected,
  state,
  disabled,
  onPress,
}: {
  index: number;
  label: string;
  selected: boolean;
  state: StepState;
  disabled: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={`Bước ${index + 1}: ${label}, ${status[state].toLocaleLowerCase("vi")}`}
      accessibilityState={{ selected, disabled }}
      aria-selected={selected}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        {
          flex: 1,
          minHeight: metrics.touch,
          gap: space.xs,
          paddingTop: space.sm,
          borderTopWidth: selected ? 3 : 1,
          borderColor: selected ? colors.forest : colors.border,
        },
        focused && layout.focus,
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.8 },
      ]}
    >
      <AppText kind="label" color={selected ? colors.forest : colors.muted}>
        {index + 1}. {label}
      </AppText>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
        {state === "done" ? (
          <Icon name="check" size={14} color={colors.success} />
        ) : null}
        <AppText
          kind="small"
          color={state === "missing" ? colors.rustText : colors.muted}
          style={{ flexShrink: 1 }}
        >
          {status[state]}
        </AppText>
      </View>
    </Pressable>
  );
}
