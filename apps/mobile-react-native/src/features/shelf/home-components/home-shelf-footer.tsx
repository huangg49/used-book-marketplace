import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  AppText,
  Icon,
  layout,
  space,
  stitchTokens,
  type IconName,
} from "../../../core/ui";

export function HomeShelfFooter({
  page,
  fetching,
  onPrevious,
  onNext,
}: {
  page: number;
  fetching: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  if (!onPrevious && !onNext) return null;

  return (
    <View style={styles.section}>
      <View style={styles.pagination}>
        <ShelfControl
          label="Trước"
          accessibilityLabel="Trang trước"
          icon="chevronLeft"
          onPress={onPrevious}
          busy={fetching}
        />
        <View style={styles.pageIndicator}>
          <AppText
            kind="small"
            accessibilityLiveRegion="polite"
            color={stitchTokens.wineDark}
            style={styles.page}
          >
            Trang {page}
          </AppText>
        </View>
        <ShelfControl
          label="Tiếp"
          accessibilityLabel="Trang tiếp"
          icon="chevronRight"
          onPress={onNext}
          busy={fetching}
          next
        />
      </View>
    </View>
  );
}

function ShelfControl({
  label,
  accessibilityLabel,
  icon,
  onPress,
  busy,
  next = false,
}: {
  label: string;
  accessibilityLabel: string;
  icon: IconName;
  onPress?: () => void;
  busy: boolean;
  next?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const disabled = !onPress || busy;
  const solid = next && Boolean(onPress);
  const enabledSecondary = !next && Boolean(onPress);
  const color = solid ? stitchTokens.white : stitchTokens.wine;
  const iconColor = solid ? stitchTokens.gold : stitchTokens.wine;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.control,
        next && styles.next,
        enabledSecondary && styles.secondaryEnabled,
        solid && styles.solid,
        focused && layout.focus,
        focused && solid && styles.solidFocus,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Icon name={icon} size={15} color={iconColor} />
      <AppText
        kind="small"
        color={color}
        numberOfLines={1}
        style={styles.controlText}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.whiteSurface,
    padding: 4,
    gap: 2,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  pageIndicator: {
    minWidth: 78,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  page: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  control: {
    minHeight: 40,
    minWidth: 94,
    borderRadius: 999,
    backgroundColor: "transparent",
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  secondaryEnabled: {
    backgroundColor: stitchTokens.wineAlpha05,
  },
  controlText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    textAlign: "center",
    includeFontPadding: false,
  },
  next: {
    flexDirection: "row-reverse",
  },
  solid: {
    backgroundColor: stitchTokens.wine,
  },
  solidFocus: {
    boxShadow: `inset 0 0 0 2px ${stitchTokens.white}`,
  },
  disabled: {
    opacity: 0.36,
  },
  pressed: {
    opacity: 0.78,
  },
});
