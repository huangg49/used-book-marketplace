import { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BackAction,
  BrandLogo,
  Button,
  ErrorNotice,
  Screen,
  TextField,
  colors,
  presentError,
  space,
  type TextFieldRef,
} from "../../core/ui";

export function LoginScreen() {
  const { client } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const emailInput = useRef<TextFieldRef>(null);
  const passwordInput = useRef<TextFieldRef>(null);
  const submit = async () => {
    if (busy) return;
    setAttempted(true);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("");
      if (!normalizedEmail) emailInput.current?.focus();
      else passwordInput.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await client.login({ email: normalizedEmail, password });
    } catch (cause) {
      setError(presentError(cause).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <BrandLogo />
      <BackAction title="Về kệ sách" onPress={() => router.replace("/")} />
      <View
        style={{
          marginVertical: space.xl,
          paddingLeft: space.lg,
          borderLeftWidth: 3,
          borderLeftColor: colors.terracotta,
        }}
      >
        <AppText kind="heading" color={colors.forest}>
          Sách cũ. Chương mới.
        </AppText>
      </View>
      <AppText kind="title" color={colors.forest} accessibilityRole="header">
        Chào bạn trở lại
      </AppText>
      <AppText color={colors.muted}>
        Đăng nhập để tiếp tục hành trình đọc của bạn.
      </AppText>
      <TextField
        label="Email"
        inputRef={emailInput}
        value={email}
        onChangeText={setEmail}
        placeholder="ban@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!busy}
        maxLength={254}
        error={
          attempted && !email.trim() ? "Nhập địa chỉ email của bạn." : undefined
        }
      />
      <TextField
        label="Mật khẩu"
        inputRef={passwordInput}
        value={password}
        onChangeText={setPassword}
        placeholder="Nhập mật khẩu"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        editable={!busy}
        maxLength={128}
        returnKeyType="go"
        error={attempted && !password ? "Nhập mật khẩu của bạn." : undefined}
        onSubmitEditing={() => {
          void submit();
        }}
      />
      {error ? <ErrorNotice message={error} /> : null}
      <Button
        title="Đăng nhập"
        busy={busy}
        onPress={() => {
          void submit();
        }}
      />
    </Screen>
  );
}
