import type { ReactNode } from "react";
import { Platform, Pressable, StatusBar, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./icon";
import { AppText } from "./text";
import { space, stitchTokens } from "./theme";

export interface WineHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  readonly backLabel?: string;
  readonly backDisabled?: boolean;
  readonly rightIcon?: IconName;
  readonly rightLabel?: string;
  readonly onRightPress?: () => void;
  readonly rightActive?: boolean;
  readonly right?: ReactNode;
}

export function WineHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Quay lại",
  backDisabled = false,
  rightIcon,
  rightLabel,
  onRightPress,
  rightActive = false,
  right,
}: WineHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View
        {...(Platform.OS === "web" ? { dataSet: { focusInverse: "true" } } : {})}
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top, 10) + 6 },
        ]}
      >
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            accessibilityState={{ disabled: backDisabled }}
            disabled={backDisabled}
            hitSlop={8}
            onPress={onBack}
            style={({ pressed }) => [
              styles.circleBtn,
              backDisabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Icon name="back" size={19} color={stitchTokens.white} />
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}

        <View style={styles.titleCol}>
          <AppText
            numberOfLines={1}
            accessibilityRole="header"
            style={styles.title}
          >
            {title}
          </AppText>
          {Boolean(subtitle) && (
            <AppText numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </AppText>
          )}
        </View>

        {right ? (
          right
        ) : rightIcon && onRightPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={rightLabel ?? "Thao tác"}
            hitSlop={8}
            onPress={onRightPress}
            style={({ pressed }) => [
              styles.circleBtn,
              rightActive && styles.circleBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Icon name={rightIcon} size={18} color={stitchTokens.gold} />
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: stitchTokens.wineDark,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 12,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: stitchTokens.whiteAlpha14,
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtnActive: {
    backgroundColor: stitchTokens.whiteAlpha25,
  },
  spacer: {
    width: 40,
    height: 40,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    color: stitchTokens.white,
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: stitchTokens.gold,
    fontWeight: "600",
    marginTop: 2,
    includeFontPadding: false,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.5,
  },
});
