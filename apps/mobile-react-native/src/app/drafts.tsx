import { Redirect } from "expo-router";
import { useSession } from "../core/session/session-provider";
import { Screen, StatePanel } from "../core/ui";
import { DraftsScreen } from "../features/drafts/drafts-screen";
export default function DraftsRoute() {
  const { state } = useSession();
  if (state.status === "anonymous") return <Redirect href="./account" />;
  if (state.status !== "authenticated")
    return (
      <Screen>
        <StatePanel loading title="Đang khôi phục phiên" />
      </Screen>
    );
  if (!state.user.roles.includes("MEMBER")) return <Redirect href="./account" />;
  return <DraftsScreen />;
}
