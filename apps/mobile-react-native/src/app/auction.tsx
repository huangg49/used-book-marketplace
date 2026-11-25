import { useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import { Screen, StatePanel, stitchTokens } from "../core/ui";
import { AuctionScreen } from "../features/auctions/auction-screen";
const subscribe = () => () => {};
const clientSnapshot = () => false;
const serverSnapshot = () => true;
export default function AuctionRoute() {
  const { id, bid } = useLocalSearchParams<{ id?: string; bid?: string }>();
  // Static HTML has no query string. Hydrate a consistent shell before reading the URL.
  const hydrating = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  if (hydrating)
    return (
      <Screen canvasColor={stitchTokens.creamBg}>
        <StatePanel wine loading title="Đang mở phiên đấu giá" />
      </Screen>
    );
  return <AuctionScreen key={id} id={typeof id === "string" ? id : ""} openBidInitially={bid === "1"} />;
}
