import { Redirect, useLocalSearchParams } from "expo-router";
import { useSession } from "../core/session/session-provider";
import { Screen, StatePanel } from "../core/ui";
import { OrdersScreen } from "../features/orders/orders-screen";
import { OrderFocusScreen } from "../features/orders/order-focus-screen";

export default function OrdersRoute() {
  const { state } = useSession();
  const params = useLocalSearchParams<{ orderId?: string }>();
  if (state.status === "anonymous") return <Redirect href="./account" />;
  if (state.status !== "authenticated")
    return (
      <Screen>
        <StatePanel loading title="Đang khôi phục phiên" />
      </Screen>
    );
  if (!state.user.roles.includes("MEMBER"))
    return <Redirect href="./account" />;
  return params.orderId && typeof params.orderId === "string" ? (
    <OrderFocusScreen
      key={`${state.user.id}:${params.orderId}`}
      id={params.orderId}
      ownerId={state.user.id}
    />
  ) : (
    <OrdersScreen key={state.user.id} />
  );
}
