import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { auctionFlagCategories } from "@used-books/session-client";
import { AuctionFlag } from "./AuctionFlag";

const owner = "22222222-2222-4222-8222-222222222222",
  auction = { id: "11111111-1111-4111-8111-111111111111", title: "Truyện Kiều 1925" },
  caseId = "33333333-3333-4333-8333-333333333333";
function render(state?: "Open" | "Closed") {
  const cache = new QueryClient();
  if (state)
    cache.setQueryData(["support", owner, "auction-flag", auction.id], {
      items: [{
        id: caseId, kind: "TransactionIssue", title: "t", reporterId: owner, reporterName: "A",
        target: { type: "Auction", id: auction.id }, assigneeId: null, state, version: 1,
        createdAt: "2026-11-08T00:00:00.000Z", updatedAt: "2026-11-08T00:00:00.000Z",
      }],
      nextCursor: null,
      serverTime: "2026-11-08T00:00:00.000Z",
    });
  return renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={cache}>
        <AuctionFlag auction={auction} ownerId={owner} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ADR 0078 AuctionFlag", () => {
  it("offers the flag with every category and the no-side-effect note", () => {
    const html = render("Closed");
    expect(html).toContain("Báo cáo sự cố cho Admin");
    expect(html).toContain('aria-haspopup="dialog"');
    for (const c of auctionFlagCategories) expect(html).toContain(c.label);
    expect(html).toContain("không tự dừng phiên hay hoàn tiền");
    expect(html).toContain("Gửi cho Admin");
  });
  it("links the open case instead of a second flag", () => {
    const html = render("Open");
    expect(html).toContain("Bạn đã báo cáo phiên này");
    expect(html).toContain(`href="/support/${caseId}"`);
    expect(html).not.toContain("Báo cáo sự cố cho Admin");
  });
});
