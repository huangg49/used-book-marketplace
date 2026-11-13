import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ActionCard } from "./index";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
const base: ExchangeDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  transactionCode: "QA",
  createdAt: "2026-11-02T00:00:00Z",
  status: "INSPECTING",
  rawStatus: "Delivered",
  viewerRole: "proposer",
  viewer: { id: "22222222-2222-4222-8222-222222222222", username: "A" },
  partner: { id: "33333333-3333-4333-8333-333333333333", username: "B" },
  giveBooks: [],
  receiveBooks: [],
  moneyCompensationType: "none",
  viewerShipping: { receivedAt: "2026-11-01T00:00:00Z" },
  partnerShipping: { receivedAt: "2026-11-02T00:00:00Z" },
  hasViewerReviewed: false,
  viewerInspectionDeadline: "2099-01-01T00:00:00Z",
  partnerInspectionDeadline: "2099-01-02T00:00:00Z",
  inspectionDeadline: "2099-01-02T00:00:00Z",
};
function render(changes: Partial<ExchangeDetail>, handover = false) {
  const cache = new QueryClient();
  const noop = async () => {};
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={cache}>
        <ActionCard
          detail={{ ...base, ...changes }}
          compact={handover}
          standaloneSheet={handover}
          handover={handover ? { navigationKey: "qa" } : undefined}
          onCancel={noop}
          onAccept={noop}
          onReject={noop}
          onFund={noop}
          onConfirmSent={noop}
          onConfirmReceived={noop}
          onRetry={noop}
          onComplete={noop}
          onDispute={noop}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  cache.clear();
  return html;
}
describe("merged Exchange inspection semantics", () => {
  it.each([
    {},
    { partnerCompletedAt: "2026-11-02T00:00:00Z" },
    { viewerCompletedAt: "2026-11-02T00:00:00Z" },
  ])(
    "preserves both 72-hour windows without promising early release (%j)",
    (changes) => {
      const html = render(changes);
      expect(html).toContain("72 giờ");
      expect(html).toContain("Hạn kiểm tra sách của bạn");
      expect(html).toContain("Hạn kiểm tra của đối tác");
      expect(html).not.toContain("tất toán sớm");
      expect(html).not.toContain("giải phóng cọc ngay");
      expect(html).not.toContain("48h");
    },
  );
  it("uses the recorded own funding amount including compensation", () => {
    const html = render({
      status: "FUNDING",
      rawStatus: "AcceptedAwaitingFunding",
      viewerFundingAmount: 200000,
    });
    expect(html).toContain("200.000");
    expect(html).toContain("Đặt cọc mô phỏng");
  });
  it("closes only the viewer's claim when their deadline passes", () => {
    const html = render({ viewerInspectionDeadline: "2020-01-01T00:00:00Z" });
    expect(html).toContain("Đã hết hạn kiểm tra của bạn.");
    expect(html).toContain("Xác nhận đã kiểm tra");
    expect(html).not.toContain(">Báo sự cố</button>");
    expect(render({ viewerCompletedAt: base.createdAt })).toContain(">Báo sự cố</button>");
  });
});

describe("Exchange handover actions", () => {
  it("puts sending and receiving in their respective directions", () => {
    const preparing = render({
      status: "WAITING_YOU_SEND", viewerShipping: {}, partnerShipping: {},
      shippingDeadline: "2099-01-01T00:00:00Z",
    }, true);
    const incomingStart = preparing.indexOf('id="nhan-sach"');
    expect(preparing.slice(0, incomingStart)).toContain("Tạo đơn gửi sách");
    expect(preparing).not.toContain("Xác nhận đã nhận sách");
    const inTransit = render({
      status: "WAITING_YOU_CONFIRM",
      viewerShipping: { sentAt: base.createdAt }, partnerShipping: { sentAt: base.createdAt },
    }, true);
    expect(inTransit.slice(inTransit.indexOf('id="nhan-sach"'))).toContain("Xác nhận đã nhận sách");
    expect(inTransit).not.toContain("Tạo đơn gửi sách");
  });

  it("never offers to send after the deadline even with an open cancellation request", () => {
    const html = render({
      status: "WAITING_YOU_SEND", viewerShipping: {}, partnerShipping: {},
      shippingDeadline: "2020-01-01T00:00:00Z", cancellationRequestedBy: "Recipient",
    }, true);
    expect(html).toContain("Đã hết hạn gửi");
    expect(html).not.toContain("Tạo đơn gửi sách");
  });
});
