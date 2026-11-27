import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AppState,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  Icon,
  Notice,
  TextField,
  WebBrandLogo,
  WineHeader,
  space,
  stitchTokens,
  type TextFieldRef,
} from "../../core/ui";
import { requestOtp, resetPasswordWithOtp } from "./auth-api";
import { RecoveryFlow, recoveryFields } from "./recovery-model";

export function ForgotPasswordScreen({
  initialChallenge,
  onChallenge,
  onGoLogin,
}: {
  initialChallenge?: string;
  onChallenge: (challenge?: string) => void;
  onGoLogin: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { client } = useSession();
  const [flow] = useState(
    () =>
      new RecoveryFlow(
        {
          request: (email) => requestOtp(client, email, "ResetPassword"),
          reset: (body) => resetPasswordWithOtp(client, body),
        },
        initialChallenge,
      ),
  );
  const view = useSyncExternalStore(
    flow.subscribe,
    flow.getSnapshot,
    flow.getSnapshot,
  );
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fields, setFields] = useState<ReturnType<typeof recoveryFields>>({});
  const [now, setNow] = useState(() => Date.now());
  const emailRef = useRef<TextFieldRef>(null),
    codeRef = useRef<TextFieldRef>(null),
    passwordRef = useRef<TextFieldRef>(null),
    confirmationRef = useRef<TextFieldRef>(null);

  const back = useCallback(() => {
    if (!flow.getSnapshot().busy) onGoLogin();
  }, [flow, onGoLogin]);

  useFocusEffect(
    useCallback(() => {
      flow.setActive(true);
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        back();
        return true;
      });
      return () => {
        sub.remove();
        flow.setActive(false);
        setCode("");
        setPassword("");
        setConfirmation("");
      };
    }, [back, flow]),
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener("change", () => setNow(Date.now()));
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  useEffect(() => {
    onChallenge(view.challengeId);
  }, [onChallenge, view.challengeId]);

  useEffect(() => {
    let previous = flow.getSnapshot();
    let timer: ReturnType<typeof setTimeout>;
    const focus = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const phase = flow.getSnapshot().phase;
        if (phase === "code") codeRef.current?.focus();
        else if (phase === "email") emailRef.current?.focus();
      }, 100);
    };
    focus();
    const unsubscribe = flow.subscribe(() => {
      const next = flow.getSnapshot();
      if (
        next.phase !== previous.phase ||
        next.challengeId !== previous.challengeId
      ) {
        setCode("");
        setPassword("");
        setConfirmation("");
        setFields({});
        focus();
      }
      previous = next;
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [flow]);

  useEffect(() => {
    if (view.codeError) codeRef.current?.focus();
  }, [view.codeError]);

  const cooldown = Math.max(0, Math.ceil((view.resendAt - now) / 1000));
  const expired = !!view.expiresAt && now >= view.expiresAt;

  async function send() {
    if (!email.trim()) emailRef.current?.focus();
    await flow.request(email);
  }

  async function submit() {
    if (expired) return;
    const invalid = recoveryFields(code, password, confirmation);
    setFields(invalid);
    if (invalid.code) codeRef.current?.focus();
    else if (invalid.password) passwordRef.current?.focus();
    else if (invalid.confirmation) confirmationRef.current?.focus();
    else await flow.reset(code, password);
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ gestureEnabled: !view.busy }} />
      <WineHeader
        title="Khôi phục mật khẩu"
        subtitle="Xác minh qua email tài khoản"
        onBack={back}
        backLabel="Về đăng nhập"
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 16 },
        ]}
      >
        <View style={styles.brandWrap}>
          <View style={styles.logoBadge}>
            <WebBrandLogo scale={0.72} />
          </View>
        </View>

        <View style={styles.card}>
          <AppText kind="heading" accessibilityRole="header" style={styles.cardTitle}>
            {view.phase === "done"
              ? "Mật khẩu đã được đổi"
              : view.phase === "uncertain"
                ? "Kiểm tra lần đặt mật khẩu"
                : "Quên mật khẩu"}
          </AppText>

          {view.phase === "done" ? (
            <>
              <Notice tone="success">
                Mật khẩu đã đổi và các phiên đăng nhập cũ đã được thu hồi.
              </Notice>
              <AppText kind="small" style={styles.descText}>
                Đăng nhập lại bằng mật khẩu mới để tiếp tục sử dụng Lật lại.
              </AppText>
              <Button wine title="Đăng nhập bằng mật khẩu mới" onPress={back} />
            </>
          ) : view.phase === "uncertain" ? (
            <>
              <Notice tone="warning">
                Máy chủ có thể đã đổi mật khẩu nhưng phản hồi bị gián đoạn. Không gửi lại mã này.
              </Notice>
              <AppText kind="small" style={styles.descText}>
                Thử đăng nhập bằng mật khẩu mới trước. Nếu chưa đăng nhập được, quay lại Quên mật khẩu và yêu cầu mã mới sau thời gian chờ.
              </AppText>
              <Button wine title="Về đăng nhập để kiểm tra" onPress={back} />
            </>
          ) : (
            <>
              <AppText kind="small" style={styles.descText}>
                Nhập email đã xác minh của tài khoản. Nếu hợp lệ, bạn sẽ nhận mã 6 chữ số để đặt mật khẩu mới.
              </AppText>

              {view.error ? <Notice tone="error">{view.error}</Notice> : null}

              <TextField
                label="Email khôi phục"
                value={email}
                inputRef={emailRef}
                onChangeText={setEmail}
                autoComplete="email"
                keyboardType="email-address"
                autoCapitalize="none"
                maxLength={254}
                editable={!view.busy}
                focusColor={stitchTokens.wine}
                required
                hint={
                  view.phase === "code"
                    ? "Khi gửi lại mã, dùng email của tài khoản bạn muốn khôi phục."
                    : undefined
                }
                onSubmitEditing={() => void send()}
                returnKeyType="send"
              />

              {view.phase === "code" ? (
                <>
                  <Notice tone="info">
                    Đã gửi yêu cầu. Dùng mã trong thư mới nhất (hiệu lực 5 phút). Kiểm tra thêm hộp Thư rác nếu chưa thấy.
                  </Notice>
                  {expired ? (
                    <Notice tone="error">
                      Mã đã hết hạn. Vui lòng gửi mã mới để tiếp tục.
                    </Notice>
                  ) : null}

                  <TextField
                    label="Mã xác nhận (6 chữ số)"
                    inputRef={codeRef}
                    value={code}
                    onChangeText={setCode}
                    maxLength={6}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    editable={!view.busy && !view.exhausted}
                    focusColor={stitchTokens.wine}
                    required
                    error={fields.code || view.codeError}
                  />

                  <View style={styles.passwordToggleRow}>
                    <AppText kind="small" style={styles.passwordToggleHint}>
                      Mật khẩu mới từ 10 đến 128 ký tự
                    </AppText>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setShowPassword((v) => !v)}
                      style={styles.toggleBtn}
                    >
                      <Icon
                        name={showPassword ? "eyeOff" : "eye"}
                        size={14}
                        color={stitchTokens.wine}
                      />
                      <AppText kind="small" style={styles.toggleBtnText}>
                        {showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      </AppText>
                    </Pressable>
                  </View>

                  <TextField
                    label="Mật khẩu mới"
                    inputRef={passwordRef}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="new-password"
                    maxLength={128}
                    editable={!view.busy}
                    focusColor={stitchTokens.wine}
                    required
                    error={fields.password}
                  />

                  <TextField
                    label="Nhập lại mật khẩu mới"
                    inputRef={confirmationRef}
                    value={confirmation}
                    onChangeText={setConfirmation}
                    secureTextEntry={!showPassword}
                    autoComplete="new-password"
                    maxLength={128}
                    editable={!view.busy}
                    focusColor={stitchTokens.wine}
                    required
                    error={fields.confirmation}
                    onSubmitEditing={() => void submit()}
                    returnKeyType="done"
                  />

                  <Button
                    wine
                    title="Đặt mật khẩu mới"
                    busy={view.busy}
                    disabled={view.exhausted || expired}
                    onPress={() => void submit()}
                  />
                </>
              ) : null}

              <Button
                wine
                secondary={view.phase === "code"}
                title={
                  cooldown
                    ? `Có thể gửi mã sau ${cooldown} giây`
                    : view.phase === "code" || view.requestUncertain
                      ? "Gửi mã mới"
                      : "Gửi mã khôi phục"
                }
                busy={view.busy}
                disabled={cooldown > 0}
                onPress={() => void send()}
              />

              <View style={styles.securityNote}>
                <Icon name="lock" size={13} color={stitchTokens.subtleGray} />
                <AppText kind="small" style={styles.securityNoteText}>
                  Không chia sẻ mã xác nhận. Rời màn hình sẽ tự xóa mã và mật khẩu đang nhập.
                </AppText>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  scrollContent: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: 16,
  },
  brandWrap: {
    alignItems: "center",
  },
  logoBadge: {
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  card: {
    backgroundColor: stitchTokens.white,
    borderRadius: 18,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 20,
    lineHeight: 26,
    color: stitchTokens.wineDark,
  },
  descText: {
    fontSize: 13,
    lineHeight: 19,
    color: stitchTokens.subtleGray,
  },
  passwordToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  passwordToggleHint: {
    fontSize: 11.5,
    color: stitchTokens.subtleGray,
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: stitchTokens.roseParchment,
  },
  toggleBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingTop: 2,
  },
  securityNoteText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: stitchTokens.subtleGray,
  },
});
