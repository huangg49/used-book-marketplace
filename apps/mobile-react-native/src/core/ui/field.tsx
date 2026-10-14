import { useId, useState, type Ref } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { AppText } from "./text";
import { colors, metrics, radius, space } from "./theme";
import { layout } from "./styles";
import { Icon } from "./icon";
import { IconButton } from "./actions";
export type TextFieldRef = TextInput;

export function SearchField({
  label,
  value,
  onChangeText,
  placeholder,
  onSubmitEditing,
  maxLength,
  submitLabel,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onSubmitEditing?: () => void;
  maxLength?: number;
  submitLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        layout.row,
        {
          gap: space.sm,
          minHeight: metrics.control,
          paddingLeft: space.md,
          backgroundColor: colors.surface,
          borderRadius: radius.control,
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? colors.forest : colors.border,
        },
      ]}
    >
      {submitLabel && onSubmitEditing ? (
        <IconButton
          name="search"
          label={submitLabel}
          onPress={onSubmitEditing}
        />
      ) : (
        <Icon name="search" size={20} />
      )}
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 48,
          paddingVertical: 10,
          fontFamily: "BeRegular",
          fontSize: 16,
          color: colors.ink,
        }}
      />
      {value ? (
        <IconButton
          name="close"
          label="Xóa từ khóa"
          onPress={() => onChangeText("")}
        />
      ) : (
        <View style={{ width: 8 }} />
      )}
    </View>
  );
}

export function TextField({
  label,
  accessibilityLabel,
  hint,
  error,
  required,
  inputRef,
  focusColor,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  inputRef?: Ref<TextInput>;
  focusColor?: string;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const description = error || hint;
  return (
    <View style={{ gap: space.xs }}>
      {label ? (
        <AppText nativeID={`${id}-label`} kind="bold">
          {label}
          {required ? " *" : ""}
        </AppText>
      ) : null}
      <TextInput
        {...props}
        ref={inputRef}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={description}
        aria-labelledby={accessibilityLabel ? undefined : `${id}-label`}
        aria-describedby={description ? `${id}-description` : undefined}
        aria-invalid={!!error}
        aria-required={required}
        placeholderTextColor={colors.muted}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          layout.input,
          props.multiline && { minHeight: 128, textAlignVertical: "top" },
          props.editable === false && {
            backgroundColor: "#F4F0E8",
          },
          {
            borderColor: error
              ? colors.error
              : focused
                ? (focusColor ?? colors.forest)
                : colors.border,
            borderWidth: focused ? 2 : 1,
          },
          style,
        ]}
      />
      {description ? (
        <AppText
          nativeID={`${id}-description`}
          kind="small"
          color={error ? colors.error : colors.muted}
          accessibilityRole={error ? "alert" : undefined}
          accessibilityLiveRegion="polite"
        >
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

export function Checkbox({
  title,
  checked,
  onPress,
  disabled = false,
  color,
  style,
}: {
  title: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  style?: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={title}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        layout.row,
        focused && layout.focus,
        {
          minHeight: metrics.touch,
          alignItems: "center",
          paddingVertical: 4,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.small,
          backgroundColor: checked
            ? color ?? colors.forest
            : colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Icon name="check" size={16} color={colors.paper} /> : null}
      </View>
      <AppText style={{ flexShrink: 1 }}>{title}</AppText>
    </Pressable>
  );
}

export function AppTextInput(props: TextInputProps & { ref?: Ref<TextInput> }) {
  return <TextInput {...props} />;
}
