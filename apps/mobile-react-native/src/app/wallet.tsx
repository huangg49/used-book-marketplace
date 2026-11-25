import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useSession } from "../core/session/session-provider";
import { BackAction, Screen, StatePanel } from "../core/ui";
import { WalletScreen } from "../features/wallet/wallet-screen";

export default function WalletRoute() {
  const { client, state } = useSession();
  const { sale, section } = useLocalSearchParams<{ sale?: string; section?: string }>();
  const saleOrderId = typeof sale === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sale) ? sale.toLowerCase() : undefined;
  const showHistory = section === "history";
  if (state.status === "anonymous")
    return <Redirect href="./account" />;
  if (state.status !== "authenticated")
    return (
      <Screen>
        <BackAction
          title="Về tài khoản"
          onPress={() => router.replace("./account")}
        />
        <StatePanel
          loading={state.status === "loading"}
          title={
            state.status === "loading"
              ? "Đang khôi phục phiên"
              : "Chưa kết nối được"
          }
          message={state.status === "unavailable" ? state.message : undefined}
          action={
            state.status === "unavailable"
              ? {
                  label: "Thử kết nối lại",
                  onPress: () => void client.restore(),
                }
              : undefined
          }
        />
      </Screen>
    );
  if (!state.user.roles.includes("MEMBER"))
    return <Redirect href="./account" />;
  return <WalletScreen key={`${state.user.id}:${saleOrderId ?? ""}:${showHistory}`} ownerId={state.user.id} saleOrderId={saleOrderId} showHistory={showHistory} />;
}
