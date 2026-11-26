import { useLocalSearchParams } from "expo-router";
import { AuctionDriverScreen } from "./auction-driver-screen";
import { DirectOrderDriverScreen } from "./direct-order-driver-screen";
import { driverMode, parseLeg, type DriverParams } from "./driver-model";
import { ExchangeDriverScreen } from "./exchange-driver-screen";

// One /driver route for the three demo simulators, matching user-web DriverPage.
export function DriverScreen() {
  const params = useLocalSearchParams<DriverParams & Record<string, string>>();
  const mode = driverMode(params);
  const trackingCode = params.trackingCode?.trim().toUpperCase() || undefined;
  if (mode === "direct" && trackingCode) {
    return <DirectOrderDriverScreen trackingCode={trackingCode} />;
  }
  if (mode === "auction" && trackingCode) {
    return <AuctionDriverScreen trackingCode={trackingCode} />;
  }
  return (
    <ExchangeDriverScreen
      exchangeId={params.exchangeId || undefined}
      leg={parseLeg(params.leg)}
      trackingCode={mode === "exchange" ? trackingCode : undefined}
    />
  );
}
