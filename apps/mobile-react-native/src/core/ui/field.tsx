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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onSubmitEditing?: () => void;
  maxLength?: number;
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
      <Icon name="search" size={20} />
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
  hint,
  error,
  required,
  inputRef,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  inputRef?: Ref<TextInput>;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const description = error || hint;
  return (
    <View style={{ gap: space.sm }}>
      <AppText nativeID={`${id}-label`} kind="bold">
        {label}
        {required ? " *" : ""}
      </AppText>
      <TextInput
        {...props}
        ref={inputRef}
        accessibilityLabel={label}
        accessibilityHint={description}
        aria-labelledby={`${id}-label`}
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
            backgroundColor: colors.successSurface,
          },
          {
            borderColor: error
              ? colors.error
              : focused
                ? colors.forest
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
}: {
  title: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
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
          alignItems: "flex-start",
          paddingVertical: space.sm,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.small,
          backgroundColor: checked ? colors.forest : colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Icon name="check" size={18} color={colors.paper} /> : null}
      </View>
      <AppText style={{ flex: 1 }}>{title}</AppText>
    </Pressable>
  );
}
