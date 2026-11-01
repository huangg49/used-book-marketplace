import { Redirect } from "expo-router";
import { useSession } from "../core/session/session-provider";
import { Screen, StatePanel } from "../core/ui";
import { CartScreen } from "../features/cart/cart-screen";
export default function CartRoute() {
  const { state } = useSession();
  if (state.status === "loading")
    return (
      <Screen>
        <StatePanel loading title="Đang khôi phục phiên…" />
      </Screen>
    );
  if (state.status !== "authenticated") return <Redirect href="/account" />;
  return <CartScreen key={state.user.id} owner={state.user.id} />;
}
