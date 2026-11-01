import { Redirect } from "expo-router";
import { useSession } from "../core/session/session-provider";
import { Screen, StatePanel } from "../core/ui";
import { ProfileScreen } from "../features/account/profile-screen";
export default function ProfileRoute() {
  const { state } = useSession();
  if (state.status === "loading")
    return (
      <Screen>
        <StatePanel loading title="Đang khôi phục phiên…" />
      </Screen>
    );
  if (state.status !== "authenticated") return <Redirect href="/account" />;
  return <ProfileScreen key={state.user.id} ownerId={state.user.id} />;
}
