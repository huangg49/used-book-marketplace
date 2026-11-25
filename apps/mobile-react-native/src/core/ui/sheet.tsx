import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
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
import { colors, colorRoles, space, stitchTokens } from "./theme";
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

  // On Android (especially API 35+ edge-to-edge with adjustResize),
  // KeyboardAvoidingView behavior="height" inside Modal creates an infinite
  // layout oscillation loop and exposes content below the sheet.
  // Measure the outer Modal container height once per layout and only pad by
  // keyboard height if Android did not already resize the Modal window.
  const containerHeightRef = useRef(0);
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);
  const activeAndroidKeyboardInset = visible ? androidKeyboardInset : 0;

  useEffect(() => {
    if (Platform.OS !== "android" || !visible) return;
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      const kbHeight = event.endCoordinates?.height ?? 0;
      if (kbHeight <= 0) {
        setAndroidKeyboardInset(0);
        return;
      }
      const screenH = Dimensions.get("screen").height;
      const windowH = Dimensions.get("window").height;
      const modalH = containerHeightRef.current || windowH;
      const alreadyResized = modalH <= screenH - kbHeight + 48;
      setAndroidKeyboardInset(alreadyResized ? 0 : kbHeight);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKeyboardInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      setAndroidKeyboardInset(0);
    };
  }, [visible]);

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

  const content = (
    <>
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
            backgroundColor: stitchTokens.whiteSurface,
            paddingTop: space.md,
            paddingBottom:
              Platform.OS === "android" && activeAndroidKeyboardInset > 0
                ? space.lg
                : Math.max(20, insets.bottom),
            paddingLeft: Math.max(20, insets.left),
            paddingRight: Math.max(20, insets.right),
            gap: space.lg,
          },
        ]}
      >
        <View
          accessible={false}
          importantForAccessibility="no"
          style={{
            alignSelf: "center",
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: stitchTokens.cardBorder,
            marginBottom: -space.xs,
          }}
        />
        <View style={[s.row, { flexShrink: 0 }]}>
          <T
            kind="card"
            accessibilityRole="header"
            style={{
              flex: 1,
              color: stitchTokens.wineDark,
              fontWeight: "800",
              fontSize: 18,
            }}
          >
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
    </>
  );

  return (
    <Modal
      accessibilityLabel={title}
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={() => {
        if (dismissible) onClose();
      }}
    >
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView
          style={[s.scrim, photoMotion && { backgroundColor: "transparent" }]}
          behavior="padding"
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        <View
          onLayout={(e) => {
            containerHeightRef.current = e.nativeEvent.layout.height;
          }}
          style={[
            s.scrim,
            photoMotion && { backgroundColor: "transparent" },
            activeAndroidKeyboardInset > 0 && { paddingBottom: activeAndroidKeyboardInset },
          ]}
        >
          {content}
        </View>
      )}
    </Modal>
  );
}
