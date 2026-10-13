import { useEffect, useRef, useState } from "react";
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
  colors,
  space,
  stitchTokens,
  type TextFieldRef,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  formatAuthError,
  registerWithOtp,
  requestOtp,
  verifyEmailOtp,
  type OtpAck,
} from "./auth-api";

function getPasswordStrength(p: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!p) return { score: 0, label: "Nhập mật khẩu", color: stitchTokens.peachBorder };
  if (p.length < 10)
    return {
      score: 1,
      label: "Quá ngắn (tối thiểu 10 ký tự)",
      color: stitchTokens.crimson,
    };
  let s = 1;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  if (s <= 1) return { score: 1, label: "Độ an toàn: Yếu", color: stitchTokens.crimson };
  if (s === 2)
    return { score: 2, label: "Độ an toàn: Trung bình", color: stitchTokens.goldMedal };
  return { score: 3, label: "Độ an toàn: Tốt", color: stitchTokens.likeNewGreen };
}

export function RegisterScreen({
  returnBook,
  onGoLogin,
}: {
  returnBook?: string;
  onGoLogin?: () => void;
}) {
  const { client } = useSession();

  // Form Fields
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);

  // OTP Verification State
  const [otpChallenge, setOtpChallenge] = useState<OtpAck | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Status & Error
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const nameInput = useRef<TextFieldRef>(null);
  const emailInput = useRef<TextFieldRef>(null);
  const passwordInput = useRef<TextFieldRef>(null);

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleGoLogin = () => {
    if (onGoLogin) {
      onGoLogin();
    } else {
      router.navigate("/account");
    }
  };

  const strength = getPasswordStrength(password);

  // Submit registration form
  const handleRegister = async () => {
    if (busy) return;
    setAttempted(true);
    setError("");

    const trimmedName = displayName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      nameInput.current?.focus();
      return;
    }
    if (!normalizedEmail) {
      emailInput.current?.focus();
      return;
    }
    if (password.length < 10) {
      setError("Mật khẩu cần tối thiểu 10 ký tự.");
      passwordInput.current?.focus();
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Hai mật khẩu chưa trùng khớp. Vui lòng nhập lại.");
      return;
    }
    if (!acceptedRules) {
      setError(
        "Bạn cần đồng ý với Quy chế hoạt động và cam kết mô phỏng của Lật Lại.",
      );
      return;
    }

    setBusy(true);
    try {
      const ack = await registerWithOtp(client, {
        displayName: trimmedName,
        email: normalizedEmail,
        password,
        acceptedRules: true,
      });
      setOtpChallenge(ack);
      setCooldown(ack.resendAfter || 60);
      setSuccessMsg(
        "Mã xác thực 6 số đã được gửi tới email của bạn. Vui lòng kiểm tra hộp thư.",
      );
    } catch (cause) {
      setError(formatAuthError(cause));
    } finally {
      setBusy(false);
    }
  };

  // Verify OTP code
  const handleVerifyOtp = async () => {
    if (!otpChallenge || busy) return;
    if (otpCode.trim().length < 6) {
      setError("Vui lòng nhập đủ 6 chữ số mã OTP.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await verifyEmailOtp(client, otpChallenge.challengeId, otpCode.trim());
      setSuccessMsg("Xác thực email thành công! Đang tự động đăng nhập...");

      // Automatically log the user in
      await client.login({
        email: email.trim().toLowerCase(),
        password,
      });

      if (returnBook) {
        router.dismissTo({
          pathname: "/book",
          params: { id: returnBook },
        });
      } else {
        router.navigate("/account");
      }
    } catch (cause) {
      setError(formatAuthError(cause));
    } finally {
      setBusy(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const ack = await requestOtp(
        client,
        email.trim().toLowerCase(),
        "VerifyEmail",
      );
      setOtpChallenge(ack);
      setCooldown(ack.resendAfter || 60);
      setOtpCode("");
      setSuccessMsg("Đã gửi mã xác nhận mới tới email của bạn.");
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
      centerContent
    >
      {/* Official App Logo (Owl + Lật Lại) */}
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          marginTop: space.xs,
          marginBottom: space.sm,
        }}
      >
        <View
          style={{
            backgroundColor: stitchTokens.wine,
            paddingHorizontal: 16,
            paddingVertical: 7,
            borderRadius: 14,
            shadowColor: stitchTokens.wine,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 3,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <WebBrandLogo scale={0.75} />
        </View>
      </View>

      {/* Central Parchment Card (Single-Screen Fit) */}
      <View
        style={{
          backgroundColor: stitchTokens.warmIvory,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: stitchTokens.peachBorder,
          paddingHorizontal: space.md,
          paddingVertical: 12,
          gap: 8,
          shadowColor: stitchTokens.black,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 2,
        }}
      >
        {/* OTP VERIFICATION STEP */}
        {otpChallenge ? (
          <View style={{ gap: space.sm }}>
            <View style={{ alignItems: "center", gap: 3 }}>
              <AppText
                kind="title"
                color={stitchTokens.wineDark}
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  textAlign: "center",
                }}
              >
                Xác minh email
              </AppText>
              <AppText
                kind="small"
                color={stitchTokens.deepCocoa}
                style={{ textAlign: "center", fontSize: 11 }}
              >
                Nhập mã 6 số gửi tới:{" "}
                <AppText
                  kind="bold"
                  color={stitchTokens.wine}
                  style={{ fontSize: 11 }}
                >
                  {email.trim().toLowerCase()}
                </AppText>
              </AppText>
            </View>

            {successMsg ? <Notice tone="success">{successMsg}</Notice> : null}
            {error ? <ErrorNotice message={error} /> : null}

            <TextField
              label="Mã xác thực OTP (6 số)"
              value={otpCode}
              onChangeText={setOtpCode}
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
              focusColor={stitchTokens.wine}
              editable={!busy}
            />

            <Button
              title="Xác minh email & Hoàn tất"
              wine
              busy={busy}
              disabled={otpCode.trim().length < 6}
              onPress={() => {
                void handleVerifyOtp();
              }}
            />

            {/* Resend & Back actions */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 2,
              }}
            >
              <Pressable
                disabled={cooldown > 0 || busy}
                onPress={() => void handleResendOtp()}
              >
                <AppText
                  kind="small"
                  color={cooldown > 0 ? stitchTokens.roseBrown : stitchTokens.wine}
                  style={{
                    fontWeight: "600",
                    fontSize: 11,
                    textDecorationLine: cooldown > 0 ? "none" : "underline",
                  }}
                >
                  {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : "Gửi lại mã OTP"}
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => {
                  setOtpChallenge(null);
                  setOtpCode("");
                  setError("");
                }}
              >
                <AppText
                  kind="small"
                  color={stitchTokens.wine}
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    textDecorationLine: "underline",
                  }}
                >
                  Sửa email đăng ký
                </AppText>
              </Pressable>
            </View>
          </View>
        ) : (
          /* REGISTRATION FORM STEP (ALL WINE RED & COMPACT) */
          <View style={{ gap: 8 }}>
            <View style={{ alignItems: "center", gap: 2 }}>
              <AppText
                kind="title"
                color={stitchTokens.wineDark}
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  textAlign: "center",
                }}
              >
                Tạo tài khoản mới
              </AppText>
              <AppText
                kind="small"
                color={stitchTokens.deepCocoa}
                style={{ textAlign: "center", fontSize: 11 }}
              >
                Mở ra trang sách đầu tiên của bạn tại Lật Lại.
              </AppText>
            </View>

            {/* Field 1: Họ tên */}
            <TextField
              label="Họ và tên / Bút danh"
              inputRef={nameInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Trần Hoài Nam"
              maxLength={80}
              focusColor={stitchTokens.wine}
              editable={!busy}
              error={
                attempted && !displayName.trim()
                  ? "Nhập họ tên hoặc bút danh của bạn."
                  : undefined
              }
            />

            {/* Field 2: Email */}
            <TextField
              label="Địa chỉ Email"
              accessibilityLabel="Email"
              inputRef={emailInput}
              value={email}
              onChangeText={setEmail}
              placeholder="docgia@latlai.vn"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              focusColor={stitchTokens.wine}
              maxLength={254}
              editable={!busy}
              error={
                attempted && !email.trim()
                  ? "Nhập địa chỉ email của bạn."
                  : undefined
              }
            />

            {/* Field 3: Mật khẩu */}
            <View style={{ gap: 2 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <AppText kind="bold" color={stitchTokens.wineDark}>
                  Mật khẩu (10 - 128 ký tự)
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
                label="Mật khẩu"
                accessibilityLabel="Mật khẩu"
                inputRef={passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Nhập mật khẩu"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                focusColor={stitchTokens.wine}
                maxLength={128}
                editable={!busy}
                error={
                  attempted && password.length < 10
                    ? "Mật khẩu cần tối thiểu 10 ký tự."
                    : undefined
                }
              />

              {/* Compact Strength Bar */}
              {password ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 2,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      height: 3,
                      gap: 3,
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        backgroundColor:
                          strength.score >= 1 ? stitchTokens.wine : stitchTokens.cardBorder,
                        borderRadius: 2,
                      }}
                    />
                    <View
                      style={{
                        flex: 1,
                        backgroundColor:
                          strength.score >= 2 ? stitchTokens.wine : stitchTokens.cardBorder,
                        borderRadius: 2,
                      }}
                    />
                    <View
                      style={{
                        flex: 1,
                        backgroundColor:
                          strength.score >= 3 ? stitchTokens.wine : stitchTokens.cardBorder,
                        borderRadius: 2,
                      }}
                    />
                  </View>
                  <AppText
                    kind="small"
                    color={stitchTokens.wine}
                    style={{ fontSize: 10, fontWeight: "600" }}
                  >
                    {strength.label}
                  </AppText>
                </View>
              ) : null}
            </View>

            {/* Field 4: Nhập lại mật khẩu */}
            <TextField
              label="Nhập lại mật khẩu"
              value={passwordConfirmation}
              onChangeText={setPasswordConfirmation}
              placeholder="Nhập lại mật khẩu cho khớp"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              focusColor={stitchTokens.wine}
              maxLength={128}
              editable={!busy}
              error={
                attempted && password !== passwordConfirmation
                  ? "Hai mật khẩu chưa trùng khớp."
                  : undefined
              }
            />

            {/* Terms Checkbox (Wine Red Check) */}
            <View style={{ gap: 2 }}>
              <Checkbox
                title="Đồng ý Quy chế hoạt động & Tiêu chuẩn Lật Lại"
                checked={acceptedRules}
                color={stitchTokens.wine}
                onPress={() => setAcceptedRules(!acceptedRules)}
              />
              {attempted && !acceptedRules ? (
                <AppText
                  kind="small"
                  color={colors.rustText}
                  style={{ marginLeft: 30, fontSize: 11 }}
                >
                  Cần xác nhận điều khoản để tiếp tục.
                </AppText>
              ) : null}
            </View>

            {error ? <ErrorNotice message={error} /> : null}

            {/* Primary Submit CTA (WINE RED) */}
            <Button
              title="Tạo tài khoản"
              wine
              busy={busy}
              onPress={() => {
                void handleRegister();
              }}
            />

            {/* Switch to Login */}
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
                Đã có tài khoản?
              </AppText>
              <Pressable onPress={handleGoLogin}>
                <AppText
                  kind="small"
                  color={stitchTokens.wine}
                  style={{
                    fontWeight: "700",
                    textDecorationLine: "underline",
                    fontSize: 12,
                  }}
                >
                  Đăng nhập
                </AppText>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}
