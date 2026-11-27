import { Redirect, useLocalSearchParams } from "expo-router";
import { useSession } from "../core/session/session-provider";
import { Screen, StatePanel, stitchTokens } from "../core/ui";
import { MyAuctionsScreen, type MyAuctionTab } from "../features/auctions/my-auctions-screen";

const VALID_VIEWS: readonly MyAuctionTab[] = [
  "all",
  "active",
  "upcoming",
  "payment",
  "selling",
  "intakes",
];

export default function MyAuctionsRoute() {
  const { client, state } = useSession();
  const params = useLocalSearchParams<{ view?: string }>();
  const initialView: MyAuctionTab =
    typeof params.view === "string" && (VALID_VIEWS as readonly string[]).includes(params.view)
      ? (params.view as MyAuctionTab)
      : "all";

  if (state.status === "anonymous") return <Redirect href="./account" />;
  if (state.status !== "authenticated")
    return (
      <Screen canvasColor={stitchTokens.creamBg}>
        <StatePanel
          wine
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
  return (
    <MyAuctionsScreen
      key={`${state.user.id}:${initialView}`}
      userId={state.user.id}
      initialView={initialView}
    />
  );
}
