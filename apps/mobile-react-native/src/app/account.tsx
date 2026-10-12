import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { returnBookId } from "../features/auth/book-return";
import { useSession } from "../core/session/session-provider";
import { LoginScreen } from "../features/auth/login-screen";
import { AccountScreen } from "../features/account/account-screen";
import { BrandLogo, Screen, StatePanel } from "../core/ui";
export default function Index() {
  const { client, state } = useSession();
  const params = useLocalSearchParams<{ returnBook?: string | string[] }>();
  const bookId = returnBookId(params.returnBook);
  useEffect(() => {
    if (state.status === "authenticated" && bookId) {
      router.dismissTo({ pathname: "/book", params: { id: bookId } });
    }
  }, [state.status, bookId]);
  if (state.status === "anonymous") return <LoginScreen returnBook={bookId} />;
  if (state.status === "authenticated" && bookId) {
    return (
      <Screen>
        <StatePanel loading title="Đang quay lại sách…" />
      </Screen>
    );
  }
  if (state.status === "authenticated") return <AccountScreen />;
  return (
    <Screen>
      <BrandLogo />
      <StatePanel
        loading={state.status === "loading"}
        title={
          state.status === "loading"
            ? "Đang khôi phục phiên đăng nhập"
            : "Chưa kết nối được"
        }
        message={state.status === "unavailable" ? state.message : undefined}
        action={
          state.status === "unavailable"
            ? {
                label: "Thử kết nối lại",
                onPress: () => {
                  void client.restore();
                },
              }
            : undefined
        }
      />
    </Screen>
  );
}
