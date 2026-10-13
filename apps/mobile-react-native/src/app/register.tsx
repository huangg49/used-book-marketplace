import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { returnBookId } from "../features/auth/book-return";
import { useSession } from "../core/session/session-provider";
import { RegisterScreen } from "../features/auth/register-screen";
import { Screen, StatePanel } from "../core/ui";

export default function RegisterRoute() {
  const { state } = useSession();
  const params = useLocalSearchParams<{ returnBook?: string | string[] }>();
  const bookId = returnBookId(params.returnBook);

  useEffect(() => {
    if (state.status === "authenticated") {
      if (bookId) {
        router.dismissTo({ pathname: "/book", params: { id: bookId } });
      } else {
        router.navigate("/account");
      }
    }
  }, [state.status, bookId]);

  if (state.status === "authenticated") {
    return (
      <Screen>
        <StatePanel loading title="Đang chuyển hướng…" />
      </Screen>
    );
  }

  return (
    <RegisterScreen
      returnBook={bookId}
      onGoLogin={() => router.navigate("/account")}
    />
  );
}
