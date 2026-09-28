import {
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
import { colors, space } from "./theme";
export function Sheet({
  title,
  visible,
  onClose,
  children,
  footer,
  dismissible = true,
  backdropDismiss = true,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissible?: boolean;
  backdropDismiss?: boolean;
}) {
  const insets = useSafeAreaInsets();
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
        style={s.scrim}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
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
            {children}
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
