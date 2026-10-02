import { useLayoutEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { AppText as T } from "./text";
import { IconButton } from "./actions";
import { layout as s } from "./styles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, colorRoles, space } from "./theme";
import { motion as motionTokens, useReducedMotion } from "./motion";
export function Sheet({
  title,
  visible,
  onClose,
  children,
  footer,
  dismissible = true,
  backdropDismiss = true,
  motion,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissible?: boolean;
  backdropDismiss?: boolean;
  motion?: "photo";
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(1));
  const wasVisible = useRef(false);
  const photoMotion = motion === "photo";
  useLayoutEffect(() => {
    const opening = visible && !wasVisible.current;
    wasVisible.current = visible;
    progress.stopAnimation();
    // Close immediately: the caller owns the image lifetime and native Back.
    // Resolving/changing the OS preference never replays an already open viewer.
    if (!photoMotion || !visible || reducedMotion || !opening) {
      progress.setValue(1);
    } else {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: motionTokens.duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }).start();
    }
    return () => progress.stopAnimation();
  }, [photoMotion, visible, reducedMotion, progress]);
  return (
    <Modal
      accessibilityLabel={title}
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => {
        if (dismissible) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={[s.scrim, photoMotion && { backgroundColor: "transparent" }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {photoMotion ? (
          <Animated.View
            accessible={false}
            importantForAccessibility="no"
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colorRoles.scrim, opacity: progress },
            ]}
          />
        ) : null}
        <Pressable
          style={StyleSheet.absoluteFill}
          accessible={false}
          importantForAccessibility="no"
          focusable={false}
          onPress={() => {
            if (dismissible && backdropDismiss) onClose();
          }}
        />
        <View
          accessibilityViewIsModal
          style={[
            s.sheet,
            {
              paddingBottom: Math.max(24, insets.bottom),
              paddingLeft: Math.max(24, insets.left),
              paddingRight: Math.max(24, insets.right),
            },
          ]}
        >
          <View style={[s.row, { flexShrink: 0 }]}>
            <T kind="card" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </T>
            <IconButton
              name="close"
              label="Đóng"
              disabled={!dismissible}
              onPress={onClose}
            />
          </View>
          <ScrollView
            style={{ flexShrink: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: space.lg, paddingBottom: space.sm }}
          >
            {photoMotion ? (
              <Animated.View
                style={{
                  gap: space.lg,
                  opacity: progress,
                  transform: [
                    {
                      translateY: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [motionTokens.distance, 0],
                      }),
                    },
                  ],
                }}
              >
                {children}
              </Animated.View>
            ) : (
              children
            )}
          </ScrollView>
          {footer ? (
            <View
              style={{
                flexShrink: 0,
                borderTopWidth: 1,
                borderColor: colors.rule,
                paddingTop: space.md,
                gap: space.sm,
              }}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
