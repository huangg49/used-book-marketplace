import { router } from "expo-router";
import { useSession } from "../core/session/session-provider";
import { BackAction, Screen, StatePanel } from "../core/ui";
import { DraftsScreen } from "../features/drafts/drafts-screen";
import { LoginScreen } from "../features/auth/login-screen";

export default function DraftsRoute() {
  const { state } = useSession();

  if (state.status === "authenticated" && state.user.roles.includes("MEMBER")) {
    return <DraftsScreen />;
  }

  if (state.status === "loading") {
    return (
      <Screen>
        <BackAction title="Quay lại" onPress={() => router.back()} />
        <StatePanel loading title="Đang tải…" />
      </Screen>
    );
  }

  // Nếu chưa đăng nhập, hiển thị màn hình Đăng Nhập
  return <LoginScreen />;
}
