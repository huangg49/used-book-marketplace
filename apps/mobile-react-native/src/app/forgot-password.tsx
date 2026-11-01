import { useCallback, useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useSession } from "../core/session/session-provider";
import { Screen, StatePanel } from "../core/ui";
import { returnBookId } from "../features/auth/book-return";
import { recoveryChallenge } from "../features/auth/recovery-model";
import { ForgotPasswordScreen } from "../features/auth/forgot-password-screen";

export default function ForgotPasswordRoute() {
  const { state } = useSession();
  const params = useLocalSearchParams<{
    returnBook?: string | string[];
    challenge?: string | string[];
  }>();
  const bookId = returnBookId(params.returnBook);
  const onChallenge = useCallback(
    (challenge?: string) => router.setParams({ challenge }),
    [],
  );
  const onGoLogin = useCallback(
    () =>
      router.replace({
        pathname: "/account",
        params: bookId ? { returnBook: bookId } : {},
      }),
    [bookId],
  );
  useEffect(() => {
    if (state.status === "authenticated") onGoLogin();
  }, [state.status, onGoLogin]);
  if (state.status === "authenticated" || state.status === "loading")
    return (
      <Screen>
        <StatePanel loading title="Đang mở tài khoản…" />
      </Screen>
    );
  return (
    <ForgotPasswordScreen
      initialChallenge={recoveryChallenge(params.challenge)}
      onChallenge={onChallenge}
      onGoLogin={onGoLogin}
    />
  );
}
