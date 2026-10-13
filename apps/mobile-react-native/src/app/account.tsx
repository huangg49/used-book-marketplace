import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { returnBookId } from "../features/auth/book-return";
import { useSession } from "../core/session/session-provider";
import { LoginScreen } from "../features/auth/login-screen";
import { AccountScreen } from "../features/account/account-screen";
import { BrandLogo, Screen, StatePanel } from "../core/ui";

export default function Index() {
  const { state } = useSession();
  const params = useLocalSearchParams<{ returnBook?: string | string[] }>();
  const bookId = returnBookId(params.returnBook);

  useEffect(() => {
    if (state.status === "authenticated" && bookId) {
      router.dismissTo({ pathname: "/book", params: { id: bookId } });
    }
  }, [state.status, bookId]);

  if (state.status === "authenticated") {
    if (bookId) {
      return (
        <Screen>
          <StatePanel loading title="Đang quay lại sách…" />
        </Screen>
      );
    }
    return <AccountScreen />;
  }

  if (state.status === "loading") {
    return (
      <Screen>
        <BrandLogo />
        <StatePanel loading title="Đang tải…" />
      </Screen>
    );
  }

  return <LoginScreen returnBook={bookId} />;
}
