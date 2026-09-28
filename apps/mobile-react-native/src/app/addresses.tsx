import { Redirect } from "expo-router";
import { useSession } from "../core/session/session-provider";
import { Screen, StatePanel } from "../core/ui";
import { AddressesScreen } from "../features/addresses/addresses-screen";
export default function AddressesRoute() {
  const { state } = useSession();
  if (state.status === "anonymous") return <Redirect href="./account" />;
  if (state.status !== "authenticated")
    return (
      <Screen>
        <StatePanel loading title="Đang khôi phục phiên" />
      </Screen>
    );
  if (!state.user.roles.includes("MEMBER"))
    return <Redirect href="./account" />;
  return <AddressesScreen />;
}
