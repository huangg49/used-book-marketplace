import { WishlistScreen } from "../features/wishlist";
import { Redirect } from "expo-router";
import { useSession } from "../core/session/session-provider";
import { Screen, StatePanel } from "../core/ui";

export default function WishlistRoute() {
  const { state } = useSession();

  if (state.status === "loading") {
    return (
      <Screen>
        <StatePanel loading title="Đang khôi phục phiên…" />
      </Screen>
    );
  }

  if (state.status !== "authenticated") {
    return <Redirect href="/account" />;
  }

  return <WishlistScreen />;
}
