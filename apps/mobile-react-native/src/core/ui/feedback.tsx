import { useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
  wine = false,
  action,
}: {
  title: string;
  message?: string;
  icon?: IconName;
  loading?: boolean;
  wine?: boolean;
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
        <ActivityIndicator accessibilityLabel={title} color={wine ? stitchTokens.wine : colors.forest} />
      ) : (
        <Icon name={icon} size={34} color={wine ? stitchTokens.wine : colors.forest} />
      )}
      <AppText
        kind="heading"
        color={wine ? stitchTokens.charcoalBrown : colors.ink}
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
          wine={wine}
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
  if (!visible) return null;

  return (
    <Modal
      accessibilityLabel={title}
      visible={visible}
      transparent
      animationType={Platform.OS === "web" ? "none" : "fade"}
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

export function Toast({
  visible,
  message,
  icon = "bookmark",
  actionTitle = "Xem",
  onAction,
  onDismiss,
  duration = 2600,
}: {
  visible: boolean;
  message: string;
  icon?: IconName;
  actionTitle?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      onDismiss?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={toastStyles.overlay} pointerEvents="box-none">
        <View style={toastStyles.pill}>
          <Icon name={icon} size={16} color={stitchTokens.white} filled />
          <AppText style={toastStyles.text}>
            {message}
          </AppText>
          {onAction && actionTitle ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actionTitle}
              onPress={() => {
                onDismiss?.();
                onAction();
              }}
              hitSlop={8}
              style={({ pressed }) => [
                toastStyles.actionBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <AppText style={toastStyles.actionText}>
                {actionTitle}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const toastStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 88,
    backgroundColor: "transparent",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.charcoalBrown,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    maxWidth: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  text: {
    color: stitchTokens.white,
    fontSize: 13,
    fontWeight: "600",
  },
  actionBtn: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  actionText: {
    color: stitchTokens.goldMedal,
    fontSize: 13,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});

