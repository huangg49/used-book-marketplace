import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NegotiationWorkspace } from "../../pages/NegotiationWorkspace";
import type { PurchaseConversation } from "../../services/purchase-conversations";
import type { PublicListing } from "../../services/public-listings";
import { purchaseChatGuidance } from "../../lib/purchase-chat-guidance";
import type { ExchangeDetail } from "../../lib/mock/exchangeDetail";
import {
  ExchangeFinanceFacts,
  ExchangeFinanceSummary,
} from "./ExchangeFinanceSummary";

const detail: ExchangeDetail = {
  id: "proposal",
  transactionCode: "PROPOSAL",
  createdAt: "2026-11-02T00:00:00Z",
  status: "PENDING",
  rawStatus: "Proposed",
  viewerRole: "proposer",
  viewer: { id: "a", username: "A" },
  partner: { id: "b", username: "B" },
  giveBooks: [{ id: "one", title: "Sách giao", author: "QA", price: 100000 }],
  receiveBooks: [
    { id: "two", title: "Sách nhận", author: "QA", price: 150000 },
  ],
  hasAgreementSnapshot: true,
  moneyCompensationType: "user_pays",
  moneyAmount: 50000,
  viewerDeposit: 150000,
  partnerDeposit: 100000,
  viewerFundingAmount: 200000,
  viewerShipping: {},
  partnerShipping: {},
  hasViewerReviewed: false,
};
const render = (changes: Partial<ExchangeDetail> = {}, uncertain = false) =>
  renderToStaticMarkup(
    <ExchangeFinanceFacts
      detail={{ ...detail, ...changes }}
      uncertain={uncertain}
      now={Date.parse("2026-11-02T00:00:00Z")}
    />,
  );
const row = (html: string, label: string) =>
  html.match(
    new RegExp(
      `<dt>${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</dt><dd>(.*?)</dd>`,
    ),
  )?.[1];

describe("exchange financial meaning", () => {
  it("separates book values, both deposits and own funding before acceptance", () => {
    const html = render();
    expect(row(html, "Cọc bảo chứng của bạn")).toContain("150.000");
    expect(row(html, "Cọc bảo chứng của đối tác")).toContain("100.000");
    expect(row(html, "Tiền bù")).toMatch(/Bạn bù .*50\.000/);
    expect(row(html, "Dự kiến nộp khi chấp nhận")).toContain("200.000");
    expect(html).toContain("Đề nghị chưa giữ sách hoặc tiền");
    expect(html).not.toContain("Tổng thanh toán");
  });
  it("uses server funding instead of deriving a new amount from book values", () => {
    const html = render({ viewerFundingAmount: 210000 });
    expect(row(html, "Dự kiến nộp khi chấp nhận")).toContain("210.000");
  });
  it("shows the receiving-money participant own deposit without subtracting the future compensation", () => {
    const html = render({
      viewerRole: "recipient",
      giveBooks: detail.receiveBooks,
      receiveBooks: detail.giveBooks,
      moneyCompensationType: "other_pays",
      viewerDeposit: 100000,
      partnerDeposit: 150000,
      viewerFundingAmount: 100000,
    });
    expect(row(html, "Tiền bù")).toMatch(/Đối tác bù .*50\.000/);
    expect(row(html, "Dự kiến nộp khi chấp nhận")).toContain("100.000");
    expect(row(html, "Cọc bảo chứng của bạn")).toContain("100.000");
  });
  it("makes equal value explicit without hiding either deposit", () => {
    const html = render({
      moneyCompensationType: "none",
      moneyAmount: undefined,
      viewerDeposit: 100000,
      viewerFundingAmount: 100000,
    });
    expect(row(html, "Tiền bù")).toBe("Ngang giá — không bù");
    expect(row(html, "Cọc bảo chứng của bạn")).toContain("100.000");
  });
  it("sums multiple frozen books and does not substitute zero for an incomplete snapshot", () => {
    expect(
      row(
        render({
          giveBooks: [
            ...detail.giveBooks,
            { id: "three", title: "Sách nữa", author: "QA", price: 75000 },
          ],
        }),
        "Sách bạn giao (2 cuốn)",
      ),
    ).toContain("175.000");
    expect(
      row(
        render({
          giveBooks: [
            ...detail.giveBooks,
            { id: "three", title: "Thiếu giá", author: "QA" },
          ],
        }),
        "Sách bạn giao (2 cuốn)",
      ),
    ).toBe("Chưa có dữ liệu");
  });
  it("does not reconstruct legacy book values from deposits", () => {
    const html = render({ hasAgreementSnapshot: false });
    expect(row(html, "Sách bạn giao (1 cuốn)")).toBe("Thiếu bản chụp");
    expect(row(html, "Cọc bảo chứng của bạn")).toContain("150.000");
  });
  it("does not prompt funding after its ACK or while a command is uncertain", () => {
    const funded = render({
      rawStatus: "AcceptedAwaitingFunding",
      viewerFundedAt: detail.createdAt,
    });
    expect(funded).toContain("Đã ghi nhận khoản nộp của bạn");
    expect(funded).not.toContain("Khoản cần nộp từ ví mô phỏng");
    const uncertain = render({ rawStatus: "AcceptedAwaitingFunding" }, true);
    expect(uncertain).toContain("Kết quả thao tác trước chưa rõ");
    expect(uncertain).not.toContain("Khoản cần nộp từ ví mô phỏng");
  });
  it("does not prompt a payment on a failed read or an expired funding deadline", () => {
    const pending = { ...detail, rawStatus: "AcceptedAwaitingFunding" };
    const failed = renderToStaticMarkup(
      <ExchangeFinanceFacts detail={pending} readFailed />,
    );
    expect(failed).toContain("Dữ liệu chưa cập nhật");
    expect(failed).not.toContain("Khoản cần nộp từ ví mô phỏng");
    const expired = render({
      rawStatus: "AcceptedAwaitingFunding",
      fundingDeadline: "2000-01-01T00:00:00Z",
    });
    expect(expired).toContain("Đã hết hạn nộp");
    expect(expired).not.toContain("Khoản cần nộp từ ví mô phỏng");
  });
  it.each(["Cancelled", "Completed", "ResolutionPending", "Preparing"])(
    "does not claim money released or ask to pay in %s",
    (rawStatus) => {
      const html = render({ rawStatus });
      expect(html).not.toContain("Khoản cần nộp từ ví mô phỏng");
      expect(html).toContain("không tự chứng minh đã hoàn cọc hoặc chuyển bù");
    },
  );
  it("shows an honest empty/reference state with the next section reachable", () => {
    const html = renderToStaticMarkup(
      <ExchangeFinanceSummary
        userId="a"
        sheetId="exchange-sheet"
        referenceValue={150000}
      />,
    );
    expect(html).toContain("150.000");
    expect(html).toContain("Chưa có thỏa thuận");
    expect(html).toContain('href="#exchange-sheet"');
    expect(html).not.toContain("Tiền sách");
    expect(html).not.toContain("Tổng thanh toán");
  });
  it("does not turn a missing reference into a free exchange", () => {
    const html = renderToStaticMarkup(
      <ExchangeFinanceSummary userId="a" sheetId="exchange-sheet" />,
    );
    expect(html).toContain("Chưa có dữ liệu");
    expect(html).not.toContain("0 ₫");
  });
});

