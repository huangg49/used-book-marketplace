import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState, BackHandler, StyleSheet, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BackAction,
  Button,
  Notice,
  Screen,
  TextField,
  WebBrandLogo,
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
    <Screen>
      <Stack.Screen options={{ gestureEnabled: !view.busy }} />
      <BackAction title="Về đăng nhập" onPress={back} disabled={view.busy} />
      <View style={styles.content}>
        <View style={styles.logo}>
          <WebBrandLogo scale={0.75} />
        </View>
        <AppText kind="heading" accessibilityRole="header">
          {view.phase === "done"
            ? "Mật khẩu đã được đổi"
            : view.phase === "uncertain"
              ? "Kiểm tra lần đặt mật khẩu"
              : "Quên mật khẩu"}
        </AppText>
        {view.phase === "done" ? (
          <>
            <Notice>
              Mật khẩu đã đổi và các phiên đăng nhập cũ đã được thu hồi.
            </Notice>
            <AppText>Đăng nhập lại bằng mật khẩu mới để tiếp tục.</AppText>
            <Button wine title="Đăng nhập bằng mật khẩu mới" onPress={back} />
          </>
        ) : view.phase === "uncertain" ? (
          <>
            <Notice>
              Máy chủ có thể đã đổi mật khẩu nhưng phản hồi bị gián đoạn. Không
              gửi lại mã này.
            </Notice>
            <AppText>
              Thử đăng nhập bằng mật khẩu mới trước. Nếu chưa đăng nhập được,
              quay lại Quên mật khẩu và yêu cầu mã mới sau thời gian chờ.
            </AppText>
            <Button wine title="Về đăng nhập để kiểm tra" onPress={back} />
          </>
        ) : (
          <>
            <AppText>
              Nhập email đã xác minh của tài khoản. Nếu tài khoản đủ điều kiện,
              bạn sẽ nhận mã 6 số để đặt mật khẩu mới.
            </AppText>
            {view.error && <Notice tone="error">{view.error}</Notice>}
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
              required
              hint={
                view.phase === "code"
                  ? "Khi gửi lại mã, dùng email của tài khoản bạn muốn khôi phục."
                  : undefined
              }
              onSubmitEditing={() => void send()}
              returnKeyType="send"
            />
            {view.phase === "code" && (
              <>
                <Notice>
                  Đã nhận yêu cầu. Dùng mã trong thư mới nhất. Mã có hiệu lực 5
                  phút. Nếu chưa thấy thư, hãy kiểm tra Thư rác hoặc gửi mã mới
                  sau thời gian chờ.
                </Notice>
                {expired && (
                  <Notice tone="error">
                    Mã đã hết thời gian chờ trên màn hình. Gửi mã mới để tiếp
                    tục.
                  </Notice>
                )}
                <TextField
                  label="Mã xác nhận"
                  inputRef={codeRef}
                  value={code}
                  onChangeText={setCode}
                  maxLength={6}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  editable={!view.busy && !view.exhausted}
                  required
                  error={fields.code || view.codeError}
                />
                <TextField
                  label="Mật khẩu mới"
                  inputRef={passwordRef}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  maxLength={128}
                  editable={!view.busy}
                  required
                  hint="Từ 10 đến 128 ký tự."
                  error={fields.password}
                />
                <TextField
                  label="Nhập lại mật khẩu mới"
                  inputRef={confirmationRef}
                  value={confirmation}
                  onChangeText={setConfirmation}
                  secureTextEntry
                  autoComplete="new-password"
                  maxLength={128}
                  editable={!view.busy}
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
            )}
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
            <AppText kind="small">
              Không chia sẻ mã xác nhận. Rời màn hình sẽ xóa mã và mật khẩu đang
              nhập.
            </AppText>
          </>
        )}
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
    gap: space.md,
    paddingBottom: space.xl,
  },
  logo: {
    alignSelf: "flex-start",
    backgroundColor: stitchTokens.wine,
    padding: space.sm,
    borderRadius: 14,
  },
});
