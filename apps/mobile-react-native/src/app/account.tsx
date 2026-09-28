import { useSession } from "../core/session/session-provider";
import { LoginScreen } from "../features/auth/login-screen";
import { AccountScreen } from "../features/account/account-screen";
import { BrandLogo, Screen, StatePanel } from "../core/ui";
export default function Index() {
  const { client, state } = useSession();
  if (state.status === "anonymous") return <LoginScreen />;
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
