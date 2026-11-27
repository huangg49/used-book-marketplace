import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  Checkbox,
  ErrorNotice,
  Icon,
  Notice,
  Screen,
  TextField,
  WebBrandLogo,
  space,
  stitchTokens,
  type TextFieldRef,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import { formatAuthError } from "./auth-api";
import { AuthWineBackdrop } from "./auth-wine-backdrop";

export function LoginScreen({
  returnBook,
  onGoRegister,
}: {
  returnBook?: string;
  onGoRegister?: () => void;
}) {
  const { client } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const emailInput = useRef<TextFieldRef>(null);
  const passwordInput = useRef<TextFieldRef>(null);

  const handleGoRegister = () => {
    if (onGoRegister) {
      onGoRegister();
    } else {
      router.push({
        pathname: "/register",
        params: returnBook ? { returnBook } : undefined,
      });
    }
  };

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
    setInfo("");
    try {
      await client.login({ email: normalizedEmail, password });
      if (returnBook) {
        router.dismissTo({
          pathname: "/book",
          params: { id: returnBook },
        });
      }
    } catch (cause) {
      setError(formatAuthError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={<MemberNavigation current="/account" />}
      footerAppearance="navigation"
      canvasColor={stitchTokens.wineDark}
      statusBarStyle="light"
      background={<AuthWineBackdrop />}
      centerContent
    >
      {/* Official App Logo (Owl + Lật Lại) on Wine Velvet */}
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          marginTop: space.xs,
          marginBottom: space.xs,
          gap: 6,
        }}
      >
        <WebBrandLogo scale={0.95} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 22, height: 1, backgroundColor: stitchTokens.goldAlpha40 }} />
          <AppText
            kind="small"
            style={{
              color: stitchTokens.goldTextMuted,
              fontSize: 10.5,
              letterSpacing: 1.8,
              fontWeight: "600",
            }}
          >
            CHỢ SÁCH CŨ SÀI GÒN
          </AppText>
          <View style={{ width: 22, height: 1, backgroundColor: stitchTokens.goldAlpha40 }} />
        </View>
      </View>

      {/* Central Ivory Book-Page Card */}
      <View
        style={{
          backgroundColor: stitchTokens.warmIvory,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: stitchTokens.goldAlpha40,
          paddingHorizontal: space.lg,
          paddingVertical: space.lg,
          gap: space.sm,
          shadowColor: stitchTokens.black,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.32,
          shadowRadius: 22,
          elevation: 10,
        }}
      >
        {/* Header Greeting */}
        <View style={{ alignItems: "center", gap: 2 }}>
          <AppText
            kind="title"
            color={stitchTokens.wineDark}
            style={{
              fontSize: 22,
              fontWeight: "700",
              textAlign: "center",
            }}
          >
            Lại gặp nhau rồi.
          </AppText>
          <AppText
            kind="small"
            color={stitchTokens.deepCocoa}
            style={{ textAlign: "center", fontSize: 11 }}
          >
            Đăng nhập để đăng sách và kết nối người yêu sách Sài Gòn.
          </AppText>
        </View>

        {/* Email Field */}
        <TextField
          label="Tên đăng nhập hoặc Email"
          accessibilityLabel="Email"
          inputRef={emailInput}
          value={email}
          onChangeText={setEmail}
          placeholder="nguyentuan@latlai.vn"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          editable={!busy}
          focusColor={stitchTokens.wine}
          maxLength={254}
          error={
            attempted && !email.trim()
              ? "Nhập địa chỉ email của bạn."
              : undefined
          }
        />

        {/* Password Field */}
        <View style={{ gap: 2 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <AppText kind="bold" color={stitchTokens.wineDark}>
              Mật khẩu
            </AppText>
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
            >
              <Icon
                name={showPassword ? "eyeOff" : "eye"}
                size={13}
                color={stitchTokens.wine}
              />
              <AppText
                kind="small"
                color={stitchTokens.wine}
                style={{ fontSize: 11, fontWeight: "600" }}
              >
                {showPassword ? "Ẩn" : "Hiện"}
              </AppText>
            </Pressable>
          </View>
          <TextField
            accessibilityLabel="Mật khẩu"
            inputRef={passwordInput}
            value={password}
            onChangeText={setPassword}
            placeholder="Nhập mật khẩu của bạn"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            editable={!busy}
            focusColor={stitchTokens.wine}
            maxLength={128}
            returnKeyType="go"
            error={
              attempted && !password ? "Nhập mật khẩu của bạn." : undefined
            }
            onSubmitEditing={() => {
              void submit();
            }}
          />
        </View>

        {/* Remember Me & Forgot Password (All Wine Red) */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <View style={{ flexShrink: 1 }}>
            <Checkbox
              title="Ghi nhớ phiên"
              checked={rememberMe}
              color={stitchTokens.wine}
              onPress={() => setRememberMe(!rememberMe)}
            />
          </View>
          <Pressable
            style={{ flexShrink: 0, minHeight: 44, justifyContent: "center" }}
            accessibilityRole="button"
            accessibilityLabel="Quên mật khẩu?"
            onPress={() =>
              router.push({
                pathname: "/forgot-password",
                params: returnBook ? { returnBook } : undefined,
              })
            }
          >
            <AppText
              kind="small"
              color={stitchTokens.wine}
              style={{
                fontWeight: "700",
                textDecorationLine: "underline",
                fontSize: 12,
              }}
            >
              Quên mật khẩu?
            </AppText>
          </Pressable>
        </View>

        {error ? <ErrorNotice message={error} /> : null}
        {info ? <Notice tone="info">{info}</Notice> : null}

        {/* Primary CTA Submit Button (WINE RED) */}
        <Button
          title="Đăng nhập"
          wine
          busy={busy}
          onPress={() => {
            void submit();
          }}
        />

        <Button wine secondary title="Cách dùng Lật lại" onPress={()=>router.push('/guide')}/>
        {/* Switch to Register */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
          }}
        >
          <AppText kind="small" color={stitchTokens.deepCocoa} style={{ fontSize: 12 }}>
            Chưa có tài khoản độc giả?
          </AppText>
          <Pressable onPress={handleGoRegister}>
            <AppText
              kind="small"
              color={stitchTokens.wine}
              style={{
                fontWeight: "700",
                textDecorationLine: "underline",
                fontSize: 12,
              }}
            >
              Đăng ký ngay
            </AppText>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
