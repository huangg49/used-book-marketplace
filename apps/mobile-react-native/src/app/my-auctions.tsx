import { Redirect } from "expo-router";
import { useSession } from "../core/session/session-provider";
import { Screen, StatePanel } from "../core/ui";
import { MyAuctionsScreen } from "../features/auctions/my-auctions-screen";

export default function MyAuctionsRoute() {
  const { client, state } = useSession();
  if (state.status === "anonymous") return <Redirect href="./account" />;
  if (state.status !== "authenticated")
    return (
      <Screen>
        <StatePanel
          loading={state.status === "loading"}
          title={state.status === "loading" ? "Đang khôi phục phiên" : "Chưa kết nối được"}
          message={state.status === "unavailable" ? state.message : undefined}
          action={
            state.status === "unavailable"
              ? { label: "Thử kết nối lại", onPress: () => void client.restore() }
              : undefined
          }
        />
      </Screen>
    );
  if (!state.user.roles.includes("MEMBER")) return <Redirect href="./account" />;
  return <MyAuctionsScreen key={state.user.id} userId={state.user.id} />;
}
