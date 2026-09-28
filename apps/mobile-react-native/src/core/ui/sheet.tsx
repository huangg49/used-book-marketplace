import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText as T } from "./text";
import { IconButton } from "./actions";
import { layout as s } from "./styles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
export function Sheet({
  title,
  visible,
  onClose,
  children,
  dismissible = true,
  backdropDismiss = true,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
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
      <View style={s.scrim}>
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
          <View style={s.row}>
            <T kind="heading" accessibilityRole="header" style={{ flex: 1 }}>
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
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 16, paddingBottom: 24 }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
