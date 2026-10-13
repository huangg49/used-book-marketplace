import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { AppText } from "./text";
import { Button, IconButton } from "./actions";
import { Icon, type IconName } from "./icon";
import { colorRoles, colors, feedbackColors, space, stitchTokens } from "./theme";

export function Notice({
  children,
  tone = "info",
  error = false,
  onDismiss,
}: React.PropsWithChildren<{
  tone?: keyof typeof feedbackColors;
  error?: boolean;
  onDismiss?: () => void;
}>) {
  const kind = error ? "error" : tone;
  const color = feedbackColors[kind];
  return (
    <View
      accessibilityRole={kind === "error" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={{
        padding: 14,
        backgroundColor: color.surface,
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
      }}
    >
      <AppText kind="small" color={color.text} style={{ flex: 1 }}>
        {children}
      </AppText>
      {onDismiss ? (
        <IconButton name="close" label="Ẩn thông báo" onPress={onDismiss} />
      ) : null}
    </View>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return <Notice tone="error">{message}</Notice>;
}

export function StatePanel({
  title,
  message,
  icon = "book",
  loading = false,
  action,
}: {
  title: string;
  message?: string;
  icon?: IconName;
  loading?: boolean;
  action?: { label: string; onPress: () => void; busy?: boolean };
}) {
  return (
    <View
      style={{
        paddingVertical: space.section,
        gap: space.lg,
        alignItems: "center",
      }}
    >
      {loading ? (
        <ActivityIndicator accessibilityLabel={title} color={colors.forest} />
      ) : (
        <Icon name={icon} size={34} />
      )}
      <AppText
        kind="heading"
        accessibilityRole="header"
        style={{ textAlign: "center" }}
      >
        {title}
      </AppText>
      {message ? (
        <AppText color={colors.muted} style={{ textAlign: "center" }}>
          {message}
        </AppText>
      ) : null}
      {action ? (
        <Button
          title={action.label}
          busy={action.busy}
          onPress={action.onPress}
        />
      ) : null}
    </View>
  );
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  error,
  destructive = false,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
  destructive?: boolean;
}) {
  return (
    <Modal
      accessibilityLabel={title}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          backgroundColor: colorRoles.scrim,
          justifyContent: "center",
          alignItems: "center",
          padding: space.xl,
        }}
      >
        <Pressable
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          accessible={false}
          importantForAccessibility="no"
          focusable={false}
          onPress={() => {
            if (!busy) onCancel();
          }}
        />

        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: "#FFFFFF",
            width: "100%",
            maxWidth: 380,
            borderRadius: 24,
            padding: space.xxl,
            gap: space.lg,
            borderWidth: 1,
            borderColor: "#DEC0BB",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.18,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          {/* Header with Title and Close button */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: space.md,
            }}
          >
            <AppText
              kind="heading"
              accessibilityRole="header"
              style={{
                flex: 1,
                fontSize: 20,
                color: stitchTokens.wine,
                fontWeight: "700",
              }}
            >
              {title}
            </AppText>
            <IconButton
              name="close"
              label="Đóng"
              disabled={busy}
              onPress={onCancel}
            />
          </View>

          {/* Dialog message */}
          <ScrollView
            style={{ maxHeight: 220 }}
            keyboardShouldPersistTaps="handled"
          >
            <AppText
              style={{
                fontSize: 15,
                lineHeight: 22,
                color: colors.ink,
              }}
            >
              {message}
            </AppText>
            {error ? (
              <View style={{ marginTop: space.sm }}>
                <Notice tone="error">{error}</Notice>
              </View>
            ) : null}
          </ScrollView>

          {/* Action buttons */}
          <View style={{ gap: space.md, marginTop: space.xs }}>
            <Button
              title="Quay lại"
              secondary
              disabled={busy}
              onPress={onCancel}
            />
            <Button
              title={confirmLabel}
              busy={busy}
              wine={!destructive}
              destructive={destructive}
              onPress={onConfirm}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
