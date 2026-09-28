import { ActivityIndicator, View } from "react-native";
import { AppText } from "./text";
import { Button, IconButton } from "./actions";
import { Icon, type IconName } from "./icon";
import { Sheet } from "./sheet";
import { colors, feedbackColors, space } from "./theme";

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
        borderLeftWidth: 3,
        borderLeftColor: color.text,
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
    <Sheet
      title={title}
      visible={visible}
      onClose={onCancel}
      dismissible={!busy}
      backdropDismiss={false}
    >
      <AppText>{message}</AppText>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button title="Quay lại" secondary disabled={busy} onPress={onCancel} />
      <Button
        title={confirmLabel}
        busy={busy}
        destructive={destructive}
        onPress={onConfirm}
      />
    </Sheet>
  );
}
