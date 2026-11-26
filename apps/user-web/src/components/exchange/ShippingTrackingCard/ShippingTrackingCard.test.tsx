import { it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ShippingTrackingCard } from "./index";
import { saveExchangeShipment } from "../../../services/exchangeShipment";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
afterEach(() => vi.unstubAllGlobals());

function exchangeDetail(): ExchangeDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-11-03T00:00:00Z",
    transactionCode: "AUDIT",
    status: "WAITING_YOU_SEND",
    rawStatus: "Preparing",
    viewerRole: "proposer",
    viewer: { id: "22222222-2222-4222-8222-222222222222", username: "QA" },
    partner: {
      id: "33333333-3333-4333-8333-333333333333",
      username: "QA partner",
    },
    viewerShipping: {},
    partnerShipping: {},
    giveBooks: [],
    receiveBooks: [],
    moneyCompensationType: "none",
    hasViewerReviewed: false,
  };
}

it("local-only shipment never replaces a server confirmation", () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
  const detail = exchangeDetail();
  expect(
    renderToStaticMarkup(<ShippingTrackingCard detail={detail} canSend />),
  ).toContain("Chờ bạn tạo đơn");
  saveExchangeShipment(detail.id, "initiator", {
    method: "carrier",
    carrierCode: "OTHER",
    trackingCode: "AUDIT-NOT-SERVER-CONFIRMED",
  });
  const html = renderToStaticMarkup(<ShippingTrackingCard detail={detail} canSend />);
  expect(html).toContain("Chờ bạn tạo đơn");
  expect(html).not.toContain("AUDIT-NOT-SERVER-CONFIRMED");
  expect(detail.viewerShipping.sentAt).toBeUndefined();
  detail.viewerShipping.sentAt = "2026-11-03T00:00:00Z";
  detail.viewerShipment = {
    method: "carrier",
    trackingCode: "SERVER-CONFIRMED",
    carrierCode: "OTHER",
  };
  const confirmed = renderToStaticMarkup(
    <ShippingTrackingCard detail={detail} />,
  );
  expect(confirmed).toContain("Đã ghi nhận vận đơn");
  expect(confirmed).toContain("SERVER-CONFIRMED");
});

it.each([
  ["proposer", "initiator", "recipient"],
  ["recipient", "recipient", "initiator"],
] as const)("opens the exact registered leg as %s", (viewerRole, sentLeg, receivedLeg) => {
  vi.stubGlobal("window", { location: { hostname: "localhost" } });
  const detail = exchangeDetail();
  detail.viewerRole = viewerRole;
  detail.viewerShipment = { method: "carrier", trackingCode: "OUT-DEMO", carrierCode: "SIMULATOR" };
  detail.partnerShipment = { method: "carrier", trackingCode: "IN-DEMO", carrierCode: "GHN" };

  const html = renderToStaticMarkup(<MemoryRouter><ShippingTrackingCard detail={detail} /></MemoryRouter>);

  expect(html).toContain(`kind=exchange&amp;exchangeId=${detail.id}&amp;leg=${sentLeg}&amp;trackingCode=OUT-DEMO`);
  expect(html).toContain(`kind=exchange&amp;exchangeId=${detail.id}&amp;leg=${receivedLeg}&amp;trackingCode=IN-DEMO`);
});

it("offers the simulator only for the registered carrier leg on loopback", () => {
  const detail = exchangeDetail();
  detail.viewerShipment = { method: "carrier", trackingCode: "OUT-DEMO", carrierCode: "SIMULATOR" };
  detail.partnerShipment = { method: "direct", meetupLocation: "Điểm hẹn" };
  const render = () => renderToStaticMarkup(
    <MemoryRouter><ShippingTrackingCard detail={detail} /></MemoryRouter>,
  );

  vi.stubGlobal("window", { location: { hostname: "127.0.0.1" } });
  expect(render()).toContain('aria-label="Mở Driver Simulator · Demo cho kiện bạn gửi"');
  expect(render()).not.toContain('aria-label="Mở Driver Simulator · Demo cho kiện bạn nhận"');

  vi.stubGlobal("window", { location: { hostname: "192.168.1.8" } });
  expect(render()).not.toContain("Mở Driver Simulator");

  vi.stubEnv("VITE_DEMO_SIMULATOR_ENABLED", "true");
  expect(render()).toContain('aria-label="Mở Driver Simulator · Demo cho kiện bạn gửi"');
  expect(render()).not.toContain('aria-label="Mở Driver Simulator · Demo cho kiện bạn nhận"');
  vi.unstubAllEnvs();
});
