import { it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShippingTrackingCard } from "./index";
import { saveExchangeShipment } from "../../../services/exchangeShipment";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
afterEach(() => vi.unstubAllGlobals());
it("local-only shipment never replaces a server confirmation", () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
  const detail: ExchangeDetail = {
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
  expect(
    renderToStaticMarkup(<ShippingTrackingCard detail={detail} />),
  ).toContain("Chờ bạn tạo đơn");
  saveExchangeShipment(detail.id, "initiator", {
    method: "carrier",
    carrierCode: "OTHER",
    trackingCode: "AUDIT-NOT-SERVER-CONFIRMED",
  });
  const html = renderToStaticMarkup(<ShippingTrackingCard detail={detail} />);
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
  expect(confirmed).toContain("Đã tạo đơn · Chờ bưu tá lấy");
  expect(confirmed).toContain("SERVER-CONFIRMED");
});