describe("conversation mode isolation", () => {
  const room: PurchaseConversation = {
    id: "room",
    listingId: "listing",
    buyer: { id: "a", displayName: "A" },
    seller: { id: "b", displayName: "B" },
    status: "Active",
    version: 4,
    expiresAt: null,
    orderId: null,
    closedAt: null,
    createdAt: detail.createdAt,
    hasQuote: true,
    quotePreview: {
      destination: {
        recipientName: "QA",
        phone: "0900000000",
        detail: "Nơi nhận QA",
        localityCode: "DEMO-A",
        serviceAreaCode: "HCM-DEMO-v1",
      },
      shippingFee: 22000,
      expiresAt: "2099-01-01T00:00:00Z",
    },
    terms: {
      mode: "Exchange",
      agreedPrice: 90000,
      agreedListingRevisionId: "revision",
      pendingProposal: null,
      activeExchangeId: null,
      exchangeIds: [],
      locked: false,
    },
  };
  const book: PublicListing = {
    id: "listing",
    version: 1,
    revisionId: "revision",
    mode: "Both",
    salePrice: 125000,
    exchangeValue: 150000,
    book: {
      id: "book",
      title: "Sách QA",
      authors: ["Tác giả QA"],
      publisher: null,
      publicationYear: null,
      language: "vi",
      edition: null,
      category: "Khác",
      isbn: null,
    },
    condition: "Good",
    pages: "Đủ trang",
    coverNote: "",
    notes: "",
    accessories: "",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    description: "",
    seller: room.seller,
    photos: [],
    publishedAt: detail.createdAt,
    fulfillment: null,
    purchaseAvailability: { status: "Available", expiresAt: null },
  };
  function workspace(userId: string, mode: "Exchange" | "Negotiation") {
    const state = { ...room, terms: { ...room.terms!, mode } };
    const cache = new QueryClient();
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <QueryClientProvider client={cache}>
          <NegotiationWorkspace
            room={state}
            book={book}
            userId={userId}
            refresh={() => {}}
            historyExchange={null}
            setHistoryExchange={() => {}}
            guidance={purchaseChatGuidance(state, userId, true)}
            onOpenOrderDialog={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    cache.clear();
    return html;
  }
  it.each(["a", "b"])(
    "hides purchase totals, quote address and agreed sale claims in Exchange for %s",
    (user) => {
      const html = workspace(user, "Exchange");
      expect(html).toContain("150.000");
      expect(html).not.toContain("Tổng thanh toán");
      expect(html).not.toContain("<dt>Tiền sách</dt>");
      expect(html).not.toContain("Nơi nhận QA");
      expect(html).not.toContain("Đã chốt giá");
      expect(html).not.toContain("90.000");
      expect(html).not.toContain("22.000");
    },
  );
  it.each(["a", "b"])(
    "preserves the agreed purchase total and quote in Negotiation for %s",
    (user) => {
      const html = workspace(user, "Negotiation");
      expect(html).toContain("<dt>Tiền sách</dt>");
      expect(html).toContain("90.000");
      expect(html).toContain("112.000");
      expect(html).toContain("22.000");
      expect(html).toContain("Nơi nhận QA");
      expect(html).toContain("Đã chốt giá");
      expect(html).not.toContain("Tóm tắt tài chính đổi sách");
    },
  );
});
